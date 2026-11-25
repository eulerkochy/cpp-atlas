package grader

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"cppatlas.com/runner/internal/protocol"
)

func TestCapResult(t *testing.T) {
	res := &protocol.Result{RunID: "r", Status: protocol.ResultCompleted}
	for i := 1; i <= 8; i++ {
		sr := protocol.StageResult{Stage: i, Status: protocol.StageFailed, Output: strings.Repeat("o", 64<<10)}
		for j := 0; j < 200; j++ {
			sr.Trace = append(sr.Trace, json.RawMessage(fmt.Sprintf(`{"ev":"x","pad":"%s"}`, strings.Repeat("t", 1000))))
		}
		for j := 0; j < 100; j++ {
			sr.Tests = append(sr.Tests, protocol.TestCase{Name: "t", Status: protocol.StageFailed,
				Messages: []string{strings.Repeat("m", 2000), strings.Repeat("m", 2000), strings.Repeat("m", 2000)}})
		}
		res.Stages = append(res.Stages, sr)
	}
	CapResult(res, 1<<20)
	b, _ := json.Marshal(res)
	if len(b) > 1<<20 {
		t.Fatalf("result is %d bytes", len(b))
	}
	if res.Stages[0].Trace != nil || !res.Stages[0].TraceTruncated {
		t.Fatal("trace not dropped first")
	}
	if len(res.Stages) != 8 || res.Stages[7].Status != protocol.StageFailed {
		t.Fatal("stage verdicts lost")
	}

	small := &protocol.Result{RunID: "r", Stages: []protocol.StageResult{{Stage: 1, Output: "x", Trace: []json.RawMessage{json.RawMessage(`{}`)}}}}
	CapResult(small, 1<<20)
	if small.Stages[0].Trace == nil {
		t.Fatal("small result modified")
	}
}

func TestReadTrace(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "trace.jsonl")
	lines := []string{
		`{"ev":"test","name":"first"}`,
		`{"ev":"alloc","n":1}`,
		`not json`,
		`{"ev":"test","name":"second"}`,
		`{"ev":"alloc","n":2}`,
		`{"ev":"construct","n":3}`,
		`{"ev":"test","name":"third"}`,
		`{"ev":"alloc","n":4}`,
	}
	os.WriteFile(p, []byte(strings.Join(lines, "\n")+"\n{\"ev\":\"trunc"), 0o644)
	got, tr := readTrace(p, 1<<20, "second")
	if len(got) != 3 || string(got[0]) != lines[3] || string(got[2]) != lines[5] || tr {
		t.Fatalf("segment = %s (truncated %v)", got, tr)
	}
	got, _ = readTrace(p, 1<<20, "")
	if len(got) != 7 {
		t.Fatalf("all = %d lines", len(got))
	}
	got, tr = readTrace(p, 40, "")
	if len(got) != 1 || !tr {
		t.Fatalf("capped = %s %v", got, tr)
	}
	// A FIFO or symlink planted by the test program is not followed.
	os.Symlink("/etc/passwd", filepath.Join(dir, "link"))
	if got, _ := readTrace(filepath.Join(dir, "link"), 1<<20, ""); got != nil {
		t.Fatal("followed a symlink")
	}
}

func TestTestEnv(t *testing.T) {
	lim := protocol.DefaultLimits()
	env := testEnv([]string{"ASAN_OPTIONS=halt_on_error=1:detect_leaks=1", "UBSAN_OPTIONS=print_stacktrace=1", "bad key=x", "LD_PRELOAD"}, lim, true)
	if len(env) != 2 || env[0] != "ASAN_OPTIONS=halt_on_error=1:detect_leaks=1:hard_rss_limit_mb=2048:disable_coredump=1" {
		t.Fatalf("%q", env)
	}
	if env := testEnv(nil, lim, true); len(env) != 1 || !strings.HasPrefix(env[0], "ASAN_OPTIONS=hard_rss_limit_mb=") {
		t.Fatalf("%q", env)
	}
	if env := testEnv([]string{"ASAN_OPTIONS=x=1"}, lim, false); env[0] != "ASAN_OPTIONS=x=1" {
		t.Fatalf("%q", env)
	}
}

func TestSanitizerSummary(t *testing.T) {
	asan := "=================================================================\n==12==ERROR: AddressSanitizer: heap-use-after-free on address 0x1\n...\nSUMMARY: AddressSanitizer: heap-use-after-free include/my/vector.hpp:40 in my::vector<int>::operator[]\n"
	if s := sanitizerSummary(asan); !strings.HasPrefix(s, "AddressSanitizer: heap-use-after-free include/my/vector.hpp:40") {
		t.Fatalf("%q", s)
	}
	ub := "include/my/vector.hpp:12:5: runtime error: signed integer overflow\n"
	if s := sanitizerSummary(ub); !strings.Contains(s, "runtime error: signed integer overflow") {
		t.Fatalf("%q", s)
	}
	if s := sanitizerSummary("all good\n"); s != "" {
		t.Fatalf("%q", s)
	}
}

func TestReadNinjaLogTimes(t *testing.T) {
	p := filepath.Join(t.TempDir(), ".ninja_log")
	os.WriteFile(p, []byte("# ninja log v7\n"+
		"0\t900\t1\tCMakeFiles/stage_01.dir/tests/stage_01.cpp.o\tabc\n"+
		"900\t1000\t1\tstage_01\tdef\n"+
		"0\t3000\t1\tCMakeFiles/stage_04.dir/tests/stage_04.cpp.o\tabc\n"+
		"5\t10\t1\tCMakeFiles/cppatlas_doctest_main.dir/x.o\tabc\n"), 0o644)
	got := readNinjaLogTimes(p, time.Now())
	if got["stage_01"] != 1000 || got["stage_04"] != 3000 || len(got) != 2 {
		t.Fatalf("%v", got)
	}
}

func TestWriteNewFile(t *testing.T) {
	root := t.TempDir()
	if err := WriteNewFile(root, "include/my/vector.hpp", []byte("x")); err != nil {
		t.Fatal(err)
	}
	if err := WriteNewFile(root, "../escape", nil); err == nil {
		t.Fatal("escaped root")
	}
	os.Symlink("/tmp", filepath.Join(root, "include", "evil"))
	if err := WriteNewFile(root, "include/evil/x.hpp", nil); err == nil {
		t.Fatal("wrote through a symlink")
	}
	os.Symlink("/etc/passwd", filepath.Join(root, "include", "p.hpp"))
	if err := WriteNewFile(root, "include/p.hpp", nil); err == nil {
		t.Fatal("replaced a symlink")
	}
}
