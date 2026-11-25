package github

import (
	"container/list"
	"sync"
	"time"
)

// ------------------------------------------------------------------ LRU set

// lru is a bounded set of recently seen keys.
type lru struct {
	mu  sync.Mutex
	cap int
	ll  *list.List
	m   map[string]*list.Element
}

func newLRU(capacity int) *lru {
	return &lru{cap: capacity, ll: list.New(), m: make(map[string]*list.Element, capacity)}
}

// seenOrAdd reports whether k was already present; it records k either way.
func (l *lru) seenOrAdd(k string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if e, ok := l.m[k]; ok {
		l.ll.MoveToFront(e)
		return true
	}
	l.m[k] = l.ll.PushFront(k)
	for l.ll.Len() > l.cap {
		old := l.ll.Back()
		l.ll.Remove(old)
		delete(l.m, old.Value.(string))
	}
	return false
}

// forget removes k (used when a push was accepted but could not be graded, so
// a redelivery may try again).
func (l *lru) forget(k string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if e, ok := l.m[k]; ok {
		l.ll.Remove(e)
		delete(l.m, k)
	}
}

// ------------------------------------------------------------- token bucket

type bucket struct {
	tokens float64
	last   time.Time
}

// buckets is a token bucket per installation.
type buckets struct {
	mu     sync.Mutex
	burst  float64
	refill time.Duration
	m      map[int64]*bucket
}

const maxBuckets = 10000

func newBuckets(burst int, refill time.Duration) *buckets {
	return &buckets{burst: float64(burst), refill: refill, m: make(map[int64]*bucket)}
}

func (b *buckets) fill(bk *bucket, now time.Time) {
	if el := now.Sub(bk.last); el > 0 {
		bk.tokens += float64(el) / float64(b.refill)
		if bk.tokens > b.burst {
			bk.tokens = b.burst
		}
		bk.last = now
	}
}

func (b *buckets) allow(id int64, now time.Time) bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	bk, ok := b.m[id]
	if !ok {
		if len(b.m) >= maxBuckets {
			for k, v := range b.m { // drop buckets that have refilled completely
				b.fill(v, now)
				if v.tokens >= b.burst {
					delete(b.m, k)
				}
			}
			if len(b.m) >= maxBuckets {
				return false
			}
		}
		bk = &bucket{tokens: b.burst, last: now}
		b.m[id] = bk
	}
	b.fill(bk, now)
	if bk.tokens < 1 {
		return false
	}
	bk.tokens--
	return true
}

// ---------------------------------------------------------------- scheduler

// scheduler serialises grading per repository (one in flight per repo) with
// newest-wins coalescing per branch, and bounds the total accepted backlog.
type scheduler struct {
	mu        sync.Mutex
	maxQueued int
	perRepo   int
	queued    int // accepted and not finished: running + pending
	repos     map[int64]*repoState
}

type repoState struct {
	running bool
	pending []*pushJob
}

type enqueueResult struct {
	start     bool     // caller starts a worker for this repo with the job
	overflow  bool     // not accepted: global backlog full
	displaced *pushJob // a pending job that will not run (superseded/evicted)
	reason    string   // why displaced
}

func newScheduler(maxQueued, perRepo int) *scheduler {
	return &scheduler{maxQueued: maxQueued, perRepo: perRepo, repos: make(map[int64]*repoState)}
}

func (s *scheduler) enqueue(j *pushJob) enqueueResult {
	s.mu.Lock()
	defer s.mu.Unlock()
	rs := s.repos[j.repoID]
	if rs != nil {
		for i, p := range rs.pending {
			if p.ref == j.ref { // newest wins: replace the queued older push in place
				rs.pending[i] = j
				return enqueueResult{displaced: p, reason: "superseded"}
			}
		}
	}
	if s.queued >= s.maxQueued {
		return enqueueResult{overflow: true}
	}
	if rs == nil {
		rs = &repoState{}
		s.repos[j.repoID] = rs
	}
	if !rs.running {
		rs.running = true
		s.queued++
		return enqueueResult{start: true}
	}
	var res enqueueResult
	if len(rs.pending) >= s.perRepo {
		res.displaced, res.reason = rs.pending[0], "evicted"
		rs.pending = rs.pending[1:]
		s.queued--
	}
	rs.pending = append(rs.pending, j)
	s.queued++
	return res
}

// done marks the running job of repo finished and returns the next pending job
// (the worker keeps running) or nil (the worker exits). With abandon, all
// pending jobs are dropped and returned for logging.
func (s *scheduler) done(repoID int64, abandon bool) (next *pushJob, dropped []*pushJob) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.queued--
	rs := s.repos[repoID]
	if rs == nil {
		return nil, nil
	}
	if abandon || len(rs.pending) == 0 {
		dropped = rs.pending
		s.queued -= len(dropped)
		delete(s.repos, repoID)
		return nil, dropped
	}
	next = rs.pending[0]
	rs.pending = rs.pending[1:]
	return next, nil
}
