package grader

import (
	"os"
	"strings"
	"testing"

	"cppatlas.com/runner/internal/protocol"
)

func parseFile(t *testing.T, name string) *Report {
	t.Helper()
	f, err := os.Open("testdata/" + name)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	return ParseDoctestXML(f, NewPathStripper("/work/vector", "/opt/cppatlas/challenges/vector/src"))
}

func parseString(s string) *Report {
	return ParseDoctestXML(strings.NewReader(s), NewPathStripper("/work/vector", "/x"))
}

func TestDoctestFixtures(t *testing.T) {
	rep := parseFile(t, "starter-s1.xml")
	if !rep.Complete || rep.AllPassed() || len(rep.Tests) == 0 {
		t.Fatalf("starter: complete=%v passed=%v tests=%d", rep.Complete, rep.AllPassed(), len(rep.Tests))
	}
	first := rep.Tests[0]
	if first.Status != protocol.StageFailed || len(first.Messages) == 0 ||
		!strings.Contains(first.Messages[0], "CHECK( v.size() == 0 ) is NOT correct!") ||
		!strings.Contains(first.Messages[0], "values: CHECK( 18446744073709551615 == 0 )") {
		t.Fatalf("first = %+v", first)
	}
	c := rep.Counts()
	if c.Failed == 0 || c.Total != len(rep.Tests) {
		t.Fatalf("counts = %+v", c)
	}
	text := RenderReport(rep)
	if !strings.Contains(text, "TEST CASE:  a default-constructed vector has size() == 0") || strings.Contains(text, "/work/") {
		t.Fatalf("render:\n%s", text)
	}

	sol := parseFile(t, "sol-s2.xml")
	if !sol.AllPassed() {
		t.Fatalf("solution stage 2 not all passed: %+v", sol.Counts())
	}
	for _, tc := range sol.Tests {
		if tc.Status != protocol.StagePassed || len(tc.Messages) != 0 {
			t.Fatalf("%+v", tc)
		}
	}
}

const okDoc = `<?xml version="1.0" encoding="UTF-8"?>
<doctest binary="stage_01">
  <Options order_by="file" rand_seed="0" first="0" last="4294967295" abort_after="0" subcase_filter_levels="2147483647" case_sensitive="false" no_throw="false" no_skip="false"/>
  <TestSuite>
    <TestCase name="t1" filename="stage_01.cpp" line="10">
      <OverallResultsAsserts successes="1" failures="0" test_case_success="true"/>
    </TestCase>
  </TestSuite>
  <OverallResultsAsserts successes="1" failures="0"/>
  <OverallResultsTestCases successes="1" failures="0" skipped="0"/>
</doctest>
`

func TestDoctestHostile(t *testing.T) {
	if r := parseString(okDoc); !r.AllPassed() {
		t.Fatalf("ok doc: %+v", r)
	}
	cases := map[string]string{
		"empty":     "",
		"not xml":   "all tests passed!\n",
		"truncated": okDoc[:strings.Index(okDoc, "<OverallResultsAsserts successes=\"1\" failures=\"0\"/>\n  <Overall")],
		"no tests": `<doctest><TestSuite></TestSuite><OverallResultsAsserts successes="0" failures="0"/>
			<OverallResultsTestCases successes="0" failures="0" skipped="0"/></doctest>`,
		// The summary claims success but a test case failed.
		"inconsistent": strings.Replace(okDoc, `failures="0" test_case_success="true"`, `failures="1" test_case_success="false"`, 1),
		// Summary disagrees with the test count.
		"summary lies": strings.Replace(okDoc, `<OverallResultsTestCases successes="1"`, `<OverallResultsTestCases successes="7"`, 1),
		"bad charset":  strings.Replace(okDoc, `encoding="UTF-8"`, `encoding="ISO-8859-1"`, 1),
		"unclosed test": `<doctest><TestSuite><TestCase name="hangs" filename="a.cpp" line="1">` +
			`<Expression success="true" type="CHECK" filename="a.cpp" line="2"><Original>x</Original></Expression>`,
	}
	for name, doc := range cases {
		r := parseString(doc)
		if r.AllPassed() {
			t.Errorf("%s: AllPassed() = true", name)
		}
	}
	if r := parseString(cases["unclosed test"]); len(r.Tests) != 1 || r.Tests[0].Status != protocol.StageFailed {
		t.Errorf("unclosed test case not reported failed: %+v", r.Tests)
	}

	// Deep nesting, entity tricks and huge names are bounded.
	deep := "<doctest>" + strings.Repeat("<a>", 100000) + strings.Repeat("</a>", 100000) + "</doctest>"
	if r := parseString(deep); r.AllPassed() {
		t.Error("deep doc passed")
	}
	ent := `<?xml version="1.0"?><!DOCTYPE d [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;">]>` + okDoc[strings.Index(okDoc, "<doctest"):]
	ent = strings.Replace(ent, `name="t1"`, `name="&b;"`, 1)
	r := parseString(ent)
	for _, tc := range r.Tests {
		if strings.Contains(tc.Name, "aaaaaaaaaaaaaaaaaaaa") {
			t.Error("custom entity expanded")
		}
	}
	long := strings.Replace(okDoc, `name="t1"`, `name="`+strings.Repeat("N", 100000)+"\u202e&#x9b;"+`"`, 1)
	r = parseString(long)
	if len(r.Tests) != 1 || len(r.Tests[0].Name) > 400 || strings.ContainsAny(r.Tests[0].Name, "\u202e\u009b") {
		t.Errorf("long/escaped name not bounded: %d", len(r.Tests[0].Name))
	}

	// Many test cases and messages are capped.
	var b strings.Builder
	b.WriteString("<doctest><TestSuite>")
	for i := 0; i < 2000; i++ {
		b.WriteString(`<TestCase name="t" filename="a.cpp" line="1">`)
		for j := 0; j < 50; j++ {
			b.WriteString(`<Expression success="false" type="CHECK" filename="/work/vector/tests/a.cpp" line="2"><Original>x == y</Original><Expanded>1 == 2</Expanded></Expression>`)
		}
		b.WriteString(`<OverallResultsAsserts successes="0" failures="50" test_case_success="false"/></TestCase>`)
	}
	b.WriteString("</TestSuite></doctest>")
	r = parseString(b.String())
	if len(r.Tests) > 500 || r.MoreTests == 0 {
		t.Errorf("tests=%d more=%d", len(r.Tests), r.MoreTests)
	}
	total := 0
	for _, tc := range r.Tests {
		if len(tc.Messages) > 13 {
			t.Fatalf("messages = %d", len(tc.Messages))
		}
		for _, m := range tc.Messages {
			total += len(m)
			if strings.Contains(m, "/work/") {
				t.Fatalf("path leak: %q", m)
			}
		}
	}
	if total > 300<<10 {
		t.Errorf("message bytes = %d", total)
	}
}
