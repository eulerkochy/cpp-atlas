package httpapi

import (
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"strconv"
)

type statusWriter struct {
	http.ResponseWriter
	status int
	wrote  bool
}

func (s *statusWriter) WriteHeader(code int) {
	if !s.wrote {
		s.status, s.wrote = code, true
	}
	s.ResponseWriter.WriteHeader(code)
}

func (s *statusWriter) Write(b []byte) (int, error) {
	if !s.wrote {
		s.status, s.wrote = http.StatusOK, true
	}
	return s.ResponseWriter.Write(b)
}

func (s *statusWriter) Unwrap() http.ResponseWriter { return s.ResponseWriter }

// middleware: security headers -> panic recovery -> request log. Bodies are
// never logged (or read).
func (a *API) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := a.now()
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Cache-Control", "no-store")
		h.Set("Referrer-Policy", "no-referrer")
		sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		ip := clientIP(r, a.opts.TrustedProxy)

		defer func() {
			if rec := recover(); rec != nil {
				if rec == http.ErrAbortHandler {
					panic(rec)
				}
				a.log.Error("panic in handler", "panic", fmt.Sprint(rec), "method", r.Method, "path", r.URL.Path)
				if !sw.wrote {
					writeError(sw, http.StatusInternalServerError, "internal", "", "internal error")
				}
			}
			route := r.Pattern
			if route == "" {
				route = "unmatched"
			}
			a.log.LogAttrs(r.Context(), slog.LevelInfo, "request",
				slog.String("method", r.Method), slog.String("route", route),
				slog.Int("status", sw.status), slog.Duration("duration", a.now().Sub(start)),
				slog.String("ip", ip.String()))
		}()
		next.ServeHTTP(sw, r)
	})
}

// clientKey is ClientKey of the request's client address.
func (a *API) clientKey(r *http.Request) string {
	return ClientKey(clientIP(r, a.opts.TrustedProxy))
}

// guard applies CORS then the given rate limiter before h.
func (a *API) guard(l *limiter, h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Add("Vary", "Origin")
		if origins := r.Header.Values("Origin"); len(origins) > 0 {
			if len(origins) == 1 && a.origins.allowed(origins[0]) {
				setCORS(w.Header(), origins[0])
			} else if r.Method != http.MethodGet && r.Method != http.MethodHead {
				// CORS only stops the browser from *reading* the response; a
				// cross-origin POST is still delivered. Refuse it here.
				writeError(w, http.StatusForbidden, "origin_not_allowed", "", "this origin is not allowed")
				return
			}
		}
		if l != nil {
			if !a.allow(w, r, l) {
				return
			}
		}
		h(w, r)
	}
}

func (a *API) allow(w http.ResponseWriter, r *http.Request, l *limiter) bool {
	if l == nil {
		return true
	}
	ok, retry := l.allow(a.clientKey(r))
	if ok {
		return true
	}
	secs := int(math.Ceil(retry.Seconds()))
	w.Header().Set("Retry-After", strconv.Itoa(max(secs, 1)))
	writeError(w, http.StatusTooManyRequests, "rate_limited", "", "too many requests, slow down")
	return false
}
