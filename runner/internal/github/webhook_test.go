package github

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestVerifySignature(t *testing.T) {
	body := []byte(`{"zen":"Keep it logically awesome."}`)
	good := sign(testSecret, body)
	cases := []struct {
		name   string
		values []string
		body   []byte
		secret string
		want   bool
	}{
		{"valid", []string{good}, body, testSecret, true},
		{"uppercase hex is the same MAC", []string{"sha256=" + strings.ToUpper(strings.TrimPrefix(good, "sha256="))}, body, testSecret, true},
		{"wrong secret", []string{sign("other", body)}, body, testSecret, false},
		{"tampered body", []string{good}, append([]byte(nil), append(body, ' ')...), testSecret, false},
		{"missing header", nil, body, testSecret, false},
		{"empty header", []string{""}, body, testSecret, false},
		{"sha1 prefix", []string{"sha1=" + strings.TrimPrefix(good, "sha256=")}, body, testSecret, false},
		{"no prefix", []string{strings.TrimPrefix(good, "sha256=")}, body, testSecret, false},
		{"short hex", []string{good[:len(good)-2]}, body, testSecret, false},
		{"long hex", []string{good + "00"}, body, testSecret, false},
		{"non-hex", []string{"sha256=" + strings.Repeat("zz", 32)}, body, testSecret, false},
		{"two headers", []string{good, good}, body, testSecret, false},
		{"empty secret never verifies", []string{sign("", body)}, body, "", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := verifySignature([]byte(c.secret), c.values, c.body); got != c.want {
				t.Fatalf("verifySignature = %v, want %v", got, c.want)
			}
		})
	}
}

func TestWebhookHTTP(t *testing.T) {
	env := newEnv(t, func(c *Config) { c.MaxBodyBytes = 64 << 10 })
	h := env.app.WebhookHandler()
	ping := []byte(`{"zen":"hi","hook_id":1}`)
	big := bytes.Repeat([]byte("a"), 64<<10+1)
	cases := []struct {
		name  string
		req   func() *http.Request
		code  int
		check func(t *testing.T, body string)
	}{
		{"GET is 405", func() *http.Request { return httptest.NewRequest(http.MethodGet, "/github/webhook", nil) }, 405, nil},
		{"ping", func() *http.Request { return webhookReq("ping", "d-ping", ping, sign(testSecret, ping)) }, 200, nil},
		{"ping with bad signature", func() *http.Request { return webhookReq("ping", "d-ping2", ping, sign("x", ping)) }, 401,
			func(t *testing.T, body string) {
				if strings.TrimSpace(body) != "unauthorized" {
					t.Fatalf("401 body leaks detail: %q", body)
				}
			}},
		{"sha1 only", func() *http.Request {
			r := webhookReq("ping", "d", ping, "")
			r.Header.Set("X-Hub-Signature", "sha1=0000000000000000000000000000000000000000")
			return r
		}, 401, nil},
		{"non-push event ignored", func() *http.Request {
			b := []byte(`{"action":"opened"}`)
			return webhookReq("issues", "d-issue", b, sign(testSecret, b))
		}, 204, nil},
		{"body over cap via Content-Length", func() *http.Request { return webhookReq("push", "d-big", big, sign(testSecret, big)) }, 413, nil},
		{"body over cap without Content-Length", func() *http.Request {
			r := webhookReq("push", "d-big2", nil, sign(testSecret, big))
			r.Body = io.NopCloser(bytes.NewReader(big))
			r.ContentLength = -1
			return r
		}, 413, nil},
		{"missing delivery id", func() *http.Request { b := pushBody(pushOpts{}); return webhookReq("push", "", b, sign(testSecret, b)) }, 400, nil},
		{"wrong content type", func() *http.Request {
			b := pushBody(pushOpts{})
			r := webhookReq("push", "d-form", b, sign(testSecret, b))
			r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
			return r
		}, 415, nil},
		{"malformed JSON", func() *http.Request {
			b := []byte(`{"ref":`)
			return webhookReq("push", "d-bad", b, sign(testSecret, b))
		}, 400, nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, c.req())
			if rec.Code != c.code {
				t.Fatalf("code = %d, want %d (body %q)", rec.Code, c.code, rec.Body.String())
			}
			if c.check != nil {
				c.check(t, rec.Body.String())
			}
		})
	}
	env.idle(t)
	if n := len(env.gh.Calls()); n != 0 {
		t.Fatalf("no GitHub calls expected, got %v", env.gh.Calls())
	}
}

func TestDeliveryDedup(t *testing.T) {
	env := newEnv(t, nil)
	body := pushBody(pushOpts{})
	if rec := env.push(t, "dup-1", body); rec.Code != http.StatusAccepted {
		t.Fatalf("first: %d %s", rec.Code, rec.Body)
	}
	rec := env.push(t, "dup-1", body)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "duplicate") {
		t.Fatalf("redelivery: %d %s", rec.Code, rec.Body)
	}
	// A replay under a fresh delivery id (the header is not signed) is still
	// caught by the per-commit de-dup.
	rec = env.push(t, "dup-2", body)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "already graded") {
		t.Fatalf("replay: %d %s", rec.Code, rec.Body)
	}
	env.idle(t)
	if n := len(env.runner.submissions()); n != 1 {
		t.Fatalf("submissions = %d, want 1", n)
	}
}

