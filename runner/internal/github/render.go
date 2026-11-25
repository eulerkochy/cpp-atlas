package github

import (
	"fmt"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"unicode/utf8"

	"cppatlas.com/runner/internal/protocol"
)

// GitHub's limits for check run output.
const (
	maxSummary        = 65535
	maxText           = 65535
	maxAnnotations    = 50
	maxAnnotationMsg  = 1000
	maxInline         = 300
	maxTestsShown     = 20
	maxMessagesPerCas = 4000
)

type checkOutput struct {
	Title       string       `json:"title"`
	Summary     string       `json:"summary"`
	Text        string       `json:"text,omitempty"`
	Annotations []annotation `json:"annotations,omitempty"`
}

type annotation struct {
	Path            string `json:"path"`
	StartLine       int    `json:"start_line"`
	EndLine         int    `json:"end_line"`
	AnnotationLevel string `json:"annotation_level"`
	Title           string `json:"title,omitempty"`
	Message         string `json:"message"`
}

type gradeInfo struct {
	challenge string
	total     int
	stages    []int
	site      string
	sha       string
}

func (g gradeInfo) stagesPhrase() string {
	n := len(g.stages)
	switch {
	case n == g.total:
		return fmt.Sprintf("all %d stages of %s", g.total, inlineCode(g.challenge))
	case n == 1:
		return fmt.Sprintf("stage 1 of %s", inlineCode(g.challenge))
	default:
		return fmt.Sprintf("stages 1-%d of %s", n, inlineCode(g.challenge))
	}
}

// ---------------------------------------------------------------- escaping

var (
	ansiRE = regexp.MustCompile(`\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?|\x1b[@-Z\\-_]`)
)

// cleanText makes untrusted output displayable: valid UTF-8, no ANSI escapes,
// no control characters other than newline and tab, no bidi overrides.
func cleanText(s string) string {
	s = strings.ToValidUTF8(s, "�")
	s = ansiRE.ReplaceAllString(s, "")
	s = strings.ReplaceAll(s, "\r\n", "\n")
	return strings.Map(func(r rune) rune {
		switch {
		case r == '\n' || r == '\t':
			return r
		case r < 0x20 || r == 0x7f || (r >= 0x80 && r < 0xa0):
			return -1
		case r >= 0x202a && r <= 0x202e, r >= 0x2066 && r <= 0x2069, r == 0x200e, r == 0x200f, r == 0x061c:
			return '�'
		}
		return r
	}, s)
}

func longestRun(s string, c byte) int {
	best, cur := 0, 0
	for i := 0; i < len(s); i++ {
		if s[i] == c {
			cur++
			best = max(best, cur)
		} else {
			cur = 0
		}
	}
	return best
}

// truncRunes cuts s to at most n bytes on a rune boundary.
func truncRunes(s string, n int) string {
	if len(s) <= n {
		return s
	}
	if n <= 0 {
		return ""
	}
	for n > 0 && !utf8.RuneStart(s[n]) {
		n--
	}
	return s[:n]
}

// inlineCode renders untrusted text as a single-line code span. Code spans
// render neither HTML, Markdown nor @mentions.
func inlineCode(s string) string {
	s = cleanText(s)
	s = strings.Join(strings.Fields(strings.ReplaceAll(s, "\t", " ")), " ")
	if len(s) > maxInline {
		s = truncRunes(s, maxInline) + "..."
	}
	if s == "" {
		return "` `"
	}
	fence := strings.Repeat("`", longestRun(s, '`')+1)
	if strings.HasPrefix(s, "`") || strings.HasSuffix(s, "`") {
		s = " " + s + " "
	}
	return fence + s + fence
}

func fenceFor(s string) string { return strings.Repeat("`", max(3, longestRun(s, '`')+1)) }

// fenced renders untrusted text as a fenced code block whose fence is longer
// than any backtick run inside, so the content cannot close it.
func fenced(s string) string {
	s = strings.TrimRight(cleanText(s), "\n")
	f := fenceFor(s)
	return f + "text\n" + s + "\n" + f + "\n"
}

// ------------------------------------------------------------ size budgets

const truncNote = "\n\n---\n_Output truncated to fit GitHub's 65535-character limit. Run `./cppatlas test -v` locally for the full log._\n"

// mdBuilder accumulates Markdown under a byte limit (bytes >= characters, so
// a byte limit is always within GitHub's character limit). Once something does
// not fit, the rest is dropped and a note is appended.
type mdBuilder struct {
	b         strings.Builder
	limit     int
	truncated bool
}

