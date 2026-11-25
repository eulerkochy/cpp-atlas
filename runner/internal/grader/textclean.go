package grader

import (
	"bytes"
	"fmt"
	"strings"
	"unicode/utf8"
)

// Sanitize turns arbitrary bytes produced inside the sandbox (compiler
// diagnostics, test output, learner prints) into text that is safe to put in a
// JSON document and to render in a terminal or browser:
//
//   - invalid UTF-8 becomes U+FFFD;
//   - ANSI/VT escape sequences (CSI, OSC, DCS/APC/PM/SOS strings, two-byte
//     escapes) are removed;
//   - CR LF becomes LF, a lone CR becomes LF;
//   - C0 controls other than LF and TAB, DEL, C1 controls and the Unicode
//     bidirectional override/isolate characters (U+202A-U+202E,
//     U+2066-U+2069, "Trojan Source") are removed.
func Sanitize(b []byte) string {
	var out strings.Builder
	out.Grow(len(b))
	for i := 0; i < len(b); {
		c := b[i]
		switch {
		case c == 0x1b: // ESC
			i = skipEscape(b, i)
			continue
		case c == '\r':
			if i+1 < len(b) && b[i+1] == '\n' {
				i++
				continue // CR LF -> LF (the LF is written next round)
			}
			out.WriteByte('\n')
			i++
			continue
		case c == '\n' || c == '\t':
			out.WriteByte(c)
			i++
			continue
		case c < 0x20 || c == 0x7f:
			i++
			continue
		case c < utf8.RuneSelf:
			out.WriteByte(c)
			i++
			continue
		}
		r, size := utf8.DecodeRune(b[i:])
		i += size
		if r == utf8.RuneError && size == 1 {
			out.WriteRune(utf8.RuneError)
			continue
		}
		if r == 0x9b { // C1 CSI: treat like ESC [
			i = skipCSIBody(b, i)
			continue
		}
		if (r >= 0x80 && r <= 0x9f) || (r >= 0x202a && r <= 0x202e) || (r >= 0x2066 && r <= 0x2069) {
			continue
		}
		out.WriteRune(r)
	}
	return out.String()
}

// skipEscape returns the index after the escape sequence that starts at b[i] (ESC).
func skipEscape(b []byte, i int) int {
	i++ // ESC
	if i >= len(b) {
		return i
	}
	switch b[i] {
	case '[': // CSI: parameters/intermediates then a final byte 0x40-0x7e
		return skipCSIBody(b, i+1)
	case ']', 'P', '_', '^', 'X': // OSC, DCS, APC, PM, SOS: until BEL or ST (ESC \)
		i++
		for i < len(b) {
			if b[i] == 0x07 {
				return i + 1
			}
			if b[i] == 0x1b && i+1 < len(b) && b[i+1] == '\\' {
				return i + 2
			}
			if b[i] == '\n' { // unterminated: do not swallow the rest of the output
				return i
			}
			i++
		}
		return i
	default:
		// Two-byte escape (ESC c, ESC 7, ...) or ESC + intermediate + final.
		for i < len(b) && b[i] >= 0x20 && b[i] <= 0x2f {
			i++
		}
		if i < len(b) && b[i] >= 0x30 && b[i] <= 0x7e {
			i++
		}
		return i
	}
}

func skipCSIBody(b []byte, i int) int {
	for i < len(b) {
		c := b[i]
		i++
		if c >= 0x40 && c <= 0x7e {
			return i
		}
		if c < 0x20 || c > 0x7e { // malformed: stop here
			return i - 1
		}
	}
	return i
}

// TruncationMarker is appended to capped text.
func TruncationMarker(limit int) string {
	return fmt.Sprintf("[output truncated at %s]", humanBytes(limit))
}

func humanBytes(n int) string {
	switch {
	case n >= 1<<20 && n%(1<<20) == 0:
		return fmt.Sprintf("%d MB", n>>20)
	case n >= 1<<10 && n%(1<<10) == 0:
		return fmt.Sprintf("%d KB", n>>10)
	case n >= 1<<10:
		return fmt.Sprintf("%.1f KB", float64(n)/1024)
	default:
		return fmt.Sprintf("%d bytes", n)
	}
}

