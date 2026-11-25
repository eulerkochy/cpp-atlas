package github

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// pushJob is one push to grade. All fields come from the signed payload and
// have been validated.
type pushJob struct {
	delivery       string
	installationID int64
	repoID         int64
	owner, repo    string
	ref            string // refs/heads/...
	sha            string
	received       time.Time
}

func (j *pushJob) branch() string { return strings.TrimPrefix(j.ref, "refs/heads/") }

func (j *pushJob) fullName() string { return j.owner + "/" + j.repo }

// WebhookHandler returns the handler for POST /github/webhook.
func (a *App) WebhookHandler() http.Handler { return http.HandlerFunc(a.serveWebhook) }

func reply(w http.ResponseWriter, code int, msg string) {
	if code == http.StatusNoContent {
		w.WriteHeader(code)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(code)
	_, _ = io.WriteString(w, msg+"\n")
}

var deliveryRE = regexp.MustCompile(`^[A-Za-z0-9-]{1,64}$`)

func (a *App) serveWebhook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		reply(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if a.closed.Load() {
		reply(w, http.StatusServiceUnavailable, "shutting down")
		return
	}
	max := a.cfg.MaxBodyBytes
	if r.ContentLength > max {
		reply(w, http.StatusRequestEntityTooLarge, "payload too large")
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, max))
	if err != nil {
		var mbe *http.MaxBytesError
		if errors.As(err, &mbe) {
			reply(w, http.StatusRequestEntityTooLarge, "payload too large")
			return
		}
		reply(w, http.StatusBadRequest, "bad request")
		return
	}
	// Authenticate the raw bytes before looking at anything they say.
	if !verifySignature(a.secret, r.Header.Values("X-Hub-Signature-256"), body) {
		reply(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	event := r.Header.Get("X-GitHub-Event")
	delivery := r.Header.Get("X-GitHub-Delivery")
	log := a.log.With("delivery", delivery, "event", event)
	switch event {
	case "ping":
		reply(w, http.StatusOK, "pong")
		return
	case "push":
	default:
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if !deliveryRE.MatchString(delivery) {
		reply(w, http.StatusBadRequest, "missing or invalid X-GitHub-Delivery")
		return
	}
	if mt, _, err := mime.ParseMediaType(r.Header.Get("Content-Type")); err != nil || mt != "application/json" {
		reply(w, http.StatusUnsupportedMediaType, "content type must be application/json")
		return
	}
	if a.deliveries.seenOrAdd(delivery) {
		log.Info("duplicate delivery ignored")
		reply(w, http.StatusOK, "duplicate delivery")
		return
	}
	j, reason, err := a.parsePush(body)
	if err != nil {
		log.Warn("malformed push payload", "err", err)
		reply(w, http.StatusBadRequest, "malformed payload")
		return
	}
	if j == nil {
		log.Info("push ignored", "reason", reason)
		reply(w, http.StatusOK, "ignored: "+reason)
		return
	}
	j.delivery = delivery
	log = log.With("repo", j.fullName(), "ref", j.ref, "sha", j.sha, "installation", j.installationID)
	if a.graded.seenOrAdd(strconv.FormatInt(j.repoID, 10) + "@" + j.sha) {
		log.Info("commit already graded")
		reply(w, http.StatusOK, "ignored: commit already graded")
		return
	}
	if !a.buckets.allow(j.installationID, a.now()) {
		log.Warn("installation rate limited")
		a.graded.forget(strconv.FormatInt(j.repoID, 10) + "@" + j.sha)
		a.notify(j, "neutral", "Rate limited",
			"This installation pushed more often than cppatlas grades. Wait a minute, then push again "+
				"(an empty commit works: `git commit --allow-empty -m regrade && git push`).")
		reply(w, http.StatusAccepted, "rate limited")
		return
	}
	a.enqueue(j)
	reply(w, http.StatusAccepted, "queued")
}

// verifySignature checks X-Hub-Signature-256 ("sha256=" + hex HMAC-SHA256 of
// the raw body) in constant time. Exactly one header value is accepted; the
// legacy sha1 X-Hub-Signature is never consulted.
func verifySignature(secret []byte, values []string, body []byte) bool {
	if len(values) != 1 || len(secret) == 0 {
		return false
	}
	sig, ok := strings.CutPrefix(strings.TrimSpace(values[0]), "sha256=")
	if !ok || len(sig) != hex.EncodedLen(sha256.Size) {
		return false
	}
	got, err := hex.DecodeString(sig)
	if err != nil {
		return false
	}
	mac := hmac.New(sha256.New, secret)
	mac.Write(body)
	return hmac.Equal(got, mac.Sum(nil))
}

// --------------------------------------------------------------- push event

type pushPayload struct {
	Ref        string `json:"ref"`
	After      string `json:"after"`
	Deleted    bool   `json:"deleted"`
	HeadCommit *struct {
		ID string `json:"id"`
	} `json:"head_commit"`
	Repository *struct {
		ID    int64  `json:"id"`
		Name  string `json:"name"`
		Owner struct {
			Login string `json:"login"`
			Name  string `json:"name"`
		} `json:"owner"`
		DefaultBranch string          `json:"default_branch"`
		PushedAt      json.RawMessage `json:"pushed_at"`
	} `json:"repository"`
	Installation *struct {
		ID int64 `json:"id"`
	} `json:"installation"`
}

var (
	shaRE   = regexp.MustCompile(`^(?:[0-9a-f]{40}|[0-9a-f]{64})$`)
	zeroRE  = regexp.MustCompile(`^0+$`)
	ownerRE = regexp.MustCompile(`^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$`)
	repoRE  = regexp.MustCompile(`^[A-Za-z0-9._-]{1,100}$`)
)

func validOwner(s string) bool { return ownerRE.MatchString(s) }

func validRepo(s string) bool {
	return repoRE.MatchString(s) && s != "." && s != ".." && !strings.HasSuffix(strings.ToLower(s), ".git")
}

// validRef accepts a branch ref that git would accept, conservatively.
func validRef(ref string) bool {
	if len(ref) > 255 || !strings.HasPrefix(ref, "refs/heads/") || len(ref) == len("refs/heads/") {
		return false
	}
	for _, r := range ref {
		if r < 0x20 || r == 0x7f {
			return false
		}
	}
	return true
}

// parsePush returns the job to grade, or (nil, reason) for a push that is
// valid but not graded. err is set for a malformed payload.
func (a *App) parsePush(body []byte) (*pushJob, string, error) {
	var p pushPayload
	dec := json.NewDecoder(bytes.NewReader(body))
	if err := dec.Decode(&p); err != nil {
		return nil, "", err
	}
	if p.Installation == nil || p.Installation.ID <= 0 {
		return nil, "not an App installation delivery", nil
	}
	if p.Repository == nil || p.Repository.ID <= 0 {
		return nil, "no repository", nil
	}
	if p.Deleted || zeroRE.MatchString(p.After) {
		return nil, "branch deletion", nil
	}
	if strings.HasPrefix(p.Ref, "refs/tags/") {
		return nil, "tag push", nil
	}
	if !strings.HasPrefix(p.Ref, "refs/heads/") {
		return nil, "not a branch", nil
	}
	if !validRef(p.Ref) {
		return nil, "invalid ref", nil
	}
	if p.HeadCommit == nil || p.HeadCommit.ID == "" {
		return nil, "no head commit", nil
	}
	if !shaRE.MatchString(p.After) {
		return nil, "invalid commit sha", nil
	}
	if a.cfg.DefaultBranchOnly && p.Ref != "refs/heads/"+p.Repository.DefaultBranch {
		return nil, "not the default branch", nil
	}
	owner := p.Repository.Owner.Login
	if owner == "" {
		owner = p.Repository.Owner.Name
	}
	if !validOwner(owner) || !validRepo(p.Repository.Name) {
		return nil, "invalid repository name", nil
	}
	if a.cfg.MaxEventAge > 0 {
		if t, ok := parsePushedAt(p.Repository.PushedAt); ok && a.now().Sub(t) > a.cfg.MaxEventAge {
			return nil, "stale event", nil
		}
	}
	return &pushJob{
		installationID: p.Installation.ID,
		repoID:         p.Repository.ID,
		owner:          owner,
		repo:           p.Repository.Name,
		ref:            p.Ref,
		sha:            p.After,
		received:       a.now(),
	}, "", nil
}

// parsePushedAt accepts the unix-seconds number push events carry, or an
// RFC 3339 string.
func parsePushedAt(raw json.RawMessage) (time.Time, bool) {
	if len(raw) == 0 {
		return time.Time{}, false
	}
	var n int64
	if json.Unmarshal(raw, &n) == nil && n > 0 {
		return time.Unix(n, 0), true
	}
	var s string
	if json.Unmarshal(raw, &s) == nil {
		if t, err := time.Parse(time.RFC3339, s); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

// ---------------------------------------------------------------- dispatch

func (a *App) enqueue(j *pushJob) {
	res := a.sched.enqueue(j)
	log := a.log.With("delivery", j.delivery, "repo", j.fullName(), "sha", j.sha)
	if res.overflow {
		log.Warn("grading backlog full; reporting neutral check")
		a.graded.forget(strconv.FormatInt(j.repoID, 10) + "@" + j.sha)
		a.notify(j, "neutral", "cppatlas is busy",
			"Too many pushes are waiting to be graded right now, so this commit was not graded. "+
				"Push again in a few minutes (an empty commit works: `git commit --allow-empty -m regrade && git push`).")
	}
	if d := res.displaced; d != nil {
		a.graded.forget(strconv.FormatInt(d.repoID, 10) + "@" + d.sha)
		if res.reason == "superseded" {
			a.notify(d, "cancelled", "Superseded by a newer push",
				"A newer commit ("+inlineCode(shortSHA(j.sha))+") was pushed to "+inlineCode(d.branch())+
					" before this one was graded, so only the newer commit is graded.")
		} else {
			a.notify(d, "cancelled", "Skipped: too many queued pushes",
				"This repository had too many pushes waiting to be graded; only the most recent ones are graded.")
		}
	}
	if res.start {
		a.wg.Add(1)
		go a.repoWorker(j)
	}
}

func shortSHA(s string) string {
	if len(s) > 7 {
		return s[:7]
	}
	return s
}

// repoWorker grades j and then any pushes queued for the same repository, one
// at a time.
func (a *App) repoWorker(j *pushJob) {
	defer a.wg.Done()
	for j != nil {
		ran := false
		select {
		case a.runSem <- struct{}{}:
			ran = true
			a.safeGrade(j)
			<-a.runSem
		case <-a.ctx.Done():
		}
		if !ran {
			a.log.Warn("shutdown: push not graded", "repo", j.fullName(), "sha", j.sha)
		}
		var dropped []*pushJob
		j, dropped = a.sched.done(j.repoID, a.ctx.Err() != nil)
		for _, d := range dropped {
			a.log.Warn("shutdown: push not graded", "repo", d.fullName(), "sha", d.sha)
		}
	}
}

// notify posts a completed check run (cancelled/neutral) for a push that will
// not be graded. Best effort and bounded: with all notifier slots busy the
// notice is dropped and logged.
func (a *App) notify(j *pushJob, conclusion, title, summary string) {
	select {
	case a.notifySem <- struct{}{}:
	default:
		a.log.Warn("notice dropped: notifiers busy", "repo", j.fullName(), "sha", j.sha, "conclusion", conclusion)
		return
	}
	a.wg.Add(1)
	go func() {
		defer a.wg.Done()
		defer func() { <-a.notifySem }()
		defer a.recoverPanic(j)
		ctx, cancel := contextWithTimeout(a.ctx, 2*a.cfg.RequestTimeout)
		defer cancel()
		_, err := a.createCheckRun(ctx, j, map[string]any{
			"name":         a.checkName(a.cfg.DefaultChallenge),
			"status":       "completed",
			"conclusion":   conclusion,
			"completed_at": a.now().UTC().Format(time.RFC3339),
			"details_url":  challengeURL(a.cfg.SiteURL, a.cfg.DefaultChallenge),
			"output":       map[string]any{"title": title, "summary": summary},
		})
		if err != nil {
			a.log.Warn("notice check run failed", "repo", j.fullName(), "sha", j.sha, "err", err)
		}
	}()
}
