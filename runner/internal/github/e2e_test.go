package github

import (
	"bytes"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync"
	"testing"

	"cppatlas.com/runner/internal/protocol"
)

type syncBuf struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (s *syncBuf) Write(p []byte) (int, error) { s.mu.Lock(); defer s.mu.Unlock(); return s.b.Write(p) }
func (s *syncBuf) String() string              { s.mu.Lock(); defer s.mu.Unlock(); return s.b.String() }

func TestWebhookEndToEnd(t *testing.T) {
	logs := &syncBuf{}
	env := newEnv(t, func(c *Config) {
		c.Logger = slog.New(slog.NewJSONHandler(logs, &slog.HandlerOptions{Level: slog.LevelDebug}))
	})
	env.gh.files[".cppatlas.json"] = `{"challenge": "vector", "stage": 3}`
	env.gh.files["include/my/vector.hpp"] = "#pragma once\nnamespace my { template <class T> class vector {}; }\n"
	env.runner.final = failAt(3, protocol.StageResult{Status: protocol.StageFailed, Counts: &protocol.TestCounts{Total: 4, Passed: 3, Failed: 1},
		Tests: []protocol.TestCase{{Name: "growth is geometric", Status: protocol.StageFailed, Messages: []string{"CHECK( reallocs <= 20 ) is NOT correct!"}}}})

	api := httptest.NewServer(http.NewServeMux())
	defer api.Close()
	api.Config.Handler.(*http.ServeMux).Handle("POST /github/webhook", env.app.WebhookHandler())

	body := pushBody(pushOpts{ref: "refs/heads/main"})
	req, _ := http.NewRequest(http.MethodPost, api.URL+"/github/webhook", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "GitHub-Hookshot/abc")
	req.Header.Set("X-GitHub-Event", "push")
	req.Header.Set("X-GitHub-Delivery", "72d3162e-cc78-11e3-81ab-4c9367dc0958")
	req.Header.Set("X-GitHub-Hook-ID", "1")
	req.Header.Set("X-Hub-Signature", "sha1=ignored")
	req.Header.Set("X-Hub-Signature-256", sign(testSecret, body))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusAccepted {
		t.Fatalf("webhook status %d", resp.StatusCode)
	}
	env.idle(t)

	calls := env.gh.Calls()
	var seq []string
	for _, c := range calls {
		s := c.Method + " " + c.Path
		if c.Query != "" {
			s += "?" + c.Query
		}
		seq = append(seq, s)
	}
	want := []string{
		"POST /app/installations/777/access_tokens",
		"GET /repos/learner/my-vector/contents/.cppatlas.json?ref=" + testSHA,
		"POST /repos/learner/my-vector/check-runs",
		"GET /repos/learner/my-vector/contents/include/my/vector.hpp?ref=" + testSHA,
		"PATCH /repos/learner/my-vector/check-runs/101",
		"PATCH /repos/learner/my-vector/check-runs/101",
	}
	if !reflect.DeepEqual(seq, want) {
		t.Fatalf("GitHub calls:\n%s\nwant:\n%s", strings.Join(seq, "\n"), strings.Join(want, "\n"))
	}
	for i, c := range calls {
		auth := c.Header.Get("Authorization")
		if i == 0 {
			if strings.Contains(auth, "ghs_") || strings.Count(auth, ".") != 2 {
				t.Fatalf("token request auth %q", auth)
			}
		} else if auth != "Bearer ghs_TESTTOKEN" {
			t.Fatalf("call %d auth %q", i, auth)
		}
		if c.Header.Get("X-Github-Api-Version") != "2022-11-28" || c.Header.Get("User-Agent") != "cppatlas-runner" {
			t.Fatalf("call %d headers %v", i, c.Header)
		}
	}

	create := calls[2].json(t)
	for k, v := range map[string]any{
		"name": "cppatlas / vector", "head_sha": testSHA, "status": "queued",
		"details_url": "https://cppatlas.com/build/vector/empty-vector", "started_at": "2026-11-25T12:00:00Z",
	} {
		if create[k] != v {
			t.Errorf("create %s = %v, want %v", k, create[k], v)
		}
	}
	prog := calls[4].json(t)
	if prog["status"] != "in_progress" || prog["external_id"] != "run-1" {
		t.Errorf("in_progress body %v", prog)
	}
	done := calls[5].json(t)
	if done["status"] != "completed" || done["conclusion"] != "failure" || done["completed_at"] != "2026-11-25T12:00:00Z" ||
		done["details_url"] != "https://cppatlas.com/build/vector/growth" {
		t.Errorf("completed body %v", done)
	}
	title, sum, text := output(t, done)
	if title != "Stage 3 of 8 failed: growth" {
		t.Errorf("title %q", title)
	}
	if !strings.Contains(sum, "| 3 | [growth](https://cppatlas.com/build/vector/growth) | **failed** | 3/4 |") || strings.Contains(sum, "| 4 |") {
		t.Errorf("summary:\n%s", sum)
	}
	if !strings.Contains(text, "### Test case `growth is geometric`\n\n```text\nCHECK( reallocs <= 20 ) is NOT correct!\n```") {
		t.Errorf("text:\n%s", text)
	}

	subs := env.runner.submissions()
	if len(subs) != 1 || !reflect.DeepEqual(subs[0].Stages, []int{1, 2, 3}) || !subs[0].StopOnFail ||
		subs[0].Files["include/my/vector.hpp"] != env.gh.files["include/my/vector.hpp"] || len(subs[0].Files) != 1 {
		t.Fatalf("submission %+v", subs)
	}
	if l := logs.String(); strings.Contains(l, "ghs_TESTTOKEN") || strings.Contains(l, "eyJ") {
		t.Fatal("credentials in logs")
	}
	if !strings.Contains(logs.String(), "check run completed") {
		t.Fatalf("logs: %s", logs.String())
	}
}
