package fly

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/rand/v2"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// apiError is a non-2xx answer from the Machines API.
type apiError struct {
	Method, Path string
	Status       int
	Body         string // capped
}

func (e *apiError) Error() string {
	return fmt.Sprintf("machines api %s %s: %d %s", e.Method, e.Path, e.Status, e.Body)
}

func statusOf(err error) int {
	var ae *apiError
	if errors.As(err, &ae) {
		return ae.Status
	}
	return 0
}

func retryable(status int) bool {
	return status == http.StatusTooManyRequests || status >= 500
}

// client is a minimal Machines API client with bounded retries.
type client struct {
	base       string
	token      string
	http       *http.Client
	reqTimeout time.Duration
	retries    int
	baseDelay  time.Duration
}

// authHeader: Fly macaroon tokens ("FlyV1 fm2_...") are sent verbatim,
// legacy tokens as Bearer.
func authHeader(token string) string {
	if strings.HasPrefix(token, "FlyV1 ") {
		return token
	}
	return "Bearer " + token
}

// do performs one API call, retrying transport errors, 429 and 5xx (use it
// only for idempotent calls; machine create has its own loop in fly.go) up to
// c.retries extra times with jittered exponential backoff (Retry-After is
// honoured up to 10s). out may be nil. timeout <= 0 means c.reqTimeout.
func (c *client) do(ctx context.Context, method, path string, in, out any, timeout time.Duration) error {
	var body []byte
	if in != nil {
		var err error
		if body, err = json.Marshal(in); err != nil {
			return err
		}
	}
	if timeout <= 0 {
		timeout = c.reqTimeout
	}
	var lastErr error
	for attempt := 0; ; attempt++ {
		retryAfter, err := c.once(ctx, method, path, body, out, timeout)
		if err == nil {
			return nil
		}
		lastErr = err
		st := statusOf(err)
		if ctx.Err() != nil || (st != 0 && !retryable(st)) || attempt >= c.retries {
			return lastErr
		}
		if c.backoff(ctx, attempt, retryAfter) != nil {
			return lastErr
		}
	}
}

// backoff sleeps before retry number attempt+1 (jittered exponential,
// Retry-After honoured, capped at 10s). It returns ctx.Err() if ctx ends first.
func (c *client) backoff(ctx context.Context, attempt int, retryAfter time.Duration) error {
	delay := c.baseDelay << attempt
	delay = delay/2 + rand.N(delay/2+1)
	if retryAfter > 0 {
		delay = min(retryAfter, 10*time.Second)
	}
	delay = min(delay, 10*time.Second)
	t := time.NewTimer(delay)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}

func (c *client) once(ctx context.Context, method, path string, body []byte, out any, timeout time.Duration) (time.Duration, error) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	var rd io.Reader
	if body != nil {
		rd = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.base+path, rd)
	if err != nil {
		return 0, err
	}
	req.Header.Set("Authorization", authHeader(c.token))
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return 0, err
	}
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		var ra time.Duration
		if s, err := strconv.Atoi(resp.Header.Get("Retry-After")); err == nil && s > 0 {
			ra = time.Duration(s) * time.Second
		}
		b := strings.TrimSpace(string(data))
		if len(b) > 300 {
			b = b[:300]
		}
		// Never echo anything that looks like a credential into logs.
		if c.token != "" {
			b = strings.ReplaceAll(b, c.token, "[redacted]")
		}
		p := path
		if i := strings.IndexByte(p, '?'); i >= 0 {
			p = p[:i]
		}
		return ra, &apiError{Method: method, Path: p, Status: resp.StatusCode, Body: strings.ToValidUTF8(b, "?")}
	}
	if out != nil && len(data) > 0 {
		if err := json.Unmarshal(data, out); err != nil {
			return 0, fmt.Errorf("machines api %s: decode: %w", method, err)
		}
	}
	return 0, nil
}
