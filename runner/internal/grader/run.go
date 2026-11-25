package grader

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/signal"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"cppatlas.com/runner/internal/grader/sandbox"
	"cppatlas.com/runner/internal/protocol"
)

// Main runs `cppatlas-grader run`. Mode B (Fly Machine) is selected when both
// CPPATLAS_API_URL and CPPATLAS_TOKEN are set; otherwise mode A (job on
// stdin, result on stdout). It returns the process exit code (always 0 once
// a result has been delivered or there is no job).
func Main(version string) int {
	logf := func(f string, a ...any) {
		fmt.Fprintf(os.Stderr, "cppatlas-grader: "+f+"\n", a...)
	}
	// Scrub the credentials from our environment before anything else, from
	// /proc/self/environ too (no child ever gets our environment anyway:
	// commands get an explicit env).
	apiURL, token := takeCredentials(logf)
	cfg := LoadConfig(os.Getenv, version)
	if apiURL != "" && token != "" {
		return mainFly(cfg, NewAPI(apiURL, token, logf), logf)
	}
	return mainLocal(cfg, logf)
}

// emitter delivers exactly one Result, whoever (grader, deadline, signal)
// gets there first.
type emitter struct {
	once sync.Once
	done chan struct{}
	fn   func(*protocol.Result)
}

func newEmitter(fn func(*protocol.Result)) *emitter {
	return &emitter{done: make(chan struct{}), fn: fn}
}

func (e *emitter) emit(r *protocol.Result) bool { return e.emitAfter(r, nil) }

// emitAfter claims the single Result slot, runs before (e.g. killing the
// sandbox) and then delivers r. A concurrent emit blocks until delivery and
// loses, so a stage killed by `before` cannot be reported in place of r.
func (e *emitter) emitAfter(r *protocol.Result, before func()) bool {
	first := false
	e.once.Do(func() {
		first = true
		if before != nil {
			before()
		}
		e.fn(r)
		close(e.done)
	})
	return first
}

// active is the sandbox of this run, killed (with everything it started)
// before the process exits early on the deadline or a signal.
var active atomic.Pointer[sandbox.Manager]

// shutdownSandbox kills every process the grader started. Bounded.
func shutdownSandbox(logf func(string, ...any)) {
	if sb := active.Load(); sb != nil {
		if err := sb.KillAll(); err != nil {
			logf("shutdown: %v", err)
		}
	}
}

// overallDeadline bounds the whole run: build + every stage + slack.
func overallDeadline(cfg Config, job protocol.Job) time.Duration {
	if cfg.DeadlineSec > 0 {
		return time.Duration(cfg.DeadlineSec) * time.Second
	}
	l := NormalizeLimits(job.Limits)
	n := len(job.Stages)
	if n == 0 || n > 64 {
		n = 64
	}
	return time.Duration(l.BuildTimeoutSec+n*(l.TestTimeoutSec+2)+30) * time.Second
}

func newSandbox(cfg Config, fly bool, logf func(string, ...any)) (*sandbox.Manager, error) {
	return sandbox.New(sandbox.Options{
		UID: cfg.SandboxUID, GID: cfg.SandboxGID,
		RequireIsolation: fly,
		Masks:            sandbox.DefaultMasks,
		TmpSize:          "256m",
		Logf:             logf,
	})
}

func mainLocal(cfg Config, logf func(string, ...any)) int {
	out := newEmitter(func(r *protocol.Result) {
		b, err := json.Marshal(r)
		if err != nil {
			b, _ = json.Marshal(ErrorResult(r.RunID, r.Challenge, cfg.Version, "grader_internal", "result encoding failed"))
		}
		os.Stdout.Write(append(b, '\n'))
	})
	// Processes running as our uid could otherwise ptrace us or read our
	// /proc entries.
	if err := sandbox.HardenSelf(); err != nil {
		logf("warning: PR_SET_DUMPABLE: %v", err)
	}
	var job protocol.Job
	watchSignals(logf, func(s os.Signal) {
		out.emitAfter(ErrorResult("", "", cfg.Version, "cancelled", fmt.Sprintf("The grader was stopped (%v).", s)),
			func() { shutdownSandbox(logf) })
		os.Exit(0)
	})

	raw, err := io.ReadAll(io.LimitReader(os.Stdin, 16<<20))
	if err != nil || json.Unmarshal(raw, &job) != nil {
		out.emit(ErrorResult("", "", cfg.Version, "bad_job", "The job is not valid JSON."))
		return 0
	}
	if ifs := sandbox.NetworkInterfaces(); len(ifs) > 0 && !cfg.AllowNetwork {
		logf("refusing to grade: network interfaces %v are visible (run with --network none)", ifs)
		out.emit(ErrorResult(job.RunID, job.Challenge, cfg.Version, "sandbox_error", "The grading sandbox is misconfigured (network)."))
		return 0
	}
	sandbox.PrewarmThreads(8)
	sb, err := newSandbox(cfg, false, logf)
	if err != nil {
		logf("%v", err)
		out.emit(ErrorResult(job.RunID, job.Challenge, cfg.Version, "sandbox_error", "The grading sandbox could not start."))
		return 0
	}
	logf("sandbox: %+v", sb.Info())
	return gradeWithDeadline(cfg, job, sb, out, logf)
}

