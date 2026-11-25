// Command cppatlas-api is the always-on API process of the cppatlas runner.
//
// It serves the public API (POST /runs, GET /runs/{id}, POST /github/webhook,
// GET /healthz) on LISTEN_ADDR and, for the Fly backend, the private
// job/result endpoints for run machines on INTERNAL_LISTEN_ADDR (6PN only).
//
// Backends: BACKEND=docker runs the grader image locally (dev, verification);
// BACKEND=fly launches one ephemeral Fly Machine per run in the separate
// cppatlas-grader app. See runner/README.md and scripts/deploy.md.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"cppatlas.com/runner/internal/backend/docker"
	"cppatlas.com/runner/internal/backend/fly"
	"cppatlas.com/runner/internal/config"
	"cppatlas.com/runner/internal/github"
	"cppatlas.com/runner/internal/httpapi"
	"cppatlas.com/runner/internal/protocol"
	"cppatlas.com/runner/internal/runs"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		slog.Error("invalid configuration", "err", err)
		os.Exit(2)
	}
	logger := slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: cfg.SlogLevel()}))
	slog.SetDefault(logger)
	if err := run(cfg, logger); err != nil {
		logger.Error("fatal", "err", err)
		os.Exit(1)
	}
}

// backend is what main needs from either implementation.
type backend interface {
	runs.Backend
	Close(ctx context.Context) error
}

func run(cfg config.Config, logger *slog.Logger) error {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	challenges := runs.DefaultChallenges()
	if cfg.ChallengesFile != "" {
		var err error
		if challenges, err = runs.LoadChallenges(cfg.ChallengesFile); err != nil {
			return err
		}
	}

	// The rendezvous (fetch-once job / single result per token) is only used
	// by the Fly backend; the docker backend talks to the grader over stdio.
	rv := runs.NewRendezvous(runs.RendezvousConfig{}, logger)

	if cfg.TrustedProxy == httpapi.TrustedProxyFly && !config.IPv4OnlyListen(cfg.ListenAddr) {
		logger.Warn("TRUSTED_PROXY=fly but the public listener is not IPv4-only: machines on the private 6PN network "+
			"could reach it directly and forge Fly-Client-IP; set LISTEN_ADDR=0.0.0.0:8080", "listen_addr", cfg.ListenAddr)
	}

	var be backend
	var flyBackend *fly.Backend
	switch cfg.Backend {
	case config.BackendFly:
		base := strings.TrimRight(cfg.FlyAPIBaseURL, "/")
		if !strings.HasSuffix(base, "/v1") {
			base += "/v1"
		}
		fb, err := fly.New(fly.Config{
			APIBaseURL:   base,
			APIToken:     cfg.FlyAPIToken.Reveal(),
			App:          cfg.FlyGraderApp,
			Image:        cfg.GraderImage,
			Region:       cfg.FlyRegion,
			CPUKind:      cfg.FlyVMCPUKind,
			CPUs:         cfg.FlyVMCPUs,
			MemoryMB:     cfg.FlyVMMemoryMB,
			CallbackURL:  cfg.InternalAPIURL,
			WarmPoolSize: cfg.WarmPoolSize,

			DisablePeerBinding: !cfg.FlyBindPeer,
		}, rv, logger)
		if err != nil {
			return err
		}
		be, flyBackend = fb, fb
	default:
		db := docker.New(docker.Config{Image: cfg.GraderImage, Runtime: os.Getenv("DOCKER_RUNTIME")}, logger)
		cctx, cancel := context.WithTimeout(ctx, 20*time.Second)
		if n, err := db.Cleanup(cctx); err != nil {
			logger.Warn("docker cleanup failed", "err", err)
		} else if n > 0 {
			logger.Info("removed stale run containers", "count", n)
		}
		cancel()
		be = db
	}

	offIfZero := func(v int) int {
		if v == 0 {
			return -1
		}
		return v
	}
	globalRate := cfg.GlobalRunsPer10
	if globalRate == 0 {
		globalRate = -1
	}
	mgr := runs.NewManager(runs.Config{
		QueueSize:          cfg.QueueSize,
		MaxConcurrent:      cfg.MaxConcurrentRuns,
		MaxPerClient:       offIfZero(cfg.MaxRunsPerClient),
		RunTimeout:         cfg.RunTimeout,
		ResultTTL:          cfg.ResultTTL,
		MaxStoredRuns:      cfg.MaxStoredRuns,
		MaxStoredBytes:     cfg.MaxStoredBytes,
		MaxResultBytes:     cfg.MaxResultBytes,
		MaxQueuedWeb:       cfg.QueueMaxWeb,
		MaxQueuedGitHub:    cfg.QueueMaxGitHub,
		GlobalRunsPer10Min: globalRate,
		GlobalRunsBurst:    cfg.GlobalRunsBurst,
		DefaultCompiler:    cfg.DefaultCompiler,
		DefaultPreset:      cfg.DefaultPreset,
		Challenges:         challenges,
		Rendezvous:         rv,
	}, be, logger)

	// GitHub App (optional: all three secrets or none).
	webhook := github.Disabled()
	var app *github.App
	if cfg.GitHubEnabled() {
		ghCfg, _ := github.ConfigFromEnv(os.Getenv)
		ghCfg.AppID = cfg.GitHubAppID
		ghCfg.PrivateKeyPEM = cfg.GitHubAppPrivateKey.Reveal()
		ghCfg.WebhookSecret = cfg.GitHubWebhookSecret.Reveal()
		ghCfg.APIBaseURL = cfg.GitHubAPIBaseURL
		ghCfg.Runner = mgr
		ghCfg.Logger = logger
		var err error
		if app, err = github.New(ghCfg); err != nil {
			return err
		}
		webhook = app.WebhookHandler()
	} else {
		logger.Info("github integration disabled (GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET not set)")
	}

	// Public /healthz says only "ok" and the backend name; queue statistics
	// are served on the private listener (GET /internal/stats, Fly backend)
	// and logged periodically. Local docker development keeps them public.
	health := func() any { return map[string]string{"backend": be.Name()} }
	if cfg.Backend == config.BackendDocker && cfg.AllowLocalhostOrigins {
		health = func() any { return mgr.Stats() }
	}
	go logStats(ctx, mgr, logger, 5*time.Minute)

	api := httpapi.New(httpapi.Options{
		Runner:                webRunner{mgr},
		Webhook:               webhook,
		Health:                health,
		AllowedOrigins:        cfg.AllowedOrigins,
		AllowLocalhostOrigins: cfg.AllowLocalhostOrigins,
		RunsLimit:             httpapi.Limit{PerMinute: cfg.RunsPerMinute, Burst: cfg.RunsBurst},
		PollLimit:             httpapi.Limit{PerMinute: cfg.PollPerMinute, Burst: cfg.PollBurst},
		WebhookLimit:          httpapi.Limit{PerMinute: cfg.WebhookPerMinute, Burst: cfg.WebhookBurst},
		MaxLimiterEntries:     cfg.RateMaxEntries,
		MaxWaitersPerClient:   cfg.LongPollPerClient,
		MaxWaiters:            cfg.LongPollTotal,
		TrustedProxy:          cfg.TrustedProxy,
		Logger:                logger,
	})
	defer api.Close()

	errc := make(chan error, 2)
	public := httpapi.NewServer(cfg.ListenAddr, api)
	go func() { errc <- serve(ctx, public, logger, "public") }()

	// The private listener exists only for the Fly backend. It must never be
	// published in fly.toml: run machines reach it over 6PN.
	var internal *http.Server
	if flyBackend != nil {
		mux := http.NewServeMux()
		mux.Handle("/internal/", mgr.InternalHandler())
		mux.Handle("GET /internal/stats", statsHandler(mgr))
		internal = httpapi.NewServer(cfg.InternalListenAddr, mux)
		go func() { errc <- serve(ctx, internal, logger, "internal") }()
		flyBackend.Start()
	}

	logger.Info("cppatlas-api started", "config", cfg.String())

	var runErr error
	select {
	case <-ctx.Done():
	case runErr = <-errc:
	}
	logger.Info("shutting down")

	sctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	_ = api.Close() // release held long-polls so Shutdown is not stuck behind them
	_ = public.Shutdown(sctx)
	if app != nil {
		_ = app.Shutdown(sctx)
	}
	_ = mgr.Shutdown(sctx)
	_ = be.Close(sctx)
	if internal != nil {
		_ = internal.Shutdown(sctx)
	}
	return runErr
}

