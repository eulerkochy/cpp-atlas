# Registering the cppatlas GitHub App

The GitHub App is what turns `git push` into a graded check for the "build your
own std::vector" challenge. A learner installs the App on their own repository;
every push triggers a webhook to the runner API, which fetches
`include/my/vector.hpp` (and `.cppatlas.json`) at the pushed commit, grades it,
and reports a check run named `cppatlas / vector` on that commit.

Do this after the API is deployed (see [`scripts/deploy.md`](scripts/deploy.md)).
The API works without it; until the App's secrets are set on the API, the
webhook endpoint returns 503.

## 1. Prepare the webhook secret and a place for the key

On your machine, once. The files live outside the repo:

```sh
umask 077
mkdir -p ~/.config/cppatlas-runner
printf "%s" "$(openssl rand -hex 32)" > ~/.config/cppatlas-runner/webhook-secret   # no trailing newline
chmod 600 ~/.config/cppatlas-runner/webhook-secret
```

If the file already exists (for example from an earlier setup), keep it:
whatever is in it must be both the API's `GITHUB_WEBHOOK_SECRET` and the App's
webhook secret.

## 2. Register the App

Open https://github.com/settings/apps/new while signed in as the account that
should own the App. For an organisation, use
`https://github.com/organizations/<org>/settings/apps/new` instead (or
Settings -> Developer settings -> GitHub Apps -> New GitHub App on the
org). A personal account is fine; an organisation is better if more people
will maintain the App. The owner can be changed later only by transferring the
App.

Navigation path: GitHub -> Settings -> Developer settings -> GitHub Apps ->
New GitHub App.

Fill in:

| Field | Value |
| --- | --- |
| GitHub App name | A unique name, for example `cppatlas`. It becomes the slug in the install URL (`https://github.com/apps/<slug>`) |
| Description | Optional, e.g. "Grades your std::vector from cppatlas.com on every push" |
| Homepage URL | `https://cppatlas.com` |
| Callback URL | Leave empty |
| Request user authorization (OAuth) during installation | Off |
| Enable Device Flow | Off |
| Expire user authorization tokens | Irrelevant (no user authorization is used) |
| Setup URL | Empty. Optionally a cppatlas page that tells learners what to do next (for example `https://cppatlas.com/build/vector`); "Redirect on update" off |
| Webhook: Active | On |
| Webhook URL | `https://run.cppatlas.com/github/webhook` |
| Webhook secret | The exact contents of `~/.config/cppatlas-runner/webhook-secret` |
| SSL verification | Enable SSL verification |

Copy the secret into the clipboard without printing it, then paste it into the
field:

```sh
pbcopy < ~/.config/cppatlas-runner/webhook-secret
```

The file is written without a trailing newline (see the `printf` form above),
so what `pbcopy` puts on the clipboard is exactly the value the API signs with.
If you later get 401s, the two sides differ: re-copy with `pbcopy` rather than
selecting it by hand.

Repository permissions (set exactly these, nothing else):

| Permission | Access |
| --- | --- |
| Checks | Read and write |
| Contents | Read-only |
| Metadata | Read-only (mandatory; selected by default) |

Account and organization permissions: none.

Subscribe to events: tick **Push** only. (Ping is sent automatically. Do not
subscribe to anything else; the API ignores other events.)

Where can this GitHub App be installed: **Any account**. Learners install it on
their own repositories, which only works if the App is public.

Click **Create GitHub App**.

## 3. After creation

1. Note the **App ID** at the top of the App's settings page (a number). This
   is `GITHUB_APP_ID`. It is not secret. The registered cppatlas App's ID is
   **5916751**.
2. Scroll to **Private keys** and click **Generate a private key**. A `.pem`
   file is downloaded.
3. Move it out of Downloads and lock it down. Never put it in the repo
   (`runner/.gitignore` ignores `*.pem` as a safety net, but do not rely on it):

   ```sh
   umask 077
   mkdir -p ~/.config/cppatlas-runner
   mv ~/Downloads/<downloaded-name>.private-key.pem ~/.config/cppatlas-runner/app.pem
   chmod 600 ~/.config/cppatlas-runner/app.pem
   ```

4. Set the three secrets on the API (from `runner/`). Without `--stage` the
   machine restarts and picks them up; the restart drops any run in progress,
   so do it when idle:

   ```sh
   fly secrets set -a cppatlas-runner \
     GITHUB_APP_ID=5916751 \
     GITHUB_APP_PRIVATE_KEY="$(cat ~/.config/cppatlas-runner/app.pem)" \
     GITHUB_WEBHOOK_SECRET="$(cat ~/.config/cppatlas-runner/webhook-secret)"
   ```

   All three are required together. If the API was not deployed yet, add
   `--stage` and follow `scripts/deploy.md`.

