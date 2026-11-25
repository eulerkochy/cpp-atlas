package grader

import (
	"os"
	"strings"
	"testing"
)

// The fixtures are real ninja logs (NINJA_STATUS="[cppatlas-ninja %f/%t] ")
// from g++ 16.2 and clang++-21 building the vector challenge, with the build
// paths at /work/vector.
func fixtureEdges(t *testing.T, name string) ([]NinjaEdge, []string) {
	t.Helper()
	b, err := os.ReadFile("testdata/compile/" + name + ".log")
	if err != nil {
		t.Fatal(err)
	}
	ps := NewPathStripper("/work/vector", "/opt/cppatlas/challenges/vector/src")
	return SplitNinjaLog(ps.Strip(Sanitize(b)))
}

func summarizeStage(t *testing.T, name string, stage int) (cs *summaryView) {
	t.Helper()
	edges, _ := fixtureEdges(t, name)
	var lines []string
	for _, e := range edges {
		if e.Failed && EdgeStage(e) == stage {
			lines = append(lines, e.Lines...)
		}
	}
	if lines == nil {
		t.Fatalf("%s: no failed edge for stage %d", name, stage)
	}
	s := SummarizeCompile(lines, SummaryOptions{LearnerFiles: map[string]bool{"include/my/vector.hpp": true}, OutputLimit: 64 << 10})
	return &summaryView{s.FirstError, s.Preflight, s.Output, s.ErrorCount}
}

type summaryView struct {
	first     string
	preflight []string
	output    string
	errors    int
}

func noLeaks(t *testing.T, name, s string) {
	t.Helper()
	for _, bad := range []string{"/work", "/opt/cppatlas", "ccache", "-std=", "-MF", "FAILED:", "[cppatlas-ninja", "root:x:0:0"} {
		if strings.Contains(s, bad) {
			t.Errorf("%s: output contains %q:\n%s", name, bad, s)
		}
	}
}

func TestSplitNinjaLog(t *testing.T) {
	edges, pre := fixtureEdges(t, "gcc-starter")
	if len(edges) != 5 {
		t.Fatalf("edges = %d", len(edges))
	}
	failed := 0
	for _, e := range edges {
		if e.Failed {
			failed++
			if EdgeStage(e) != 3 {
				t.Errorf("failed edge stage = %d", EdgeStage(e))
			}
			for _, l := range e.Lines {
				if strings.Contains(l, "-MF") {
					t.Errorf("command line kept: %q", l)
				}
			}
		}
	}
	if failed != 1 {
		t.Fatalf("failed = %d", failed)
	}
	if len(pre) == 0 || !strings.HasPrefix(pre[len(pre)-1], "ninja: build stopped") {
		t.Fatalf("preamble = %q", pre)
	}
}

func TestSummarizeCompileFixtures(t *testing.T) {
	for _, cc := range []string{"gcc", "clang"} {
		t.Run(cc+"/starter-preflight", func(t *testing.T) {
			s := summarizeStage(t, cc+"-starter", 3)
			if len(s.preflight) != 1 || !strings.Contains(s.preflight[0], "needs `void reserve(std::size_t new_cap)`") {
				t.Fatalf("preflight = %q", s.preflight)
			}
			if s.first != "" || s.output != "" || s.errors != 1 {
				t.Fatalf("first=%q output=%q errors=%d", s.first, s.output, s.errors)
			}
		})
		t.Run(cc+"/nopush-preflight", func(t *testing.T) {
			s := summarizeStage(t, cc+"-nopush", 2)
			if len(s.preflight) != 1 || !strings.Contains(s.preflight[0], "push_back(const T& value)") {
				t.Fatalf("preflight = %q", s.preflight)
			}
		})
		t.Run(cc+"/syntax", func(t *testing.T) {
			s := summarizeStage(t, cc+"-syntax", 1)
			if !strings.HasPrefix(s.first, "include/my/vector.hpp:62:53: error: expected") {
				t.Fatalf("first = %q", s.first)
			}
			// The learner's own line is quoted; nothing from tests/ is.
			if !strings.Contains(s.output, "return size_ +;") {
				t.Errorf("learner snippet missing:\n%s", s.output)
			}
			if strings.Contains(s.output, "TEST_CASE") || strings.Contains(s.output, "CHECK(") {
				t.Errorf("test source echoed:\n%s", s.output)
			}
			noLeaks(t, cc, s.output+s.first)
		})
		t.Run(cc+"/passwd-include", func(t *testing.T) {
			s := summarizeStage(t, cc+"-passwd", 1)
			if !strings.HasPrefix(s.first, "/etc/passwd:1:") || !strings.Contains(s.first, ForeignMessage) {
				t.Fatalf("first = %q", s.first)
			}
			if strings.Contains(s.output, "root") {
				t.Fatalf("content of /etc/passwd echoed:\n%s", s.output)
			}
			noLeaks(t, cc, s.output)
		})
		t.Run(cc+"/link", func(t *testing.T) {
			s := summarizeStage(t, cc+"-link", 1)
			if s.first != "include/my/vector.hpp:63:: undefined reference to `cppatlas_missing_symbol'" {
				t.Fatalf("first = %q", s.first)
			}
			if strings.Contains(s.output, ".text.") {
				t.Errorf("section noise kept:\n%s", s.output)
			}
			noLeaks(t, cc, s.output)
		})
	}
}

