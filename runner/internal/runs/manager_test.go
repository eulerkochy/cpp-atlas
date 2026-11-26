package runs

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"cppatlas.com/runner/internal/protocol"
)

func testLogger() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

type clock struct {
	mu sync.Mutex
	t  time.Time
}

func newClock() *clock { return &clock{t: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)} }
func (c *clock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}
func (c *clock) Add(d time.Duration) {
	c.mu.Lock()
	c.t = c.t.Add(d)
	c.mu.Unlock()
}

// fakeBackend runs fn, or returns a passing result for every stage.
type fakeBackend struct {
	fn func(ctx context.Context, job protocol.Job) (*protocol.Result, error)
}

func (f *fakeBackend) Name() string { return "fake" }
func (f *fakeBackend) Run(ctx context.Context, job protocol.Job) (*protocol.Result, error) {
	if f.fn != nil {
		return f.fn(ctx, job)
	}
	return passing(job), nil
}

func passing(job protocol.Job) *protocol.Result {
	r := &protocol.Result{RunID: job.RunID, Status: protocol.ResultCompleted, Passed: true, Challenge: job.Challenge}
	for _, s := range job.Stages {
		r.Stages = append(r.Stages, protocol.StageResult{Stage: s, Status: protocol.StagePassed})
	}
	return r
}

func sub() protocol.Submission {
	return protocol.Submission{
		Challenge: "vector",
		Files:     map[string]string{"include/my/vector.hpp": "#pragma once\nnamespace my {}\n"},
		Source:    protocol.SourceWeb,
	}
}

func newTestManager(t *testing.T, cfg Config, b Backend) *Manager {
	t.Helper()
	m := NewManager(cfg, b, testLogger())
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = m.Shutdown(ctx)
	})
	return m
}

func waitView(t *testing.T, m *Manager, id string) protocol.RunView {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	v, err := m.Wait(ctx, id)
	if err != nil {
		t.Fatalf("wait %s: %v", id, err)
	}
	return v
}

func TestValidation(t *testing.T) {
	m := newTestManager(t, Config{}, &fakeBackend{})
	big := strings.Repeat("a", 256<<10+1)
	cases := []struct {
		name     string
		mut      func(*protocol.Submission)
		field    string
		tooLarge bool
	}{
		{"ok", func(*protocol.Submission) {}, "", false},
		{"ok stages", func(s *protocol.Submission) { s.Stages = []int{1, 3, 8} }, "", false},
		{"ok options", func(s *protocol.Submission) {
			s.Options = protocol.Options{Compiler: "clang", Preset: "asan-ubsan"}
		}, "", false},
		{"ok github", func(s *protocol.Submission) { s.Source = protocol.SourceGitHub }, "", false},
		{"unknown challenge", func(s *protocol.Submission) { s.Challenge = "list" }, "challenge", false},
		{"empty challenge", func(s *protocol.Submission) { s.Challenge = "" }, "challenge", false},
		{"no source", func(s *protocol.Submission) { s.Source = "" }, "source", false},
		{"stage 0", func(s *protocol.Submission) { s.Stages = []int{0} }, "stage", false},
		{"stage 9", func(s *protocol.Submission) { s.Stages = []int{9} }, "stage", false},
		{"negative stage", func(s *protocol.Submission) { s.Stages = []int{-1} }, "stage", false},
		{"descending", func(s *protocol.Submission) { s.Stages = []int{2, 1} }, "stage", false},
		{"duplicate", func(s *protocol.Submission) { s.Stages = []int{2, 2} }, "stage", false},
		{"too many", func(s *protocol.Submission) { s.Stages = []int{1, 2, 3, 4, 5, 6, 7, 8, 9} }, "stage", false},
		{"no files", func(s *protocol.Submission) { s.Files = nil }, "files", false},
		{"extra file", func(s *protocol.Submission) { s.Files["src/main.cpp"] = "int main(){}" }, "files", false},
		{"traversal", func(s *protocol.Submission) {
			s.Files = map[string]string{"include/my/../my/vector.hpp": "x"}
		}, "files", false},
		{"missing required", func(s *protocol.Submission) {
			s.Files = map[string]string{"include/my/Vector.hpp": "x"}
		}, "files", false},
		{"too large", func(s *protocol.Submission) { s.Files["include/my/vector.hpp"] = big }, "files", true},
		{"exactly max", func(s *protocol.Submission) { s.Files["include/my/vector.hpp"] = big[1:] }, "", false},
		{"bad utf8", func(s *protocol.Submission) { s.Files["include/my/vector.hpp"] = "a\xffb" }, "files", false},
		{"nul", func(s *protocol.Submission) { s.Files["include/my/vector.hpp"] = "a\x00b" }, "files", false},
		{"compiler", func(s *protocol.Submission) { s.Options.Compiler = "msvc" }, "options", false},
		{"preset", func(s *protocol.Submission) { s.Options.Preset = "release; rm -rf /" }, "options", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := sub()
			s.ClientKey = "" // no fairness cap here
			tc.mut(&s)
			_, _, _, err := m.validate(s)
			if tc.field == "" {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				return
			}
			var ve *protocol.ValidationError
			if !errors.As(err, &ve) {
				t.Fatalf("want ValidationError(%s), got %v", tc.field, err)
			}
			if ve.Field != tc.field || ve.TooLarge != tc.tooLarge {
				t.Fatalf("got field=%s tooLarge=%v (%s), want %s %v", ve.Field, ve.TooLarge, ve.Message, tc.field, tc.tooLarge)
			}
		})
	}
}

