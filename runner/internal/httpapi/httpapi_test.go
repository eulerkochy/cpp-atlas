package httpapi

import (
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
)

// ---------------------------------------------------------------- fakes

type fakeRunner struct {
	mu        sync.Mutex
	submitErr error
	got       []protocol.Submission
	views     map[string]protocol.RunView
	done      chan struct{} // closed => Wait returns terminal view of "r1"
}

func newFake() *fakeRunner {
	return &fakeRunner{views: map[string]protocol.RunView{
		"r1": {ID: "r1", Status: protocol.RunQueued},
		"d1": {ID: "d1", Status: protocol.RunCompleted},
	}, done: make(chan struct{})}
}

func (f *fakeRunner) Submit(_ context.Context, s protocol.Submission) (protocol.RunView, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.got = append(f.got, s)
	if f.submitErr != nil {
		return protocol.RunView{}, f.submitErr
	}
	return protocol.RunView{ID: "abc", Status: protocol.RunQueued, QueuePosition: 2}, nil
}
func (f *fakeRunner) Get(id string) (protocol.RunView, bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	v, ok := f.views[id]
	return v, ok
}
func (f *fakeRunner) Wait(ctx context.Context, id string) (protocol.RunView, error) {
	select {
	case <-f.done:
		return protocol.RunView{ID: id, Status: protocol.RunCompleted}, nil
	case <-ctx.Done():
		v, _ := f.Get(id)
		return v, ctx.Err()
	}
}
func (f *fakeRunner) Challenge(n string) (protocol.ChallengeSpec, bool) {
	if n == "vector" {
		return protocol.ChallengeSpec{Name: "vector", Stages: 5}, true
	}
	return protocol.ChallengeSpec{}, false
}

type statusErr struct{}

func (statusErr) Error() string   { return "per-client run cap reached" }
func (statusErr) HTTPStatus() int { return 429 }

type fakeClock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *fakeClock) Now() time.Time { c.mu.Lock(); defer c.mu.Unlock(); return c.t }
func (c *fakeClock) Add(d time.Duration) {
	c.mu.Lock()
	c.t = c.t.Add(d)
	c.mu.Unlock()
}

func quiet() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

func newAPI(f *fakeRunner, mod func(*Options)) *API {
	o := Options{Runner: f, Logger: quiet(), waitUnit: 10 * time.Millisecond,
		RunsLimit: Limit{PerMinute: 6000, Burst: 1000}, PollLimit: Limit{PerMinute: 6000, Burst: 1000}}
	if mod != nil {
		mod(&o)
	}
	return New(o)
}

