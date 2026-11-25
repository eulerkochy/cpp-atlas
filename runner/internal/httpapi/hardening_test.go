package httpapi

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"sync"
	"testing"
	"time"

	"cppatlas.com/runner/internal/protocol"
)

// A1: the per-client run cap key is the same /64 the rate limiter uses.
func TestSubmitClientKeyIsRateKey(t *testing.T) {
	f := newFake()
	h := newAPI(f, func(o *Options) { o.TrustedProxy = TrustedProxyFly })
	for _, ip := range []string{"2001:db8:1:2::1", "2001:db8:1:2:dead:beef:0:7", "203.0.113.9", "::ffff:203.0.113.9"} {
		if w := do(h, "POST", "/runs", okBody, map[string]string{"Content-Type": "application/json", "Fly-Client-IP": ip}); w.Code != 202 {
			t.Fatalf("%s: %d", ip, w.Code)
		}
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	want := []string{"2001:db8:1:2::/64", "2001:db8:1:2::/64", "203.0.113.9", "203.0.113.9"}
	for i, s := range f.got {
		if s.ClientKey != want[i] {
			t.Errorf("submission %d: key %q want %q", i, s.ClientKey, want[i])
		}
	}
	if ClientKey(netip.MustParseAddr("2001:db8:1:2::1")) != "2001:db8:1:2::/64" {
		t.Fatal("ClientKey")
	}
}

// C7: decoder internals are not echoed.
func TestDecodeErrorGeneric(t *testing.T) {
	h := newAPI(newFake(), nil)
	for _, body := range []string{`{"challenge":"vector","bogus_field_xyz":1}`, `{"challenge":`, `{"challenge":"v"}{}x`, `{"challenge":"\u00zz"}`} {
		w := do(h, "POST", "/runs", body, js)
		if w.Code != 400 || strings.Contains(w.Body.String(), "bogus_field_xyz") || strings.Contains(w.Body.String(), "json:") ||
			strings.Contains(w.Body.String(), "offset") || strings.Contains(w.Body.String(), "invalid character") {
			t.Errorf("%s: %d %s", body, w.Code, w.Body)
		}
	}
	// Our own field-level messages stay specific.
	w := do(h, "POST", "/runs", `{"challenge":"vector","stage":"x","files":{}}`, js)
	if c, field := errCode(t, w); c != "invalid_request" || field != "stage" {
		t.Fatalf("%s", w.Body)
	}
}

// heldRunner blocks Wait until ctx ends and counts concurrent waiters.
type heldRunner struct {
	*fakeRunner
	mu      sync.Mutex
	cur     int
	peak    int
	entered chan struct{}
}

func (h *heldRunner) Wait(ctx context.Context, id string) (protocol.RunView, error) {
	h.mu.Lock()
	h.cur++
	h.peak = max(h.peak, h.cur)
	h.mu.Unlock()
	h.entered <- struct{}{}
	<-ctx.Done()
	h.mu.Lock()
	h.cur--
	h.mu.Unlock()
	return protocol.RunView{ID: id, Status: protocol.RunQueued}, ctx.Err()
}

func getAs(h http.Handler, ip, path string) *httptest.ResponseRecorder {
	r := httptest.NewRequest("GET", path, nil)
	r.RemoteAddr = ip
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

// A2: held long-polls are capped per client (/64) and globally; beyond the
// cap requests degrade to immediate answers instead of failing.
func TestLongPollWaiterCaps(t *testing.T) {
	hr := &heldRunner{fakeRunner: newFake(), entered: make(chan struct{}, 1000)}
	o := Options{Runner: hr, Logger: quiet(), waitUnit: 40 * time.Millisecond, // wait=25 => 1 s
		PollLimit: Limit{PerMinute: 60000, Burst: 10000}, MaxWaitersPerClient: 4, MaxWaiters: 6}
	a := New(o)

	type res struct {
		code     int
		degraded bool
		dur      time.Duration
	}
	run := func(ips []string) []res {
		out := make([]res, len(ips))
		var wg sync.WaitGroup
		for i, ip := range ips {
			wg.Add(1)
			go func() {
				defer wg.Done()
				start := time.Now()
				w := getAs(a, ip, "/runs/r1?wait=25")
				out[i] = res{w.Code, w.Header().Get("X-Long-Poll") == "degraded", time.Since(start)}
			}()
		}
		wg.Wait()
		return out
	}

	// 40 concurrent long-polls from one host rotating through its /64.
	var ips []string
	for i := range 40 {
		ips = append(ips, fmt.Sprintf("[2001:db8:5:6::%x]:1", i+1))
	}
	out := run(ips)
	held, degraded := 0, 0
	for _, r := range out {
		if r.code != 200 {
			t.Fatalf("status %d", r.code)
		}
		if r.degraded {
			degraded++
			if r.dur > 500*time.Millisecond {
				t.Fatalf("degraded poll was held %v", r.dur)
			}
		} else {
			held++
		}
	}
	if held != 4 || degraded != 36 || hr.peak != 4 {
		t.Fatalf("held %d degraded %d peak %d", held, degraded, hr.peak)
	}
	if total, _ := a.waiters.counts(""); total != 0 {
		t.Fatalf("waiters leaked: %d", total)
	}

	// Global cap across many clients.
	hr.peak = 0
	ips = ips[:0]
	for i := range 20 {
		ips = append(ips, fmt.Sprintf("198.51.100.%d:1", i+1))
	}
	out = run(ips)
	held = 0
	for _, r := range out {
		if !r.degraded {
			held++
		}
	}
	if held != 6 || hr.peak != 6 {
		t.Fatalf("global: held %d peak %d", held, hr.peak)
	}
}

// Close releases held long-polls at once and later ones answer immediately.
func TestLongPollDrainOnClose(t *testing.T) {
	hr := &heldRunner{fakeRunner: newFake(), entered: make(chan struct{}, 10)}
	a := New(Options{Runner: hr, Logger: quiet(), waitUnit: time.Second})
	done := make(chan time.Duration, 1)
	go func() {
		start := time.Now()
		w := getAs(a, "192.0.2.1:1", "/runs/r1?wait=25")
		if w.Code != 200 {
			t.Errorf("code %d", w.Code)
		}
		done <- time.Since(start)
	}()
	<-hr.entered
	a.Close()
	select {
	case d := <-done:
		if d > 2*time.Second {
			t.Fatalf("held %v", d)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("long-poll not released by Close")
	}
	start := time.Now()
	if w := getAs(a, "192.0.2.1:1", "/runs/r1?wait=25"); w.Code != 200 || w.Header().Get("X-Long-Poll") != "degraded" || time.Since(start) > time.Second {
		t.Fatalf("after close: %d %v", w.Code, w.Header())
	}
	a.Close() // idempotent
}

func TestWaitersUnlimited(t *testing.T) {
	w := newWaiters(-1, -1)
	var rel []func()
	for range 100 {
		r, ok := w.acquire("k")
		if !ok {
			t.Fatal("refused")
		}
		rel = append(rel, r)
	}
	for _, r := range rel {
		r()
		r() // double release is harmless
	}
	if n, k := w.counts("k"); n != 0 || k != 0 {
		t.Fatalf("%d %d", n, k)
	}
}
