// Package fly runs each Job on an ephemeral Fly Machine in a separate Fly
// app (default "cppatlas-grader"), using the Machines REST API.
//
// # Why a separate app
//
// Fly injects an app's secrets into every machine of that app. Run machines
// execute untrusted code, so they live in their own app that has no secrets
// at all; the API app (cppatlas-runner) holds FLY_API_TOKEN, an app-scoped
// deploy token for cppatlas-grader only. Both apps are in the same org and
// therefore on the same private network (6PN), so the grader can reach
// http://cppatlas-runner.internal:8081, the API's private listener.
//
// # Per run (cold)
//
//  1. Mint a fetch-once token bound to the job (runs.TokenIssuer).
//  2. POST /v1/apps/{app}/machines with image, guest size, auto_destroy,
//     restart "no", no services (no public ports), and env containing only
//     CPPATLAS_API_URL and CPPATLAS_TOKEN. The submission never enters the
//     machine config (which is stored and visible in the Fly API/dashboard).
//  3. The grader fetches GET /internal/job once and posts /internal/result.
//     We wait for that callback (not for machine state) within the outer
//     wall clock. A watcher on GET .../wait?state=stopped ends the wait early
//     (after ExitGrace) when the machine stops without posting a result.
//  4. Always: revoke the token and DELETE .../machines/{id}?force=true
//     (asynchronously, with retries). auto_destroy is the backstop, and a
//     periodic janitor destroys any machine labelled by this backend that is
//     not tracked and older than JanitorMaxAge (this also cleans up after an
//     API crash, since all API state is in memory).
//
// Machines API 429/5xx and transport errors are retried a bounded number of
// times; a create that still fails surfaces as runs.Unavailable
// ("backend_unavailable") on the run.
//
// A create POST that failed with a transport error, a 5xx or a 409 may still
// have been applied. Every create carries a unique machine name, so before
// retrying, the backend lists its machines and adopts one with that name
// instead of creating a duplicate; if the create finally fails, any machine
// with that name that shows up is destroyed in the background (the janitor
// remains the backstop).
//
// # Peer binding (default on)
//
// The per-run token sits in the machine config env, which other machines
// could conceivably read through Fly's APIs if a run VM were fully
// compromised. As defence in depth each token is bound to the 6PN address
// of the machine it was issued for (private_ip in the create response): the
// rendezvous answers 404 to that token from any other address. The ticket
// is marked "pending" before the create call and bound when the response
// arrives; a job fetch racing the response waits briefly for the bind. If
// the response has no usable private_ip, the run proceeds unbound (logged).
//
// # Warm pool (optional, WarmPoolSize > 0)
//
// The pool keeps N machines created with skip_launch (state "created", never
// booted), each with its own unbound slot token in env. A run takes a slot,
// binds the slot token to the job, and POSTs .../machines/{id}/start; the
// grader then fetches its job with the slot token as usual. After the run the
// machine is destroyed, never reused (it ran untrusted code), and the pool is
// refilled asynchronously. When the pool is empty or the start fails, the run
// falls back to a cold create. Slots older than WarmMaxAge are destroyed and
// replaced, and slot tokens expire shortly after that, so an unused token
// never lives longer than about WarmMaxAge.
//
// Trade-off: a cold create has to place the machine, pull/unpack the grader
// image onto the host (fast when the host has it cached, tens of seconds for
// a ~1.5 GB image when it does not) and boot it; starting a pre-created
// machine skips placement and image preparation and typically boots in about
// a second. A created/stopped machine is billed only for its root
// filesystem ($0.15 per GB per 30 days; a ~1.5 GB rootfs is about
// $0.23/month per slot), so a pool of 2 costs roughly $0.50/month, but it
// pins machines to particular hosts (a start can fail if that host is out of
// capacity, hence the cold fallback) and each slot token exists for up to
// WarmMaxAge.
package fly

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"sync"
	"time"

	"cppatlas.com/runner/internal/protocol"
	"cppatlas.com/runner/internal/runs"
)