func TestTotalSizeCap(t *testing.T) {
	spec := protocol.ChallengeSpec{Name: "two", Stages: 2,
		AllowedFiles: []string{"a.hpp", "b.hpp"}, RequiredFiles: []string{"a.hpp"},
		MaxFileBytes: 10, MaxTotalBytes: 15}
	m := newTestManager(t, Config{Challenges: []protocol.ChallengeSpec{spec}}, &fakeBackend{})
	s := protocol.Submission{Challenge: "two", Source: protocol.SourceWeb,
		Files: map[string]string{"a.hpp": "0123456789", "b.hpp": "012345"}}
	_, err := m.Submit(context.Background(), s)
	var ve *protocol.ValidationError
	if !errors.As(err, &ve) || !ve.TooLarge {
		t.Fatalf("want TooLarge, got %v", err)
	}
	s.Files["b.hpp"] = "01234"
	v, err := m.Submit(context.Background(), s)
	if err != nil {
		t.Fatal(err)
	}
	if got := waitView(t, m, v.ID); got.Status != protocol.RunCompleted || !got.Result.Passed || len(got.Stages) != 2 {
		t.Fatalf("got %+v", got)
	}
}

func TestDefaultsAndJob(t *testing.T) {
	var got protocol.Job
	b := &fakeBackend{fn: func(ctx context.Context, job protocol.Job) (*protocol.Result, error) {
		got = job
		return passing(job), nil
	}}
	m := newTestManager(t, Config{Limits: protocol.Limits{TestTimeoutSec: 5}}, b)
	s := sub()
	s.StopOnFail = true
	v, err := m.Submit(context.Background(), s)
	if err != nil {
		t.Fatal(err)
	}
	if len(v.ID) != 22 || strings.ContainsAny(v.ID, "+/=") {
		t.Fatalf("bad id %q", v.ID)
	}
	if v.Status != protocol.RunQueued || len(v.Stages) != 8 {
		t.Fatalf("view %+v", v)
	}
	fin := waitView(t, m, v.ID)
	if fin.Status != protocol.RunCompleted || fin.StartedAt == nil || fin.FinishedAt == nil {
		t.Fatalf("final %+v", fin)
	}
	if got.RunID != v.ID || got.Options.Compiler != "gcc" || got.Options.Preset != "debug" || !got.StopOnFail {
		t.Fatalf("job %+v", got)
	}
	want := protocol.DefaultLimits()
	want.TestTimeoutSec = 5
	want.TraceBytes = DefaultTraceBytes // the API asks for less trace than the protocol default
	if got.Limits != want {
		t.Fatalf("limits %+v", got.Limits)
	}
	if got.Files["include/my/vector.hpp"] == "" {
		t.Fatal("job lost files")
	}
	// The submission is dropped once terminal.
	m.mu.Lock()
	r := m.runs[v.ID]
	dropped := r.job == nil
	m.mu.Unlock()
	if !dropped {
		t.Fatal("submission still held after terminal")
	}
	if _, ok := m.Get("nope"); ok {
		t.Fatal("unknown id found")
	}
	if _, err := m.Wait(context.Background(), "nope"); !errors.Is(err, protocol.ErrNotFound) {
		t.Fatalf("wait unknown: %v", err)
	}
}

