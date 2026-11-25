package runs

import (
	"fmt"
	"slices"
	"sort"
	"strings"
	"unicode/utf8"

	"cppatlas.com/runner/internal/protocol"
)

// validate checks s against the registry and returns the normalised stage
// list and options. Errors are *protocol.ValidationError.
func (m *Manager) validate(s protocol.Submission) (protocol.ChallengeSpec, []int, protocol.Options, error) {
	verr := func(field, format string, a ...any) error {
		return &protocol.ValidationError{Field: field, Message: fmt.Sprintf(format, a...)}
	}
	spec, ok := m.challenges[s.Challenge]
	if !ok {
		return spec, nil, protocol.Options{}, verr("challenge", "unknown challenge")
	}
	if s.Source != protocol.SourceWeb && s.Source != protocol.SourceGitHub {
		return spec, nil, protocol.Options{}, verr("source", "unknown source")
	}

	// Stages: ascending (hence unique), within 1..spec.Stages; empty = all.
	var stages []int
	if len(s.Stages) == 0 {
		stages = protocol.StagesUpTo(spec.Stages)
	} else {
		if len(s.Stages) > spec.Stages {
			return spec, nil, protocol.Options{}, verr("stage", "too many stages")
		}
		for i, st := range s.Stages {
			if st < 1 || st > spec.Stages {
				return spec, nil, protocol.Options{}, verr("stage", "stage %d out of range 1..%d", st, spec.Stages)
			}
			if i > 0 && st <= s.Stages[i-1] {
				return spec, nil, protocol.Options{}, verr("stage", "stages must be ascending and unique")
			}
		}
		stages = slices.Clone(s.Stages)
	}

	// Files.
	if len(s.Files) == 0 {
		return spec, nil, protocol.Options{}, verr("files", "no files")
	}
	paths := make([]string, 0, len(s.Files))
	for p := range s.Files {
		paths = append(paths, p)
	}
	sort.Strings(paths)
	total := 0
	for _, p := range paths {
		if !slices.Contains(spec.AllowedFiles, p) {
			return spec, nil, protocol.Options{}, verr("files", "file %q is not allowed (allowed: %s)",
				truncate(p, 128), strings.Join(spec.AllowedFiles, ", "))
		}
		c := s.Files[p]
		if len(c) > spec.MaxFileBytes {
			return spec, nil, protocol.Options{}, &protocol.ValidationError{Field: "files", TooLarge: true,
				Message: fmt.Sprintf("file %q is larger than %d bytes", p, spec.MaxFileBytes)}
		}
		total += len(c)
	}
	if total > spec.MaxTotalBytes {
		return spec, nil, protocol.Options{}, &protocol.ValidationError{Field: "files", TooLarge: true,
			Message: fmt.Sprintf("files are larger than %d bytes in total", spec.MaxTotalBytes)}
	}
	for _, p := range spec.RequiredFiles {
		if _, ok := s.Files[p]; !ok {
			return spec, nil, protocol.Options{}, verr("files", "required file %q is missing", p)
		}
	}
	for _, p := range paths {
		c := s.Files[p]
		if !utf8.ValidString(c) {
			return spec, nil, protocol.Options{}, verr("files", "file %q is not valid UTF-8", p)
		}
		if strings.IndexByte(c, 0) >= 0 {
			return spec, nil, protocol.Options{}, verr("files", "file %q contains a NUL byte", p)
		}
	}

	// Options.
	opt := s.Options
	if opt.Compiler == "" {
		opt.Compiler = m.cfg.DefaultCompiler
	}
	if opt.Preset == "" {
		opt.Preset = m.cfg.DefaultPreset
	}
	if !slices.Contains(m.cfg.AllowedCompilers, opt.Compiler) {
		return spec, nil, protocol.Options{}, verr("options", "unknown compiler (allowed: %s)", strings.Join(m.cfg.AllowedCompilers, ", "))
	}
	if !slices.Contains(m.cfg.AllowedPresets, opt.Preset) {
		return spec, nil, protocol.Options{}, verr("options", "unknown preset (allowed: %s)", strings.Join(m.cfg.AllowedPresets, ", "))
	}
	return spec, stages, opt, nil
}

// truncate cuts s to at most n bytes on a rune boundary and makes it valid UTF-8.
func truncate(s string, n int) string {
	s = strings.ToValidUTF8(s, "�")
	if len(s) <= n {
		return s
	}
	cut := n
	for cut > 0 && !utf8.RuneStart(s[cut]) {
		cut--
	}
	return s[:cut]
}
