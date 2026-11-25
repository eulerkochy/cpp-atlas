package github

import (
	"regexp"
	"strings"
	"testing"

	"cppatlas.com/runner/internal/protocol"
)

var fenceLineRE = regexp.MustCompile("^ {0,3}(`{3,})(.*)$")

// outsideCode returns the Markdown text that is outside fenced code blocks and
// code spans, and whether every fence was closed. It follows CommonMark's
// rules for backtick fences and spans (sufficient for what we emit).
func outsideCode(md string) (string, bool) {
	var out strings.Builder
	open := ""
	for _, ln := range strings.Split(md, "\n") {
		if open != "" {
			if m := fenceLineRE.FindStringSubmatch(ln); m != nil && len(m[1]) >= len(open) && strings.TrimSpace(m[2]) == "" {
				open = ""
			}
			continue
		}
		if m := fenceLineRE.FindStringSubmatch(ln); m != nil && !strings.Contains(m[2], "`") {
			open = m[1]
			continue
		}
		out.WriteString(stripSpans(ln) + "\n")
	}
	return out.String(), open == ""
}

func stripSpans(s string) string {
	var b strings.Builder
	for i := 0; i < len(s); {
		if s[i] != '`' {
			b.WriteByte(s[i])
			i++
			continue
		}
		j := i
		for j < len(s) && s[j] == '`' {
			j++
		}
		run := s[i:j]
		// find a closing run of exactly the same length
		k := j
		closed := -1
		for k < len(s) {
			if s[k] == '`' {
				e := k
				for e < len(s) && s[e] == '`' {
					e++
				}
				if e-k == len(run) {
					closed = e
					break
				}
				k = e
				continue
			}
			k++
		}
		if closed < 0 {
			b.WriteString(run)
			i = j
			continue
		}
		i = closed
	}
	return b.String()
}

const hostile = "evil ``` fence\n````\n@octocat escaped?\n```\n```` longer\n</code></pre><img src=x onerror=alert(1)> @octocat please review\n" +
	"\x1b[31mred\x1b[0m [link](javascript:alert(1)) ~~~\n‮esrever‬ `tick` ``double`` " + "\x00nul"

func TestMarkdownNeutralisesHostileContent(t *testing.T) {
	// the checker itself catches naive fencing
	if rest, _ := outsideCode("```text\n" + hostile + "\n```\n"); !strings.Contains(rest, "@octocat") {
		t.Fatal("checker does not detect an escaped fence")
	}
	g := gradeInfo{challenge: "vector", total: 8, stages: protocol.StagesUpTo(8), site: "https://cppatlas.com", sha: testSHA}
	sr := []protocol.StageResult{
		{Status: protocol.StageFailed, Counts: &protocol.TestCounts{Total: 1, Failed: 1}, Tests: []protocol.TestCase{{Name: hostile, Status: protocol.StageFailed, Messages: []string{hostile, hostile}}}},
		{Status: protocol.StageCompileError, Compile: &protocol.CompileSummary{FirstError: hostile, Preflight: []string{hostile}, Output: hostile}},
		{Status: protocol.StageCrashed, Signal: hostile, RunningTest: hostile, Hint: hostile, Output: hostile},
	}
	for _, s := range sr {
		v := failAt(2, s)(protocol.Submission{Challenge: "vector", Stages: g.stages})
		v.Result.Compiler = hostile
		v.Result.Preset = "<b>@x</b>"
		_, _, out := renderView(g, v, vectorSpec.AllowedFiles)
		for name, md := range map[string]string{"summary": out.Summary, "text": out.Text} {
			rest, closed := outsideCode(md)
			if !closed {
				t.Fatalf("%s %s: unclosed fence:\n%s", s.Status, name, md)
			}
			for _, bad := range []string{"@octocat", "<", "@x", "javascript:", "\x1b", "\x00", "‮"} {
				if strings.Contains(rest, bad) {
					t.Errorf("%s %s: %q outside code:\n%s", s.Status, name, bad, rest)
				}
			}
			if strings.ContainsAny(md, "\x1b\x00‮") {
				t.Errorf("%s %s: control or bidi characters survived", s.Status, name)
			}
		}
		if strings.Contains(out.Title, "<") || strings.Contains(out.Title, "@") {
			t.Errorf("title %q", out.Title)
		}
	}
}

func TestInlineCodeAndFence(t *testing.T) {
	cases := map[string]string{
		"plain":          "`plain`",
		"a`b":            "``a`b``",
		"`lead":          "`` `lead ``",
		"x ``` y":        "````x ``` y````",
		"multi\nline\tx": "`multi line x`",
		"":               "` `",
	}
	for in, want := range cases {
		if got := inlineCode(in); got != want {
			t.Errorf("inlineCode(%q) = %q, want %q", in, got, want)
		}
	}
	got := fenced("a\n`````\nb")
	if !strings.HasPrefix(got, "``````text\n") || !strings.HasSuffix(got, "\n``````\n") {
		t.Fatalf("fenced = %q", got)
	}
}

