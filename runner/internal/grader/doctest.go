package grader

import (
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"strings"

	"cppatlas.com/runner/internal/protocol"
)

// Report is what we extract from doctest's XML reporter (--reporters=xml
// --out=<file>). The file is written by the test process, i.e. by code that
// runs in the same process as the learner's: it is untrusted input. The parser
// reads a bounded prefix, never recurses, caps every string and every list,
// and degrades to "incomplete" on anything malformed.
type Report struct {
	Tests    []protocol.TestCase
	Complete bool // the closing </doctest> (run summary) was seen
	// From <OverallResultsTestCases>; only meaningful when Complete.
	SummaryPassed, SummaryFailed int
	ParseError                   string
	MoreTests                    int // test cases beyond the cap
}

// Report parsing caps.
const (
	MaxReportBytes      = 8 << 20
	maxReportTests      = 500
	maxMessagesPerTest  = 12
	maxMessageBytes     = 2000
	maxTestNameBytes    = 300
	maxReportTotalBytes = 256 << 10 // all messages of a stage together
)

// Counts derives protocol counts from the parsed test cases.
func (r *Report) Counts() *protocol.TestCounts {
	c := &protocol.TestCounts{}
	for _, t := range r.Tests {
		c.Total++
		if t.Status == protocol.StagePassed {
			c.Passed++
		} else {
			c.Failed++
		}
	}
	c.Total += r.MoreTests
	return c
}

// AllPassed: at least one test case ran, none failed, the report is complete
// and agrees with its own summary.
func (r *Report) AllPassed() bool {
	if !r.Complete || len(r.Tests) == 0 || r.MoreTests > 0 {
		return false
	}
	for _, t := range r.Tests {
		if t.Status != protocol.StagePassed {
			return false
		}
	}
	return r.SummaryFailed == 0 && r.SummaryPassed == len(r.Tests)
}

type xmlFailure struct {
	kind     string // "Expression", "Message", "Exception"
	attrs    map[string]string
	original string
	expanded string
	exc      string
	text     string
	infos    []string
}

// ParseDoctestXML parses a doctest XML report from r (at most MaxReportBytes).
func ParseDoctestXML(r io.Reader, ps *PathStripper) *Report {
	rep := &Report{}
	dec := xml.NewDecoder(io.LimitReader(r, MaxReportBytes))
	dec.Strict = true
	dec.CharsetReader = func(label string, in io.Reader) (io.Reader, error) {
		if strings.EqualFold(label, "utf-8") || strings.EqualFold(label, "us-ascii") {
			return in, nil
		}
		return nil, fmt.Errorf("unsupported charset %q", label)
	}

	clean := func(s string, n int) string {
		s = Sanitize([]byte(s))
		if ps != nil {
			s = ps.Strip(s)
		}
		return capLine(s, n)
	}

	var (
		stack      []string
		inTest     bool
		cur        protocol.TestCase
		curDone    bool // OverallResultsAsserts seen for cur
		curSuccess bool
		curMore    int
		fail       *xmlFailure
		text       strings.Builder
		totalBytes int
	)
	addMessage := func(m string) {
		if len(cur.Messages) >= maxMessagesPerTest || totalBytes >= maxReportTotalBytes {
			curMore++
			return
		}
		m = clean(m, maxMessageBytes)
		totalBytes += len(m)
		cur.Messages = append(cur.Messages, m)
	}
	finishTest := func() {
		if !inTest {
			return
		}
		inTest = false
		if !curDone {
			// The test case never finished (crash, _exit, truncated report).
			cur.Status = protocol.StageFailed
		} else if curSuccess {
			cur.Status = protocol.StagePassed
		} else {
			cur.Status = protocol.StageFailed
		}
		if curMore > 0 {
			cur.Messages = append(cur.Messages, fmt.Sprintf("... and %d more failure message(s)", curMore))
		}
		if len(rep.Tests) < maxReportTests {
			rep.Tests = append(rep.Tests, cur)
		} else {
			rep.MoreTests++
		}
	}

	for {
		tok, err := dec.Token()
		if err != nil {
			if !errors.Is(err, io.EOF) {
				rep.ParseError = capLine(err.Error(), 200)
			}
			break
		}
		switch t := tok.(type) {
		case xml.StartElement:
			if len(stack) > 32 { // doctest nests at most ~5 deep
				rep.ParseError = "report nested too deeply"
				finishTest()
				return rep
			}
			name := t.Name.Local
			stack = append(stack, name)
			text.Reset()
			attrs := map[string]string{}
			for _, a := range t.Attr {
				if len(attrs) < 16 {
					attrs[a.Name.Local] = a.Value
				}
			}
			switch name {
			case "TestCase":
				finishTest()
				if attrs["skipped"] == "true" {
					continue
				}
				inTest = true
				cur = protocol.TestCase{Name: clean(attrs["name"], maxTestNameBytes)}
				curDone, curSuccess, curMore = false, false, 0
			case "Expression", "Message":
				if inTest && fail == nil {
					fail = &xmlFailure{kind: name, attrs: attrs}
				}
			case "Exception":
				if inTest && fail == nil {
					fail = &xmlFailure{kind: name, attrs: attrs}
				}
			case "OverallResultsAsserts":
				if inTest && len(stack) >= 2 && stack[len(stack)-2] == "TestCase" {
					curDone = true
					curSuccess = attrs["test_case_success"] == "true" && attrs["failures"] == "0"
				}
			case "OverallResultsTestCases":
				if len(stack) == 2 && stack[0] == "doctest" {
					fmt.Sscanf(attrs["successes"], "%d", &rep.SummaryPassed)
					fmt.Sscanf(attrs["failures"], "%d", &rep.SummaryFailed)
				}
			}
		case xml.CharData:
			if text.Len() < maxMessageBytes*2 {
				text.Write(t)
			}
		case xml.EndElement:
			if len(stack) == 0 {
				continue
			}
			name := stack[len(stack)-1]
			stack = stack[:len(stack)-1]
			body := strings.TrimSpace(text.String())
			text.Reset()
			if fail != nil {
				switch name {
				case "Original":
					fail.original = body
				case "Expanded":
					fail.expanded = body
				case "Text":
					fail.text = body
				case "Info":
					if len(fail.infos) < 8 {
						fail.infos = append(fail.infos, body)
					}
				case "Exception":
					if fail.kind == "Exception" {
						fail.text = body
					} else {
						fail.exc = body
					}
				}
			}
			switch name {
			case "Expression", "Message", "Exception":
				if fail != nil && fail.kind == name {
					if m := formatFailure(fail); m != "" {
						addMessage(m)
					}
					fail = nil
				}
			case "TestCase":
				finishTest()
			case "doctest":
				rep.Complete = len(stack) == 0
			}
		}
	}
	finishTest()
	return rep
}

