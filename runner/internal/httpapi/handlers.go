package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"cppatlas.com/runner/internal/protocol"
)

type submitRequest struct {
	Challenge string            `json:"challenge"`
	Stage     json.RawMessage   `json:"stage"`
	Only      bool              `json:"only"`
	Files     map[string]string `json:"files"`
	Options   *struct {
		Compiler string `json:"compiler"`
		Preset   string `json:"preset"`
		Trace    bool   `json:"trace"`
	} `json:"options"`
}

var (
	digitsRE = regexp.MustCompile(`^[0-9]{1,9}$`)
	idRE     = regexp.MustCompile(`^[A-Za-z0-9_-]{1,` + strconv.Itoa(maxIDLen) + `}$`)
)

func (a *API) handlePreflight(w http.ResponseWriter, r *http.Request) {
	if w.Header().Get("Access-Control-Allow-Origin") != "" {
		h := w.Header()
		h.Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		h.Set("Access-Control-Allow-Headers", "Content-Type")
		h.Set("Access-Control-Max-Age", "600")
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) handleSubmit(w http.ResponseWriter, r *http.Request) {
	if mt, _, err := mime.ParseMediaType(r.Header.Get("Content-Type")); err != nil || mt != "application/json" {
		writeError(w, http.StatusUnsupportedMediaType, "unsupported_media_type", "", "Content-Type must be application/json")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, MaxBodyBytes)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	var req submitRequest
	if err := dec.Decode(&req); err != nil {
		a.decodeError(w, err)
		return
	}
	// Reject trailing data (a second document or garbage).
	if _, err := dec.Token(); err != io.EOF {
		if err == nil {
			writeError(w, http.StatusBadRequest, "invalid_json", "", "unexpected data after the JSON body")
		} else {
			a.decodeError(w, err)
		}
		return
	}

	bad := func(field, msg string) {
		writeError(w, http.StatusBadRequest, "invalid_request", field, msg)
	}
	if req.Challenge == "" || len(req.Challenge) > maxChallengeLn {
		bad("challenge", "challenge is required")
		return
	}
	raw := strings.TrimSpace(string(req.Stage))
	if raw == "" {
		bad("stage", "stage is required")
		return
	}
	if !digitsRE.MatchString(raw) {
		bad("stage", "stage must be an integer >= 1")
		return
	}
	stage, _ := strconv.Atoi(raw)
	if stage < 1 {
		bad("stage", "stage must be an integer >= 1")
		return
	}
	spec, ok := a.opts.Runner.Challenge(req.Challenge)
	if !ok {
		bad("challenge", "unknown challenge")
		return
	}
	if stage > spec.Stages {
		bad("stage", "stage must be between 1 and "+strconv.Itoa(spec.Stages))
		return
	}
	if len(req.Files) == 0 {
		bad("files", "files must be a non-empty object")
		return
	}
	if len(req.Files) > maxFiles {
		bad("files", "too many files (max "+strconv.Itoa(maxFiles)+")")
		return
	}
	for p := range req.Files {
		if p == "" || len(p) > maxPathLen {
			bad("files", "invalid file path")
			return
		}
	}

	sub := protocol.Submission{
		Challenge:  req.Challenge,
		Stages:     protocol.StagesUpTo(stage),
		StopOnFail: true,
		Files:      req.Files,
		Source:     protocol.SourceWeb,
		ClientKey:  a.clientKey(r), // same key (IPv6 /64) as the rate limiter
	}
	if req.Only {
		sub.Stages, sub.StopOnFail = []int{stage}, false
	}
	if o := req.Options; o != nil {
		sub.Options = protocol.Options{Compiler: o.Compiler, Preset: o.Preset, Trace: o.Trace}
	}

	view, err := a.opts.Runner.Submit(r.Context(), sub)
	if err != nil {
		a.submitError(w, err)
		return
	}
	loc := "/runs/" + view.ID
	w.Header().Set("Location", loc)
	writeJSON(w, http.StatusAccepted, map[string]any{
		"id":             view.ID,
		"status":         view.Status,
		"url":            loc,
		"queue_position": view.QueuePosition,
	})
}

func (a *API) decodeError(w http.ResponseWriter, err error) {
	var mbe *http.MaxBytesError
	var ute *json.UnmarshalTypeError
	switch {
	case errors.As(err, &mbe):
		writeError(w, http.StatusRequestEntityTooLarge, "payload_too_large", "", "request body exceeds "+strconv.Itoa(MaxBodyBytes>>10)+" KB")
	case errors.As(err, &ute):
		writeError(w, http.StatusBadRequest, "invalid_request", ute.Field, "wrong type for field")
	case errors.Is(err, io.EOF):
		writeError(w, http.StatusBadRequest, "invalid_json", "", "empty request body")
	default:
		// Do not echo decoder internals (offsets, Go type names, input bytes).
		writeError(w, http.StatusBadRequest, "invalid_json", "", "malformed JSON or unknown field")
	}
}

func (a *API) submitError(w http.ResponseWriter, err error) {
	var ve *protocol.ValidationError
	var hs interface{ HTTPStatus() int }
	switch {
	case errors.As(err, &ve):
		status := http.StatusBadRequest
		if ve.TooLarge {
			status = http.StatusRequestEntityTooLarge
		}
		writeError(w, status, "invalid_request", ve.Field, ve.Message)
	case errors.Is(err, protocol.ErrQueueFull):
		w.Header().Set("Retry-After", "10")
		writeError(w, http.StatusTooManyRequests, "queue_full", "", "the run queue is full, try again shortly")
	case errors.As(err, &hs) && hs.HTTPStatus() >= 400 && hs.HTTPStatus() < 600:
		status := hs.HTTPStatus()
		code := "rejected"
		var cd interface{ Code() string }
		if errors.As(err, &cd) && cd.Code() != "" {
			code = cd.Code()
		}
		if status == http.StatusTooManyRequests {
			w.Header().Set("Retry-After", "30")
		}
		writeError(w, status, code, "", err.Error())
	default:
		a.log.Error("submit failed", "err", err)
		writeError(w, http.StatusInternalServerError, "internal", "", "internal error")
	}
}

// handleGet serves a run snapshot. Clients poll; ?wait=N (0..25 s) turns a
// poll into a long poll that returns as soon as the run is terminal.
//
// Polling/long-poll rather than SSE: runs last seconds, the result is one
// JSON document, and plain request/response works through Fly's edge proxy
// and any intermediary without buffering or idle-timeout surprises, needs no
// reconnect/Last-Event-ID logic, and each poll is individually rate limited.
func (a *API) handleGet(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	notFound := func() { writeError(w, http.StatusNotFound, "not_found", "", "run not found") }
	if !idRE.MatchString(id) {
		notFound()
		return
	}
	wait := 0
	if v := r.URL.Query().Get("wait"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid_request", "wait", "wait must be an integer number of seconds")
			return
		}
		wait = min(max(n, 0), MaxWait)
	}
	view, ok := a.opts.Runner.Get(id)
	if !ok {
		notFound()
		return
	}
	if wait > 0 && !view.Terminal() {
		// Each held long-poll is an open connection on the only API machine;
		// over the per-client or global cap, degrade to a plain poll (the
		// client keeps working, it just polls again sooner).
		release, ok := a.waiters.acquire(a.clientKey(r))
		if !ok {
			w.Header().Set("X-Long-Poll", "degraded")
			w.Header().Set("Cache-Control", "no-store")
			writeJSON(w, http.StatusOK, view)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), time.Duration(wait)*a.opts.waitUnit)
		stop := context.AfterFunc(a.waiters.drainCtx, cancel)
		v, err := a.opts.Runner.Wait(ctx, id)
		stop()
		cancel()
		release()
		if errors.Is(err, protocol.ErrNotFound) {
			notFound()
			return
		}
		if v.ID != "" {
			view = v
		} else if v2, ok := a.opts.Runner.Get(id); ok {
			view = v2
		}
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, view)
}

func (a *API) handleHealth(w http.ResponseWriter, r *http.Request) {
	out := map[string]any{}
	if a.opts.Health != nil {
		if b, err := json.Marshal(a.opts.Health()); err == nil {
			_ = json.Unmarshal(b, &out) // non-object values are ignored
		}
	}
	out["status"] = "ok"
	writeJSON(w, http.StatusOK, out)
}

// handleWebhook rate limits by IP and hands the request over untouched: the
// body is neither read nor buffered here, and CORS does not apply (GitHub is
// not a browser).
func (a *API) handleWebhook(w http.ResponseWriter, r *http.Request) {
	if !a.allow(w, r, a.hook) {
		return
	}
	a.opts.Webhook.ServeHTTP(w, r)
}
