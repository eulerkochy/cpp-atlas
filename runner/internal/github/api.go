package github

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/rand/v2"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	acceptJSON    = "application/vnd.github+json"
	acceptRaw     = "application/vnd.github.raw+json"
	apiVersion    = "2022-11-28"
	maxJSONBody   = 1 << 20
	maxRedirects  = 3
	tokenEarlyExp = 5 * time.Minute
	maxTokens     = 4096
)

// apiError is a non-2xx GitHub response. Message is GitHub's "message" field,
// capped; it never contains our credentials.
type apiError struct {
	Method string
	Path   string
	Status int
	Msg    string
}

func (e *apiError) Error() string {
	return fmt.Sprintf("github api %s %s: HTTP %d: %s", e.Method, e.Path, e.Status, e.Msg)
}

func statusOf(err error) int {
	var ae *apiError
	if errors.As(err, &ae) {
		return ae.Status
	}
	return 0
}

var errTooLarge = errors.New("response larger than the allowed size")

type apiRequest struct {
	method     string
	segs       []string // path segments, escaped individually
	query      url.Values
	bearer     string
	accept     string
	body       any
	maxBody    int64
	idempotent bool // safe to retry after a network error or 5xx
}

type apiResponse struct {
	status int
	header http.Header
	body   []byte
}

// apiURL joins the base URL and individually escaped path segments.
func (a *App) apiURL(segs []string, q url.Values) string {
	esc := make([]string, len(segs))
	for i, s := range segs {
		esc[i] = url.PathEscape(s)
	}
	u := strings.TrimRight(a.base.String(), "/") + "/" + strings.Join(esc, "/")
	if len(q) > 0 {
		u += "?" + q.Encode()
	}
	return u
}

func (a *App) checkRedirect(req *http.Request, via []*http.Request) error {
	if len(via) >= maxRedirects {
		return errors.New("github api: too many redirects")
	}
	// Never follow a redirect off the API host: the Authorization header must
	// not reach anyone else. Returning ErrUseLastResponse surfaces the 3xx as an
	// error to the caller.
	if req.URL.Scheme != a.base.Scheme || req.URL.Host != a.base.Host {
		return http.ErrUseLastResponse
	}
	return nil
}

// call performs req with a per-attempt timeout and bounded retries on 5xx,
// 429 and secondary rate limits (honouring Retry-After up to MaxRetryAfter).
func (a *App) call(ctx context.Context, req apiRequest) (*apiResponse, error) {
	var payload []byte
	if req.body != nil {
		var err error
		if payload, err = json.Marshal(req.body); err != nil {
			return nil, err
		}
	}
	if req.maxBody <= 0 {
		req.maxBody = maxJSONBody
	}
	path := "/" + strings.Join(req.segs, "/")
	for attempt := 0; ; attempt++ {
		resp, err := a.once(ctx, req, payload)
		if err == nil && resp.status >= 200 && resp.status < 300 {
			return resp, nil
		}
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		if err == nil {
			err = &apiError{Method: req.method, Path: path, Status: resp.status, Msg: githubMessage(resp)}
		}
		delay, retry := a.retryDelay(req, resp, err, attempt)
		if !retry || attempt >= a.cfg.MaxRetries {
			return resp, err
		}
		a.log.Warn("github api retry", "method", req.method, "path", path, "status", statusOf(err), "attempt", attempt+1, "delay", delay)
		if serr := a.sleep(ctx, delay); serr != nil {
			return nil, serr
		}
	}
}

func (a *App) once(ctx context.Context, req apiRequest, payload []byte) (*apiResponse, error) {
	ctx, cancel := context.WithTimeout(ctx, a.cfg.RequestTimeout)
	defer cancel()
	var body io.Reader
	if payload != nil {
		body = bytes.NewReader(payload)
	}
	hr, err := http.NewRequestWithContext(ctx, req.method, a.apiURL(req.segs, req.query), body)
	if err != nil {
		return nil, err
	}
	hr.Header.Set("Accept", req.accept)
	hr.Header.Set("X-GitHub-Api-Version", apiVersion)
	hr.Header.Set("User-Agent", a.cfg.UserAgent)
	if req.bearer != "" {
		hr.Header.Set("Authorization", "Bearer "+req.bearer)
	}
	if payload != nil {
		hr.Header.Set("Content-Type", "application/json")
	}
	res, err := a.client.Do(hr)
	if err != nil {
		// url.Error includes the URL but never headers; safe to log.
		return nil, err
	}
	defer res.Body.Close()
	if res.ContentLength > req.maxBody {
		return &apiResponse{status: res.StatusCode, header: res.Header}, errTooLarge
	}
	b, err := io.ReadAll(io.LimitReader(res.Body, req.maxBody+1))
	if err != nil {
		return nil, err
	}
	if int64(len(b)) > req.maxBody {
		return &apiResponse{status: res.StatusCode, header: res.Header}, errTooLarge
	}
	return &apiResponse{status: res.StatusCode, header: res.Header, body: b}, nil
}

