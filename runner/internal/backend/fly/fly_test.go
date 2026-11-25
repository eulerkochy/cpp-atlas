package fly

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"cppatlas.com/runner/internal/protocol"
	"cppatlas.com/runner/internal/runs"
)

// ------------------------------------------------------ fake Machines API

type fakeMachine struct {
	machine
	req     createRequest
	raw     map[string]any
	stopped chan struct{}
	once    sync.Once
}

func (m *fakeMachine) stop() { m.once.Do(func() { close(m.stopped) }) }

type fakeFly struct {
	t   *testing.T
	srv *httptest.Server

	mu           sync.Mutex
	seq          int
	machines     map[string]*fakeMachine
	calls        []string
	failCreate   int
	createStatus int
	startStatus  int
	authSeen     string
	behaviour    string // grader behaviour: ok | silent | hang
	graderWG     sync.WaitGroup

	privateIP     string        // private_ip in create/get/list answers ("" = omitted)
	applyThenFail int           // creates that are applied but answered with createStatus
	createDelay   time.Duration // delay of the create answer (after launch)
	jobCodes      []int         // status codes the grader saw on GET /internal/job
}

func newFakeFly(t *testing.T) *fakeFly {
	f := &fakeFly{t: t, machines: map[string]*fakeMachine{}, behaviour: "ok", createStatus: 503, privateIP: "127.0.0.1"}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /v1/apps/{app}/machines", f.create)
	mux.HandleFunc("GET /v1/apps/{app}/machines", f.list)
	mux.HandleFunc("GET /v1/apps/{app}/machines/{id}", f.get)
	mux.HandleFunc("POST /v1/apps/{app}/machines/{id}/start", f.start)
	mux.HandleFunc("GET /v1/apps/{app}/machines/{id}/wait", f.wait)
	mux.HandleFunc("DELETE /v1/apps/{app}/machines/{id}", f.delete)
	f.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		f.authSeen = r.Header.Get("Authorization")
		f.calls = append(f.calls, r.Method+" "+r.URL.Path)
		f.mu.Unlock()
		if r.PathValue("app") != "" && r.PathValue("app") != "cppatlas-grader" {
			http.Error(w, "wrong app", 404)
			return
		}
		mux.ServeHTTP(w, r)
	}))
	t.Cleanup(func() { f.graderWG.Wait(); f.srv.Close() })
	return f
}

func (f *fakeFly) callsWith(s string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	n := 0
	for _, c := range f.calls {
		if strings.Contains(c, s) {
			n++
		}
	}
	return n
}

func (f *fakeFly) create(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(r.Body)
	var req createRequest
	var raw map[string]any
	json.Unmarshal(body, &req)
	json.Unmarshal(body, &raw)
	f.mu.Lock()
	if f.failCreate > 0 {
		f.failCreate--
		st := f.createStatus
		f.mu.Unlock()
		http.Error(w, `{"error":"no capacity, token was `+req.Config.Env["CPPATLAS_TOKEN"]+`"}`, st)
		return
	}
	for _, other := range f.machines {
		if other.Name == req.Name {
			f.mu.Unlock()
			http.Error(w, `{"error":"a machine with this name already exists"}`, http.StatusConflict)
			return
		}
	}
	f.seq++
	m := &fakeMachine{req: req, raw: raw, stopped: make(chan struct{})}
	m.ID = fmt.Sprintf("m%03d", f.seq)
	m.Name = req.Name
	m.PrivateIP = f.privateIP
	m.Region = req.Region
	m.InstanceID = "inst-" + m.ID
	m.CreatedAt = time.Now()
	m.Config.Metadata = req.Config.Metadata
	m.State = "started"
	if req.SkipLaunch {
		m.State = "created"
	}
	f.machines[m.ID] = m
	fail, st, delay := f.applyThenFail > 0, f.createStatus, f.createDelay
	if fail {
		f.applyThenFail--
	}
	f.mu.Unlock()
	if !req.SkipLaunch {
		f.launch(m)
	}
	if delay > 0 {
		time.Sleep(delay)
	}
	if fail {
		http.Error(w, `{"error":"gateway timeout"}`, st)
		return
	}
	json.NewEncoder(w).Encode(m.machine)
}

