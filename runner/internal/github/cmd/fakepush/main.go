// Command fakepush exercises the GitHub webhook of a locally running API
// without GitHub: it serves a mock GitHub REST API (installation token,
// contents at a SHA, check runs) and sends one correctly signed push event.
//
// Typical use (two terminals, from runner/):
//
//	go run ./internal/github/cmd/fakepush --gen-key /tmp/cppatlas-app.pem
//	GITHUB_APP_ID=1 GITHUB_APP_PRIVATE_KEY="$(cat /tmp/cppatlas-app.pem)" \
//	  GITHUB_WEBHOOK_SECRET=dev-secret GITHUB_API_BASE_URL=http://127.0.0.1:8099 \
//	  go run ./cmd/api
//	go run ./internal/github/cmd/fakepush \
//	  --webhook-url http://127.0.0.1:8080/github/webhook --secret dev-secret \
//	  --file ../challenges/vector/solution/include/my/vector.hpp --stage 3 \
//	  --listen 127.0.0.1:8099 --app-key /tmp/cppatlas-app.pem
//
// Every check-run create/update body is printed to stdout as JSON. The
// command exits after the check run completes (exit status 0 for success,
// 1 for any other conclusion) or after --timeout.
package main

import (
	"bytes"
	"context"
	"crypto"
	"crypto/hmac"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"sync/atomic"
	"time"

	"cppatlas.com/runner/internal/github"
)