// Metadata keys set on every machine this backend creates.
const (
	MetaManaged = "cppatlas"       // value "managed"; the janitor lists by this
	MetaRole    = "cppatlas_role"  // "run" | "pool"
	MetaOwner   = "cppatlas_owner" // random per API process
)

const (
	roleRun  = "run"
	rolePool = "pool"
)

// Config configures the Fly backend. Zero values take the defaults.
type Config struct {
	// APIBaseURL (FLY_API_BASE_URL, default "https://api.machines.dev/v1").
	APIBaseURL string
	// APIToken (FLY_API_TOKEN, required): deploy token scoped to App only.
	APIToken string
	// App that run machines are created in (RUNNER_FLY_APP, default "cppatlas-grader").
	// It must have no secrets.
	App string
	// Image (RUNNER_FLY_IMAGE, required), e.g. "registry.fly.io/cppatlas-grader:<tag>".
	Image string
	// Region (RUNNER_FLY_REGION, default empty = Fly chooses). Set it to the
	// API machine's region (GRADER_REGION) to keep the 6PN callback local.
	Region string
	// Guest size (RUNNER_FLY_CPU_KIND / RUNNER_FLY_CPUS / RUNNER_FLY_MEMORY_MB,
	// default shared / 4 / 4096, i.e. shared-cpu-4x with 4 GB).
	CPUKind  string
	CPUs     int
	MemoryMB int
	// CallbackURL is CPPATLAS_API_URL for the grader
	// (RUNNER_FLY_CALLBACK_URL, default "http://cppatlas-runner.internal:8081").
	CallbackURL string

	// RequestTimeout per Machines API call (default 30s).
	RequestTimeout time.Duration
	// MaxRetries extra attempts on 429/5xx/transport errors (default 3; -1 = none).
	MaxRetries int
	// RetryBaseDelay for exponential backoff (default 500ms).
	RetryBaseDelay time.Duration
	// ExitGrace: how long to wait for a result after the machine stopped (default 5s).
	ExitGrace time.Duration
	// DisableWatch turns off the machine-stopped watcher (the run then
	// always waits for the result or the outer wall clock).
	DisableWatch bool

	// JanitorInterval (RUNNER_FLY_JANITOR_INTERVAL, default 2m; negative disables).
	JanitorInterval time.Duration
	// JanitorMaxAge: untracked run machines older than this are destroyed
	// (default 5m; only needs to exceed the create-response race, since
	// tracked machines are never touched).
	JanitorMaxAge time.Duration

	// ReapRecheck: after a failed create that may have been applied, look
	// for the machine again after this delay (default 15s).
	ReapRecheck time.Duration

	// WarmPoolSize (RUNNER_FLY_WARM_POOL, default 0 = off).
	WarmPoolSize int
	// WarmMaxAge: pool machines are recycled after this (default 1h).
	WarmMaxAge time.Duration
	// WarmRefillInterval: periodic pool check (default 30s).
	WarmRefillInterval time.Duration

	// DisablePeerBinding turns off binding tokens to the machine's 6PN
	// address (FLY_BIND_PEER=false).
	DisablePeerBinding bool

	// HTTPClient for the Machines API (default: a client with no overall timeout;
	// per-request timeouts come from RequestTimeout).
	HTTPClient *http.Client
	// Owner labels machines of this process (default: random).
	Owner string
	// Now is for tests.
	Now func() time.Time
}

