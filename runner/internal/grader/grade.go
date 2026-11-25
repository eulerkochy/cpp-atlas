package grader

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"

	"cppatlas.com/runner/internal/grader/sandbox"
	"cppatlas.com/runner/internal/protocol"
)

// Runner is the sandbox as seen by the grader (sandbox.Manager in production).
type Runner interface {
	Run(cmd sandbox.Cmd) sandbox.Status
	Info() sandbox.Info
}

// Grader grades one job.
type Grader struct {
	Cfg  Config
	SB   Runner
	Logf func(format string, args ...any)
}

// internalError is reported as RunError{Code}, with a learner-safe message.
type internalError struct {
	code, msg string
	err       error
}

func (e *internalError) Error() string { return e.code + ": " + e.msg + ": " + fmt.Sprint(e.err) }

func ierr(code, msg string, err error) error { return &internalError{code, msg, err} }

// ErrorResult builds a Status "error" result.
func ErrorResult(runID, challenge, version, code, msg string) *protocol.Result {
	return &protocol.Result{
		RunID: runID, Status: protocol.ResultError, Challenge: challenge, GraderVersion: version,
		Stages: []protocol.StageResult{}, Error: &protocol.RunError{Code: code, Message: msg},
	}
}

// Grade runs the whole job and always returns a Result.
func (g *Grader) Grade(job protocol.Job) *protocol.Result {
	t0 := time.Now()
	res, err := g.grade(job, t0)
	if err != nil {
		code, msg := "grader_internal", "The grader failed unexpectedly. Please try again."
		var bj *BadJob
		var ie *internalError
		switch {
		case errors.As(err, &bj):
			code, msg = "bad_job", bj.Msg
		case errors.As(err, &ie):
			code, msg = ie.code, ie.msg
		}
		g.Logf("grade: %v", err)
		res = ErrorResult(job.RunID, job.Challenge, g.Cfg.Version, code, msg)
		if !runIDRe.MatchString(job.RunID) {
			res.RunID = ""
		}
		if !challengeNameRe.MatchString(job.Challenge) {
			res.Challenge = ""
		}
	}
	res.Timings.TotalMs = time.Since(t0).Milliseconds()
	CapResult(res, g.Cfg.ResultMaxBytes)
	return res
}

type stageRun struct {
	Stage
	built      bool
	buildLines []string
	buildMs    int64
}

