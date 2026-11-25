package github

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"cppatlas.com/runner/internal/protocol"
)

const (
	testSecret = "s3cret-webhook"
	testSHA    = "0123456789abcdef0123456789abcdef01234567"
	testOwner  = "learner"
	testRepo   = "my-vector"
	testRepoID = 4242
	testInst   = 777
)

var fixedNow = time.Date(2026, 11, 25, 12, 0, 0, 0, time.UTC)

var (
	keyOnce sync.Once
	testKey *rsa.PrivateKey
)

func rsaKey(t testing.TB) *rsa.PrivateKey {
	keyOnce.Do(func() {
		k, err := rsa.GenerateKey(rand.Reader, 2048)
		if err != nil {
			panic(err)
		}
		testKey = k
	})
	return testKey
}

func pkcs1PEM(k *rsa.PrivateKey) string {
	return string(pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(k)}))
}

func pkcs8PEM(k any) string {
	der, err := x509.MarshalPKCS8PrivateKey(k)
	if err != nil {
		panic(err)
	}
	return string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}))
}

func sign(secret string, body []byte) string {
	m := hmac.New(sha256.New, []byte(secret))
	m.Write(body)
	return "sha256=" + hex.EncodeToString(m.Sum(nil))
}

// ------------------------------------------------------------- fake runner

var vectorSpec = protocol.ChallengeSpec{
	Name: "vector", Stages: 8,
	AllowedFiles: []string{"include/my/vector.hpp"}, RequiredFiles: []string{"include/my/vector.hpp"},
	MaxFileBytes: 256 << 10, MaxTotalBytes: 256 << 10,
}

type fakeRunner struct {
	mu        sync.Mutex
	subs      []protocol.Submission
	submitErr error
	// final returns the terminal view for a submission (default: all pass).
	final func(s protocol.Submission) protocol.RunView
	// waitFn, when set, replaces Wait's behaviour.
	waitFn  func(ctx context.Context, id string) (protocol.RunView, error)
	views   map[string]protocol.RunView
	started chan string // receives run ids as Wait is entered (optional)
}

func newFakeRunner() *fakeRunner { return &fakeRunner{views: map[string]protocol.RunView{}} }

func (f *fakeRunner) Submit(ctx context.Context, s protocol.Submission) (protocol.RunView, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.submitErr != nil {
		return protocol.RunView{}, f.submitErr
	}
	f.subs = append(f.subs, s)
	id := fmt.Sprintf("run-%d", len(f.subs))
	v := passView(s)
	if f.final != nil {
		v = f.final(s)
	}
	v.ID = id
	f.views[id] = v
	return protocol.RunView{ID: id, Status: protocol.RunQueued, Challenge: s.Challenge, Stages: s.Stages, QueuePosition: 1, CreatedAt: fixedNow}, nil
}

func (f *fakeRunner) Get(id string) (protocol.RunView, bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	v, ok := f.views[id]
	return v, ok
}

func (f *fakeRunner) Wait(ctx context.Context, id string) (protocol.RunView, error) {
	if f.started != nil {
		f.started <- id
	}
	if f.waitFn != nil {
		return f.waitFn(ctx, id)
	}
	v, ok := f.Get(id)
	if !ok {
		return protocol.RunView{}, protocol.ErrNotFound
	}
	return v, nil
}

func (f *fakeRunner) Challenge(name string) (protocol.ChallengeSpec, bool) {
	if name == "vector" {
		return vectorSpec, true
	}
	return protocol.ChallengeSpec{}, false
}

func (f *fakeRunner) submissions() []protocol.Submission {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]protocol.Submission(nil), f.subs...)
}

func passView(s protocol.Submission) protocol.RunView {
	r := &protocol.Result{Status: protocol.ResultCompleted, Passed: true, Challenge: s.Challenge, Compiler: "g++ 16.2.0", Preset: "debug"}
	for _, n := range s.Stages {
		r.Stages = append(r.Stages, protocol.StageResult{Stage: n, Status: protocol.StagePassed, Counts: &protocol.TestCounts{Total: 5, Passed: 5}, BuildMs: 900, RunMs: 40})
	}
	return protocol.RunView{Status: protocol.RunCompleted, Challenge: s.Challenge, Stages: s.Stages, Result: r}
}

// failAt returns a final func whose stage n has the given result and later
// stages are skipped.
func failAt(n int, sr protocol.StageResult) func(protocol.Submission) protocol.RunView {
	return func(s protocol.Submission) protocol.RunView {
		v := passView(s)
		v.Result.Passed = false
		for i := range v.Result.Stages {
			st := v.Result.Stages[i].Stage
			switch {
			case st == n:
				sr.Stage = n
				v.Result.Stages[i] = sr
			case st > n:
				v.Result.Stages[i] = protocol.StageResult{Stage: st, Status: protocol.StageSkipped}
			}
		}
		return v
	}
}

