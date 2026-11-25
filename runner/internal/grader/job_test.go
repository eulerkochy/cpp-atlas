package grader

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"cppatlas.com/runner/internal/protocol"
)

func testConfig(t *testing.T) Config {
	t.Helper()
	root := t.TempDir()
	tests := filepath.Join(root, "vector", "src", "tests")
	os.MkdirAll(tests, 0o755)
	for _, n := range []string{"stage_01.cpp", "stage_02.cpp", "stage_03.cpp", "helper.cpp"} {
		os.WriteFile(filepath.Join(tests, n), []byte("//"), 0o644)
	}
	env := map[string]string{"CPPATLAS_CHALLENGES_ROOT": root, "CPPATLAS_WORK_ROOT": filepath.Join(root, "work")}
	return LoadConfig(func(k string) string { return env[k] }, "test")
}

func TestLoadConfigDefaults(t *testing.T) {
	c := LoadConfig(func(string) string { return "" }, "v1")
	if c.ChallengesRoot != "/opt/cppatlas/challenges" || c.WorkRoot != "/work" || c.SandboxUID != 10001 ||
		c.MaxFiles != 16 || c.OutputKillBytes != 16<<20 || !c.Seccomp || c.AllowNetwork || c.ResultMaxBytes != 1<<20 {
		t.Fatalf("%+v", c)
	}
}

func TestDiscoverStages(t *testing.T) {
	cfg := testConfig(t)
	st, err := DiscoverStages(filepath.Join(cfg.ChallengeDir("vector"), "src"))
	if err != nil || len(st) != 3 || st[0].Target != "stage_01" || st[2].N != 3 {
		t.Fatalf("%v %+v", err, st)
	}
}

func TestValidateJob(t *testing.T) {
	cfg := testConfig(t)
	good := func() protocol.Job {
		return protocol.Job{RunID: "run_123", Challenge: "vector", Stages: []int{1, 2},
			Files: map[string]string{"include/my/vector.hpp": "#pragma once\n"}}
	}
	v, err := ValidateJob(good(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	if v.Compiler != "gcc" || v.Preset != "debug" || len(v.Stages) != 2 || v.Limits != protocol.DefaultLimits() {
		t.Fatalf("%+v", v)
	}
	all := good()
	all.Stages = nil
	if v, err := ValidateJob(all, cfg); err != nil || len(v.Stages) != 3 {
		t.Fatalf("empty stages: %v", err)
	}

	bad := map[string]func(j *protocol.Job){
		"challenge traversal": func(j *protocol.Job) { j.Challenge = "../etc" },
		"challenge upper":     func(j *protocol.Job) { j.Challenge = "Vector" },
		"unknown challenge":   func(j *protocol.Job) { j.Challenge = "list" },
		"run id":              func(j *protocol.Job) { j.RunID = "a/b" },
		"stage 0":             func(j *protocol.Job) { j.Stages = []int{0} },
		"stage too big":       func(j *protocol.Job) { j.Stages = []int{4} },
		"stage negative":      func(j *protocol.Job) { j.Stages = []int{-1} },
		"not ascending":       func(j *protocol.Job) { j.Stages = []int{2, 1} },
		"duplicate":           func(j *protocol.Job) { j.Stages = []int{1, 1} },
		"compiler":            func(j *protocol.Job) { j.Options.Compiler = "/bin/sh" },
		"preset":              func(j *protocol.Job) { j.Options.Preset = "release" },
		"no files":            func(j *protocol.Job) { j.Files = nil },
		"absolute":            func(j *protocol.Job) { j.Files = map[string]string{"/etc/passwd": ""} },
		"dotdot":              func(j *protocol.Job) { j.Files = map[string]string{"include/../tests/stage_01.cpp": ""} },
		"dotdot clean":        func(j *protocol.Job) { j.Files = map[string]string{"include/my/../../x": ""} },
		"hidden":              func(j *protocol.Job) { j.Files = map[string]string{"include/.ninja_log": ""} },
		"not allowed":         func(j *protocol.Job) { j.Files = map[string]string{"tests/stage_01.cpp": ""} },
		"cmake":               func(j *protocol.Job) { j.Files = map[string]string{"CMakeLists.txt": ""} },
		"backslash":           func(j *protocol.Job) { j.Files = map[string]string{`include\x.hpp`: ""} },
		"double slash":        func(j *protocol.Job) { j.Files = map[string]string{"include//x.hpp": ""} },
		"trailing slash":      func(j *protocol.Job) { j.Files = map[string]string{"include/x/": ""} },
		"nul":                 func(j *protocol.Job) { j.Files = map[string]string{"include/x.hpp": "a\x00b"} },
		"bad utf8":            func(j *protocol.Job) { j.Files = map[string]string{"include/x.hpp": "\xff"} },
		"too big": func(j *protocol.Job) {
			j.Files = map[string]string{"include/x.hpp": strings.Repeat("a", cfg.MaxFileBytes+1)}
		},
		"too many": func(j *protocol.Job) {
			j.Files = map[string]string{}
			for i := 0; i < cfg.MaxFiles+1; i++ {
				j.Files["include/f"+strings.Repeat("x", i+1)+".hpp"] = ""
			}
		},
		"total": func(j *protocol.Job) {
			j.Files = map[string]string{}
			for i := 0; i < 5; i++ {
				j.Files["include/f"+strings.Repeat("x", i+1)+".hpp"] = strings.Repeat("a", cfg.MaxFileBytes-1)
			}
		},
	}
	for name, mut := range bad {
		j := good()
		mut(&j)
		_, err := ValidateJob(j, cfg)
		var bj *BadJob
		if !errors.As(err, &bj) {
			t.Errorf("%s: err = %v, want BadJob", name, err)
		}
	}
}

func TestNormalizeLimits(t *testing.T) {
	l := NormalizeLimits(protocol.Limits{BuildTimeoutSec: 100000, TestTimeoutSec: -5, MemoryMB: 1, MaxProcs: 1 << 30})
	if l.BuildTimeoutSec != 600 || l.TestTimeoutSec != 20 || l.MemoryMB != 256 || l.MaxProcs != 4096 {
		t.Fatalf("%+v", l)
	}
}

func TestGradeBadJobAlwaysResult(t *testing.T) {
	cfg := testConfig(t)
	g := &Grader{Cfg: cfg, Logf: t.Logf}
	res := g.Grade(protocol.Job{RunID: "../../x", Challenge: "../etc"})
	if res.Status != protocol.ResultError || res.Error == nil || res.Error.Code != "bad_job" || res.RunID != "" || res.Challenge != "" {
		t.Fatalf("%+v", res)
	}
	// Valid job but no prebuilt tree: an internal error, still a Result.
	res = g.Grade(protocol.Job{RunID: "r1", Challenge: "vector", Files: map[string]string{"include/my/vector.hpp": ""}})
	if res.Status != protocol.ResultError || res.Error.Code != "grader_internal" || strings.Contains(res.Error.Message, cfg.ChallengesRoot) {
		t.Fatalf("%+v", res.Error)
	}
	if b, _ := json.Marshal(res); !json.Valid(b) {
		t.Fatal("invalid JSON")
	}
}
