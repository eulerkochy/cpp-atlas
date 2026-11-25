package grader

import (
	"bytes"
	"strings"
	"testing"
	"unicode/utf8"
)

func TestSanitize(t *testing.T) {
	cases := []struct{ name, in, want string }{
		{"plain", "hello\nworld\n", "hello\nworld\n"},
		{"csi colour", "\x1b[1;31merror:\x1b[0m bad", "error: bad"},
		{"osc title", "a\x1b]0;evil title\x07b", "ab"},
		{"osc st", "a\x1b]8;;http://x\x1b\\link\x1b]8;;\x1b\\b", "alinkb"},
		{"lone cr becomes newline", "progress 10%\rprogress 100%\n", "progress 10%\nprogress 100%\n"},
		{"crlf", "a\r\nb\r\n", "a\nb\n"},
		{"controls", "a\x00b\x07c\x08d", "abcd"},
		{"tab kept", "a\tb", "a\tb"},
		{"invalid utf8", "a\xff\xfeb", "a��b"},
		{"c1 controls", "a\u0080b\u0085c", "abc"}, {"8-bit csi", "a\u009b31mb", "ab"},
		{"bidi override", "a‮b⁦c", "abc"},
		{"utf8 kept", "größe ✓", "größe ✓"},
	}
	for _, c := range cases {
		if got := Sanitize([]byte(c.in)); got != c.want {
			t.Errorf("%s: Sanitize(%q) = %q, want %q", c.name, c.in, got, c.want)
		}
	}
}

func TestSanitizeAlwaysValid(t *testing.T) {
	var in []byte
	for i := 0; i < 4096; i++ {
		in = append(in, byte(i*7+i/3))
	}
	out := Sanitize(in)
	if !utf8.ValidString(out) {
		t.Fatal("output is not valid UTF-8")
	}
	for _, r := range out {
		if (r < 0x20 && r != '\n' && r != '\t') || r == 0x7f || r == 0x1b {
			t.Fatalf("control character %U survived", r)
		}
	}
}

func TestCapText(t *testing.T) {
	s := strings.Repeat("line of text\n", 1000)
	out, tr := CapText(s, 1024, false)
	if !tr || len(out) > 1024+80 {
		t.Fatalf("not capped: %d bytes, truncated=%v", len(out), tr)
	}
	if !strings.HasSuffix(out, TruncationMarker(1024)+"\n") && !strings.HasSuffix(out, TruncationMarker(1024)) {
		t.Fatalf("missing marker: %q", out[len(out)-60:])
	}
	if short, tr := CapText("abc", 1024, false); short != "abc" || tr {
		t.Fatalf("short text changed: %q %v", short, tr)
	}
	if _, tr := CapText("abc", 1024, true); !tr {
		t.Fatal("forceMarker ignored")
	}
	// Never cut inside a rune.
	out, _ = CapText(strings.Repeat("é", 2000), 1001, false)
	if !utf8.ValidString(out) {
		t.Fatal("cut inside a rune")
	}
	if TruncationMarker(64<<10) != "[output truncated at 64 KB]" {
		t.Fatalf("marker = %q", TruncationMarker(64<<10))
	}
}

func TestLineCapture(t *testing.T) {
	var progress []string
	c := &LineCapture{Limit: 100, MaxLine: 64, Filter: func(l []byte) bool {
		if bytes.HasPrefix(l, []byte("[cppatlas] running: ")) {
			progress = append(progress, string(l))
			return true
		}
		return false
	}}
	// Split writes across line boundaries.
	c.Write([]byte("[cppatlas] run"))
	c.Write([]byte("ning: test one\nhello\n[cppatlas] running: two\n"))
	c.Write([]byte(strings.Repeat("x", 200) + "\n")) // a long line passes through, capped
	for i := 0; i < 1000; i++ {
		c.Write([]byte("spam spam spam\n"))
	}
	c.Close()
	if len(progress) != 2 || progress[1] != "[cppatlas] running: two" {
		t.Fatalf("progress = %q", progress)
	}
	if !bytes.HasPrefix(c.Bytes(), []byte("hello\nxxx")) {
		t.Fatalf("kept = %q", c.Bytes())
	}
	if len(c.Bytes()) != 100 || !c.Truncated() {
		t.Fatalf("kept %d bytes, truncated=%v", len(c.Bytes()), c.Truncated())
	}
	if c.Total != int64(len("[cppatlas] running: test one\nhello\n[cppatlas] running: two\n")+201+15000) {
		t.Fatalf("total = %d", c.Total)
	}
}

func TestCleanCapped(t *testing.T) {
	ps := NewPathStripper("/work/vector", "/opt/cppatlas/challenges/vector/src")
	raw := []byte("\x1b[31m/work/vector/include/my/vector.hpp:3: boom\x1b[0m\n")
	out, tr := CleanCapped(raw, ps, 1024, true)
	if !strings.HasPrefix(out, "include/my/vector.hpp:3: boom\n") || !tr || !strings.Contains(out, "truncated") {
		t.Fatalf("got %q %v", out, tr)
	}
}