// blockingBackend blocks every run until release is closed or ctx ends.
type blockingBackend struct {
	started chan string
	release chan struct{}
	cur     atomic.Int32
	peak    atomic.Int32
	cleaned atomic.Int32
}

func newBlocking() *blockingBackend {
	return &blockingBackend{started: make(chan string, 100), release: make(chan struct{})}
}
func (b *blockingBackend) Name() string { return "blocking" }
func (b *blockingBackend) Run(ctx context.Context, job protocol.Job) (*protocol.Result, error) {
	n := b.cur.Add(1)
	defer b.cur.Add(-1)
	for {
		p := b.peak.Load()
		if n <= p || b.peak.CompareAndSwap(p, n) {
			break
		}
	}
	b.started <- job.RunID
	select {
	case <-b.release:
		return passing(job), nil
	case <-ctx.Done():
		b.cleaned.Add(1) // "destroy the sandbox"
		return nil, ctx.Err()
	}
}

func recv(t *testing.T, ch chan string) string {
	t.Helper()
	select {
	case s := <-ch:
		return s
	case <-time.After(5 * time.Second):
		t.Fatal("timeout waiting for backend start")
		return ""
	}
}

func TestQueueFull(t *testing.T) {
	b := newBlocking()
	m := newTestManager(t, Config{MaxConcurrent: 1, QueueSize: 2, MaxPerClient: -1, MaxQueuedWeb: -1}, b)
	first, err := m.Submit(context.Background(), sub())
	if err != nil {
		t.Fatal(err)
	}
	recv(t, b.started)
	q1, err := m.Submit(context.Background(), sub())
	if err != nil {
		t.Fatal(err)
	}
	q2, err := m.Submit(context.Background(), sub())
	if err != nil {
		t.Fatal(err)
	}
	if q1.QueuePosition != 1 || q2.QueuePosition != 2 {
		t.Fatalf("positions %d %d", q1.QueuePosition, q2.QueuePosition)
	}
	if _, err := m.Submit(context.Background(), sub()); !errors.Is(err, protocol.ErrQueueFull) {
		t.Fatalf("want ErrQueueFull, got %v", err)
	}
	if st := m.Stats(); st.Queued != 2 || st.Running != 1 || st.MaxConcurrent != 1 || st.QueueSize != 2 {
		t.Fatalf("stats %+v", st)
	}
	if v, _ := m.Get(first.ID); v.Status != protocol.RunRunning || v.QueuePosition != 0 {
		t.Fatalf("first %+v", v)
	}
	close(b.release)
	for _, id := range []string{first.ID, q1.ID, q2.ID} {
		if v := waitView(t, m, id); v.Status != protocol.RunCompleted {
			t.Fatalf("%s: %+v", id, v)
		}
	}
}

func TestPerClientCap(t *testing.T) {
	b := newBlocking()
	m := newTestManager(t, Config{MaxConcurrent: 1, MaxPerClient: 2}, b)
	s := sub()
	s.ClientKey = "1.2.3.4"
	a, err := m.Submit(context.Background(), s)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := m.Submit(context.Background(), s); err != nil {
		t.Fatal(err)
	}
	if _, err := m.Submit(context.Background(), s); !errors.Is(err, ErrTooManyRuns) {
		t.Fatalf("want ErrTooManyRuns, got %v", err)
	}
	other := s
	other.ClientKey = "gh:a/b"
	if _, err := m.Submit(context.Background(), other); err != nil {
		t.Fatalf("other client: %v", err)
	}
	close(b.release)
	waitView(t, m, a.ID)
	// A slot is free again once a run is terminal.
	if _, err := m.Submit(context.Background(), s); err != nil {
		t.Fatalf("after finish: %v", err)
	}
}

