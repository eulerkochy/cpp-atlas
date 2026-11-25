package github

import (
	"context"
	"crypto/rsa"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"cppatlas.com/runner/internal/protocol"
)

// Environment variable names read by ConfigFromEnv.
const (
	EnvAppID         = "GITHUB_APP_ID"
	EnvPrivateKey    = "GITHUB_APP_PRIVATE_KEY"
	EnvWebhookSecret = "GITHUB_WEBHOOK_SECRET"
	EnvAPIBaseURL    = "GITHUB_API_BASE_URL"
	EnvDefaultOnly   = "GITHUB_DEFAULT_BRANCH_ONLY"
)

// Config configures the App. Zero values take the documented defaults.
type Config struct {
	AppID         string // GITHUB_APP_ID (numeric App ID or client ID)
	PrivateKeyPEM string // GITHUB_APP_PRIVATE_KEY (see ParsePrivateKey for accepted encodings)
	WebhookSecret string // GITHUB_WEBHOOK_SECRET
	Runner        protocol.Runner

	APIBaseURL string       // default "https://api.github.com"; GHES: "https://HOST/api/v3". http only for loopback hosts.
	HTTPClient *http.Client // default: a new client; its CheckRedirect is always replaced
	Logger     *slog.Logger // default slog.Default()
	Now        func() time.Time

	SiteURL          string // default "https://cppatlas.com" (spec links)
	DefaultChallenge string // default "vector" (when .cppatlas.json has no "challenge")
	CheckName        string // default "cppatlas"; the run is named "<CheckName> / <challenge>"
	UserAgent        string // default "cppatlas-runner"

	// DefaultBranchOnly grades only pushes to the repository's default branch.
	DefaultBranchOnly bool

	MaxBodyBytes       int64 // webhook body cap; default 1 MiB (413 above)
	ConfigFileMaxBytes int64 // .cppatlas.json cap; default 4096

	MaxConcurrent    int // grading jobs talking to GitHub/waiting on a run at once; default 8
	MaxQueued        int // accepted pushes not yet finished (all repos); default 128
	MaxQueuedPerRepo int // pending pushes per repository (distinct branches); default 4
	MaxNotifiers     int // concurrent "busy / cancelled" check posts; default 4

	InstallationBurst  int           // token bucket size per installation; default 20
	InstallationRefill time.Duration // one token per this interval; default 10s (6 pushes/min sustained)

	DedupSize   int           // remembered delivery IDs and graded SHAs; default 4096 each
	MaxEventAge time.Duration // ignore pushes whose repository.pushed_at is older; default 24h; <0 disables

	RequestTimeout time.Duration // per GitHub API attempt; default 15s
	MaxRetries     int           // retries after the first attempt; default 2; <0 disables
	MaxRetryAfter  time.Duration // longest Retry-After honoured; default 60s
	RunTimeout     time.Duration // longest wait for a run to become terminal; default 15m
}

// ConfigFromEnv fills the secret and URL fields from the environment.
// configured is true when the three secrets are all present; the caller then
// sets Runner/Logger and calls New, and otherwise mounts Disabled().
func ConfigFromEnv(getenv func(string) string) (cfg Config, configured bool) {
	cfg.AppID = strings.TrimSpace(getenv(EnvAppID))
	cfg.PrivateKeyPEM = getenv(EnvPrivateKey)
	cfg.WebhookSecret = getenv(EnvWebhookSecret)
	cfg.APIBaseURL = strings.TrimSpace(getenv(EnvAPIBaseURL))
	switch strings.ToLower(strings.TrimSpace(getenv(EnvDefaultOnly))) {
	case "1", "true", "yes":
		cfg.DefaultBranchOnly = true
	}
	configured = cfg.AppID != "" && strings.TrimSpace(cfg.PrivateKeyPEM) != "" && cfg.WebhookSecret != ""
	return cfg, configured
}

// Disabled is the webhook handler to mount when the App is not configured.
func Disabled() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "GitHub integration is not configured", http.StatusServiceUnavailable)
	})
}

// App is a configured GitHub App integration.
type App struct {
	cfg    Config
	key    *rsa.PrivateKey
	secret []byte
	base   *url.URL
	client *http.Client
	log    *slog.Logger
	now    func() time.Time
	sleep  func(ctx context.Context, d time.Duration) error

	tokens     *tokenCache
	deliveries *lru
	graded     *lru
	buckets    *buckets
	sched      *scheduler
	notifySem  chan struct{}
	runSem     chan struct{}

	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
	closed atomic.Bool
}