func TestTruncationAtGitHubLimits(t *testing.T) {
	g := gradeInfo{challenge: "vector", total: 8, stages: protocol.StagesUpTo(8), site: "https://cppatlas.com", sha: testSHA}
	huge := strings.Repeat("include/my/vector.hpp:1:1: error: é ``` ü\n", 10000) // multibyte + backticks
	var tests []protocol.TestCase
	for i := 0; i < 40; i++ {
		tests = append(tests, protocol.TestCase{Name: "case", Status: protocol.StageFailed, Messages: []string{huge[:9000]}})
	}
	for _, s := range []protocol.StageResult{
		{Status: protocol.StageCompileError, Compile: &protocol.CompileSummary{FirstError: huge, Output: huge, Preflight: []string{huge}}},
		{Status: protocol.StageFailed, Tests: tests},
		{Status: protocol.StageCrashed, Output: huge},
	} {
		v := failAt(3, s)(protocol.Submission{Challenge: "vector", Stages: g.stages})
		_, _, out := renderView(g, v, vectorSpec.AllowedFiles)
		if len(out.Text) > maxText || len([]rune(out.Text)) > maxText {
			t.Fatalf("%s: text is %d bytes", s.Status, len(out.Text))
		}
		if !strings.HasSuffix(out.Text, truncNote) {
			t.Fatalf("%s: no truncation note", s.Status)
		}
		if _, closed := outsideCode(out.Text); !closed {
			t.Fatalf("%s: fence left open after truncation", s.Status)
		}
		if !strings.Contains(out.Text, "(truncated)") && s.Status != protocol.StageFailed {
			t.Fatalf("%s: block not marked truncated", s.Status)
		}
		if len(out.Annotations) > maxAnnotations {
			t.Fatalf("%d annotations", len(out.Annotations))
		}
		if !strings.Contains(out.Text, "## Stage 3") {
			t.Fatal("heading lost")
		}
	}
	// Summary: a challenge with thousands of stages overflows the table.
	many := gradeInfo{challenge: "big", total: 5000, stages: protocol.StagesUpTo(5000), site: "https://cppatlas.com", sha: testSHA}
	v := passView(protocol.Submission{Challenge: "big", Stages: many.stages})
	_, _, out := renderView(many, v, nil)
	if len(out.Summary) > maxSummary || !strings.HasSuffix(out.Summary, truncNote) {
		t.Fatalf("summary %d bytes", len(out.Summary))
	}
	if out.Title != "All 5000 stages passed" {
		t.Fatalf("title %q", out.Title)
	}
	if !strings.Contains(out.Summary, "| 7 | [stage 7](https://cppatlas.com/build/big) |") {
		t.Fatal("generic stage fallback missing")
	}
}

func TestAnnotationsOnlyForLearnerFile(t *testing.T) {
	var b strings.Builder
	b.WriteString("tests/stage_01.cpp:3:1: error: not yours\n")
	b.WriteString("/work/include/my/vector.hpp:7:2: error: yours\n")
	b.WriteString("include/my/vector.hpp:7:2: error: yours\n") // duplicate
	b.WriteString("In file included from include/my/vector.hpp:3,\n")
	b.WriteString("include/my/vector.hpp:9: note: ignored\n")
	for i := 0; i < 100; i++ {
		b.WriteString("include/my/vector.hpp:" + strings.Repeat("1", 1+i%3) + ":1: error: e" + strings.Repeat("x", i) + "\n")
	}
	anns := compileAnnotations(&protocol.CompileSummary{Output: b.String()}, vectorSpec.AllowedFiles)
	if len(anns) != maxAnnotations {
		t.Fatalf("len %d", len(anns))
	}
	if anns[0].Path != "include/my/vector.hpp" || anns[0].StartLine != 7 || anns[0].Message != "yours" {
		t.Fatalf("first %+v", anns[0])
	}
	for _, a := range anns {
		if a.Path != "include/my/vector.hpp" {
			t.Fatalf("annotation on %s", a.Path)
		}
	}
}

func TestStageMeta(t *testing.T) {
	if got := stageURL("https://cppatlas.com", "vector", 3); got != "https://cppatlas.com/build/vector/growth" {
		t.Fatal(got)
	}
	if got := stageURL("https://cppatlas.com/", "vector", 9); got != "https://cppatlas.com/build/vector" {
		t.Fatal(got)
	}
	if info, known := stageMeta("newthing", 2); known || info.Slug != "stage 2" {
		t.Fatal(info)
	}
}
