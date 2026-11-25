// Package docker runs each Job in a fresh, locked-down local container. It is
// the backend for local development and for all verification/CI.
//
// Transport: the Job is written to the container's stdin; the grader writes
// exactly one protocol.Result JSON document to stdout; stderr is grader logs,
// of which only a capped tail is kept, for server logs (never for clients).
//
// The docker CLI is invoked with os/exec and an explicit argv (never a
// shell). The outer wall clock is the ctx passed to Run: on expiry or
// cancellation the container is killed and removed by name ("docker kill",
// "docker rm -f"), the CLI process is killed, and "docker rm -f" is repeated
// to cover a container that was created while we were killing. Every
// container carries a label so Cleanup can reap leftovers from a crashed API
// process, and Close removes all containers still tracked at shutdown.
//
// Baseline sandbox (all resource flags configurable in Config):
//
//	docker run --rm -i --name cppatlas-run-<id> --label cppatlas.runner=<instance>
//	  --network none --read-only --user 10001:10001 --cap-drop ALL
//	  --security-opt no-new-privileges --pids-limit 256 --memory 2g --memory-swap 2g
//	  --cpus 2 --ulimit nofile=1024:1024 --ulimit core=0
//	  --tmpfs /work:rw,exec,nosuid,nodev,size=1g,uid=10001,gid=10001,mode=0700
//	  --tmpfs /tmp:rw,nosuid,nodev,size=64m
//	  [--runtime runsc] [extra args] <image> [command]
package docker

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"

	"cppatlas.com/runner/internal/protocol"
	"cppatlas.com/runner/internal/runs"
)

// Config configures the docker backend. Zero values take the defaults.
type Config struct {
	// Image is the grader image (RUNNER_DOCKER_IMAGE, default "cppatlas-grader:dev").
	Image string
	// DockerPath is the docker CLI (RUNNER_DOCKER_PATH, default "docker", looked up on PATH).
	DockerPath string
	// Instance is the value of the cppatlas.runner label; Cleanup only reaps
	// containers with the same value (default "default").
	Instance string
	// NamePrefix for container names (default "cppatlas-run-").
	NamePrefix string

	Network    string   // default "none"
	User       string   // default "10001:10001"
	PidsLimit  int      // default 256
	Memory     string   // default "3g"
	MemorySwap string   // default "3g" (= Memory: no swap)
	CPUs       string   // default "2"
	Ulimits    []string // default nofile=1024:1024, core=0
	Tmpfs      []string // default /work (1g, exec) and /tmp (64m)
	// Runtime selects an OCI runtime, e.g. "runsc" for gVisor
	// (RUNNER_DOCKER_RUNTIME, default empty = docker default).
	Runtime string
	// ExtraArgs are appended before the image (e.g. "--env", "X=1").
	ExtraArgs []string
	// Command is appended after the image (default: the image entrypoint).
	Command []string

	// MaxStdoutBytes caps the result read from stdout; overflow is an
	// infrastructure error (default 4 MiB).
	MaxStdoutBytes int
	// StderrTailBytes is how much of the end of stderr is kept for logs (default 16 KiB).
	StderrTailBytes int
	// CleanupTimeout bounds each docker kill / rm call (default 15s).
	CleanupTimeout time.Duration
	// KillGrace is how long to wait for the CLI to exit after the container
	// was killed before killing the CLI process (default 5s).
	KillGrace time.Duration
}

func (c Config) withDefaults() Config {
	def := func(s *string, d string) {
		if *s == "" {
			*s = d
		}
	}
	def(&c.Image, "cppatlas-grader:dev")
	def(&c.DockerPath, "docker")
	def(&c.Instance, "default")
	def(&c.NamePrefix, "cppatlas-run-")
	def(&c.Network, "none")
	def(&c.User, "10001:10001")
	def(&c.Memory, "3g") // >= Limits.MemoryMB (2048, RLIMIT_AS) + headroom for the grader
	def(&c.MemorySwap, c.Memory)
	def(&c.CPUs, "2")
	if c.PidsLimit <= 0 {
		c.PidsLimit = 256
	}
	if c.Ulimits == nil {
		c.Ulimits = []string{"nofile=1024:1024", "core=0"}
	}
	if c.Tmpfs == nil {
		c.Tmpfs = []string{
			"/work:rw,exec,nosuid,nodev,size=1g,uid=10001,gid=10001,mode=0700",
			"/tmp:rw,nosuid,nodev,size=64m",
		}
	}
	if c.MaxStdoutBytes <= 0 {
		c.MaxStdoutBytes = 4 << 20
	}
	if c.StderrTailBytes <= 0 {
		c.StderrTailBytes = 16 << 10
	}
	if c.CleanupTimeout <= 0 {
		c.CleanupTimeout = 15 * time.Second
	}
	if c.KillGrace <= 0 {
		c.KillGrace = 5 * time.Second
	}
	return c
}

