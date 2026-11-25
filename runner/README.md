# cppatlas runner

Code runner and git-push grader for the "build your own `std::vector`"
challenge on cppatlas.com. A Go API accepts a learner's `include/my/vector.hpp`
(from the website or from a GitHub push), compiles and tests it in a throwaway
sandbox, and returns structured results. Production runs on Fly.io at
`https://run.cppatlas.com`.

Related documents:

- [`scripts/deploy.md`](scripts/deploy.md): deploy and operate on Fly.io.
- [`github-app.md`](github-app.md): register the GitHub App; `fakepush` local test.
- [`SECURITY.md`](SECURITY.md): threat model and sandbox design.

## Architecture

```
 browser (cppatlas.com) ---- POST /runs, GET /runs/{id} ----+
 GitHub  ---- push webhook: POST /github/webhook -----------+
                                                            v
                                          +-------------------------------+
                                          |  API  (cmd/api, one process)  |
                                          |  validate, queue, rate limit, |
                                          |  in-memory run state          |
                                          +---------------+---------------+
                                                          |
                          BACKEND=docker                  |             BACKEND=fly
              +-------------------------------------------+------------------------------------+
              v                                                                                v
   docker run (job on stdin,                                           Machines API: one ephemeral machine per run
   result on stdout)                                                   in app cppatlas-grader (no secrets, no public IP)
              |                                                                                |
              v                                                                                v
        grader image  <-----------------  same image  ---------------->  grader image: GET /internal/job (fetch-once token),
        (compilers + tests + grader binary)                              POST /internal/result, over 6PN to
                                                                         cppatlas-runner.internal:8081
```

**API process** (`cmd/api`, `internal/httpapi`, `internal/runs`). Serves the
public API on `LISTEN_ADDR` (8080): `POST /runs`, `GET /runs/{id}`,
`POST /github/webhook`, `GET /healthz`. It validates submissions against the
challenge registry (file allowlist, sizes, stage range), applies per-client
rate limits and a global run-rate ceiling, queues runs (bounded queue with
per-source shares, bounded concurrency, per-client cap) and keeps run state in
memory for `RESULT_TTL` (bounded by `MAX_STORED_RUNS` / `MAX_STORED_BYTES`). All state is in memory, so
production runs exactly one machine.

**Backends** (`internal/backend`). Both turn a `protocol.Job` into a
`protocol.Result`.

- `docker` (local development, verification): `docker run` of the grader image
  per run; the job is written to stdin and the result read from stdout. Stale
  containers are cleaned up at start. `DOCKER_RUNTIME` (not part of the
  validated config, read directly by `cmd/api`) selects an OCI runtime such as
  `runsc` (gVisor).
- `fly` (production): creates one machine per run through the Machines API in
  a separate app, `cppatlas-grader`. The job never enters the machine
  configuration. The machine receives only a URL and a fetch-once token in its
  env, fetches its job from the API's private listener (`INTERNAL_LISTEN_ADDR`,
  `fly-local-6pn:8081`, reachable over 6PN only, never published), runs it, and
  posts the result back. The machine is always destroyed afterwards. An
  optional warm pool pre-creates unbooted machines to cut start time (see
  `scripts/deploy.md`). The grader app is separate because Fly injects an app's
  secrets into all of its machines, and these run untrusted code.

**Grader image** (`grader/Dockerfile`, `internal/grader`). Contains the
toolchains, the challenge's tests and the grader binary, which builds and runs
the requested stages under resource limits and prints one result document. The
private solution is excluded at build time. Test content never leaves the image
and never appears in results.

**GitHub App** (`internal/github`). Receives push webhooks, fetches the
allowlisted file at the pushed commit, submits it to the same queue, and posts a
`cppatlas / vector` check run. See [`github-app.md`](github-app.md).

### Layout

| Path | What |
| --- | --- |
| `cmd/api` | Process entry point, wiring |
| `internal/config` | Environment variable parsing and validation |
| `internal/protocol` | Shared contract: Submission, Job, Result, RunView, Runner |
| `internal/httpapi` | HTTP handlers, CORS, rate limits, client IP |
| `internal/runs` | Queue, run lifecycle, challenge registry, fetch-once rendezvous, internal endpoints |
| `internal/backend/docker`, `internal/backend/fly` | Backends |
| `internal/grader`, `grader/` | Grader binary logic and image definition |
| `internal/github` | GitHub App, `cmd/fakepush` test helper |
| `api/Dockerfile`, `fly.toml` | API image and Fly configuration |
| `scripts/build-grader.sh`, `scripts/deploy.md` | Grader image build; deploy runbook |