func (g *Grader) grade(job protocol.Job, t0 time.Time) (*protocol.Result, error) {
	v, err := ValidateJob(job, g.Cfg)
	if err != nil {
		return nil, err
	}
	man, err := LoadManifest(g.Cfg, job.Challenge)
	if err != nil {
		return nil, ierr("grader_internal", "The grader image is incomplete (no prebuilt build).", err)
	}
	vkey := VariantKey(v.Compiler, v.Preset)
	variant, ok := man.Variants[vkey]
	if !ok {
		return nil, &BadJob{Msg: fmt.Sprintf("compiler %s with preset %s is not available", v.Compiler, v.Preset)}
	}

	res := &protocol.Result{
		RunID: job.RunID, Status: protocol.ResultCompleted, Challenge: job.Challenge,
		GraderVersion: g.Cfg.Version, Compiler: variant.Version, Preset: v.Preset,
		Stages: []protocol.StageResult{},
	}
	info := g.SB.Info()
	privileged := info.Mode == "namespaces" || info.Mode == "setuid"

	// ------------------------------------------------------------- setup
	work := filepath.Join(g.Cfg.WorkRoot, job.Challenge)
	buildDir := filepath.Join(work, variant.BuildDir)
	tmpDir := filepath.Join(g.Cfg.WorkRoot, "tmp")
	runRoot := filepath.Join(g.Cfg.WorkRoot, "run")
	homeDir := filepath.Join(g.Cfg.WorkRoot, "home")
	for _, d := range []string{work, tmpDir, runRoot, homeDir} {
		if err := os.RemoveAll(d); err != nil {
			return nil, ierr("grader_internal", "Could not prepare the work directory.", err)
		}
	}
	skipSrc := func(rel string, d fs.DirEntry) bool {
		top := strings.SplitN(rel, "/", 2)[0]
		return top == "build" || top == "solution" || strings.HasPrefix(top, ".")
	}
	if err := CopyTree(v.SrcDir, work, skipSrc); err != nil {
		return nil, ierr("grader_internal", "Could not prepare the work directory.", err)
	}
	if err := CopyTree(filepath.Join(g.Cfg.PrebuiltDir(job.Challenge), "build", vkey), buildDir, nil); err != nil {
		return nil, ierr("grader_internal", "Could not prepare the build directory.", err)
	}
	for _, s := range v.All {
		os.Remove(filepath.Join(buildDir, s.Target)) // never run a stale executable
	}
	learner := map[string]bool{}
	for _, p := range v.Files {
		if err := WriteNewFile(work, p, []byte(job.Files[p])); err != nil {
			return nil, &BadJob{Msg: fmt.Sprintf("file %q cannot be written", p)}
		}
		learner[p] = true
	}
	for _, d := range []string{tmpDir, filepath.Join(tmpDir, "ccache"), runRoot, homeDir} {
		if err := os.MkdirAll(d, 0o700); err != nil {
			return nil, ierr("grader_internal", "Could not prepare the work directory.", err)
		}
	}
	if privileged {
		// The build runs as the sandbox uid and needs to write the build dir.
		for _, d := range []string{work, tmpDir, homeDir} {
			if err := ChownTree(d, info.UID, info.GID); err != nil {
				return nil, ierr("grader_internal", "Could not prepare the work directory.", err)
			}
		}
		os.Chmod(runRoot, 0o755)
	}
	ps := NewPathStripper(work, v.SrcDir, g.Cfg.PrebuiltDir(job.Challenge), runRoot, tmpDir, homeDir)
	res.Timings.SetupMs = time.Since(t0).Milliseconds()

	// ------------------------------------------------------------- build
	tb := time.Now()
	runs := make([]*stageRun, len(v.Stages))
	targets := make([]string, len(v.Stages))
	for i, s := range v.Stages {
		runs[i] = &stageRun{Stage: s}
		targets[i] = s.Target
	}
	lim := v.Limits
	baseEnv := []string{
		"PATH=/usr/local/bin:/usr/bin:/bin",
		"LC_ALL=C", "LANG=C",
		"HOME=" + homeDir,
		"TMPDIR=" + tmpDir,
	}
	buildEnv := append(append([]string{}, baseEnv...),
		"NINJA_STATUS="+NinjaStatusPrefix+"%f/%t] ",
		"CCACHE_TEMPDIR="+filepath.Join(tmpDir, "ccache"),
	)
	if man.Ccache != "" {
		buildEnv = append(buildEnv,
			"CCACHE_DIR="+filepath.Join(g.Cfg.PrebuiltDir(job.Challenge), man.Ccache),
			"CCACHE_READONLY=1", "CCACHE_NOSTATS=1")
	} else {
		buildEnv = append(buildEnv, "CCACHE_DISABLE=1")
	}
	jobs := g.buildJobs(lim, len(targets))
	ninja := lookPath("ninja")
	buildCap := &LineCapture{Limit: 4 << 20, MaxLine: 1 << 16}
	bst := g.SB.Run(sandbox.Cmd{
		Path: ninja,
		Args: append([]string{"-C", buildDir, "-k", "0", "-j", strconv.Itoa(jobs)}, targets...),
		Env:  buildEnv, Dir: buildDir,
		Limits:          g.limits(lim, lim.BuildTimeoutSec, true),
		Timeout:         time.Duration(lim.BuildTimeoutSec) * time.Second,
		MemoryBytes:     int64(lim.MemoryMB) << 20,
		Pids:            lim.MaxProcs,
		Output:          buildCap,
		KillAfterOutput: g.Cfg.OutputKillBytes,
		Seccomp:         g.Cfg.Seccomp,
	})
	buildCap.Close()
	res.Timings.BuildMs = time.Since(tb).Milliseconds()
	g.Logf("build: %d target(s) -j%d in %dms exit=%d sig=%s timeout=%v out=%dB",
		len(targets), jobs, res.Timings.BuildMs, bst.ExitCode, bst.SignalName, bst.TimedOut, bst.OutputBytes)
	if bst.StartErr != nil {
		return nil, ierr("sandbox_error", "The sandbox could not start the build.", bst.StartErr)
	}
	if bst.CleanupErr != nil {
		return nil, ierr("sandbox_cleanup_failed", "The sandbox could not clean up after the build.", bst.CleanupErr)
	}
	buildLog := ps.Strip(Sanitize(buildCap.Bytes()))
	edges, preamble := SplitNinjaLog(buildLog)
	byN := map[int]*stageRun{}
	for _, r := range runs {
		byN[r.N] = r
	}
	for _, e := range edges {
		if !e.Failed {
			continue
		}
		if r := byN[EdgeStage(e)]; r != nil {
			r.buildLines = append(r.buildLines, e.Lines...)
		} else {
			// A shared (support) step failed: it affects every stage.
			for _, r := range runs {
				r.buildLines = append(r.buildLines, e.Lines...)
			}
		}
	}
	ninjaTimes := readNinjaLogTimes(filepath.Join(buildDir, ".ninja_log"), tb)
	// The compilers' temporary files are not needed any more; /work is a
	// size-capped tmpfs (memory), so nothing may pile up across steps.
	EmptyDir(tmpDir)
	if privileged {
		// From here on the sandbox uid only runs tests: hand the tree back to
		// root so a test program cannot replace a later stage's executable.
		if err := ChownTree(work, 0, 0); err != nil {
			return nil, ierr("grader_internal", "Could not prepare the test directory.", err)
		}
	}
	for _, r := range runs {
		fi, err := os.Lstat(filepath.Join(buildDir, r.Target))
		r.built = err == nil && fi.Mode().IsRegular() && fi.ModTime().After(tb.Add(-time.Second))
		r.buildMs = ninjaTimes[r.Target]
		if r.buildMs == 0 {
			r.buildMs = res.Timings.BuildMs
		}
	}

	// ------------------------------------------------------------- tests
	tt := time.Now()
	stop := false
	allPassed := true
	for _, r := range runs {
		var sr protocol.StageResult
		switch {
		case stop:
			sr = protocol.StageResult{Stage: r.N, Status: protocol.StageSkipped}
		case !r.built:
			sr = g.buildFailure(r, bst, lim, learner, preamble, ps)
		default:
			var cleanupErr error
			sr, cleanupErr = g.runStage(r, variant, v, lim, buildDir, runRoot, baseEnv, ps, privileged, info)
			// Whatever this stage wrote (its run dir, $TMPDIR, $HOME) is
			// dropped before the next one starts, so one stage filling the
			// disk cannot fail the others.
			os.RemoveAll(filepath.Join(runRoot, r.Target))
			EmptyDir(tmpDir)
			EmptyDir(homeDir)
			if cleanupErr != nil {
				res.Stages = append(res.Stages, sr)
				res.Timings.TestMs = time.Since(tt).Milliseconds()
				return nil, ierr("sandbox_cleanup_failed", "The sandbox could not stop a test program.", cleanupErr)
			}
		}
		if !stop || sr.Status != protocol.StageSkipped {
			sr.BuildMs = r.buildMs
		}
		if sr.Status != protocol.StagePassed {
			allPassed = false
			if job.StopOnFail {
				stop = true
			}
		}
		res.Stages = append(res.Stages, sr)
	}
	res.Timings.TestMs = time.Since(tt).Milliseconds()
	res.Passed = allPassed && len(res.Stages) > 0
	return res, nil
}

