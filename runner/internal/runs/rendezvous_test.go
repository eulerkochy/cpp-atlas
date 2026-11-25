package runs

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"cppatlas.com/runner/internal/protocol"
)

func newRV(t *testing.T, clk *clock) (*Rendezvous, *httptest.Server) {
	t.Helper()
	cfg := RendezvousConfig{MaxResultBytes: 4096}
	if clk != nil {
		cfg.Now = clk.Now
	}
	rv := NewRendezvous(cfg, testLogger())
	srv := httptest.NewServer(rv.Handler()) // 127.0.0.1: allowed by PrivateNetworkOnly
	t.Cleanup(srv.Close)
	return rv, srv
}

func do(t *testing.T, srv *httptest.Server, method, path, token string, body []byte, hdr ...string) (int, []byte) {
	t.Helper()
	req, _ := http.NewRequest(method, srv.URL+path, bytes.NewReader(body))
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	for i := 0; i+1 < len(hdr); i += 2 {
		req.Header.Set(hdr[i], hdr[i+1])
	}
	resp, err := srv.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var buf bytes.Buffer
	buf.ReadFrom(resp.Body)
	return resp.StatusCode, buf.Bytes()
}

func testJob() protocol.Job {
	return protocol.Job{RunID: "run-1", Challenge: "vector", Stages: []int{1},
		Files: map[string]string{"include/my/vector.hpp": "x"}, Limits: protocol.DefaultLimits()}
}

func resultBody(runID string) []byte {
	b, _ := json.Marshal(protocol.Result{RunID: runID, Status: protocol.ResultCompleted, Passed: true})
	return b
}

func TestRendezvousHappyPathAndReplay(t *testing.T) {
	rv, srv := newRV(t, nil)
	tk, err := rv.Issue(testJob(), time.Now().Add(time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	if len(tk.Token()) != 43 {
		t.Fatalf("token length %d", len(tk.Token()))
	}
	// Result before fetch: 409.
	if code, _ := do(t, srv, "POST", "/internal/result", tk.Token(), resultBody("run-1")); code != 409 {
		t.Fatalf("result before fetch: %d", code)
	}
	code, body := do(t, srv, "GET", "/internal/job", tk.Token(), nil)
	if code != 200 {
		t.Fatalf("fetch: %d", code)
	}
	var job protocol.Job
	if err := json.Unmarshal(body, &job); err != nil || job.RunID != "run-1" || job.Files["include/my/vector.hpp"] != "x" {
		t.Fatalf("job %v %+v", err, job)
	}
	if code, _ := do(t, srv, "GET", "/internal/job", tk.Token(), nil); code != 410 {
		t.Fatalf("second fetch: %d", code)
	}
	if code, _ := do(t, srv, "POST", "/internal/result", tk.Token(), resultBody("run-2")); code != 400 {
		t.Fatalf("wrong run id: %d", code)
	}
	if code, _ := do(t, srv, "POST", "/internal/result", tk.Token(), []byte("{not json")); code != 400 {
		t.Fatalf("bad json: %d", code)
	}
	if code, _ := do(t, srv, "POST", "/internal/result", tk.Token(), resultBody("run-1")); code != 204 {
		t.Fatalf("result: %d", code)
	}
	if code, _ := do(t, srv, "POST", "/internal/result", tk.Token(), resultBody("run-1")); code != 410 {
		t.Fatalf("replayed result: %d", code)
	}
	res, err := tk.Wait(context.Background())
	if err != nil || res.RunID != "run-1" || !res.Passed {
		t.Fatalf("wait %v %+v", err, res)
	}
	tk.Revoke()
	tk.Revoke()
	if code, _ := do(t, srv, "GET", "/internal/job", tk.Token(), nil); code != 410 {
		t.Fatalf("after revoke: %d", code)
	}
	if rv.Len() != 0 {
		t.Fatalf("live tickets %d", rv.Len())
	}
}

func TestRendezvousRejects(t *testing.T) {
	rv, srv := newRV(t, nil)
	tk, _ := rv.Issue(testJob(), time.Now().Add(time.Minute))
	cases := []struct {
		name, method, path, token string
		hdr                       []string
		want                      int
	}{
		{"no auth", "GET", "/internal/job", "", nil, 401},
		{"short token", "GET", "/internal/job", "abc", nil, 401},
		{"unknown token", "GET", "/internal/job", strings.Repeat("A", 43), nil, 404},
		{"prefix of token", "GET", "/internal/job", tk.Token()[:42], nil, 404},
		{"wrong method job", "POST", "/internal/job", tk.Token(), nil, 405},
		{"wrong method result", "GET", "/internal/result", tk.Token(), nil, 405},
		{"other path", "GET", "/internal/other", tk.Token(), nil, 404},
		{"via fly proxy", "GET", "/internal/job", tk.Token(), []string{"Fly-Client-IP", "1.2.3.4"}, 404},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if code, _ := do(t, srv, tc.method, tc.path, tc.token, nil, tc.hdr...); code != tc.want {
				t.Fatalf("got %d want %d", code, tc.want)
			}
		})
	}
	// None of the above consumed the job.
	if code, _ := do(t, srv, "GET", "/internal/job", tk.Token(), nil); code != 200 {
		t.Fatalf("fetch after rejects: %d", code)
	}
}

