package github

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"regexp"
	"runtime/debug"
	"strings"
	"time"

	"cppatlas.com/runner/internal/protocol"
)

func contextWithTimeout(parent context.Context, d time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(parent, d)
}

func (a *App) checkName(challenge string) string { return a.cfg.CheckName + " / " + challenge }

func (a *App) recoverPanic(j *pushJob) {
	if r := recover(); r != nil {
		a.log.Error("panic in github grading", "repo", j.fullName(), "sha", j.sha, "panic", fmt.Sprint(r), "stack", string(debug.Stack()))
	}
}

// ---------------------------------------------------------- .cppatlas.json

// repoSettings is the parsed .cppatlas.json.
type repoSettings struct {
	Challenge string `json:"challenge"`
	Stage     *int   `json:"stage"`
	Compiler  string `json:"compiler"`
	Sanitize  bool   `json:"sanitize"`
}

var challengeNameRE = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,39}$`)

// settingsError is a learner-facing problem with .cppatlas.json.
type settingsError struct{ msg string }

func (e *settingsError) Error() string { return e.msg }

func parseSettings(b []byte, defChallenge string) (repoSettings, error) {
	var s repoSettings
	if b != nil {
		b = bytes.TrimPrefix(b, []byte("\xef\xbb\xbf")) // tolerate a UTF-8 BOM
		dec := json.NewDecoder(bytes.NewReader(b))
		dec.DisallowUnknownFields()
		if err := dec.Decode(&s); err != nil {
			return s, &settingsError{"`.cppatlas.json` is not valid: " + jsonErr(err)}
		}
		var extra json.RawMessage
		if err := dec.Decode(&extra); err == nil || !errors.Is(err, io.EOF) {
			return s, &settingsError{"`.cppatlas.json` must contain exactly one JSON object"}
		}
	}
	if s.Challenge == "" {
		s.Challenge = defChallenge
	}
	if !challengeNameRE.MatchString(s.Challenge) {
		return s, &settingsError{"`.cppatlas.json`: \"challenge\" must be a challenge name such as \"vector\""}
	}
	switch s.Compiler {
	case "", protocol.CompilerGCC, protocol.CompilerClang:
	default:
		return s, &settingsError{"`.cppatlas.json`: \"compiler\" must be \"gcc\" or \"clang\""}
	}
	return s, nil
}

// jsonErr renders a decoder error without echoing large learner input.
func jsonErr(err error) string {
	var se *json.SyntaxError
	var te *json.UnmarshalTypeError
	switch {
	case errors.As(err, &se):
		return fmt.Sprintf("syntax error at byte %d", se.Offset)
	case errors.As(err, &te):
		return fmt.Sprintf("field %s has the wrong type (want %s)", inlineCode(te.Field), te.Type.String())
	case errors.Is(err, io.EOF):
		return "the file is empty"
	}
	msg := err.Error()
	if f, ok := strings.CutPrefix(msg, "json: unknown field "); ok {
		return "unknown field " + inlineCode(strings.Trim(f, `"`)) + ` (allowed: "challenge", "stage", "compiler", "sanitize")`
	}
	return "it could not be parsed"
}

// ------------------------------------------------------------------- grading

// checkRun tracks the run created for a job so a failure path can complete it.
type checkRun struct {
	id        int64
	name      string
	details   string
	completed bool
}

// safeGrade grades j; a panic is logged and the check run, if created, is
// completed as neutral so it never hangs in progress.
func (a *App) safeGrade(j *pushJob) {
	cr := &checkRun{}
	defer func() {
		r := recover()
		if r != nil {
			a.log.Error("panic in github grading", "repo", j.fullName(), "sha", j.sha, "panic", fmt.Sprint(r), "stack", string(debug.Stack()))
		}
		if cr.id != 0 && !cr.completed {
			a.forgetGraded(j)
			msg := "cppatlas hit an internal error while grading this commit."
			if r == nil && a.ctx.Err() != nil {
				msg = "The grading server restarted before this commit was graded."
			}
			a.finishDetached(j, cr, "neutral", checkOutput{
				Title:   "cppatlas could not grade this commit",
				Summary: msg + " Push again to retry (an empty commit works: `git commit --allow-empty -m regrade && git push`).",
			})
		}
	}()
	a.grade(a.ctx, j, cr)
}