func newMD(limit int) *mdBuilder { return &mdBuilder{limit: limit} }

func (m *mdBuilder) room() int { return m.limit - len(truncNote) - m.b.Len() }

// raw appends trusted Markdown (ours) if it fits whole.
func (m *mdBuilder) raw(s string) {
	if m.truncated {
		return
	}
	if len(s) > m.room() {
		m.truncated = true
		return
	}
	m.b.WriteString(s)
}

// code appends untrusted text as a fenced block, shortening the content (on a
// line boundary when possible) to fit, always closing the fence.
func (m *mdBuilder) code(s string, capBytes int) {
	if m.truncated {
		return
	}
	s = strings.TrimRight(cleanText(s), "\n")
	f := fenceFor(s)
	const cut = "\n... (truncated)"
	overhead := 2*len(f) + len("text\n") + 2
	shorten := func(n int) string {
		t := truncRunes(s, n)
		if i := strings.LastIndexByte(t, '\n'); i > len(t)/2 {
			t = t[:i]
		}
		return t + cut
	}
	if capBytes > 0 && len(s) > capBytes {
		s = shorten(capBytes - len(cut))
	}
	if len(s)+overhead > m.room() {
		avail := m.room() - overhead - len(cut)
		if avail < 200 {
			m.truncated = true
			return
		}
		s = shorten(avail)
		m.b.WriteString(f + "text\n" + s + "\n" + f + "\n")
		m.truncated = true
		return
	}
	m.b.WriteString(f + "text\n" + s + "\n" + f + "\n")
}

func (m *mdBuilder) String() string {
	if m.truncated {
		return m.b.String() + truncNote
	}
	return m.b.String()
}

// ------------------------------------------------------------------ results

func statusWord(s string) string {
	switch s {
	case protocol.StagePassed:
		return "passed"
	case protocol.StageFailed:
		return "failed"
	case protocol.StageCompileError:
		return "does not compile"
	case protocol.StageTimeout:
		return "timed out"
	case protocol.StageCrashed:
		return "crashed"
	case protocol.StageSkipped:
		return "skipped"
	}
	return "not run"
}

func fmtMs(ms int64) string {
	if ms <= 0 {
		return "-"
	}
	return strconv.FormatFloat(float64(ms)/1000, 'f', 2, 64) + " s"
}

// safeLabel keeps short grader-provided labels (compiler version, preset) to a
// harmless character set.
var unsafeLabelRE = regexp.MustCompile(`[^A-Za-z0-9 ._+()-]`)

func safeLabel(s string) string {
	s = unsafeLabelRE.ReplaceAllString(s, "")
	if len(s) > 60 {
		s = s[:60]
	}
	return s
}

