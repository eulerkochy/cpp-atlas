package grader

import (
	"fmt"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"

	"cppatlas.com/runner/internal/protocol"
)

// Config is the grader's environment-derived configuration. Every field has
// a default that matches the image layout contract; see LoadConfig.
type Config struct {
	ChallengesRoot  string   // CPPATLAS_CHALLENGES_ROOT, default /opt/cppatlas/challenges
	WorkRoot        string   // CPPATLAS_WORK_ROOT, default /work
	AllowedPrefixes []string // CPPATLAS_ALLOWED_PREFIXES (comma list), default "include/"
	MaxFiles        int      // CPPATLAS_MAX_FILES, default 16
	MaxFileBytes    int      // CPPATLAS_MAX_FILE_BYTES, default 256 KiB
	MaxTotalBytes   int      // CPPATLAS_MAX_TOTAL_BYTES, default 1 MiB
	BuildJobs       int      // CPPATLAS_BUILD_JOBS, default 0 = auto (CPU quota, memory)
	OutputKillBytes int64    // CPPATLAS_OUTPUT_KILL_BYTES, default 16 MiB per process
	DeadlineSec     int      // CPPATLAS_DEADLINE_SEC, default 0 = derived from the job's limits
	SandboxUID      int      // CPPATLAS_SANDBOX_UID, default 10001 (used when the grader is root)
	SandboxGID      int      // CPPATLAS_SANDBOX_GID, default 10001
	NProc           string   // CPPATLAS_RLIMIT_NPROC: "" = Limits.MaxProcs, "off" = never set, N = N
	AllowNetwork    bool     // CPPATLAS_ALLOW_NETWORK=1: do not refuse to run with a network (dev only)
	ResultMaxBytes  int      // CPPATLAS_RESULT_MAX_BYTES, default 1 MiB
	Seccomp         bool     // CPPATLAS_SECCOMP, default on ("0" disables)
	// WorkTmpfsSize is the size= of the /work tmpfs the grader mounts itself
	// in Fly mode (CPPATLAS_WORK_TMPFS_SIZE, default 1g, like docker mode's
	// --tmpfs /work size=1g). tmpfs pages are memory: on a 4 GB VM this plus
	// one stage's memory limit must stay well below RAM.
	WorkTmpfsSize string
	Version       string
}

// LoadConfig reads the environment.
func LoadConfig(getenv func(string) string, version string) Config {
	c := Config{
		ChallengesRoot:  "/opt/cppatlas/challenges",
		WorkRoot:        "/work",
		AllowedPrefixes: []string{"include/"},
		MaxFiles:        16,
		MaxFileBytes:    256 << 10,
		MaxTotalBytes:   1 << 20,
		OutputKillBytes: 16 << 20,
		SandboxUID:      10001,
		SandboxGID:      10001,
		ResultMaxBytes:  1 << 20,
		Seccomp:         true,
		WorkTmpfsSize:   "1g",
		Version:         version,
	}
	str := func(k string, dst *string) {
		if v := getenv(k); v != "" {
			*dst = v
		}
	}
	num := func(k string, dst *int, lo, hi int) {
		if v := getenv(k); v != "" {
			if n, err := strconv.Atoi(v); err == nil && n >= lo && n <= hi {
				*dst = n
			}
		}
	}
	str("CPPATLAS_CHALLENGES_ROOT", &c.ChallengesRoot)
	str("CPPATLAS_WORK_ROOT", &c.WorkRoot)
	if v := getenv("CPPATLAS_ALLOWED_PREFIXES"); v != "" {
		c.AllowedPrefixes = nil
		for _, p := range strings.Split(v, ",") {
			p = strings.TrimSpace(p)
			if p != "" && validRelPath(strings.TrimSuffix(p, "/")) {
				c.AllowedPrefixes = append(c.AllowedPrefixes, strings.TrimSuffix(p, "/")+"/")
			}
		}
	}
	num("CPPATLAS_MAX_FILES", &c.MaxFiles, 1, 256)
	num("CPPATLAS_MAX_FILE_BYTES", &c.MaxFileBytes, 1, 16<<20)
	num("CPPATLAS_MAX_TOTAL_BYTES", &c.MaxTotalBytes, 1, 64<<20)
	num("CPPATLAS_BUILD_JOBS", &c.BuildJobs, 0, 64)
	var kill int
	num("CPPATLAS_OUTPUT_KILL_BYTES", &kill, 1<<20, 1<<30)
	if kill > 0 {
		c.OutputKillBytes = int64(kill)
	}
	num("CPPATLAS_DEADLINE_SEC", &c.DeadlineSec, 0, 3600)
	num("CPPATLAS_SANDBOX_UID", &c.SandboxUID, 1, 1<<30)
	num("CPPATLAS_SANDBOX_GID", &c.SandboxGID, 1, 1<<30)
	num("CPPATLAS_RESULT_MAX_BYTES", &c.ResultMaxBytes, 64<<10, 16<<20)
	c.NProc = getenv("CPPATLAS_RLIMIT_NPROC")
	c.AllowNetwork = getenv("CPPATLAS_ALLOW_NETWORK") == "1"
	c.Seccomp = getenv("CPPATLAS_SECCOMP") != "0"
	if v := getenv("CPPATLAS_WORK_TMPFS_SIZE"); tmpfsSizeRe.MatchString(v) {
		c.WorkTmpfsSize = v
	}
	return c
}

