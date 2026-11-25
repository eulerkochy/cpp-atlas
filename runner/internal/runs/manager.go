package runs

import (
	"container/list"
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"slices"
	"sync"
	"time"

	"cppatlas.com/runner/internal/protocol"
)

// Manager implements protocol.Runner.
type Manager struct {
	cfg        Config
	backend    Backend
	log        *slog.Logger
	challenges map[string]protocol.ChallengeSpec
	rv         *Rendezvous

	mu        sync.Mutex
	runs      map[string]*run
	finished  *list.List // *run, oldest finished at the front
	perClient map[string]int
	perSource map[string]int // waiting (not yet dequeued) runs per Source
	stored    int64          // summed size of finished runs
	global    tokenBucket
	queue     chan *run
	enqSeq    uint64
	deqSeq    uint64
	running   int
	closed    bool

	ctx    context.Context // cancelled by Shutdown; parent of every run context
	cancel context.CancelFunc
	wg     sync.WaitGroup
	stop   chan struct{}
}

type run struct {
	view      protocol.RunView
	job       *protocol.Job // nil once terminal: the submission is dropped
	clientKey string
	source    string
	waiting   bool // counted in perSource
	size      int64
	seq       uint64
	done      chan struct{}
	elem      *list.Element
}

// Stats is a snapshot for /healthz.
type Stats struct {
	Backend       string `json:"backend"`
	Queued        int    `json:"queued"`
	Running       int    `json:"running"`
	QueueSize     int    `json:"queue_size"`
	MaxConcurrent int    `json:"max_concurrent"`
	Stored        int    `json:"stored"`
	StoredBytes   int64  `json:"stored_bytes"`
	QueuedWeb     int    `json:"queued_web"`
	QueuedGitHub  int    `json:"queued_github"`
	ShuttingDown  bool   `json:"shutting_down,omitempty"`
}

var _ protocol.Runner = (*Manager)(nil)

// NewManager starts MaxConcurrent workers and the eviction sweeper. It
// panics if cfg.Challenges is invalid (call ValidateChallenges / use
// LoadChallenges first to get an error instead).
func NewManager(cfg Config, backend Backend, logger *slog.Logger) *Manager {
	cfg = cfg.withDefaults()
	if err := ValidateChallenges(cfg.Challenges); err != nil {
		panic("runs.NewManager: " + err.Error())
	}
	if backend == nil {
		panic("runs.NewManager: nil backend")
	}
	if logger == nil {
		logger = slog.Default()
	}
	rv := cfg.Rendezvous
	if rv == nil {
		rv = NewRendezvous(RendezvousConfig{}, logger)
	}
	ctx, cancel := context.WithCancel(context.Background())
	m := &Manager{
		cfg:        cfg,
		backend:    backend,
		log:        logger,
		challenges: map[string]protocol.ChallengeSpec{},
		rv:         rv,
		runs:       map[string]*run{},
		finished:   list.New(),
		perClient:  map[string]int{},
		perSource:  map[string]int{},
		global:     newTokenBucket(cfg.GlobalRunsPer10Min/600, cfg.GlobalRunsBurst, cfg.Now()),
		queue:      make(chan *run, cfg.QueueSize),
		ctx:        ctx,
		cancel:     cancel,
		stop:       make(chan struct{}),
	}
	for _, s := range cfg.Challenges {
		s.AllowedFiles = slices.Clone(s.AllowedFiles)
		s.RequiredFiles = slices.Clone(s.RequiredFiles)
		m.challenges[s.Name] = s
	}
	for range cfg.MaxConcurrent {
		m.wg.Add(1)
		go m.worker()
	}
	go m.sweeper()
	return m
}

// Rendezvous returns the token registry (shared with the Fly backend).
func (m *Manager) Rendezvous() *Rendezvous { return m.rv }

// InternalHandler serves /internal/job and /internal/result. Mount it only
// on the private listener.
func (m *Manager) InternalHandler() http.Handler { return m.rv.Handler() }

// Challenge implements protocol.Runner.
func (m *Manager) Challenge(name string) (protocol.ChallengeSpec, bool) {
	s, ok := m.challenges[name]
	if ok {
		s.AllowedFiles = slices.Clone(s.AllowedFiles)
		s.RequiredFiles = slices.Clone(s.RequiredFiles)
	}
	return s, ok
}

// LogID shortens a run id for logs (the full id is a read capability).
func LogID(id string) string {
	if len(id) > 8 {
		return id[:8]
	}
	return id
}

func newRunID() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b[:]), nil
}