// launch plays the grader inside the machine.
func (f *fakeFly) launch(m *fakeMachine) {
	f.mu.Lock()
	beh := f.behaviour
	f.mu.Unlock()
	env := m.req.Config.Env
	f.graderWG.Add(1)
	go func() {
		defer f.graderWG.Done()
		if beh == "hang" {
			return
		}
		defer f.exit(m)
		req, _ := http.NewRequest("GET", env["CPPATLAS_API_URL"]+"/internal/job", nil)
		req.Header.Set("Authorization", "Bearer "+env["CPPATLAS_TOKEN"])
		resp, err := http.DefaultClient.Do(req)
		if resp != nil {
			f.mu.Lock()
			f.jobCodes = append(f.jobCodes, resp.StatusCode)
			f.mu.Unlock()
		}
		if err != nil || resp.StatusCode != 200 {
			if resp != nil {
				resp.Body.Close()
			}
			return
		}
		var job protocol.Job
		json.NewDecoder(resp.Body).Decode(&job)
		resp.Body.Close()
		if beh == "silent" {
			return
		}
		res := protocol.Result{RunID: job.RunID, Status: protocol.ResultCompleted, Passed: true, Challenge: job.Challenge}
		for _, st := range job.Stages {
			res.Stages = append(res.Stages, protocol.StageResult{Stage: st, Status: protocol.StagePassed})
		}
		b, _ := json.Marshal(res)
		req, _ = http.NewRequest("POST", env["CPPATLAS_API_URL"]+"/internal/result", bytes.NewReader(b))
		req.Header.Set("Authorization", "Bearer "+env["CPPATLAS_TOKEN"])
		if resp, err := http.DefaultClient.Do(req); err == nil {
			resp.Body.Close()
		}
	}()
}

// exit: the grader process ended; auto_destroy removes the machine.
func (f *fakeFly) exit(m *fakeMachine) {
	f.mu.Lock()
	m.State = "stopped"
	if m.req.Config.AutoDestroy {
		delete(f.machines, m.ID)
	}
	f.mu.Unlock()
	m.stop()
}

func (f *fakeFly) lookup(r *http.Request) *fakeMachine {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.machines[r.PathValue("id")]
}

func (f *fakeFly) get(w http.ResponseWriter, r *http.Request) {
	m := f.lookup(r)
	if m == nil {
		http.Error(w, `{"error":"not found"}`, 404)
		return
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	json.NewEncoder(w).Encode(m.machine)
}

func (f *fakeFly) start(w http.ResponseWriter, r *http.Request) {
	m := f.lookup(r)
	if m == nil {
		http.Error(w, `{"error":"not found"}`, 404)
		return
	}
	f.mu.Lock()
	st := f.startStatus
	if st == 0 {
		m.State = "started"
	}
	f.mu.Unlock()
	if st != 0 {
		http.Error(w, `{"error":"host full"}`, st)
		return
	}
	f.launch(m)
	w.Write([]byte(`{"previous_state":"created"}`))
}

func (f *fakeFly) wait(w http.ResponseWriter, r *http.Request) {
	if r.URL.Query().Get("state") != "stopped" || r.URL.Query().Get("instance_id") == "" {
		http.Error(w, "bad wait", 400)
		return
	}
	m := f.lookup(r)
	if m == nil {
		http.Error(w, `{"error":"not found"}`, 404)
		return
	}
	select {
	case <-m.stopped:
		w.Write([]byte(`{"ok":true}`))
	case <-r.Context().Done():
	case <-time.After(time.Second):
		http.Error(w, `{"error":"deadline_exceeded"}`, 408)
	}
}

func (f *fakeFly) delete(w http.ResponseWriter, r *http.Request) {
	if r.URL.Query().Get("force") != "true" {
		http.Error(w, "force required in this test", 412)
		return
	}
	f.mu.Lock()
	m := f.machines[r.PathValue("id")]
	delete(f.machines, r.PathValue("id"))
	f.mu.Unlock()
	if m == nil {
		http.Error(w, `{"error":"not found"}`, 404)
		return
	}
	m.stop()
	w.Write([]byte(`{"ok":true}`))
}

func (f *fakeFly) list(w http.ResponseWriter, r *http.Request) {
	want := r.URL.Query().Get("metadata." + MetaManaged)
	f.mu.Lock()
	defer f.mu.Unlock()
	out := []machine{}
	for _, m := range f.machines {
		if want == "" || m.Config.Metadata[MetaManaged] == want {
			out = append(out, m.machine)
		}
	}
	json.NewEncoder(w).Encode(out)
}

func (f *fakeFly) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.machines)
}