func TestRendezvousOversizedBody(t *testing.T) {
	rv, srv := newRV(t, nil)
	tk, _ := rv.Issue(testJob(), time.Now().Add(time.Minute))
	do(t, srv, "GET", "/internal/job", tk.Token(), nil)
	big, _ := json.Marshal(protocol.Result{RunID: "run-1", Status: "completed", Compiler: strings.Repeat("x", 5000)})
	if code, _ := do(t, srv, "POST", "/internal/result", tk.Token(), big); code != 413 {
		t.Fatalf("oversized: %d", code)
	}
	if code, _ := do(t, srv, "POST", "/internal/result", tk.Token(), resultBody("run-1")); code != 204 {
		t.Fatalf("after oversized: %d", code)
	}
}

func TestRendezvousExpiry(t *testing.T) {
	clk := newClock()
	rv, srv := newRV(t, clk)
	tk, _ := rv.Issue(testJob(), clk.Now().Add(time.Minute))
	clk.Add(61 * time.Second)
	if code, _ := do(t, srv, "GET", "/internal/job", tk.Token(), nil); code != 410 {
		t.Fatalf("expired fetch: %d", code)
	}
	if _, err := tk.Wait(context.Background()); !errors.Is(err, ErrTicketGone) {
		t.Fatalf("wait expired: %v", err)
	}
	// Tombstones are forgotten after TombstoneTTL: then 404.
	clk.Add(11 * time.Minute)
	rv.Sweep()
	if code, _ := do(t, srv, "GET", "/internal/job", tk.Token(), nil); code != 404 {
		t.Fatalf("after tombstone ttl: %d", code)
	}
}

func TestRendezvousWaitRevokeAndCtx(t *testing.T) {
	rv, _ := newRV(t, nil)
	tk, _ := rv.Issue(testJob(), time.Now().Add(time.Minute))
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()
	if _, err := tk.Wait(ctx); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("ctx: %v", err)
	}
	go func() { time.Sleep(10 * time.Millisecond); tk.Revoke() }()
	if _, err := tk.Wait(context.Background()); !errors.Is(err, ErrTicketGone) {
		t.Fatalf("revoked: %v", err)
	}
	// Real-time expiry inside Wait.
	tk2, _ := rv.Issue(testJob(), time.Now().Add(20*time.Millisecond))
	if _, err := tk2.Wait(context.Background()); !errors.Is(err, ErrTicketGone) {
		t.Fatalf("expiry in wait: %v", err)
	}
}

