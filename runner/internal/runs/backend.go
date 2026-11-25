package runs

import (
	"context"
	"errors"
	"fmt"

	"cppatlas.com/runner/internal/protocol"
)

// Backend executes one Job in a fresh sandbox and returns the grader's
// Result.
//
// Contract:
//   - Run must return promptly once ctx is done (the Manager's outer wall
//     clock or shutdown), and must have destroyed, or scheduled the
//     destruction of, the sandbox by then. It then returns an error wrapping
//     ctx.Err().
//   - A non-nil Result is returned as produced by the grader; the Manager
//     validates and clamps it. Backends need not sanitise.
//   - Infrastructure failures should be returned as *BackendError so the
//     Manager can surface a stable code; any other error becomes a generic
//     "internal" error. Error details are only logged, never shown.
//   - Run is called concurrently, up to Config.MaxConcurrent times.
//
// The docker backend returns the Result read from the container's stdout.
// The Fly backend issues a fetch-once Ticket from the shared Rendezvous,
// starts a machine with the token in its env, and waits on the Ticket.
type Backend interface {
	// Name is a short identifier for logs and Stats, e.g. "docker" or "fly".
	Name() string
	Run(ctx context.Context, job protocol.Job) (*protocol.Result, error)
}

// Stable RunError codes produced by the lifecycle (in addition to whatever
// the grader reports in Result.Error).
const (
	CodeTimeout            = "timeout"
	CodeBackendUnavailable = "backend_unavailable"
	CodeInternal           = "internal"
	CodeBadResult          = "bad_result"
	CodeShuttingDown       = "shutting_down"
	CodeSandboxKilled      = "sandbox_killed"
	CodeGraderExited       = "grader_exited"
)

// BackendError is an infrastructure failure with a learner-safe message.
// Err carries the detail for server logs only.
type BackendError struct {
	Code    string // stable machine code, e.g. CodeBackendUnavailable
	Message string // safe to show to the learner
	Err     error  // logged only
}

func (e *BackendError) Error() string {
	if e.Err != nil {
		return e.Code + ": " + e.Err.Error()
	}
	return e.Code
}

func (e *BackendError) Unwrap() error { return e.Err }

// Unavailable wraps err as a CodeBackendUnavailable BackendError (the
// sandbox provider is overloaded or down).
func Unavailable(err error) error {
	return &BackendError{
		Code:    CodeBackendUnavailable,
		Message: "The code runner is temporarily unavailable. Please try again in a minute.",
		Err:     err,
	}
}

// Internal wraps err as a BackendError with the given code and a generic
// learner-facing message.
func Internal(code string, err error) error {
	return &BackendError{
		Code:    code,
		Message: "The code runner failed while running your submission. This is not a problem with your code; please try again.",
		Err:     err,
	}
}

// ErrTooManyRuns is returned by Submit when the submitter (ClientKey)
// already has Config.MaxPerClient queued or running runs (HTTP 429).
var ErrTooManyRuns = errors.New("too many unfinished runs for this client")

// ErrGlobalRate is returned by Submit when the process-wide run budget
// (Config.GlobalRunsPer10Min) is exhausted. It wraps protocol.ErrQueueFull,
// so callers that handle a full queue (HTTP 429, GitHub retry) handle it too.
var ErrGlobalRate = fmt.Errorf("%w: global run rate exhausted", protocol.ErrQueueFull)

// ErrShuttingDown is returned by Submit after Shutdown started (HTTP 503).
var ErrShuttingDown = errors.New("runner is shutting down")