func (c Config) withDefaults() Config {
	def := func(s *string, d string) {
		if *s == "" {
			*s = d
		}
	}
	def(&c.APIBaseURL, "https://api.machines.dev/v1")
	c.APIBaseURL = strings.TrimRight(c.APIBaseURL, "/")
	def(&c.App, "cppatlas-grader")
	def(&c.CPUKind, "shared")
	def(&c.CallbackURL, "http://cppatlas-runner.internal:8081")
	c.CallbackURL = strings.TrimRight(c.CallbackURL, "/")
	if c.CPUs <= 0 {
		c.CPUs = 4
	}
	if c.MemoryMB <= 0 {
		c.MemoryMB = 4096
	}
	if c.RequestTimeout <= 0 {
		c.RequestTimeout = 30 * time.Second
	}
	if c.MaxRetries == 0 {
		c.MaxRetries = 3
	} else if c.MaxRetries < 0 {
		c.MaxRetries = 0
	}
	if c.RetryBaseDelay <= 0 {
		c.RetryBaseDelay = 500 * time.Millisecond
	}
	if c.ExitGrace <= 0 {
		c.ExitGrace = 5 * time.Second
	}
	if c.JanitorInterval == 0 {
		c.JanitorInterval = 2 * time.Minute
	}
	if c.JanitorMaxAge <= 0 {
		c.JanitorMaxAge = 5 * time.Minute
	}
	if c.WarmMaxAge <= 0 {
		c.WarmMaxAge = time.Hour
	}
	if c.ReapRecheck <= 0 {
		c.ReapRecheck = 15 * time.Second
	}
	if c.WarmRefillInterval <= 0 {
		c.WarmRefillInterval = 30 * time.Second
	}
	if c.HTTPClient == nil {
		c.HTTPClient = &http.Client{}
	}
	if c.Owner == "" {
		var b [6]byte
		_, _ = rand.Read(b[:])
		c.Owner = hex.EncodeToString(b[:])
	}
	if c.Now == nil {
		c.Now = time.Now
	}
	return c
}

// Backend implements runs.Backend on Fly Machines.
type Backend struct {
	cfg    Config
	api    *client
	issuer runs.TokenIssuer
	log    *slog.Logger

	mu      sync.Mutex
	active  map[string]bool // machine ids of in-flight runs (and being destroyed)
	pool    []*slot
	closed  bool
	stop    chan struct{}
	refill  chan struct{}
	started bool

	bg sync.WaitGroup // background loops and async destroys
}

type slot struct {
	id      string
	ticket  *runs.Ticket
	created time.Time
}

var _ runs.Backend = (*Backend)(nil)

// New validates cfg and creates the backend. Call Start to launch the
// janitor (and the warm pool), and Close at shutdown.
func New(cfg Config, issuer runs.TokenIssuer, logger *slog.Logger) (*Backend, error) {
	cfg = cfg.withDefaults()
	if cfg.APIToken == "" {
		return nil, errors.New("fly: APIToken (FLY_API_TOKEN) is required")
	}
	if cfg.Image == "" {
		return nil, errors.New("fly: Image (RUNNER_FLY_IMAGE) is required")
	}
	if issuer == nil {
		return nil, errors.New("fly: nil TokenIssuer")
	}
	if cfg.CPUKind != "shared" && cfg.CPUKind != "performance" {
		return nil, fmt.Errorf("fly: CPUKind must be shared or performance, got %q", cfg.CPUKind)
	}
	if logger == nil {
		logger = slog.Default()
	}
	return &Backend{
		cfg: cfg,
		api: &client{base: cfg.APIBaseURL, token: cfg.APIToken, http: cfg.HTTPClient,
			reqTimeout: cfg.RequestTimeout, retries: cfg.MaxRetries, baseDelay: cfg.RetryBaseDelay},
		issuer: issuer,
		log:    logger.With("backend", "fly", "app", cfg.App),
		active: map[string]bool{},
		stop:   make(chan struct{}),
		refill: make(chan struct{}, 1),
	}, nil
}

// Name implements runs.Backend.
func (b *Backend) Name() string { return "fly" }

// Start launches the janitor (first sweep immediately) and, if configured,
// the warm-pool filler. Idempotent.
func (b *Backend) Start() {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.started || b.closed {
		return
	}
	b.started = true
	if b.cfg.JanitorInterval > 0 {
		b.bg.Add(1)
		go b.janitorLoop()
	}
	if b.cfg.WarmPoolSize > 0 {
		b.bg.Add(1)
		go b.poolLoop()
	}
}