// renderView turns a terminal RunView into the check conclusion, details URL
// and output.
func renderView(g gradeInfo, v protocol.RunView, allowed []string) (string, string, checkOutput) {
	chURL := challengeURL(g.site, g.challenge)
	switch v.Status {
	case protocol.RunTimeout:
		return "timed_out", chURL, checkOutput{
			Title:   "Grading timed out",
			Summary: "The run exceeded the grading server's wall-clock limit and was stopped. This usually means a test never finishes (an infinite loop); run `./cppatlas test` locally to see which stage hangs." + regradeHint,
		}
	case protocol.RunCompleted:
	default:
		return infraOutput(chURL, v.Error)
	}
	r := v.Result
	if r == nil {
		return infraOutput(chURL, v.Error)
	}
	if r.Status != protocol.ResultCompleted {
		return infraOutput(chURL, r.Error)
	}

	byStage := map[int]protocol.StageResult{}
	for _, s := range r.Stages {
		byStage[s.Stage] = s
	}
	var first *protocol.StageResult
	for _, n := range g.stages {
		if s, ok := byStage[n]; ok && s.Status != protocol.StagePassed && s.Status != protocol.StageSkipped {
			first = &s
			break
		}
	}
	allPassed := r.Passed && first == nil
	if !allPassed && first == nil {
		for _, n := range g.stages { // a stage missing from the result
			if s, ok := byStage[n]; !ok || s.Status != protocol.StagePassed {
				return infraOutput(chURL, &protocol.RunError{Message: fmt.Sprintf("stage %d has no result", n)})
			}
		}
	}

	var title, conclusion, details string
	if allPassed {
		conclusion = "success"
		n := len(g.stages)
		if n == g.total {
			title = fmt.Sprintf("All %d stages passed", g.total)
			details = chURL
		} else {
			title = fmt.Sprintf("Stages 1-%d of %d passed", n, g.total)
			if n == 1 {
				title = fmt.Sprintf("Stage 1 of %d passed", g.total)
			}
			details = stageURL(g.site, g.challenge, n+1)
		}
	} else {
		conclusion = "failure"
		info, _ := stageMeta(g.challenge, first.Stage)
		title = fmt.Sprintf("Stage %d of %d %s: %s", first.Stage, g.total, statusWord(first.Status), info.Slug)
		details = stageURL(g.site, g.challenge, first.Stage)
	}

	// Summary: headline + per-stage table + build info.
	sm := newMD(maxSummary)
	if allPassed {
		if len(g.stages) < g.total {
			sm.raw(fmt.Sprintf("**%s.** Next: [stage %d](%s).\n\n", title, len(g.stages)+1, details))
		} else {
			sm.raw(fmt.Sprintf("**%s.** You built `%s`.\n\n", title, safeLabel("my::"+g.challenge)))
		}
	} else {
		sm.raw(fmt.Sprintf("**%s.** Read the [stage %d spec](%s); details are below.\n\n", title, first.Stage, details))
	}
	sm.raw("| Stage | Name | Result | Tests | Time |\n|---:|---|---|---|---:|\n")
	for _, n := range g.stages {
		info, _ := stageMeta(g.challenge, n)
		s, ok := byStage[n]
		status, tests, tm := "not run", "-", "-"
		if ok {
			status = statusWord(s.Status)
			if s.Counts != nil && s.Counts.Total > 0 {
				tests = fmt.Sprintf("%d/%d", s.Counts.Passed, s.Counts.Total)
			}
			tm = fmtMs(s.BuildMs + s.RunMs)
		}
		if ok && first != nil && s.Stage == first.Stage {
			status = "**" + status + "**"
		}
		sm.raw(fmt.Sprintf("| %d | [%s](%s) | %s | %s | %s |\n", n, info.Slug, stageURL(g.site, g.challenge, n), status, tests, tm))
	}
	var meta []string
	if c := safeLabel(r.Compiler); c != "" {
		meta = append(meta, "compiler `"+c+"`")
	}
	if p := safeLabel(r.Preset); p != "" {
		meta = append(meta, "preset `"+p+"`")
	}
	meta = append(meta, "commit "+inlineCode(shortSHA(g.sha)))
	if r.Timings.TotalMs > 0 {
		meta = append(meta, "total "+fmtMs(r.Timings.TotalMs))
	}
	sm.raw("\n" + strings.Join(meta, " · ") + "\n")

	out := checkOutput{Title: title, Summary: sm.String()}
	if first != nil {
		out.Text = renderStageText(g, *first)
		out.Annotations = compileAnnotations(first.Compile, allowed)
	}
	return conclusion, details, out
}

func infraOutput(details string, e *protocol.RunError) (string, string, checkOutput) {
	sum := "cppatlas could not grade this commit because of a problem on our side, not in your code." + regradeHint
	if e != nil && e.Message != "" {
		sum += "\n\n" + fenced(e.Message)
	}
	return "neutral", details, checkOutput{Title: "cppatlas could not grade this commit", Summary: sum}
}