// CapText limits s to at most limit bytes of content. When it has to cut, it
// cuts at the last line break in the second half of the budget (or else at a
// rune boundary) and appends "\n[output truncated at N KB]". The marker is
// not counted against limit. truncated reports whether anything was cut.
// forceMarker appends the marker even when s fits (used when the capture
// itself already dropped bytes).
func CapText(s string, limit int, forceMarker bool) (out string, truncated bool) {
	if limit <= 0 {
		limit = 1
	}
	if len(s) <= limit {
		if forceMarker {
			return strings.TrimRight(s, "\n") + "\n" + TruncationMarker(limit), true
		}
		return s, false
	}
	cut := limit
	for cut > 0 && !utf8.RuneStart(s[cut]) {
		cut--
	}
	if nl := strings.LastIndexByte(s[:cut], '\n'); nl >= limit/2 {
		cut = nl + 1
	}
	return strings.TrimRight(s[:cut], "\n") + "\n" + TruncationMarker(limit), true
}

// CleanCapped sanitises raw captured bytes, strips internal paths and caps the
// result. captureTruncated says the capture already dropped bytes.
func CleanCapped(raw []byte, ps *PathStripper, limit int, captureTruncated bool) (string, bool) {
	s := Sanitize(raw)
	if ps != nil {
		s = ps.Strip(s)
	}
	return CapText(s, limit, captureTruncated)
}

// capLine shortens a single line for summaries (FirstError, hints).
func capLine(s string, n int) string {
	return capTrimmed(strings.TrimSpace(s), n)
}

// capOutputLine is capLine for lines of displayed compiler output: it keeps
// the leading whitespace, so source snippets and caret lines stay aligned.
func capOutputLine(s string, n int) string {
	return capTrimmed(strings.TrimRight(s, " \t\r\n"), n)
}

func capTrimmed(s string, n int) string {
	if len(s) <= n {
		return s
	}
	cut := n
	for cut > 0 && !utf8.RuneStart(s[cut]) {
		cut--
	}
	return s[:cut] + "..."
}

// splitLines splits on '\n' without producing a trailing empty element.
func splitLines(s string) []string {
	s = strings.TrimSuffix(s, "\n")
	if s == "" {
		return nil
	}
	return strings.Split(s, "\n")
}

// LineCapture is an io.Writer that keeps at most Limit bytes of the stream it
// is fed, counts everything, and passes complete lines (up to MaxLine bytes)
// to Filter first; a line for which Filter returns true is not kept. Bytes
// beyond the limit are counted and discarded, so a producer is never blocked
// and memory stays bounded.
type LineCapture struct {
	Limit   int
	MaxLine int
	Filter  func(line []byte) (drop bool)

	kept    bytes.Buffer
	partial []byte
	long    bool // the current line exceeded MaxLine and is being passed through
	Total   int64
	Dropped int64 // bytes not kept because of Limit
}

func (c *LineCapture) Write(p []byte) (int, error) {
	n := len(p)
	c.Total += int64(n)
	if c.MaxLine <= 0 {
		c.MaxLine = 4096
	}
	for len(p) > 0 {
		nl := bytes.IndexByte(p, '\n')
		var chunk []byte
		complete := nl >= 0
		if complete {
			chunk = p[:nl+1]
			p = p[nl+1:]
		} else {
			chunk = p
			p = nil
		}
		if c.long {
			c.keep(chunk)
			if complete {
				c.long = false
			}
			continue
		}
		if len(c.partial)+len(chunk) > c.MaxLine {
			// Too long to be a line we care about: flush as plain output.
			c.keep(c.partial)
			c.partial = c.partial[:0]
			c.keep(chunk)
			c.long = !complete
			continue
		}
		c.partial = append(c.partial, chunk...)
		if complete {
			c.flushLine()
		}
	}
	return n, nil
}

func (c *LineCapture) flushLine() {
	line := c.partial
	if c.Filter == nil || !c.Filter(bytes.TrimRight(line, "\r\n")) {
		c.keep(line)
	}
	c.partial = c.partial[:0]
}

func (c *LineCapture) keep(b []byte) {
	if len(b) == 0 {
		return
	}
	room := c.Limit - c.kept.Len()
	if room <= 0 {
		c.Dropped += int64(len(b))
		return
	}
	if len(b) > room {
		c.Dropped += int64(len(b) - room)
		b = b[:room]
	}
	c.kept.Write(b)
}

// Close flushes a trailing partial line.
func (c *LineCapture) Close() {
	if len(c.partial) > 0 {
		c.flushLine()
	}
}

// Bytes returns the kept bytes.
func (c *LineCapture) Bytes() []byte { return c.kept.Bytes() }

// Truncated reports whether bytes were dropped because of Limit.
func (c *LineCapture) Truncated() bool { return c.Dropped > 0 }
