package grader

import (
	"sync"
	"testing"
	"time"

	"cppatlas.com/runner/internal/protocol"
)

// The deadline/cancel Result must win even though killing the sandbox makes
// the grading goroutine finish (and try to emit) while it is being sent.
func TestEmitAfterWinsOverConcurrentEmit(t *testing.T) {
	var mu sync.Mutex
	var got []string
	e := newEmitter(func(r *protocol.Result) { mu.Lock(); got = append(got, r.RunID); mu.Unlock() })
	lost := make(chan bool, 1)
	e.emitAfter(&protocol.Result{RunID: "deadline"}, func() {
		go func() { lost <- !e.emit(&protocol.Result{RunID: "graded"}) }()
		time.Sleep(20 * time.Millisecond)
	})
	if !<-lost {
		t.Error("the concurrent emit was delivered")
	}
	<-e.done
	mu.Lock()
	defer mu.Unlock()
	if len(got) != 1 || got[0] != "deadline" {
		t.Fatalf("delivered %v", got)
	}
}