// ------------------------------------------------------------------ setup

type env struct {
	f  *fakeFly
	rv *runs.Rendezvous
	b  *Backend
}

func setup(t *testing.T, mut func(*Config)) *env {
	t.Helper()
	f := newFakeFly(t)
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	rv := runs.NewRendezvous(runs.RendezvousConfig{}, log)
	rvSrv := httptest.NewServer(rv.Handler())
	t.Cleanup(rvSrv.Close)
	cfg := Config{
		APIBaseURL:      f.srv.URL + "/v1",
		APIToken:        "test-token",
		Image:           "registry.fly.io/cppatlas-grader:test",
		Region:          "ams",
		CallbackURL:     rvSrv.URL,
		RetryBaseDelay:  time.Millisecond,
		ExitGrace:       50 * time.Millisecond,
		JanitorInterval: -1,
	}
	if mut != nil {
		mut(&cfg)
	}
	b, err := New(cfg, rv, log)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		b.Close(ctx)
	})
	return &env{f: f, rv: rv, b: b}
}

func job() protocol.Job {
	return protocol.Job{RunID: "RUNID-abcdefghijklmnop", Challenge: "vector", Stages: []int{1},
		Files: map[string]string{"include/my/vector.hpp": "secret source"}, Limits: protocol.DefaultLimits()}
}

func closeAndWait(t *testing.T, b *Backend) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := b.Close(ctx); err != nil {
		t.Fatal(err)
	}
}

func eventually(t *testing.T, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %s", what)
		}
		time.Sleep(5 * time.Millisecond)
	}
}

// ------------------------------------------------------------------ tests

func TestNewValidation(t *testing.T) {
	rv := runs.NewRendezvous(runs.RendezvousConfig{}, nil)
	if _, err := New(Config{Image: "x"}, rv, nil); err == nil {
		t.Fatal("no token accepted")
	}
	if _, err := New(Config{APIToken: "x"}, rv, nil); err == nil {
		t.Fatal("no image accepted")
	}
	if _, err := New(Config{APIToken: "x", Image: "x", CPUKind: "gpu"}, rv, nil); err == nil {
		t.Fatal("bad cpu kind accepted")
	}
	if _, err := New(Config{APIToken: "x", Image: "x"}, nil, nil); err == nil {
		t.Fatal("nil issuer accepted")
	}
}