// Backend implements runs.Backend with local docker containers.
type Backend struct {
	cfg Config
	log *slog.Logger

	mu   sync.Mutex
	live map[string]struct{} // container names of in-flight runs
}

var _ runs.Backend = (*Backend)(nil)

// New creates the backend. It does not contact docker; call Cleanup at
// startup to reap containers from a previous process.
func New(cfg Config, logger *slog.Logger) *Backend {
	if logger == nil {
		logger = slog.Default()
	}
	return &Backend{cfg: cfg.withDefaults(), log: logger.With("backend", "docker"), live: map[string]struct{}{}}
}

// Name implements runs.Backend.
func (b *Backend) Name() string { return "docker" }

func (b *Backend) labelValue() string { return "cppatlas.runner=" + b.cfg.Instance }

// RunArgs returns the docker argv (without the docker binary) for a run.
func (b *Backend) RunArgs(name string) []string {
	c := b.cfg
	a := []string{"run", "--rm", "-i",
		"--name", name,
		"--label", b.labelValue(),
		"--network", c.Network,
		"--read-only",
		"--user", c.User,
		"--cap-drop", "ALL",
		"--security-opt", "no-new-privileges",
		"--pids-limit", strconv.Itoa(c.PidsLimit),
		"--memory", c.Memory,
		"--memory-swap", c.MemorySwap,
		"--cpus", c.CPUs,
		// RLIMIT_NPROC counts every process of the uid across ALL containers
		// (no user namespaces), so concurrent runs would starve each other.
		// The per-container --pids-limit is the process cap in docker mode.
		"--env", "CPPATLAS_RLIMIT_NPROC=off",
	}
	for _, u := range c.Ulimits {
		a = append(a, "--ulimit", u)
	}
	for _, t := range c.Tmpfs {
		a = append(a, "--tmpfs", t)
	}
	if c.Runtime != "" {
		a = append(a, "--runtime", c.Runtime)
	}
	a = append(a, c.ExtraArgs...)
	a = append(a, c.Image)
	return append(a, c.Command...)
}

func validRunID(id string) bool {
	if id == "" || len(id) > 64 {
		return false
	}
	for _, r := range id {
		if !(r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '-' || r == '_') {
			return false
		}
	}
	return true
}

// Run implements runs.Backend.
func (b *Backend) Run(ctx context.Context, job protocol.Job) (*protocol.Result, error) {
	if !validRunID(job.RunID) {
		return nil, runs.Internal(runs.CodeInternal, errors.New("invalid run id for container name"))
	}
	name := b.cfg.NamePrefix + job.RunID
	log := b.log.With("run", runs.LogID(job.RunID))
	input, err := json.Marshal(job)
	if err != nil {
		return nil, runs.Internal(runs.CodeInternal, err)
	}
	job.Files = nil

	stdout := &capBuffer{max: b.cfg.MaxStdoutBytes}
	stderr := &tailBuffer{max: b.cfg.StderrTailBytes}
	cmd := exec.Command(b.cfg.DockerPath, b.RunArgs(name)...)
	cmd.Stdin = bytes.NewReader(input)
	cmd.Stdout = stdout
	cmd.Stderr = stderr
	cmd.WaitDelay = b.cfg.KillGrace

	if err := ctx.Err(); err != nil {
		return nil, fmt.Errorf("docker run: %w", err)
	}
	b.track(name)
	defer b.untrack(name)
	started := time.Now()
	if err := cmd.Start(); err != nil {
		return nil, runs.Unavailable(fmt.Errorf("start docker: %w", err))
	}
	waitCh := make(chan error, 1)
	go func() { waitCh <- cmd.Wait() }()

	var werr error
	select {
	case werr = <-waitCh:
	case <-ctx.Done():
		log.Warn("killing container", "reason", ctx.Err())
		b.remove(name, true)
		select {
		case <-waitCh:
		case <-time.After(b.cfg.KillGrace):
			_ = cmd.Process.Kill()
			<-waitCh
		}
		b.remove(name, false) // in case it was created while we were killing
		return nil, fmt.Errorf("docker run: %w", ctx.Err())
	}
	elapsed := time.Since(started)
	exitCode := -1
	if cmd.ProcessState != nil {
		exitCode = cmd.ProcessState.ExitCode()
	}
	fail := func(err error) (*protocol.Result, error) {
		log.Error("container run failed", "exit_code", exitCode, "elapsed_ms", elapsed.Milliseconds(),
			"stdout_bytes", stdout.n, "err", err, "stderr_tail", stderr.String())
		b.remove(name, false)
		switch {
		case exitCode == 137:
			return nil, &runs.BackendError{Code: runs.CodeSandboxKilled,
				Message: "The sandbox was killed, most likely because it ran out of memory. Check for runaway allocations.",
				Err:     err}
		case exitCode == 125 || exitCode == 126 || exitCode == 127:
			return nil, runs.Unavailable(err) // docker itself failed (daemon, image, runtime)
		default:
			return nil, runs.Internal(runs.CodeGraderExited, err)
		}
	}
	if stdout.overflow {
		return fail(fmt.Errorf("grader stdout exceeded %d bytes", b.cfg.MaxStdoutBytes))
	}
	res, perr := parseResult(stdout.Bytes())
	if perr != nil {
		if werr != nil {
			perr = fmt.Errorf("%w (docker: %v)", perr, werr)
		}
		return fail(perr)
	}
	log.Debug("container finished", "exit_code", exitCode, "elapsed_ms", elapsed.Milliseconds(), "stderr_tail", stderr.String())
	return res, nil
}

