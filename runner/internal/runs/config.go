package runs

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path"
	"strings"
	"time"

	"cppatlas.com/runner/internal/protocol"
)

// Config configures a Manager. Zero values take the documented defaults.
// Suggested environment variable names are given for the orchestrator.
type Config struct {
	// QueueSize is the number of runs that may wait for a worker
	// (RUNNER_QUEUE_SIZE, default 20). Running runs do not count.
	QueueSize int
	// MaxConcurrent is the number of runs executing at once, i.e. live
	// sandboxes (RUNNER_MAX_CONCURRENT, default 4).
	MaxConcurrent int
	// MaxPerClient caps queued+running runs per Submission.ClientKey
	// (MAX_RUNS_PER_CLIENT, default 2; negative disables). Submissions with
	// an empty ClientKey are not capped. The web API keys by client address
	// (IPv6 by /64, the same key as its rate limiter).
	MaxPerClient int
	// RunTimeout is the outer wall clock per run, enforced by cancelling the
	// backend context (RUNNER_RUN_TIMEOUT, default 120s).
	RunTimeout time.Duration
	// ResultTTL is how long a terminal run stays readable
	// (RUNNER_RESULT_TTL, default 15m).
	ResultTTL time.Duration
	// MaxStoredRuns caps terminal runs kept in memory; the oldest finished
	// are evicted first (MAX_STORED_RUNS, default 500).
	MaxStoredRuns int
	// MaxStoredBytes caps the summed encoded size of stored terminal runs
	// (results and errors); the oldest finished are evicted first, the newest
	// is always kept (MAX_STORED_BYTES, default 64 MiB).
	MaxStoredBytes int64
	// MaxResultBytes caps one stored Result (encoded JSON). Larger results
	// are shrunk (traces, then outputs, then test messages, then passed
	// tests) before storing (MAX_RESULT_BYTES, default 512 KiB).
	MaxResultBytes int
	// MaxQueuedWeb / MaxQueuedGitHub cap how many of the QueueSize waiting
	// slots runs from one Source may hold, so neither source can starve
	// the other (QUEUE_MAX_WEB default 3/4 of QueueSize, QUEUE_MAX_GITHUB
	// default 1/2 of QueueSize; both clamped to QueueSize; negative = no
	// per-source cap). Beyond the share Submit returns protocol.ErrQueueFull.
	MaxQueuedWeb    int
	MaxQueuedGitHub int
	// GlobalRunsPer10Min / GlobalRunsBurst are a process-wide token bucket
	// on accepted runs (all sources): an economic backstop
	// (GLOBAL_RUNS_PER_10MIN default 120, GLOBAL_RUNS_BURST default 40;
	// a negative rate disables). Exhaustion returns ErrGlobalRate, which
	// wraps protocol.ErrQueueFull.
	GlobalRunsPer10Min float64
	GlobalRunsBurst    int
	// Limits are passed to the grader in every Job. Zero fields take
	// protocol.DefaultLimits(), except TraceBytes which defaults to
	// DefaultTraceBytes (smaller than the protocol default, to bound what
	// the API stores).
	Limits protocol.Limits
	// DefaultCompiler / DefaultPreset fill empty Options
	// (RUNNER_DEFAULT_COMPILER default "gcc", RUNNER_DEFAULT_PRESET default "debug").
	DefaultCompiler string
	DefaultPreset   string
	// AllowedCompilers / AllowedPresets (default: gcc, clang / debug, asan-ubsan).
	AllowedCompilers []string
	AllowedPresets   []string
	// Challenges is the registry. Nil means DefaultChallenges(). Use
	// LoadChallenges to read RUNNER_CHALLENGES_FILE.
	Challenges []protocol.ChallengeSpec
	// Rendezvous is the fetch-once token registry shared with the Fly
	// backend. Nil means the Manager creates its own (docker mode: unused,
	// InternalHandler then answers 404 to everything).
	Rendezvous *Rendezvous
	// Now is for tests; nil means time.Now.
	Now func() time.Time
}

func (c Config) withDefaults() Config {
	if c.QueueSize <= 0 {
		c.QueueSize = 20
	}
	if c.MaxConcurrent <= 0 {
		c.MaxConcurrent = 4
	}
	if c.MaxPerClient == 0 {
		c.MaxPerClient = 2
	}
	if c.RunTimeout <= 0 {
		c.RunTimeout = 120 * time.Second
	}
	if c.ResultTTL <= 0 {
		c.ResultTTL = 15 * time.Minute
	}
	if c.MaxStoredRuns <= 0 {
		c.MaxStoredRuns = 500
	}
	if c.MaxStoredBytes <= 0 {
		c.MaxStoredBytes = 64 << 20
	}
	if c.MaxResultBytes <= 0 {
		c.MaxResultBytes = 512 << 10
	}
	share := func(v *int, def int) {
		switch {
		case *v == 0:
			*v = max(def, 1)
		case *v < 0:
			*v = c.QueueSize
		}
		*v = min(*v, c.QueueSize)
	}
	share(&c.MaxQueuedWeb, c.QueueSize*3/4)
	share(&c.MaxQueuedGitHub, c.QueueSize/2)
	if c.GlobalRunsPer10Min == 0 {
		c.GlobalRunsPer10Min = 120
	}
	if c.GlobalRunsBurst <= 0 {
		c.GlobalRunsBurst = 40
	}
	if c.Limits.TraceBytes <= 0 {
		c.Limits.TraceBytes = DefaultTraceBytes
	}
	c.Limits = MergeLimits(c.Limits)
	if len(c.AllowedCompilers) == 0 {
		c.AllowedCompilers = []string{protocol.CompilerGCC, protocol.CompilerClang}
	}
	if len(c.AllowedPresets) == 0 {
		c.AllowedPresets = []string{protocol.PresetDebug, protocol.PresetAsanUbsan}
	}
	if c.DefaultCompiler == "" {
		c.DefaultCompiler = protocol.CompilerGCC
	}
	if c.DefaultPreset == "" {
		c.DefaultPreset = protocol.PresetDebug
	}
	if c.Challenges == nil {
		c.Challenges = DefaultChallenges()
	}
	if c.Now == nil {
		c.Now = time.Now
	}
	return c
}

