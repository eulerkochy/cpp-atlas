package grader

import (
	"regexp"
	"strconv"
	"strings"

	"cppatlas.com/runner/internal/protocol"
)

// NinjaStatusPrefix is put in NINJA_STATUS so edge boundaries in the build log
// can be found reliably. (A learner could print it from a #error message; that
// only confuses the attribution of their own errors.)
const NinjaStatusPrefix = "[cppatlas-ninja "

// NinjaEdge is one build step's block in ninja's output: the status line,
// optionally "FAILED: <outputs>" + the command line, then the step's output.
type NinjaEdge struct {
	Status  string   // "Building CXX object CMakeFiles/stage_02.dir/tests/stage_02.cpp.o"
	Failed  bool     // a FAILED: line was seen
	Outputs string   // the FAILED: line's outputs
	Lines   []string // the step's own output (compiler / linker diagnostics)
}

var (
	ninjaStatusRe = regexp.MustCompile(`^\[cppatlas-ninja [0-9]+/[0-9]+\] ?(.*)$`)
	ninjaFailedRe = regexp.MustCompile(`^FAILED: (?:\[code=[0-9-]+\] )?(.*?)\s*$`)
	stageTargetRe = regexp.MustCompile(`(?:^|[/ ])stage_([0-9]{2,3})(?:\b|\.dir)`)
)

// SplitNinjaLog parses a combined ninja log (NINJA_STATUS = NinjaStatusPrefix
// "%f/%t] "). Lines before the first status line and "ninja: ..." lines are
// returned as preamble (configure re-runs, ninja's own errors).
func SplitNinjaLog(log string) (edges []NinjaEdge, preamble []string) {
	var cur *NinjaEdge
	expectCmd := false
	for _, line := range splitLines(log) {
		if m := ninjaStatusRe.FindStringSubmatch(line); m != nil {
			edges = append(edges, NinjaEdge{Status: m[1]})
			cur = &edges[len(edges)-1]
			expectCmd = false
			continue
		}
		if strings.HasPrefix(line, "ninja: ") {
			preamble = append(preamble, line)
			continue
		}
		if cur == nil {
			preamble = append(preamble, line)
			continue
		}
		if m := ninjaFailedRe.FindStringSubmatch(line); m != nil && !cur.Failed && len(cur.Lines) == 0 {
			cur.Failed = true
			cur.Outputs = m[1]
			expectCmd = true
			continue
		}
		if expectCmd {
			expectCmd = false // the compiler / linker command line: never shown
			continue
		}
		cur.Lines = append(cur.Lines, line)
	}
	return edges, preamble
}

// EdgeStage returns the stage number an edge belongs to (0 if none).
func EdgeStage(e NinjaEdge) int {
	for _, s := range []string{e.Outputs, e.Status} {
		if m := stageTargetRe.FindStringSubmatch(s); m != nil {
			n, _ := strconv.Atoi(m[1])
			return n
		}
	}
	return 0
}

// ---------------------------------------------------------------- summaries

// Diagnostic line shapes (GCC and Clang, after path stripping).
var (
	// file:line:col: kind: message   (col optional, as in linker "file:63:(...)")
	diagHeaderRe = regexp.MustCompile(`^([^\s:][^:]*?):([0-9]+):(?:([0-9]+):)? ?(fatal error|error|warning|note|remark): ?(.*)$`)
	// "file: In member function ...", "file: In instantiation of ...", "file: At global scope:"
	diagContextRe = regexp.MustCompile(`^([^\s:][^:]*?): (?:In |At |required from)`)
	// GCC "file:line:col:   required from here" / "required by substitution"
	diagRequiredRe = regexp.MustCompile(`^([^\s:][^:]*?):([0-9]+):([0-9]+):\s+(required|in |recursively)`)
	includedFromRe = regexp.MustCompile(`^(?:In file included from |\s+from )([^:]+):[0-9]+`)
	// Source snippet / caret / fix-it lines: "   30 | code", "      |   ^~~", "  +++ |+#include".
	snippetRe     = regexp.MustCompile(`^\s*(?:[0-9]+\s*)?(?:\+\+\+\s*)?\|`)
	staticAssert  = regexp.MustCompile(`static assert(?:ion)? failed(?: due to requirement '(?:[^']|'')*')?: ?(.*)$`)
	errorsGenRe   = regexp.MustCompile(`^[0-9]+ errors? generated\.$|^[0-9]+ warnings? (and [0-9]+ errors? )?generated\.$`)
	linkerErrorRe = regexp.MustCompile(`(undefined reference to|multiple definition of|cannot find -l|relocation truncated|ld returned [0-9]+ exit status|linker command failed)`)
	// Compiler crash reports (clang "Stack dump:", driver banners) quote the
	// full command line and toolchain paths; they are dropped.
	crashNoiseRe = regexp.MustCompile(`^(?:[0-9]+\.\t|[0-9]+ +\S+ +0x[0-9a-fA-F]+|Stack dump|PLEASE (?:submit|ATTACH)|Preprocessed source|InstalledDir:|Configuration file:|Thread model:|Target: |(?:Ubuntu |Debian )?clang version |\*{8,}$|Please submit a full bug report|See <https?://)|diagnostic msg:`)
	sectionRe    = regexp.MustCompile(`:\(\.[^)]*\)`)
	ldPrefixRe   = regexp.MustCompile(`^(?:ld(?:\.bfd|\.gold|\.lld)?|collect2|clang(?:\+\+)?(?:-[0-9]+)?|g\+\+|c\+\+): `)
)

