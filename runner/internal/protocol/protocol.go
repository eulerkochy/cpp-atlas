// Package protocol is the shared contract between the API process, the run
// backends, the GitHub integration and the grader binary that runs inside the
// sandbox. It has no dependencies and no behaviour beyond small helpers.
//
// Data flow:
//
//	client/webhook -> Submission -> Runner.Submit -> (queue) -> Backend
//	Backend -> Job -> grader (stdin in docker mode, fetch-once over 6PN on Fly)
//	grader -> Result -> Backend/internal endpoint -> RunView -> client / Check Run
package protocol

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

// ---------------------------------------------------------------- challenges

// ChallengeSpec describes one challenge the API accepts submissions for. The
// grader image carries the matching challenge tree; nothing here names a test.
type ChallengeSpec struct {
	Name string `json:"name"` // "vector"
	// Stages is the highest stage number (stages are 1..Stages).
	Stages int `json:"stages"`
	// AllowedFiles is the exact allowlist of relative paths a submission may
	// contain, e.g. ["include/my/vector.hpp"].
	AllowedFiles []string `json:"allowed_files"`
	// RequiredFiles must all be present in a submission.
	RequiredFiles []string `json:"required_files"`
	// MaxFileBytes caps each file; MaxTotalBytes caps the sum.
	MaxFileBytes  int `json:"max_file_bytes"`
	MaxTotalBytes int `json:"max_total_bytes"`
}

// ---------------------------------------------------------------- submission

// Compiler and preset names accepted in Options.
const (
	CompilerGCC   = "gcc"
	CompilerClang = "clang"

	PresetDebug     = "debug"
	PresetAsanUbsan = "asan-ubsan"
)

// Options selects how the grader builds. Zero values mean "server default".
type Options struct {
	Compiler string `json:"compiler,omitempty"` // CompilerGCC | CompilerClang
	Preset   string `json:"preset,omitempty"`   // PresetDebug | PresetAsanUbsan
	// Trace asks for the JSON Lines trace (tests/support/trace.hpp) of failing
	// stages to be attached to the result, capped.
	Trace bool `json:"trace,omitempty"`
}

// Source of a submission.
const (
	SourceWeb    = "web"
	SourceGitHub = "github"
)

// Submission is what the HTTP layer and the GitHub webhook hand to the Runner.
// Runner.Submit validates it against the ChallengeSpec (allowlist, sizes,
// stage range, UTF-8, no NUL bytes); callers do not need to pre-validate.
type Submission struct {
	Challenge string
	// Stages to run, ascending, 1-based, no duplicates. Empty means all.
	Stages []int
	// StopOnFail: stages after the first non-passing one are reported
	// StageSkipped and not run (they may still be compiled, because all
	// requested stages are built in one parallel build).
	StopOnFail bool
	Files      map[string]string
	Options    Options
	Source     string // SourceWeb | SourceGitHub
	// ClientKey identifies the submitter for logging (IP, or "gh:owner/repo").
	ClientKey string
}

// StagesUpTo returns [1..n].
func StagesUpTo(n int) []int {
	out := make([]int, 0, n)
	for i := 1; i <= n; i++ {
		out = append(out, i)
	}
	return out
}

// ------------------------------------------------------------------- the job

// Limits are enforced by the grader inside the sandbox. The backend enforces
// the outer wall clock (Runner config) independently.
type Limits struct {
	BuildTimeoutSec int `json:"build_timeout_sec"` // whole build phase (all requested stages)
	TestTimeoutSec  int `json:"test_timeout_sec"`  // per stage executable
	OutputBytes     int `json:"output_bytes"`      // per captured stream (compile output, test output)
	TraceBytes      int `json:"trace_bytes"`       // per stage trace cap
	MemoryMB        int `json:"memory_mb"`         // address-space / cgroup cap for compiler and tests
	MaxProcs        int `json:"max_procs"`         // RLIMIT_NPROC / pids cap
	MaxFileMB       int `json:"max_file_mb"`       // RLIMIT_FSIZE
	MaxOpenFiles    int `json:"max_open_files"`    // RLIMIT_NOFILE
}