func githubMessage(r *apiResponse) string {
	var m struct {
		Message string `json:"message"`
	}
	_ = json.Unmarshal(r.body, &m)
	s := m.Message
	if s == "" {
		s = http.StatusText(r.status)
	}
	if r.status >= 300 && r.status < 400 {
		s = "redirect refused (" + s + ")"
	}
	if len(s) > 200 {
		s = s[:200]
	}
	return strings.ToValidUTF8(s, "?")
}

func (a *App) retryDelay(req apiRequest, resp *apiResponse, err error, attempt int) (time.Duration, bool) {
	if errors.Is(err, errTooLarge) {
		return 0, false
	}
	backoff := time.Duration(1<<attempt)*time.Second + time.Duration(rand.Int64N(int64(250*time.Millisecond)))
	if resp == nil { // network error
		return backoff, req.idempotent
	}
	rateLimited := resp.status == http.StatusTooManyRequests ||
		(resp.status == http.StatusForbidden && (resp.header.Get("Retry-After") != "" || resp.header.Get("X-RateLimit-Remaining") == "0"))
	if rateLimited {
		if ra := resp.header.Get("Retry-After"); ra != "" {
			if secs, perr := strconv.Atoi(strings.TrimSpace(ra)); perr == nil && secs >= 0 {
				d := time.Duration(secs) * time.Second
				return d, d <= a.cfg.MaxRetryAfter
			}
			if t, perr := http.ParseTime(ra); perr == nil {
				d := t.Sub(a.now())
				return max(d, 0), d <= a.cfg.MaxRetryAfter
			}
		}
		if reset := resp.header.Get("X-RateLimit-Reset"); reset != "" && resp.header.Get("X-RateLimit-Remaining") == "0" {
			if sec, perr := strconv.ParseInt(reset, 10, 64); perr == nil {
				d := time.Unix(sec, 0).Sub(a.now())
				return max(d, 0), d <= a.cfg.MaxRetryAfter
			}
		}
		return max(backoff, 5*time.Second), true // secondary rate limit without hints: wait at least 5s
	}
	switch resp.status {
	case 500, 502, 503, 504:
		return backoff, req.idempotent
	}
	return 0, false
}

// ---------------------------------------------------------- installation token

type tokenKey struct{ inst, repo int64 }

type cachedToken struct {
	token   string
	expires time.Time
}

type tokenCache struct {
	mu sync.Mutex
	m  map[tokenKey]cachedToken
}

func newTokenCache() *tokenCache { return &tokenCache{m: make(map[tokenKey]cachedToken)} }

func (c *tokenCache) get(k tokenKey, now time.Time) (string, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	t, ok := c.m[k]
	if !ok || !now.Before(t.expires.Add(-tokenEarlyExp)) {
		return "", false
	}
	return t.token, true
}

func (c *tokenCache) put(k tokenKey, t cachedToken, now time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.m) >= maxTokens {
		for kk, v := range c.m {
			if !now.Before(v.expires.Add(-tokenEarlyExp)) {
				delete(c.m, kk)
			}
		}
		if len(c.m) >= maxTokens {
			clear(c.m)
		}
	}
	c.m[k] = t
}

func (c *tokenCache) drop(k tokenKey) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.m, k)
}

// tokenPermissions is the least-privilege permission set requested for every
// installation token.
var tokenPermissions = map[string]string{"checks": "write", "contents": "read", "metadata": "read"}