// Close stops the background loops, destroys pool machines and waits for
// pending destroys until ctx is done. In-flight runs are cancelled by the
// Manager (their machines are destroyed as their Run returns).
func (b *Backend) Close(ctx context.Context) error {
	b.mu.Lock()
	if !b.closed {
		for _, s := range b.pool {
			s.ticket.Revoke()
			b.active[s.id] = true
			b.bg.Add(1)
			go func() {
				defer b.bg.Done()
				b.destroyAndUntrack(s.id)
			}()
		}
		b.pool = nil
		b.closed = true
		close(b.stop)
	}
	b.mu.Unlock()
	done := make(chan struct{})
	go func() { b.bg.Wait(); close(done) }()
	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// ------------------------------------------------------------- machine API

type guest struct {
	CPUKind  string `json:"cpu_kind"`
	CPUs     int    `json:"cpus"`
	MemoryMB int    `json:"memory_mb"`
}

type restartPolicy struct {
	Policy string `json:"policy"`
}

type stopConfig struct {
	Signal string `json:"signal,omitempty"`
}

type machineConfig struct {
	Image       string            `json:"image"`
	Guest       guest             `json:"guest"`
	AutoDestroy bool              `json:"auto_destroy"`
	Restart     restartPolicy     `json:"restart"`
	Env         map[string]string `json:"env"`
	Metadata    map[string]string `json:"metadata"`
	StopConfig  *stopConfig       `json:"stop_config,omitempty"`
}

type createRequest struct {
	Name       string        `json:"name,omitempty"`
	Region     string        `json:"region,omitempty"`
	SkipLaunch bool          `json:"skip_launch,omitempty"`
	Config     machineConfig `json:"config"`
}

type machine struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	State      string    `json:"state"`
	Region     string    `json:"region"`
	InstanceID string    `json:"instance_id"`
	PrivateIP  string    `json:"private_ip"`
	CreatedAt  time.Time `json:"created_at"`
	Config     struct {
		Metadata map[string]string `json:"metadata"`
	} `json:"config"`
}

func (b *Backend) appPath(suffix string) string {
	return "/apps/" + url.PathEscape(b.cfg.App) + "/machines" + suffix
}

func (b *Backend) createRequest(role, token, nameHint string, skipLaunch bool) createRequest {
	var rnd [4]byte
	_, _ = rand.Read(rnd[:])
	return createRequest{
		Name:       "cppatlas-" + role + "-" + nameHint + hex.EncodeToString(rnd[:]),
		Region:     b.cfg.Region,
		SkipLaunch: skipLaunch,
		Config: machineConfig{
			Image:       b.cfg.Image,
			Guest:       guest{CPUKind: b.cfg.CPUKind, CPUs: b.cfg.CPUs, MemoryMB: b.cfg.MemoryMB},
			AutoDestroy: true,
			Restart:     restartPolicy{Policy: "no"},
			Env: map[string]string{
				"CPPATLAS_API_URL": b.cfg.CallbackURL,
				"CPPATLAS_TOKEN":   token,
			},
			Metadata: map[string]string{
				MetaManaged: "managed",
				MetaRole:    role,
				MetaOwner:   b.cfg.Owner,
			},
			StopConfig: &stopConfig{Signal: "SIGKILL"},
		},
	}
}

// create POSTs the machine without blind retries: after an attempt that may
// have been applied (transport error, 5xx, 409) it looks the machine up by
// its unique name and adopts it; 429 is retried directly. When it finally
// fails after a possibly-applied attempt, a background reap destroys any
// machine of that name.
func (b *Backend) create(ctx context.Context, req createRequest) (*machine, error) {
	token := req.Config.Env["CPPATLAS_TOKEN"]
	body, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}
	mayExist := false
	var lastErr error
	for attempt := 0; ; attempt++ {
		var m machine
		retryAfter, err := b.api.once(ctx, http.MethodPost, b.appPath(""), body, &m, b.api.reqTimeout)
		if err == nil && m.ID != "" {
			return &m, nil
		}
		if err == nil {
			err = errors.New("machines api: create returned no id")
		}
		lastErr = redact(err, token)
		st := statusOf(err)
		if st == 0 || st >= 500 || st == http.StatusConflict {
			mayExist = true
			if ctx.Err() == nil {
				if found, ferr := b.findByName(ctx, req.Name); ferr == nil && found != nil {
					b.log.Warn("machine create failed but the machine exists; adopting it",
						"machine", found.ID, "name", req.Name, "err", lastErr)
					return found, nil
				}
			}
		}
		if ctx.Err() != nil || (st != 0 && !retryable(st)) || attempt >= b.api.retries {
			break
		}
		if b.api.backoff(ctx, attempt, retryAfter) != nil {
			break
		}
	}
	if mayExist {
		b.reapByName(req.Name)
	}
	return nil, lastErr
}