var tmpfsSizeRe = regexp.MustCompile(`^[1-9][0-9]{0,5}[kmg]$`)

// ChallengeDir is /opt/cppatlas/challenges/<name>.
func (c Config) ChallengeDir(name string) string { return filepath.Join(c.ChallengesRoot, name) }

// Hard ceilings the grader applies whatever the job asks for.
var (
	limitCeil = protocol.Limits{
		BuildTimeoutSec: 600, TestTimeoutSec: 300, OutputBytes: 1 << 20, TraceBytes: 1 << 20,
		MemoryMB: 16384, MaxProcs: 4096, MaxFileMB: 1024, MaxOpenFiles: 8192,
	}
	limitFloor = protocol.Limits{
		BuildTimeoutSec: 5, TestTimeoutSec: 1, OutputBytes: 1 << 10, TraceBytes: 1 << 10,
		MemoryMB: 256, MaxProcs: 16, MaxFileMB: 1, MaxOpenFiles: 32,
	}
)

// NormalizeLimits fills zero fields from protocol.DefaultLimits and clamps.
func NormalizeLimits(l protocol.Limits) protocol.Limits {
	d := protocol.DefaultLimits()
	f := func(v *int, def, lo, hi int) {
		if *v <= 0 {
			*v = def
		}
		if *v < lo {
			*v = lo
		}
		if *v > hi {
			*v = hi
		}
	}
	f(&l.BuildTimeoutSec, d.BuildTimeoutSec, limitFloor.BuildTimeoutSec, limitCeil.BuildTimeoutSec)
	f(&l.TestTimeoutSec, d.TestTimeoutSec, limitFloor.TestTimeoutSec, limitCeil.TestTimeoutSec)
	f(&l.OutputBytes, d.OutputBytes, limitFloor.OutputBytes, limitCeil.OutputBytes)
	f(&l.TraceBytes, d.TraceBytes, limitFloor.TraceBytes, limitCeil.TraceBytes)
	f(&l.MemoryMB, d.MemoryMB, limitFloor.MemoryMB, limitCeil.MemoryMB)
	f(&l.MaxProcs, d.MaxProcs, limitFloor.MaxProcs, limitCeil.MaxProcs)
	f(&l.MaxFileMB, d.MaxFileMB, limitFloor.MaxFileMB, limitCeil.MaxFileMB)
	f(&l.MaxOpenFiles, d.MaxOpenFiles, limitFloor.MaxOpenFiles, limitCeil.MaxOpenFiles)
	return l
}

// Stage is one discovered stage: number and the file/target spelling.
type Stage struct {
	N      int
	Name   string // "02" (as spelled in tests/stage_02.cpp)
	Target string // "stage_02"
}

var stageFileRe = regexp.MustCompile(`^stage_([0-9]{2,3})\.cpp$`)

// DiscoverStages lists tests/stage_NN.cpp in a challenge tree.
func DiscoverStages(srcDir string) ([]Stage, error) {
	ents, err := os.ReadDir(filepath.Join(srcDir, "tests"))
	if err != nil {
		return nil, err
	}
	var out []Stage
	seen := map[int]bool{}
	for _, e := range ents {
		m := stageFileRe.FindStringSubmatch(e.Name())
		if m == nil || !e.Type().IsRegular() {
			continue
		}
		n, _ := strconv.Atoi(m[1])
		if n < 1 || seen[n] {
			continue
		}
		seen[n] = true
		out = append(out, Stage{N: n, Name: m[1], Target: "stage_" + m[1]})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].N < out[j].N })
	return out, nil
}

