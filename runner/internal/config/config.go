// Package config turns environment variables into one typed, validated
// Config. It is a plain struct with exported fields; cmd/api maps it onto the
// config structs of the other packages.
package config

import (
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// Secret is a string that never prints itself. Use Reveal at the single place
// the value is actually needed.
type Secret string

func (s Secret) String() string {
	if s == "" {
		return ""
	}
	return "[redacted]"
}
func (s Secret) GoString() string             { return `config.Secret("` + s.String() + `")` }
func (s Secret) MarshalText() ([]byte, error) { return []byte(s.String()), nil }
func (s Secret) LogValue() slog.Value         { return slog.StringValue(s.String()) }
func (s Secret) Reveal() string               { return string(s) }

// Backend names.
const (
	BackendDocker = "docker"
	BackendFly    = "fly"
)

// DefaultAllowedOrigins are the browser origins allowed to call the API.
var DefaultAllowedOrigins = []string{"https://cppatlas.com", "https://www.cppatlas.com"}

// Config is everything the API process reads from its environment.
type Config struct {
	// Listeners.
	ListenAddr         string // LISTEN_ADDR, else ":"+PORT, else ":8080" (public)
	InternalListenAddr string // INTERNAL_LISTEN_ADDR, default ":8081" (private; fly-local-6pn:8081 on Fly)

	Backend     string // BACKEND: docker | fly (default docker)
	GraderImage string // GRADER_IMAGE (default cppatlas-grader:dev)

	// HTTP layer.
	AllowedOrigins        []string // ALLOWED_ORIGINS (comma list; replaces the defaults)
	AllowLocalhostOrigins bool     // ALLOW_LOCALHOST_ORIGINS (default: off when BACKEND=fly or TRUSTED_PROXY=fly, else on)
	TrustedProxy          string   // TRUSTED_PROXY: "" | fly
	RunsPerMinute         float64  // RATE_RUNS_PER_MIN (6)
	RunsBurst             int      // RATE_RUNS_BURST (3)
	PollPerMinute         float64  // RATE_POLL_PER_MIN (120)
	PollBurst             int      // RATE_POLL_BURST (30)
	WebhookPerMinute      float64  // RATE_WEBHOOK_PER_MIN (300)
	WebhookBurst          int      // RATE_WEBHOOK_BURST (60)
	RateMaxEntries        int      // RATE_MAX_ENTRIES (10000)
	LongPollPerClient     int      // LONGPOLL_MAX_PER_CLIENT (4): held ?wait= polls per client (IPv6 /64)
	LongPollTotal         int      // LONGPOLL_MAX_TOTAL (64): held ?wait= polls in total

	// Run lifecycle.
	MaxConcurrentRuns int           // MAX_CONCURRENT_RUNS (4)
	QueueSize         int           // QUEUE_SIZE (20)
	RunTimeout        time.Duration // RUN_TIMEOUT (120s)
	ResultTTL         time.Duration // RESULT_TTL (15m)
	MaxRunsPerClient  int           // MAX_RUNS_PER_CLIENT (2; 0 = unlimited)
	MaxStoredRuns     int           // MAX_STORED_RUNS (500)
	MaxStoredBytes    int64         // MAX_STORED_BYTES (67108864 = 64 MiB)
	MaxResultBytes    int           // MAX_RESULT_BYTES (524288 = 512 KiB)
	QueueMaxWeb       int           // QUEUE_MAX_WEB (3/4 of QUEUE_SIZE)
	QueueMaxGitHub    int           // QUEUE_MAX_GITHUB (1/2 of QUEUE_SIZE)
	GlobalRunsPer10   float64       // GLOBAL_RUNS_PER_10MIN (120; 0 = off)
	GlobalRunsBurst   int           // GLOBAL_RUNS_BURST (40)
	ChallengesFile    string        // CHALLENGES_FILE (optional)
	DefaultCompiler   string        // DEFAULT_COMPILER (gcc)
	DefaultPreset     string        // DEFAULT_PRESET (debug)

	// Fly backend.
	FlyAPIToken    Secret // FLY_API_TOKEN (required for BACKEND=fly)
	FlyGraderApp   string // FLY_GRADER_APP (cppatlas-grader)
	FlyRegion      string // GRADER_REGION (required for BACKEND=fly)
	FlyVMCPUKind   string // GRADER_VM_CPU_KIND (shared)
	FlyVMCPUs      int    // GRADER_VM_CPUS (4)
	FlyVMMemoryMB  int    // GRADER_VM_MEMORY_MB (4096)
	FlyAPIBaseURL  string // FLY_API_BASE_URL (https://api.machines.dev)
	InternalAPIURL string // INTERNAL_API_URL (http://cppatlas-runner.internal:8081)
	WarmPoolSize   int    // WARM_POOL_SIZE (0 = off)
	FlyBindPeer    bool   // FLY_BIND_PEER (true): bind run tokens to the machine's 6PN address

	// GitHub App. All three set, or none (webhook disabled).
	GitHubAppID         string // GITHUB_APP_ID
	GitHubAppPrivateKey Secret // GITHUB_APP_PRIVATE_KEY (PEM; literal "\n" escapes are accepted)
	GitHubWebhookSecret Secret // GITHUB_WEBHOOK_SECRET
	GitHubAPIBaseURL    string // GITHUB_API_BASE_URL (https://api.github.com)

	LogLevel string // LOG_LEVEL: debug|info|warn|error (info)
}

// IPv4OnlyListen reports whether addr binds only IPv4 (0.0.0.0:port or an
// explicit IPv4 address), which keeps 6PN (IPv6) peers off the listener.
func IPv4OnlyListen(addr string) bool {
	host, _, err := net.SplitHostPort(addr)
	if err != nil || host == "" {
		return false
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.To4() != nil && !strings.Contains(host, ":")
}

// GitHubEnabled reports whether the GitHub integration is configured.
func (c Config) GitHubEnabled() bool { return c.GitHubAppID != "" }

// SlogLevel converts LogLevel.
func (c Config) SlogLevel() slog.Level {
	switch c.LogLevel {
	case "debug":
		return slog.LevelDebug
	case "warn":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	}
	return slog.LevelInfo
}

// String is safe to log: secrets are Secret values and print as [redacted].
func (c Config) String() string {
	type plain Config // no methods, so no String recursion
	return fmt.Sprintf("%+v", plain(c))
}

// Load reads the process environment.
func Load() (Config, error) { return LoadFrom(os.Getenv) }

// LoadFrom reads settings through getenv (for tests). All problems are
// reported together.
func LoadFrom(getenv func(string) string) (Config, error) {
	l := &loader{get: func(k string) string { return strings.TrimSpace(getenv(k)) }}
	c := Config{}

	switch {
	case l.get("LISTEN_ADDR") != "":
		c.ListenAddr = l.get("LISTEN_ADDR")
	case l.get("PORT") != "":
		c.ListenAddr = ":" + l.get("PORT")
	default:
		c.ListenAddr = ":8080"
	}
	c.InternalListenAddr = l.str("INTERNAL_LISTEN_ADDR", ":8081")
	for k, v := range map[string]string{"LISTEN_ADDR/PORT": c.ListenAddr, "INTERNAL_LISTEN_ADDR": c.InternalListenAddr} {
		if _, _, err := net.SplitHostPort(v); err != nil {
			l.errf("%s: %q is not a host:port address", k, v)
		}
	}

	c.Backend = l.str("BACKEND", BackendDocker)
	if c.Backend != BackendDocker && c.Backend != BackendFly {
		l.errf("BACKEND: %q must be %q or %q", c.Backend, BackendDocker, BackendFly)
	}
	c.GraderImage = l.str("GRADER_IMAGE", "cppatlas-grader:dev")

	if v := l.get("ALLOWED_ORIGINS"); v != "" {
		for _, o := range strings.Split(v, ",") {
			if o = strings.TrimSpace(o); o != "" {
				c.AllowedOrigins = append(c.AllowedOrigins, o)
			}
		}
	}
	if len(c.AllowedOrigins) == 0 {
		c.AllowedOrigins = append([]string(nil), DefaultAllowedOrigins...)
	}
	for _, o := range c.AllowedOrigins {
		u, err := url.Parse(o)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" ||
			(u.Path != "" && u.Path != "/") || u.User != nil || strings.Contains(o, "*") {
			l.errf("ALLOWED_ORIGINS: %q must look like https://host[:port]", o)
		}
	}
	c.TrustedProxy = strings.ToLower(l.str("TRUSTED_PROXY", ""))
	if c.TrustedProxy != "" && c.TrustedProxy != "fly" {
		l.errf("TRUSTED_PROXY: %q must be empty or \"fly\"", c.TrustedProxy)
	}
	// Production (Fly) defaults to no localhost origins; local dev defaults to on.
	c.AllowLocalhostOrigins = l.boolean("ALLOW_LOCALHOST_ORIGINS", c.Backend != BackendFly && c.TrustedProxy != "fly")
	c.RunsPerMinute = l.float("RATE_RUNS_PER_MIN", 6)
	c.RunsBurst = l.integer("RATE_RUNS_BURST", 3, 1)
	c.PollPerMinute = l.float("RATE_POLL_PER_MIN", 120)
	c.PollBurst = l.integer("RATE_POLL_BURST", 30, 1)
	c.WebhookPerMinute = l.float("RATE_WEBHOOK_PER_MIN", 300)
	c.WebhookBurst = l.integer("RATE_WEBHOOK_BURST", 60, 1)
	c.RateMaxEntries = l.integer("RATE_MAX_ENTRIES", 10000, 100)
	c.LongPollPerClient = l.integer("LONGPOLL_MAX_PER_CLIENT", 4, 1)
	c.LongPollTotal = l.integer("LONGPOLL_MAX_TOTAL", 64, 1)

	c.MaxConcurrentRuns = l.integer("MAX_CONCURRENT_RUNS", 4, 1)
	c.QueueSize = l.integer("QUEUE_SIZE", 20, 1)
	c.RunTimeout = l.duration("RUN_TIMEOUT", 120*time.Second)
	c.ResultTTL = l.duration("RESULT_TTL", 15*time.Minute)
	c.MaxRunsPerClient = l.integer("MAX_RUNS_PER_CLIENT", 2, 0)
	c.MaxStoredRuns = l.integer("MAX_STORED_RUNS", 500, 1)
	c.MaxStoredBytes = int64(l.integer("MAX_STORED_BYTES", 64<<20, 1<<20))
	c.MaxResultBytes = l.integer("MAX_RESULT_BYTES", 512<<10, 16<<10)
	if c.MaxResultBytes > 2<<20 {
		l.errf("MAX_RESULT_BYTES: %d must be <= 2097152 (the result body cap)", c.MaxResultBytes)
	}
	c.QueueMaxWeb = l.integer("QUEUE_MAX_WEB", max(c.QueueSize*3/4, 1), 1)
	c.QueueMaxGitHub = l.integer("QUEUE_MAX_GITHUB", max(c.QueueSize/2, 1), 1)
	if c.QueueMaxWeb > c.QueueSize || c.QueueMaxGitHub > c.QueueSize {
		l.errf("QUEUE_MAX_WEB and QUEUE_MAX_GITHUB must be <= QUEUE_SIZE (%d)", c.QueueSize)
	}
	c.GlobalRunsPer10 = l.nonnegFloat("GLOBAL_RUNS_PER_10MIN", 120)
	c.GlobalRunsBurst = l.integer("GLOBAL_RUNS_BURST", 40, 1)
	c.ChallengesFile = l.str("CHALLENGES_FILE", "")
	c.DefaultCompiler = l.str("DEFAULT_COMPILER", "gcc")
	if c.DefaultCompiler != "gcc" && c.DefaultCompiler != "clang" {
		l.errf("DEFAULT_COMPILER: %q must be gcc or clang", c.DefaultCompiler)
	}
	c.DefaultPreset = l.str("DEFAULT_PRESET", "debug")
	if c.DefaultPreset != "debug" && c.DefaultPreset != "asan-ubsan" {
		l.errf("DEFAULT_PRESET: %q must be debug or asan-ubsan", c.DefaultPreset)
	}

	c.FlyAPIToken = Secret(l.get("FLY_API_TOKEN"))
	c.FlyGraderApp = l.str("FLY_GRADER_APP", "cppatlas-grader")
	c.FlyRegion = l.str("GRADER_REGION", "")
	c.FlyVMCPUKind = l.str("GRADER_VM_CPU_KIND", "shared")
	if c.FlyVMCPUKind != "shared" && c.FlyVMCPUKind != "performance" {
		l.errf("GRADER_VM_CPU_KIND: %q must be shared or performance", c.FlyVMCPUKind)
	}
	c.FlyVMCPUs = l.integer("GRADER_VM_CPUS", 4, 1)
	c.FlyVMMemoryMB = l.integer("GRADER_VM_MEMORY_MB", 4096, 256)
	c.FlyAPIBaseURL = l.url("FLY_API_BASE_URL", "https://api.machines.dev")
	c.InternalAPIURL = l.url("INTERNAL_API_URL", "http://cppatlas-runner.internal:8081")
	c.WarmPoolSize = l.integer("WARM_POOL_SIZE", 0, 0)
	c.FlyBindPeer = l.boolean("FLY_BIND_PEER", true)
	if c.Backend == BackendFly {
		if c.FlyAPIToken == "" {
			l.errf("FLY_API_TOKEN is required when BACKEND=fly")
		}
		if c.FlyRegion == "" {
			l.errf("GRADER_REGION is required when BACKEND=fly")
		}
	}

	c.GitHubAppID = l.str("GITHUB_APP_ID", "")
	key := l.get("GITHUB_APP_PRIVATE_KEY")
	if !strings.Contains(key, "\n") {
		key = strings.ReplaceAll(key, `\n`, "\n")
	}
	c.GitHubAppPrivateKey = Secret(key)
	c.GitHubWebhookSecret = Secret(l.get("GITHUB_WEBHOOK_SECRET"))
	c.GitHubAPIBaseURL = l.url("GITHUB_API_BASE_URL", "https://api.github.com")
	set := 0
	for _, b := range []bool{c.GitHubAppID != "", c.GitHubAppPrivateKey != "", c.GitHubWebhookSecret != ""} {
		if b {
			set++
		}
	}
	if set != 0 && set != 3 {
		l.errf("GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY and GITHUB_WEBHOOK_SECRET must be set together (or none, to disable the webhook)")
	}

	c.LogLevel = strings.ToLower(l.str("LOG_LEVEL", "info"))
	switch c.LogLevel {
	case "debug", "info", "warn", "error":
	default:
		l.errf("LOG_LEVEL: %q must be debug, info, warn or error", c.LogLevel)
	}

	if len(l.errs) > 0 {
		return Config{}, errors.Join(l.errs...)
	}
	return c, nil
}

type loader struct {
	get  func(string) string
	errs []error
}

func (l *loader) errf(f string, a ...any) { l.errs = append(l.errs, fmt.Errorf(f, a...)) }

func (l *loader) str(k, def string) string {
	if v := l.get(k); v != "" {
		return v
	}
	return def
}

func (l *loader) integer(k string, def, min int) int {
	v := l.get(k)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < min {
		l.errf("%s: %q must be an integer >= %d", k, v, min)
		return def
	}
	return n
}

func (l *loader) float(k string, def float64) float64 {
	v := l.get(k)
	if v == "" {
		return def
	}
	f, err := strconv.ParseFloat(v, 64)
	if err != nil || f <= 0 || f != f || f > 1e9 {
		l.errf("%s: %q must be a positive number", k, v)
		return def
	}
	return f
}

// nonnegFloat is like float but also accepts 0 (meaning "off").
func (l *loader) nonnegFloat(k string, def float64) float64 {
	if v := l.get(k); v == "0" || v == "0.0" {
		return 0
	}
	return l.float(k, def)
}

func (l *loader) boolean(k string, def bool) bool {
	v := l.get(k)
	if v == "" {
		return def
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		l.errf("%s: %q must be true or false", k, v)
		return def
	}
	return b
}

func (l *loader) duration(k string, def time.Duration) time.Duration {
	v := l.get(k)
	if v == "" {
		return def
	}
	d, err := time.ParseDuration(v)
	if err != nil || d <= 0 {
		l.errf("%s: %q must be a positive duration like 120s", k, v)
		return def
	}
	return d
}

func (l *loader) url(k, def string) string {
	v := strings.TrimRight(l.str(k, def), "/")
	u, err := url.Parse(v)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		l.errf("%s: %q must be an http(s) URL", k, v)
	}
	return v
}