// buildJobs picks the ninja parallelism: CPU quota (cgroup) or CPU count,
// bounded by memory (~450 MB per concurrent compiler) and the target count.
func (g *Grader) buildJobs(lim protocol.Limits, targets int) int {
	if g.Cfg.BuildJobs > 0 {
		return g.Cfg.BuildJobs
	}
	cpus := sandbox.CPUQuota()
	if cpus <= 0 {
		cpus = float64(runtime.NumCPU())
	}
	j := int(math.Ceil(cpus))
	if m := lim.MemoryMB / 450; j > m {
		j = m
	}
	if j > 8 {
		j = 8
	}
	if j > targets {
		j = targets
	}
	if j < 1 {
		j = 1
	}
	return j
}

func (g *Grader) limits(lim protocol.Limits, timeoutSec int, addressSpace bool) []sandbox.Limit {
	out := []sandbox.Limit{
		{Name: "cpu", Value: uint64(timeoutSec + 5)},
		{Name: "fsize", Value: uint64(lim.MaxFileMB) << 20},
		{Name: "nofile", Value: uint64(lim.MaxOpenFiles)},
		{Name: "core", Value: 0},
		{Name: "memlock", Value: 64 << 10},
		{Name: "msgqueue", Value: 0},
	}
	if addressSpace {
		out = append(out, sandbox.Limit{Name: "as", Value: uint64(lim.MemoryMB) << 20})
	}
	switch np := strings.TrimSpace(g.Cfg.NProc); np {
	case "off", "0":
	case "":
		out = append(out, sandbox.Limit{Name: "nproc", Value: uint64(lim.MaxProcs)})
	default:
		if n, err := strconv.Atoi(np); err == nil && n > 0 {
			out = append(out, sandbox.Limit{Name: "nproc", Value: uint64(n)})
		}
	}
	return out
}