var (
	challengeNameRe = regexp.MustCompile(`^[a-z0-9-]{1,64}$`)
	runIDRe         = regexp.MustCompile(`^[A-Za-z0-9._:-]{0,128}$`)
	pathComponentRe = regexp.MustCompile(`^[A-Za-z0-9_+-][A-Za-z0-9._+-]{0,127}$`)
)

// validRelPath: relative, clean, slash-separated, no "..", no hidden or odd
// components, bounded depth.
func validRelPath(p string) bool {
	if p == "" || len(p) > 256 || strings.ContainsAny(p, "\\\x00") || strings.HasPrefix(p, "/") {
		return false
	}
	if path.Clean(p) != p {
		return false
	}
	parts := strings.Split(p, "/")
	if len(parts) > 8 {
		return false
	}
	for _, c := range parts {
		if c == "." || c == ".." || !pathComponentRe.MatchString(c) {
			return false
		}
	}
	return true
}

// BadJob is a validation failure, reported as RunError{Code: "bad_job"}.
type BadJob struct{ Msg string }

func (e *BadJob) Error() string { return e.Msg }

func badJob(f string, a ...any) error { return &BadJob{Msg: fmt.Sprintf(f, a...)} }

// ValidatedJob is a Job after defence-in-depth validation.
type ValidatedJob struct {
	Job      protocol.Job
	Limits   protocol.Limits
	Compiler string
	Preset   string
	Stages   []Stage // requested, ascending
	All      []Stage // discovered
	Files    []string
	SrcDir   string
}

// ValidateJob re-checks everything the API already validated.
func ValidateJob(job protocol.Job, cfg Config) (*ValidatedJob, error) {
	if !runIDRe.MatchString(job.RunID) {
		return nil, badJob("invalid run id")
	}
	if !challengeNameRe.MatchString(job.Challenge) {
		return nil, badJob("invalid challenge name")
	}
	src := filepath.Join(cfg.ChallengeDir(job.Challenge), "src")
	if st, err := os.Stat(src); err != nil || !st.IsDir() {
		return nil, badJob("unknown challenge %q", job.Challenge)
	}
	all, err := DiscoverStages(src)
	if err != nil || len(all) == 0 {
		return nil, fmt.Errorf("challenge %q has no stages: %v", job.Challenge, err)
	}
	byN := map[int]Stage{}
	for _, s := range all {
		byN[s.N] = s
	}
	v := &ValidatedJob{Job: job, All: all, SrcDir: src, Limits: NormalizeLimits(job.Limits)}
	if len(job.Stages) == 0 {
		v.Stages = append(v.Stages, all...)
	} else {
		if len(job.Stages) > len(all) {
			return nil, badJob("too many stages")
		}
		prev := 0
		for _, n := range job.Stages {
			s, ok := byN[n]
			if !ok {
				return nil, badJob("stage %d does not exist (stages: %d..%d)", n, all[0].N, all[len(all)-1].N)
			}
			if n <= prev {
				return nil, badJob("stages must be ascending without duplicates")
			}
			prev = n
			v.Stages = append(v.Stages, s)
		}
	}

	switch job.Options.Compiler {
	case "", protocol.CompilerGCC:
		v.Compiler = protocol.CompilerGCC
	case protocol.CompilerClang:
		v.Compiler = protocol.CompilerClang
	default:
		return nil, badJob("unknown compiler")
	}
	switch job.Options.Preset {
	case "", protocol.PresetDebug:
		v.Preset = protocol.PresetDebug
	case protocol.PresetAsanUbsan:
		v.Preset = protocol.PresetAsanUbsan
	default:
		return nil, badJob("unknown preset")
	}

	if len(job.Files) == 0 {
		return nil, badJob("no files")
	}
	if len(job.Files) > cfg.MaxFiles {
		return nil, badJob("too many files")
	}
	total := 0
	for p, content := range job.Files {
		if !validRelPath(p) {
			return nil, badJob("invalid file path")
		}
		allowed := false
		for _, pre := range cfg.AllowedPrefixes {
			if strings.HasPrefix(p, pre) {
				allowed = true
			}
		}
		if !allowed {
			return nil, badJob("file %q is not allowed", capLine(p, 80))
		}
		if len(content) > cfg.MaxFileBytes {
			return nil, badJob("file %q is too large", p)
		}
		total += len(content)
		if !utf8.ValidString(content) || strings.IndexByte(content, 0) >= 0 {
			return nil, badJob("file %q is not valid UTF-8 text", p)
		}
		v.Files = append(v.Files, p)
	}
	if total > cfg.MaxTotalBytes {
		return nil, badJob("submission is too large")
	}
	sort.Strings(v.Files)
	return v, nil
}