func TestConcurrencyLimit(t *testing.T) {
	var cur, peak atomic.Int32
	b := &fakeBackend{fn: func(ctx context.Context, job protocol.Job) (*protocol.Result, error) {
		n := cur.Add(1)
		defer cur.Add(-1)
		for {
			p := peak.Load()
			if n <= p || peak.CompareAndSwap(p, n) {
				break
			}
		}
		time.Sleep(5 * time.Millisecond)
		return passing(job), nil
	}}
	m := newTestManager(t, Config{MaxConcurrent: 3, QueueSize: 60, MaxPerClient: -1}, b)
	var ids []string
	var mu sync.Mutex
	var wg sync.WaitGroup
	for range 40 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			v, err := m.Submit(context.Background(), sub())
			if err != nil {
				t.Error(err)
				return
			}
			mu.Lock()
			ids = append(ids, v.ID)
			mu.Unlock()
			_ = m.Stats()
		}()
	}
	wg.Wait()
	for _, id := range ids {
		if v := waitView(t, m, id); v.Status != protocol.RunCompleted {
			t.Fatalf("%+v", v)
		}
	}
	if p := peak.Load(); p > 3 || p < 1 {
		t.Fatalf("peak concurrency %d", p)
	}
}

func TestTimeoutCleansUp(t *testing.T) {
	b := newBlocking()
	m := newTestManager(t, Config{RunTimeout: 50 * time.Millisecond}, b)
	v, err := m.Submit(context.Background(), sub())
	if err != nil {
		t.Fatal(err)
	}
	fin := waitView(t, m, v.ID)
	if fin.Status != protocol.RunTimeout || fin.Error == nil || fin.Error.Code != CodeTimeout || fin.Result != nil {
		t.Fatalf("got %+v", fin)
	}
	if b.cleaned.Load() != 1 {
		t.Fatal("backend not cancelled")
	}
	if st := m.Stats(); st.Running != 0 {
		t.Fatalf("running %d", st.Running)
	}
}

func TestBackendErrors(t *testing.T) {
	secret := "docker: daemon at /var/run/x.sock refused"
	cases := []struct {
		name string
		fn   func(ctx context.Context, job protocol.Job) (*protocol.Result, error)
		code string
	}{
		{"unavailable", func(context.Context, protocol.Job) (*protocol.Result, error) {
			return nil, Unavailable(errors.New(secret))
		}, CodeBackendUnavailable},
		{"generic", func(context.Context, protocol.Job) (*protocol.Result, error) {
			return nil, errors.New(secret)
		}, CodeInternal},
		{"nil nil", func(context.Context, protocol.Job) (*protocol.Result, error) { return nil, nil }, CodeInternal},
		{"panic", func(context.Context, protocol.Job) (*protocol.Result, error) { panic(secret) }, CodeInternal},
		{"wrong run id", func(_ context.Context, j protocol.Job) (*protocol.Result, error) {
			r := passing(j)
			r.RunID = "other"
			return r, nil
		}, CodeBadResult},
		{"bad status", func(_ context.Context, j protocol.Job) (*protocol.Result, error) {
			r := passing(j)
			r.Status = "maybe"
			return r, nil
		}, CodeBadResult},
		{"grader error", func(_ context.Context, j protocol.Job) (*protocol.Result, error) {
			return &protocol.Result{RunID: j.RunID, Status: protocol.ResultError,
				Error: &protocol.RunError{Code: "bad_job", Message: "nope"}}, nil
		}, "bad_job"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			m := newTestManager(t, Config{}, &fakeBackend{fn: tc.fn})
			v, err := m.Submit(context.Background(), sub())
			if err != nil {
				t.Fatal(err)
			}
			fin := waitView(t, m, v.ID)
			if fin.Status != protocol.RunFailed || fin.Error == nil || fin.Error.Code != tc.code {
				t.Fatalf("got %+v err=%+v", fin, fin.Error)
			}
			if strings.Contains(fin.Error.Message, "sock") {
				t.Fatal("detail leaked to learner")
			}
		})
	}
}