// New validates cfg and returns an App. It fails on missing secrets, a
// malformed private key or an unusable API base URL.
func New(cfg Config) (*App, error) {
	if strings.TrimSpace(cfg.AppID) == "" {
		return nil, errors.New("github: AppID is required")
	}
	if cfg.WebhookSecret == "" {
		return nil, errors.New("github: WebhookSecret is required")
	}
	if cfg.Runner == nil {
		return nil, errors.New("github: Runner is required")
	}
	key, err := ParsePrivateKey(cfg.PrivateKeyPEM)
	if err != nil {
		return nil, err
	}
	cfg.AppID = strings.TrimSpace(cfg.AppID)
	setDefaults(&cfg)
	base, err := parseBaseURL(cfg.APIBaseURL)
	if err != nil {
		return nil, err
	}
	a := &App{
		cfg:    cfg,
		key:    key,
		secret: []byte(cfg.WebhookSecret),
		base:   base,
		log:    cfg.Logger.With("component", "github"),
		now:    cfg.Now,
		sleep:  sleepCtx,
	}
	var client http.Client
	if cfg.HTTPClient != nil {
		client = *cfg.HTTPClient
	}
	client.CheckRedirect = a.checkRedirect
	a.client = &client
	a.tokens = newTokenCache()
	a.deliveries = newLRU(cfg.DedupSize)
	a.graded = newLRU(cfg.DedupSize)
	a.buckets = newBuckets(cfg.InstallationBurst, cfg.InstallationRefill)
	a.sched = newScheduler(cfg.MaxQueued, cfg.MaxQueuedPerRepo)
	a.notifySem = make(chan struct{}, cfg.MaxNotifiers)
	a.runSem = make(chan struct{}, cfg.MaxConcurrent)
	a.ctx, a.cancel = context.WithCancel(context.Background())
	return a, nil
}

func setDefaults(c *Config) {
	def := func(p *int, v int) {
		if *p <= 0 {
			*p = v
		}
	}
	defD := func(p *time.Duration, v time.Duration) {
		if *p == 0 {
			*p = v
		}
	}
	if c.APIBaseURL == "" {
		c.APIBaseURL = "https://api.github.com"
	}
	if c.Logger == nil {
		c.Logger = slog.Default()
	}
	if c.Now == nil {
		c.Now = time.Now
	}
	if c.SiteURL == "" {
		c.SiteURL = "https://cppatlas.com"
	}
	if c.DefaultChallenge == "" {
		c.DefaultChallenge = "vector"
	}
	if c.CheckName == "" {
		c.CheckName = "cppatlas"
	}
	if c.UserAgent == "" {
		c.UserAgent = "cppatlas-runner"
	}
	if c.MaxBodyBytes <= 0 {
		c.MaxBodyBytes = 1 << 20
	}
	if c.ConfigFileMaxBytes <= 0 {
		c.ConfigFileMaxBytes = 4096
	}
	def(&c.MaxConcurrent, 8)
	def(&c.MaxQueued, 128)
	def(&c.MaxQueuedPerRepo, 4)
	def(&c.MaxNotifiers, 4)
	def(&c.InstallationBurst, 20)
	defD(&c.InstallationRefill, 10*time.Second)
	def(&c.DedupSize, 4096)
	defD(&c.MaxEventAge, 24*time.Hour)
	defD(&c.RequestTimeout, 15*time.Second)
	if c.MaxRetries == 0 {
		c.MaxRetries = 2
	} else if c.MaxRetries < 0 {
		c.MaxRetries = 0
	}
	defD(&c.MaxRetryAfter, 60*time.Second)
	defD(&c.RunTimeout, 15*time.Minute)
}

func parseBaseURL(s string) (*url.URL, error) {
	u, err := url.Parse(strings.TrimRight(s, "/"))
	if err != nil || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return nil, fmt.Errorf("github: invalid APIBaseURL %q", s)
	}
	switch u.Scheme {
	case "https":
	case "http":
		if !isLoopback(u.Hostname()) {
			return nil, fmt.Errorf("github: APIBaseURL must be https (http is allowed only for loopback hosts)")
		}
	default:
		return nil, fmt.Errorf("github: invalid APIBaseURL scheme %q", u.Scheme)
	}
	return u, nil
}

func isLoopback(host string) bool {
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

// Shutdown stops accepting webhooks, cancels in-flight grading (each running
// job completes its check run as neutral with a short detached deadline) and
// waits for the goroutines until ctx is done.
func (a *App) Shutdown(ctx context.Context) error {
	a.closed.Store(true)
	a.cancel()
	done := make(chan struct{})
	go func() { a.wg.Wait(); close(done) }()
	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func sleepCtx(ctx context.Context, d time.Duration) error {
	if d <= 0 {
		return ctx.Err()
	}
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-t.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