// renderStageText is the diagnostics for the first stage that did not pass.
func renderStageText(g gradeInfo, s protocol.StageResult) string {
	info, _ := stageMeta(g.challenge, s.Stage)
	m := newMD(maxText)
	m.raw(fmt.Sprintf("## Stage %d: %s (%s)\n\nSpec: %s\n\n", s.Stage, info.Slug, statusWord(s.Status), stageURL(g.site, g.challenge, s.Stage)))
	switch s.Status {
	case protocol.StageCompileError:
		c := s.Compile
		if c == nil {
			m.raw("The stage did not compile.\n\n")
			break
		}
		if len(c.Preflight) > 0 {
			m.raw("### Your vector is missing something this stage needs\n\n")
			for _, p := range c.Preflight {
				m.raw("- " + inlineCode(p) + "\n")
			}
			m.raw("\n")
		}
		if c.FirstError != "" {
			m.raw("### First compiler error\n\n")
			m.code(c.FirstError, 4000)
			m.raw("\n")
		}
		if c.Output != "" {
			label := "### Compiler output"
			if c.ErrorCount > 0 {
				label += fmt.Sprintf(" (%d errors)", c.ErrorCount)
			}
			if c.Truncated {
				label += ", truncated by the grader"
			}
			m.raw(label + "\n\n")
			m.code(c.Output, 0)
			m.raw("\n")
		}
	case protocol.StageFailed:
		var failed []protocol.TestCase
		for _, t := range s.Tests {
			if t.Status != protocol.StagePassed {
				failed = append(failed, t)
			}
		}
		if s.Counts != nil {
			m.raw(fmt.Sprintf("%d of %d test cases failed.\n\n", s.Counts.Failed, s.Counts.Total))
		}
		for i, t := range failed {
			if i == maxTestsShown {
				m.raw(fmt.Sprintf("... and %d more failing test cases.\n\n", len(failed)-maxTestsShown))
				break
			}
			m.raw("### Test case " + inlineCode(t.Name) + "\n\n")
			if len(t.Messages) > 0 {
				m.code(strings.Join(t.Messages, "\n"), maxMessagesPerCas)
			}
			m.raw("\n")
		}
		if len(failed) == 0 && s.Output != "" {
			m.raw("### Test output\n\n")
			m.code(s.Output, 0)
		}
	case protocol.StageTimeout, protocol.StageCrashed:
		var facts []string
		if s.Phase != "" {
			facts = append(facts, "- Phase: "+inlineCode(s.Phase))
		}
		if s.Signal != "" {
			facts = append(facts, "- Signal: "+inlineCode(s.Signal))
		}
		if s.ExitCode != nil {
			facts = append(facts, "- Exit code: "+inlineCode(strconv.Itoa(*s.ExitCode)))
		}
		if s.RunningTest != "" {
			facts = append(facts, "- Running test case: "+inlineCode(s.RunningTest))
		}
		if len(facts) > 0 {
			m.raw(strings.Join(facts, "\n") + "\n\n")
		}
		if s.Hint != "" {
			m.raw("**Hint:**\n\n")
			m.code(s.Hint, 2000)
			m.raw("\n")
		} else if s.Status == protocol.StageTimeout {
			m.raw("**Hint:** a test ran past its time limit, usually an infinite loop (check loop conditions in growth and copy code).\n\n")
		} else {
			m.raw("**Hint:** the test executable crashed. Run `./cppatlas test --only " + strconv.Itoa(s.Stage) + " --preset asan-ubsan` locally for a precise report.\n\n")
		}
		if s.Output != "" {
			label := "### Test output"
			if s.OutputTruncated {
				label += " (truncated by the grader)"
			}
			m.raw(label + "\n\n")
			m.code(s.Output, 0)
		}
	}
	m.raw("\nReproduce locally with `./cppatlas test " + strconv.Itoa(s.Stage) + "`.\n")
	return m.String()
}

// compileAnnotations extracts "path:line[:col]: error|warning: msg" lines that
// point into an allowlisted (learner) file. At most 50, deduplicated.
var diagRE = regexp.MustCompile(`^(.+?):(\d+)(?::\d+)?:\s*(fatal error|error|warning):\s*(.+)$`)

func compileAnnotations(c *protocol.CompileSummary, allowed []string) []annotation {
	if c == nil {
		return nil
	}
	var lines []string
	if c.FirstError != "" {
		lines = append(lines, strings.Split(c.FirstError, "\n")...)
	}
	lines = append(lines, strings.Split(c.Output, "\n")...)
	var out []annotation
	seen := map[string]bool{}
	for _, ln := range lines {
		ln = strings.TrimSpace(cleanText(ln))
		m := diagRE.FindStringSubmatch(ln)
		if m == nil {
			continue
		}
		path := ""
		for _, p := range allowed {
			if m[1] == p || strings.HasSuffix(m[1], "/"+p) {
				path = p
				break
			}
		}
		if path == "" {
			continue
		}
		line, err := strconv.Atoi(m[2])
		if err != nil || line < 1 {
			continue
		}
		key := path + ":" + m[2] + ":" + m[4]
		if seen[key] {
			continue
		}
		seen[key] = true
		level := "failure"
		if m[3] == "warning" {
			level = "warning"
		}
		msg := m[4]
		if len(msg) > maxAnnotationMsg {
			msg = truncRunes(msg, maxAnnotationMsg) + "..."
		}
		out = append(out, annotation{Path: path, StartLine: line, EndLine: line, AnnotationLevel: level, Title: "compiler " + m[3], Message: msg})
		if len(out) == maxAnnotations {
			break
		}
	}
	slices.SortStableFunc(out, func(a, b annotation) int {
		if a.AnnotationLevel != b.AnnotationLevel { // errors first
			if a.AnnotationLevel == "failure" {
				return -1
			}
			return 1
		}
		return 0
	})
	return out
}