// SummaryOptions controls compile summaries.
type SummaryOptions struct {
	// LearnerFiles are the (stripped, relative) paths of submitted files.
	// Source snippets are only kept for diagnostics located in these files.
	LearnerFiles map[string]bool
	// OutputLimit caps CompileSummary.Output (bytes).
	OutputLimit int
}

// diagGroup is one diagnostic with its context: include chain, "In function"
// lines, the header, notes and snippets that belong to it.
type diagGroup struct {
	lines     []string
	preflight bool
}

// SummarizeCompile turns the (already sanitised and path-stripped) output of
// a stage's failed build steps into a CompileSummary.
//
// Rules (they are the "never echo test source" policy):
//   - ninja status/FAILED/command lines never reach this function;
//   - a source snippet / caret / fix-it line is kept only when the diagnostic
//     it belongs to is located in a learner file; snippets quoting tests/,
//     support headers, the standard library or any other file (e.g. an
//     `#include "/etc/passwd"`) are dropped, the diagnostic line itself is kept;
//   - static_assert failures located outside learner files are preflight
//     messages: listed in Preflight (deduplicated, source order) and their
//     blocks removed from Output when other errors exist, as ./cppatlas does.
func SummarizeCompile(lines []string, opt SummaryOptions) *protocol.CompileSummary {
	if opt.OutputLimit <= 0 {
		opt.OutputLimit = 64 << 10
	}
	cs := &protocol.CompileSummary{}
	filtered := filterSnippets(lines, opt.LearnerFiles)

	seenPre := map[string]bool{}
	firstLinker := ""
	for _, l := range filtered {
		h := diagHeaderRe.FindStringSubmatch(l)
		isErr := h != nil && (h[4] == "error" || h[4] == "fatal error")
		if h == nil {
			// "ld: ...: undefined reference", "collect2: error: ld returned 1", "clang++: error: linker ..."
			if ldPrefixRe.MatchString(l) && linkerErrorRe.MatchString(l) {
				if strings.Contains(l, "error:") || strings.Contains(l, "undefined reference") || strings.Contains(l, "multiple definition") {
					if !strings.Contains(l, "ld returned") && !strings.Contains(l, "linker command failed") {
						cs.ErrorCount++
					}
				}
				if firstLinker == "" && !strings.Contains(l, "ld returned") && !strings.Contains(l, "linker command failed") {
					firstLinker = l
				}
			}
			continue
		}
		if isErr && linkerErrorRe.MatchString(h[5]) {
			// "include/my/vector.hpp:63:(.text+0x10): undefined reference to `x'"
			cs.ErrorCount++
			if firstLinker == "" {
				firstLinker = l
			}
			continue
		}
		if !isErr {
			continue
		}
		cs.ErrorCount++
		if m := staticAssert.FindStringSubmatch(h[5]); m != nil && !opt.LearnerFiles[h[1]] {
			msg := strings.TrimSpace(m[1])
			if msg == "" {
				msg = strings.TrimSpace(h[5])
			}
			msg = capLine(msg, 600)
			if !seenPre[msg] && len(cs.Preflight) < 64 {
				seenPre[msg] = true
				cs.Preflight = append(cs.Preflight, msg)
			}
			continue
		}
		if cs.FirstError == "" {
			cs.FirstError = capLine(l, 600)
		}
	}
	if cs.FirstError == "" && firstLinker != "" {
		fl := ldPrefixRe.ReplaceAllString(firstLinker, "")
		fl = sectionRe.ReplaceAllString(fl, ":")
		cs.FirstError = capLine(fl, 600)
	}

	shown := filtered
	if len(cs.Preflight) > 0 {
		shown = dropPreflightGroups(filtered, opt.LearnerFiles)
		if !hasRealError(shown) {
			shown = nil
		}
	}
	for i, l := range shown {
		// Mangled linker noise can be enormous; keep each line readable.
		shown[i] = capLine(sectionRe.ReplaceAllString(l, ":"), 2000)
	}
	text := strings.Join(shown, "\n")
	if text != "" {
		text += "\n"
	}
	cs.Output, cs.Truncated = CapText(text, opt.OutputLimit, false)
	if cs.FirstError == "" && len(cs.Preflight) == 0 {
		// Something failed without a recognisable diagnostic (killed compiler,
		// assembler error, ...): show the first non-empty line.
		for _, l := range shown {
			if strings.TrimSpace(l) != "" {
				cs.FirstError = capLine(l, 600)
				break
			}
		}
	}
	return cs
}