// findByName returns this app's managed, not-destroyed machine named name.
func (b *Backend) findByName(ctx context.Context, name string) (*machine, error) {
	var list []machine
	q := url.Values{"metadata." + MetaManaged: {"managed"}}
	if err := b.api.do(ctx, http.MethodGet, b.appPath("?"+q.Encode()), nil, &list, 0); err != nil {
		return nil, err
	}
	for i := range list {
		m := &list[i]
		if m.Name == name && m.ID != "" && m.State != "destroyed" && m.State != "destroying" {
			return m, nil
		}
	}
	return nil, nil
}

// reapByName destroys, in the background, a machine whose create call
// failed but may have been applied. It looks twice (the machine may only
// become visible after a moment); the janitor is the backstop.
func (b *Backend) reapByName(name string) {
	b.mu.Lock()
	b.bg.Add(1)
	b.mu.Unlock()
	go func() {
		defer b.bg.Done()
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		for i, delay := range []time.Duration{0, b.cfg.ReapRecheck} {
			if i > 0 {
				select {
				case <-time.After(delay):
				case <-b.stop:
				case <-ctx.Done():
					return
				}
			}
			m, err := b.findByName(ctx, name)
			if err != nil || m == nil {
				continue
			}
			b.log.Warn("destroying machine left by a failed create", "machine", m.ID, "name", name)
			b.track(m.ID)
			b.destroyAndUntrack(m.ID)
			return
		}
	}()
}

// bindPeer binds tk to the machine's 6PN address, or falls back to unbound
// (logged) when the create response has no usable private_ip.
func (b *Backend) bindPeer(tk *runs.Ticket, m *machine, log *slog.Logger) {
	if b.cfg.DisablePeerBinding {
		return
	}
	ip, err := netip.ParseAddr(strings.TrimSpace(m.PrivateIP))
	if err != nil || ip.IsUnspecified() {
		log.Warn("machine has no usable private_ip; token not bound to a peer address",
			"machine", m.ID, "private_ip", m.PrivateIP)
		tk.SkipPeer()
		return
	}
	tk.BindPeer(ip)
}

// expectPeer marks a fresh ticket as awaiting its peer binding (before the
// token is put into a machine config).
func (b *Backend) expectPeer(tk *runs.Ticket) {
	if !b.cfg.DisablePeerBinding {
		tk.ExpectPeer()
	}
}

func redact(err error, secret string) error {
	if secret == "" || !strings.Contains(err.Error(), secret) {
		return err
	}
	return errors.New(strings.ReplaceAll(err.Error(), secret, "[redacted]"))
}

func (b *Backend) startMachine(ctx context.Context, id string) error {
	return b.api.do(ctx, http.MethodPost, b.appPath("/"+url.PathEscape(id)+"/start"), nil, nil, 0)
}

func (b *Backend) getMachine(ctx context.Context, id string) (*machine, error) {
	var m machine
	if err := b.api.do(ctx, http.MethodGet, b.appPath("/"+url.PathEscape(id)), nil, &m, 0); err != nil {
		return nil, err
	}
	return &m, nil
}

// destroy force-destroys a machine; 404 counts as success.
func (b *Backend) destroy(ctx context.Context, id string) error {
	err := b.api.do(ctx, http.MethodDelete, b.appPath("/"+url.PathEscape(id)+"?force=true"), nil, nil, 0)
	if statusOf(err) == http.StatusNotFound {
		return nil
	}
	return err
}

