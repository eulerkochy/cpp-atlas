package runs

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/netip"
	"strings"
	"sync"
	"time"

	"cppatlas.com/runner/internal/protocol"
)

// Ticket errors.
var (
	ErrTicketGone     = errors.New("ticket revoked or expired")
	ErrTicketBound    = errors.New("ticket already bound to a run")
	ErrTicketNotBound = errors.New("ticket not bound to a run")
)

// TokenIssuer is what the Fly backend needs from the Manager side: a way to
// mint fetch-once tokens. *Rendezvous implements it.
type TokenIssuer interface {
	// Issue mints a token bound to job, valid until expires.
	Issue(job protocol.Job, expires time.Time) (*Ticket, error)
	// IssueSlot mints an unbound token for a warm-pool machine, valid until
	// expires (or until bound, which resets the expiry).
	IssueSlot(expires time.Time) (*Ticket, error)
}

// RendezvousConfig configures the token registry and the internal handler.
type RendezvousConfig struct {
	// MaxResultBytes caps the POST /internal/result body
	// (RUNNER_MAX_RESULT_BYTES, default 2 MiB).
	MaxResultBytes int64
	// TombstoneTTL keeps revoked tokens around so replays get 410 instead
	// of 404 (default 10m).
	TombstoneTTL time.Duration
	// AllowRequest decides whether a request may use the internal endpoints
	// at all (defence in depth on top of the private listener). Nil means
	// PrivateNetworkOnly. Rejected requests get 404.
	AllowRequest func(*http.Request) bool
	// PeerBindWait bounds how long a request for a ticket whose peer
	// binding is still pending (ExpectPeer called, BindPeer not yet) waits
	// for the bind before it is refused (default 10s; the grader's HTTP
	// client times out after 15s).
	PeerBindWait time.Duration
	// Now is for tests.
	Now func() time.Time
}

// Rendezvous is the fetch-once token registry plus the internal HTTP handler
// the grader talks to on Fly:
//
//	GET  /internal/job     Authorization: Bearer <token>
//	     200 application/json protocol.Job   first fetch of a bound, live token
//	     401 missing/malformed Authorization
//	     404 unknown token, unbound slot token, or request not from a private address
//	     410 token already fetched, revoked (run terminal) or expired
//	POST /internal/result  Authorization: Bearer <token>, body protocol.Result (<= MaxResultBytes)
//	     204 accepted (exactly once)
//	     400 invalid JSON or RunID does not match the token's run (not consumed)
//	     404 / 410 as above, 410 also for a second result
//	     409 the job was never fetched with this token
//	     413 body too large
//
// Peer binding (defence in depth on Fly): a ticket can be bound to the 6PN
// address of the machine it was issued for (ExpectPeer before the machine is
// created, BindPeer with the address from the create response). Requests for
// a peer-bound ticket from any other address get 404, exactly like an
// unknown token; requests that arrive while the bind is still pending wait
// up to PeerBindWait for it.
//
// Token lookup is by SHA-256 digest of the presented token in a map, so the
// raw tokens are never stored and lookup time does not depend on how many
// leading characters of a guess are right.
type Rendezvous struct {
	cfg RendezvousConfig
	log *slog.Logger

	mu        sync.Mutex
	tickets   map[[32]byte]*Ticket
	lastSweep time.Time
}

// Ticket is one fetch-once token. All mutable fields are guarded by rv.mu.
type Ticket struct {
	rv    *Rendezvous
	key   [32]byte
	token string

	runID    string
	job      *protocol.Job // nil after fetch or for an unbound slot
	expires  time.Time
	fetched  bool
	resulted bool
	gone     bool
	goneAt   time.Time
	result   *protocol.Result
	done     chan struct{}
	doneOnce bool

	peerState peerState
	peer      netip.Addr
	peerReady chan struct{} // closed when leaving peerPending (or when gone)
}

type peerState uint8

const (
	peerAny     peerState = iota // no binding: any allowed peer (docker, tests, fallback)
	peerPending                  // binding expected; requests wait for BindPeer
	peerBound                    // only requests from peer are served
)

// NewRendezvous creates an empty registry.
func NewRendezvous(cfg RendezvousConfig, logger *slog.Logger) *Rendezvous {
	if cfg.MaxResultBytes <= 0 {
		cfg.MaxResultBytes = 2 << 20
	}
	if cfg.TombstoneTTL <= 0 {
		cfg.TombstoneTTL = 10 * time.Minute
	}
	if cfg.AllowRequest == nil {
		cfg.AllowRequest = PrivateNetworkOnly
	}
	if cfg.PeerBindWait <= 0 {
		cfg.PeerBindWait = 10 * time.Second
	}
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	if logger == nil {
		logger = slog.Default()
	}
	return &Rendezvous{cfg: cfg, log: logger, tickets: map[[32]byte]*Ticket{}}
}