// Submit implements protocol.Runner. Errors: *protocol.ValidationError,
// protocol.ErrQueueFull, ErrTooManyRuns, ErrShuttingDown, or ctx.Err().
func (m *Manager) Submit(ctx context.Context, s protocol.Submission) (protocol.RunView, error) {
	if err := ctx.Err(); err != nil {
		return protocol.RunView{}, err
	}
	spec, stages, opts, err := m.validate(s)
	if err != nil {
		return protocol.RunView{}, err
	}
	id, err := newRunID()
	if err != nil {
		return protocol.RunView{}, fmt.Errorf("run id: %w", err)
	}
	files := make(map[string]string, len(s.Files))
	total := 0
	for k, v := range s.Files {
		files[k] = v
		total += len(v)
	}
	r := &run{
		view: protocol.RunView{
			ID:        id,
			Status:    protocol.RunQueued,
			Challenge: spec.Name,
			Stages:    stages,
			CreatedAt: m.cfg.Now().UTC(),
		},
		job: &protocol.Job{
			RunID:      id,
			Challenge:  spec.Name,
			Stages:     slices.Clone(stages),
			StopOnFail: s.StopOnFail,
			Files:      files,
			Options:    opts,
			Limits:     m.cfg.Limits,
		},
		clientKey: s.ClientKey,
		source:    s.Source,
		done:      make(chan struct{}),
	}

	m.mu.Lock()
	if m.closed {
		m.mu.Unlock()
		return protocol.RunView{}, ErrShuttingDown
	}
	if r.clientKey != "" && m.cfg.MaxPerClient > 0 && m.perClient[r.clientKey] >= m.cfg.MaxPerClient {
		m.mu.Unlock()
		m.log.Info("run rejected: too many unfinished runs", "client", s.ClientKey, "source", s.Source)
		return protocol.RunView{}, ErrTooManyRuns
	}
	if m.perSource[r.source] >= m.sourceCap(r.source) {
		m.mu.Unlock()
		m.log.Warn("run rejected: source queue share full", "client", s.ClientKey, "source", s.Source)
		return protocol.RunView{}, protocol.ErrQueueFull
	}
	now := m.cfg.Now()
	if !m.global.available(now) {
		m.mu.Unlock()
		m.log.Warn("run rejected: global run rate exhausted", "client", s.ClientKey, "source", s.Source)
		return protocol.RunView{}, ErrGlobalRate
	}
	r.seq = m.enqSeq + 1
	select {
	case m.queue <- r:
	default:
		m.mu.Unlock()
		m.log.Warn("run rejected: queue full", "client", s.ClientKey, "source", s.Source)
		return protocol.RunView{}, protocol.ErrQueueFull
	}
	m.global.take(now)
	m.enqSeq++
	m.perSource[r.source]++
	r.waiting = true
	m.runs[id] = r
	if r.clientKey != "" {
		m.perClient[r.clientKey]++
	}
	v := m.snapshotLocked(r)
	m.mu.Unlock()

	m.log.Info("run queued", "run", LogID(id), "challenge", spec.Name, "stages", stages,
		"source", s.Source, "client", s.ClientKey, "bytes", total,
		"compiler", opts.Compiler, "preset", opts.Preset, "position", v.QueuePosition)
	return v, nil
}

// Get implements protocol.Runner.
func (m *Manager) Get(id string) (protocol.RunView, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	r := m.lookupLocked(id)
	if r == nil {
		return protocol.RunView{}, false
	}
	return m.snapshotLocked(r), true
}