## Public API

Base URL `https://run.cppatlas.com` (locally `http://127.0.0.1:8080`). CORS is
allowed for `ALLOWED_ORIGINS`. Request bodies must be `application/json`, at
most 512 KB, with no unknown fields.

### `POST /runs`

```json
{
  "challenge": "vector",
  "stage": 3,
  "only": false,
  "files": { "include/my/vector.hpp": "...file contents..." },
  "options": { "compiler": "gcc", "preset": "debug", "trace": false }
}
```

- `challenge` and `stage` (integer >= 1, at most the challenge's stage count)
  are required; `files` must be a non-empty object (up to 8 entries) containing
  the challenge's required files and only allowlisted paths.
- `stage: N` grades stages 1..N and stops at the first failure. `"only": true`
  grades just stage N.
- `options` is optional: `compiler` `gcc` (default) or `clang`; `preset`
  `debug` (default) or `asan-ubsan`; `trace` attaches a capped trace of failing
  stages (the grader is asked for at most 64 KiB of trace per stage).

Response `202 Accepted`, with a `Location: /runs/<id>` header:

```json
{ "id": "Xk3f9...", "status": "queued", "url": "/runs/Xk3f9...", "queue_position": 1 }
```

Errors share one shape, `{"error":{"code":"...","field":"...","message":"..."}}`
(`field` only where relevant). Statuses: `400` invalid request or JSON (`invalid_request`,
`invalid_json`; malformed JSON gets a generic message), `413` body or files too large, `415` wrong content type,
`429` with `Retry-After`: `queue_full` (the queue is full, this source's
share of it is used up, or the global run-rate ceiling `GLOBAL_RUNS_PER_10MIN`
was hit), `too_many_runs` (this client already has `MAX_RUNS_PER_CLIENT` runs
in progress) or `rate_limited` (per-client rate limit); `503` `shutting_down`.
Run errors use the same codes in `error.code`.

The client for the per-client run cap and the rate limits is the client
address, with IPv6 addresses grouped by /64. Behind Fly (`TRUSTED_PROXY=fly`)
the address comes from Fly's proxy header.

### `GET /runs/{id}?wait=N`

Returns the run snapshot, `Cache-Control: no-store`. `wait` (seconds, max 25)
long-polls until the run is finished or the wait ends. Held long-polls are
capped per client (`LONGPOLL_MAX_PER_CLIENT`) and in total
(`LONGPOLL_MAX_TOTAL`); beyond the caps the request is answered immediately
with the current snapshot and the header `X-Long-Poll: degraded`. Clients
should simply poll again. `404 not_found` for an
unknown or expired id (runs are kept `RESULT_TTL` after finishing).

```json
{
  "id": "Xk3f9...",
  "status": "completed",
  "challenge": "vector",
  "stages": [1, 2, 3],
  "created_at": "...", "started_at": "...", "finished_at": "...",
  "result": {
    "run_id": "Xk3f9...",
    "status": "completed",
    "passed": false,
    "compiler": "g++ ...",
    "preset": "debug",
    "stages": [
      { "stage": 1, "status": "failed",
        "tests": [ { "name": "...", "status": "failed", "messages": ["..."] } ],
        "counts": { "total": 3, "passed": 1, "failed": 2 },
        "build_ms": 900, "run_ms": 12 },
      { "stage": 2, "status": "skipped", "build_ms": 0, "run_ms": 0 }
    ],
    "timings": { "total_ms": 4200, "setup_ms": 300, "build_ms": 3500, "test_ms": 400 }
  }
}
```

Run `status`: `queued` (with `queue_position`), `running`, `completed` (the
learner's code may still have failed: read `result.passed` and each stage),
`error` (infrastructure failure, see `error.code`/`error.message`), `timeout`
(outer wall clock exceeded). Stage `status`: `passed`, `failed`,
`compile_error` (see `compile.first_error`, `compile.output`), `timeout`,
`crashed` (see `signal`), `skipped`. Exact types: `internal/protocol/protocol.go`.

### `GET /healthz`

`200 {"status":"ok","backend":"..."}`. Used by the Fly health check. In
production it returns nothing else. Queue statistics are on `GET /internal/stats`
on the private 8081 listener (Fly backend, reachable over 6PN only) and in a
periodic `stats` log line (every 5 minutes). In local docker development mode
(`BACKEND=docker` with localhost origins allowed) `/healthz` still includes the
queue statistics.

### `POST /github/webhook`

GitHub only. Authenticated by the `X-Hub-Signature-256` HMAC. `503` when the
GitHub secrets are not configured.

## Local development

Requirements: Go (see `go.mod`), Docker.

Build the grader image for your machine (tag `cppatlas-grader:dev`, native
architecture; the challenge is taken from `../challenges/vector`):

```sh
scripts/build-grader.sh
```

Start the API with the docker backend (it defaults to `GRADER_IMAGE=cppatlas-grader:dev`
and allows localhost CORS origins):

```sh
BACKEND=docker go run ./cmd/api
```

Submit the starter file and poll the result (second terminal):

```sh
jq -n --rawfile v ../challenges/vector/include/my/vector.hpp \
  '{challenge:"vector", stage:1, files:{"include/my/vector.hpp":$v}}' > /tmp/body.json

curl -sS -X POST http://127.0.0.1:8080/runs \
  -H 'Content-Type: application/json' --data @/tmp/body.json
# {"id":"Xk3f9...","status":"queued","url":"/runs/Xk3f9...","queue_position":1}

curl -sS 'http://127.0.0.1:8080/runs/<id>?wait=20' | jq '.status, (.result.stages[] | {stage, status})'
```

The starter fails stage 1 on purpose, so expect `completed` with stage 1
`failed`.

To exercise the GitHub path without GitHub, see "Testing without GitHub" in
[`github-app.md`](github-app.md).

### Tests

```sh
go build ./... && go vet ./...
go test -race ./...
```

The unit tests need no Docker, no Fly and no network (the Fly and GitHub
backends are tested against local fakes), except the docker backend tests which
need a Docker daemon.

## Changing the challenge or its tests

- Test content, a new stage's tests, grader logic: edit `../challenges/vector`
  and/or `internal/grader`, then rebuild the image. Locally:
  `scripts/build-grader.sh`. In production:
  `scripts/build-grader.sh --push-fly`, set `GRADER_IMAGE` in `fly.toml` to the
  printed ref, and redeploy (see `scripts/deploy.md`). No API code change is
  needed.
- Number of stages, allowed file paths, size limits: these are API-side. The
  built-in registry (`runs.DefaultChallenges`) has `vector` with 8 stages and
  the single file `include/my/vector.hpp`. To change them, or add a challenge,
  point `CHALLENGES_FILE` at a JSON file: either an array or
  `{"challenges": [...]}` of

  ```json
  { "name": "vector", "stages": 8,
    "allowed_files": ["include/my/vector.hpp"],
    "required_files": ["include/my/vector.hpp"],
    "max_file_bytes": 262144, "max_total_bytes": 262144 }
  ```

  A new stage count must match what the grader image contains.

## Configuration

All configuration is environment variables, parsed and validated at start
(`internal/config`); all problems are reported together and the process exits
with status 2. Secrets are never logged. Production values are in `fly.toml`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `LISTEN_ADDR` | `:8080` (or `:$PORT`) | Public listener. On Fly: `0.0.0.0:8080` (IPv4 only, on purpose; see `scripts/deploy.md`) |
| `INTERNAL_LISTEN_ADDR` | `:8081` | Private listener for run machines (Fly backend). On Fly: `fly-local-6pn:8081` |
| `BACKEND` | `docker` | `docker` or `fly` |
| `GRADER_IMAGE` | `cppatlas-grader:dev` | Image to run. On Fly: `registry.fly.io/cppatlas-grader:<version>` |
| `DOCKER_RUNTIME` | empty | Docker backend only: OCI runtime (for example `runsc`) |
| `ALLOWED_ORIGINS` | `https://cppatlas.com,https://www.cppatlas.com` | Comma list of CORS origins; replaces the default |
| `ALLOW_LOCALHOST_ORIGINS` | on, except off when `BACKEND=fly` or `TRUSTED_PROXY=fly` | Also allow `http://localhost`/`127.0.0.1` origins |
| `TRUSTED_PROXY` | empty | `fly` to take the client IP from Fly's proxy header; empty ignores forwarding headers. With `fly`, keep the public listener IPv4-only (startup warning otherwise) |
| `RATE_RUNS_PER_MIN` / `RATE_RUNS_BURST` | `6` / `3` | Per-client `POST /runs` limit (client = address, IPv6 by /64) |
| `RATE_POLL_PER_MIN` / `RATE_POLL_BURST` | `120` / `30` | Per-client `GET /runs/{id}` limit |
| `RATE_WEBHOOK_PER_MIN` / `RATE_WEBHOOK_BURST` | `300` / `60` | Per-client webhook limit |
| `RATE_MAX_ENTRIES` | `10000` | Max tracked rate-limit keys |
| `LONGPOLL_MAX_PER_CLIENT` | `4` | Held `?wait=` long-polls per client (IPv6 by /64); beyond it the poll is answered at once with `X-Long-Poll: degraded` |
| `LONGPOLL_MAX_TOTAL` | `64` | Held long-polls in total; same degrade behaviour |
| `MAX_CONCURRENT_RUNS` | `4` | Runs executing at once (sandboxes / run machines) |
| `QUEUE_SIZE` | `20` | Runs allowed to wait; beyond that `429 queue_full` |
| `QUEUE_MAX_WEB` | 3/4 of `QUEUE_SIZE` (at least 1) | Queue slots the web API may use |
| `QUEUE_MAX_GITHUB` | 1/2 of `QUEUE_SIZE` (at least 1) | Queue slots GitHub pushes may use |
| `MAX_RUNS_PER_CLIENT` | `2` | Queued plus running runs per client (IPv6 by /64); `0` = unlimited. Beyond it `429 too_many_runs` |
| `GLOBAL_RUNS_PER_10MIN` | `120` | Global ceiling on accepted runs per 10 minutes, all clients together; `0` = off. Beyond it `429 queue_full` |
| `GLOBAL_RUNS_BURST` | `40` | Burst size for the global ceiling |
| `RUN_TIMEOUT` | `120s` | Outer wall clock per run |
| `RESULT_TTL` | `15m` | How long a finished run stays readable |
| `MAX_STORED_RUNS` | `500` | Finished runs kept in memory; oldest evicted first |
| `MAX_STORED_BYTES` | `67108864` (64 MiB) | Total encoded size of stored finished runs; oldest evicted first |
| `MAX_RESULT_BYTES` | `524288` (512 KiB) | Largest result document accepted from a grader |
| `CHALLENGES_FILE` | empty (built-in `vector`) | Challenge registry JSON |
| `DEFAULT_COMPILER` | `gcc` | `gcc` or `clang` |
| `DEFAULT_PRESET` | `debug` | `debug` or `asan-ubsan` |
| `FLY_API_TOKEN` | none (required when `BACKEND=fly`) | Secret: deploy token for the grader app only |
| `FLY_GRADER_APP` | `cppatlas-grader` | App that holds run machines |
| `GRADER_REGION` | none (required when `BACKEND=fly`) | Region for run machines (`sin`) |
| `GRADER_VM_CPU_KIND` | `shared` | `shared` or `performance` |
| `GRADER_VM_CPUS` | `4` | vCPUs per run machine |
| `GRADER_VM_MEMORY_MB` | `4096` | Memory per run machine |
| `FLY_API_BASE_URL` | `https://api.machines.dev` | Machines API (override for tests) |
| `INTERNAL_API_URL` | `http://cppatlas-runner.internal:8081` | URL run machines call back |
| `WARM_POOL_SIZE` | `0` (off) | Pre-created unbooted machines; trade-off in `scripts/deploy.md` |
| `FLY_BIND_PEER` | `true` | Bind each run token to the run machine's private 6PN address; `false` only as a temporary workaround (see `scripts/deploy.md`) |
| `GITHUB_APP_ID` | empty | GitHub App ID. All three GitHub settings or none |
| `GITHUB_APP_PRIVATE_KEY` | empty | Secret: App private key PEM (literal `\n` escapes accepted) |
| `GITHUB_WEBHOOK_SECRET` | empty | Secret: webhook HMAC secret |
| `GITHUB_API_BASE_URL` | `https://api.github.com` | Override for `fakepush` (plain http only for loopback) |
| `GITHUB_DEFAULT_BRANCH_ONLY` | off | `1`/`true`/`yes`: grade only the default branch (read by `internal/github`, not by `internal/config`) |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |

Logs are JSON on stderr.
