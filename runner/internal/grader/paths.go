package grader

import (
	"regexp"
	"sort"
	"strings"
)

// PathStripper removes sandbox-internal absolute paths from text shown to the
// learner, so diagnostics read "include/my/vector.hpp:12:3" and
// "tests/stage_02.cpp:30:20" instead of "/work/vector/include/...", and
// toolchain headers read "c++/bits/stl_vector.h".
type PathStripper struct {
	prefixes []string // replaced by ""; longest first
	res      []pathRule
}

type pathRule struct {
	re   *regexp.Regexp
	repl string
}

// Toolchain locations, most specific first. They are deliberately generic
// (any GCC version/triple, any LLVM version) so a compiler upgrade needs no
// change here.
var toolchainRules = []pathRule{
	// GCC's libstdc++ headers, directly or through the lib/gcc/<triple>/<v>/../../.. hop.
	{regexp.MustCompile(`(?:/usr/local|/usr|/opt/[^\s:'"/]+)(?:/lib(?:64)?/gcc/[^\s:'"/]+/[^\s:'"/]+(?:/\.\.)+)?/include/c\+\+/[0-9][^\s:'"/]*/`), "c++/"},
	// GCC's own headers (stddef.h, ...) and plugin dirs.
	{regexp.MustCompile(`(?:/usr/local|/usr)/lib(?:64)?/gcc/[^\s:'"/]+/[0-9][^\s:'"/]*/include/`), "gcc/"},
	// Clang resource headers.
	{regexp.MustCompile(`/usr/lib/llvm-[0-9]+/lib/clang/[0-9][^\s:'"/]*/include/`), "clang/"},
	{regexp.MustCompile(`/usr/lib/llvm-[0-9]+/bin/`), ""},
	// Linker / driver binaries.
	{regexp.MustCompile(`(?:/usr/local|/usr)/libexec/gcc/[^\s:'"/]+/[0-9][^\s:'"/]*/`), ""},
	{regexp.MustCompile(`(?:/usr/local|/usr)/(?:[^\s:'"/]+-linux-gnu/)?bin/((?:ld|ld\.bfd|ld\.gold|ld\.lld|ar|as|collect2)\b)`), "$1"},
	// Sanitizer runtimes.
	{regexp.MustCompile(`(?:/usr/local|/usr)/lib(?:64)?/(?:[^\s:'"/]+-linux-gnu/)?(lib(?:asan|ubsan|lsan|stdc\+\+|gcc_s|c)\.so[.0-9]*)`), "$1"},
	{regexp.MustCompile(`(?:/usr/local|/usr)/lib(?:64)?/(?:[^\s:'"/]+-linux-gnu/)?(lib[a-z0-9_+]+\.so[.0-9]*)`), "$1"},
	// System headers.
	{regexp.MustCompile(`/usr/include/`), ""},
}

// NewPathStripper builds a stripper for a challenge checked out at workRoot
// (e.g. "/work/vector") whose read-only tree lives at srcRoot. Extra prefixes
// (the work dir itself, the prebuilt tree) are stripped too.
func NewPathStripper(workRoot, srcRoot string, extra ...string) *PathStripper {
	ps := &PathStripper{res: toolchainRules}
	add := func(p string) {
		p = strings.TrimRight(p, "/")
		if p == "" || p == "." {
			return
		}
		ps.prefixes = append(ps.prefixes, p+"/")
	}
	add(workRoot)
	add(srcRoot)
	for _, e := range extra {
		add(e)
	}
	sort.Slice(ps.prefixes, func(i, j int) bool { return len(ps.prefixes[i]) > len(ps.prefixes[j]) })
	return ps
}

// genericInternal catches whatever absolute sandbox path is left over.
var genericInternal = regexp.MustCompile(`/(?:work|opt/cppatlas)\b(?:/[^\s:'"()<>,]*)?`)

// Strip rewrites all known internal paths in s.
func (ps *PathStripper) Strip(s string) string {
	if ps == nil {
		return s
	}
	for _, p := range ps.prefixes {
		s = strings.ReplaceAll(s, p, "")
	}
	for _, r := range ps.res {
		s = r.re.ReplaceAllString(s, r.repl)
	}
	s = genericInternal.ReplaceAllStringFunc(s, func(m string) string {
		// Keep only the last two path components: enough to recognise the file.
		parts := strings.Split(strings.Trim(m, "/"), "/")
		if len(parts) <= 2 {
			return "<sandbox>"
		}
		return "<sandbox>/" + strings.Join(parts[len(parts)-2:], "/")
	})
	return s
}