// Wait implements protocol.Runner.
func (m *Manager) Wait(ctx context.Context, id string) (protocol.RunView, error) {
	m.mu.Lock()
	r := m.lookupLocked(id)
	m.mu.Unlock()
	if r == nil {
		return protocol.RunView{}, protocol.ErrNotFound
	}
	var err error
	select {
	case <-r.done:
	case <-ctx.Done():
		err = ctx.Err()
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.snapshotLocked(r), err
}

// Stats returns queue and worker counters.
func (m *Manager) Stats() Stats {
	m.mu.Lock()
	defer m.mu.Unlock()
	return Stats{
		Backend:       m.backend.Name(),
		Queued:        int(m.enqSeq - m.deqSeq),
		Running:       m.running,
		QueueSize:     m.cfg.QueueSize,
		MaxConcurrent: m.cfg.MaxConcurrent,
		Stored:        len(m.runs),
		StoredBytes:   m.stored,
		QueuedWeb:     m.perSource[protocol.SourceWeb],
		QueuedGitHub:  m.perSource[protocol.SourceGitHub],
		ShuttingDown:  m.closed,
	}
}

// Shutdown stops accepting runs, fails queued runs, cancels running ones
// (backends destroy their sandboxes on cancellation) and waits for the
// workers until ctx is done. It is idempotent.
func (m *Manager) Shutdown(ctx context.Context) error {
	m.mu.Lock()
	if !m.closed {
		m.closed = true
		close(m.stop)
	}
drain:
	for {
		select {
		case r := <-m.queue:
			m.deqSeq++
			m.dequeuedLocked(r)
			m.finishLocked(r, protocol.RunFailed, nil, shutdownError(), 0)
		default:
			break drain
		}
	}
	m.mu.Unlock()
	m.cancel()

	done := make(chan struct{})
	go func() { m.wg.Wait(); close(done) }()
	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func shutdownError() *protocol.RunError {
	return &protocol.RunError{Code: CodeShuttingDown, Message: "The runner restarted before your run finished. Please submit again."}
}

func (m *Manager) lookupLocked(id string) *run {
	r := m.runs[id]
	if r == nil {
		return nil
	}
	if r.view.FinishedAt != nil && m.cfg.Now().Sub(*r.view.FinishedAt) >= m.cfg.ResultTTL {
		m.removeLocked(r)
		return nil
	}
	return r
}

func (m *Manager) removeLocked(r *run) {
	delete(m.runs, r.view.ID)
	if r.elem != nil {
		m.finished.Remove(r.elem)
		r.elem = nil
		m.stored -= r.size
	}
}

// sourceCap is how many waiting slots runs of source may hold.
func (m *Manager) sourceCap(source string) int {
	switch source {
	case protocol.SourceWeb:
		return m.cfg.MaxQueuedWeb
	case protocol.SourceGitHub:
		return m.cfg.MaxQueuedGitHub
	}
	return m.cfg.QueueSize
}

// dequeuedLocked releases r's waiting slot in its source's share.
func (m *Manager) dequeuedLocked(r *run) {
	if !r.waiting {
		return
	}
	r.waiting = false
	if m.perSource[r.source]--; m.perSource[r.source] <= 0 {
		delete(m.perSource, r.source)
	}
}

func (m *Manager) snapshotLocked(r *run) protocol.RunView {
	v := r.view
	v.Stages = slices.Clone(v.Stages)
	if v.Status == protocol.RunQueued {
		v.QueuePosition = int(r.seq - m.deqSeq)
	}
	// Result and Error are never mutated after being stored; sharing the
	// pointers is safe as long as callers treat them as read-only.
	return v
}

// finishLocked makes r terminal. resSize is the encoded size of res
// (computed by the caller outside the lock); errors are small and counted
// here.
func (m *Manager) finishLocked(r *run, status string, res *protocol.Result, rerr *protocol.RunError, resSize int) {
	if r.view.Terminal() {
		return
	}
	now := m.cfg.Now().UTC()
	r.view.Status = status
	r.view.Result = res
	r.view.Error = rerr
	r.view.FinishedAt = &now
	r.job = nil
	if r.clientKey != "" {
		if m.perClient[r.clientKey]--; m.perClient[r.clientKey] <= 0 {
			delete(m.perClient, r.clientKey)
		}
	}
	r.size = int64(storedOverhead + resSize)
	if rerr != nil {
		r.size += int64(len(rerr.Code) + len(rerr.Message))
	}
	r.elem = m.finished.PushBack(r)
	m.stored += r.size
	close(r.done)
	// Evict oldest first; always keep the run that just finished.
	for m.finished.Len() > 1 && (m.finished.Len() > m.cfg.MaxStoredRuns || m.stored > m.cfg.MaxStoredBytes) {
		m.removeLocked(m.finished.Front().Value.(*run))
	}
}

func (m *Manager) sweeper() {
	t := time.NewTicker(30 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-m.stop:
			return
		case <-t.C:
			m.evictExpired()
			m.rv.Sweep()
		}
	}
}

func (m *Manager) evictExpired() {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := m.cfg.Now()
	for e := m.finished.Front(); e != nil; {
		r := e.Value.(*run)
		if now.Sub(*r.view.FinishedAt) < m.cfg.ResultTTL {
			break
		}
		e = e.Next()
		m.removeLocked(r)
	}
}

func (m *Manager) worker() {
	defer m.wg.Done()
	for {
		select {
		case <-m.ctx.Done():
			return
		case r := <-m.queue:
			m.mu.Lock()
			m.deqSeq++
			m.dequeuedLocked(r)
			if r.view.Terminal() {
				m.mu.Unlock()
				continue
			}
			if m.ctx.Err() != nil {
				m.finishLocked(r, protocol.RunFailed, nil, shutdownError(), 0)
				m.mu.Unlock()
				return
			}
			now := m.cfg.Now().UTC()
			r.view.Status = protocol.RunRunning
			r.view.StartedAt = &now
			job := *r.job
			m.running++
			m.mu.Unlock()

			m.execute(r, job)
		}
	}
}

func (m *Manager) execute(r *run, job protocol.Job) {
	id := r.view.ID
	log := m.log.With("run", LogID(id), "backend", m.backend.Name())
	log.Info("run started")
	started := time.Now()

	ctx, cancel := context.WithTimeout(m.ctx, m.cfg.RunTimeout)
	res, err := m.runBackend(ctx, job)
	timedOut := errors.Is(ctx.Err(), context.DeadlineExceeded)
	cancel()
	shutdown := m.ctx.Err() != nil
	job.Files = nil

	status := protocol.RunCompleted
	var stored *protocol.Result
	var storedSize int
	var rerr *protocol.RunError
	switch {
	case err == nil && res != nil:
		clean, size, serr := sanitizeResult(res, id, job.Challenge, job.Stages, job.Limits, m.cfg.MaxResultBytes)
		if serr != nil {
			log.Error("run failed: bad result from grader", "err", serr)
			status, rerr = protocol.RunFailed, &protocol.RunError{Code: CodeBadResult,
				Message: "The code runner returned an unreadable result. This is not a problem with your code; please try again."}
			break
		}
		stored, storedSize = clean, size
		if clean.Status == protocol.ResultError {
			status, rerr = protocol.RunFailed, clean.Error
			log.Warn("run failed: grader reported an error", "code", clean.Error.Code)
		}
	case timedOut:
		status = protocol.RunTimeout
		rerr = &protocol.RunError{Code: CodeTimeout, Message: fmt.Sprintf(
			"Your run took longer than %s in total and was stopped. Look for infinite loops or very slow code, or run fewer stages at once.",
			m.cfg.RunTimeout.Round(time.Second))}
		log.Warn("run timed out", "err", err)
	case shutdown:
		status, rerr = protocol.RunFailed, shutdownError()
		log.Warn("run aborted by shutdown", "err", err)
	default:
		if err == nil {
			err = errors.New("backend returned neither result nor error")
		}
		var be *BackendError
		if errors.As(err, &be) {
			rerr = &protocol.RunError{Code: be.Code, Message: be.Message}
		} else {
			rerr = &protocol.RunError{Code: CodeInternal,
				Message: "The code runner failed while running your submission. This is not a problem with your code; please try again."}
		}
		status = protocol.RunFailed
		log.Error("run failed: backend error", "code", rerr.Code, "err", err)
	}

	m.mu.Lock()
	m.running--
	m.finishLocked(r, status, stored, rerr, storedSize)
	m.mu.Unlock()
	log.Info("run finished", "status", status, "passed", stored != nil && stored.Passed,
		"elapsed_ms", time.Since(started).Milliseconds())
}

// storedOverhead approximates the per-run bookkeeping (view, ids, list
// element) so that many tiny results still count against MaxStoredBytes.
const storedOverhead = 512

// tokenBucket is a simple continuous-refill bucket (guarded by Manager.mu).
// A nil-rate bucket (rate <= 0) always allows.
type tokenBucket struct {
	rate   float64 // tokens per second; <= 0 disables
	burst  float64
	tokens float64
	last   time.Time
}

func newTokenBucket(perSec float64, burst int, now time.Time) tokenBucket {
	return tokenBucket{rate: perSec, burst: float64(burst), tokens: float64(burst), last: now}
}

func (b *tokenBucket) refill(now time.Time) {
	if el := now.Sub(b.last).Seconds(); el > 0 {
		b.tokens = min(b.burst, b.tokens+el*b.rate)
		b.last = now
	}
}

func (b *tokenBucket) available(now time.Time) bool {
	if b.rate <= 0 {
		return true
	}
	b.refill(now)
	return b.tokens >= 1
}

func (b *tokenBucket) take(now time.Time) {
	if b.rate <= 0 {
		return
	}
	b.refill(now)
	b.tokens--
}

func (m *Manager) runBackend(ctx context.Context, job protocol.Job) (res *protocol.Result, err error) {
	defer func() {
		if p := recover(); p != nil {
			res, err = nil, fmt.Errorf("backend panic: %v", p)
		}
	}()
	return m.backend.Run(ctx, job)
}
