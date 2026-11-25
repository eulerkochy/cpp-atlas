// Package runs owns the run lifecycle of the API process: it is the single
// choke point between "a submission arrives" (web or GitHub) and "a terminal
// RunView exists".
//
// # Lifecycle
//
//	Submit -> validate -> bounded FIFO queue -> one of MaxConcurrent workers
//	       -> Backend.Run(ctx with RunTimeout, Job) -> sanitize Result
//	       -> terminal RunView, kept for ResultTTL (bounded by MaxStoredRuns)
//
// Submit validates against the challenge registry (allowlisted paths, required
// files, per-file and total size caps, UTF-8, no NUL bytes, stage range,
// compiler/preset allowlist). It never blocks on the run: a full queue returns
// protocol.ErrQueueFull, a client with too many unfinished runs returns
// ErrTooManyRuns, and a shutting-down manager returns ErrShuttingDown.
//
// # State
//
// All state is in memory and the process is meant to run as a single instance
// (Fly app cppatlas-runner with exactly one machine). A restart loses queued,
// running and finished runs; clients polling an old id get "not found". Any
// sandbox left behind by a crash is reaped by the backends (docker: label
// cleanup on start; fly: janitor).
//
// # Run ids
//
// Run ids are 128-bit random values encoded as unpadded base64url (22 chars).
// They are bearer capabilities: whoever knows an id can read that run's
// result. They are never derived from the submission and are not logged next
// to file contents (file contents are never logged at all).
//
// # Result hygiene
//
// The grader is semi-trusted: it runs in the same sandbox as hostile code. A
// Result is therefore checked (RunID must match), clamped (string sizes, list
// lengths, valid UTF-8, trace entries must be valid JSON), restricted to the
// requested stages, and Passed is recomputed from the stage statuses. The
// submission is dropped from memory when the run becomes terminal and never
// appears in a RunView.
//
// # Fetch-once tokens (Fly)
//
// On Fly the sandbox is a separate machine. Instead of putting the submission
// into the machine config (stored and visible in the Fly API, size-limited,
// immutable for a pre-created warm machine) the machine only gets
// CPPATLAS_API_URL and CPPATLAS_TOKEN. The grader then calls the internal
// handler (see Rendezvous) on the API's private listener:
//
//	GET  /internal/job     Authorization: Bearer <token>  -> 200 Job JSON, exactly once (then 410)
//	POST /internal/result  Authorization: Bearer <token>  body: Result JSON (<= 2 MiB) -> 204, exactly once
//
// Tokens are 256-bit random, stored only as SHA-256 digests, bound to one run
// (or to one warm-pool slot that is bound to a run when its machine starts),
// and revoked as soon as the run is terminal.
package runs