func TestResultSanitized(t *testing.T) {
	b := &fakeBackend{fn: func(_ context.Context, j protocol.Job) (*protocol.Result, error) {
		return &protocol.Result{
			RunID: j.RunID, Status: protocol.ResultCompleted, Passed: true, Challenge: "evil",
			Compiler: strings.Repeat("x", 1000) + "\xff",
			Stages: []protocol.StageResult{
				{Stage: 2, Status: protocol.StageFailed, Output: strings.Repeat("o", 200<<10)},
				{Stage: 1, Status: protocol.StagePassed, Trace: []json.RawMessage{json.RawMessage(`{"a":1}`), json.RawMessage(`{bad`)}},
				{Stage: 1, Status: protocol.StagePassed},
				{Stage: 7, Status: protocol.StagePassed},
				{Stage: 3, Status: "weird", Tests: []protocol.TestCase{{Name: "t", Status: "odd"}}},
			},
			Error: &protocol.RunError{Code: "Bad Code!", Message: strings.Repeat("m", 5000)},
		}, nil
	}}
	m := newTestManager(t, Config{}, b)
	s := sub()
	s.Stages = []int{1, 2, 3}
	v, _ := m.Submit(context.Background(), s)
	fin := waitView(t, m, v.ID)
	r := fin.Result
	if fin.Status != protocol.RunCompleted || r == nil {
		t.Fatalf("%+v", fin)
	}
	if r.Passed || r.Challenge != "vector" || len(r.Compiler) > capShort {
		t.Fatalf("hygiene: passed=%v challenge=%s compilerlen=%d", r.Passed, r.Challenge, len(r.Compiler))
	}
	if len(r.Stages) != 3 || r.Stages[0].Stage != 1 || r.Stages[1].Stage != 2 || r.Stages[2].Stage != 3 {
		t.Fatalf("stages %+v", r.Stages)
	}
	if len(r.Stages[1].Output) != 64<<10 || !r.Stages[1].OutputTruncated {
		t.Fatalf("output len %d", len(r.Stages[1].Output))
	}
	if len(r.Stages[0].Trace) != 1 || !r.Stages[0].TraceTruncated {
		t.Fatalf("trace %+v", r.Stages[0].Trace)
	}
	if r.Stages[2].Status != protocol.StageFailed || r.Stages[2].Tests[0].Status != protocol.StageFailed {
		t.Fatalf("status not normalised %+v", r.Stages[2])
	}
	if r.Error.Code != "adode" || len(r.Error.Message) != capMessage {
		t.Fatalf("error %+v", r.Error.Code)
	}
}

func TestTTLAndMaxStored(t *testing.T) {
	clk := newClock()
	m := newTestManager(t, Config{ResultTTL: time.Minute, MaxStoredRuns: 3, MaxPerClient: -1, Now: clk.Now}, &fakeBackend{})
	var ids []string
	for range 4 {
		v, err := m.Submit(context.Background(), sub())
		if err != nil {
			t.Fatal(err)
		}
		waitView(t, m, v.ID)
		ids = append(ids, v.ID)
	}
	if _, ok := m.Get(ids[0]); ok {
		t.Fatal("oldest not evicted by MaxStoredRuns")
	}
	if _, ok := m.Get(ids[3]); !ok {
		t.Fatal("newest missing")
	}
	clk.Add(59 * time.Second)
	if _, ok := m.Get(ids[1]); !ok {
		t.Fatal("evicted before TTL")
	}
	clk.Add(2 * time.Second)
	if _, ok := m.Get(ids[1]); ok {
		t.Fatal("not expired after TTL (lazy)")
	}
	m.evictExpired()
	if st := m.Stats(); st.Stored != 0 {
		t.Fatalf("stored %d after sweep", st.Stored)
	}
	if _, err := m.Wait(context.Background(), ids[3]); !errors.Is(err, protocol.ErrNotFound) {
		t.Fatalf("wait after expiry: %v", err)
	}
}