// PrivateNetworkOnly allows requests whose peer address is loopback or
// private (RFC 1918, or fc00::/7 which includes Fly's 6PN fdaa::/16) and
// that do not carry Fly edge-proxy headers (traffic relayed by the public
// Fly proxy also arrives from a private address, but with these headers).
func PrivateNetworkOnly(r *http.Request) bool {
	for _, h := range []string{"Fly-Client-IP", "Fly-Forwarded-Port", "Fly-Forwarded-Proto", "Fly-Request-Id"} {
		if r.Header.Get(h) != "" {
			return false
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	ip := net.ParseIP(host)
	return ip != nil && (ip.IsLoopback() || ip.IsPrivate())
}

// AllowAny allows every request (tests, local experiments).
func AllowAny(*http.Request) bool { return true }

func newToken() (string, [32]byte, error) {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", [32]byte{}, err
	}
	tok := base64.RawURLEncoding.EncodeToString(b[:])
	return tok, sha256.Sum256([]byte(tok)), nil
}

func (rv *Rendezvous) add(job *protocol.Job, expires time.Time) (*Ticket, error) {
	tok, key, err := newToken()
	if err != nil {
		return nil, err
	}
	t := &Ticket{rv: rv, key: key, token: tok, expires: expires, done: make(chan struct{})}
	if job != nil {
		j := *job
		t.job = &j
		t.runID = j.RunID
	}
	rv.mu.Lock()
	defer rv.mu.Unlock()
	rv.sweepLocked(false)
	rv.tickets[key] = t
	return t, nil
}

// Issue implements TokenIssuer.
func (rv *Rendezvous) Issue(job protocol.Job, expires time.Time) (*Ticket, error) {
	return rv.add(&job, expires)
}

// IssueSlot implements TokenIssuer.
func (rv *Rendezvous) IssueSlot(expires time.Time) (*Ticket, error) {
	return rv.add(nil, expires)
}

// Len returns the number of live (not revoked, not expired) tickets.
func (rv *Rendezvous) Len() int {
	rv.mu.Lock()
	defer rv.mu.Unlock()
	now := rv.cfg.Now()
	n := 0
	for _, t := range rv.tickets {
		if !t.gone && now.Before(t.expires) {
			n++
		}
	}
	return n
}

// Sweep expires and forgets old tickets. It also runs opportunistically.
func (rv *Rendezvous) Sweep() {
	rv.mu.Lock()
	defer rv.mu.Unlock()
	rv.sweepLocked(true)
}

func (rv *Rendezvous) sweepLocked(force bool) {
	now := rv.cfg.Now()
	if !force && now.Sub(rv.lastSweep) < 30*time.Second {
		return
	}
	rv.lastSweep = now
	for k, t := range rv.tickets {
		if !t.gone && !now.Before(t.expires) {
			t.goneLocked(now)
		}
		if t.gone && now.Sub(t.goneAt) > rv.cfg.TombstoneTTL {
			delete(rv.tickets, k)
		}
	}
}

// Token returns the bearer token to hand to the sandbox. Never log it.
func (t *Ticket) Token() string { return t.token }

// Bind binds an unbound slot ticket to job and resets its expiry.
func (t *Ticket) Bind(job protocol.Job, expires time.Time) error {
	rv := t.rv
	rv.mu.Lock()
	defer rv.mu.Unlock()
	if t.gone || !rv.cfg.Now().Before(t.expires) {
		return ErrTicketGone
	}
	if t.runID != "" {
		return ErrTicketBound
	}
	j := job
	t.job = &j
	t.runID = job.RunID
	t.expires = expires
	return nil
}

// ExpectPeer marks the ticket as awaiting a peer binding: until BindPeer or
// SkipPeer is called, requests with this token wait (bounded by
// PeerBindWait). Call it before the token leaves the process, i.e. before
// creating the machine.
func (t *Ticket) ExpectPeer() {
	t.rv.mu.Lock()
	defer t.rv.mu.Unlock()
	if t.peerState == peerAny && !t.gone {
		t.peerState = peerPending
		t.peerReady = make(chan struct{})
	}
}

// BindPeer restricts the ticket to requests from ip (the machine's private
// address). An invalid ip behaves like SkipPeer. It reports whether the
// binding was applied (false if already bound or gone).
func (t *Ticket) BindPeer(ip netip.Addr) bool {
	if !ip.IsValid() {
		t.SkipPeer()
		return false
	}
	t.rv.mu.Lock()
	defer t.rv.mu.Unlock()
	if t.gone || t.peerState == peerBound {
		return false
	}
	t.peer = ip.WithZone("").Unmap()
	t.peerState = peerBound
	t.peerReadyLocked()
	return true
}

// SkipPeer resolves a pending binding to "no binding" (fallback when the
// machine's address is unknown). A bound ticket stays bound.
func (t *Ticket) SkipPeer() {
	t.rv.mu.Lock()
	defer t.rv.mu.Unlock()
	if t.peerState == peerPending {
		t.peerState = peerAny
		t.peerReadyLocked()
	}
}

func (t *Ticket) peerReadyLocked() {
	if t.peerReady != nil {
		close(t.peerReady)
		t.peerReady = nil
	}
}

// Fetched reports whether the job was fetched (diagnostics).
func (t *Ticket) Fetched() bool {
	t.rv.mu.Lock()
	defer t.rv.mu.Unlock()
	return t.fetched
}

// Wait blocks until the grader posted a result, the ticket was revoked or
// expired, or ctx is done. Call it before Revoke.
func (t *Ticket) Wait(ctx context.Context) (*protocol.Result, error) {
	rv := t.rv
	rv.mu.Lock()
	if t.runID == "" {
		rv.mu.Unlock()
		return nil, ErrTicketNotBound
	}
	remaining := t.expires.Sub(rv.cfg.Now())
	rv.mu.Unlock()
	timer := time.NewTimer(max(remaining, 0))
	defer timer.Stop()
	select {
	case <-t.done:
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-timer.C:
		rv.mu.Lock()
		if !t.doneOnce {
			t.goneLocked(rv.cfg.Now())
		}
		rv.mu.Unlock()
	}
	rv.mu.Lock()
	defer rv.mu.Unlock()
	if t.result != nil {
		return t.result, nil
	}
	return nil, ErrTicketGone
}

// Revoke invalidates the token (idempotent). Later requests get 410.
func (t *Ticket) Revoke() {
	t.rv.mu.Lock()
	defer t.rv.mu.Unlock()
	t.goneLocked(t.rv.cfg.Now())
	t.result = nil
}

func (t *Ticket) goneLocked(now time.Time) {
	if t.gone {
		return
	}
	t.gone = true
	t.goneAt = now
	t.job = nil
	t.closeLocked()
	t.peerReadyLocked() // wake requests waiting for a bind; they then see 410
}

func (t *Ticket) closeLocked() {
	if !t.doneOnce {
		t.doneOnce = true
		close(t.done)
	}
}

// ---------------------------------------------------------------- handler

// Handler returns the internal HTTP handler (/internal/job, /internal/result).
func (rv *Rendezvous) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/internal/job", rv.serveJob)
	mux.HandleFunc("/internal/result", rv.serveResult)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if !rv.cfg.AllowRequest(r) {
			rv.log.Warn("internal endpoint: request from disallowed peer", "remote", r.RemoteAddr, "path", r.URL.Path)
			http.NotFound(w, r)
			return
		}
		mux.ServeHTTP(w, r)
	})
}