func TestColdRun(t *testing.T) {
	e := setup(t, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	res, err := e.b.Run(ctx, job())
	if err != nil {
		t.Fatal(err)
	}
	if res.RunID != job().RunID || !res.Passed {
		t.Fatalf("%+v", res)
	}
	closeAndWait(t, e.b)

	e.f.mu.Lock()
	defer e.f.mu.Unlock()
	if e.f.authSeen != "Bearer test-token" {
		t.Fatalf("auth %q", e.f.authSeen)
	}
	if e.f.seq != 1 {
		t.Fatalf("machines created: %d", e.f.seq)
	}
	// The machine auto-destroyed in the fake; the explicit force-destroy still happens.
	if !containsCall(e.f.calls, "DELETE /v1/apps/cppatlas-grader/machines/m001") {
		t.Fatalf("no destroy: %q", e.f.calls)
	}
	if e.rv.Len() != 0 {
		t.Fatal("token still live")
	}
}

func containsCall(calls []string, s string) bool {
	for _, c := range calls {
		if c == s {
			return true
		}
	}
	return false
}

func TestCreateRequestShape(t *testing.T) {
	e := setup(t, nil)
	e.f.behaviour = "hang"
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	go e.b.Run(ctx, job())
	eventually(t, "create", func() bool { return e.f.count() == 1 })
	e.f.mu.Lock()
	m := e.f.machines["m001"]
	raw, req := m.raw, m.req
	e.f.mu.Unlock()

	cfg := raw["config"].(map[string]any)
	if _, ok := cfg["services"]; ok {
		t.Fatal("services present")
	}
	if req.Region != "ams" || req.SkipLaunch || !strings.HasPrefix(req.Name, "cppatlas-run-") || strings.Contains(req.Name, job().RunID) {
		t.Fatalf("req %+v", req)
	}
	c := req.Config
	if c.Image != "registry.fly.io/cppatlas-grader:test" || !c.AutoDestroy || c.Restart.Policy != "no" ||
		c.Guest != (guest{CPUKind: "shared", CPUs: 4, MemoryMB: 4096}) {
		t.Fatalf("config %+v", c)
	}
	if len(c.Env) != 2 || c.Env["CPPATLAS_API_URL"] == "" || len(c.Env["CPPATLAS_TOKEN"]) != 43 {
		t.Fatalf("env %v", c.Env)
	}
	if c.Metadata[MetaManaged] != "managed" || c.Metadata[MetaRole] != "run" || c.Metadata[MetaOwner] == "" {
		t.Fatalf("metadata %v", c.Metadata)
	}
	b, _ := json.Marshal(raw)
	if strings.Contains(string(b), "secret source") || strings.Contains(string(b), job().RunID) {
		t.Fatal("submission or run id leaked into machine config")
	}
}

func TestFlyV1Token(t *testing.T) {
	e := setup(t, func(c *Config) { c.APIToken = "FlyV1 fm2_abc" })
	if _, err := e.b.Run(context.Background(), job()); err != nil {
		t.Fatal(err)
	}
	e.f.mu.Lock()
	defer e.f.mu.Unlock()
	if e.f.authSeen != "FlyV1 fm2_abc" {
		t.Fatalf("auth %q", e.f.authSeen)
	}
}

func TestCreateRetriesThenSucceeds(t *testing.T) {
	e := setup(t, nil)
	e.f.failCreate = 2
	e.f.createStatus = 429
	if _, err := e.b.Run(context.Background(), job()); err != nil {
		t.Fatal(err)
	}
	if n := e.f.callsWith("POST /v1/apps/cppatlas-grader/machines"); n != 3 {
		t.Fatalf("create attempts %d", n)
	}
}

func TestCreateFailure(t *testing.T) {
	for _, tc := range []struct {
		status, attempts int
	}{{503, 4}, {422, 1}} {
		t.Run(fmt.Sprint(tc.status), func(t *testing.T) {
			e := setup(t, nil)
			e.f.failCreate = 100
			e.f.createStatus = tc.status
			_, err := e.b.Run(context.Background(), job())
			var be *runs.BackendError
			if !errors.As(err, &be) || be.Code != runs.CodeBackendUnavailable {
				t.Fatalf("err %v", err)
			}
			if n := e.f.callsWith("POST /v1/apps/cppatlas-grader/machines"); n != tc.attempts {
				t.Fatalf("attempts %d want %d", n, tc.attempts)
			}
			if strings.Contains(err.Error(), "test-token") {
				t.Fatal("api token in error")
			}
			if strings.Contains(err.Error(), "token was ") && !strings.Contains(err.Error(), "[redacted]") {
				t.Fatalf("run token not redacted: %v", err)
			}
			if e.rv.Len() != 0 {
				t.Fatal("token not revoked")
			}
		})
	}
}

func TestTimeoutDestroys(t *testing.T) {
	e := setup(t, nil)
	e.f.behaviour = "hang"
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	_, err := e.b.Run(ctx, job())
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("err %v", err)
	}
	closeAndWait(t, e.b)
	if e.f.count() != 0 || e.f.callsWith("DELETE") != 1 {
		t.Fatalf("machines %d deletes %d", e.f.count(), e.f.callsWith("DELETE"))
	}
	if e.rv.Len() != 0 {
		t.Fatal("token live")
	}
}