// parseResult requires exactly one JSON document (surrounding whitespace ok).
func parseResult(b []byte) (*protocol.Result, error) {
	if len(bytes.TrimSpace(b)) == 0 {
		return nil, errors.New("grader wrote no result")
	}
	dec := json.NewDecoder(bytes.NewReader(b))
	var res protocol.Result
	if err := dec.Decode(&res); err != nil {
		return nil, fmt.Errorf("invalid result JSON: %w", err)
	}
	if _, err := dec.Token(); err != io.EOF {
		return nil, errors.New("trailing data after result JSON")
	}
	return &res, nil
}

func (b *Backend) track(name string) {
	b.mu.Lock()
	b.live[name] = struct{}{}
	b.mu.Unlock()
}

func (b *Backend) untrack(name string) {
	b.mu.Lock()
	delete(b.live, name)
	b.mu.Unlock()
}

// remove kills (optionally) and force-removes a container by name, each call
// bounded by CleanupTimeout. Errors (typically "no such container") are
// logged at debug level only.
func (b *Backend) remove(name string, kill bool) {
	if kill {
		b.docker("kill", name)
	}
	b.docker("rm", "-f", name)
}

func (b *Backend) docker(args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), b.cfg.CleanupTimeout)
	defer cancel()
	out, err := exec.CommandContext(ctx, b.cfg.DockerPath, args...).CombinedOutput()
	if err != nil {
		b.log.Debug("docker command failed", "args", args[0], "err", err, "out", strings.TrimSpace(string(capString(out, 512))))
	}
	return out, err
}

func capString(b []byte, n int) []byte {
	if len(b) > n {
		return b[:n]
	}
	return b
}

// Cleanup force-removes every container labelled for this Instance. Call it
// at startup (before accepting runs) to reap containers leaked by a crash.
func (b *Backend) Cleanup(ctx context.Context) (int, error) {
	out, err := exec.CommandContext(ctx, b.cfg.DockerPath, "ps", "-aq", "--filter", "label="+b.labelValue()).Output()
	if err != nil {
		return 0, fmt.Errorf("docker ps: %w", err)
	}
	ids := strings.Fields(string(out))
	if len(ids) == 0 {
		return 0, nil
	}
	b.log.Warn("removing leftover run containers", "count", len(ids))
	args := append([]string{"rm", "-f"}, ids...)
	if out, err := exec.CommandContext(ctx, b.cfg.DockerPath, args...).CombinedOutput(); err != nil {
		return 0, fmt.Errorf("docker rm: %w: %s", err, capString(out, 512))
	}
	return len(ids), nil
}

// Close force-removes every container still tracked (backstop for
// Manager.Shutdown, which cancels runs and so already kills them).
func (b *Backend) Close(ctx context.Context) error {
	b.mu.Lock()
	names := make([]string, 0, len(b.live))
	for n := range b.live {
		names = append(names, n)
	}
	b.mu.Unlock()
	var wg sync.WaitGroup
	for _, n := range names {
		wg.Add(1)
		go func() { defer wg.Done(); b.remove(n, true) }()
	}
	done := make(chan struct{})
	go func() { wg.Wait(); close(done) }()
	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// capBuffer keeps the first max bytes and records overflow; it never fails a
// write so the child is never blocked on a full pipe.
type capBuffer struct {
	buf      bytes.Buffer
	max      int
	n        int
	overflow bool
}

func (c *capBuffer) Write(p []byte) (int, error) {
	c.n += len(p)
	if room := c.max - c.buf.Len(); room > 0 {
		if len(p) > room {
			c.buf.Write(p[:room])
			c.overflow = true
		} else {
			c.buf.Write(p)
		}
	} else if len(p) > 0 {
		c.overflow = true
	}
	return len(p), nil
}

func (c *capBuffer) Bytes() []byte { return c.buf.Bytes() }

// tailBuffer keeps the last max bytes.
type tailBuffer struct {
	buf []byte
	max int
}

func (t *tailBuffer) Write(p []byte) (int, error) {
	n := len(p)
	if len(p) >= t.max {
		t.buf = append(t.buf[:0], p[len(p)-t.max:]...)
		return n, nil
	}
	t.buf = append(t.buf, p...)
	if over := len(t.buf) - t.max; over > 0 {
		t.buf = append(t.buf[:0], t.buf[over:]...)
	}
	return n, nil
}

func (t *tailBuffer) String() string { return strings.ToValidUTF8(string(t.buf), "?") }