// destroyAsync destroys in the background and then untracks the machine
// (on failure too: an untracked leftover is the janitor's job). After Close
// it destroys synchronously.
func (b *Backend) destroyAsync(id string) {
	b.mu.Lock()
	b.active[id] = true
	if b.closed {
		b.mu.Unlock()
		b.destroyAndUntrack(id)
		return
	}
	b.bg.Add(1)
	b.mu.Unlock()
	go func() {
		defer b.bg.Done()
		b.destroyAndUntrack(id)
	}()
}

func (b *Backend) destroyAndUntrack(id string) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	if err := b.destroy(ctx, id); err != nil {
		b.log.Error("destroy machine failed; janitor will retry", "machine", id, "err", err)
	} else {
		b.log.Debug("machine destroyed", "machine", id)
	}
	b.mu.Lock()
	delete(b.active, id)
	b.mu.Unlock()
}

func (b *Backend) track(id string) {
	b.mu.Lock()
	b.active[id] = true
	b.mu.Unlock()
}

// waitStopped blocks until the machine instance stopped or is gone (true),
// or ctx is done / watching is impossible (false).
func (b *Backend) waitStopped(ctx context.Context, m *machine) bool {
	inst := m.InstanceID
	if inst == "" {
		got, err := b.getMachine(ctx, m.ID)
		if err != nil {
			return statusOf(err) == http.StatusNotFound
		}
		inst = got.InstanceID
		if inst == "" {
			return false
		}
	}
	q := url.Values{"state": {"stopped"}, "instance_id": {inst}, "timeout": {"60"}}
	path := b.appPath("/" + url.PathEscape(m.ID) + "/wait?" + q.Encode())
	for ctx.Err() == nil {
		_, err := b.api.once(ctx, http.MethodGet, path, nil, nil, 70*time.Second)
		st := statusOf(err)
		switch {
		case err == nil, st == http.StatusNotFound:
			return true
		case st == http.StatusRequestTimeout || errors.Is(err, context.DeadlineExceeded) && ctx.Err() == nil:
			continue // long-poll expired: wait again
		case st == http.StatusBadRequest:
			return false
		}
		select {
		case <-ctx.Done():
		case <-time.After(2 * time.Second):
		}
	}
	return false
}

// ---------------------------------------------------------------- run path

var errMachineExited = errors.New("machine stopped without posting a result")

func ticketExpiry(ctx context.Context, now time.Time) time.Time {
	if dl, ok := ctx.Deadline(); ok {
		return dl.Add(5 * time.Second)
	}
	return now.Add(15 * time.Minute)
}

func nameHint(runID string) string {
	sum := sha256.Sum256([]byte(runID))
	return hex.EncodeToString(sum[:4]) + "-"
}

// Run implements runs.Backend.
func (b *Backend) Run(ctx context.Context, job protocol.Job) (*protocol.Result, error) {
	log := b.log.With("run", runs.LogID(job.RunID))
	if b.cfg.WarmPoolSize > 0 {
		if s := b.takeSlot(); s != nil {
			res, err, handled := b.runWarm(ctx, job, s, log)
			if handled {
				return res, err
			}
		} else {
			log.Info("warm pool empty; cold start")
		}
	}
	return b.runCold(ctx, job, log)
}

func (b *Backend) runCold(ctx context.Context, job protocol.Job, log *slog.Logger) (*protocol.Result, error) {
	tk, err := b.issuer.Issue(job, ticketExpiry(ctx, b.cfg.Now()))
	if err != nil {
		return nil, runs.Internal(runs.CodeInternal, err)
	}
	defer tk.Revoke()
	b.expectPeer(tk)
	started := time.Now()
	m, err := b.create(ctx, b.createRequest(roleRun, tk.Token(), nameHint(job.RunID), false))
	if err != nil {
		if ctx.Err() != nil {
			return nil, fmt.Errorf("fly create: %w", ctx.Err())
		}
		return nil, runs.Unavailable(err)
	}
	b.track(m.ID)
	defer b.destroyAsync(m.ID)
	b.bindPeer(tk, m, log)
	log.Info("machine created", "machine", m.ID, "region", m.Region, "create_ms", time.Since(started).Milliseconds())
	return b.await(ctx, tk, m, log)
}

