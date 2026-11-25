# Deploying the cppatlas runner to Fly.io

Operator runbook. Every command is run by a human; nothing here is automated.
Run commands from the `runner/` directory unless stated otherwise.

Two Fly apps, both in org `personal`, region `sin`, on one private network:

| App | Purpose | Deployed with |
| --- | --- | --- |
| `cppatlas-runner` | The API (`run.cppatlas.com`). One always-on machine. Holds all secrets. | `fly deploy` |
| `cppatlas-grader` | Only ephemeral run machines the API creates (one per run). No secrets, no services, no public IPs. | Never deployed; it only needs to exist and hold the grader image |

> **WARNING: only ever use the Fly org `personal`.**
> This account is also a member of an org called `rakshith-aloori`. It belongs
> to someone else. Never create apps, machines, tokens, IPs, certificates or
> images in it. Pass `--org personal` to every command that accepts an org, and
> never accept a prompt that offers any other org.

## 0. Prerequisites

- `fly` (flyctl) logged in, `docker` with buildx, `rsync`, `openssl`, `jq`,
  and the Vercel CLI (`vercel`) logged in to the team that owns `cppatlas.com`.
- The repo checked out with `challenges/vector` present (the grader image is
  built from it).

Check the account and org before anything else:

```sh
fly auth whoami
fly orgs list
fly apps list --org personal
```

`fly orgs list` shows both `personal` and `rakshith-aloori`. Confirm you will
only touch `personal`. The `apps list` must not show anything you do not
recognise as yours.

## 1. Create the apps on a dedicated private network

Fly's private network (6PN) is org-wide by default: every app in an org can
reach every other app's `.internal` addresses. Run machines execute untrusted
code, so both apps are put on their own custom network, `cppatlas`. They can
reach each other (`cppatlas-runner.internal:8081`) but not any other app in
the `personal` org. A custom network that does not exist yet is created by the
first `apps create --network`.

```sh
fly apps create cppatlas-runner --org personal --network cppatlas
fly apps create cppatlas-grader --org personal --network cppatlas
```

Verify (both must list `personal` as the owner, and nothing may appear in any
other org):

```sh
fly apps list --org personal
fly status -a cppatlas-runner
fly status -a cppatlas-grader
```

The network is fixed at app creation and cannot be changed afterwards. If
either app was created without `--network cppatlas`, destroy it
(`fly apps destroy <name>`) and recreate it before putting anything in it.

## 2. Build and push the grader image

The grader image contains the compilers, the challenge tests and the grader
binary. It is pushed to the registry repository of `cppatlas-grader`.

```sh
scripts/build-grader.sh --push-fly
```

The script builds `linux/amd64`, runs `fly auth docker`, and pushes
`registry.fly.io/cppatlas-grader:<version>`, where `<version>` is
`<git short sha>-<hash of the challenge tree>`. It prints the final line:

```
image ref: registry.fly.io/cppatlas-grader:abc123def-1a2b3c4d
```

Copy that ref. The script prints the Fly user and reminds you the org must be
`personal`; it never creates apps (that is why step 1 comes first).

Feed the ref to the API through `GRADER_IMAGE` in `fly.toml` `[env]`. It is
not a secret, it must survive redeploys, and keeping it in git leaves a record
of which grader image production uses. Edit this line in `runner/fly.toml`:

```toml
  GRADER_IMAGE = "registry.fly.io/cppatlas-grader:abc123def-1a2b3c4d"
```

(A one-off alternative is `fly deploy --env GRADER_IMAGE=<ref>`, but that value
is lost by the next deploy that omits the flag, so prefer the file.)

## 3. IP addresses (cppatlas-runner only)

Allocate these before the first deploy so `fly deploy` does not pick its own:

```sh
fly ips allocate-v4 --shared -a cppatlas-runner
fly ips allocate-v6 -a cppatlas-runner
fly ips list -a cppatlas-runner
```

A shared IPv4 plus a dedicated IPv6 is free and enough for a hostname served
over HTTPS. A dedicated IPv4 costs money (about $2/month) and is not needed.
Allocate nothing for `cppatlas-grader`: run machines have no services and no
public addresses.

