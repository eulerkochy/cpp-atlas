package runs

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"

	"cppatlas.com/runner/internal/protocol"
)

// Defensive caps applied to every Result before it is stored. The input is
// already bounded by the transport (docker stdout cap, result body cap); these
// shape it so one field cannot dominate and every string is valid UTF-8.
// The whole result is then shrunk to Config.MaxResultBytes (shrinkResult).
const (
	capShort       = 128
	capCode        = 64
	capMessage     = 1024
	capLine        = 4 << 10 // compile first error
	capTestMessage = 2 << 10 // one doctest failure message
	capTestName    = 512
	capTests       = 500 // test cases per stage
	capMessages    = 20  // messages per test case
	capPreflight   = 64
	capTraceEvents = 100_000
)

var stageStatuses = []string{
	protocol.StagePassed, protocol.StageFailed, protocol.StageCompileError,
	protocol.StageTimeout, protocol.StageCrashed, protocol.StageSkipped,
}

// sanitizeResult returns a clamped copy of res restricted to the requested
// stages and shrunk to at most maxBytes of JSON (when maxBytes > 0), plus its
// encoded size, or an error if it cannot be attributed to this run or cannot
// be made small enough.
func sanitizeResult(res *protocol.Result, runID, challenge string, stages []int, lim protocol.Limits, maxBytes int) (*protocol.Result, int, error) {
	out, err := clampResult(res, runID, challenge, stages, lim)
	if err != nil {
		return nil, 0, err
	}
	size, err := shrinkResult(out, maxBytes)
	if err != nil {
		return nil, 0, err
	}
	return out, size, nil
}

func clampResult(res *protocol.Result, runID, challenge string, stages []int, lim protocol.Limits) (*protocol.Result, error) {
	if res == nil {
		return nil, fmt.Errorf("nil result")
	}
	if res.RunID != runID {
		return nil, fmt.Errorf("result run id mismatch")
	}
	out := &protocol.Result{
		RunID:         runID,
		Status:        res.Status,
		Challenge:     challenge,
		GraderVersion: truncate(res.GraderVersion, capShort),
		Compiler:      truncate(res.Compiler, capShort),
		Preset:        truncate(res.Preset, capShort),
		Timings:       clampTimings(res.Timings),
		Error:         clampRunError(res.Error),
	}
	if out.Status != protocol.ResultCompleted && out.Status != protocol.ResultError {
		return nil, fmt.Errorf("unknown result status %q", truncate(res.Status, 32))
	}
	if out.Status == protocol.ResultError && out.Error == nil {
		out.Error = &protocol.RunError{Code: "grader_internal", Message: "The grader failed."}
	}

	seen := map[int]bool{}
	for _, st := range res.Stages {
		if !slices.Contains(stages, st.Stage) || seen[st.Stage] {
			continue
		}
		seen[st.Stage] = true
		out.Stages = append(out.Stages, clampStage(st, lim))
	}
	slices.SortFunc(out.Stages, func(a, b protocol.StageResult) int { return a.Stage - b.Stage })

	passed := out.Status == protocol.ResultCompleted && len(out.Stages) == len(stages)
	for _, st := range out.Stages {
		if st.Status != protocol.StagePassed {
			passed = false
		}
	}
	out.Passed = passed
	return out, nil
}

func clampRunError(e *protocol.RunError) *protocol.RunError {
	if e == nil {
		return nil
	}
	code := strings.Map(func(r rune) rune {
		if r >= 'a' && r <= 'z' || r >= '0' && r <= '9' || r == '_' {
			return r
		}
		return -1
	}, truncate(e.Code, capCode))
	if code == "" {
		code = "grader_error"
	}
	return &protocol.RunError{Code: code, Message: truncate(e.Message, capMessage)}
}

func nonneg(v int64) int64 { return max(v, 0) }

func clampTimings(t protocol.Timings) protocol.Timings {
	return protocol.Timings{TotalMs: nonneg(t.TotalMs), SetupMs: nonneg(t.SetupMs), BuildMs: nonneg(t.BuildMs), TestMs: nonneg(t.TestMs)}
}