func TestRendezvousSlotBinding(t *testing.T) {
	rv, srv := newRV(t, nil)
	slot, _ := rv.IssueSlot(time.Now().Add(time.Hour))
	if code, _ := do(t, srv, "GET", "/internal/job", slot.Token(), nil); code != 404 {
		t.Fatalf("unbound fetch: %d", code)
	}
	if _, err := slot.Wait(context.Background()); !errors.Is(err, ErrTicketNotBound) {
		t.Fatalf("wait unbound: %v", err)
	}
	if err := slot.Bind(testJob(), time.Now().Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	if err := slot.Bind(testJob(), time.Now().Add(time.Minute)); !errors.Is(err, ErrTicketBound) {
		t.Fatalf("rebind: %v", err)
	}
	if code, _ := do(t, srv, "GET", "/internal/job", slot.Token(), nil); code != 200 {
		t.Fatalf("bound fetch: %d", code)
	}
	revoked, _ := rv.IssueSlot(time.Now().Add(time.Hour))
	revoked.Revoke()
	if err := revoked.Bind(testJob(), time.Now().Add(time.Minute)); !errors.Is(err, ErrTicketGone) {
		t.Fatalf("bind revoked: %v", err)
	}
}

func TestRendezvousConcurrent(t *testing.T) {
	rv, srv := newRV(t, nil)
	const n = 20
	var tickets []*Ticket
	for i := range n {
		j := testJob()
		j.RunID = "run-" + string(rune('a'+i))
		tk, _ := rv.Issue(j, time.Now().Add(time.Minute))
		tickets = append(tickets, tk)
	}
	var fetched, resulted atomic.Int32
	var wg sync.WaitGroup
	for _, tk := range tickets {
		for range 8 {
			wg.Add(1)
			go func() {
				defer wg.Done()
				if code, _ := do(t, srv, "GET", "/internal/job", tk.Token(), nil); code == 200 {
					fetched.Add(1)
				}
			}()
		}
	}
	wg.Wait()
	for i, tk := range tickets {
		runID := "run-" + string(rune('a'+i))
		for range 8 {
			wg.Add(1)
			go func() {
				defer wg.Done()
				if code, _ := do(t, srv, "POST", "/internal/result", tk.Token(), resultBody(runID)); code == 204 {
					resulted.Add(1)
				}
			}()
		}
		wg.Add(1)
		go func() { defer wg.Done(); _, _ = tk.Wait(context.Background()); rv.Len() }()
	}
	wg.Wait()
	if fetched.Load() != n || resulted.Load() != n {
		t.Fatalf("fetched %d resulted %d, want %d each", fetched.Load(), resulted.Load(), n)
	}
}

func TestPrivateNetworkOnly(t *testing.T) {
	cases := map[string]bool{
		"127.0.0.1:1":             true,
		"[::1]:1":                 true,
		"10.0.0.1:1":              true,
		"172.16.5.4:1":            true,
		"192.168.1.1:1":           true,
		"[fdaa:0:1:a7b::2]:12345": true,
		"8.8.8.8:1":               false,
		"[2001:db8::1]:1":         false,
		"garbage":                 false,
	}
	for addr, want := range cases {
		r := httptest.NewRequest("GET", "/internal/job", nil)
		r.RemoteAddr = addr
		if got := PrivateNetworkOnly(r); got != want {
			t.Errorf("%s: got %v want %v", addr, got, want)
		}
	}
	r := httptest.NewRequest("GET", "/internal/job", nil)
	r.RemoteAddr = "172.16.0.2:1"
	r.Header.Set("Fly-Forwarded-Port", "443")
	if PrivateNetworkOnly(r) {
		t.Error("fly-proxied request allowed")
	}
}

// End to end through the Manager with a backend that behaves like the Fly
// backend (issues a ticket, a goroutine plays the grader over HTTP).
func TestManagerWithRendezvousBackend(t *testing.T) {
	rv := NewRendezvous(RendezvousConfig{}, testLogger())
	var srvURL atomic.Value
	b := &fakeBackend{fn: func(ctx context.Context, job protocol.Job) (*protocol.Result, error) {
		dl, _ := ctx.Deadline()
		tk, err := rv.Issue(job, dl)
		if err != nil {
			return nil, err
		}
		defer tk.Revoke()
		go func() { // the "grader"
			base := srvURL.Load().(string)
			req, _ := http.NewRequest("GET", base+"/internal/job", nil)
			req.Header.Set("Authorization", "Bearer "+tk.Token())
			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				return
			}
			var j protocol.Job
			json.NewDecoder(resp.Body).Decode(&j)
			resp.Body.Close()
			req, _ = http.NewRequest("POST", base+"/internal/result", bytes.NewReader(mustJSON(passing(j))))
			req.Header.Set("Authorization", "Bearer "+tk.Token())
			if resp, err := http.DefaultClient.Do(req); err == nil {
				resp.Body.Close()
			}
		}()
		return tk.Wait(ctx)
	}}
	m := newTestManager(t, Config{Rendezvous: rv}, b)
	srv := httptest.NewServer(m.InternalHandler())
	defer srv.Close()
	srvURL.Store(srv.URL)
	v, err := m.Submit(context.Background(), sub())
	if err != nil {
		t.Fatal(err)
	}
	fin := waitView(t, m, v.ID)
	if fin.Status != protocol.RunCompleted || !fin.Result.Passed {
		t.Fatalf("%+v", fin)
	}
	if rv.Len() != 0 {
		t.Fatal("ticket not revoked")
	}
}

func mustJSON(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return b
}