// locationOf returns the file a diagnostic-ish line refers to, or "".
func locationOf(l string) (file string, header bool) {
	if h := diagHeaderRe.FindStringSubmatch(l); h != nil {
		return h[1], true
	}
	if m := diagRequiredRe.FindStringSubmatch(l); m != nil {
		return m[1], true
	}
	if m := diagContextRe.FindStringSubmatch(l); m != nil {
		return m[1], true
	}
	return "", false
}

// filterSnippets drops snippet lines that belong to diagnostics not located
// in a learner file, and removes clang's "N errors generated." noise.
func filterSnippets(lines []string, learner map[string]bool) []string {
	out := make([]string, 0, len(lines))
	keepSnippets := false
	for _, l := range lines {
		if errorsGenRe.MatchString(strings.TrimSpace(l)) || crashNoiseRe.MatchString(l) {
			continue
		}
		if file, ok := locationOf(l); ok {
			keepSnippets = learner[file]
			out = append(out, redactForeign(l, file))
			continue
		}
		if snippetRe.MatchString(l) {
			if keepSnippets {
				out = append(out, l)
			}
			continue
		}
		out = append(out, l)
	}
	return out
}

func isGroupStart(l, prev string) bool {
	if strings.HasPrefix(l, "In file included from ") {
		return !strings.HasPrefix(prev, "In file included from ") // clang repeats the prefix per level
	}
	if diagContextRe.MatchString(l) && !diagRequiredRe.MatchString(l) {
		return !includedFromRe.MatchString(prev) && !strings.HasPrefix(prev, "In file included from ")
	}
	if h := diagHeaderRe.FindStringSubmatch(l); h != nil && h[4] != "note" {
		return !includedFromRe.MatchString(prev) && !diagContextRe.MatchString(prev)
	}
	return false
}

// dropPreflightGroups removes the diagnostics (with their include chains,
// snippets and notes) that belong to preflight static_asserts.
func dropPreflightGroups(lines []string, learner map[string]bool) []string {
	var groups []diagGroup
	prev := ""
	for _, l := range lines {
		if len(groups) == 0 || isGroupStart(l, prev) {
			groups = append(groups, diagGroup{})
		}
		g := &groups[len(groups)-1]
		g.lines = append(g.lines, l)
		if h := diagHeaderRe.FindStringSubmatch(l); h != nil && (h[4] == "error" || h[4] == "fatal error") &&
			staticAssert.MatchString(h[5]) && !learner[h[1]] {
			g.preflight = true
		}
		prev = l
	}
	var out []string
	for _, g := range groups {
		if !g.preflight {
			out = append(out, g.lines...)
		}
	}
	return out
}

func hasRealError(lines []string) bool {
	for _, l := range lines {
		if h := diagHeaderRe.FindStringSubmatch(l); h != nil && (h[4] == "error" || h[4] == "fatal error") {
			return true
		}
		if linkerErrorRe.MatchString(l) {
			return true
		}
	}
	return false
}

// ForeignMessage replaces the text of diagnostics located in a file that is
// neither the learner's, the challenge's nor the toolchain's (after path
// stripping those are all relative): e.g. `#include "/etc/passwd"`. Compiler
// messages quote tokens of the file, so they would echo its content.
const ForeignMessage = "(message hidden: this file is not part of the submission, the challenge or the toolchain)"

func redactForeign(l, file string) string {
	if !strings.HasPrefix(file, "/") {
		return l
	}
	if h := diagHeaderRe.FindStringSubmatchIndex(l); h != nil && h[10] >= 0 {
		return l[:h[10]] + ForeignMessage
	}
	return l
}