## 4. Secrets on cppatlas-runner

Secrets are set on `cppatlas-runner` only. Never put any secret on
`cppatlas-grader`: Fly injects an app's secrets into every machine of that
app, and those machines run untrusted learner code. That is the whole reason
the grader is a separate app.

Never echo a secret, never put one in a file in the repo, never type one
inline in a command (it lands in shell history).

`--stage` sets a secret without restarting anything; it is applied by the next
`fly deploy`. Use it before the first deploy (the app has no machine yet). Once
the API is running, omit `--stage` to apply a change immediately (Fly restarts
the machine).

With `BACKEND=fly` the API refuses to start without `FLY_API_TOKEN`
(configuration error, exit code 2), so 4a is required before the first deploy.

### 4a. FLY_API_TOKEN

An app-scoped deploy token that can manage `cppatlas-grader` only (create and
destroy its machines). It is piped from the token command into
`fly secrets import` through a command substitution, so it never appears on
screen or in shell history.

```sh
printf 'FLY_API_TOKEN=%s\n' "$(fly tokens create deploy -a cppatlas-grader -n cppatlas-runner-api -x 8760h)" \
  | fly secrets import -a cppatlas-runner --stage
```

- The token includes a `FlyV1 ` prefix and a space; `import` reads
  `NAME=VALUE` lines from stdin, so the whole value is kept.
- `-x 8760h` makes it valid for one year (the default is 20 years). Note the
  expiry and rotate before it ends (see "Rotate FLY_API_TOKEN").
- Check it is set (shows a digest, never the value):
  `fly secrets list -a cppatlas-runner`.

### 4b. GitHub App secrets (optional; can be added after the first deploy)

The App ID is `5916751` (not secret). All three of `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` and
`GITHUB_WEBHOOK_SECRET` must be set together: if only some are set the API
refuses to start. If none are set the webhook returns 503 and everything else
works, so the API can be deployed first and the GitHub App added later.

Create the local secret files once. They live outside the repo
(`runner/.gitignore` also ignores `*.pem`):

```sh
umask 077
mkdir -p ~/.config/cppatlas-runner
printf "%s" "$(openssl rand -hex 32)" > ~/.config/cppatlas-runner/webhook-secret   # no trailing newline
chmod 600 ~/.config/cppatlas-runner/webhook-secret
```

The GitHub App's private key is downloaded when the App is created and moved
to `~/.config/cppatlas-runner/app.pem` (`chmod 600`). Registering the App is
described in [`../github-app.md`](../github-app.md); the webhook secret file
above is used there too.

