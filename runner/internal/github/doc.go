// Package github implements "git push to grade": the cppatlas GitHub App.
//
// A learner creates a repository from the challenge template, installs the
// cppatlas GitHub App on it, and every push to a branch is graded. The App
// receives the push webhook, fetches exactly the challenge's allowlisted files
// at the pushed commit, submits them to the shared run queue
// (protocol.Runner) and reports the outcome as a Check Run on that commit.
//
// # Wiring
//
//	cfg, configured := github.ConfigFromEnv(os.Getenv) // GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET, GITHUB_API_BASE_URL
//	var h http.Handler = github.Disabled()
//	if configured {
//		cfg.Runner, cfg.Logger = runner, logger
//		app, err := github.New(cfg) // fails on a malformed key
//		if err != nil { log.Fatal(err) }
//		defer app.Shutdown(ctx)
//		h = app.WebhookHandler()
//	}
//	mux.Handle("POST /github/webhook", h)
//
// # GitHub App registration
//
// Permissions: Checks read & write, Contents read-only, Metadata read-only.
// Events: Push. Webhook URL: https://run.cppatlas.com/github/webhook with a
// webhook secret. Installation tokens are requested per repository
// (repository_ids = [the pushed repo]) with exactly those three permissions.
//
// Endpoints used:
//
//	POST  /app/installations/{installation_id}/access_tokens   (App JWT)
//	GET   /repos/{owner}/{repo}/contents/{path}?ref={sha}      (installation token, Accept: application/vnd.github.raw+json)
//	POST  /repos/{owner}/{repo}/check-runs                     (installation token)
//	PATCH /repos/{owner}/{repo}/check-runs/{check_run_id}      (installation token)
//
// # The .cppatlas.json file
//
// An optional file at the repository root selects what is graded. It is read
// at the pushed commit, capped at 4 KB, and parsed strictly (unknown fields,
// wrong types, trailing data and out-of-range values are rejected; the commit
// then gets a failed check that explains the problem).
//
//	{
//	  "challenge": "vector",   // optional; default "vector"
//	  "stage": 3,              // optional; grade stages 1..3 (your current stage)
//	  "compiler": "clang",     // optional; "gcc" (default) or "clang"
//	  "sanitize": true         // optional; build with ASan+UBSan (preset "asan-ubsan")
//	}
//
// Without the file, or without "stage", every stage of the challenge is
// graded in order and grading stops at the first stage that does not pass
// (the "all unlocked stages" default). With "stage": N, stages 1..N are
// graded, also stopping at the first failure, exactly like `./cppatlas test N`.
// An unknown challenge or a stage outside 1..max is a failed check.
//
// # Which pushes are graded
//
// Every push that creates or updates a branch (refs/heads/*) and has a head
// commit, unless Config.DefaultBranchOnly is set. Branch deletions, tag pushes
// and pushes without a head commit are ignored. A commit already graded for a
// repository (same SHA, e.g. the same commit pushed to a second branch) is not
// graded again within the de-duplication window.
//
// # Check Run
//
// Name "cppatlas / <challenge>", head_sha = the pushed SHA. Created as
// "queued" as soon as the configuration is read, moved to "in_progress" once
// the run is accepted by the queue, completed with "success" / "failure"
// (learner outcome), "timed_out" (outer wall clock), "neutral" (infrastructure
// problem, full queue, rate limit, server restart) or "cancelled" (superseded
// by a newer push to the same branch before it started). All learner- or
// compiler-controlled text is rendered inside code spans or fenced code blocks
// whose fence is longer than any backtick run in the content, so it cannot
// inject Markdown, HTML or @mentions.
package github
