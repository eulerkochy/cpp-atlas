package github

import (
	"context"
	"crypto"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestParsePrivateKey(t *testing.T) {
	k := rsaKey(t)
	p1 := pkcs1PEM(k)
	p8 := pkcs8PEM(k)
	ec, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	small, _ := rsa.GenerateKey(rand.Reader, 1024)
	der1 := x509.MarshalPKCS1PrivateKey(k)
	cases := []struct {
		name string
		in   string
		ok   bool
	}{
		{"pkcs1", p1, true},
		{"pkcs8", p8, true},
		{"literal \\n escapes", strings.ReplaceAll(p1, "\n", `\n`), true},
		{"CRLF", strings.ReplaceAll(p8, "\n", "\r\n"), true},
		{"newlines flattened to spaces", strings.ReplaceAll(strings.TrimSpace(p1), "\n", " "), true},
		{"surrounding quotes", `"` + strings.ReplaceAll(p1, "\n", `\n`) + `"`, true},
		{"base64-wrapped pem", base64.StdEncoding.EncodeToString([]byte(p1)), true},
		{"base64 DER", base64.StdEncoding.EncodeToString(der1), true},
		{"empty", "  ", false},
		{"garbage", "not a key at all!", false},
		{"truncated body", p1[:len(p1)/2] + "\n-----END RSA PRIVATE KEY-----\n", false},
		{"ec key", pkcs8PEM(ec), false},
		{"1024-bit", pkcs1PEM(small), false},
		{"encrypted", "-----BEGIN ENCRYPTED PRIVATE KEY-----\nAAAA\n-----END ENCRYPTED PRIVATE KEY-----\n", false},
		{"public key", string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: []byte{1}})), false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, err := ParsePrivateKey(c.in)
			if c.ok {
				if err != nil || !got.Equal(k) {
					t.Fatalf("err=%v", err)
				}
				return
			}
			if err == nil {
				t.Fatal("expected error")
			}
			if strings.Contains(err.Error(), "MII") {
				t.Fatalf("error leaks key material: %v", err)
			}
		})
	}
}

func TestNewFailsLoudly(t *testing.T) {
	base := Config{AppID: "1", PrivateKeyPEM: pkcs1PEM(rsaKey(t)), WebhookSecret: "s", Runner: newFakeRunner()}
	cases := map[string]func(*Config){
		"malformed key": func(c *Config) {
			c.PrivateKeyPEM = "-----BEGIN RSA PRIVATE KEY-----\nnope\n-----END RSA PRIVATE KEY-----"
		},
		"no app id": func(c *Config) { c.AppID = "" },
		"no secret": func(c *Config) { c.WebhookSecret = "" },
		"no runner": func(c *Config) { c.Runner = nil },
		"http base": func(c *Config) { c.APIBaseURL = "http://api.example.com" },
		"bad base":  func(c *Config) { c.APIBaseURL = "ftp://x" },
	}
	for name, mod := range cases {
		t.Run(name, func(t *testing.T) {
			c := base
			mod(&c)
			if _, err := New(c); err == nil {
				t.Fatal("New succeeded")
			}
		})
	}
	if _, err := New(base); err != nil {
		t.Fatalf("valid config: %v", err)
	}
}

