package grader

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// Toolchain lists the compilers the image provides. Paths may be overridden
// with CPPATLAS_GXX / CPPATLAS_CLANGXX.
func Toolchain(getenv func(string) string) map[string]string {
	gxx, clang := getenv("CPPATLAS_GXX"), getenv("CPPATLAS_CLANGXX")
	if gxx == "" {
		gxx = lookPath("g++")
	}
	if clang == "" {
		clang = lookPath("clang++-21")
		if !filepath.IsAbs(clang) {
			clang = lookPath("clang++")
		}
	}
	return map[string]string{"gcc": gxx, "clang": clang}
}

// extraFlags bounds compile-time bombs a little more tightly than the
// compilers' defaults and keeps error output short. Template depth stays at
// the defaults (the tests need nothing deeper); the wall-clock and memory
// limits are the real bound.
var extraFlags = map[string]string{
	"gcc":   "-fmax-errors=30 -fconstexpr-ops-limit=268435456 -fconstexpr-loop-limit=1048576",
	"clang": "-ferror-limit=30 -fno-crash-diagnostics",
}

var presets = []string{"debug", "asan-ubsan"}

// Prebuild configures and builds every compiler x preset variant for a
// challenge and stores them under prebuilt/ (see Manifest). It runs as root
// at image build time with the challenge at ChallengeDir/src.
func Prebuild(cfg Config, challenge string, getenv func(string) string, logf func(string, ...any)) error {
	if !challengeNameRe.MatchString(challenge) {
		return fmt.Errorf("invalid challenge name %q", challenge)
	}
	src := filepath.Join(cfg.ChallengeDir(challenge), "src")
	if _, err := os.Stat(filepath.Join(src, "solution")); err == nil {
		return errors.New("refusing to prebuild: the challenge source contains solution/ (it must never be in the image)")
	}
	if _, err := DiscoverStages(src); err != nil {
		return err
	}
	prebuilt := cfg.PrebuiltDir(challenge)
	work := filepath.Join(cfg.WorkRoot, challenge)
	if err := os.RemoveAll(prebuilt); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Join(prebuilt, "build"), 0o755); err != nil {
		return err
	}
	os.RemoveAll(work)
	skip := func(rel string, d fs.DirEntry) bool {
		top := strings.SplitN(rel, "/", 2)[0]
		return top == "build" || top == "solution" || strings.HasPrefix(top, ".")
	}
	if err := CopyTree(src, work, skip); err != nil {
		return err
	}
	defer os.RemoveAll(work)

	ccacheDir := filepath.Join(prebuilt, "ccache")
	ccache := lookPath("ccache")
	haveCcache := filepath.IsAbs(ccache)
	man := Manifest{Challenge: challenge, WorkDir: work, GraderVersion: cfg.Version, Variants: map[string]Variant{}}
	if haveCcache {
		man.Ccache = "ccache"
		os.MkdirAll(ccacheDir, 0o755)
	}
	env := append(os.Environ(), "LC_ALL=C", "CCACHE_DIR="+ccacheDir, "CCACHE_MAXSIZE=2G", "CCACHE_NOCOMPRESS=1")
	tools := Toolchain(getenv)
	for _, comp := range []string{"gcc", "clang"} {
		cxx := tools[comp]
		if !filepath.IsAbs(cxx) {
			return fmt.Errorf("compiler for %s not found", comp)
		}
		version, err := compilerVersion(comp, cxx)
		if err != nil {
			return err
		}
		for _, preset := range presets {
			t0 := time.Now()
			key := VariantKey(comp, preset)
			rel := filepath.Join("build", key)
			bdir := filepath.Join(work, rel)
			args := []string{"--preset", preset, "-S", work, "-B", bdir,
				"-DCMAKE_CXX_COMPILER=" + cxx,
				"-DCMAKE_CXX_FLAGS=" + extraFlags[comp],
				"-DCMAKE_COLOR_DIAGNOSTICS=OFF",
				"-DCMAKE_EXPORT_COMPILE_COMMANDS=OFF",
				"-DUSE_STD=OFF", "-DCPPATLAS_SOLUTION=OFF"}
			if haveCcache {
				args = append(args, "-DCMAKE_CXX_COMPILER_LAUNCHER="+ccache)
			} else {
				args = append(args, "-DCMAKE_CXX_COMPILER_LAUNCHER=")
			}
			if err := run(work, env, logf, "cmake", args...); err != nil {
				return fmt.Errorf("%s: configure: %w", key, err)
			}
			// Build everything: support objects and libraries succeed, the
			// stages fail against the starter header (that is expected).
			_ = run(work, env, nil, "ninja", "-C", bdir, "-k", "0")
			if _, err := os.Stat(filepath.Join(bdir, "libcppatlas_doctest_main.a")); err != nil {
				if m, _ := filepath.Glob(filepath.Join(bdir, "*doctest_main*")); len(m) == 0 {
					return fmt.Errorf("%s: the doctest main library was not built", key)
				}
			}
			stages, _ := readLines(filepath.Join(bdir, "cppatlas-stages.txt"))
			testEnv, _ := readLines(filepath.Join(bdir, "cppatlas-test-env.txt"))
			for _, s := range stages {
				os.Remove(filepath.Join(bdir, "stage_"+s))
			}
			dst := filepath.Join(prebuilt, rel)
			if err := os.Rename(bdir, dst); err != nil {
				if err := CopyTree(bdir, dst, nil); err != nil {
					return fmt.Errorf("%s: store: %w", key, err)
				}
				os.RemoveAll(bdir)
			}
			man.Variants[key] = Variant{
				Compiler: comp, Preset: preset, CXX: cxx, Version: version, BuildDir: rel,
				Stages: stages, TestEnv: testEnv, PrebuildMs: time.Since(t0).Milliseconds(),
			}
			logf("prebuild: %s (%s) in %s", key, version, time.Since(t0).Round(time.Millisecond))
		}
	}
	if haveCcache {
		os.Remove(filepath.Join(ccacheDir, "ccache.conf"))
		_ = run(work, env, logf, "ccache", "--cleanup")
	}
	b, _ := json.MarshalIndent(&man, "", "  ")
	return os.WriteFile(filepath.Join(prebuilt, "manifest.json"), append(b, '\n'), 0o644)
}