func formatFailure(f *xmlFailure) string {
	loc := f.attrs["filename"]
	if l := f.attrs["line"]; l != "" && l != "0" {
		loc += ":" + l
	}
	var b strings.Builder
	switch f.kind {
	case "Expression":
		if f.attrs["success"] == "true" {
			return ""
		}
		typ := f.attrs["type"]
		fmt.Fprintf(&b, "%s: ERROR: %s( %s ) ", loc, typ, f.original)
		if f.exc != "" {
			fmt.Fprintf(&b, "THREW exception: %s", f.exc)
		} else {
			b.WriteString("is NOT correct!")
			if f.expanded != "" {
				fmt.Fprintf(&b, "\n  values: %s( %s )", typ, f.expanded)
			}
		}
	case "Message":
		typ := f.attrs["type"]
		if strings.Contains(strings.ToUpper(typ), "WARNING") {
			return ""
		}
		if typ == "" {
			typ = "ERROR"
		}
		fmt.Fprintf(&b, "%s: %s: %s", loc, typ, f.text)
	case "Exception":
		if f.attrs["crash"] == "true" {
			fmt.Fprintf(&b, "TEST CASE CRASHED: %s", f.text)
		} else {
			fmt.Fprintf(&b, "TEST CASE FAILED: threw exception: %s", f.text)
		}
	}
	for _, in := range f.infos {
		fmt.Fprintf(&b, "\n  logged: %s", in)
	}
	return b.String()
}

// RenderReport renders failed test cases like doctest's console reporter, for
// StageResult.Output.
func RenderReport(rep *Report) string {
	var b strings.Builder
	for _, t := range rep.Tests {
		if t.Status == protocol.StagePassed {
			continue
		}
		b.WriteString("===============================================================================\n")
		fmt.Fprintf(&b, "TEST CASE:  %s\n\n", t.Name)
		if len(t.Messages) == 0 {
			b.WriteString("(the test case did not finish)\n\n")
		}
		for _, m := range t.Messages {
			b.WriteString(m)
			b.WriteString("\n\n")
		}
	}
	if b.Len() > 0 {
		c := rep.Counts()
		b.WriteString("===============================================================================\n")
		fmt.Fprintf(&b, "test cases: %d | %d passed | %d failed\n", c.Total, c.Passed, c.Failed)
	}
	return b.String()
}