func clampStage(st protocol.StageResult, lim protocol.Limits) protocol.StageResult {
	out := protocol.StageResult{
		Stage:       st.Stage,
		Status:      st.Status,
		Phase:       truncate(st.Phase, 16),
		Signal:      truncate(st.Signal, 32),
		RunningTest: truncate(st.RunningTest, capTestName),
		Hint:        truncate(st.Hint, capMessage),
		BuildMs:     nonneg(st.BuildMs),
		RunMs:       nonneg(st.RunMs),
	}
	if !slices.Contains(stageStatuses, out.Status) {
		out.Status = protocol.StageFailed
	}
	if st.ExitCode != nil {
		c := *st.ExitCode
		out.ExitCode = &c
	}
	out.Output = truncate(st.Output, lim.OutputBytes)
	out.OutputTruncated = st.OutputTruncated || len(out.Output) < len(st.Output)

	if st.Compile != nil {
		c := &protocol.CompileSummary{
			FirstError: truncate(st.Compile.FirstError, capLine),
			Output:     truncate(st.Compile.Output, lim.OutputBytes),
			ErrorCount: max(st.Compile.ErrorCount, 0),
		}
		c.Truncated = st.Compile.Truncated || len(c.Output) < len(st.Compile.Output)
		for i, p := range st.Compile.Preflight {
			if i >= capPreflight {
				break
			}
			c.Preflight = append(c.Preflight, truncate(p, capMessage))
		}
		out.Compile = c
	}
	for i, tc := range st.Tests {
		if i >= capTests {
			break
		}
		c := protocol.TestCase{Name: truncate(tc.Name, capTestName), Status: tc.Status}
		if c.Status != protocol.StagePassed {
			c.Status = protocol.StageFailed
		}
		for j, msg := range tc.Messages {
			if j >= capMessages {
				break
			}
			c.Messages = append(c.Messages, truncate(msg, capTestMessage))
		}
		out.Tests = append(out.Tests, c)
	}
	if st.Counts != nil {
		out.Counts = &protocol.TestCounts{Total: max(st.Counts.Total, 0), Passed: max(st.Counts.Passed, 0), Failed: max(st.Counts.Failed, 0)}
	}
	budget := lim.TraceBytes
	out.TraceTruncated = st.TraceTruncated
	for i, ev := range st.Trace {
		if i >= capTraceEvents || len(ev) > budget {
			out.TraceTruncated = true
			break
		}
		if !json.Valid(ev) {
			out.TraceTruncated = true
			continue
		}
		budget -= len(ev)
		out.Trace = append(out.Trace, json.RawMessage(slices.Clone([]byte(ev))))
	}
	return out
}

// shrinkResult degrades res in place until its JSON encoding fits in
// (limit) bytes, in the grader's own order (grader.CapResult): drop traces, cap
// outputs (8 KiB then 1 KiB), keep two messages per test, drop passed tests,
// drop all tests and outputs, then trim compile diagnostics. It returns the
// final encoded size, or an error if even the skeleton does not fit.
func shrinkResult(res *protocol.Result, limit int) (int, error) {
	size := func() int {
		b, err := json.Marshal(res)
		if err != nil {
			return 1 << 62
		}
		return len(b)
	}
	n := size()
	if limit <= 0 || n <= limit {
		return n, nil
	}
	steps := []func(s *protocol.StageResult){
		func(s *protocol.StageResult) {
			if s.Trace != nil {
				s.Trace, s.TraceTruncated = nil, true
			}
		},
		capOutputs(8 << 10),
		capOutputs(1 << 10),
		func(s *protocol.StageResult) {
			for j := range s.Tests {
				if m := s.Tests[j].Messages; len(m) > 2 {
					s.Tests[j].Messages = append(m[:2:2], "... (more messages dropped: result size limit)")
				}
			}
		},
		func(s *protocol.StageResult) {
			keep := s.Tests[:0:0]
			for _, t := range s.Tests {
				if t.Status != protocol.StagePassed {
					keep = append(keep, t)
				}
			}
			s.Tests = keep
		},
		func(s *protocol.StageResult) {
			s.Tests = nil
			if s.Output != "" {
				s.Output, s.OutputTruncated = "", true
			}
			if s.Compile != nil && s.Compile.Output != "" {
				s.Compile.Output, s.Compile.Truncated = "", true
			}
		},
		func(s *protocol.StageResult) {
			if s.Compile != nil {
				if len(s.Compile.Preflight) > 4 {
					s.Compile.Preflight = s.Compile.Preflight[:4:4]
				}
				s.Compile.FirstError = truncate(s.Compile.FirstError, capMessage)
			}
		},
	}
	for _, step := range steps {
		for i := range res.Stages {
			step(&res.Stages[i])
		}
		if n = size(); n <= limit {
			return n, nil
		}
	}
	return n, fmt.Errorf("result is %d bytes after shrinking (limit %d)", n, limit)
}

func capOutputs(lim int) func(s *protocol.StageResult) {
	return func(s *protocol.StageResult) {
		if len(s.Output) > lim {
			s.Output, s.OutputTruncated = truncate(s.Output, lim), true
		}
		if s.Compile != nil && len(s.Compile.Output) > lim {
			s.Compile.Output, s.Compile.Truncated = truncate(s.Compile.Output, lim), true
		}
	}
}
