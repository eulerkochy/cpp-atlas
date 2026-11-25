package httpapi

import (
	"math"
	"net/netip"
	"sync"
	"time"
)

// Limit is a token-bucket budget: PerMinute tokens refill continuously, up to
// Burst. PerMinute < 0 disables the limiter; zero means "use the default".
type Limit struct {
	PerMinute float64
	Burst     int
}

type bucket struct {
	tokens float64
	last   time.Time
}

// limiter is a per-key token bucket with bounded memory. It starts no
// goroutine: idle buckets are swept lazily (at most once per sweepEvery, and
// whenever the map is full), so there is nothing to leak or shut down.
type limiter struct {
	mu        sync.Mutex
	rate      float64 // tokens per second
	burst     float64
	max       int
	now       func() time.Time
	buckets   map[string]*bucket
	lastSweep time.Time
}

const sweepEvery = time.Minute

func newLimiter(l Limit, max int, now func() time.Time) *limiter {
	if l.PerMinute < 0 {
		return nil
	}
	return &limiter{
		rate:    l.PerMinute / 60,
		burst:   float64(l.Burst),
		max:     max,
		now:     now,
		buckets: make(map[string]*bucket),
	}
}

// allow consumes one token for key. When it refuses, retry is how long until a
// token is available.
func (l *limiter) allow(key string) (ok bool, retry time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	if now.Sub(l.lastSweep) >= sweepEvery {
		l.sweep(now)
	}
	b := l.buckets[key]
	if b == nil {
		if len(l.buckets) >= l.max {
			l.sweep(now)
			if len(l.buckets) >= l.max {
				l.evictOldest()
			}
		}
		b = &bucket{tokens: l.burst, last: now}
		l.buckets[key] = b
	} else if el := now.Sub(b.last).Seconds(); el > 0 {
		b.tokens = math.Min(l.burst, b.tokens+el*l.rate)
		b.last = now
	}
	if b.tokens >= 1 {
		b.tokens--
		return true, 0
	}
	wait := (1 - b.tokens) / l.rate
	return false, time.Duration(math.Ceil(wait*1000)) * time.Millisecond
}

// sweep drops buckets that have refilled completely: forgetting them is
// indistinguishable from keeping them.
func (l *limiter) sweep(now time.Time) {
	l.lastSweep = now
	for k, b := range l.buckets {
		if b.tokens+now.Sub(b.last).Seconds()*l.rate >= l.burst {
			delete(l.buckets, k)
		}
	}
}

// evictOldest is the last resort when every bucket is still active (a flood
// from more than max distinct clients): drop the least recently seen.
func (l *limiter) evictOldest() {
	var oldest string
	var t time.Time
	first := true
	for k, b := range l.buckets {
		if first || b.last.Before(t) {
			oldest, t, first = k, b.last, false
		}
	}
	delete(l.buckets, oldest)
}

func (l *limiter) size() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.buckets)
}

// ClientKey maps a client address to the key used for every per-client
// budget: the rate-limit buckets, the long-poll waiter cap and the
// run manager's per-client run cap (Submission.ClientKey). IPv6 clients
// usually get a whole /64, so keying on the full address would let one host
// mint unlimited keys by rotating addresses; key on the /64 instead.
func ClientKey(ip netip.Addr) string {
	ip = ip.Unmap()
	if ip.Is6() {
		p, _ := ip.Prefix(64)
		return p.String()
	}
	return ip.String()
}
