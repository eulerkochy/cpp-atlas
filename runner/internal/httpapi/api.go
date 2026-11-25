// Package httpapi is the public HTTP surface of the runner API: POST /runs,
// GET /runs/{id}, /healthz and the GitHub webhook mount, plus CORS, per-IP
// rate limiting and server hardening. It talks to the run lifecycle only
// through protocol.Runner.
package httpapi

import (
	"log/slog"
	"net/http"
	"time"

	"cppatlas.com/runner/internal/protocol"
)

// Defaults for the rate limits (zero Limit fields in Options).
var (
	DefaultRunsLimit    = Limit{PerMinute: 6, Burst: 3}
	DefaultPollLimit    = Limit{PerMinute: 120, Burst: 30}
	DefaultWebhookLimit = Limit{PerMinute: 300, Burst: 60}
)

const (
	// MaxBodyBytes caps a POST /runs body.
	MaxBodyBytes = 512 << 10
	// MaxWait is the longest long-poll (?wait=) in seconds.
	MaxWait = 25
	// DefaultMaxLimiterEntries bounds each limiter's map.
	DefaultMaxLimiterEntries = 10000
	// DefaultMaxWaitersPerClient / DefaultMaxWaiters cap concurrent held
	// long-polls per client key and in total.
	DefaultMaxWaitersPerClient = 4
	DefaultMaxWaiters          = 64

	maxFiles       = 8
	maxPathLen     = 200
	maxChallengeLn = 64
	maxIDLen       = 64
)

// Options configures New.
type Options struct {
	Runner protocol.Runner
	// Webhook, if non-nil, is mounted at POST /github/webhook. It is exempt
	// from CORS and from the browser rate limiters (it has its own, more
	// generous, per-IP limiter) and its body is never read by this package.
	Webhook http.Handler
	// Health returns extra fields merged into the /healthz JSON. May be nil.
	Health func() any

	// AllowedOrigins defaults to DefaultAllowedOrigins when empty.
	AllowedOrigins []string
	// AllowLocalhostOrigins additionally allows http://localhost:<port> and
	// http://127.0.0.1:<port>. Turn it on for local development. In
	// production it is harmless to the server (CORS is not an authorisation
	// boundary and every request is rate limited), but it widens what other
	// pages on a developer's machine can read, so config defaults it to off
	// when running on Fly.
	AllowLocalhostOrigins bool

	// Zero values pick the defaults above; PerMinute < 0 disables a limiter.
	RunsLimit, PollLimit, WebhookLimit Limit
	// MaxLimiterEntries bounds each limiter (default 10000).
	MaxLimiterEntries int

	// MaxWaitersPerClient / MaxWaiters cap how many GET /runs/{id}?wait=N
	// long-polls are held open at once per client key (IPv6 /64) and in
	// total (defaults 4 and 64; negative = unlimited). Beyond the cap a
	// long-poll is answered immediately, as if wait=0, with the header
	// "X-Long-Poll: degraded".
	MaxWaitersPerClient, MaxWaiters int

	// TrustedProxy is "" (use RemoteAddr) or "fly" (trust Fly-Client-IP).
	TrustedProxy string

	Logger *slog.Logger
	Now    func() time.Time // default time.Now

	// waitUnit is the unit of ?wait= (tests shrink it); default one second.
	waitUnit time.Duration
}

// API is the http.Handler returned by New.
type API struct {
	opts    Options
	log     *slog.Logger
	now     func() time.Time
	origins *originPolicy
	runs    *limiter
	poll    *limiter
	hook    *limiter
	waiters *waiters
	handler http.Handler
}

// ServeHTTP implements http.Handler.
func (a *API) ServeHTTP(w http.ResponseWriter, r *http.Request) { a.handler.ServeHTTP(w, r) }

// Close starts draining: held long-polls return their current snapshot at
// once and new ones are answered immediately, so http.Server.Shutdown is not
// held up by 25 s waits. The limiters start no goroutines. Idempotent; call
// it before shutting the server down.
func (a *API) Close() error {
	a.waiters.drain()
	return nil
}

// New builds the public handler. The result also has Close().
func New(opts Options) *API {
	if opts.Logger == nil {
		opts.Logger = slog.Default()
	}
	if opts.Now == nil {
		opts.Now = time.Now
	}
	if opts.waitUnit == 0 {
		opts.waitUnit = time.Second
	}
	if opts.MaxLimiterEntries <= 0 {
		opts.MaxLimiterEntries = DefaultMaxLimiterEntries
	}
	def := func(l, d Limit) Limit {
		if l.PerMinute == 0 {
			l.PerMinute = d.PerMinute
		}
		if l.Burst <= 0 {
			l.Burst = d.Burst
		}
		return l
	}
	defCap := func(v, d int) int {
		if v == 0 {
			return d
		}
		return v
	}
	a := &API{
		waiters: newWaiters(defCap(opts.MaxWaitersPerClient, DefaultMaxWaitersPerClient), defCap(opts.MaxWaiters, DefaultMaxWaiters)),
		opts:    opts,
		log:     opts.Logger,
		now:     opts.Now,
		origins: newOriginPolicy(opts.AllowedOrigins, opts.AllowLocalhostOrigins),
		runs:    newLimiter(def(opts.RunsLimit, DefaultRunsLimit), opts.MaxLimiterEntries, opts.Now),
		poll:    newLimiter(def(opts.PollLimit, DefaultPollLimit), opts.MaxLimiterEntries, opts.Now),
		hook:    newLimiter(def(opts.WebhookLimit, DefaultWebhookLimit), opts.MaxLimiterEntries, opts.Now),
	}
	a.handler = a.middleware(a.routes())
	return a
}

func (a *API) routes() http.Handler {
	mux := http.NewServeMux()

	// Each path also gets a method-less pattern so wrong methods produce our
	// JSON 405 (with Allow) rather than the mux's plain-text one.
	mux.HandleFunc("POST /runs", a.guard(a.runs, a.handleSubmit))
	mux.HandleFunc("OPTIONS /runs", a.guard(nil, a.handlePreflight))
	mux.HandleFunc("/runs", methodNotAllowed("POST, OPTIONS"))

	mux.HandleFunc("GET /runs/{id}", a.guard(a.poll, a.handleGet))
	mux.HandleFunc("OPTIONS /runs/{id}", a.guard(nil, a.handlePreflight))
	mux.HandleFunc("/runs/{id}", methodNotAllowed("GET, HEAD, OPTIONS"))

	mux.HandleFunc("GET /healthz", a.handleHealth)
	mux.HandleFunc("/healthz", methodNotAllowed("GET, HEAD"))

	if a.opts.Webhook != nil {
		mux.HandleFunc("POST /github/webhook", a.handleWebhook)
		mux.HandleFunc("/github/webhook", methodNotAllowed("POST"))
	}

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		writeError(w, http.StatusNotFound, "not_found", "", "no such endpoint")
	})
	return mux
}

func methodNotAllowed(allow string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Allow", allow)
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "", "method not allowed")
	}
}