func TestMachineExitsWithoutResult(t *testing.T) {
	e := setup(t, nil)
	e.f.behaviour = "silent"
	start := time.Now()
	_, err := e.b.Run(context.Background(), job())
	var be *runs.BackendError
	if !errors.As(err, &be) || be.Code != runs.CodeGraderExited {
		t.Fatalf("err %v", err)
	}
	if time.Since(start) > 3*time.Second {
		t.Fatal("did not end early")
	}
}

func TestWarmPool(t *testing.T) {
	e := setup(t, func(c *Config) { c.WarmPoolSize = 1; c.WarmRefillInterval = time.Hour })
	e.b.Start()
	eventually(t, "pool fill", func() bool { return e.b.PoolSize() == 1 })
	e.f.mu.Lock()
	m := e.f.machines["m001"]
	if !m.req.SkipLaunch || m.State != "created" || m.req.Config.Metadata[MetaRole] != "pool" || !m.req.Config.AutoDestroy {
		t.Fatalf("pool machine %+v", m.req)
	}
	slotToken := m.req.Config.Env["CPPATLAS_TOKEN"]
	e.f.mu.Unlock()
	if e.rv.Len() != 1 {
		t.Fatal("slot token not issued")
	}

	res, err := e.b.Run(context.Background(), job())
	if err != nil || !res.Passed {
		t.Fatalf("%v %+v", err, res)
	}
	if e.f.callsWith("POST /v1/apps/cppatlas-grader/machines/m001/start") != 1 {
		t.Fatal("warm machine not started")
	}
	// Replenished with a new machine and a new token; m001 destroyed.
	eventually(t, "refill", func() bool {
		e.f.mu.Lock()
		defer e.f.mu.Unlock()
		_, old := e.f.machines["m001"]
		_, fresh := e.f.machines["m002"]
		return !old && fresh && e.b.PoolSize() == 1
	})
	e.f.mu.Lock()
	if e.f.machines["m002"].req.Config.Env["CPPATLAS_TOKEN"] == slotToken {
		t.Fatal("slot token reused")
	}
	e.f.mu.Unlock()

	// Close destroys the pool machine.
	closeAndWait(t, e.b)
	if e.f.count() != 0 {
		t.Fatalf("machines left: %d", e.f.count())
	}
	if e.rv.Len() != 0 {
		t.Fatal("slot token still live after Close")
	}
}

func TestWarmStartFailureFallsBack(t *testing.T) {
	e := setup(t, func(c *Config) { c.WarmPoolSize = 1; c.WarmRefillInterval = time.Hour; c.MaxRetries = -1 })
	e.b.Start()
	eventually(t, "pool fill", func() bool { return e.b.PoolSize() == 1 })
	e.f.mu.Lock()
	e.f.startStatus = 412
	e.f.mu.Unlock()
	res, err := e.b.Run(context.Background(), job())
	if err != nil || !res.Passed {
		t.Fatalf("%v %+v", err, res)
	}
	if e.f.callsWith("/start") != 1 {
		t.Fatal("start not attempted")
	}
	e.f.mu.Lock()
	defer e.f.mu.Unlock()
	if e.f.seq < 2 {
		t.Fatal("no cold create after failed start")
	}
}

