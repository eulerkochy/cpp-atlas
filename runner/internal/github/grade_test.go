package github

import (
	"context"
	"errors"
	"net/http"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"

	"cppatlas.com/runner/internal/protocol"
)

func TestParseSettings(t *testing.T) {
	three := 3
	cases := []struct {
		name    string
		in      string // "<none>" = file missing
		want    repoSettings
		wantErr string
	}{
		{"missing file", "<none>", repoSettings{Challenge: "vector"}, ""},
		{"stage", `{"challenge":"vector","stage":3}`, repoSettings{Challenge: "vector", Stage: &three}, ""},
		{"all options", `{"stage":3,"compiler":"clang","sanitize":true}`, repoSettings{Challenge: "vector", Stage: &three, Compiler: "clang", Sanitize: true}, ""},
		{"BOM and whitespace", "\xef\xbb\xbf {\"stage\":3}\n\n", repoSettings{Challenge: "vector", Stage: &three}, ""},
		{"empty object", `{}`, repoSettings{Challenge: "vector"}, ""},
		{"null stage", `{"stage":null}`, repoSettings{Challenge: "vector"}, ""},
		{"empty file", ``, repoSettings{}, "empty"},
		{"syntax error", `{"stage":3,}`, repoSettings{}, "syntax error"},
		{"unknown field", `{"stgae":3}`, repoSettings{}, "unknown field `stgae`"},
		{"stage as string", `{"stage":"3"}`, repoSettings{}, "wrong type"},
		{"stage float", `{"stage":3.5}`, repoSettings{}, "wrong type"},
		{"two objects", `{"stage":1}{"stage":2}`, repoSettings{}, "exactly one"},
		{"array", `[1]`, repoSettings{}, "wrong type"},
		{"bad compiler", `{"compiler":"msvc"}`, repoSettings{}, "compiler"},
		{"bad challenge name", `{"challenge":"../etc"}`, repoSettings{}, "challenge"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			var in []byte
			if c.in != "<none>" {
				in = []byte(c.in)
			}
			got, err := parseSettings(in, "vector")
			if c.wantErr != "" {
				var se *settingsError
				if !errors.As(err, &se) || !strings.Contains(err.Error(), c.wantErr) {
					t.Fatalf("err = %v, want %q", err, c.wantErr)
				}
				return
			}
			if err != nil || !reflect.DeepEqual(got, c.want) {
				t.Fatalf("got %+v err %v", got, err)
			}
		})
	}
}

// scenario runs one push through the handler and returns the env after the
// grading goroutines have finished.
func scenario(t *testing.T, mod func(*Config), setup func(*testEnv)) *testEnv {
	t.Helper()
	env := newEnv(t, mod)
	if setup != nil {
		setup(env)
	}
	if rec := env.push(t, "scn", pushBody(pushOpts{})); rec.Code != http.StatusAccepted {
		t.Fatalf("push: %d %s", rec.Code, rec.Body)
	}
	env.idle(t)
	return env
}

func output(t *testing.T, w map[string]any) (title, summary, text string) {
	t.Helper()
	o, _ := w["output"].(map[string]any)
	title, _ = o["title"].(string)
	summary, _ = o["summary"].(string)
	text, _ = o["text"].(string)
	return
}

func statuses(t *testing.T, env *testEnv) []string {
	var out []string
	for _, w := range env.gh.checkWrites(t) {
		s, _ := w["status"].(string)
		if c, ok := w["conclusion"].(string); ok {
			s += ":" + c
		}
		out = append(out, s)
	}
	return out
}