func gradeWithDeadline(cfg Config, job protocol.Job, sb *sandbox.Manager, out *emitter, logf func(string, ...any)) int {
	active.Store(sb)
	d := overallDeadline(cfg, job)
	timer := time.AfterFunc(d, func() {
		logf("hard deadline (%s) reached; killing every sandboxed process", d)
		res := ErrorResult(job.RunID, job.Challenge, cfg.Version, "deadline_exceeded",
			fmt.Sprintf("Grading did not finish within %ds.", int(d.Seconds())))
		if !runIDRe.MatchString(job.RunID) {
			res.RunID = ""
		}
		if !challengeNameRe.MatchString(job.Challenge) {
			res.Challenge = ""
		}
		out.emitAfter(res, func() { shutdownSandbox(logf) })
		os.Exit(0)
	})
	g := &Grader{Cfg: cfg, SB: sb, Logf: logf}
	res := g.Grade(job)
	timer.Stop()
	out.emit(res)
	<-out.done
	return 0
}

func mainFly(cfg Config, api *API, logf func(string, ...any)) int {
	// Self-destruct before anything can hang: fetching is bounded by its own
	// patience, grading by gradeWithDeadline, posting by its patience.
	job, err := api.FetchJob(30 * time.Second)
	if errors.Is(err, ErrNoJob) {
		logf("no job; exiting")
		return 0
	}
	if err != nil {
		logf("%v", err)
		// Nothing to grade; try to tell the API (it may be reachable now).
		api.PostResult(ErrorResult("", "", cfg.Version, "job_fetch_failed", "The grader could not fetch its job."), 10*time.Second)
		return 0
	}
	out := newEmitter(func(r *protocol.Result) {
		if err := api.PostResult(r, 45*time.Second); err != nil {
			logf("%v", err)
		}
	})
	fail := func(code, msg string, err error) int {
		logf("%s: %v", code, err)
		out.emit(ErrorResult(job.RunID, job.Challenge, cfg.Version, code, msg))
		return 0
	}
	// The supervisor must survive the learner: the OOM killer takes the
	// sandboxed command (oom_score_adj 1000) long before us.
	if err := sandbox.SetOOMScoreAdj(-1000); err != nil {
		logf("warning: oom_score_adj: %v", err)
	}
	if err := sandbox.HardenSelf(); err != nil {
		logf("warning: PR_SET_DUMPABLE: %v", err)
	}
	if err := sandbox.EnsureTmpfs(cfg.WorkRoot, cfg.WorkTmpfsSize); err != nil {
		return fail("sandbox_error", "The grading sandbox could not start.", fmt.Errorf("tmpfs %s: %w", cfg.WorkRoot, err))
	}
	watchSignals(logf, func(s os.Signal) {
		out.emitAfter(ErrorResult(job.RunID, job.Challenge, cfg.Version, "cancelled", fmt.Sprintf("The grader was stopped (%v).", s)),
			func() { shutdownSandbox(logf) })
		os.Exit(0)
	})
	sandbox.PrewarmThreads(8)
	sb, err := newSandbox(cfg, true, logf)
	if err != nil {
		return fail("sandbox_error", "The grading sandbox could not start.", err)
	}
	logf("sandbox: %+v", sb.Info())
	return gradeWithDeadline(cfg, job, sb, out, logf)
}

// watchSignals takes over every signal whose Go default would end the
// process. In docker mode sandboxed code runs as our uid and can signal us
// (we are PID 1, so SIGKILL/SIGSTOP from inside the container are ignored by
// the kernel, but signals with a handler are delivered); without this a
// kill(1, SIGABRT) would make the runtime exit with a stack dump and no
// Result. Only SIGTERM (docker stop / Fly stop) cancels; the rest are logged.
func watchSignals(logf func(string, ...any), cancel func(os.Signal)) {
	sigs := make(chan os.Signal, 16)
	signal.Notify(sigs, syscall.SIGTERM, syscall.SIGINT, syscall.SIGHUP, syscall.SIGQUIT,
		syscall.SIGABRT, syscall.SIGILL, syscall.SIGTRAP, syscall.SIGSYS, syscall.SIGBUS,
		syscall.SIGFPE, syscall.SIGSEGV, syscall.SIGUSR1, syscall.SIGUSR2, syscall.SIGALRM,
		syscall.SIGVTALRM, syscall.SIGXCPU, syscall.SIGXFSZ, syscall.SIGPIPE, syscall.Signal(16), syscall.Signal(30))
	go func() {
		for s := range sigs {
			if s == syscall.SIGTERM {
				cancel(s)
				return
			}
			logf("ignoring signal %v", s)
		}
	}()
}