// DefaultLimits are used when a Job leaves a field zero.
func DefaultLimits() Limits {
	return Limits{
		BuildTimeoutSec: 60,
		TestTimeoutSec:  20,
		OutputBytes:     64 << 10,
		TraceBytes:      256 << 10,
		MemoryMB:        2048,
		MaxProcs:        128,
		MaxFileMB:       64,
		MaxOpenFiles:    256,
	}
}

// Job is the single JSON document the grader receives.
//   - docker backend: on stdin.
//   - fly backend: GET {CPPATLAS_API_URL}/internal/job with
//     "Authorization: Bearer {CPPATLAS_TOKEN}"; it can be fetched exactly once.
type Job struct {
	RunID      string            `json:"run_id"`
	Challenge  string            `json:"challenge"`
	Stages     []int             `json:"stages"`
	StopOnFail bool              `json:"stop_on_fail"`
	Files      map[string]string `json:"files"`
	Options    Options           `json:"options"`
	Limits     Limits            `json:"limits"`
}

// ---------------------------------------------------------------- the result

// Result.Status values.
const (
	ResultCompleted = "completed" // the grader ran; see Passed and Stages
	ResultError     = "error"     // the grader itself failed; see Error
)

// StageResult.Status values.
const (
	StagePassed       = "passed"
	StageFailed       = "failed"        // built and ran; at least one test case failed
	StageCompileError = "compile_error" // did not build; see Compile
	StageTimeout      = "timeout"       // build or test exceeded its limit; see Phase
	StageCrashed      = "crashed"       // killed by a signal / sanitizer abort; see Signal
	StageSkipped      = "skipped"       // not run because an earlier stage did not pass
)

// Result is the single JSON document the grader produces.
//   - docker backend: exactly one JSON document on stdout (stderr is logs).
//   - fly backend: POST {CPPATLAS_API_URL}/internal/result with the bearer token.
//
// It never contains test or solution source text and never contains absolute
// paths from inside the sandbox.
type Result struct {
	RunID         string        `json:"run_id"`
	Status        string        `json:"status"`
	Passed        bool          `json:"passed"` // every requested stage passed
	Challenge     string        `json:"challenge"`
	GraderVersion string        `json:"grader_version,omitempty"`
	Compiler      string        `json:"compiler,omitempty"` // e.g. "g++ 16.2.0"
	Preset        string        `json:"preset,omitempty"`
	Stages        []StageResult `json:"stages"`
	Timings       Timings       `json:"timings"`
	Error         *RunError     `json:"error,omitempty"`
}

type Timings struct {
	TotalMs int64 `json:"total_ms"`
	SetupMs int64 `json:"setup_ms"`
	BuildMs int64 `json:"build_ms"`
	TestMs  int64 `json:"test_ms"`
}

type RunError struct {
	Code    string `json:"code"`    // stable machine code, e.g. "grader_internal", "bad_job"
	Message string `json:"message"` // safe to show to the learner
}

type StageResult struct {
	Stage  int    `json:"stage"`
	Status string `json:"status"`
	// Phase is "build" or "test": where a timeout / crash happened.
	Phase   string          `json:"phase,omitempty"`
	Compile *CompileSummary `json:"compile,omitempty"`
	Tests   []TestCase      `json:"tests,omitempty"`
	Counts  *TestCounts     `json:"counts,omitempty"`
	// Output is the cleaned, capped test-run output (stdout+stderr), for
	// display when the structured Tests are not enough (crash, sanitizer report).
	Output          string `json:"output,omitempty"`
	OutputTruncated bool   `json:"output_truncated,omitempty"`
	// Signal is set when the test executable died from a signal, e.g. "SIGSEGV".
	Signal   string `json:"signal,omitempty"`
	ExitCode *int   `json:"exit_code,omitempty"`
	// RunningTest is the test case that was executing at a timeout or crash.
	RunningTest string `json:"running_test,omitempty"`
	// Hint is a short human explanation for timeouts/crashes/limits.
	Hint    string `json:"hint,omitempty"`
	BuildMs int64  `json:"build_ms"`
	RunMs   int64  `json:"run_ms"`
	// Trace is the capped JSON Lines trace, one raw JSON object per element.
	Trace          []json.RawMessage `json:"trace,omitempty"`
	TraceTruncated bool              `json:"trace_truncated,omitempty"`
}

