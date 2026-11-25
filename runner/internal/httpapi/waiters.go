package httpapi

import (
	"context"
	"sync"
)

// waiters counts held long-polls per client key and in total. A negative
// cap means unlimited.
type waiters struct {
	perClient, total int

	mu    sync.Mutex
	n     int
	byKey map[string]int

	drainCtx context.Context // done once draining
	drain    context.CancelFunc
}

func newWaiters(perClient, total int) *waiters {
	ctx, cancel := context.WithCancel(context.Background())
	return &waiters{perClient: perClient, total: total, byKey: map[string]int{}, drainCtx: ctx, drain: cancel}
}

// acquire reserves a waiter slot for key. ok is false when a cap is reached
// or the API is draining; otherwise release must be called exactly once.
func (w *waiters) acquire(key string) (release func(), ok bool) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.drainCtx.Err() != nil ||
		(w.total >= 0 && w.n >= w.total) ||
		(w.perClient >= 0 && w.byKey[key] >= w.perClient) {
		return nil, false
	}
	w.n++
	w.byKey[key]++
	var once sync.Once
	return func() {
		once.Do(func() {
			w.mu.Lock()
			defer w.mu.Unlock()
			w.n--
			if w.byKey[key]--; w.byKey[key] <= 0 {
				delete(w.byKey, key)
			}
		})
	}, true
}

// counts returns the total and per-key numbers of held waiters (tests, stats).
func (w *waiters) counts(key string) (total, forKey int) {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.n, w.byKey[key]
}