func TestSummarizeCompileHostile(t *testing.T) {
	// A learner file that #includes a test: diagnostics in tests/ never
	// quote their source lines.
	lines := []string{
		"tests/stage_01.cpp:40:5: error: secret test line follows",
		"   40 |     CHECK(v.size() == hidden_expected_value);",
		"      |     ^~~~~",
		"include/my/vector.hpp:3:1: error: my own error",
		"    3 | int x = ;",
		"      |         ^",
	}
	s := SummarizeCompile(lines, SummaryOptions{LearnerFiles: map[string]bool{"include/my/vector.hpp": true}})
	if strings.Contains(s.Output, "hidden_expected_value") {
		t.Fatalf("test source echoed:\n%s", s.Output)
	}
	if !strings.Contains(s.Output, "int x = ;") {
		t.Fatalf("learner snippet dropped:\n%s", s.Output)
	}
	if s.ErrorCount != 2 || !strings.HasPrefix(s.FirstError, "tests/stage_01.cpp:40:5") {
		t.Fatalf("%+v", s)
	}
	// Huge output is capped.
	var many []string
	for i := 0; i < 20000; i++ {
		many = append(many, "include/my/vector.hpp:1:1: error: "+strings.Repeat("x", 100))
	}
	s = SummarizeCompile(many, SummaryOptions{OutputLimit: 4096, LearnerFiles: map[string]bool{"include/my/vector.hpp": true}})
	if len(s.Output) > 4096+64 || !s.Truncated || s.ErrorCount != 20000 {
		t.Fatalf("len=%d truncated=%v errors=%d", len(s.Output), s.Truncated, s.ErrorCount)
	}
}

func TestSummarizeCompileCrashNoise(t *testing.T) {
	lines := []string{
		"LLVM ERROR: out of memory",
		"Allocation failed",
		"Stack dump:",
		"Stack dump without symbol names (ensure you have llvm-symbolizer in your PATH):",
		"0  libLLVM.so.21.1      0x0000f8f53da22d94 llvm::sys::PrintStackTrace(llvm::raw_ostream&, int) + 84",
		"255 libclang-cpp.so.21.1 0x0000f8f543894610 clang::Sema::Build() + 1704",
		"0.\tProgram arguments: clang++-21 -Iinclude -MF x.o.d -c tests/stage_01.cpp",
		"1.\tinclude/my/vector.hpp:76:34: current parser token '!='",
		"clang++-21: error: clang frontend command failed with exit code 134 (use -v to see invocation)",
		"Ubuntu clang version 21.1.8 (6ubuntu1)",
		"Target: aarch64-unknown-linux-gnu",
		"Thread model: posix",
		"InstalledDir: bin",
		"Configuration file: clang++.cfg",
		"clang++-21: note: diagnostic msg: stage_01-a4bcfe.cpp",
		"********************",
	}
	s := SummarizeCompile(lines, SummaryOptions{LearnerFiles: map[string]bool{"include/my/vector.hpp": true}})
	for _, bad := range []string{"Program arguments", "-MF", "InstalledDir", "Configuration file", "diagnostic msg", "Stack dump", "libLLVM", "0x0000"} {
		if strings.Contains(s.Output, bad) {
			t.Errorf("kept %q:\n%s", bad, s.Output)
		}
	}
	if s.FirstError != "LLVM ERROR: out of memory" && !strings.Contains(s.FirstError, "frontend command failed") {
		t.Errorf("first = %q", s.FirstError)
	}
}
