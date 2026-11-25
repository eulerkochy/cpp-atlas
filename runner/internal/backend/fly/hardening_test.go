package fly

import (
	"context"
	"errors"
	"slices"
	"testing"
	"time"

	"cppatlas.com/runner/internal/runs"
)

func (f *fakeFly) codes() []int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return slices.Clone(f.jobCodes)
}

func TestDefaultsWarmMaxAge(t *testing.T) {
	c := Config{}.withDefaults()
	if c.WarmMaxAge != time.Hour || c.DisablePeerBinding {
		t.Fatalf("%+v", c)
	}
}

// The fake grader connects from 127.0.0.1, which is the default private_ip.
func TestPeerBindingCorrectPeer(t *testing.T) {
	e := setup(t, nil)
	res, err := e.b.Run(context.Background(), job())
	if err != nil || !res.Passed {
		t.Fatalf("%v %+v", err, res)
	}
	if c := e.f.codes(); !slices.Equal(c, []int{200}) {
		t.Fatalf("job codes %v", c)
	}
}

func TestPeerBindingWrongPeerRejected(t *testing.T) {
	e := setup(t, nil)
	e.f.privateIP = "fdaa:0:1:a7b:1::2" // the token belongs to another machine's address
	_, err := e.b.Run(context.Background(), job())
	var be *runs.BackendError
	if !errors.As(err, &be) || be.Code != runs.CodeGraderExited {
		t.Fatalf("err %v", err)
	}
	if c := e.f.codes(); !slices.Equal(c, []int{404}) {
		t.Fatalf("job codes %v", c)
	}
}

func TestPeerBindingRaceFetchBeforeCreateResponse(t *testing.T) {
	e := setup(t, nil)
	e.f.createDelay = 300 * time.Millisecond // grader fetches long before the create answer
	res, err := e.b.Run(context.Background(), job())
	if err != nil || !res.Passed {
		t.Fatalf("%v %+v", err, res)
	}
	if c := e.f.codes(); !slices.Equal(c, []int{200}) {
		t.Fatalf("job codes %v", c)
	}
}

func TestPeerBindingMissingPrivateIPFallsBack(t *testing.T) {
	for _, ip := range []string{"", "not-an-ip", "::"} {
		t.Run(ip, func(t *testing.T) {
			e := setup(t, nil)
			e.f.privateIP = ip
			res, err := e.b.Run(context.Background(), job())
			if err != nil || !res.Passed {
				t.Fatalf("%v %+v", err, res)
			}
		})
	}
}

func TestPeerBindingDisabled(t *testing.T) {
	e := setup(t, func(c *Config) { c.DisablePeerBinding = true })
	e.f.privateIP = "fdaa::99"
	res, err := e.b.Run(context.Background(), job())
	if err != nil || !res.Passed {
		t.Fatalf("%v %+v", err, res)
	}
}

func TestWarmSlotPeerBound(t *testing.T) {
	e := setup(t, func(c *Config) { c.WarmPoolSize = 1; c.WarmRefillInterval = time.Hour })
	e.f.privateIP = "fdaa::42"
	e.b.Start()
	eventually(t, "pool fill", func() bool { return e.b.PoolSize() == 1 })
	_, err := e.b.Run(context.Background(), job())
	var be *runs.BackendError
	if !errors.As(err, &be) || be.Code != runs.CodeGraderExited {
		t.Fatalf("err %v", err)
	}
	if e.f.callsWith("/start") != 1 || !slices.Equal(e.f.codes(), []int{404}) {
		t.Fatalf("start %d codes %v", e.f.callsWith("/start"), e.f.codes())
	}
}

// A create answered with 5xx that was in fact applied: the machine is found
// by name and adopted, not duplicated.
func TestCreateAppliedThen5xxAdopts(t *testing.T) {
	e := setup(t, nil)
	e.f.applyThenFail = 1
	e.f.createStatus = 502
	res, err := e.b.Run(context.Background(), job())
	if err != nil || !res.Passed {
		t.Fatalf("%v %+v", err, res)
	}
	if n := e.f.callsWith("POST /v1/apps/cppatlas-grader/machines"); n != 1 {
		t.Fatalf("create POSTs %d", n)
	}
	closeAndWait(t, e.b)
	e.f.mu.Lock()
	seq := e.f.seq
	e.f.mu.Unlock()
	if seq != 1 || e.f.count() != 0 {
		t.Fatalf("machines created %d left %d", seq, e.f.count())
	}
}

// A retried create whose name already exists (409) adopts the machine.
func TestCreateConflictAdopts(t *testing.T) {
	e := setup(t, nil)
	req := e.b.createRequest(roleRun, "tok-tok-tok-tok-tok", "x-", false)
	e.f.behaviour = "hang"
	first, err := e.b.create(context.Background(), req)
	if err != nil {
		t.Fatal(err)
	}
	again, err := e.b.create(context.Background(), req)
	if err != nil || again.ID != first.ID {
		t.Fatalf("%v %+v", err, again)
	}
	if e.f.callsWith("POST /v1/apps/cppatlas-grader/machines") != 2 || e.f.count() != 1 {
		t.Fatal("duplicate machine")
	}
}

// The create is applied but the caller gives up before the answer: the
// machine is reaped in the background.
func TestCreateAbandonedIsReaped(t *testing.T) {
	e := setup(t, nil)
	e.f.behaviour = "hang"
	e.f.createDelay = time.Second
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	if _, err := e.b.Run(ctx, job()); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("err %v", err)
	}
	eventually(t, "orphan reaped", func() bool {
		e.f.mu.Lock()
		defer e.f.mu.Unlock()
		return e.f.seq == 1 && len(e.f.machines) == 0
	})
	if e.rv.Len() != 0 {
		t.Fatal("token live")
	}
}

// A create that keeps failing without being applied still retries (5xx)
// and does not reap anything that is not there.
func TestCreate5xxNotAppliedRetries(t *testing.T) {
	e := setup(t, nil)
	e.f.failCreate = 2
	e.f.createStatus = 503
	if _, err := e.b.Run(context.Background(), job()); err != nil {
		t.Fatal(err)
	}
	if n := e.f.callsWith("POST /v1/apps/cppatlas-grader/machines"); n != 3 {
		t.Fatalf("create attempts %d", n)
	}
	e.f.mu.Lock()
	lists := 0
	for _, c := range e.f.calls {
		if c == "GET /v1/apps/cppatlas-grader/machines" {
			lists++
		}
	}
	e.f.mu.Unlock()
	if lists != 2 {
		t.Fatalf("lookups before retries: %d", lists)
	}
}
