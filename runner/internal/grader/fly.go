package grader

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"cppatlas.com/runner/internal/protocol"
)

// API is the Fly-mode job source and result sink:
//
//	GET  {base}/internal/job     -> 200 protocol.Job | 404/410 no job
//	POST {base}/internal/result  <- protocol.Result
//
// both with "Authorization: Bearer <token>". The token is held only in this
// struct (the environment variable is cleared at start-up).
type API struct {
	Base   string
	token  string
	Client *http.Client
	Logf   func(string, ...any)
}

// ErrNoJob means the API has no job for this machine (404/410).
var ErrNoJob = errors.New("no job")

func NewAPI(base, token string, logf func(string, ...any)) *API {
	return &API{
		Base: strings.TrimRight(base, "/"), token: token, Logf: logf,
		Client: &http.Client{Timeout: 15 * time.Second},
	}
}

// FetchJob retries connection errors and 5xx/429 with backoff for up to
// `patience` (the API may still be starting).
func (a *API) FetchJob(patience time.Duration) (protocol.Job, error) {
	var job protocol.Job
	deadline := time.Now().Add(patience)
	delay := 250 * time.Millisecond
	for attempt := 1; ; attempt++ {
		req, _ := http.NewRequest(http.MethodGet, a.Base+"/internal/job", nil)
		req.Header.Set("Authorization", "Bearer "+a.token)
		req.Header.Set("Accept", "application/json")
		resp, err := a.Client.Do(req)
		retry := false
		if err != nil {
			retry = true
			err = fmt.Errorf("fetch job: %w", scrubErr(err))
		} else {
			body, rerr := io.ReadAll(io.LimitReader(resp.Body, 16<<20))
			resp.Body.Close()
			switch {
			case resp.StatusCode == http.StatusOK && rerr == nil:
				if err := json.Unmarshal(body, &job); err != nil {
					return job, fmt.Errorf("fetch job: bad JSON: %w", err)
				}
				return job, nil
			case resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusGone:
				return job, ErrNoJob
			case resp.StatusCode >= 500 || resp.StatusCode == http.StatusTooManyRequests || rerr != nil:
				retry = true
				err = fmt.Errorf("fetch job: HTTP %d", resp.StatusCode)
			default:
				return job, fmt.Errorf("fetch job: HTTP %d", resp.StatusCode)
			}
		}
		if !retry || time.Now().Add(delay).After(deadline) {
			return job, err
		}
		a.Logf("%v (attempt %d), retrying in %s", err, attempt, delay)
		time.Sleep(delay)
		if delay *= 2; delay > 4*time.Second {
			delay = 4 * time.Second
		}
	}
}

// PostResult retries until a 2xx, a non-retryable 4xx, or `patience` runs out.
func (a *API) PostResult(res *protocol.Result, patience time.Duration) error {
	body, err := json.Marshal(res)
	if err != nil {
		return err
	}
	deadline := time.Now().Add(patience)
	delay := 250 * time.Millisecond
	for attempt := 1; ; attempt++ {
		req, _ := http.NewRequest(http.MethodPost, a.Base+"/internal/result", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+a.token)
		req.Header.Set("Content-Type", "application/json")
		resp, err := a.Client.Do(req)
		if err == nil {
			io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<20))
			resp.Body.Close()
			switch {
			case resp.StatusCode/100 == 2:
				return nil
			case resp.StatusCode == http.StatusConflict:
				return nil // already recorded (e.g. our deadline result raced the real one)
			case resp.StatusCode < 500 && resp.StatusCode != http.StatusTooManyRequests && resp.StatusCode != http.StatusRequestTimeout:
				return fmt.Errorf("post result: HTTP %d", resp.StatusCode)
			}
			err = fmt.Errorf("post result: HTTP %d", resp.StatusCode)
		} else {
			err = fmt.Errorf("post result: %w", scrubErr(err))
		}
		if time.Now().Add(delay).After(deadline) {
			return err
		}
		a.Logf("%v (attempt %d), retrying in %s", err, attempt, delay)
		time.Sleep(delay)
		if delay *= 2; delay > 4*time.Second {
			delay = 4 * time.Second
		}
	}
}

// scrubErr drops the URL from net/http errors (it never contains the token,
// but keep logs minimal).
func scrubErr(err error) error {
	var ue interface{ Unwrap() error }
	if errors.As(err, &ue) {
		if inner := ue.Unwrap(); inner != nil {
			return inner
		}
	}
	return err
}