func TestAppJWT(t *testing.T) {
	k := rsaKey(t)
	tok, err := appJWT(k, "12345", fixedNow)
	if err != nil {
		t.Fatal(err)
	}
	parts := strings.Split(tok, ".")
	if len(parts) != 3 {
		t.Fatalf("parts = %d", len(parts))
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	if err := rsa.VerifyPKCS1v15(&k.PublicKey, crypto.SHA256, sum[:], sig); err != nil {
		t.Fatalf("signature does not verify: %v", err)
	}
	var hdr map[string]any
	hb, _ := base64.RawURLEncoding.DecodeString(parts[0])
	_ = json.Unmarshal(hb, &hdr)
	if hdr["alg"] != "RS256" || hdr["typ"] != "JWT" {
		t.Fatalf("header %v", hdr)
	}
	var claims map[string]any
	cb, _ := base64.RawURLEncoding.DecodeString(parts[1])
	_ = json.Unmarshal(cb, &claims)
	if claims["iss"] != float64(12345) {
		t.Fatalf("iss = %v", claims["iss"])
	}
	iat, exp := int64(claims["iat"].(float64)), int64(claims["exp"].(float64))
	if iat != fixedNow.Unix()-60 {
		t.Fatalf("iat = %d", iat)
	}
	if exp <= fixedNow.Unix() || exp-fixedNow.Unix() > 9*60 || exp-iat > 10*60 {
		t.Fatalf("exp = %d (now %d)", exp, fixedNow.Unix())
	}
	tok2, _ := appJWT(k, "Iv1.abc", fixedNow)
	cb, _ = base64.RawURLEncoding.DecodeString(strings.Split(tok2, ".")[1])
	_ = json.Unmarshal(cb, &claims)
	if claims["iss"] != "Iv1.abc" {
		t.Fatalf("client-id iss = %v", claims["iss"])
	}
}

func TestInstallationTokenLeastPrivilegeAndCache(t *testing.T) {
	now := fixedNow
	env := newEnv(t, func(c *Config) { c.Now = func() time.Time { return now } })
	a := env.app
	for i := 0; i < 3; i++ {
		tok, err := a.installationToken(context.Background(), testInst, testRepoID)
		if err != nil || tok != "ghs_TESTTOKEN" {
			t.Fatalf("tok=%q err=%v", tok, err)
		}
	}
	calls := env.gh.callsTo(http.MethodPost, "/app/installations/")
	if len(calls) != 1 {
		t.Fatalf("token requests = %d, want 1 (cached)", len(calls))
	}
	c := calls[0]
	if c.Path != "/app/installations/777/access_tokens" {
		t.Fatalf("path %s", c.Path)
	}
	var body struct {
		RepositoryIDs []int64           `json:"repository_ids"`
		Permissions   map[string]string `json:"permissions"`
		Repositories  []string          `json:"repositories"`
	}
	if err := json.Unmarshal(c.Body, &body); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(body.RepositoryIDs, []int64{testRepoID}) || body.Repositories != nil {
		t.Fatalf("repository scope %+v", body)
	}
	want := map[string]string{"checks": "write", "contents": "read", "metadata": "read"}
	if !reflect.DeepEqual(body.Permissions, want) {
		t.Fatalf("permissions %v", body.Permissions)
	}
	auth := c.Header.Get("Authorization")
	if !strings.HasPrefix(auth, "Bearer ") || strings.Count(auth, ".") != 2 {
		t.Fatalf("App JWT auth header %q", auth)
	}
	for h, v := range map[string]string{"Accept": "application/vnd.github+json", "X-Github-Api-Version": "2022-11-28"} {
		if c.Header.Get(h) != v {
			t.Fatalf("%s = %q", h, c.Header.Get(h))
		}
	}
	if c.Header.Get("User-Agent") == "" {
		t.Fatal("no User-Agent")
	}
	// A different repository gets its own token.
	if _, err := a.installationToken(context.Background(), testInst, testRepoID+1); err != nil {
		t.Fatal(err)
	}
	// Shortly before expiry (inside the 5 minute margin) the token is refreshed.
	now = fixedNow.Add(56 * time.Minute)
	if _, err := a.installationToken(context.Background(), testInst, testRepoID); err != nil {
		t.Fatal(err)
	}
	if n := len(env.gh.callsTo(http.MethodPost, "/app/installations/")); n != 3 {
		t.Fatalf("token requests = %d, want 3", n)
	}
}

func TestTokenRefreshOn401(t *testing.T) {
	env := newEnv(t, nil)
	var n atomic.Int32
	env.gh.override = func(w http.ResponseWriter, r *http.Request, _ []byte) bool {
		if strings.Contains(r.URL.Path, "/contents/") && n.Add(1) == 1 {
			w.WriteHeader(401)
			w.Write([]byte(`{"message":"Bad credentials"}`))
			return true
		}
		return false
	}
	j := testJob()
	if _, err := env.app.fetchFile(context.Background(), j, "include/my/vector.hpp", 1000); err != nil {
		t.Fatal(err)
	}
	if got := len(env.gh.callsTo(http.MethodPost, "/app/")); got != 2 {
		t.Fatalf("token requests = %d, want 2", got)
	}
}

func testJob() *pushJob {
	return &pushJob{delivery: "d", installationID: testInst, repoID: testRepoID, owner: testOwner, repo: testRepo, ref: "refs/heads/main", sha: testSHA}
}

func TestFetchFileAtSHA(t *testing.T) {
	env := newEnv(t, nil)
	env.gh.files["include/my/vector.hpp"] = "template <class T> class vector {};\n"
	b, err := env.app.fetchFile(context.Background(), testJob(), "include/my/vector.hpp", 1000)
	if err != nil || string(b) != env.gh.files["include/my/vector.hpp"] {
		t.Fatalf("b=%q err=%v", b, err)
	}
	c := env.gh.callsTo(http.MethodGet, "/repos/")[0]
	if c.Path != "/repos/learner/my-vector/contents/include/my/vector.hpp" || c.Query != "ref="+testSHA {
		t.Fatalf("fetched %s?%s", c.Path, c.Query)
	}
	if c.Header.Get("Accept") != "application/vnd.github.raw+json" || c.Header.Get("Authorization") != "Bearer ghs_TESTTOKEN" {
		t.Fatalf("headers %v", c.Header)
	}
	if _, err := env.app.fetchFile(context.Background(), testJob(), "missing.txt", 1000); !errors.Is(err, errNotFound) {
		t.Fatalf("missing: %v", err)
	}
	env.gh.files["big.hpp"] = strings.Repeat("x", 1001)
	if _, err := env.app.fetchFile(context.Background(), testJob(), "big.hpp", 1000); !errors.Is(err, errTooLarge) {
		t.Fatalf("big: %v", err)
	}
	if _, err := env.app.fetchFile(context.Background(), testJob(), "big.hpp", 1001); err != nil {
		t.Fatalf("at the cap: %v", err)
	}
}

func TestPathEscaping(t *testing.T) {
	env := newEnv(t, nil)
	got := env.app.apiURL([]string{"repos", "o", "a b?c#d", "contents", "x%2F"}, nil)
	if !strings.HasSuffix(got, "/repos/o/a%20b%3Fc%23d/contents/x%252F") {
		t.Fatalf("url %s", got)
	}
}

func TestRetries(t *testing.T) {
	cases := []struct {
		name      string
		method    string
		responses []func(w http.ResponseWriter)
		wantCalls int
		wantErr   bool
		wantSleep []time.Duration // exact, when set
	}{
		{"GET retried on 502", http.MethodGet, []func(http.ResponseWriter){status(502), status(502), ok}, 3, false, nil},
		{"GET gives up after retries", http.MethodGet, []func(http.ResponseWriter){status(503), status(503), status(503), ok}, 3, true, nil},
		{"Retry-After honoured", http.MethodGet, []func(http.ResponseWriter){retryAfter(429, "7"), ok}, 2, false, []time.Duration{7 * time.Second}},
		{"secondary rate limit 403", http.MethodGet, []func(http.ResponseWriter){retryAfter(403, "3"), ok}, 2, false, []time.Duration{3 * time.Second}},
		{"Retry-After too long", http.MethodGet, []func(http.ResponseWriter){retryAfter(429, "3600"), ok}, 1, true, nil},
		{"plain 403 not retried", http.MethodGet, []func(http.ResponseWriter){status(403), ok}, 1, true, nil},
		{"404 not retried", http.MethodGet, []func(http.ResponseWriter){status(404), ok}, 1, true, nil},
		{"POST create not retried on 502", http.MethodPost, []func(http.ResponseWriter){status(502), ok}, 1, true, nil},
		{"POST create retried on 429", http.MethodPost, []func(http.ResponseWriter){retryAfter(429, "1"), ok}, 2, false, []time.Duration{time.Second}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			env := newEnv(t, nil)
			var n atomic.Int32
			env.gh.override = func(w http.ResponseWriter, r *http.Request, _ []byte) bool {
				if strings.HasPrefix(r.URL.Path, "/app/") {
					return false
				}
				i := int(n.Add(1)) - 1
				c.responses[min(i, len(c.responses)-1)](w)
				return true
			}
			var err error
			if c.method == http.MethodGet {
				_, err = env.app.fetchFile(context.Background(), testJob(), "f", 1000)
			} else {
				_, err = env.app.createCheckRun(context.Background(), testJob(), map[string]any{"name": "x"})
			}
			if (err != nil) != c.wantErr {
				t.Fatalf("err = %v", err)
			}
			if int(n.Load()) != c.wantCalls {
				t.Fatalf("calls = %d, want %d", n.Load(), c.wantCalls)
			}
			if c.wantSleep != nil && !reflect.DeepEqual(env.sleeps, c.wantSleep) {
				t.Fatalf("sleeps = %v", env.sleeps)
			}
		})
	}
}

