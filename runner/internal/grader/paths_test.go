package grader

import (
	"strings"
	"testing"
)

func TestPathStripper(t *testing.T) {
	ps := NewPathStripper("/work/vector", "/opt/cppatlas/challenges/vector/src",
		"/opt/cppatlas/challenges/vector/prebuilt", "/work/run", "/work/tmp")
	cases := []struct{ in, want string }{
		{"/work/vector/include/my/vector.hpp:12:3: error: x", "include/my/vector.hpp:12:3: error: x"},
		{"In file included from /work/vector/tests/support/harness.hpp:22,", "In file included from tests/support/harness.hpp:22,"},
		{"/opt/cppatlas/challenges/vector/src/tests/stage_01.cpp:5", "tests/stage_01.cpp:5"},
		{"/work/run/stage_01/report.xml", "stage_01/report.xml"},
		{"/usr/local/include/c++/16.2.0/bits/stl_vector.h:100:5: note", "c++/bits/stl_vector.h:100:5: note"},
		{"/usr/local/lib/gcc/x86_64-linux-gnu/16.2.0/../../../../include/c++/16.2.0/new:1", "c++/new:1"},
		{"/usr/include/c++/16/bits/move.h:1", "c++/bits/move.h:1"},
		{"/usr/lib/llvm-21/lib/clang/21/include/stddef.h:3", "clang/stddef.h:3"},
		{"/usr/local/lib/gcc/aarch64-linux-gnu/16.2.0/include/stddef.h:1", "gcc/stddef.h:1"},
		{"/usr/bin/ld: undefined reference", "ld: undefined reference"},
		{"/usr/lib/x86_64-linux-gnu/libasan.so.8+0x1234", "libasan.so.8+0x1234"},
		{"/usr/include/stdio.h:3", "stdio.h:3"},
		{"/work/elsewhere/secret.txt", "<sandbox>/elsewhere/secret.txt"},
		{"see /opt/cppatlas/challenges/other/x/y/z.h here", "see <sandbox>/y/z.h here"},
		{"/etc/passwd:1:1: error", "/etc/passwd:1:1: error"},
	}
	for _, c := range cases {
		if got := ps.Strip(c.in); got != c.want {
			t.Errorf("Strip(%q) = %q, want %q", c.in, got, c.want)
		}
	}
	// Nothing that looks like a sandbox path may survive.
	in := "/work /work/ /opt/cppatlas /opt/cppatlas/challenges /work/vector/build/gcc-debug/CMakeFiles/x.o"
	if out := ps.Strip(in); strings.Contains(out, "/work") || strings.Contains(out, "/opt/cppatlas") {
		t.Errorf("leak: %q", out)
	}
}
