package runs

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"testing"
	"time"

	"cppatlas.com/runner/internal/protocol"
)

// ------------------------------------------------------------ queue shares

func TestSourceQueueShare(t *testing.T) {
	b := newBlocking()
	// QueueSize 4: web may hold 3 waiting slots, GitHub 2 (defaults 3/4, 1/2).
	m := newTestManager(t, Config{MaxConcurrent: 1, QueueSize: 4, MaxPerClient: -1}, b)
	web, gh := sub(), sub()
	gh.Source = protocol.SourceGitHub

	first, err := m.Submit(context.Background(), web)
	if err != nil {
		t.Fatal(err)
	}
	recv(t, b.started) // running: no longer counts against the web share
	for i := range 3 {
		if _, err := m.Submit(context.Background(), web); err != nil {
			t.Fatalf("web %d: %v", i, err)
		}
	}
	if _, err := m.Submit(context.Background(), web); !errors.Is(err, protocol.ErrQueueFull) {
		t.Fatalf("web beyond its share: %v", err)
	}
	// GitHub still gets the slot web could not take.
	if _, err := m.Submit(context.Background(), gh); err != nil {
		t.Fatalf("github starved by web: %v", err)
	}
	if st := m.Stats(); st.QueuedWeb != 3 || st.QueuedGitHub != 1 || st.Queued != 4 {
		t.Fatalf("stats %+v", st)
	}
	close(b.release)
	waitView(t, m, first.ID)
	deadline := time.Now().Add(5 * time.Second)
	for m.Stats().Queued != 0 || m.Stats().QueuedWeb != 0 || m.Stats().QueuedGitHub != 0 {
		if time.Now().After(deadline) {
			t.Fatalf("shares not released: %+v", m.Stats())
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func TestGitHubQueueShare(t *testing.T) {
	b := newBlocking()
	m := newTestManager(t, Config{MaxConcurrent: 1, QueueSize: 4, MaxPerClient: -1}, b)
	web, gh := sub(), sub()
	gh.Source = protocol.SourceGitHub
	if _, err := m.Submit(context.Background(), gh); err != nil {
		t.Fatal(err)
	}
	recv(t, b.started)
	for range 2 {
		if _, err := m.Submit(context.Background(), gh); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := m.Submit(context.Background(), gh); !errors.Is(err, protocol.ErrQueueFull) {
		t.Fatalf("github beyond its share: %v", err)
	}
	if _, err := m.Submit(context.Background(), web); err != nil {
		t.Fatalf("web starved by github: %v", err)
	}
	close(b.release)
}

func TestShareReleasedOnShutdownDrain(t *testing.T) {
	b := newBlocking()
	m := NewManager(Config{MaxConcurrent: 1, QueueSize: 4, MaxPerClient: -1}, b, testLogger())
	m.Submit(context.Background(), sub())
	recv(t, b.started)
	m.Submit(context.Background(), sub())
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := m.Shutdown(ctx); err != nil {
		t.Fatal(err)
	}
	if st := m.Stats(); st.QueuedWeb != 0 || st.Queued != 0 {
		t.Fatalf("stats after shutdown %+v", st)
	}
}

// ------------------------------------------------------------ global rate

func TestGlobalRunRate(t *testing.T) {
	clk := newClock()
	// 6 per 10 min = one per 100 s, burst 2.
	m := newTestManager(t, Config{GlobalRunsPer10Min: 6, GlobalRunsBurst: 2, MaxPerClient: -1, Now: clk.Now}, &fakeBackend{})
	for i := range 2 {
		if _, err := m.Submit(context.Background(), sub()); err != nil {
			t.Fatalf("%d: %v", i, err)
		}
	}
	gh := sub()
	gh.Source = protocol.SourceGitHub
	for _, s := range []protocol.Submission{sub(), gh} {
		_, err := m.Submit(context.Background(), s)
		if !errors.Is(err, ErrGlobalRate) || !errors.Is(err, protocol.ErrQueueFull) {
			t.Fatalf("%s: want ErrGlobalRate wrapping ErrQueueFull, got %v", s.Source, err)
		}
	}
	// Validation failures and rejections do not consume budget.
	clk.Add(100 * time.Second)
	if _, err := m.Submit(context.Background(), sub()); err != nil {
		t.Fatalf("after refill: %v", err)
	}
	if _, err := m.Submit(context.Background(), sub()); !errors.Is(err, ErrGlobalRate) {
		t.Fatalf("second after refill: %v", err)
	}
}

func TestGlobalRunRateDisabled(t *testing.T) {
	m := newTestManager(t, Config{GlobalRunsPer10Min: -1, GlobalRunsBurst: 1, MaxPerClient: -1, QueueSize: 100, MaxQueuedWeb: -1}, &fakeBackend{})
	for i := range 50 {
		v, err := m.Submit(context.Background(), sub())
		if err != nil {
			t.Fatalf("%d: %v", i, err)
		}
		waitView(t, m, v.ID)
	}
}

// ------------------------------------------------------------ stored bytes

func bigResult(job protocol.Job, n int) *protocol.Result {
	r := passing(job)
	r.Stages[0].Output = strings.Repeat("o", n)
	return r
}

func TestStoredBytesBudget(t *testing.T) {
	b := &fakeBackend{fn: func(_ context.Context, j protocol.Job) (*protocol.Result, error) {
		return bigResult(j, 60<<10), nil
	}}
	m := newTestManager(t, Config{MaxStoredBytes: 200 << 10, MaxStoredRuns: 1000, MaxPerClient: -1}, b)
	var ids []string
	for range 6 {
		s := sub()
		s.Stages = []int{1}
		v, err := m.Submit(context.Background(), s)
		if err != nil {
			t.Fatal(err)
		}
		waitView(t, m, v.ID)
		ids = append(ids, v.ID)
	}
	st := m.Stats()
	if st.StoredBytes > 200<<10 || st.Stored != 3 {
		t.Fatalf("stats %+v", st)
	}
	for i, id := range ids {
		_, ok := m.Get(id)
		if want := i >= 3; ok != want {
			t.Fatalf("run %d present=%v", i, ok)
		}
	}
	// Removing everything returns the counter to zero.
	m.mu.Lock()
	for e := m.finished.Front(); e != nil; e = m.finished.Front() {
		m.removeLocked(e.Value.(*run))
	}
	left := m.stored
	m.mu.Unlock()
	if left != 0 {
		t.Fatalf("stored bytes leak: %d", left)
	}
}

func TestStoredBytesKeepsNewest(t *testing.T) {
	b := &fakeBackend{fn: func(_ context.Context, j protocol.Job) (*protocol.Result, error) {
		return bigResult(j, 60<<10), nil
	}}
	m := newTestManager(t, Config{MaxStoredBytes: 1 << 10, MaxPerClient: -1}, b)
	for range 2 {
		s := sub()
		s.Stages = []int{1}
		v, _ := m.Submit(context.Background(), s)
		if fin := waitView(t, m, v.ID); fin.Result == nil {
			t.Fatal("no result")
		}
		if _, ok := m.Get(v.ID); !ok {
			t.Fatal("newest evicted")
		}
	}
	if st := m.Stats(); st.Stored != 1 {
		t.Fatalf("stored %d", st.Stored)
	}
}

func TestDefaultsTightened(t *testing.T) {
	c := Config{}.withDefaults()
	if c.MaxStoredRuns != 500 || c.MaxStoredBytes != 64<<20 || c.MaxResultBytes != 512<<10 ||
		c.Limits.TraceBytes != 64<<10 || c.MaxQueuedWeb != 15 || c.MaxQueuedGitHub != 10 ||
		c.GlobalRunsPer10Min != 120 || c.GlobalRunsBurst != 40 {
		t.Fatalf("%+v", c)
	}
	c = Config{QueueSize: 1}.withDefaults()
	if c.MaxQueuedWeb != 1 || c.MaxQueuedGitHub != 1 {
		t.Fatalf("tiny queue shares %d %d", c.MaxQueuedWeb, c.MaxQueuedGitHub)
	}
	c = Config{QueueSize: 5, MaxQueuedWeb: 99, MaxQueuedGitHub: -1}.withDefaults()
	if c.MaxQueuedWeb != 5 || c.MaxQueuedGitHub != 5 {
		t.Fatalf("clamp %d %d", c.MaxQueuedWeb, c.MaxQueuedGitHub)
	}
}

// ------------------------------------------------------------ result shrink

func encodedLen(t *testing.T, r *protocol.Result) int {
	t.Helper()
	b, err := json.Marshal(r)
	if err != nil {
		t.Fatal(err)
	}
	return len(b)
}

func hugeResult(runID string) *protocol.Result {
	r := &protocol.Result{RunID: runID, Status: protocol.ResultCompleted}
	ev := json.RawMessage(`{"e":"` + strings.Repeat("t", 1000) + `"}`)
	for st := 1; st <= 8; st++ {
		s := protocol.StageResult{Stage: st, Status: protocol.StageFailed,
			Output:  strings.Repeat("o", 64<<10),
			Compile: &protocol.CompileSummary{Output: strings.Repeat("c", 64<<10)}}
		for range 200 {
			s.Trace = append(s.Trace, ev)
		}
		for i := range 600 {
			tc := protocol.TestCase{Name: strings.Repeat("n", 600), Status: protocol.StagePassed}
			if i%50 == 0 {
				tc.Status = protocol.StageFailed
				for range 25 {
					tc.Messages = append(tc.Messages, strings.Repeat("m", 2500))
				}
			}
			s.Tests = append(s.Tests, tc)
		}
		r.Stages = append(r.Stages, s)
	}
	return r
}

func TestSanitizeClampsAndShrinks(t *testing.T) {
	stages := []int{1, 2, 3, 4, 5, 6, 7, 8}
	lim := Config{}.withDefaults().Limits
	out, err := clampResult(hugeResult("r"), "r", "vector", stages, lim)
	if err != nil {
		t.Fatal(err)
	}
	s := out.Stages[0]
	if len(s.Tests) != capTests || len(s.Tests[0].Messages) != capMessages ||
		len(s.Tests[0].Messages[0]) != capTestMessage || len(s.Tests[0].Name) != capTestName {
		t.Fatalf("per-stage clamps: tests %d msgs %d msglen %d", len(s.Tests), len(s.Tests[0].Messages), len(s.Tests[0].Messages[0]))
	}
	if n := encodedLen(t, &protocol.Result{Stages: []protocol.StageResult{{Trace: s.Trace}}}); n > lim.TraceBytes+1024 {
		t.Fatalf("trace %d bytes", n)
	}

	res, size, err := sanitizeResult(hugeResult("r"), "r", "vector", stages, lim, 512<<10)
	if err != nil {
		t.Fatal(err)
	}
	if size > 512<<10 || size != encodedLen(t, res) {
		t.Fatalf("size %d (encoded %d)", size, encodedLen(t, res))
	}
	for _, st := range res.Stages {
		if st.Trace != nil || !st.TraceTruncated {
			t.Fatal("traces should be dropped first")
		}
	}
}

func TestShrinkOrder(t *testing.T) {
	mk := func() *protocol.Result {
		return &protocol.Result{RunID: "r", Status: protocol.ResultCompleted, Stages: []protocol.StageResult{{
			Stage: 1, Status: protocol.StageFailed, Output: strings.Repeat("o", 20<<10),
			Trace: []json.RawMessage{json.RawMessage(`{"x":"` + strings.Repeat("t", 30<<10) + `"}`)},
			Tests: []protocol.TestCase{
				{Name: "p", Status: protocol.StagePassed},
				{Name: "f", Status: protocol.StageFailed, Messages: []string{"a", "b", "c", "d"}},
			},
		}}}
	}
	// Room for everything but the trace: only the trace goes.
	r := mk()
	if _, err := shrinkResult(r, 25<<10); err != nil {
		t.Fatal(err)
	}
	if st := r.Stages[0]; st.Trace != nil || len(st.Output) != 20<<10 || len(st.Tests) != 2 || len(st.Tests[1].Messages) != 4 {
		t.Fatalf("over-shrunk: %+v", st.Tests)
	}
	// Tighter: outputs are capped, tests kept.
	r = mk()
	if _, err := shrinkResult(r, 4<<10); err != nil {
		t.Fatal(err)
	}
	if st := r.Stages[0]; len(st.Output) != 1<<10 || !st.OutputTruncated || len(st.Tests) != 2 {
		t.Fatalf("outputs: %d tests %d", len(st.Output), len(st.Tests))
	}
	// Impossible: error, which the Manager turns into bad_result.
	if _, err := shrinkResult(mk(), 10); err == nil {
		t.Fatal("unshrinkable result accepted")
	}
}

func TestOversizedResultBecomesBadResult(t *testing.T) {
	b := &fakeBackend{fn: func(_ context.Context, j protocol.Job) (*protocol.Result, error) {
		r := passing(j)
		for i := range r.Stages {
			r.Stages[i].Hint = strings.Repeat("h", 1000)
		}
		return r, nil
	}}
	m := newTestManager(t, Config{MaxResultBytes: 1 << 10}, b)
	v, _ := m.Submit(context.Background(), sub())
	if fin := waitView(t, m, v.ID); fin.Status != protocol.RunFailed || fin.Error.Code != CodeBadResult {
		t.Fatalf("%+v", fin)
	}
}

// ------------------------------------------------------------ peer binding

func peerReq(method, path, token, remote string, body []byte) *http.Request {
	r := httptest.NewRequest(method, path, bytes.NewReader(body))
	r.RemoteAddr = remote
	r.Header.Set("Authorization", "Bearer "+token)
	return r
}

func serve(h http.Handler, r *http.Request) int {
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w.Code
}

func TestPeerBinding(t *testing.T) {
	rv := NewRendezvous(RendezvousConfig{AllowRequest: AllowAny}, testLogger())
	h := rv.Handler()
	tk, _ := rv.Issue(testJob(), time.Now().Add(time.Minute))
	tk.ExpectPeer()
	if !tk.BindPeer(netip.MustParseAddr("fdaa:0:1:a7b::2")) {
		t.Fatal("bind not applied")
	}
	good, bad := "[fdaa:0:1:a7b::2]:5000", "[fdaa:0:1:a7b::3]:5000"
	unknown := serve(h, peerReq("GET", "/internal/job", strings.Repeat("x", 43), good, nil))

	// Wrong peer: 404, indistinguishable from an unknown token, and the job
	// stays fetchable by the right peer.
	if c := serve(h, peerReq("GET", "/internal/job", tk.Token(), bad, nil)); c != unknown || c != 404 {
		t.Fatalf("wrong peer job: %d (unknown token: %d)", c, unknown)
	}
	if c := serve(h, peerReq("GET", "/internal/job", tk.Token(), good, nil)); c != 200 {
		t.Fatalf("right peer job: %d", c)
	}
	if c := serve(h, peerReq("POST", "/internal/result", tk.Token(), bad, resultBody("run-1"))); c != 404 {
		t.Fatalf("wrong peer result: %d", c)
	}
	if c := serve(h, peerReq("POST", "/internal/result", tk.Token(), good, resultBody("run-1"))); c != 204 {
		t.Fatalf("right peer result: %d", c)
	}
	// Revoked: the wrong peer still sees 404, not 410.
	tk.Revoke()
	if c := serve(h, peerReq("GET", "/internal/job", tk.Token(), bad, nil)); c != 404 {
		t.Fatalf("wrong peer after revoke: %d", c)
	}
	if c := serve(h, peerReq("GET", "/internal/job", tk.Token(), good, nil)); c != 410 {
		t.Fatalf("right peer after revoke: %d", c)
	}
}

func TestPeerBindingIPv4Mapped(t *testing.T) {
	rv := NewRendezvous(RendezvousConfig{AllowRequest: AllowAny}, testLogger())
	tk, _ := rv.Issue(testJob(), time.Now().Add(time.Minute))
	tk.ExpectPeer()
	tk.BindPeer(netip.MustParseAddr("::ffff:10.0.0.7"))
	if c := serve(rv.Handler(), peerReq("GET", "/internal/job", tk.Token(), "10.0.0.7:1", nil)); c != 200 {
		t.Fatalf("mapped peer: %d", c)
	}
}

func TestPeerBindingRace(t *testing.T) {
	rv := NewRendezvous(RendezvousConfig{AllowRequest: AllowAny, PeerBindWait: 5 * time.Second}, testLogger())
	h := rv.Handler()
	tk, _ := rv.Issue(testJob(), time.Now().Add(time.Minute))
	tk.ExpectPeer()
	// The machine fetches before the create response was processed.
	got := make(chan int, 1)
	go func() { got <- serve(h, peerReq("GET", "/internal/job", tk.Token(), "[fdaa::2]:1", nil)) }()
	select {
	case c := <-got:
		t.Fatalf("pending fetch answered early: %d", c)
	case <-time.After(50 * time.Millisecond):
	}
	tk.BindPeer(netip.MustParseAddr("fdaa::2"))
	select {
	case c := <-got:
		if c != 200 {
			t.Fatalf("fetch after bind: %d", c)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("fetch not released by bind")
	}
}

func TestPeerBindingRaceWrongPeerAndTimeout(t *testing.T) {
	rv := NewRendezvous(RendezvousConfig{AllowRequest: AllowAny, PeerBindWait: 100 * time.Millisecond}, testLogger())
	h := rv.Handler()
	tk, _ := rv.Issue(testJob(), time.Now().Add(time.Minute))
	tk.ExpectPeer()
	// No bind arrives: refused after the bounded wait, never served unbound.
	start := time.Now()
	if c := serve(h, peerReq("GET", "/internal/job", tk.Token(), "[fdaa::9]:1", nil)); c != 404 {
		t.Fatalf("timeout: %d", c)
	}
	if d := time.Since(start); d < 90*time.Millisecond || d > 3*time.Second {
		t.Fatalf("wait %v", d)
	}
	// Racing fetch from the wrong peer is refused once the bind arrives.
	got := make(chan int, 1)
	go func() { got <- serve(h, peerReq("GET", "/internal/job", tk.Token(), "[fdaa::9]:1", nil)) }()
	time.Sleep(20 * time.Millisecond)
	tk.BindPeer(netip.MustParseAddr("fdaa::2"))
	if c := <-got; c != 404 {
		t.Fatalf("wrong peer after race: %d", c)
	}
	if c := serve(h, peerReq("GET", "/internal/job", tk.Token(), "[fdaa::2]:1", nil)); c != 200 {
		t.Fatalf("right peer: %d", c)
	}
}

func TestPeerSkipAndRevokeWakeWaiters(t *testing.T) {
	rv := NewRendezvous(RendezvousConfig{AllowRequest: AllowAny, PeerBindWait: 5 * time.Second}, testLogger())
	h := rv.Handler()

	// SkipPeer (no private_ip): behaves as unbound.
	tk, _ := rv.Issue(testJob(), time.Now().Add(time.Minute))
	tk.ExpectPeer()
	go func() { time.Sleep(20 * time.Millisecond); tk.SkipPeer() }()
	if c := serve(h, peerReq("GET", "/internal/job", tk.Token(), "[fdaa::5]:1", nil)); c != 200 {
		t.Fatalf("after skip: %d", c)
	}
	// Invalid address = skip.
	tk2, _ := rv.Issue(testJob(), time.Now().Add(time.Minute))
	tk2.ExpectPeer()
	if tk2.BindPeer(netip.Addr{}) {
		t.Fatal("invalid address bound")
	}
	if c := serve(h, peerReq("GET", "/internal/job", tk2.Token(), "10.1.1.1:1", nil)); c != 200 {
		t.Fatalf("invalid bind: %d", c)
	}

	// Revoke wakes a pending waiter at once (410).
	tk3, _ := rv.Issue(testJob(), time.Now().Add(time.Minute))
	tk3.ExpectPeer()
	go func() { time.Sleep(20 * time.Millisecond); tk3.Revoke() }()
	start := time.Now()
	if c := serve(h, peerReq("GET", "/internal/job", tk3.Token(), "[fdaa::5]:1", nil)); c != 410 {
		t.Fatalf("revoked while pending: %d", c)
	}
	if time.Since(start) > 2*time.Second {
		t.Fatal("revoke did not wake the waiter")
	}

	// No ExpectPeer at all (docker / FLY_BIND_PEER=false): unchanged behaviour.
	tk4, _ := rv.Issue(testJob(), time.Now().Add(time.Minute))
	if c := serve(h, peerReq("GET", "/internal/job", tk4.Token(), "[fdaa::7]:1", nil)); c != 200 {
		t.Fatalf("unbound: %d", c)
	}
}