// finishDetached completes the check run on a context that survives shutdown.
func (a *App) finishDetached(j *pushJob, cr *checkRun, conclusion string, out checkOutput) {
	ctx, cancel := context.WithTimeout(context.WithoutCancel(a.ctx), 2*a.cfg.RequestTimeout)
	defer cancel()
	if err := a.complete(ctx, j, cr, conclusion, out); err != nil {
		a.log.Error("could not complete check run", "repo", j.fullName(), "sha", j.sha, "check_run", cr.id, "err", err)
	}
}

func (a *App) complete(ctx context.Context, j *pushJob, cr *checkRun, conclusion string, out checkOutput) error {
	body := map[string]any{
		"status":       "completed",
		"conclusion":   conclusion,
		"completed_at": a.now().UTC().Format(time.RFC3339),
		"output":       out,
	}
	if cr.details != "" {
		body["details_url"] = cr.details
	}
	if err := a.updateCheckRun(ctx, j, cr.id, body); err != nil {
		return err
	}
	cr.completed = true
	return nil
}

// postFinal creates an already-completed check run (no run was started).
func (a *App) postFinal(ctx context.Context, j *pushJob, name, details, conclusion string, out checkOutput) {
	_, err := a.createCheckRun(ctx, j, map[string]any{
		"name":         name,
		"status":       "completed",
		"conclusion":   conclusion,
		"started_at":   a.now().UTC().Format(time.RFC3339),
		"completed_at": a.now().UTC().Format(time.RFC3339),
		"details_url":  details,
		"output":       out,
	})
	if err != nil {
		a.log.Warn("could not post check run", "repo", j.fullName(), "sha", j.sha, "err", err)
	}
}

const regradeHint = " Push again to retry (an empty commit works: `git commit --allow-empty -m regrade && git push`)."

func (a *App) forgetGraded(j *pushJob) {
	a.graded.forget(fmt.Sprintf("%d@%s", j.repoID, j.sha))
}