var versionRe = regexp.MustCompile(`\b(\d+\.\d+(?:\.\d+)?)\b`)

func compilerVersion(comp, cxx string) (string, error) {
	out, err := exec.Command(cxx, "-dumpfullversion").Output()
	v := strings.TrimSpace(string(out))
	if err != nil || !versionRe.MatchString(v) {
		out, err = exec.Command(cxx, "--version").Output()
		if err != nil {
			return "", fmt.Errorf("%s --version: %w", cxx, err)
		}
		first, _, _ := strings.Cut(string(out), "\n")
		m := versionRe.FindStringSubmatch(first)
		if m == nil {
			return "", fmt.Errorf("cannot parse the version of %s", cxx)
		}
		v = m[1]
	}
	name := "g++"
	if comp == "clang" {
		name = "clang++"
	}
	return name + " " + v, nil
}

func run(dir string, env []string, logf func(string, ...any), name string, args ...string) error {
	c := exec.Command(lookPath(name), args...)
	c.Dir, c.Env = dir, env
	var out bytes.Buffer
	c.Stdout, c.Stderr = &out, &out
	err := c.Run()
	if err != nil && logf != nil {
		tail := out.String()
		if len(tail) > 4000 {
			tail = tail[len(tail)-4000:]
		}
		logf("%s %s: %v\n%s", name, strings.Join(args, " "), err, tail)
	}
	return err
}

func readLines(path string) ([]string, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var out []string
	for _, l := range strings.Split(string(b), "\n") {
		if l = strings.TrimSpace(l); l != "" {
			out = append(out, l)
		}
	}
	return out, nil
}