func (g *Grader) buildFailure(r *stageRun, bst sandbox.Status, lim protocol.Limits, learner map[string]bool, preamble []string, ps *PathStripper) protocol.StageResult {
	sr := protocol.StageResult{Stage: r.N}
	lines := r.buildLines
	if len(lines) == 0 {
		// No step output for this stage: show ninja's own messages (missing
		// target, cmake re-run failure, ...).
		for _, l := range preamble {
			if !strings.HasPrefix(l, "ninja: build stopped") {
				lines = append(lines, l)
			}
		}
	}
	cs := SummarizeCompile(lines, SummaryOptions{LearnerFiles: learner, OutputLimit: lim.OutputBytes})
	switch {
	case bst.TimedOut && len(r.buildLines) == 0:
		sr.Status = protocol.StageTimeout
		sr.Phase = "build"
		sr.Hint = fmt.Sprintf("The build did not finish within %ds and was stopped. Endless template recursion or a constexpr evaluation that never ends?", lim.BuildTimeoutSec)
		if cs.Output != "" || cs.FirstError != "" {
			sr.Compile = cs
		}
	case bst.OutputFlood && len(r.buildLines) == 0:
		sr.Status = protocol.StageCompileError
		sr.Phase = "build"
		sr.Hint = "The compiler produced an enormous amount of output and was stopped."
		sr.Compile = cs
	default:
		sr.Status = protocol.StageCompileError
		sr.Compile = cs
		if bst.OOMKilled || compilerOOMRe.MatchString(strings.Join(lines, "\n")) {
			sr.Hint = fmt.Sprintf("The compiler ran out of memory (limit %d MB). Endless or exponential template instantiation?", lim.MemoryMB)
		}
		if cs.FirstError == "" && len(cs.Preflight) == 0 && cs.Output == "" {
			cs.FirstError = "The stage did not build (no compiler message was captured)."
		}
	}
	return sr
}

var runningPrefix = []byte("[cppatlas] running: ")

var compilerOOMRe = regexp.MustCompile(`(?m)^(?:LLVM ERROR: out of memory|virtual memory exhausted|.*cc1plus: out of memory|.*std::bad_alloc)`)