func TestDedupLRUBounded(t *testing.T) {
	l := newLRU(2)
	for _, k := range []string{"a", "b", "c"} {
		if l.seenOrAdd(k) {
			t.Fatalf("%s seen too early", k)
		}
	}
	if l.seenOrAdd("a") {
		t.Fatal("a should have been evicted")
	}
	if !l.seenOrAdd("c") {
		t.Fatal("c should be remembered")
	}
}

func TestPushFiltering(t *testing.T) {
	cases := []struct {
		name        string
		opts        pushOpts
		defaultOnly bool
		reason      string // "" = graded
	}{
		{"branch push graded", pushOpts{}, false, ""},
		{"feature branch graded", pushOpts{ref: "refs/heads/stage-3"}, false, ""},
		{"feature branch ignored when default-only", pushOpts{ref: "refs/heads/stage-3"}, true, "not the default branch"},
		{"default branch graded when default-only", pushOpts{}, true, ""},
		{"branch deletion", pushOpts{deleted: true, after: strings.Repeat("0", 40), noHead: true}, false, "branch deletion"},
		{"zero after", pushOpts{after: strings.Repeat("0", 40)}, false, "branch deletion"},
		{"tag push", pushOpts{ref: "refs/tags/v1"}, false, "tag push"},
		{"no head commit", pushOpts{noHead: true}, false, "no head commit"},
		{"other ref", pushOpts{ref: "refs/notes/x"}, false, "not a branch"},
		{"uppercase sha rejected", pushOpts{after: strings.ToUpper(testSHA)}, false, "invalid commit sha"},
		{"bad owner", pushOpts{owner: "evil/../x"}, false, "invalid repository name"},
		{"bad repo", pushOpts{repo: ".."}, false, "invalid repository name"},
		{"stale event", pushOpts{pushedAt: fixedNow.Add(-48 * time.Hour).Unix()}, false, "stale event"},
		{"string pushed_at", pushOpts{pushedAt: fixedNow.Format(time.RFC3339)}, false, ""},
		{"no installation", pushOpts{noInstallation: true}, false, "not an App installation delivery"},
	}
	for i, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			env := newEnv(t, func(cfg *Config) { cfg.DefaultBranchOnly = c.defaultOnly })
			rec := env.push(t, fmt.Sprintf("d-%d", i), pushBody(c.opts))
			env.idle(t)
			if c.reason == "" {
				if rec.Code != http.StatusAccepted || len(env.runner.submissions()) != 1 {
					t.Fatalf("want graded: %d %q subs=%d", rec.Code, rec.Body, len(env.runner.submissions()))
				}
				return
			}
			if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), c.reason) {
				t.Fatalf("want ignored %q, got %d %q", c.reason, rec.Code, rec.Body)
			}
			if n := len(env.gh.Calls()); n != 0 {
				t.Fatalf("ignored push made GitHub calls: %v", env.gh.Calls())
			}
		})
	}
}

func TestInstallationRateLimit(t *testing.T) {
	env := newEnv(t, func(c *Config) { c.InstallationBurst = 1; c.InstallationRefill = time.Hour })
	env.push(t, "rl-1", pushBody(pushOpts{}))
	rec := env.push(t, "rl-2", pushBody(pushOpts{after: strings.Repeat("ab", 20)}))
	if rec.Code != http.StatusAccepted || !strings.Contains(rec.Body.String(), "rate limited") {
		t.Fatalf("got %d %q", rec.Code, rec.Body)
	}
	env.idle(t)
	if n := len(env.runner.submissions()); n != 1 {
		t.Fatalf("submissions = %d", n)
	}
	var neutral int
	for _, w := range env.gh.checkWrites(t) {
		if w["conclusion"] == "neutral" && w["head_sha"] == strings.Repeat("ab", 20) {
			neutral++
		}
	}
	if neutral != 1 {
		t.Fatalf("want one neutral rate-limit check, writes: %v", env.gh.checkWrites(t))
	}
}

func TestDisabledHandler(t *testing.T) {
	rec := httptest.NewRecorder()
	Disabled().ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/github/webhook", nil))
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("code %d", rec.Code)
	}
}

func TestConfigFromEnv(t *testing.T) {
	env := map[string]string{EnvAppID: " 1 ", EnvPrivateKey: "k", EnvWebhookSecret: "s", EnvDefaultOnly: "true"}
	cfg, ok := ConfigFromEnv(func(k string) string { return env[k] })
	if !ok || cfg.AppID != "1" || !cfg.DefaultBranchOnly {
		t.Fatalf("got %+v %v", cfg, ok)
	}
	delete(env, EnvWebhookSecret)
	if _, ok := ConfigFromEnv(func(k string) string { return env[k] }); ok {
		t.Fatal("configured without a secret")
	}
}