func TestWaitContext(t *testing.T) {
	b := newBlocking()
	m := newTestManager(t, Config{}, b)
	v, _ := m.Submit(context.Background(), sub())
	recv(t, b.started)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	got, err := m.Wait(ctx, v.ID)
	if !errors.Is(err, context.DeadlineExceeded) || got.Status != protocol.RunRunning {
		t.Fatalf("got %v %+v", err, got)
	}
	close(b.release)
}

func TestShutdown(t *testing.T) {
	b := newBlocking()
	m := NewManager(Config{MaxConcurrent: 1, MaxPerClient: -1}, b, testLogger())
	running, _ := m.Submit(context.Background(), sub())
	recv(t, b.started)
	queued, _ := m.Submit(context.Background(), sub())
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := m.Shutdown(ctx); err != nil {
		t.Fatal(err)
	}
	if b.cleaned.Load() != 1 {
		t.Fatal("running sandbox not cancelled")
	}
	for _, id := range []string{running.ID, queued.ID} {
		v, _ := m.Get(id)
		if v.Status != protocol.RunFailed || v.Error.Code != CodeShuttingDown {
			t.Fatalf("%+v", v)
		}
	}
	if _, err := m.Submit(context.Background(), sub()); !errors.Is(err, ErrShuttingDown) {
		t.Fatalf("submit after shutdown: %v", err)
	}
	if !m.Stats().ShuttingDown {
		t.Fatal("stats")
	}
	_ = m.Shutdown(ctx) // idempotent
}

func TestLoadChallenges(t *testing.T) {
	dir := t.TempDir()
	good := filepath.Join(dir, "c.json")
	os.WriteFile(good, []byte(`{"challenges":[{"name":"vector","stages":9,"allowed_files":["include/my/vector.hpp","include/my/extra.hpp"],"required_files":["include/my/vector.hpp"],"max_file_bytes":1000,"max_total_bytes":2000}]}`), 0o600)
	specs, err := LoadChallenges(good)
	if err != nil || len(specs) != 1 || specs[0].Stages != 9 {
		t.Fatalf("%v %+v", err, specs)
	}
	arr := filepath.Join(dir, "a.json")
	os.WriteFile(arr, []byte(`[{"name":"list","stages":1,"allowed_files":["a.hpp"],"max_file_bytes":1,"max_total_bytes":1}]`), 0o600)
	if _, err := LoadChallenges(arr); err != nil {
		t.Fatal(err)
	}
	for _, bad := range []string{
		`[]`,
		`[{"name":"x","stages":0,"allowed_files":["a"],"max_file_bytes":1,"max_total_bytes":1}]`,
		`[{"name":"x","stages":1,"allowed_files":["../a"],"max_file_bytes":1,"max_total_bytes":1}]`,
		`[{"name":"x","stages":1,"allowed_files":["/a"],"max_file_bytes":1,"max_total_bytes":1}]`,
		`[{"name":"x","stages":1,"allowed_files":["a"],"required_files":["b"],"max_file_bytes":1,"max_total_bytes":1}]`,
		`[{"name":"X Y","stages":1,"allowed_files":["a"],"max_file_bytes":1,"max_total_bytes":1}]`,
		`[{"name":"x","stages":1,"allowed_files":["a"],"max_file_bytes":0,"max_total_bytes":1}]`,
		`{not json`,
	} {
		p := filepath.Join(dir, "bad.json")
		os.WriteFile(p, []byte(bad), 0o600)
		if _, err := LoadChallenges(p); err == nil {
			t.Fatalf("accepted %s", bad)
		}
	}
	m := newTestManager(t, Config{Challenges: specs}, &fakeBackend{})
	if s, ok := m.Challenge("vector"); !ok || s.Stages != 9 {
		t.Fatal("override not applied")
	}
	s := sub()
	s.Stages = []int{9}
	if _, err := m.Submit(context.Background(), s); err != nil {
		t.Fatal(err)
	}
}