func (g *Grader) runStage(r *stageRun, variant Variant, v *ValidatedJob, lim protocol.Limits, buildDir, runRoot string, baseEnv []string, ps *PathStripper, privileged bool, info sandbox.Info) (protocol.StageResult, error) {
	sr := protocol.StageResult{Stage: r.N}
	runDir := filepath.Join(runRoot, r.Target)
	os.RemoveAll(runDir)
	if err := os.MkdirAll(filepath.Join(runDir, "tmp"), 0o700); err != nil {
		return sr, ierr("grader_internal", "Could not prepare the test directory.", err)
	}
	if privileged {
		ChownTree(runDir, info.UID, info.GID)
	}
	report := filepath.Join(runDir, "report.xml")
	trace := filepath.Join(runDir, "trace.jsonl")
	asan := v.Preset == protocol.PresetAsanUbsan

	env := append([]string{}, baseEnv...)
	env = append(env[:0:0], env...)
	for i, e := range env {
		if strings.HasPrefix(e, "HOME=") {
			env[i] = "HOME=" + runDir
		} else if strings.HasPrefix(e, "TMPDIR=") {
			env[i] = "TMPDIR=" + filepath.Join(runDir, "tmp")
		}
	}
	env = append(env, "CPPATLAS_PROGRESS=1")
	if v.Job.Options.Trace {
		env = append(env, "CPPATLAS_TRACE="+trace)
	}
	env = append(env, testEnv(variant.TestEnv, lim, asan)...)

	var running string
	capt := &LineCapture{Limit: lim.OutputBytes, MaxLine: 4096, Filter: func(line []byte) bool {
		if bytes.HasPrefix(line, runningPrefix) {
			running = capLine(string(line[len(runningPrefix):]), 300)
			return true
		}
		return false
	}}
	st := g.SB.Run(sandbox.Cmd{
		Path:            filepath.Join(buildDir, r.Target),
		Args:            []string{"--no-intro", "--no-breaks", "--reporters=xml", "--out=" + report},
		Env:             env,
		Dir:             runDir,
		Limits:          g.limits(lim, lim.TestTimeoutSec, !asan),
		Timeout:         time.Duration(lim.TestTimeoutSec) * time.Second,
		MemoryBytes:     int64(lim.MemoryMB) << 20,
		Pids:            lim.MaxProcs,
		Output:          capt,
		KillAfterOutput: g.Cfg.OutputKillBytes,
		Seccomp:         g.Cfg.Seccomp,
	})
	capt.Close()
	sr.RunMs = st.Wall.Milliseconds()
	g.Logf("stage %d: exit=%v/%d sig=%s timeout=%v flood=%v oom=%v out=%dB %dms",
		r.N, st.Exited, st.ExitCode, st.SignalName, st.TimedOut, st.OutputFlood, st.OOMKilled, st.OutputBytes, sr.RunMs)
	if st.StartErr != nil {
		return sr, ierr("sandbox_error", "The sandbox could not start a test program.", st.StartErr)
	}

	running = Sanitize([]byte(running))
	var rep *Report
	if f, err := OpenUntrusted(report); err == nil {
		rep = ParseDoctestXML(f, ps)
		f.Close()
	} else {
		rep = &Report{ParseError: "no report"}
	}
	rawOut, _ := CleanCapped(capt.Bytes(), ps, lim.OutputBytes, false)

	if len(rep.Tests) > 0 {
		sr.Tests = rep.Tests
		sr.Counts = rep.Counts()
	}
	if st.Exited {
		code := st.ExitCode
		sr.ExitCode = &code
	}
	sanitizer := sanitizerSummary(rawOut)

	switch {
	case st.TimedOut:
		sr.Status = protocol.StageTimeout
		sr.Phase = "test"
		sr.RunningTest = running
		sr.Hint = fmt.Sprintf("Stage %d did not finish within %ds and was stopped.", r.N, lim.TestTimeoutSec)
		if running != "" {
			sr.Hint += fmt.Sprintf(" It was running the test case %q.", running)
		}
		sr.Hint += " An infinite loop? (e.g. growing capacity 0 * 2 == 0 forever)"
	case st.OutputFlood:
		sr.Status = protocol.StageFailed
		sr.Phase = "test"
		sr.RunningTest = running
		sr.Hint = fmt.Sprintf("The test program printed more than %s of output and was stopped.", humanBytes(int(g.Cfg.OutputKillBytes)))
	case st.OOMKilled || (st.Signal == 9 && !st.TimedOut):
		sr.Status = protocol.StageCrashed
		sr.Phase = "test"
		sr.Signal = st.SignalName
		sr.RunningTest = running
		sr.Hint = fmt.Sprintf("The test program was killed, most likely for exceeding the memory limit (%d MB).", lim.MemoryMB)
	case st.Signal != 0:
		sr.Status = protocol.StageCrashed
		sr.Phase = "test"
		sr.Signal = st.SignalName
		sr.RunningTest = running
		sr.Hint = fmt.Sprintf("The test program crashed (%s)", st.SignalName)
		if running != "" {
			sr.Hint += fmt.Sprintf(" in test case %q", running)
		}
		sr.Hint += "."
		if !asan {
			sr.Hint += " Try the asan-ubsan preset for a precise report."
		}
	case sanitizer != "":
		sr.Status = protocol.StageCrashed
		sr.Phase = "test"
		sr.RunningTest = running
		sr.Hint = sanitizer
	case st.Exited && st.ExitCode == 0 && rep.AllPassed():
		sr.Status = protocol.StagePassed
	case st.Exited && st.ExitCode == 0:
		sr.Status = protocol.StageFailed
		sr.Phase = "test"
		sr.Hint = "The test program exited before reporting its results (does your code call exit(), quick_exit() or _Exit()?)."
		if rep.Complete && len(rep.Tests) == 0 {
			sr.Hint = "No test case ran."
		}
	default:
		sr.Status = protocol.StageFailed
		if !rep.Complete {
			sr.Phase = "test"
			sr.RunningTest = running
			sr.Hint = "The test program stopped before reporting all its results."
		}
	}

	if sr.Status != protocol.StagePassed && sr.Status != protocol.StageTimeout && !st.OutputFlood {
		if free, ok := sandbox.FreeBytes(runDir); ok && free < 4<<20 {
			sr.Hint = "The test program filled the available disk space, so its results could not be written. " +
				"Do not write large files: the stage's working directory, $TMPDIR and /tmp share a small quota."
		}
	}
	if sr.Status != protocol.StagePassed {
		text := RenderReport(rep)
		if rawOut != "" {
			if text != "" {
				text += "\n"
			}
			text += rawOut
		}
		sr.Output, sr.OutputTruncated = CapText(text, lim.OutputBytes, capt.Truncated())
		if v.Job.Options.Trace {
			sr.Trace, sr.TraceTruncated = readTrace(trace, lim.TraceBytes, focusTest(rep, sr.RunningTest))
		}
	}
	if st.CleanupErr != nil {
		return sr, st.CleanupErr
	}
	return sr, nil
}

