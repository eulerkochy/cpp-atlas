package httpapi

import (
	"net/http"
	"time"
)

// NewServer returns an http.Server with timeouts suited to this API:
// WriteTimeout exceeds the 25 s long-poll with headroom.
func NewServer(addr string, h http.Handler) *http.Server {
	return &http.Server{
		Addr:              addr,
		Handler:           h,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      40 * time.Second,
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    16 << 10,
	}
}