func bearer(r *http.Request) (string, bool) {
	h := r.Header.Get("Authorization")
	const p = "Bearer "
	if len(h) <= len(p) || !strings.EqualFold(h[:len(p)], p) {
		return "", false
	}
	tok := strings.TrimSpace(h[len(p):])
	if len(tok) < 16 || len(tok) > 128 {
		return "", false
	}
	return tok, true
}

func status(w http.ResponseWriter, code int) {
	http.Error(w, http.StatusText(code), code)
}

// lookupLocked returns the ticket and the HTTP status to answer when it
// cannot be used (0 means usable).
func (rv *Rendezvous) lookupLocked(tok string) (*Ticket, int) {
	t := rv.tickets[sha256.Sum256([]byte(tok))]
	if t == nil {
		return nil, http.StatusNotFound
	}
	now := rv.cfg.Now()
	if !t.gone && !now.Before(t.expires) {
		t.goneLocked(now)
	}
	if t.gone {
		return t, http.StatusGone
	}
	if t.runID == "" {
		return t, http.StatusNotFound
	}
	return t, 0
}

// remoteIP is the TCP peer address of r (zone stripped, IPv4-mapped
// unmapped), or the zero Addr.
func remoteIP(r *http.Request) netip.Addr {
	if ap, err := netip.ParseAddrPort(r.RemoteAddr); err == nil {
		return ap.Addr().WithZone("").Unmap()
	}
	if ip, err := netip.ParseAddr(r.RemoteAddr); err == nil {
		return ip.WithZone("").Unmap()
	}
	return netip.Addr{}
}