// testEnv returns the challenge's test environment (sanitizer options from
// cppatlas-test-env.txt) with the grader's additions.
func testEnv(base []string, lim protocol.Limits, asan bool) []string {
	var out []string
	hasASan := false
	for _, e := range base {
		k, val, ok := strings.Cut(e, "=")
		if !ok || !regexp.MustCompile(`^[A-Z][A-Z0-9_]*$`).MatchString(k) {
			continue
		}
		if k == "ASAN_OPTIONS" && asan {
			hasASan = true
			val = strings.TrimSuffix(val, ":") + fmt.Sprintf(":hard_rss_limit_mb=%d:disable_coredump=1", lim.MemoryMB)
		}
		out = append(out, k+"="+val)
	}
	if asan && !hasASan {
		out = append(out, fmt.Sprintf("ASAN_OPTIONS=hard_rss_limit_mb=%d:disable_coredump=1", lim.MemoryMB))
	}
	return out
}

var sanitizerRe = regexp.MustCompile(`(?m)^SUMMARY: (AddressSanitizer|UndefinedBehaviorSanitizer|LeakSanitizer|MemorySanitizer|ThreadSanitizer): ?(.*)$|(?m)^(.*runtime error: .*)$`)

func sanitizerSummary(out string) string {
	if !strings.Contains(out, "Sanitizer") && !strings.Contains(out, "runtime error:") {
		return ""
	}
	m := sanitizerRe.FindStringSubmatch(out)
	if m == nil {
		return ""
	}
	if m[1] != "" {
		return capLine(m[1]+": "+m[2], 400)
	}
	return capLine("UndefinedBehaviorSanitizer: "+m[3], 400)
}

// focusTest is the test case whose trace is most useful: the running one at
// a crash/timeout, else the first failed one.
func focusTest(rep *Report, running string) string {
	if running != "" {
		return running
	}
	for _, t := range rep.Tests {
		if t.Status != protocol.StagePassed {
			return t.Name
		}
	}
	return ""
}

// readTrace extracts the JSON Lines trace segment of the test case named
// focus (from its {"ev":"test"} marker to the next one), or the start of the
// trace if focus is not found. Each line must be a JSON object; the segment
// is capped at limit bytes.
func readTrace(path string, limit int, focus string) ([]json.RawMessage, bool) {
	f, err := OpenUntrusted(path)
	if err != nil {
		return nil, false
	}
	defer f.Close()
	sc := bufio.NewScanner(&limitedReader{r: f, n: 256 << 20})
	sc.Buffer(make([]byte, 64<<10), 64<<10)
	var (
		out       []json.RawMessage
		size      int
		truncated bool
		inFocus   = focus == ""
		found     bool
		head      []json.RawMessage
		headSize  int
	)
	for sc.Scan() {
		line := bytes.TrimSpace(sc.Bytes())
		if len(line) == 0 || line[0] != '{' || len(line) > 4096 || !json.Valid(line) {
			continue
		}
		var ev struct {
			Ev   string `json:"ev"`
			Name string `json:"name"`
		}
		_ = json.Unmarshal(line, &ev)
		if ev.Ev == "test" && focus != "" {
			if found && inFocus {
				break // end of the focused test's segment
			}
			inFocus = ev.Name == focus
			found = found || inFocus
		}
		if headSize+len(line) <= limit && !found {
			head = append(head, json.RawMessage(append([]byte(nil), line...)))
			headSize += len(line)
		}
		if !inFocus {
			continue
		}
		if size+len(line) > limit {
			truncated = true
			if focus == "" {
				break
			}
			continue
		}
		out = append(out, json.RawMessage(append([]byte(nil), line...)))
		size += len(line)
	}
	if focus != "" && !found {
		return head, headSize >= limit
	}
	return out, truncated
}