func TestGradeScenarios(t *testing.T) {
	type want struct {
		statuses []string
		title    string
		inText   []string
		inSum    []string
		details  string
	}
	exit := 139
	cases := []struct {
		name  string
		setup func(*testEnv)
		want  want
		check func(t *testing.T, env *testEnv)
	}{
		{"all pass", nil, want{
			statuses: []string{"queued", "in_progress", "completed:success"},
			title:    "All 8 stages passed",
			inSum:    []string{"| 8 | [insert-erase](https://cppatlas.com/build/vector/insert-erase) | passed | 5/5 | 0.94 s |", "compiler `g++ 16.2.0`"},
			details:  "https://cppatlas.com/build/vector",
		}, func(t *testing.T, env *testEnv) {
			s := env.runner.submissions()[0]
			if !reflect.DeepEqual(s.Stages, protocol.StagesUpTo(8)) || !s.StopOnFail || s.Source != protocol.SourceGitHub || s.ClientKey != "gh:learner/my-vector" {
				t.Fatalf("submission %+v", s)
			}
			if !reflect.DeepEqual(s.Files, map[string]string{"include/my/vector.hpp": "#pragma once\n"}) {
				t.Fatalf("files %v", s.Files)
			}
		}},
		{"stage config", func(e *testEnv) {
			e.gh.files[".cppatlas.json"] = `{"challenge":"vector","stage":3,"compiler":"clang","sanitize":true}`
		}, want{
			statuses: []string{"queued", "in_progress", "completed:success"},
			title:    "Stages 1-3 of 8 passed",
			details:  "https://cppatlas.com/build/vector/copy-and-move",
		}, func(t *testing.T, env *testEnv) {
			s := env.runner.submissions()[0]
			if !reflect.DeepEqual(s.Stages, []int{1, 2, 3}) || s.Options.Compiler != "clang" || s.Options.Preset != protocol.PresetAsanUbsan {
				t.Fatalf("submission %+v", s)
			}
			if _, ok := s.Files[".cppatlas.json"]; ok {
				t.Fatal("config file submitted")
			}
		}},
		{"stage failure with test messages", func(e *testEnv) {
			e.runner.final = failAt(3, protocol.StageResult{Status: protocol.StageFailed,
				Counts: &protocol.TestCounts{Total: 6, Passed: 4, Failed: 2},
				Tests: []protocol.TestCase{
					{Name: "reserve grows capacity", Status: protocol.StageFailed, Messages: []string{"stage_03.cpp:40: ERROR: CHECK( v.capacity() >= 10 ) is NOT correct!", "  values: CHECK( 0 >= 10 )"}},
					{Name: "ok one", Status: protocol.StagePassed},
					{Name: "growth is geometric", Status: protocol.StageFailed, Messages: []string{"too many reallocations"}},
				}})
		}, want{
			statuses: []string{"queued", "in_progress", "completed:failure"},
			title:    "Stage 3 of 8 failed: growth",
			inText:   []string{"## Stage 3: growth (failed)", "2 of 6 test cases failed.", "### Test case `reserve grows capacity`", "```text\nstage_03.cpp:40: ERROR: CHECK( v.capacity() >= 10 ) is NOT correct!\n  values: CHECK( 0 >= 10 )\n```", "too many reallocations"},
			inSum:    []string{"| 3 | [growth](https://cppatlas.com/build/vector/growth) | **failed** | 4/6 |", "| 4 | [copy-and-move](https://cppatlas.com/build/vector/copy-and-move) | skipped |"},
			details:  "https://cppatlas.com/build/vector/growth",
		}, func(t *testing.T, env *testEnv) {
			if strings.Contains(env.gh.lastCheck(t)["output"].(map[string]any)["text"].(string), "ok one") {
				t.Fatal("passing test listed")
			}
		}},
		{"compile error with preflight", func(e *testEnv) {
			e.runner.final = failAt(2, protocol.StageResult{Status: protocol.StageCompileError, Compile: &protocol.CompileSummary{
				FirstError: "include/my/vector.hpp:12:5: error: 'foo' was not declared in this scope",
				Preflight:  []string{"stage 2 (push-back): my::vector<T> needs `void push_back(const T& value)`."},
				Output:     "include/my/vector.hpp:12:5: error: 'foo' was not declared in this scope\ntests/stage_02.cpp:3:1: error: harness thing\ninclude/my/vector.hpp:20: warning: unused\n",
				ErrorCount: 2,
			}})
		}, want{
			statuses: []string{"queued", "in_progress", "completed:failure"},
			title:    "Stage 2 of 8 does not compile: push-back",
			inText:   []string{"### Your vector is missing something this stage needs", "- ``stage 2 (push-back): my::vector<T> needs `void push_back(const T& value)`.``", "### First compiler error", "### Compiler output (2 errors)"},
		}, func(t *testing.T, env *testEnv) {
			anns := env.gh.lastCheck(t)["output"].(map[string]any)["annotations"].([]any)
			if len(anns) != 2 {
				t.Fatalf("annotations %v", anns)
			}
			a0 := anns[0].(map[string]any)
			if a0["path"] != "include/my/vector.hpp" || a0["start_line"] != float64(12) || a0["annotation_level"] != "failure" {
				t.Fatalf("annotation %v", a0)
			}
			if anns[1].(map[string]any)["annotation_level"] != "warning" {
				t.Fatalf("annotation %v", anns[1])
			}
		}},
		{"stage crash", func(e *testEnv) {
			e.runner.final = failAt(4, protocol.StageResult{Status: protocol.StageCrashed, Phase: "test", Signal: "SIGSEGV", ExitCode: &exit, RunningTest: "copy assignment", Output: "AddressSanitizer: heap-use-after-free"})
		}, want{
			statuses: []string{"queued", "in_progress", "completed:failure"},
			title:    "Stage 4 of 8 crashed: copy-and-move",
			inText:   []string{"- Signal: `SIGSEGV`", "- Running test case: `copy assignment`", "--preset asan-ubsan", "heap-use-after-free"},
		}, nil},
		{"stage timeout is the learner's failure", func(e *testEnv) {
			e.runner.final = failAt(3, protocol.StageResult{Status: protocol.StageTimeout, Phase: "test", RunningTest: "grow forever", Hint: "the test ran longer than 20 s"})
		}, want{
			statuses: []string{"queued", "in_progress", "completed:failure"},
			title:    "Stage 3 of 8 timed out: growth",
			inText:   []string{"grow forever", "the test ran longer than 20 s"},
		}, nil},
		{"run wall-clock timeout", func(e *testEnv) {
			e.runner.final = func(s protocol.Submission) protocol.RunView { return protocol.RunView{Status: protocol.RunTimeout} }
		}, want{statuses: []string{"queued", "in_progress", "completed:timed_out"}, title: "Grading timed out"}, nil},
		{"wait deadline", func(e *testEnv) {
			e.app.cfg.RunTimeout = 50 * time.Millisecond
			e.runner.waitFn = func(ctx context.Context, id string) (protocol.RunView, error) {
				<-ctx.Done()
				return protocol.RunView{ID: id, Status: protocol.RunRunning}, ctx.Err()
			}
		}, want{statuses: []string{"queued", "in_progress", "completed:timed_out"}, title: "Grading timed out"}, nil},
		{"grader error is neutral", func(e *testEnv) {
			e.runner.final = func(s protocol.Submission) protocol.RunView {
				return protocol.RunView{Status: protocol.RunFailed, Error: &protocol.RunError{Code: "grader_internal", Message: "sandbox vanished"}}
			}
		}, want{statuses: []string{"queued", "in_progress", "completed:neutral"}, title: "cppatlas could not grade this commit", inSum: []string{"sandbox vanished"}}, nil},
		{"queue full", func(e *testEnv) { e.runner.submitErr = protocol.ErrQueueFull },
			want{statuses: []string{"queued", "completed:neutral"}, title: "cppatlas is busy"}, nil},
		{"validation error", func(e *testEnv) {
			e.runner.submitErr = &protocol.ValidationError{Field: "files", Message: "contains a NUL byte"}
		}, want{statuses: []string{"queued", "completed:failure"}, title: "Submission rejected", inSum: []string{"contains a NUL byte"}}, nil},
		{"missing solution file", func(e *testEnv) { delete(e.gh.files, "include/my/vector.hpp") },
			want{statuses: []string{"queued", "completed:failure"}, title: "Missing include/my/vector.hpp"}, nil},
		{"solution too large", func(e *testEnv) { e.gh.files["include/my/vector.hpp"] = strings.Repeat("x", 256<<10+1) },
			want{statuses: []string{"queued", "completed:failure"}, title: "include/my/vector.hpp is too large"}, nil},
		{"invalid config", func(e *testEnv) { e.gh.files[".cppatlas.json"] = `{"stage": "three"}` },
			want{statuses: []string{"completed:failure"}, title: "Invalid .cppatlas.json", inSum: []string{"wrong type", "Expected format"}}, nil},
		{"config stage out of range", func(e *testEnv) { e.gh.files[".cppatlas.json"] = `{"stage": 9}` },
			want{statuses: []string{"completed:failure"}, title: "Invalid .cppatlas.json", inSum: []string{"between 1 and 8"}}, nil},
		{"config too large", func(e *testEnv) { e.gh.files[".cppatlas.json"] = `{"stage":1}` + strings.Repeat(" ", 5000) },
			want{statuses: []string{"completed:failure"}, title: "Invalid .cppatlas.json", inSum: []string{"larger than 4096"}}, nil},
		{"unknown challenge", func(e *testEnv) { e.gh.files[".cppatlas.json"] = `{"challenge":"hashmap"}` },
			want{statuses: []string{"completed:failure"}, title: "Unknown challenge", inSum: []string{"`hashmap`"}}, nil},
		{"contents API down", func(e *testEnv) {
			e.gh.override = func(w http.ResponseWriter, r *http.Request, _ []byte) bool {
				if strings.Contains(r.URL.Path, "/contents/") {
					w.WriteHeader(500)
					return true
				}
				return false
			}
		}, want{statuses: []string{"completed:neutral"}, title: "cppatlas could not read this commit"}, nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			env := scenario(t, nil, c.setup)
			if got := statuses(t, env); !reflect.DeepEqual(got, c.want.statuses) {
				t.Fatalf("check statuses = %v, want %v", got, c.want.statuses)
			}
			last := env.gh.lastCheck(t)
			title, sum, text := output(t, last)
			if title != c.want.title {
				t.Fatalf("title = %q, want %q", title, c.want.title)
			}
			for _, s := range c.want.inSum {
				if !strings.Contains(sum, s) {
					t.Errorf("summary lacks %q:\n%s", s, sum)
				}
			}
			for _, s := range c.want.inText {
				if !strings.Contains(text, s) {
					t.Errorf("text lacks %q:\n%s", s, text)
				}
			}
			if c.want.details != "" && last["details_url"] != c.want.details {
				t.Errorf("details_url = %v, want %s", last["details_url"], c.want.details)
			}
			first := env.gh.checkWrites(t)[0]
			if first["head_sha"] != testSHA || !strings.HasPrefix(first["name"].(string), "cppatlas") {
				t.Errorf("create body %v", first)
			}
			if c.check != nil {
				c.check(t, env)
			}
		})
	}
}