// runWarm returns handled=false when the slot could not be used and the
// caller should fall back to a cold create.
func (b *Backend) runWarm(ctx context.Context, job protocol.Job, s *slot, log *slog.Logger) (*protocol.Result, error, bool) {
	b.kickRefill()
	b.track(s.id)
	defer b.destroyAsync(s.id) // never reused: it is about to run untrusted code
	defer s.ticket.Revoke()
	if err := s.ticket.Bind(job, ticketExpiry(ctx, b.cfg.Now())); err != nil {
		log.Warn("warm slot unusable; cold start", "machine", s.id, "err", err)
		return nil, nil, false
	}
	started := time.Now()
	if err := b.startMachine(ctx, s.id); err != nil {
		if ctx.Err() != nil {
			return nil, fmt.Errorf("fly start: %w", ctx.Err()), true
		}
		log.Warn("warm start failed; cold start", "machine", s.id, "err", err)
		return nil, nil, false
	}
	log.Info("warm machine started", "machine", s.id, "start_ms", time.Since(started).Milliseconds())
	res, err := b.await(ctx, s.ticket, &machine{ID: s.id}, log)
	return res, err, true
}

func (b *Backend) await(ctx context.Context, tk *runs.Ticket, m *machine, log *slog.Logger) (*protocol.Result, error) {
	waitCtx, cancel := context.WithCancelCause(ctx)
	defer cancel(nil)
	if !b.cfg.DisableWatch {
		go func() {
			if !b.waitStopped(waitCtx, m) {
				return
			}
			t := time.NewTimer(b.cfg.ExitGrace)
			defer t.Stop()
			select {
			case <-t.C:
				cancel(errMachineExited)
			case <-waitCtx.Done():
			}
		}()
	}
	res, err := tk.Wait(waitCtx)
	if err == nil {
		return res, nil
	}
	if ctx.Err() != nil {
		return nil, fmt.Errorf("fly run (machine %s, fetched=%v): %w", m.ID, tk.Fetched(), ctx.Err())
	}
	if errors.Is(context.Cause(waitCtx), errMachineExited) {
		return nil, runs.Internal(runs.CodeGraderExited, fmt.Errorf("machine %s (fetched=%v): %w", m.ID, tk.Fetched(), errMachineExited))
	}
	return nil, runs.Internal(runs.CodeInternal, err)
}

// --------------------------------------------------------------- warm pool

func (b *Backend) takeSlot() *slot {
	var expired []*slot
	defer func() {
		for _, s := range expired {
			s.ticket.Revoke()
			b.destroyAsync(s.id)
		}
	}()
	b.mu.Lock()
	defer b.mu.Unlock()
	now := b.cfg.Now()
	for len(b.pool) > 0 {
		s := b.pool[0]
		b.pool = b.pool[1:]
		if now.Sub(s.created) < b.cfg.WarmMaxAge {
			return s
		}
		expired = append(expired, s)
	}
	return nil
}

func (b *Backend) kickRefill() {
	select {
	case b.refill <- struct{}{}:
	default:
	}
}

// PoolSize reports the number of ready warm slots.
func (b *Backend) PoolSize() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return len(b.pool)
}

func (b *Backend) poolLoop() {
	defer b.bg.Done()
	t := time.NewTicker(b.cfg.WarmRefillInterval)
	defer t.Stop()
	for {
		b.fillPool()
		select {
		case <-b.stop:
			return
		case <-t.C:
		case <-b.refill:
		}
	}
}