type limitedReader struct {
	r interface{ Read([]byte) (int, error) }
	n int64
}

func (l *limitedReader) Read(p []byte) (int, error) {
	if l.n <= 0 {
		return 0, errors.New("trace too large")
	}
	if int64(len(p)) > l.n {
		p = p[:l.n]
	}
	n, err := l.r.Read(p)
	l.n -= int64(n)
	return n, err
}

// readNinjaLogTimes returns, per stage_NN target, the summed build time of
// its object and link steps recorded since `since` (.ninja_log v5/v6/v7:
// start_ms end_ms mtime output hash).
func readNinjaLogTimes(path string, since time.Time) map[string]int64 {
	out := map[string]int64{}
	b, _, err := ReadUntrusted(path, 8<<20)
	if err != nil {
		return out
	}
	type entry struct{ start, end int64 }
	last := map[string]entry{}
	var order []string
	for _, line := range strings.Split(string(b), "\n") {
		f := strings.Split(line, "\t")
		if len(f) < 4 || strings.HasPrefix(line, "#") {
			continue
		}
		s, err1 := strconv.ParseInt(f[0], 10, 64)
		e, err2 := strconv.ParseInt(f[1], 10, 64)
		if err1 != nil || err2 != nil {
			continue
		}
		if _, seen := last[f[3]]; !seen {
			order = append(order, f[3])
		}
		last[f[3]] = entry{s, e}
	}
	_ = since
	for _, o := range order {
		m := stageTargetRe.FindStringSubmatch(o)
		if m == nil {
			continue
		}
		e := last[o]
		out["stage_"+m[1]] += e.end - e.start
	}
	return out
}

// lookPath finds a program in the standard PATH without spawning anything.
func lookPath(name string) string {
	for _, d := range []string{"/usr/local/bin", "/usr/bin", "/bin"} {
		p := filepath.Join(d, name)
		if fi, err := os.Stat(p); err == nil && fi.Mode().IsRegular() && fi.Mode()&0o111 != 0 {
			return p
		}
	}
	return name
}

// ------------------------------------------------------------------ capping

// CapResult keeps the marshalled Result under max bytes, degrading in order:
// traces, then outputs (to 8 KB, then dropped), then test messages, then the
// passing test lists.
func CapResult(res *protocol.Result, max int) {
	size := func() int {
		b, _ := json.Marshal(res)
		return len(b)
	}
	if max <= 0 || size() <= max {
		return
	}
	for i := range res.Stages {
		if res.Stages[i].Trace != nil {
			res.Stages[i].Trace = nil
			res.Stages[i].TraceTruncated = true
		}
	}
	if size() <= max {
		return
	}
	for _, lim := range []int{8 << 10, 1 << 10} {
		for i := range res.Stages {
			s := &res.Stages[i]
			if len(s.Output) > lim {
				s.Output, _ = CapText(s.Output, lim, false)
				s.OutputTruncated = true
			}
			if s.Compile != nil && len(s.Compile.Output) > lim {
				s.Compile.Output, _ = CapText(s.Compile.Output, lim, false)
				s.Compile.Truncated = true
			}
		}
		if size() <= max {
			return
		}
	}
	for i := range res.Stages {
		s := &res.Stages[i]
		for j := range s.Tests {
			if len(s.Tests[j].Messages) > 2 {
				s.Tests[j].Messages = append(s.Tests[j].Messages[:2], "... (more messages dropped: result size limit)")
			}
		}
	}
	if size() <= max {
		return
	}
	for i := range res.Stages {
		s := &res.Stages[i]
		var keep []protocol.TestCase
		for _, t := range s.Tests {
			if t.Status != protocol.StagePassed {
				keep = append(keep, t)
			}
		}
		s.Tests = keep
	}
	if size() <= max {
		return
	}
	for i := range res.Stages {
		res.Stages[i].Tests = nil
		res.Stages[i].Output = ""
		if res.Stages[i].Compile != nil {
			res.Stages[i].Compile.Output = ""
		}
	}
}