// TestNoConfigIgnored: a repository without .cppatlas.json (an unrelated repo
// on an "All repositories" install) gets no check run and no runner job.
func TestNoConfigIgnored(t *testing.T) {
	env := scenario(t, nil, func(e *testEnv) { delete(e.gh.files, ".cppatlas.json") })
	if w := env.gh.checkWrites(t); len(w) != 0 {
		t.Fatalf("expected no check runs, got %v", w)
	}
	if s := env.runner.submissions(); len(s) != 0 {
		t.Fatalf("expected no submissions, got %v", s)
	}
}

// TestSupersededPush: while main@A is running, B and then C are pushed to main.
// B never starts (cancelled check), C is graded after A.
func TestSupersededPush(t *testing.T) {
	release := make(chan struct{})
	env := newEnv(t, nil)
	env.runner.started = make(chan string, 4)
	env.runner.waitFn = func(ctx context.Context, id string) (protocol.RunView, error) {
		if id == "run-1" {
			<-release
		}
		v, _ := env.runner.Get(id)
		return v, nil
	}
	shaA, shaB, shaC := strings.Repeat("a", 40), strings.Repeat("b", 40), strings.Repeat("c", 40)
	env.gh.override = func(w http.ResponseWriter, r *http.Request, _ []byte) bool {
		if strings.Contains(r.URL.Path, "/contents/") { // serve any SHA
			if strings.HasSuffix(r.URL.Path, "vector.hpp") {
				w.Write([]byte("x"))
			} else if strings.HasSuffix(r.URL.Path, ".cppatlas.json") {
				w.Write([]byte(`{"challenge":"vector"}`))
			} else {
				w.WriteHeader(404)
			}
			return true
		}
		return false
	}
	env.push(t, "p-a", pushBody(pushOpts{after: shaA}))
	<-env.runner.started // A is in Wait
	env.push(t, "p-b", pushBody(pushOpts{after: shaB}))
	env.push(t, "p-c", pushBody(pushOpts{after: shaC}))
	// another branch queues independently and is not superseded by main
	shaD := strings.Repeat("d", 40)
	env.push(t, "p-d", pushBody(pushOpts{after: shaD, ref: "refs/heads/other"}))
	deadline := time.Now().Add(5 * time.Second)
	for {
		var cancelled bool
		for _, w := range env.gh.checkWrites(t) {
			if w["head_sha"] == shaB && w["conclusion"] == "cancelled" {
				cancelled = true
			}
		}
		if cancelled {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("B not cancelled: %v", env.gh.checkWrites(t))
		}
		time.Sleep(10 * time.Millisecond)
	}
	close(release)
	env.idle(t)
	subs := env.runner.submissions()
	if len(subs) != 3 {
		t.Fatalf("submissions = %d, want 3 (A, C, D)", len(subs))
	}
	var created []string // head_sha of every check run created, in order
	for _, c := range env.gh.callsTo(http.MethodPost, "/repos/") {
		created = append(created, c.json(t)["head_sha"].(string))
	}
	if strings.Count(strings.Join(created, ","), shaB) != 1 || !slices.Contains(created, shaC) || !slices.Contains(created, shaA) {
		t.Fatalf("created %v", created)
	}
	_, sum, _ := output(t, func() map[string]any {
		for _, w := range env.gh.checkWrites(t) {
			if w["head_sha"] == shaB {
				return w
			}
		}
		return nil
	}())
	if !strings.Contains(sum, "`ccccccc`") {
		t.Fatalf("superseded summary %q", sum)
	}
	if n := strings.Count(strings.Join(statuses(t, env), ","), "completed:success"); n != 3 {
		t.Fatalf("successes = %d: %v", n, statuses(t, env))
	}
}