// statsHandler serves the Manager's queue statistics on the private
// listener (same peer restrictions as the rendezvous endpoints).
func statsHandler(mgr *runs.Manager) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if !runs.PrivateNetworkOnly(r) {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(mgr.Stats())
	})
}

// logStats logs the queue statistics every interval until ctx is done.
func logStats(ctx context.Context, mgr *runs.Manager, logger *slog.Logger, every time.Duration) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			logger.Info("stats", "stats", mgr.Stats())
		}
	}
}

// serve listens with a short retry: on Fly the 6PN address
// (fly-local-6pn) can take a moment to become bindable at boot.
func serve(ctx context.Context, srv *http.Server, logger *slog.Logger, name string) error {
	var ln net.Listener
	var err error
	for attempt := 0; attempt < 30; attempt++ {
		if ln, err = net.Listen("tcp", srv.Addr); err == nil {
			break
		}
		select {
		case <-ctx.Done():
			return nil
		case <-time.After(time.Second):
		}
	}
	if err != nil {
		return err
	}
	logger.Info("listening", "listener", name, "addr", ln.Addr().String())
	if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

// webRunner adapts the lifecycle errors that have no protocol-level meaning
// to HTTP statuses for the public API (httpapi maps HTTPStatus()/Code()).
type webRunner struct{ *runs.Manager }

func (w webRunner) Submit(ctx context.Context, s protocol.Submission) (protocol.RunView, error) {
	v, err := w.Manager.Submit(ctx, s)
	switch {
	case errors.Is(err, runs.ErrTooManyRuns):
		return v, statusError{http.StatusTooManyRequests, "too_many_runs", "You already have runs in progress; wait for them to finish."}
	case errors.Is(err, runs.ErrShuttingDown):
		return v, statusError{http.StatusServiceUnavailable, "shutting_down", "The runner is restarting; try again in a moment."}
	}
	return v, err
}

type statusError struct {
	status    int
	code, msg string
}

func (e statusError) Error() string   { return e.msg }
func (e statusError) HTTPStatus() int { return e.status }
func (e statusError) Code() string    { return e.code }