// ------------------------------------------------------------- fake GitHub

type ghCall struct {
	Method string
	Path   string // escaped path
	Query  string
	Header http.Header
	Body   []byte
}

func (c ghCall) String() string { return c.Method + " " + c.Path }

func (c ghCall) json(t testing.TB) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(c.Body, &m); err != nil {
		t.Fatalf("%s: body is not JSON: %v", c, err)
	}
	return m
}

type fakeGH struct {
	t        testing.TB
	srv      *httptest.Server
	mu       sync.Mutex
	calls    []ghCall
	files    map[string]string // repo path -> content at testSHA
	nextID   int64
	tokenExp time.Time
	// override, when it returns true, has handled the request.
	override func(w http.ResponseWriter, r *http.Request, body []byte) bool
}

func newFakeGH(t testing.TB) *fakeGH {
	g := &fakeGH{t: t, files: map[string]string{"include/my/vector.hpp": "#pragma once\n", ".cppatlas.json": `{"challenge":"vector"}`}, nextID: 100, tokenExp: fixedNow.Add(time.Hour)}
	g.srv = httptest.NewServer(http.HandlerFunc(g.serve))
	t.Cleanup(g.srv.Close)
	return g
}

func (g *fakeGH) serve(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(r.Body)
	g.mu.Lock()
	g.calls = append(g.calls, ghCall{Method: r.Method, Path: r.URL.EscapedPath(), Query: r.URL.RawQuery, Header: r.Header.Clone(), Body: body})
	ov := g.override
	g.mu.Unlock()
	if ov != nil && ov(w, r, body) {
		return
	}
	p := r.URL.EscapedPath()
	repoPrefix := "/repos/" + testOwner + "/" + testRepo
	switch {
	case r.Method == http.MethodPost && strings.HasPrefix(p, "/app/installations/") && strings.HasSuffix(p, "/access_tokens"):
		w.WriteHeader(http.StatusCreated)
		fmt.Fprintf(w, `{"token":"ghs_TESTTOKEN","expires_at":%q,"permissions":{"checks":"write","contents":"read","metadata":"read"}}`, g.tokenExp.Format(time.RFC3339))
	case r.Method == http.MethodGet && strings.HasPrefix(p, repoPrefix+"/contents/"):
		if r.URL.Query().Get("ref") != testSHA {
			http.Error(w, `{"message":"No commit found for the ref"}`, http.StatusNotFound)
			return
		}
		path := strings.TrimPrefix(r.URL.Path, repoPrefix+"/contents/")
		g.mu.Lock()
		content, ok := g.files[path]
		g.mu.Unlock()
		if !ok {
			w.WriteHeader(http.StatusNotFound)
			io.WriteString(w, `{"message":"Not Found"}`)
			return
		}
		w.Header().Set("Content-Type", "application/vnd.github.raw+json; charset=utf-8")
		io.WriteString(w, content)
	case r.Method == http.MethodPost && p == repoPrefix+"/check-runs":
		g.mu.Lock()
		g.nextID++
		id := g.nextID
		g.mu.Unlock()
		w.WriteHeader(http.StatusCreated)
		fmt.Fprintf(w, `{"id":%d}`, id)
	case r.Method == http.MethodPatch && strings.HasPrefix(p, repoPrefix+"/check-runs/"):
		io.WriteString(w, `{"id":1}`)
	default:
		w.WriteHeader(http.StatusNotFound)
		io.WriteString(w, `{"message":"Not Found"}`)
	}
}

func (g *fakeGH) Calls() []ghCall {
	g.mu.Lock()
	defer g.mu.Unlock()
	return append([]ghCall(nil), g.calls...)
}

func (g *fakeGH) callsTo(method, prefix string) []ghCall {
	var out []ghCall
	for _, c := range g.Calls() {
		if c.Method == method && strings.HasPrefix(c.Path, prefix) {
			out = append(out, c)
		}
	}
	return out
}

// checkWrites returns the check-run POST/PATCH bodies in order.
func (g *fakeGH) checkWrites(t testing.TB) []map[string]any {
	var out []map[string]any
	for _, c := range g.Calls() {
		if strings.Contains(c.Path, "/check-runs") {
			out = append(out, c.json(t))
		}
	}
	return out
}