func main() {
	var (
		webhookURL = flag.String("webhook-url", "http://127.0.0.1:8080/github/webhook", "the API's webhook endpoint")
		secret     = flag.String("secret", "", "webhook secret (GITHUB_WEBHOOK_SECRET of the API)")
		file       = flag.String("file", "", "local vector.hpp served as include/my/vector.hpp")
		stage      = flag.Int("stage", 0, "serve .cppatlas.json with this stage (0 = no .cppatlas.json)")
		config     = flag.String("config", "", "serve this file verbatim as .cppatlas.json (overrides --stage)")
		listen     = flag.String("listen", "127.0.0.1:8099", "address of the mock GitHub API (set GITHUB_API_BASE_URL=http://<listen>)")
		repo       = flag.String("repo", "learner/my-vector", "owner/name of the fake repository")
		ref        = flag.String("ref", "refs/heads/main", "pushed ref")
		sha        = flag.String("sha", "", "pushed commit SHA (default: random)")
		appKey     = flag.String("app-key", "", "optional: the App private key PEM the API uses; App JWTs are then verified")
		genKey     = flag.String("gen-key", "", "write a fresh 2048-bit RSA App key (PKCS#1 PEM) to this path and exit")
		timeout    = flag.Duration("timeout", 3*time.Minute, "give up waiting for the check run after this long")
		stay       = flag.Bool("stay", false, "keep serving the mock API after the check run completes")
	)
	flag.Parse()
	log.SetFlags(log.Ltime)
	log.SetOutput(os.Stderr)

	if *genKey != "" {
		k, err := rsa.GenerateKey(rand.Reader, 2048)
		check(err)
		check(os.WriteFile(*genKey, pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(k)}), 0o600))
		log.Printf("wrote %s", *genKey)
		return
	}
	if *secret == "" || *file == "" {
		log.Fatal("--secret and --file are required (see -h)")
	}
	owner, name, ok := strings.Cut(*repo, "/")
	if !ok {
		log.Fatal("--repo must be owner/name")
	}
	src, err := os.ReadFile(*file)
	check(err)
	var cfgJSON []byte
	switch {
	case *config != "":
		cfgJSON, err = os.ReadFile(*config)
		check(err)
	case *stage > 0:
		cfgJSON = fmt.Appendf(nil, `{"challenge":"vector","stage":%d}`, *stage)
	}
	if *sha == "" {
		b := make([]byte, 20)
		_, _ = rand.Read(b)
		*sha = hex.EncodeToString(b)
	}
	var pub *rsa.PublicKey
	if *appKey != "" {
		b, err := os.ReadFile(*appKey)
		check(err)
		k, err := github.ParsePrivateKey(string(b))
		check(err)
		pub = &k.PublicKey
	}

	done := make(chan string, 1)
	var nextID atomic.Int64
	nextID.Store(1000)
	repoPrefix := "/repos/" + owner + "/" + name
	mux := http.NewServeMux()
	mux.HandleFunc("POST /app/installations/{id}/access_tokens", func(w http.ResponseWriter, r *http.Request) {
		auth := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if pub != nil {
			if err := verifyJWT(pub, auth); err != nil {
				log.Printf("token request with a bad App JWT: %v", err)
				http.Error(w, `{"message":"A JSON web token could not be decoded"}`, http.StatusUnauthorized)
				return
			}
			log.Printf("App JWT verified")
		}
		body, _ := io.ReadAll(r.Body)
		log.Printf("installation token requested for installation %s: %s", r.PathValue("id"), body)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		fmt.Fprintf(w, `{"token":"ghs_fakepush","expires_at":%q,"permissions":{"checks":"write","contents":"read","metadata":"read"},"repository_selection":"selected"}`,
			time.Now().Add(time.Hour).UTC().Format(time.RFC3339))
	})
	mux.HandleFunc("GET "+repoPrefix+"/contents/{path...}", func(w http.ResponseWriter, r *http.Request) {
		if !authorized(w, r) {
			return
		}
		p, gotRef := r.PathValue("path"), r.URL.Query().Get("ref")
		log.Printf("contents %s at %s", p, gotRef)
		if gotRef != *sha {
			http.Error(w, `{"message":"No commit found for the ref"}`, http.StatusNotFound)
			return
		}
		var content []byte
		switch p {
		case "include/my/vector.hpp":
			content = src
		case ".cppatlas.json":
			content = cfgJSON
		}
		if content == nil {
			w.Header().Set("Content-Type", "application/json")
			http.Error(w, `{"message":"Not Found"}`, http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/vnd.github.raw+json; charset=utf-8")
		_, _ = w.Write(content)
	})
	checkWrite := func(w http.ResponseWriter, r *http.Request, id int64) {
		if !authorized(w, r) {
			return
		}
		body, _ := io.ReadAll(r.Body)
		var pretty bytes.Buffer
		if json.Indent(&pretty, body, "", "  ") != nil {
			pretty.Write(body)
		}
		fmt.Printf("=== %s %s\n%s\n", r.Method, r.URL.Path, pretty.String())
		var m struct {
			Status     string `json:"status"`
			Conclusion string `json:"conclusion"`
		}
		_ = json.Unmarshal(body, &m)
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodPost {
			w.WriteHeader(http.StatusCreated)
		}
		fmt.Fprintf(w, `{"id":%d}`, id)
		if m.Status == "completed" {
			select {
			case done <- m.Conclusion:
			default:
			}
		}
	}
	mux.HandleFunc("POST "+repoPrefix+"/check-runs", func(w http.ResponseWriter, r *http.Request) {
		checkWrite(w, r, nextID.Add(1))
	})
	mux.HandleFunc("PATCH "+repoPrefix+"/check-runs/{id}", func(w http.ResponseWriter, r *http.Request) {
		var id int64
		fmt.Sscan(r.PathValue("id"), &id)
		checkWrite(w, r, id)
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		log.Printf("unexpected request %s %s", r.Method, r.URL)
		http.Error(w, `{"message":"Not Found"}`, http.StatusNotFound)
	})

	ln, err := net.Listen("tcp", *listen)
	check(err)
	srv := &http.Server{Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	go func() { _ = srv.Serve(ln) }()
	log.Printf("mock GitHub API on http://%s (set GITHUB_API_BASE_URL to this)", ln.Addr())

	payload := pushPayload(owner, name, *ref, *sha)
	mac := hmac.New(sha256.New, []byte(*secret))
	mac.Write(payload)
	req, err := http.NewRequest(http.MethodPost, *webhookURL, bytes.NewReader(payload))
	check(err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "GitHub-Hookshot/fakepush")
	req.Header.Set("X-GitHub-Event", "push")
	req.Header.Set("X-GitHub-Delivery", randomGUID())
	req.Header.Set("X-Hub-Signature-256", "sha256="+hex.EncodeToString(mac.Sum(nil)))
	resp, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	check(err)
	rb, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	resp.Body.Close()
	log.Printf("webhook %s -> %s %s", *webhookURL, resp.Status, strings.TrimSpace(string(rb)))
	if resp.StatusCode != http.StatusAccepted {
		os.Exit(1)
	}

	code := 1
	select {
	case c := <-done:
		log.Printf("check run completed: %s", c)
		if c == "success" {
			code = 0
		}
	case <-time.After(*timeout):
		log.Printf("timed out waiting for the check run")
	}
	if *stay {
		log.Printf("--stay: still serving; Ctrl-C to quit")
		select {}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
	os.Exit(code)
}

func authorized(w http.ResponseWriter, r *http.Request) bool {
	if r.Header.Get("Authorization") != "Bearer ghs_fakepush" {
		log.Printf("%s %s without the installation token", r.Method, r.URL.Path)
		http.Error(w, `{"message":"Bad credentials"}`, http.StatusUnauthorized)
		return false
	}
	return true
}

func verifyJWT(pub *rsa.PublicKey, tok string) error {
	parts := strings.Split(tok, ".")
	if len(parts) != 3 {
		return errors.New("not a JWT")
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return err
	}
	sum := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	if err := rsa.VerifyPKCS1v15(pub, crypto.SHA256, sum[:], sig); err != nil {
		return errors.New("signature does not verify with --app-key")
	}
	cb, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return err
	}
	var c struct{ Iat, Exp int64 }
	if err := json.Unmarshal(cb, &c); err != nil {
		return err
	}
	now := time.Now().Unix()
	if c.Iat > now+60 || c.Exp < now || c.Exp-c.Iat > 600 {
		return fmt.Errorf("bad iat/exp %d/%d", c.Iat, c.Exp)
	}
	return nil
}

func pushPayload(owner, name, ref, sha string) []byte {
	now := time.Now()
	p := map[string]any{
		"ref": ref, "before": strings.Repeat("0", 39) + "1", "after": sha,
		"created": false, "deleted": false, "forced": false,
		"commits":     []any{map[string]any{"id": sha, "message": "fakepush", "timestamp": now.Format(time.RFC3339)}},
		"head_commit": map[string]any{"id": sha, "message": "fakepush", "timestamp": now.Format(time.RFC3339)},
		"repository": map[string]any{
			"id": 4242, "name": name, "full_name": owner + "/" + name, "private": false,
			"owner":          map[string]any{"login": owner, "name": owner, "id": 1},
			"default_branch": "main", "pushed_at": now.Unix(),
		},
		"pusher":       map[string]any{"name": owner},
		"sender":       map[string]any{"login": owner, "id": 1},
		"installation": map[string]any{"id": 777},
	}
	b, _ := json.Marshal(p)
	return b
}

func randomGUID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	h := hex.EncodeToString(b)
	return h[:8] + "-" + h[8:12] + "-" + h[12:16] + "-" + h[16:20] + "-" + h[20:]
}

func check(err error) {
	if err != nil {
		log.Fatal(err)
	}
}