func TestBacklogOverflow(t *testing.T) {
	release := make(chan struct{})
	env := newEnv(t, func(c *Config) { c.MaxQueued = 1 })
	env.runner.started = make(chan string, 4)
	env.runner.waitFn = func(ctx context.Context, id string) (protocol.RunView, error) {
		<-release
		v, _ := env.runner.Get(id)
		return v, nil
	}
	env.push(t, "o-1", pushBody(pushOpts{}))
	<-env.runner.started
	other := strings.Repeat("e", 40)
	if rec := env.push(t, "o-2", pushBody(pushOpts{after: other})); rec.Code != http.StatusAccepted {
		t.Fatalf("overflow push not acked: %d", rec.Code)
	}
	close(release)
	env.idle(t)
	var busy bool
	for _, w := range env.gh.checkWrites(t) {
		if w["head_sha"] == other && w["conclusion"] == "neutral" {
			busy = true
		}
	}
	if !busy || len(env.runner.submissions()) != 1 {
		t.Fatalf("busy=%v subs=%d", busy, len(env.runner.submissions()))
	}
}

func TestPanicCompletesNeutral(t *testing.T) {
	env := scenario(t, nil, func(e *testEnv) {
		e.runner.waitFn = func(ctx context.Context, id string) (protocol.RunView, error) { panic("boom") }
	})
	if got := statuses(t, env); !reflect.DeepEqual(got, []string{"queued", "in_progress", "completed:neutral"}) {
		t.Fatalf("statuses %v", got)
	}
	// the server still works
	env.runner.waitFn = nil
	// the same commit may be graded again after an infrastructure failure
	if rec := env.push(t, "after-panic", pushBody(pushOpts{})); rec.Code != http.StatusAccepted {
		t.Fatalf("after panic: %d %s", rec.Code, rec.Body)
	}
	env.idle(t)
	if n := len(env.runner.submissions()); n != 2 {
		t.Fatalf("subs = %d", n)
	}
}

