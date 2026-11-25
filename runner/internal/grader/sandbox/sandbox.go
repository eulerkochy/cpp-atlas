// Package sandbox runs one untrusted command at a time with resource limits,
// output capture, a timeout and a reliable kill of everything it spawned.
//
// One code path, chosen by a capability probe at start-up:
//
//	mode "namespaces" (root with CAP_SYS_ADMIN, e.g. a Fly Machine): every
//	  command gets fresh PID, mount, network, IPC and UTS namespaces. A small
//	  init (this binary, "__sandbox-init") is PID 1 of the new namespace,
//	  mounts a private /proc (hidepid), a fresh /tmp, masks host paths, makes
//	  / read-only, and starts the command as the sandbox uid; when the command
//	  ends (or the supervisor kills init) the kernel kills everything left in
//	  the namespace. A cgroup v2 leaf (memory.max, pids.max) is used when
//	  available.
//	mode "setuid" (root without namespaces): the command runs as the sandbox
//	  uid; leftovers are found by uid and killed.
//	mode "rlimits" (unprivileged, e.g. docker --user 10001 --cap-drop ALL):
//	  containment is docker's; the command runs in its own process group,
//	  leftovers are killed with kill(-1) when the grader is the container's
//	  PID 1, otherwise by walking our descendants (we are a child subreaper).
//
// In every mode the command is started through "__sandbox-exec", which sets
// rlimits, oom_score_adj=1000, no_new_privs and a seccomp filter, then
// execve()s the real program.
package sandbox

import (
	"io"
	"time"
)

// Limit is one rlimit (soft = hard = Value).
type Limit struct {
	Name  string `json:"name"` // as, data, cpu, nproc, fsize, nofile, core, stack
	Value uint64 `json:"value"`
}

// Cmd is one command to run inside the sandbox.
type Cmd struct {
	Path string
	Args []string // argv[1:]
	Env  []string // the complete environment (nothing is inherited)
	Dir  string

	Limits  []Limit
	Timeout time.Duration
	// MemoryBytes / Pids are applied through cgroup v2 when available
	// (memory.max with swap off, pids.max). 0 = no cgroup limit.
	MemoryBytes int64
	Pids        int

	// Output receives the merged stdout+stderr. Writes happen on one
	// goroutine; Output must not block.
	Output io.Writer
	// KillAfterOutput kills the command once it has written this many bytes
	// (0 = never).
	KillAfterOutput int64
	// Seccomp installs the deny-list filter (see seccomp_linux.go).
	Seccomp bool
}

// Status is how a command ended.
type Status struct {
	Exited      bool
	ExitCode    int
	Signal      int    // terminating signal number (0 if exited)
	SignalName  string // "SIGSEGV"
	TimedOut    bool
	OutputFlood bool  // killed because of KillAfterOutput
	OOMKilled   bool  // the kernel OOM killer fired in this command's cgroup (best effort)
	OutputBytes int64 // total bytes written to stdout+stderr
	Wall        time.Duration
	MaxRSSKB    int64
	// StartErr: the command could not be started at all (sandbox failure).
	StartErr error
	// CleanupErr: processes could not be killed afterwards; the sandbox is no
	// longer trustworthy and the caller must stop.
	CleanupErr error
}

// Info describes the probed sandbox.
type Info struct {
	Mode       string // "namespaces", "setuid", "rlimits"
	PID1       bool
	Cgroup     string // cgroup v2 base used for per-command leaves, "" if none
	UID, GID   int    // uid/gid commands run as
	Seccomp    bool
	Notes      []string
	CgroupNote string
}

// Options configure New.
type Options struct {
	// UID/GID to run commands as when the grader is root. Ignored otherwise
	// (commands then run as the grader's own uid).
	UID, GID int
	// RequireIsolation: when root, fail unless namespaces (in particular a
	// private network namespace) are available. Used in Fly mode.
	RequireIsolation bool
	// Masks are directories hidden (empty read-only tmpfs) in namespace mode.
	Masks []string
	// TmpSize is the size= option of the private /tmp in namespace mode.
	TmpSize string
	// Logf receives operational log lines (stderr).
	Logf func(format string, args ...any)
}

// DefaultMasks are hidden from sandboxed commands in namespace mode when
// they exist: Fly's per-machine API socket and metadata, runtime dirs, homes.
var DefaultMasks = []string{"/.fly", "/.fly-upper-layer", "/run", "/var/run", "/root", "/home", "/mnt", "/media", "/srv", "/sys/fs/cgroup", "/sys/kernel/debug", "/sys/kernel/security", "/sys/firmware"}