Then set the three secrets (replace `<APP_ID>` with the numeric App ID shown
on the App's settings page; it is not secret):

```sh
fly secrets set -a cppatlas-runner --stage \
  GITHUB_APP_ID=5916751 \
  GITHUB_APP_PRIVATE_KEY="$(cat ~/.config/cppatlas-runner/app.pem)" \
  GITHUB_WEBHOOK_SECRET="$(cat ~/.config/cppatlas-runner/webhook-secret)"
```

If the API is already deployed, drop `--stage` so the machine restarts with
them.

## 5. Deploy (first time)

With the image ref in `fly.toml`, IPs allocated and the secrets staged. Run
from `runner/` (the build context is that directory):

```sh
fly deploy -c fly.toml -a cppatlas-runner --ha=false --no-public-ips
fly scale count 1 -a cppatlas-runner --yes
fly status -a cppatlas-runner
fly logs -a cppatlas-runner
```

`--ha=false` creates one machine instead of two, and `--no-public-ips` stops
`fly deploy` from allocating addresses itself. `fly status` must show exactly one machine in state `started` in `sin`.
The log shows `listening` for both `public` (`0.0.0.0:8080`) and `internal`
(`fly-local-6pn:8081`), and a `cppatlas-api started` line with the
configuration (secrets print as `[redacted]`). If you did not set the GitHub
secrets you will also see `github integration disabled`.

Do not change `LISTEN_ADDR = "0.0.0.0:8080"` in `fly.toml`. It is IPv4 only
on purpose: Fly's proxy reaches the app there, while a peer on the private
IPv6 network (6PN) cannot connect to it and forge `Fly-Client-IP`. Binding
`:8080` would also listen on 6PN. The API logs a startup warning if
`TRUSTED_PROXY=fly` is combined with any other bind; treat that warning as an
error.

Run tokens are bound to the run machine's private 6PN address
(`FLY_BIND_PEER`, default `true`): the job and result endpoints only accept a
token from the machine it was issued for. First-deploy check (also required
the first time `WARM_POOL_SIZE` is enabled): submit one run (step 7) and
confirm it completes. If every run ends in an `error` (infrastructure error)
right after deploy while `fly logs -a cppatlas-runner` shows job fetches
answered 404, the peer binding assumption does not hold on this network. As a
temporary workaround set `FLY_BIND_PEER = "false"` in `fly.toml` and redeploy,
then report it, because it weakens the token binding.

Later deploys (code changes, new `GRADER_IMAGE`):

```sh
fly deploy -c fly.toml -a cppatlas-runner --ha=false
```

Run it from `runner/`. Always check `fly status -a cppatlas-runner` shows one
machine afterwards.

## 6. Certificate and DNS (run.cppatlas.com)

```sh
fly certs add run.cppatlas.com -a cppatlas-runner
fly certs check run.cppatlas.com -a cppatlas-runner
```

`certs add` prints the DNS records Fly needs, and `certs check` (alias
`certs show`) repeats them and reports their status. DNS for `cppatlas.com` is
on Vercel DNS and managed with the Vercel CLI.

Point the hostname at the app. A CNAME on a subdomain is fine alongside the
apex records Vercel already serves for the site:

```sh
vercel dns add cppatlas.com run CNAME cppatlas-runner.fly.dev
```

Add the ownership/ACME record Fly asks for. It is typically a CNAME for the
`_acme-challenge` label, whose target is shown by `fly certs check`. Copy the
target from that output (placeholder below):

```sh
vercel dns add cppatlas.com _acme-challenge.run CNAME <target-from-fly-certs-check>
```

(For example `run.cppatlas.com.<id>.flydns.net`. Use exactly what Fly prints,
and check whether it wants a trailing dot.) If Fly asks for other records
(for example A/AAAA instead of the CNAME), add those with `vercel dns add`
using the same syntax.

Verify and wait for issuance (usually a minute or two, can take longer):

```sh
vercel dns ls cppatlas.com
fly certs check run.cppatlas.com -a cppatlas-runner
```

Repeat `certs check` until it reports the certificate as issued.

## 7. Post-deploy checks

Health:

```sh
curl -sS https://run.cppatlas.com/healthz
```

Expected: `{"status":"ok","backend":"fly"}`. The public endpoint shows no
queue numbers. To see statistics, read the periodic `stats` log line (every
5 minutes):

```sh
fly logs -a cppatlas-runner | grep stats
```

`GET /internal/stats` exists on the private 8081 listener, but it is reachable
over 6PN only, and `fly ssh console` is not available (the API image is
distroless), so logs are the way.

Submit the starter file (it should compile and fail stage 1, which proves the
whole path: API, Machines API, run machine, 6PN callback). Build the body with
`jq`; the file is untrusted input, so never interpolate it into JSON by hand:

```sh
jq -n --rawfile v ../challenges/vector/include/my/vector.hpp \
  '{challenge:"vector", stage:1, files:{"include/my/vector.hpp":$v}}' > /tmp/body.json

curl -sS -X POST https://run.cppatlas.com/runs \
  -H 'Content-Type: application/json' --data @/tmp/body.json
# -> 202 {"id":"...","status":"queued","url":"/runs/...","queue_position":1}

curl -sS 'https://run.cppatlas.com/runs/<id>?wait=25' | jq '.status, .result.stages'
```

The first run after a grader rebuild can take tens of seconds while the host
pulls the image (see "Warm pool"). Expected final status is `completed` with
stage 1 `failed` (the starter is deliberately wrong). `error` with code
`backend_unavailable` means the Machines API call failed: check `fly logs`.

Also check:

```sh
fly logs -a cppatlas-runner
fly machines list -a cppatlas-grader
```

`fly machines list -a cppatlas-grader` should be empty when idle (run machines
destroy themselves; a machine that lingers more than a few minutes is a leak,
see "Rollback and teardown").

Optionally confirm the private callback port is not public: it is not in any
service section of `fly.toml`, so `curl https://run.cppatlas.com:8081/` must
fail.

## 8. Updating the grader or the tests

Changing tests, the grader code, or the challenge tree needs no API code
change. Rebuild and push the image, point the API at it, redeploy:

```sh
scripts/build-grader.sh --push-fly
# edit GRADER_IMAGE in fly.toml to the printed ref, then
fly deploy -c fly.toml -a cppatlas-runner --ha=false
```

In-flight runs are lost on redeploy (state is in memory); do it when idle
(check the latest `stats` line in `fly logs -a cppatlas-runner`; `/healthz`
does not show queue numbers).

If the number of stages or the file allowlist changes, the API must also know:
provide a challenges file through `CHALLENGES_FILE` (see README.md), or
change the built-in default in `internal/runs/config.go`.

Old images stay in the registry; never delete the one the API currently
points at.

## 9. Machine size and cost knobs

Set in `fly.toml` `[env]` (or `fly deploy --env`):

| Variable | Default | Notes |
| --- | --- | --- |
| `GRADER_VM_CPU_KIND` | `shared` | `shared` or `performance` |
| `GRADER_VM_CPUS` | `4` | |
| `GRADER_VM_MEMORY_MB` | `4096` | |

Default is `shared-cpu-4x` with 4096 MB. The alternative for faster, steadier
builds is `GRADER_VM_CPU_KIND=performance`, `GRADER_VM_CPUS=2`, `GRADER_VM_MEMORY_MB=4096`
(performance-2x). Check that the combination is a valid Fly size:

```sh
fly platform vm-sizes
```

Cost estimates, taken from Fly's pricing page. These are estimates: re-check
them in the calculator at https://fly.io/calculator before relying on them.

| Item | Estimate |
| --- | --- |
| API machine, shared-cpu-1x, 512 MB, always on | about $3.69/month (about $2.19/month at 256 MB) |
| One run on shared-cpu-4x / 4 GB | about $0.0000103/s: about $0.0003 for a 30 s run, about $0.0012 at the 120 s cap |
| One run on performance-2x / 4 GB | about $0.0000255/s |
| `cppatlas-grader` app at idle | $0 (no machines) |
| Warm pool | about $0.23 per stopped slot per month (root filesystem storage) |
| IPs | shared IPv4 and dedicated IPv6: free. Dedicated IPv4 is paid and not needed |

Worst-case spend: the global run-rate ceiling (`GLOBAL_RUNS_PER_10MIN`, 120
runs per 10 minutes by default) and at most 4 concurrent machines
(`MAX_CONCURRENT_RUNS`) bound the compute bill to about 4 x $0.0000103/s,
which is about $0.15 per hour or about $3.6 per day on shared-cpu-4x / 4 GB,
even if saturated continuously. To tighten it, lower `MAX_CONCURRENT_RUNS`,
`GLOBAL_RUNS_PER_10MIN` or `RUN_TIMEOUT`.

## 10. Optional warm pool

`WARM_POOL_SIZE=N` (default `0`, off). Cold start versus cost:

- Cold (default): each run creates a machine. Fly has to place it, pull and
  unpack the grader image on the host (fast when that host has the image
  cached, tens of seconds for a roughly 1.5 GB image when it does not) and
  boot it.
- Warm: the API keeps N machines pre-created but never booted (state
  `created`). A run starts one of them, which skips placement and image
  preparation and typically boots in about a second. A created/stopped
  machine is billed only for its root filesystem, about $0.23/month per slot,
  so a pool of 2 is roughly $0.50/month.
- Costs of warm: slots are pinned to particular hosts, so a start can fail
  when that host is out of capacity (the API then falls back to a cold
  create), and each slot holds an unbound token for up to the slot's maximum
  age (1 hour) before it is recycled.
- A machine is never reused after a run (it ran untrusted code); it is
  destroyed and the pool is refilled in the background.

Enable it in `fly.toml` `[env]` (`WARM_POOL_SIZE = "2"`) and redeploy, then
repeat the first-deploy check from step 5 (submit one run, confirm it
completes; job fetches answered 404 point at the `FLY_BIND_PEER` issue). After
a grader image change the pool slots still hold the old image until they age
out and are replaced; to refresh them immediately, redeploy (the API restarts
and the janitor removes untracked machines).

## Rollback and teardown

### Stop accepting runs

Fastest, reversible: stop the API machine. Public runs and the webhook then
fail at the edge; no new run machines are created.

```sh
fly machines list -a cppatlas-runner
fly machines stop <machine-id> -a cppatlas-runner
# later
fly machines start <machine-id> -a cppatlas-runner
```

To stop only the GitHub integration, remove its secrets (the webhook then
returns 503) and leave the web API running:

```sh
fly secrets unset -a cppatlas-runner GITHUB_APP_ID GITHUB_APP_PRIVATE_KEY GITHUB_WEBHOOK_SECRET
```

(Or suspend/uninstall the GitHub App from its settings page.)

To roll back a bad API release, redeploy a known-good commit
(`git checkout <sha> -- .` is not needed: check out the commit and run the
deploy command), or point `GRADER_IMAGE` back to the previous
`registry.fly.io/cppatlas-grader:<version>` and redeploy.

### Destroy leftover run machines

Run machines normally destroy themselves. After an API crash or a bad deploy,
the API's janitor removes untracked machines on its own; to do it by hand:

```sh
fly machines list -a cppatlas-grader
fly machines destroy --force -a cppatlas-grader <machine-id> <machine-id>
```

Destroy them all (only when you mean it):

```sh
fly machines list -a cppatlas-grader -q | xargs -n1 fly machines destroy --force -a cppatlas-grader
```

### Rotate FLY_API_TOKEN

Create the new token, set it, deploy/restart, then revoke the old one:

```sh
printf 'FLY_API_TOKEN=%s\n' "$(fly tokens create deploy -a cppatlas-grader -n cppatlas-runner-api -x 8760h)" \
  | fly secrets import -a cppatlas-runner
fly tokens list -a cppatlas-grader
fly tokens revoke <old-token-id>
```

`fly secrets import` without `--stage` restarts the single machine. Treat a
suspected leak of the token as urgent: rotate immediately, then destroy
leftover machines as above.

### Rotate the webhook secret

Generate a new value, update the API, then the GitHub App (webhooks signed
with the old secret are rejected with 401 until both match):

```sh
umask 077
printf "%s" "$(openssl rand -hex 32)" > ~/.config/cppatlas-runner/webhook-secret   # no trailing newline
chmod 600 ~/.config/cppatlas-runner/webhook-secret
fly secrets set -a cppatlas-runner GITHUB_WEBHOOK_SECRET="$(cat ~/.config/cppatlas-runner/webhook-secret)"
pbcopy < ~/.config/cppatlas-runner/webhook-secret
```

Paste the clipboard into the GitHub App's "Webhook secret" field and save.

To rotate the GitHub App private key, generate a new key on the App's
settings page, replace `~/.config/cppatlas-runner/app.pem`, set
`GITHUB_APP_PRIVATE_KEY` again, then delete the old key on GitHub.

### Full teardown

```sh
fly machines list -a cppatlas-grader
fly apps destroy cppatlas-grader
fly apps destroy cppatlas-runner
fly certs remove run.cppatlas.com -a cppatlas-runner   # before destroying the runner
vercel dns ls cppatlas.com                             # then: vercel dns rm <record-id> for run and _acme-challenge.run
```

Do the cert removal before destroying `cppatlas-runner`. Confirm each
`fly apps destroy` prompt names the app you intended and that the app is in
`personal`.