func TestShutdownCompletesInFlight(t *testing.T) {
	env := newEnv(t, nil)
	env.runner.started = make(chan string, 1)
	env.runner.waitFn = func(ctx context.Context, id string) (protocol.RunView, error) {
		<-ctx.Done()
		return protocol.RunView{ID: id, Status: protocol.RunRunning}, ctx.Err()
	}
	env.push(t, "sd", pushBody(pushOpts{}))
	<-env.runner.started
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := env.app.Shutdown(ctx); err != nil {
		t.Fatal(err)
	}
	if got := statuses(t, env); !reflect.DeepEqual(got, []string{"queued", "in_progress", "completed:neutral"}) {
		t.Fatalf("statuses %v", got)
	}
	_, sum, _ := output(t, env.gh.lastCheck(t))
	if !strings.Contains(sum, "restarted") {
		t.Fatalf("summary %q", sum)
	}
	rec := env.push(t, "sd-2", pushBody(pushOpts{after: strings.Repeat("9", 40)}))
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("after shutdown: %d", rec.Code)
	}
}

func TestCompleteRetriedNeutralWhenFinalPatchFails(t *testing.T) {
	var patches int
	env := scenario(t, nil, func(e *testEnv) {
		e.gh.override = func(w http.ResponseWriter, r *http.Request, body []byte) bool {
			if r.Method == http.MethodPatch && strings.Contains(string(body), `"conclusion":"success"`) {
				patches++
				w.WriteHeader(422)
				w.Write([]byte(`{"message":"Invalid request"}`))
				return true
			}
			return false
		}
	})
	if got := statuses(t, env); !reflect.DeepEqual(got, []string{"queued", "in_progress", "completed:success", "completed:neutral"}) {
		t.Fatalf("statuses %v", got)
	}
	if patches != 1 {
		t.Fatalf("patches %d", patches)
	}
}