// lastCheck is the final check-run write.
func (g *fakeGH) lastCheck(t testing.TB) map[string]any {
	t.Helper()
	w := g.checkWrites(t)
	if len(w) == 0 {
		t.Fatalf("no check run writes; calls: %v", g.Calls())
	}
	return w[len(w)-1]
}

// ------------------------------------------------------------------ the app

type testEnv struct {
	app    *App
	gh     *fakeGH
	runner *fakeRunner
	sleeps []time.Duration
	mu     sync.Mutex
}

func newEnv(t testing.TB, mod func(*Config)) *testEnv {
	t.Helper()
	gh := newFakeGH(t)
	fr := newFakeRunner()
	cfg := Config{
		AppID:         "12345",
		PrivateKeyPEM: pkcs1PEM(rsaKey(t)),
		WebhookSecret: testSecret,
		Runner:        fr,
		APIBaseURL:    gh.srv.URL,
		Logger:        slog.New(slog.NewTextHandler(io.Discard, nil)),
		Now:           func() time.Time { return fixedNow },
	}
	if mod != nil {
		mod(&cfg)
	}
	a, err := New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	env := &testEnv{app: a, gh: gh, runner: fr}
	a.sleep = func(ctx context.Context, d time.Duration) error {
		env.mu.Lock()
		env.sleeps = append(env.sleeps, d)
		env.mu.Unlock()
		return ctx.Err()
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = a.Shutdown(ctx)
	})
	return env
}

// idle waits for every grading/notifier goroutine to finish.
func (e *testEnv) idle(t testing.TB) {
	t.Helper()
	done := make(chan struct{})
	go func() { e.app.wg.Wait(); close(done) }()
	select {
	case <-done:
	case <-time.After(10 * time.Second):
		t.Fatalf("grading did not finish; calls: %v", e.gh.Calls())
	}
}

type pushOpts struct {
	ref, after, owner, repo string
	deleted, noHead         bool
	defaultBranch           string
	pushedAt                any
	noInstallation          bool
}

func pushBody(o pushOpts) []byte {
	if o.ref == "" {
		o.ref = "refs/heads/main"
	}
	if o.after == "" {
		o.after = testSHA
	}
	if o.owner == "" {
		o.owner = testOwner
	}
	if o.repo == "" {
		o.repo = testRepo
	}
	if o.defaultBranch == "" {
		o.defaultBranch = "main"
	}
	if o.pushedAt == nil {
		o.pushedAt = fixedNow.Add(-5 * time.Second).Unix()
	}
	p := map[string]any{
		"ref":     o.ref,
		"before":  "1111111111111111111111111111111111111111",
		"after":   o.after,
		"created": false,
		"deleted": o.deleted,
		"forced":  false,
		"compare": "https://github.com/" + o.owner + "/" + o.repo + "/compare/111...012",
		"commits": []any{map[string]any{"id": o.after, "message": "stage 3 @someone <script>alert(1)</script>", "author": map[string]any{"name": "L", "email": "l@example.com"}}},
		"repository": map[string]any{
			"id": testRepoID, "node_id": "R_x", "name": o.repo, "full_name": o.owner + "/" + o.repo, "private": false,
			"owner":          map[string]any{"name": o.owner, "login": o.owner, "id": 9, "type": "User"},
			"default_branch": o.defaultBranch, "master_branch": o.defaultBranch,
			"pushed_at": o.pushedAt, "created_at": fixedNow.Add(-48 * time.Hour).Unix(),
		},
		"pusher": map[string]any{"name": o.owner, "email": "l@example.com"},
		"sender": map[string]any{"login": o.owner, "id": 9},
	}
	if !o.noHead {
		p["head_commit"] = map[string]any{"id": o.after, "tree_id": "2222222222222222222222222222222222222222", "message": "wip", "timestamp": fixedNow.Format(time.RFC3339)}
	} else {
		p["head_commit"] = nil
	}
	if !o.noInstallation {
		p["installation"] = map[string]any{"id": testInst, "node_id": "I_x"}
	}
	b, _ := json.Marshal(p)
	return b
}

func webhookReq(event, delivery string, body []byte, sig string) *http.Request {
	r := httptest.NewRequest(http.MethodPost, "/github/webhook", bytes.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("X-GitHub-Event", event)
	if delivery != "" {
		r.Header.Set("X-GitHub-Delivery", delivery)
	}
	if sig != "" {
		r.Header.Set("X-Hub-Signature-256", sig)
	}
	return r
}

func (e *testEnv) push(t testing.TB, delivery string, body []byte) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	e.app.WebhookHandler().ServeHTTP(rec, webhookReq("push", delivery, body, sign(testSecret, body)))
	return rec
}