func status(code int) func(http.ResponseWriter) {
	return func(w http.ResponseWriter) { w.WriteHeader(code); w.Write([]byte(`{"message":"x"}`)) }
}

func retryAfter(code int, secs string) func(http.ResponseWriter) {
	return func(w http.ResponseWriter) { w.Header().Set("Retry-After", secs); status(code)(w) }
}

func ok(w http.ResponseWriter) { w.Write([]byte(`{"id":5}`)) }

func TestRedirectNeverLeavesAPIHost(t *testing.T) {
	var leaked atomic.Int32
	evil := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		leaked.Add(1)
		w.Write([]byte("stolen"))
	}))
	defer evil.Close()
	env := newEnv(t, nil)
	env.gh.override = func(w http.ResponseWriter, r *http.Request, _ []byte) bool {
		switch {
		case strings.HasSuffix(r.URL.Path, "/contents/offhost"):
			http.Redirect(w, r, evil.URL+"/x", http.StatusFound)
			return true
		case strings.HasSuffix(r.URL.Path, "/contents/onhost"):
			http.Redirect(w, r, "/repos/learner/my-vector/contents/include/my/vector.hpp?ref="+testSHA, http.StatusMovedPermanently)
			return true
		}
		return false
	}
	if _, err := env.app.fetchFile(context.Background(), testJob(), "offhost", 1000); err == nil {
		t.Fatal("off-host redirect followed")
	}
	if leaked.Load() != 0 {
		t.Fatal("request reached the other host")
	}
	b, err := env.app.fetchFile(context.Background(), testJob(), "onhost", 1000)
	if err != nil || string(b) != "#pragma once\n" {
		t.Fatalf("same-host redirect: %q %v", b, err)
	}
}