func TestWarmPoolRecyclesOld(t *testing.T) {
	var mu sync.Mutex
	now := time.Now()
	clock := func() time.Time { mu.Lock(); defer mu.Unlock(); return now }
	e := setup(t, func(c *Config) {
		c.WarmPoolSize = 1
		c.WarmRefillInterval = time.Hour
		c.WarmMaxAge = time.Hour
		c.Now = clock
	})
	e.b.Start()
	eventually(t, "pool fill", func() bool { return e.b.PoolSize() == 1 })
	mu.Lock()
	now = now.Add(2 * time.Hour)
	mu.Unlock()
	// A run finds only an expired slot: it is destroyed and the run goes cold.
	if _, err := e.b.Run(context.Background(), job()); err != nil {
		t.Fatal(err)
	}
	if e.f.callsWith("/start") != 0 {
		t.Fatal("expired slot was started")
	}
	eventually(t, "old slot destroyed", func() bool {
		e.f.mu.Lock()
		defer e.f.mu.Unlock()
		_, ok := e.f.machines["m001"]
		return !ok
	})
}

func TestJanitor(t *testing.T) {
	e := setup(t, func(c *Config) { c.Owner = "me" })
	now := time.Now()
	add := func(id, role, owner string, age time.Duration, managed bool) {
		m := &fakeMachine{stopped: make(chan struct{})}
		m.ID = id
		m.State = "started"
		m.CreatedAt = now.Add(-age)
		m.Config.Metadata = map[string]string{MetaRole: role, MetaOwner: owner}
		if managed {
			m.Config.Metadata[MetaManaged] = "managed"
		}
		e.f.machines[id] = m
	}
	add("old-run-foreign", "run", "other", 10*time.Minute, true)
	add("old-run-mine", "run", "me", 6*time.Minute, true)
	add("young-run", "run", "other", time.Minute, true)
	add("old-pool-foreign", "pool", "other", 2*time.Minute, true)
	add("young-pool", "pool", "other", 10*time.Second, true)
	add("unmanaged", "run", "", time.Hour, false)
	add("tracked", "run", "me", time.Hour, true)
	e.b.track("tracked")

	n, err := e.b.Janitor(context.Background())
	if err != nil || n != 3 {
		t.Fatalf("destroyed %d err %v", n, err)
	}
	e.f.mu.Lock()
	defer e.f.mu.Unlock()
	for _, id := range []string{"young-run", "young-pool", "unmanaged", "tracked"} {
		if _, ok := e.f.machines[id]; !ok {
			t.Errorf("%s destroyed", id)
		}
	}
	for _, id := range []string{"old-run-foreign", "old-run-mine", "old-pool-foreign"} {
		if _, ok := e.f.machines[id]; ok {
			t.Errorf("%s kept", id)
		}
	}
}

func TestJanitorLoopRunsOnStart(t *testing.T) {
	e := setup(t, func(c *Config) { c.JanitorInterval = time.Hour })
	m := &fakeMachine{stopped: make(chan struct{})}
	m.ID = "leftover"
	m.CreatedAt = time.Now().Add(-time.Hour)
	m.Config.Metadata = map[string]string{MetaManaged: "managed", MetaRole: "run"}
	e.f.mu.Lock()
	e.f.machines["leftover"] = m
	e.f.mu.Unlock()
	e.b.Start()
	eventually(t, "janitor", func() bool { return e.f.count() == 0 })
}

// Through the Manager: concurrent runs, each its own machine, all cleaned up.
func TestManagerIntegration(t *testing.T) {
	e := setup(t, nil)
	m := runs.NewManager(runs.Config{Rendezvous: e.rv, MaxPerClient: -1, MaxConcurrent: 3}, e.b, slog.New(slog.NewTextHandler(io.Discard, nil)))
	var ids []string
	for range 6 {
		v, err := m.Submit(context.Background(), protocol.Submission{Challenge: "vector", Source: protocol.SourceWeb,
			Files: map[string]string{"include/my/vector.hpp": "x"}})
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, v.ID)
	}
	for _, id := range ids {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		v, err := m.Wait(ctx, id)
		cancel()
		if err != nil || v.Status != protocol.RunCompleted || !v.Result.Passed {
			t.Fatalf("%v %+v", err, v)
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	m.Shutdown(ctx)
	closeAndWait(t, e.b)
	if e.f.count() != 0 || e.rv.Len() != 0 {
		t.Fatalf("leftovers: machines %d tokens %d", e.f.count(), e.rv.Len())
	}
}