func (a *App) installationToken(ctx context.Context, inst, repo int64) (string, error) {
	k := tokenKey{inst, repo}
	if t, ok := a.tokens.get(k, a.now()); ok {
		return t, nil
	}
	jwt, err := appJWT(a.key, a.cfg.AppID, a.now())
	if err != nil {
		return "", err
	}
	resp, err := a.call(ctx, apiRequest{
		method: http.MethodPost,
		segs:   []string{"app", "installations", strconv.FormatInt(inst, 10), "access_tokens"},
		bearer: jwt,
		accept: acceptJSON,
		body: map[string]any{
			"repository_ids": []int64{repo},
			"permissions":    tokenPermissions,
		},
		idempotent: true,
	})
	if err != nil {
		return "", fmt.Errorf("installation token: %w", err)
	}
	var tr struct {
		Token     string    `json:"token"`
		ExpiresAt time.Time `json:"expires_at"`
	}
	if err := json.Unmarshal(resp.body, &tr); err != nil || tr.Token == "" || strings.ContainsAny(tr.Token, " \r\n\t") {
		return "", errors.New("installation token: malformed response")
	}
	if tr.ExpiresAt.IsZero() {
		tr.ExpiresAt = a.now().Add(time.Hour)
	}
	a.tokens.put(k, cachedToken{token: tr.Token, expires: tr.ExpiresAt}, a.now())
	return tr.Token, nil
}

// repoCall runs req with an installation token for the job's repository. A
// 401 drops the cached token and retries once with a fresh one.
func (a *App) repoCall(ctx context.Context, j *pushJob, req apiRequest) (*apiResponse, error) {
	for try := 0; ; try++ {
		tok, err := a.installationToken(ctx, j.installationID, j.repoID)
		if err != nil {
			return nil, err
		}
		req.bearer = tok
		resp, err := a.call(ctx, req)
		if statusOf(err) == http.StatusUnauthorized && try == 0 {
			a.tokens.drop(tokenKey{j.installationID, j.repoID})
			continue
		}
		return resp, err
	}
}

// ------------------------------------------------------------------ contents

var errNotFound = errors.New("not found")

// errNotFile: the path is a directory or submodule.
var errNotFile = errors.New("not a regular file")

// fetchFile reads one file at the job's commit SHA (never a branch name).
func (a *App) fetchFile(ctx context.Context, j *pushJob, path string, maxBytes int64) ([]byte, error) {
	segs := append([]string{"repos", j.owner, j.repo, "contents"}, strings.Split(path, "/")...)
	resp, err := a.repoCall(ctx, j, apiRequest{
		method:     http.MethodGet,
		segs:       segs,
		query:      url.Values{"ref": {j.sha}},
		accept:     acceptRaw,
		maxBody:    maxBytes,
		idempotent: true,
	})
	if err != nil {
		if statusOf(err) == http.StatusNotFound {
			return nil, errNotFound
		}
		if errors.Is(err, errTooLarge) {
			return nil, errTooLarge
		}
		return nil, err
	}
	if ct := resp.header.Get("Content-Type"); strings.Contains(ct, "json") && !strings.Contains(ct, "raw") && looksLikeListing(resp.body) {
		return nil, errNotFile
	}
	return resp.body, nil
}

// looksLikeListing detects the JSON a raw-media-type request returns for a
// directory (an array) or a submodule/symlink object.
func looksLikeListing(b []byte) bool {
	b = bytes.TrimSpace(b)
	if len(b) > 0 && b[0] == '[' {
		return true
	}
	var obj struct {
		Type string `json:"type"`
		SHA  string `json:"sha"`
	}
	if json.Unmarshal(b, &obj) == nil && obj.SHA != "" {
		switch obj.Type {
		case "dir", "submodule", "symlink":
			return true
		}
	}
	return false
}

// ---------------------------------------------------------------- check runs

func (a *App) createCheckRun(ctx context.Context, j *pushJob, body map[string]any) (int64, error) {
	body["head_sha"] = j.sha
	resp, err := a.repoCall(ctx, j, apiRequest{
		method: http.MethodPost,
		segs:   []string{"repos", j.owner, j.repo, "check-runs"},
		accept: acceptJSON,
		body:   body,
		// not idempotent: a retried create after a 5xx could duplicate the run
	})
	if err != nil {
		return 0, fmt.Errorf("create check run: %w", err)
	}
	var cr struct {
		ID int64 `json:"id"`
	}
	if err := json.Unmarshal(resp.body, &cr); err != nil || cr.ID <= 0 {
		return 0, errors.New("create check run: malformed response")
	}
	return cr.ID, nil
}

func (a *App) updateCheckRun(ctx context.Context, j *pushJob, id int64, body map[string]any) error {
	_, err := a.repoCall(ctx, j, apiRequest{
		method:     http.MethodPatch,
		segs:       []string{"repos", j.owner, j.repo, "check-runs", strconv.FormatInt(id, 10)},
		accept:     acceptJSON,
		body:       body,
		idempotent: true,
	})
	if err != nil {
		return fmt.Errorf("update check run: %w", err)
	}
	return nil
}