5. Make the App public: App settings -> **Advanced** (or **Optional features**)
   and, under "Make public", confirm the App is public. If you registered it
   with "Any account" it already can be installed by others; the public page
   `https://github.com/apps/<slug>` must load when you are signed out.

   Confirm the logs show the integration is on (no "github integration
   disabled" line):

   ```sh
   fly logs -a cppatlas-runner
   ```

## 4. Verify the webhook

1. App settings -> **Advanced** -> **Recent Deliveries**. GitHub sent a `ping`
   when the App was created (or press **Redeliver** on it after the secrets are
   set). The response must be `200` with body `pong`.
2. Install the App on a test repository you own (see below), then push a commit
   to any branch. The Recent Deliveries list shows a `push` with response
   `202` (`queued`). A `200` with `ignored: ...` means the delivery was valid
   but deliberately not graded (tag push, branch deletion, and so on).
3. On the commit (or the repository's Actions/Checks area) a check named
   `cppatlas / vector` appears: queued, in progress, then completed.

Redeliver any delivery from its detail page (**Redeliver**). A redelivery of a
push whose commit was already graded returns `200` ("duplicate delivery" or
"commit already graded") and is not graded again; push a new commit (an empty
one works: `git commit --allow-empty -m regrade && git push`) to grade again.

## 5. What learners do

Install URL to give learners:

```
https://github.com/apps/<slug>/installations/new
```

Learner repositories are created from the template repository
`eulerkochy/cpp-vector-challenge`, which has the challenge files at the
repository root: `include/my/vector.hpp`, `tests/` and `.cppatlas.json`
(`{"challenge":"vector","stage":N}`; learners commit a higher `stage` as they
advance). They pick that repository and install. Choose "Only select repositories" rather than all
repositories. After that, every push to a branch is graded.

The App's access: it can read the repository contents at the pushed commit and
write checks. The API requests a token scoped to the one pushed repository with
exactly those three permissions and fetches only the allowlisted file
`include/my/vector.hpp` and the optional `.cppatlas.json`. The `tests/`
directory in the learner's repository is never fetched or used: grading always
runs stages 1..N against the test copy baked into the grader image, so editing
the tests in a repository cannot change the result.

### Which pushes are graded

- Every push that creates or updates a branch (`refs/heads/*`) and has a head
  commit.
- Not graded: tag pushes, branch deletions, pushes without a head commit,
  events for repositories whose `pushed_at` is older than 24 hours (stale
  redeliveries).
- A commit already graded for a repository (same SHA, for example pushed to a
  second branch) is not graded again within the de-duplication window.
- If the API runs with `GITHUB_DEFAULT_BRANCH_ONLY=true` (an optional
  environment variable, off by default), only pushes to the default branch are
  graded.
- A newer push to the same branch before the older one started cancels the
  older check ("Superseded by a newer push").

### The default and `.cppatlas.json`

Without a `.cppatlas.json`, every stage of the challenge is graded in order and
grading stops at the first stage that does not pass.

An optional `.cppatlas.json` at the repository root selects what is graded. It
is read at the pushed commit, capped at 4 KB, and parsed strictly: unknown
fields, wrong types, trailing data or out-of-range values produce a failed
check that explains the problem.

```json
{
  "challenge": "vector",
  "stage": 3,
  "compiler": "clang",
  "sanitize": true
}
```

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `challenge` | string | `"vector"` | Which challenge to grade. An unknown name is a failed check |
| `stage` | integer | all stages | Grade stages 1..N, stopping at the first failure (same as `./cppatlas test N`). Must be within 1..the challenge's stage count (8 for `vector`) |
| `compiler` | `"gcc"` or `"clang"` | `"gcc"` | Which compiler builds the submission |
| `sanitize` | boolean | `false` | `true` builds with AddressSanitizer and UndefinedBehaviorSanitizer (preset `asan-ubsan`) |

All fields are optional; `{}` is the same as no file.

## 6. Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| Recent Deliveries shows `401` | Signature mismatch: the App's webhook secret differs from the API's `GITHUB_WEBHOOK_SECRET`. Re-copy with `pbcopy < ~/.config/cppatlas-runner/webhook-secret`, paste into the App, save, and re-set the secret on the API with `fly secrets set` from the same file. Then redeliver |
| `503` ("GitHub integration is not configured") | The three secrets are not all set on `cppatlas-runner`, so the webhook is disabled. Check `fly secrets list -a cppatlas-runner` for `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`; set them and restart. A `503` "shutting down" means the API was restarting; redeliver |
| `429` or `202` "rate limited" | Per-IP webhook rate limit or per-installation limit; wait a minute and redeliver |
| Delivery failed / timed out (no response) | `run.cppatlas.com` is down or the certificate is not issued yet: `curl https://run.cppatlas.com/healthz`, `fly certs check run.cppatlas.com -a cppatlas-runner`, `fly status -a cppatlas-runner` |
| Delivery is `200` `ignored: ...` | Not a graded push (tag, deletion, stale event, or non-default branch when `GITHUB_DEFAULT_BRANCH_ONLY=true`). Read the reason in the response body |
| Delivery is `202` but no check appears | The App is not installed on that repository, or it lacks the **Checks: Read and write** permission (an installation that predates a permission change must accept the new permissions; check the installation page). `fly logs -a cppatlas-runner` shows the failing GitHub API call |
| Check is `neutral` ("cppatlas could not grade this commit" / "cppatlas is busy" / "Rate limited") | Infrastructure, not the learner's code: the run queue or the grading backlog is full, the installation pushed too often, the runner restarted, or the Fly run machine could not be created. Push again in a few minutes. For repeated cases check `fly logs -a cppatlas-runner` and `fly machines list -a cppatlas-grader` |
| Check is `failure` with a message about `.cppatlas.json` | The file is invalid (unknown field, wrong type, stage out of range, over 4 KB). The message names the problem |
| Check is `failure` with "file not found" style message | `include/my/vector.hpp` is missing from the commit |
| Check is `timed_out` | The run exceeded the outer wall clock (`RUN_TIMEOUT`, 120 s) |
| API fails to start after setting secrets | One of the three secrets is empty, or the private key PEM is malformed. Look at `fly logs`; re-run the `fly secrets set` command with the file contents |

## 7. Testing without GitHub (fakepush)

`internal/github/cmd/fakepush` serves a mock GitHub REST API (installation
token, contents at a SHA, check runs) and sends one correctly signed push event
to a locally running API. Nothing leaves your machine. From `runner/`, in two
terminals. The API needs the grader image (`scripts/build-grader.sh`) and
Docker.

Terminal 1:

```sh
go run ./internal/github/cmd/fakepush --gen-key /tmp/cppatlas-app.pem

GITHUB_APP_ID=1 \
GITHUB_APP_PRIVATE_KEY="$(cat /tmp/cppatlas-app.pem)" \
GITHUB_WEBHOOK_SECRET=dev-secret \
GITHUB_API_BASE_URL=http://127.0.0.1:8099 \
BACKEND=docker go run ./cmd/api
```

Terminal 2:

```sh
go run ./internal/github/cmd/fakepush \
  --webhook-url http://127.0.0.1:8080/github/webhook --secret dev-secret \
  --file ../challenges/vector/include/my/vector.hpp --stage 1 \
  --listen 127.0.0.1:8099 --app-key /tmp/cppatlas-app.pem
```

Flags:

| Flag | Default | Meaning |
| --- | --- | --- |
| `--secret` | (required) | Webhook secret; must equal the API's `GITHUB_WEBHOOK_SECRET` |
| `--file` | (required) | Local file served as `include/my/vector.hpp` |
| `--webhook-url` | `http://127.0.0.1:8080/github/webhook` | The API's webhook endpoint |
| `--listen` | `127.0.0.1:8099` | Address of the mock GitHub API; set `GITHUB_API_BASE_URL=http://<listen>` on the API |
| `--stage` | `0` | Serve a `.cppatlas.json` with this stage (0 = no file, so all stages) |
| `--config` | | Serve this file verbatim as `.cppatlas.json` (overrides `--stage`) |
| `--repo` | `learner/my-vector` | Fake `owner/name` |
| `--ref` | `refs/heads/main` | Pushed ref |
| `--sha` | random | Pushed commit SHA |
| `--app-key` | | The App key PEM the API uses; if given, App JWTs are verified |
| `--gen-key` | | Write a fresh 2048-bit RSA key (PKCS#1 PEM) to this path and exit |
| `--timeout` | `3m` | Give up waiting for the check run after this long |
| `--stay` | `false` | Keep serving the mock API after the check run completes |

Every check-run create/update body is printed to stdout as JSON. The command
exits 0 if the check run concludes `success` and 1 for any other conclusion or
a timeout. With the starter `vector.hpp` and `--stage 1` you should see a
`failure` conclusion; with a correct implementation (the private solution) a
`success`.

## Rotating credentials

- Webhook secret: see "Rotate the webhook secret" in `scripts/deploy.md`.
- Private key: App settings -> Private keys -> generate a new one, replace
  `~/.config/cppatlas-runner/app.pem`, run the `fly secrets set` command from
  step 3 again, then delete the old key on GitHub.