// DefaultTraceBytes is the per-stage trace budget the API asks the grader
// for (protocol.DefaultLimits() allows 256 KiB).
const DefaultTraceBytes = 64 << 10

// MergeLimits fills zero fields of l from protocol.DefaultLimits().
func MergeLimits(l protocol.Limits) protocol.Limits {
	d := protocol.DefaultLimits()
	set := func(v *int, def int) {
		if *v <= 0 {
			*v = def
		}
	}
	set(&l.BuildTimeoutSec, d.BuildTimeoutSec)
	set(&l.TestTimeoutSec, d.TestTimeoutSec)
	set(&l.OutputBytes, d.OutputBytes)
	set(&l.TraceBytes, d.TraceBytes)
	set(&l.MemoryMB, d.MemoryMB)
	set(&l.MaxProcs, d.MaxProcs)
	set(&l.MaxFileMB, d.MaxFileMB)
	set(&l.MaxOpenFiles, d.MaxOpenFiles)
	return l
}

// DefaultChallenges is the built-in registry: the 8-stage std::vector challenge.
func DefaultChallenges() []protocol.ChallengeSpec {
	return []protocol.ChallengeSpec{{
		Name:          "vector",
		Stages:        8,
		AllowedFiles:  []string{"include/my/vector.hpp"},
		RequiredFiles: []string{"include/my/vector.hpp"},
		MaxFileBytes:  256 << 10,
		MaxTotalBytes: 256 << 10,
	}}
}

// LoadChallenges reads a challenge registry from a JSON file: either an array
// of protocol.ChallengeSpec or {"challenges": [...]}. The specs are validated.
func LoadChallenges(file string) ([]protocol.ChallengeSpec, error) {
	data, err := os.ReadFile(file)
	if err != nil {
		return nil, err
	}
	var specs []protocol.ChallengeSpec
	trimmed := strings.TrimSpace(string(data))
	if strings.HasPrefix(trimmed, "{") {
		var wrap struct {
			Challenges []protocol.ChallengeSpec `json:"challenges"`
		}
		if err := json.Unmarshal(data, &wrap); err != nil {
			return nil, fmt.Errorf("challenges file %s: %w", file, err)
		}
		specs = wrap.Challenges
	} else if err := json.Unmarshal(data, &specs); err != nil {
		return nil, fmt.Errorf("challenges file %s: %w", file, err)
	}
	if err := ValidateChallenges(specs); err != nil {
		return nil, fmt.Errorf("challenges file %s: %w", file, err)
	}
	return specs, nil
}

// ValidateChallenges checks a registry for internal consistency.
func ValidateChallenges(specs []protocol.ChallengeSpec) error {
	if len(specs) == 0 {
		return errors.New("no challenges")
	}
	seen := map[string]bool{}
	for _, s := range specs {
		if s.Name == "" || !safeName(s.Name) {
			return fmt.Errorf("invalid challenge name %q", s.Name)
		}
		if seen[s.Name] {
			return fmt.Errorf("duplicate challenge %q", s.Name)
		}
		seen[s.Name] = true
		if s.Stages < 1 || s.Stages > 64 {
			return fmt.Errorf("challenge %q: stages must be 1..64", s.Name)
		}
		if len(s.AllowedFiles) == 0 {
			return fmt.Errorf("challenge %q: no allowed files", s.Name)
		}
		allowed := map[string]bool{}
		for _, p := range s.AllowedFiles {
			if !safeRelPath(p) {
				return fmt.Errorf("challenge %q: unsafe path %q", s.Name, p)
			}
			allowed[p] = true
		}
		for _, p := range s.RequiredFiles {
			if !allowed[p] {
				return fmt.Errorf("challenge %q: required file %q not allowed", s.Name, p)
			}
		}
		if s.MaxFileBytes <= 0 || s.MaxTotalBytes <= 0 || s.MaxTotalBytes > 8<<20 {
			return fmt.Errorf("challenge %q: size caps must be > 0 (total <= 8 MiB)", s.Name)
		}
	}
	return nil
}

func safeName(s string) bool {
	for _, r := range s {
		if !(r >= 'a' && r <= 'z' || r >= '0' && r <= '9' || r == '-' || r == '_') {
			return false
		}
	}
	return len(s) <= 64
}

func safeRelPath(p string) bool {
	if p == "" || strings.HasPrefix(p, "/") || strings.Contains(p, "\\") || path.Clean(p) != p {
		return false
	}
	for _, seg := range strings.Split(p, "/") {
		if seg == ".." || seg == "." || seg == "" || strings.HasPrefix(seg, "-") {
			return false
		}
	}
	return true
}