func (a *App) grade(ctx context.Context, j *pushJob, cr *checkRun) {
	log := a.log.With("delivery", j.delivery, "repo", j.fullName(), "ref", j.ref, "sha", j.sha)
	site := a.cfg.SiteURL
	defName := a.checkName(a.cfg.DefaultChallenge)
	defDetails := challengeURL(site, a.cfg.DefaultChallenge)

	// 1. Configuration at the pushed commit.
	raw, err := a.fetchFile(ctx, j, ".cppatlas.json", a.cfg.ConfigFileMaxBytes)
	switch {
	case err == nil:
	case errors.Is(err, errNotFound):
		// No .cppatlas.json: this repository is not a challenge repo. Learners
		// may install the App on "All repositories", so stay silent (no check
		// run, no runner job) instead of grading unrelated projects.
		log.Info("push ignored: no .cppatlas.json")
		return
	case errors.Is(err, errTooLarge):
		a.postFinal(ctx, j, defName, defDetails, "failure", checkOutput{
			Title:   "Invalid .cppatlas.json",
			Summary: fmt.Sprintf("`.cppatlas.json` is larger than %d bytes.", a.cfg.ConfigFileMaxBytes),
		})
		return
	case errors.Is(err, errNotFile):
		a.postFinal(ctx, j, defName, defDetails, "failure", checkOutput{
			Title: "Invalid .cppatlas.json", Summary: "`.cppatlas.json` must be a regular file.",
		})
		return
	default:
		log.Warn("fetch .cppatlas.json failed", "err", err)
		a.forgetGraded(j)
		a.postFinal(ctx, j, defName, defDetails, "neutral", checkOutput{
			Title:   "cppatlas could not read this commit",
			Summary: "GitHub did not return the repository contents." + regradeHint,
		})
		return
	}
	settings, err := parseSettings(raw, a.cfg.DefaultChallenge)
	if err != nil {
		a.postFinal(ctx, j, defName, defDetails, "failure", checkOutput{
			Title: "Invalid .cppatlas.json", Summary: err.Error() + "\n\n" + settingsHelp,
		})
		return
	}
	spec, ok := a.cfg.Runner.Challenge(settings.Challenge)
	if !ok {
		a.postFinal(ctx, j, a.cfg.CheckName, challengeURL(site, ""), "failure", checkOutput{
			Title:   "Unknown challenge",
			Summary: "`.cppatlas.json` names the challenge " + inlineCode(settings.Challenge) + ", which cppatlas does not know.\n\n" + settingsHelp,
		})
		return
	}
	g := gradeInfo{challenge: spec.Name, total: spec.Stages, site: site, sha: j.sha}
	if g.challenge == "" {
		g.challenge = settings.Challenge
	}
	cr.name = a.checkName(g.challenge)
	g.stages = protocol.StagesUpTo(spec.Stages)
	if settings.Stage != nil {
		n := *settings.Stage
		if n < 1 || n > spec.Stages {
			a.postFinal(ctx, j, cr.name, challengeURL(site, g.challenge), "failure", checkOutput{
				Title:   "Invalid .cppatlas.json",
				Summary: fmt.Sprintf("`.cppatlas.json`: \"stage\" must be between 1 and %d.\n\n%s", spec.Stages, settingsHelp),
			})
			return
		}
		g.stages = protocol.StagesUpTo(n)
	}
	sub := protocol.Submission{
		Challenge:  settings.Challenge,
		Stages:     g.stages,
		StopOnFail: true,
		Files:      map[string]string{},
		Options:    protocol.Options{Compiler: settings.Compiler},
		Source:     protocol.SourceGitHub,
		ClientKey:  "gh:" + j.fullName(),
	}
	if settings.Sanitize {
		sub.Options.Preset = protocol.PresetAsanUbsan
	}

	// 2. Check run, queued.
	cr.details = stageURL(site, g.challenge, 1)
	id, err := a.createCheckRun(ctx, j, map[string]any{
		"name":        cr.name,
		"status":      "queued",
		"started_at":  a.now().UTC().Format(time.RFC3339),
		"details_url": cr.details,
		"output": checkOutput{
			Title:   "Queued",
			Summary: fmt.Sprintf("Grading %s at commit %s.", g.stagesPhrase(), inlineCode(shortSHA(j.sha))),
		},
	})
	if err != nil {
		log.Warn("create check run failed", "err", err)
		a.forgetGraded(j)
		return
	}
	cr.id = id

	// 3. The challenge files: exactly the allowlist, at the SHA.
	total := 0
	required := map[string]bool{}
	for _, p := range spec.RequiredFiles {
		required[p] = true
	}
	for _, p := range spec.AllowedFiles {
		if !validRepoPath(p) {
			log.Error("challenge spec has an unsafe path", "path", p)
			continue
		}
		b, err := a.fetchFile(ctx, j, p, int64(spec.MaxFileBytes))
		switch {
		case err == nil:
		case errors.Is(err, errNotFound), errors.Is(err, errNotFile):
			if required[p] {
				a.finish(ctx, j, cr, "failure", checkOutput{
					Title:   "Missing " + p,
					Summary: fmt.Sprintf("%s was not found at commit %s. Keep your solution at exactly this path.", inlineCode(p), inlineCode(shortSHA(j.sha))),
				})
				return
			}
			continue
		case errors.Is(err, errTooLarge):
			a.finish(ctx, j, cr, "failure", checkOutput{
				Title:   p + " is too large",
				Summary: fmt.Sprintf("%s is larger than %d bytes, the limit for this challenge.", inlineCode(p), spec.MaxFileBytes),
			})
			return
		default:
			log.Warn("fetch file failed", "path", p, "err", err)
			a.forgetGraded(j)
			a.finish(ctx, j, cr, "neutral", checkOutput{
				Title: "cppatlas could not read this commit", Summary: "GitHub did not return " + inlineCode(p) + "." + regradeHint,
			})
			return
		}
		total += len(b)
		if spec.MaxTotalBytes > 0 && total > spec.MaxTotalBytes {
			a.finish(ctx, j, cr, "failure", checkOutput{
				Title:   "Submission too large",
				Summary: fmt.Sprintf("The challenge files add up to more than %d bytes.", spec.MaxTotalBytes),
			})
			return
		}
		sub.Files[p] = string(b)
	}

	// 4. Submit.
	view, err := a.cfg.Runner.Submit(ctx, sub)
	if err != nil {
		var ve *protocol.ValidationError
		switch {
		case errors.Is(err, protocol.ErrQueueFull):
			a.forgetGraded(j)
			a.finish(ctx, j, cr, "neutral", checkOutput{
				Title:   "cppatlas is busy",
				Summary: "The grading queue is full, so this commit was not graded." + regradeHint,
			})
		case errors.As(err, &ve):
			a.finish(ctx, j, cr, "failure", checkOutput{
				Title:   "Submission rejected",
				Summary: "cppatlas rejected the submission:\n\n" + fenced(ve.Error()),
			})
		default:
			log.Warn("submit failed", "err", err)
			a.forgetGraded(j)
			a.finish(ctx, j, cr, "neutral", checkOutput{
				Title: "cppatlas could not grade this commit", Summary: "The run could not be started." + regradeHint,
			})
		}
		return
	}
	log = log.With("run", shortRunID(view.ID))
	log.Info("run submitted")

	// 5. In progress.
	progress := fmt.Sprintf("Grading %s at commit %s.", g.stagesPhrase(), inlineCode(shortSHA(j.sha)))
	if view.QueuePosition > 0 {
		progress += fmt.Sprintf(" Position %d in the queue.", view.QueuePosition)
	}
	if err := a.updateCheckRun(ctx, j, cr.id, map[string]any{
		"status":      "in_progress",
		"external_id": view.ID,
		"output":      checkOutput{Title: "Grading", Summary: progress},
	}); err != nil {
		log.Warn("mark in progress failed", "err", err) // keep going; completion matters more
	}

	// 6. Wait.
	wctx, cancel := context.WithTimeout(ctx, a.cfg.RunTimeout)
	final, err := a.cfg.Runner.Wait(wctx, view.ID)
	cancel()
	if err != nil {
		switch {
		case ctx.Err() != nil: // shutdown: safeGrade completes it as neutral
			return
		case errors.Is(err, context.DeadlineExceeded):
			a.finish(ctx, j, cr, "timed_out", checkOutput{
				Title:   "Grading timed out",
				Summary: "The run did not finish in time." + regradeHint,
			})
			return
		default:
			log.Warn("wait failed", "err", err)
			a.forgetGraded(j)
			a.finish(ctx, j, cr, "neutral", checkOutput{
				Title: "cppatlas could not grade this commit", Summary: "The run was lost." + regradeHint,
			})
			return
		}
	}
	conclusion, details, out := renderView(g, final, spec.AllowedFiles)
	if conclusion == "neutral" {
		a.forgetGraded(j)
	}
	cr.details = details
	a.finish(ctx, j, cr, conclusion, out)
	log.Info("check run completed", "conclusion", conclusion)
}