// CompileSummary is the learner-facing digest of a failed build.
type CompileSummary struct {
	// FirstError is the first real compiler error (not a preflight
	// static_assert), "file:line:col: error: message" with internal paths
	// stripped; empty when the only errors are preflight messages.
	FirstError string `json:"first_error,omitempty"`
	// Preflight holds the stage's static_assert messages ("stage 2
	// (push-back): my::vector<T> needs ..."), deduplicated, in source order.
	Preflight []string `json:"preflight,omitempty"`
	// Output is the cleaned, capped compiler output with paths stripped.
	Output     string `json:"output,omitempty"`
	Truncated  bool   `json:"truncated,omitempty"`
	ErrorCount int    `json:"error_count,omitempty"`
}

type TestCase struct {
	Name   string `json:"name"`
	Status string `json:"status"` // StagePassed | StageFailed
	// Messages are the doctest failure messages (assertion text, INFO
	// context, VERIFY diagnoses), paths stripped.
	Messages []string `json:"messages,omitempty"`
}

type TestCounts struct {
	Total  int `json:"total"`
	Passed int `json:"passed"`
	Failed int `json:"failed"`
}

// ------------------------------------------------------------------ the view

// RunView.Status values.
const (
	RunQueued    = "queued"
	RunRunning   = "running"
	RunCompleted = "completed" // Result is set (the learner's code may still have failed)
	RunFailed    = "error"     // infrastructure failure; Error is set, Result may be nil
	RunTimeout   = "timeout"   // outer wall clock exceeded; the sandbox was destroyed
)

// RunView is what GET /runs/:id serialises and what the GitHub integration
// turns into a Check Run. It is a snapshot; it never contains the submission.
type RunView struct {
	ID            string     `json:"id"`
	Status        string     `json:"status"`
	Challenge     string     `json:"challenge"`
	Stages        []int      `json:"stages"`
	QueuePosition int        `json:"queue_position,omitempty"` // 1-based while queued
	CreatedAt     time.Time  `json:"created_at"`
	StartedAt     *time.Time `json:"started_at,omitempty"`
	FinishedAt    *time.Time `json:"finished_at,omitempty"`
	Result        *Result    `json:"result,omitempty"`
	Error         *RunError  `json:"error,omitempty"`
}

// Terminal reports whether the run will not change any more.
func (v RunView) Terminal() bool {
	return v.Status == RunCompleted || v.Status == RunFailed || v.Status == RunTimeout
}

// -------------------------------------------------------------------- runner

// ErrQueueFull is returned by Runner.Submit when the bounded queue is full
// (HTTP 429).
var ErrQueueFull = errors.New("run queue is full")

// ErrNotFound is returned by Runner.Wait for an unknown or expired run id.
var ErrNotFound = errors.New("run not found")

// ValidationError is returned by Runner.Submit for a submission that fails
// validation (HTTP 400, or 413 when TooLarge).
type ValidationError struct {
	Field    string // "challenge", "stage", "files", "options"
	Message  string
	TooLarge bool
}

func (e *ValidationError) Error() string { return fmt.Sprintf("%s: %s", e.Field, e.Message) }

// Runner is the run lifecycle as seen by the HTTP layer and the GitHub
// integration. Implemented by internal/runs.Manager.
type Runner interface {
	// Submit validates and enqueues. It never blocks on the run itself.
	Submit(ctx context.Context, s Submission) (RunView, error)
	// Get returns the current snapshot of a run.
	Get(id string) (RunView, bool)
	// Wait blocks until the run is terminal or ctx is done, then returns the
	// latest snapshot (with ctx.Err() if ctx ended first).
	Wait(ctx context.Context, id string) (RunView, error)
	// Challenge looks up a challenge spec by name.
	Challenge(name string) (ChallengeSpec, bool)
}