func chessSub() protocol.Submission {
	return protocol.Submission{
		Challenge: "chess",
		Source:    protocol.SourceWeb,
		Files: map[string]string{
			"include/chess/types.hpp":    "#pragma once\n",
			"include/chess/bitboard.hpp": "#pragma once\n",
			"include/chess/magic.hpp":    "#pragma once\n",
			"include/chess/position.hpp": "#pragma once\n",
			"include/chess/movegen.hpp":  "#pragma once\n",
			"include/chess/eval.hpp":     "#pragma once\n",
			"include/chess/tt.hpp":       "#pragma once\n",
			"include/chess/search.hpp":   "#pragma once\n",
			"include/chess/uci.hpp":      "#pragma once\n",
			"include/chess/chess.hpp":    "#pragma once\n",
			"src/main.cpp":               "int main() { return 0; }\n",
		},
	}
}

func TestChessChallengeSpec(t *testing.T) {
	if err := ValidateChallenges(DefaultChallenges()); err != nil {
		t.Fatalf("DefaultChallenges invalid: %v", err)
	}
	m := newTestManager(t, Config{}, &fakeBackend{})
	spec, ok := m.Challenge("chess")
	if !ok {
		t.Fatal("default registry missing chess challenge")
	}
	if spec.Stages != 9 || len(spec.AllowedFiles) != 11 || len(spec.RequiredFiles) != 11 ||
		!slices.Contains(spec.AllowedFiles, "include/chess/magic.hpp") ||
		!slices.Contains(spec.RequiredFiles, "include/chess/magic.hpp") ||
		spec.MaxFileBytes != 256<<10 || spec.MaxTotalBytes != 512<<10 {
		t.Fatalf("unexpected chess spec: %+v", spec)
	}

	sub9 := chessSub()
	sub9.Stages = []int{1, 2, 3, 4, 5, 6, 7, 8, 9}
	if _, _, _, err := m.validate(sub9); err != nil {
		t.Fatalf("valid 11-file chess submission rejected: %v", err)
	}

	var ve *protocol.ValidationError
	badStage := chessSub()
	badStage.Stages = []int{10}
	if _, _, _, err := m.validate(badStage); !errors.As(err, &ve) || ve.Field != "stage" {
		t.Fatalf("stage 10: want ValidationError(stage), got %v", err)
	}

	missing := chessSub()
	delete(missing.Files, "src/main.cpp")
	if _, _, _, err := m.validate(missing); !errors.As(err, &ve) || ve.Field != "files" {
		t.Fatalf("missing required file: want ValidationError(files), got %v", err)
	}

	missingMagic := chessSub()
	delete(missingMagic.Files, "include/chess/magic.hpp")
	if _, _, _, err := m.validate(missingMagic); !errors.As(err, &ve) || ve.Field != "files" {
		t.Fatalf("missing magic.hpp: want ValidationError(files), got %v", err)
	}

	extra := chessSub()
	extra.Files["include/chess/extra.hpp"] = "#pragma once\n"
	if _, _, _, err := m.validate(extra); !errors.As(err, &ve) || ve.Field != "files" {
		t.Fatalf("disallowed file: want ValidationError(files), got %v", err)
	}

	// Three files each under MaxFileBytes (256 KiB), but summing over MaxTotalBytes (512 KiB).
	tooBigTotal := chessSub()
	chunk := strings.Repeat("a", 200<<10)
	tooBigTotal.Files["include/chess/position.hpp"] = chunk
	tooBigTotal.Files["include/chess/movegen.hpp"] = chunk
	tooBigTotal.Files["include/chess/search.hpp"] = chunk
	if _, _, _, err := m.validate(tooBigTotal); !errors.As(err, &ve) || ve.Field != "files" || !ve.TooLarge {
		t.Fatalf("total cap exceeded: want TooLarge ValidationError(files), got %v", err)
	}
}