// finish completes the check run; on failure the deferred handler in
// safeGrade tries once more with a neutral conclusion.
func (a *App) finish(ctx context.Context, j *pushJob, cr *checkRun, conclusion string, out checkOutput) {
	if ctx.Err() != nil {
		return
	}
	if err := a.complete(ctx, j, cr, conclusion, out); err != nil {
		a.log.Warn("complete check run failed", "repo", j.fullName(), "sha", j.sha, "err", err)
	}
}

// validRepoPath guards the challenge allowlist (trusted, but cheap to check):
// relative, no dot segments, conservative characters.
var repoPathRE = regexp.MustCompile(`^[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*$`)

func validRepoPath(p string) bool {
	if !repoPathRE.MatchString(p) {
		return false
	}
	for _, s := range strings.Split(p, "/") {
		if s == "." || s == ".." {
			return false
		}
	}
	return true
}

const settingsHelp = "Expected format (every field optional):\n\n```json\n" +
	`{"challenge": "vector", "stage": 3, "compiler": "gcc", "sanitize": false}` +
	"\n```\n\n\"stage\": N grades stages 1..N; without it every stage is graded, stopping at the first that does not pass."

// shortRunID is the log form of a run id: run ids are bearer capabilities
// for reading results, so only a prefix is ever logged.
func shortRunID(id string) string {
	if len(id) > 8 {
		return id[:8]
	}
	return id
}