func do(h http.Handler, method, path, body string, hdr map[string]string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.RemoteAddr = "203.0.113.5:4000"
	for k, v := range hdr {
		r.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

var js = map[string]string{"Content-Type": "application/json"}

const okBody = `{"challenge":"vector","stage":2,"files":{"include/my/vector.hpp":"x"}}`

func errCode(t *testing.T, w *httptest.ResponseRecorder) (code, field string) {
	t.Helper()
	var e struct {
		Error struct{ Code, Field, Message string }
	}
	if err := json.Unmarshal(w.Body.Bytes(), &e); err != nil {
		t.Fatalf("not JSON error: %q", w.Body.String())
	}
	return e.Error.Code, e.Error.Field
}

// ---------------------------------------------------------------- POST /runs

func TestSubmitSuccessAndMapping(t *testing.T) {
	f := newFake()
	h := newAPI(f, nil)
	w := do(h, "POST", "/runs", okBody, js)
	if w.Code != 202 || w.Header().Get("Location") != "/runs/abc" {
		t.Fatalf("%d %v %s", w.Code, w.Header(), w.Body)
	}
	var out map[string]any
	json.Unmarshal(w.Body.Bytes(), &out)
	if out["id"] != "abc" || out["status"] != "queued" || out["url"] != "/runs/abc" || out["queue_position"] != float64(2) {
		t.Fatalf("%v", out)
	}
	s := f.got[0]
	if fmt.Sprint(s.Stages) != "[1 2]" || !s.StopOnFail || s.Source != protocol.SourceWeb || s.ClientKey != "203.0.113.5" || s.Challenge != "vector" {
		t.Fatalf("%+v", s)
	}
	// only + options
	do(h, "POST", "/runs", `{"challenge":"vector","stage":3,"only":true,"files":{"a":"b"},"options":{"compiler":"clang","preset":"asan-ubsan","trace":true}}`, js)
	s = f.got[1]
	if fmt.Sprint(s.Stages) != "[3]" || s.StopOnFail || s.Options != (protocol.Options{Compiler: "clang", Preset: "asan-ubsan", Trace: true}) {
		t.Fatalf("%+v", s)
	}
}

func TestSubmitValidation(t *testing.T) {
	var many []string
	for i := 0; i < 9; i++ {
		many = append(many, fmt.Sprintf(`"f%d":"x"`, i))
	}
	eleven := `{"challenge":"vector","stage":1,"files":{` + strings.Join(many, ",") + `}}`
	cases := []struct {
		name, ct, body string
		status         int
		code, field    string
	}{
		{"bad json", "application/json", `{`, 400, "invalid_json", ""},
		{"empty", "application/json", ``, 400, "invalid_json", ""},
		{"unknown field", "application/json", `{"challenge":"vector","stage":1,"files":{"a":"b"},"x":1}`, 400, "invalid_json", ""},
		{"trailing garbage", "application/json", okBody + ` x`, 400, "invalid_json", ""},
		{"trailing doc", "application/json", okBody + okBody, 400, "invalid_json", ""},
		{"wrong ct", "text/plain", okBody, 415, "unsupported_media_type", ""},
		{"no ct", "", okBody, 415, "unsupported_media_type", ""},
		{"ct with charset ok-ish", "application/json; charset=utf-8", okBody, 202, "", ""},
		{"missing stage", "application/json", `{"challenge":"vector","files":{"a":"b"}}`, 400, "invalid_request", "stage"},
		{"zero stage", "application/json", `{"challenge":"vector","stage":0,"files":{"a":"b"}}`, 400, "invalid_request", "stage"},
		{"negative stage", "application/json", `{"challenge":"vector","stage":-1,"files":{"a":"b"}}`, 400, "invalid_request", "stage"},
		{"too large stage", "application/json", `{"challenge":"vector","stage":6,"files":{"a":"b"}}`, 400, "invalid_request", "stage"},
		{"huge stage", "application/json", `{"challenge":"vector","stage":99999999999999999999,"files":{"a":"b"}}`, 400, "invalid_request", "stage"},
		{"float stage", "application/json", `{"challenge":"vector","stage":1.5,"files":{"a":"b"}}`, 400, "invalid_request", "stage"},
		{"1.0 stage", "application/json", `{"challenge":"vector","stage":1.0,"files":{"a":"b"}}`, 400, "invalid_request", "stage"},
		{"string stage", "application/json", `{"challenge":"vector","stage":"2","files":{"a":"b"}}`, 400, "invalid_request", "stage"},
		{"null stage", "application/json", `{"challenge":"vector","stage":null,"files":{"a":"b"}}`, 400, "invalid_request", "stage"},
		{"only wrong type", "application/json", `{"challenge":"vector","stage":1,"only":"yes","files":{"a":"b"}}`, 400, "invalid_request", "only"},
		{"no challenge", "application/json", `{"stage":1,"files":{"a":"b"}}`, 400, "invalid_request", "challenge"},
		{"unknown challenge", "application/json", `{"challenge":"nope","stage":1,"files":{"a":"b"}}`, 400, "invalid_request", "challenge"},
		{"empty files", "application/json", `{"challenge":"vector","stage":1,"files":{}}`, 400, "invalid_request", "files"},
		{"no files", "application/json", `{"challenge":"vector","stage":1}`, 400, "invalid_request", "files"},
		{"too many files", "application/json", eleven, 400, "invalid_request", "files"},
		{"long key", "application/json", `{"challenge":"vector","stage":1,"files":{"` + strings.Repeat("a", 300) + `":"x"}}`, 400, "invalid_request", "files"},
		{"body over cap", "application/json", `{"challenge":"vector","stage":1,"files":{"a":"` + strings.Repeat("x", MaxBodyBytes) + `"}}`, 413, "payload_too_large", ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			f := newFake()
			h := newAPI(f, nil)
			hdr := map[string]string{}
			if c.ct != "" {
				hdr["Content-Type"] = c.ct
			}
			w := do(h, "POST", "/runs", c.body, hdr)
			if w.Code != c.status {
				t.Fatalf("status %d want %d: %s", w.Code, c.status, w.Body)
			}
			if c.status >= 400 {
				if len(f.got) != 0 {
					t.Fatal("reached the runner")
				}
				code, field := errCode(t, w)
				if code != c.code || field != c.field {
					t.Fatalf("code=%q field=%q: %s", code, field, w.Body)
				}
			}
		})
	}
}

func TestSubmitErrorMapping(t *testing.T) {
	cases := []struct {
		err    error
		status int
		code   string
		retry  bool
	}{
		{&protocol.ValidationError{Field: "files", Message: "bad path"}, 400, "invalid_request", false},
		{&protocol.ValidationError{Field: "files", Message: "too big", TooLarge: true}, 413, "invalid_request", false},
		{fmt.Errorf("wrapped: %w", protocol.ErrQueueFull), 429, "queue_full", true},
		{statusErr{}, 429, "rejected", true},
		{errors.New("db exploded at /secret/path"), 500, "internal", false},
	}
	for _, c := range cases {
		f := newFake()
		f.submitErr = c.err
		w := do(newAPI(f, nil), "POST", "/runs", okBody, js)
		code, _ := errCode(t, w)
		if w.Code != c.status || code != c.code || (w.Header().Get("Retry-After") != "") != c.retry {
			t.Errorf("%v: %d %s %v", c.err, w.Code, w.Body, w.Header())
		}
		if strings.Contains(w.Body.String(), "secret") {
			t.Errorf("leaked detail: %s", w.Body)
		}
	}
	f := newFake()
	f.submitErr = &protocol.ValidationError{Field: "files", Message: "bad path"}
	w := do(newAPI(f, nil), "POST", "/runs", okBody, js)
	if _, field := errCode(t, w); field != "files" || !strings.Contains(w.Body.String(), "bad path") {
		t.Fatal(w.Body)
	}
}

// ---------------------------------------------------------------- GET

func TestGet(t *testing.T) {
	f := newFake()
	h := newAPI(f, nil)
	for _, p := range []string{"/runs/unknown", "/runs/bad.id", "/runs/" + strings.Repeat("a", 65), "/runs/a%20b"} {
		if w := do(h, "GET", p, "", nil); w.Code != 404 {
			t.Errorf("%s: %d", p, w.Code)
		} else if c, _ := errCode(t, w); c != "not_found" {
			t.Errorf("%s: %s", p, w.Body)
		}
	}
	w := do(h, "GET", "/runs/d1", "", nil)
	if w.Code != 200 || w.Header().Get("Cache-Control") != "no-store" || !strings.Contains(w.Body.String(), `"completed"`) {
		t.Fatalf("%d %v %s", w.Code, w.Header(), w.Body)
	}
	if w := do(h, "GET", "/runs/d1?wait=abc", "", nil); w.Code != 400 {
		t.Fatal(w.Code)
	}
}

func TestLongPoll(t *testing.T) {
	f := newFake()
	h := newAPI(f, func(o *Options) { o.waitUnit = 20 * time.Millisecond })

	// Expiry: returns the still-queued snapshot after the wait.
	start := time.Now()
	w := do(h, "GET", "/runs/r1?wait=5", "", nil)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"queued"`) || time.Since(start) < 90*time.Millisecond {
		t.Fatalf("%d %s %v", w.Code, w.Body, time.Since(start))
	}
	// Clamp: huge wait is clamped to 25 units (500ms here), negative = no wait.
	start = time.Now()
	do(h, "GET", "/runs/r1?wait=-5", "", nil)
	if time.Since(start) > 100*time.Millisecond {
		t.Fatal("negative wait blocked")
	}
	start = time.Now()
	do(h, "GET", "/runs/r1?wait=100000", "", nil)
	if d := time.Since(start); d < 400*time.Millisecond || d > 2*time.Second {
		t.Fatalf("clamp: %v", d)
	}
	// Early return on completion.
	go func() { time.Sleep(30 * time.Millisecond); close(f.done) }()
	start = time.Now()
	w = do(h, "GET", "/runs/r1?wait=25", "", nil)
	if !strings.Contains(w.Body.String(), `"completed"`) || time.Since(start) > 300*time.Millisecond {
		t.Fatalf("%s %v", w.Body, time.Since(start))
	}
}

// ---------------------------------------------------------------- misc routes

func TestHealthAnd404And405(t *testing.T) {
	h := newAPI(newFake(), func(o *Options) { o.Health = func() any { return map[string]any{"queue": 3} } })
	w := do(h, "GET", "/healthz", "", nil)
	var m map[string]any
	json.Unmarshal(w.Body.Bytes(), &m)
	if w.Code != 200 || m["status"] != "ok" || m["queue"] != float64(3) {
		t.Fatalf("%s", w.Body)
	}
	if w := do(newAPI(newFake(), nil), "GET", "/healthz", "", nil); w.Code != 200 {
		t.Fatal(w.Code)
	}
	for _, p := range []string{"/", "/nope", "/runs/a/b", "/runs/", "/github/webhook"} {
		w := do(h, "GET", p, "", nil)
		if c, _ := errCode(t, w); w.Code != 404 || c != "not_found" || !strings.HasPrefix(w.Header().Get("Content-Type"), "application/json") {
			t.Errorf("%s: %d %s", p, w.Code, w.Body)
		}
	}
	for _, c := range []struct{ m, p, allow string }{
		{"GET", "/runs", "POST"}, {"DELETE", "/runs/x", "GET"}, {"POST", "/healthz", "GET"}, {"PUT", "/runs", "OPTIONS"},
	} {
		w := do(h, c.m, c.p, "", nil)
		if code, _ := errCode(t, w); w.Code != 405 || code != "method_not_allowed" || !strings.Contains(w.Header().Get("Allow"), c.allow) {
			t.Errorf("%s %s: %d %v %s", c.m, c.p, w.Code, w.Header(), w.Body)
		}
	}
	if w.Header().Get("X-Content-Type-Options") != "nosniff" || w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("security headers")
	}
}

func TestPanicRecovery(t *testing.T) {
	h := newAPI(newFake(), func(o *Options) {
		o.Webhook = http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic("boom") })
	})
	if w := do(h, "POST", "/github/webhook", "{}", nil); w.Code != 500 {
		t.Fatal(w.Code)
	}
}

// ---------------------------------------------------------------- webhook

func TestWebhookPassthrough(t *testing.T) {
	var gotBody, gotOrigin string
	hook := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		gotBody, gotOrigin = string(b), r.Header.Get("Origin")
		w.WriteHeader(204)
	})
	h := newAPI(newFake(), func(o *Options) {
		o.Webhook = hook
		o.RunsLimit = Limit{PerMinute: 1, Burst: 1}
		o.WebhookLimit = Limit{PerMinute: 6000, Burst: 100}
	})
	payload := `{"zen":"keep it logically awesome"}` + strings.Repeat(" ", 2<<20) // bigger than the /runs cap
	for i := 0; i < 5; i++ {
		w := do(h, "POST", "/github/webhook", payload, map[string]string{"Origin": "https://evil.example", "X-Hub-Signature-256": "sha256=zz"})
		if w.Code != 204 {
			t.Fatalf("i=%d %d %s", i, w.Code, w.Body)
		}
	}
	if gotBody != payload || gotOrigin != "https://evil.example" {
		t.Fatal("body or headers altered")
	}
	if w := do(h, "GET", "/github/webhook", "", nil); w.Code != 405 {
		t.Fatal(w.Code)
	}
}

func TestWebhookOwnLimiter(t *testing.T) {
	h := newAPI(newFake(), func(o *Options) {
		o.Webhook = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) })
		o.WebhookLimit = Limit{PerMinute: 60, Burst: 2}
	})
	codes := []int{}
	for i := 0; i < 3; i++ {
		codes = append(codes, do(h, "POST", "/github/webhook", "", nil).Code)
	}
	if fmt.Sprint(codes) != "[204 204 429]" {
		t.Fatal(codes)
	}
}

// ---------------------------------------------------------------- CORS

func TestCORSMatrix(t *testing.T) {
	cases := []struct {
		origin    string
		localhost bool
		allowed   bool
	}{
		{"https://cppatlas.com", false, true},
		{"https://www.cppatlas.com", false, true},
		{"https://CPPATLAS.com", false, true},
		{"https://cppatlas.com:443", false, true},
		{"http://cppatlas.com", false, false},
		{"https://cppatlas.com:8443", false, false},
		{"https://cppatlas.com.evil.com", false, false},
		{"https://evilcppatlas.com", false, false},
		{"https://sub.cppatlas.com", false, false},
		{"https://cppatlas.com@evil.com", false, false},
		{"https://cppatlas.com/", false, false},
		{"https://evil.com/https://cppatlas.com", false, false},
		{"null", false, false},
		{"*", false, false},
		{"", false, false},
		{"http://localhost:3000", false, false},
		{"http://localhost:3000", true, true},
		{"http://127.0.0.1:5173", true, true},
		{"http://localhost", true, true},
		{"https://localhost:3000", true, false},
		{"http://localhost.evil.com:3000", true, false},
		{"http://127.0.0.1.evil.com", true, false},
		{"http://[::1]:3000", true, false},
	}
	for _, c := range cases {
		t.Run(c.origin, func(t *testing.T) {
			f := newFake()
			h := newAPI(f, func(o *Options) { o.AllowLocalhostOrigins = c.localhost })
			hdr := map[string]string{"Origin": c.origin, "Content-Type": "application/json"}
			if c.origin == "" {
				delete(hdr, "Origin")
			}
			w := do(h, "POST", "/runs", okBody, hdr)
			acao := w.Header().Get("Access-Control-Allow-Origin")
			if !strings.Contains(w.Header().Get("Vary"), "Origin") {
				t.Error("missing Vary")
			}
			switch {
			case c.origin == "": // curl: allowed, no CORS headers
				if w.Code != 202 || acao != "" {
					t.Fatalf("%d %q", w.Code, acao)
				}
			case c.allowed:
				if w.Code != 202 || acao != c.origin || w.Header().Get("Access-Control-Allow-Credentials") != "" {
					t.Fatalf("%d %q", w.Code, acao)
				}
			default:
				if w.Code != 403 || acao != "" || len(f.got) != 0 {
					t.Fatalf("%d %q reached=%d", w.Code, acao, len(f.got))
				}
				// A disallowed GET is served but gets no CORS headers.
				g := do(h, "GET", "/runs/d1", "", map[string]string{"Origin": c.origin})
				if g.Code != 200 || g.Header().Get("Access-Control-Allow-Origin") != "" {
					t.Fatalf("GET %d", g.Code)
				}
			}
		})
	}
}

func TestPreflight(t *testing.T) {
	h := newAPI(newFake(), nil)
	for _, p := range []string{"/runs", "/runs/abc"} {
		w := do(h, "OPTIONS", p, "", map[string]string{"Origin": "https://cppatlas.com", "Access-Control-Request-Method": "POST"})
		hd := w.Header()
		if w.Code != 204 || hd.Get("Access-Control-Allow-Origin") != "https://cppatlas.com" ||
			hd.Get("Access-Control-Allow-Methods") != "GET, POST, OPTIONS" || hd.Get("Access-Control-Allow-Headers") != "Content-Type" ||
			hd.Get("Access-Control-Max-Age") != "600" || !strings.Contains(hd.Get("Vary"), "Origin") {
			t.Fatalf("%s %d %v", p, w.Code, hd)
		}
	}
	w := do(h, "OPTIONS", "/runs", "", map[string]string{"Origin": "https://evil.com"})
	if w.Code != 403 || w.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatalf("%d %v", w.Code, w.Header())
	}
}

func TestRateLimitedResponseCarriesCORS(t *testing.T) {
	h := newAPI(newFake(), func(o *Options) { o.RunsLimit = Limit{PerMinute: 1, Burst: 1} })
	hdr := map[string]string{"Origin": "https://cppatlas.com", "Content-Type": "application/json"}
	do(h, "POST", "/runs", okBody, hdr)
	w := do(h, "POST", "/runs", okBody, hdr)
	if w.Code != 429 || w.Header().Get("Access-Control-Allow-Origin") == "" {
		t.Fatalf("%d %v", w.Code, w.Header())
	}
}

// ---------------------------------------------------------------- rate limits

func TestRateLimitBurstRefillAndSeparation(t *testing.T) {
	clk := &fakeClock{t: time.Unix(1_700_000_000, 0)}
	f := newFake()
	h := newAPI(f, func(o *Options) {
		o.Now = clk.Now
		o.RunsLimit = Limit{PerMinute: 6, Burst: 3}
		o.PollLimit = Limit{PerMinute: 120, Burst: 30}
	})
	post := func(ip string) *httptest.ResponseRecorder {
		r := httptest.NewRequest("POST", "/runs", strings.NewReader(okBody))
		r.Header.Set("Content-Type", "application/json")
		r.RemoteAddr = ip
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w
	}
	for i := 0; i < 3; i++ {
		if w := post("1.1.1.1:1"); w.Code != 202 {
			t.Fatalf("burst %d: %d", i, w.Code)
		}
	}
	w := post("1.1.1.1:2") // same IP, different port
	if w.Code != 429 || w.Header().Get("Retry-After") != "10" {
		t.Fatalf("%d %v %s", w.Code, w.Header(), w.Body)
	}
	if c, _ := errCode(t, w); c != "rate_limited" {
		t.Fatal(c)
	}
	if post("2.2.2.2:1").Code != 202 {
		t.Fatal("other IP throttled")
	}
	// GET budget is separate and independent.
	for i := 0; i < 30; i++ {
		if w := do(h, "GET", "/runs/d1", "", nil); w.Code != 200 {
			t.Fatalf("poll %d: %d", i, w.Code)
		}
	}
	// (do() uses 203.0.113.5; 31st poll is refused.)
	if w := do(h, "GET", "/runs/d1", "", nil); w.Code != 429 || w.Header().Get("Retry-After") == "" {
		t.Fatalf("poll limit: %d", w.Code)
	}
	if post("203.0.113.5:9").Code != 202 {
		t.Fatal("POST budget shared with GET")
	}
	// Refill: 10s => one token.
	clk.Add(9 * time.Second)
	if post("1.1.1.1:3").Code != 429 {
		t.Fatal("refilled too early")
	}
	clk.Add(1 * time.Second)
	if post("1.1.1.1:3").Code != 202 {
		t.Fatal("no refill")
	}
	if post("1.1.1.1:3").Code != 429 {
		t.Fatal("single token reused")
	}
	// healthz is never limited.
	for i := 0; i < 200; i++ {
		if do(h, "GET", "/healthz", "", nil).Code != 200 {
			t.Fatal("healthz limited")
		}
	}
}

func TestIPv6KeyedBy64(t *testing.T) {
	clk := &fakeClock{t: time.Unix(1_700_000_000, 0)}
	h := newAPI(newFake(), func(o *Options) { o.Now = clk.Now; o.RunsLimit = Limit{PerMinute: 6, Burst: 1} })
	post := func(ip string) int {
		r := httptest.NewRequest("POST", "/runs", strings.NewReader(okBody))
		r.Header.Set("Content-Type", "application/json")
		r.RemoteAddr = ip
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w.Code
	}
	if post("[2001:db8:1:2::1]:1") != 202 {
		t.Fatal()
	}
	if post("[2001:db8:1:2:ffff:ffff:ffff:ffff]:1") != 429 {
		t.Fatal("same /64 not shared")
	}
	if post("[2001:db8:1:3::1]:1") != 202 {
		t.Fatal("different /64 shared")
	}
	// IPv4-mapped IPv6 shares the IPv4 bucket.
	if post("1.2.3.4:1") != 202 || post("[::ffff:1.2.3.4]:1") != 429 {
		t.Fatal("mapped address not unmapped")
	}
}

func TestLimiterEvictionBound(t *testing.T) {
	clk := &fakeClock{t: time.Unix(1_700_000_000, 0)}
	l := newLimiter(Limit{PerMinute: 6, Burst: 3}, 100, clk.Now)
	for i := 0; i < 5000; i++ {
		l.allow(fmt.Sprintf("k%d", i))
		if l.size() > 100 {
			t.Fatalf("size %d", l.size())
		}
	}
	// Idle buckets are swept once they have refilled.
	clk.Add(10 * time.Minute)
	l.allow("fresh")
	if l.size() != 1 {
		t.Fatalf("size after sweep %d", l.size())
	}
}

func TestClientIPTrust(t *testing.T) {
	mk := func(trusted string) *http.Request {
		r := httptest.NewRequest("GET", "/healthz", nil)
		r.RemoteAddr = "10.0.0.1:5555"
		r.Header.Set("Fly-Client-IP", "198.51.100.7")
		r.Header.Set("X-Forwarded-For", "6.6.6.6")
		return r
	}
	if got := clientIP(mk(""), "").String(); got != "10.0.0.1" {
		t.Fatal(got)
	}
	if got := clientIP(mk("fly"), "fly").String(); got != "198.51.100.7" {
		t.Fatal(got)
	}
	r := mk("fly")
	r.Header.Set("Fly-Client-IP", "garbage")
	if got := clientIP(r, "fly").String(); got != "10.0.0.1" {
		t.Fatal(got)
	}
	// End to end: untrusted mode keys by RemoteAddr, so spoofing the header does not help.
	h := newAPI(newFake(), func(o *Options) { o.RunsLimit = Limit{PerMinute: 6, Burst: 1} })
	post := func(i int) int {
		r := httptest.NewRequest("POST", "/runs", strings.NewReader(okBody))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Fly-Client-IP", fmt.Sprintf("198.51.100.%d", i))
		r.RemoteAddr = "10.0.0.1:1"
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w.Code
	}
	if post(1) != 202 || post(2) != 429 {
		t.Fatal("untrusted Fly-Client-IP honoured")
	}
	h = newAPI(newFake(), func(o *Options) { o.RunsLimit = Limit{PerMinute: 6, Burst: 1}; o.TrustedProxy = "fly" })
	if post(1) != 202 || post(2) != 202 || post(1) != 429 {
		t.Fatal("trusted Fly-Client-IP ignored")
	}
}

func TestNewServer(t *testing.T) {
	s := NewServer(":0", http.NotFoundHandler())
	if s.ReadHeaderTimeout == 0 || s.WriteTimeout <= 25*time.Second || s.IdleTimeout == 0 || s.MaxHeaderBytes == 0 {
		t.Fatalf("%+v", s)
	}
}