// fillPool recycles expired slots and creates missing ones (sequentially;
// stops at the first failure until the next tick).
func (b *Backend) fillPool() {
	b.mu.Lock()
	now := b.cfg.Now()
	keep := b.pool[:0]
	var expired []*slot
	for _, s := range b.pool {
		if now.Sub(s.created) >= b.cfg.WarmMaxAge {
			expired = append(expired, s)
		} else {
			keep = append(keep, s)
		}
	}
	b.pool = keep
	b.mu.Unlock()
	for _, s := range expired {
		s.ticket.Revoke()
		b.destroyAsync(s.id)
	}

	for {
		b.mu.Lock()
		need := !b.closed && len(b.pool) < b.cfg.WarmPoolSize
		b.mu.Unlock()
		if !need {
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		go func() {
			select {
			case <-b.stop:
				cancel()
			case <-ctx.Done():
			}
		}()
		s, err := b.newSlot(ctx)
		cancel()
		if err != nil {
			b.log.Warn("warm pool: create failed", "err", err)
			return
		}
		b.mu.Lock()
		if b.closed {
			b.mu.Unlock()
			s.ticket.Revoke()
			b.destroyAsync(s.id)
			return
		}
		b.pool = append(b.pool, s)
		b.mu.Unlock()
		b.log.Info("warm pool: slot ready", "machine", s.id)
	}
}

func (b *Backend) newSlot(ctx context.Context) (*slot, error) {
	created := b.cfg.Now()
	tk, err := b.issuer.IssueSlot(created.Add(b.cfg.WarmMaxAge + 10*time.Minute))
	if err != nil {
		return nil, err
	}
	b.expectPeer(tk)
	m, err := b.create(ctx, b.createRequest(rolePool, tk.Token(), "", true))
	if err != nil {
		tk.Revoke()
		return nil, err
	}
	b.bindPeer(tk, m, b.log)
	return &slot{id: m.ID, ticket: tk, created: created}, nil
}

// ----------------------------------------------------------------- janitor

func (b *Backend) janitorLoop() {
	defer b.bg.Done()
	t := time.NewTicker(b.cfg.JanitorInterval)
	defer t.Stop()
	for {
		ctx, cancel := context.WithTimeout(context.Background(), b.cfg.JanitorInterval)
		go func() {
			select {
			case <-b.stop:
				cancel()
			case <-ctx.Done():
			}
		}()
		if n, err := b.Janitor(ctx); err != nil {
			b.log.Warn("janitor failed", "err", err)
		} else if n > 0 {
			b.log.Warn("janitor destroyed leftover machines", "count", n)
		}
		cancel()
		select {
		case <-b.stop:
			return
		case <-t.C:
		}
	}
}

// Janitor lists machines labelled by this backend and destroys leftovers:
//   - run machines not tracked by this process and older than JanitorMaxAge;
//   - pool machines not in this process's pool and older than 1 minute (their
//     slot tokens are unknown here, e.g. after an API restart, so they are
//     useless);
//   - tracked-nowhere machines of any other owner under the same rules.
//
// It returns the number of machines destroyed.
func (b *Backend) Janitor(ctx context.Context) (int, error) {
	var list []machine
	q := url.Values{"metadata." + MetaManaged: {"managed"}}
	if err := b.api.do(ctx, http.MethodGet, b.appPath("?"+q.Encode()), nil, &list, 0); err != nil {
		return 0, err
	}
	now := b.cfg.Now()
	b.mu.Lock()
	inPool := map[string]bool{}
	for _, s := range b.pool {
		inPool[s.id] = true
	}
	var doomed []string
	for _, m := range list {
		if m.Config.Metadata[MetaManaged] != "managed" || m.State == "destroyed" || m.State == "destroying" {
			continue
		}
		if b.active[m.ID] || inPool[m.ID] {
			continue
		}
		age := now.Sub(m.CreatedAt)
		limit := b.cfg.JanitorMaxAge
		if m.Config.Metadata[MetaRole] == rolePool {
			limit = time.Minute
		}
		if m.CreatedAt.IsZero() || age > limit {
			doomed = append(doomed, m.ID)
		}
	}
	b.mu.Unlock()
	n := 0
	for _, id := range doomed {
		if err := b.destroy(ctx, id); err != nil {
			b.log.Warn("janitor: destroy failed", "machine", id, "err", err)
			continue
		}
		n++
	}
	return n, nil
}