// lookupPeerLocked is lookupLocked plus the peer-binding check. It is called
// with rv.mu held and returns with it held, but may release it while waiting
// (bounded by PeerBindWait and the request context) for a pending binding.
// A peer mismatch or a binding that never arrives answers 404, the same as
// an unknown token.
func (rv *Rendezvous) lookupPeerLocked(r *http.Request, tok string) (*Ticket, int) {
	t, code := rv.lookupLocked(tok)
	if code == 0 && t.peerState == peerPending {
		ready := t.peerReady
		rv.mu.Unlock()
		timer := time.NewTimer(rv.cfg.PeerBindWait)
		select {
		case <-ready:
		case <-timer.C:
		case <-r.Context().Done():
		}
		timer.Stop()
		rv.mu.Lock()
		if t, code = rv.lookupLocked(tok); code == 0 && t.peerState == peerPending {
			rv.log.Warn("internal endpoint: peer binding did not arrive in time", "run", LogID(t.runID), "path", r.URL.Path)
			return t, http.StatusNotFound
		}
	}
	// Checked for revoked tickets too, so the wrong peer cannot even learn
	// whether a token is still live.
	if t != nil && t.peerState == peerBound && remoteIP(r) != t.peer {
		rv.log.Warn("internal endpoint: token presented from the wrong peer", "run", LogID(t.runID),
			"remote", r.RemoteAddr, "path", r.URL.Path)
		return t, http.StatusNotFound
	}
	return t, code
}

func (rv *Rendezvous) serveJob(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		status(w, http.StatusMethodNotAllowed)
		return
	}
	tok, ok := bearer(r)
	if !ok {
		status(w, http.StatusUnauthorized)
		return
	}
	rv.mu.Lock()
	t, code := rv.lookupPeerLocked(r, tok)
	if code == 0 && t.fetched {
		code = http.StatusGone
	}
	if code != 0 {
		rv.mu.Unlock()
		status(w, code)
		return
	}
	body, err := json.Marshal(t.job)
	if err != nil {
		rv.mu.Unlock()
		status(w, http.StatusInternalServerError)
		return
	}
	t.fetched = true
	t.job = nil // drop the submission from memory as soon as it was handed out
	runID := t.runID
	rv.mu.Unlock()

	rv.log.Info("internal: job fetched", "run", LogID(runID))
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(body)
}

func (rv *Rendezvous) serveResult(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		status(w, http.StatusMethodNotAllowed)
		return
	}
	tok, ok := bearer(r)
	if !ok {
		status(w, http.StatusUnauthorized)
		return
	}
	// Authenticate before reading the body.
	check := func() (*Ticket, int) {
		t, code := rv.lookupPeerLocked(r, tok)
		if code != 0 {
			return t, code
		}
		if t.resulted {
			return t, http.StatusGone
		}
		if !t.fetched {
			return t, http.StatusConflict
		}
		return t, 0
	}
	rv.mu.Lock()
	_, code := check()
	rv.mu.Unlock()
	if code != 0 {
		status(w, code)
		return
	}

	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, rv.cfg.MaxResultBytes))
	if err != nil {
		var mbe *http.MaxBytesError
		if errors.As(err, &mbe) {
			status(w, http.StatusRequestEntityTooLarge)
			return
		}
		status(w, http.StatusBadRequest)
		return
	}
	var res protocol.Result
	dec := json.NewDecoder(bytes.NewReader(body))
	if err := dec.Decode(&res); err != nil || dec.More() {
		status(w, http.StatusBadRequest)
		return
	}

	rv.mu.Lock()
	t, code := check()
	if code == 0 && res.RunID != t.runID {
		code = http.StatusBadRequest
	}
	if code != 0 {
		rv.mu.Unlock()
		status(w, code)
		return
	}
	t.resulted = true
	t.result = &res
	t.closeLocked()
	runID := t.runID
	rv.mu.Unlock()

	rv.log.Info("internal: result received", "run", LogID(runID), "bytes", len(body))
	w.WriteHeader(http.StatusNoContent)
}
