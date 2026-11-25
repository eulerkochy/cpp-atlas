# cppatlas runner: threat model

This document describes what the runner protects, where the trust boundaries
are, how each known threat is handled and what is accepted. It describes the
code in this directory as it is; when the code changes, update this file in
the same change.

Terms:

- **API**: `cmd/api`, the public service (Fly app `cppatlas-runner`).
- **grader**: `cmd/grader`, the binary in the grader image that compiles and
  tests one submission.
- **Mode A**: local docker. The API's docker backend starts one grader
  container per run. The grader is PID 1, uid 10001, and holds no
  capabilities. The job arrives on stdin and the Result leaves on stdout.
- **Mode B**: Fly Machines. The API creates one Firecracker microVM per run in
  the Fly app `cppatlas-grader`. The grader runs as root inside the VM and acts
  as a supervisor. It fetches the job from the API once over 6PN, runs every
  compiler and test step in a sandbox and posts the Result.
- **learner code**: everything derived from the submission, meaning the
  compiler processes that read it and the test executables that contain it.

## 1. Scope and assets

### What we protect

| Asset | Where it lives |
|---|---|
| `FLY_API_TOKEN` | API secret only. It is a deploy token scoped to the app `cppatlas-grader` (`fly tokens create deploy -a cppatlas-grader`), so it cannot touch the API app or other apps. |
| GitHub App private key (`GITHUB_APP_PRIVATE_KEY`) | API secret only. |
| Webhook secret (`GITHUB_WEBHOOK_SECRET`) | API secret only. |
| Other learners' submissions, results and Check Runs | API memory and the GitHub Check Runs on the learner's own repository. |
| Availability of the service and the size of the Fly bill | All components. |

All three secrets are `config.Secret` values. They print as `[redacted]` in
logs and are never passed to run machines or grader containers.

### What is not secret

- **The tests.** They ship to every learner in the template repository
  `eulerkochy/cpp-vector-challenge`.
- **The reference solution.** It is public on purpose, in the cpp-atlas
  repository (`challenges/vector/solution/`).

Nothing in this document tries to keep either of them confidential.

### Policy that still holds: no `solution/` in run machines or the grader image

`solution/` is never present in a run machine or the grader image. Three
independent checks enforce this:

1. `scripts/build-grader.sh` builds from an rsync-filtered copy of the
   challenge and fails if `solution/` (or `fuzz.cpp`) is still there.
2. A `RUN` guard in `grader/Dockerfile` fails the build if `solution`,
   `fuzz.cpp`, `*.jsonl`, `.git`, `.github`, `.devcontainer`, `build` or
   `ci.sh` appear in the challenge tree.
3. `cppatlas-grader prebuild` refuses to run when `solution/` exists.

The reason is hygiene, not confidentiality. If the solution were in the
image, learner code could `#include` it and pass without writing anything, and
the image would contain files the grader never uses.

### Hidden-test readability: accepted

Learner code is compiled together with the tests. It can therefore read them,
and anything else readable in the image, at compile time with `#include` or
`#embed`, and at run time with `open()`. This is accepted:

- the compiler has to read the tests;
- the tests are public anyway (see above).

What still holds:

- **Compiler diagnostics are filtered.** A diagnostic snippet that quotes a
  file outside the submission, the challenge and the toolchain is replaced by
  `(message hidden: ...)`. For example, `#include "/etc/passwd"` shows no
  content (sample `grader/testdata/passwd-include.hpp`).
- **Results never carry test source.** Beyond doctest's own assertion text
  (the expression and its expanded values), a Result does not include test
  source code.

## 2. Architecture and trust boundaries

```
browser ──HTTPS──> Fly proxy ──> API public listener 0.0.0.0:8080
GitHub  ──HTTPS──> Fly proxy ──> API /github/webhook (same listener)
API ──HTTPS──> Fly Machines API (api.machines.dev), FLY_API_TOKEN
API ──HTTPS──> GitHub API (App JWT -> per-repo installation token)

run machine (app cppatlas-grader) ──6PN──> API private listener fly-local-6pn:8081
   GET /internal/job, POST /internal/result, Bearer per-run token
```

### Public listener

- Binds `0.0.0.0:8080`, IPv4 only (`LISTEN_ADDR` in fly.toml). It is reached
  only through the Fly proxy.
- The client IP is taken from `Fly-Client-IP`, and only when
  `TRUSTED_PROXY=fly`. `X-Forwarded-For` is never used.
- Public `/healthz` returns `{"status":"ok","backend":...}` and no queue
  statistics.

### Private listener

- Binds `fly-local-6pn:8081`, the API machine's 6PN address. No Fly service
  maps to it, so it cannot be reached from the internet.
- Requests carrying `Fly-Client-IP` or `Fly-Forwarded-*` / `Fly-Request-Id`
  headers are refused, and so are requests from non-private source addresses.
- `/internal/job` and `/internal/result` need a per-run token. That token:
  - is 32 random bytes;
  - is stored by its SHA-256;
  - lets the job be fetched exactly once and the result posted exactly once;
  - expires about 5 s after the run's wall clock;
  - is bound to the run machine's 6PN `private_ip`, taken from the
    create-machine response. Requests from any other peer address get 404.
- `/internal/stats` (queue counters, no secrets) is gated only by the
  private-network check.

### Run machines

- They live in a separate Fly app, `cppatlas-grader`. That app has no secrets,
  no services and no public IPs, and is never `fly deploy`ed.
- They run on a dedicated custom 6PN network, `cppatlas`, shared only with the
  API app, in the Fly org `personal`.
  - Both apps are created with `--network cppatlas` (see `scripts/deploy.md`).
  - The API code does not verify this at run time.
- The machine config holds exactly two environment variables:
  `CPPATLAS_API_URL` and `CPPATLAS_TOKEN`. The submission is fetched, never put
  in the config.
- Machines are created with `auto_destroy`, `restart: no` and SIGKILL as the
  stop signal. The API destroys each machine after its run. A janitor destroys
  managed machines it does not track: machines older than 5 minutes, and pool
  machines older than 1 minute.
- Create calls are made idempotent by machine name. After a transport error,
  5xx or 409 the API lists and adopts the machine of that name, and reaps the
  name if creation finally fails.
- Optional warm pool (`WARM_POOL_SIZE`, default 0):
  - slots are created stopped, each with its own unbound token;
  - a slot lives at most 1 hour;
  - a machine is never reused.

### Inside a run machine (mode B)

The grader process (root, the supervisor) is the trusted side. Everything it
starts runs as uid/gid 10001 through two helpers: `__sandbox-init`, which is
PID 1 of new pid, mount, net, ipc and uts namespaces, then `__sandbox-exec`.
Section 3 lists what each command gets.

### Docker mode (mode A) equivalents

The docker backend runs:

```
docker run --rm -i --network none --read-only --user 10001:10001
  --cap-drop ALL --security-opt no-new-privileges --pids-limit 256
  --memory 3g --memory-swap 3g --cpus 2 --ulimit nofile=1024:1024
  --ulimit core=0
  --tmpfs /work:rw,exec,nosuid,nodev,size=1g,uid=10001,gid=10001,mode=0700
  --tmpfs /tmp:rw,nosuid,nodev,size=64m
  -e CPPATLAS_RLIMIT_NPROC=off
```

Docker's default seccomp profile applies, and the grader's own filter is added
on top of it.

- **Shared uid.** The grader and learner code share uid 10001. The grader
  protects itself by being non-dumpable: learner code cannot ptrace it or read
  its `/proc/1/environ`, `mem` or `fd/`.
- **Leftover processes** are killed with `kill(-1)`, which the grader can send
  as the container's PID 1.
- **Status.** Mode A is for development and self-hosting only; see the
  accepted risks in section 5.

## 3. Threats and mitigations

Unless a subsection says otherwise:

- "the command" means one compiler invocation (the whole ninja build counts as
  one command) or one stage's test executable;
- the limits are `protocol.DefaultLimits`, clamped by the grader: build 60 s,
  test 20 s per stage, memory 2048 MB, 128 processes, 64 MB per file, 256 open
  files, 64 KiB of output kept;
- "the learner sees" refers to the stage result.

Every command started by the grader passes through `__sandbox-exec`, which does
the following before the final `execve`:

- sets the rlimits: `cpu`, `fsize`, `nofile`, `core=0`, `memlock=64k`,
  `msgqueue=0`, `as` (except for ASan runs), and `nproc` (except in mode A,
  where the docker backend sets `CPPATLAS_RLIMIT_NPROC=off` and docker's
  `--pids-limit` is the bound);
- sets `oom_score_adj=1000`, `PR_SET_NO_NEW_PRIVS` and the seccomp filter;
- ignores SIGXFSZ;
- marks every descriptor above 2 close-on-exec, using
  `close_range(CLOSE_RANGE_CLOEXEC)` with a `/proc/self/fd` fallback;
- starts the program with an empty environment except an explicit list
  (`PATH`, `HOME`, `TMPDIR`, `LC_ALL`, the sanitizer options and the grader's
  progress variables).

The seccomp filter, from `internal/grader/sandbox/seccomp_*`:

| Rule | Result |
|---|---|
| Wrong audit arch, x32 ABI | Process killed |
| Socket families other than `AF_UNIX` (`socket`, `socketpair`) | `EAFNOSUPPORT` |
| `clone` with any `CLONE_NEW*` flag | `EPERM` |
| `clone3` | `ENOSYS` (libc falls back to `clone`) |
| `unshare`, `setns`, `mount`, `umount2`, `pivot_root`, `chroot` and the new mount API (`open_tree`, `move_mount`, `fsopen`, `fsconfig`, `fsmount`, `fspick`, `mount_setattr`, `open_tree_attr`) | `EPERM` |
| `bpf`, `perf_event_open`, `userfaultfd`, `io_uring_*` | `EPERM` |
| `keyctl`, `add_key`, `request_key` | `EPERM` |
| `kexec_*`, module syscalls | `EPERM` |
| `name_to_handle_at`, `open_by_handle_at`, `process_vm_writev`, `kcmp`, `syslog`, `fanotify_init` | `EPERM` |
| `personality` other than `0xffffffff` (query), `0` (PER_LINUX) and `0x0040000` (PER_LINUX \| ADDR_NO_RANDOMIZE) | `EPERM` |
| `ptrace` | Allowed |

Notes on the filter:

- **Why ADDR_NO_RANDOMIZE is allowed.** The sanitizer runtimes re-exec
  themselves with it when the shadow layout does not fit. It only affects the
  learner's own processes, and setuid binaries do not exist.
- **Why ptrace is allowed.** LeakSanitizer stops the process's own threads
  with ptrace. This was verified: with ptrace denied, LSan aborts with "does
  not work under ptrace" and leak checking is lost. ptrace can only reach
  processes of uid 10001. In mode B those are only the learner's own
  processes; the init is root. In mode A the grader is non-dumpable.

### Fork bombs

- **Mode B:**
  - cgroup v2 `pids.max` = 128 per command, set on a leaf created per command
    with `CLONE_INTO_CGROUP`;
  - `RLIMIT_NPROC`;
  - when the command ends, times out or floods its output, its pid namespace
    init is killed. The kernel then kills everything in the namespace, and the
    supervisor also writes `cgroup.kill`.
- **Mode A:** docker `--pids-limit 256`. After every command the grader sends
  `kill(-1, SIGKILL)` as PID 1 and sweeps `/proc` until nothing is left. If it
  cannot kill everything, it stops with `sandbox_cleanup_failed` rather than
  continuing in a dirty container.
- **The supervisor** pre-creates its OS threads (`PrewarmThreads`), so pid
  exhaustion cannot stop it from working.
- **The learner sees** a stage `timeout`, because a bomb that keeps calling
  `fork()` spins until the test timeout (sample `fork-bomb.hpp`).

### Memory bombs

**At run time:**

- **Mode B:**
  - cgroup `memory.max` = 2048 MB with swap 0 per command;
  - `RLIMIT_AS` = 2048 MB for non-ASan runs. ASan reserves terabytes of
    virtual address space, so its runs get `hard_rss_limit_mb=2048` instead;
  - the VM has 4 GB. The supervisor sets its own `oom_score_adj` to -1000 and
    children run at +1000.
- **Mode A:**
  - the same rlimits and ASan option, inside docker `--memory 3g`;
  - the grader cannot lower its own `oom_score_adj`, but children carry 1000,
    so the kernel OOM killer picks them first;
  - verified with the container limited to 1 GB, using an `operator new` bomb
    and a `malloc` bomb under `debug` and `asan-ubsan`: the stage ends
    `crashed (SIGKILL)` with an OOM hint, and the grader survives and reports;
  - OOM is detected through the cgroup's `memory.events` (`oom_kill`).
  - The hint quotes the job's limit (2048 MB) even when the container limit is
    lower.
- **The learner sees** `crashed`, signal SIGKILL, "killed, most likely for
  exceeding the memory limit". A `malloc` loop that ignores NULL spins until
  the timeout instead.

**At compile time:** the same memory limits apply to the compilers.
`template-bomb.hpp` ends in `compile_error` with "virtual memory exhausted".
The grader recognises compiler out-of-memory messages and adds a hint.

### Infinite compile (template recursion, constexpr)

- **Compiler limits:** default template depth, `-fconstexpr-ops-limit=2^28`
  and `-fconstexpr-loop-limit=2^20` (gcc), and the error limits.
- **Hard bound:** the build's wall clock (60 s) and `RLIMIT_CPU`. On timeout
  the whole build tree is killed.
- **The learner sees** `compile_error` (constexpr limits) or a build `timeout`
  with a hint (samples `constexpr-bomb.hpp`, `template-bomb.hpp`).

### Infinite loops

- **Bounds:** the per-stage wall clock (20 s), `RLIMIT_CPU` (timeout + 5 s),
  and the grader's overall deadline.
- **Overall deadline:** build + stages × (test + 2 s) + 30 s, or
  `CPPATLAS_DEADLINE_SEC`. When it fires, the grader:
  - claims the single Result slot;
  - kills every process it started (`Manager.KillAll`: the running command's
    tree, every cgroup leaf, and a sweep in mode A);
  - emits `deadline_exceeded` and exits.

  It does not rely on the container or VM being torn down.
- **API side:** the run wall clock (`RUN_TIMEOUT`, default 120 s) bounds the
  machine's lifetime independently; the API destroys the machine.
- **The learner sees** a stage `timeout` naming the test case that was running.

### Giant output

- Output is read continuously, so the command never blocks on a full pipe.
- The command is killed after 16 MiB of combined output; the grader keeps 64
  KiB.
- Trace files are capped (the API keeps 64 KiB per stage).
- The whole Result is capped at 1 MiB by the grader, and the API applies its
  own per-result cap (below).
- **The learner sees** `failed`, "printed more than 16 MB" (sample
  `output-spam.hpp`).

### Disk filling

- **`/work` size:**
  - mode A: docker tmpfs, 1 GB;
  - mode B: the grader mounts it as tmpfs at 1 GB (`CPPATLAS_WORK_TMPFS_SIZE`,
    default `1g`).

  tmpfs pages count as memory. Pages written by a stage outlive its cgroup and
  are charged to the parent, so `/work` must stay small relative to the 4 GB
  VM.
- **Other limits:** `RLIMIT_FSIZE` (64 MB per file; EFBIG, not SIGXFSZ).
- **Per-command mounts (mode B only):** a private `/tmp` of 256 MB and an empty
  `/dev/shm` of 64 MB. Both are freed when the namespace dies.
- **Cleanup:** after the build the compilers' `$TMPDIR` is emptied. After every
  stage the grader deletes that stage's run directory and empties `$TMPDIR` and
  `$HOME`, so a full disk in one stage does not affect later ones.
- **Mode A leftovers:** `/tmp` and anything written into the build tree persist
  for the rest of that run. That only affects the learner's own run.
- **Verified:** `disk-fill.hpp` fills every writable directory from a static
  initializer in stage 1. Stage 1 ends `failed` with "filled the available disk
  space", stage 2 is graded normally, and the solution with the same filler
  passes stages 2-8 in both modes.

### File-descriptor exhaustion and leaks

- `RLIMIT_NOFILE` = 256 per command (docker additionally sets 1024).
- The command receives only fds 0-2. The init's status pipe is
  close-on-exec, and `__sandbox-exec` marks everything else above 2
  close-on-exec.
- Before this fix, mode B leaked the init's status pipe as fd 4 and learner
  code could forge or corrupt the init's report (sample `fd-leak.hpp`).
- `TestCommandSeesOnlyStdFds` asserts the fd set in both modes. Each of the
  two layers is sufficient on its own; the test fails only when both are
  removed.

### Signals to the grader

- **Mode B:** the grader is invisible and unreachable. It is outside the
  learner's pid namespace and has a different uid, so `kill()` returns ESRCH
  or EPERM.
- **Mode A:** the learner runs as the same uid, but the grader is PID 1, so
  SIGKILL and SIGSTOP from inside the container are ignored by the kernel.
  Every other fatal signal has a handler that logs it and ignores it. Only
  SIGTERM (docker stop / Fly stop) cancels; the grader then kills the sandbox
  and reports `cancelled` (sample `signal-grader.hpp`).

### Reading secrets

**Environment:** commands get an explicit environment and never the grader's.

**The per-run token in the VM (mode B):**

- At start-up the grader re-executes itself (same PID) with `CPPATLAS_TOKEN`
  and `CPPATLAS_API_URL` removed. They are handed over through an inherited
  pipe that is read and closed at once.
- `os.Unsetenv` alone does not change `/proc/<pid>/environ`. The re-exec is
  what removes the token from the supervisor's initial environment block.
- Verified: in the mode B simulation, grepping every `/proc/*/environ` and
  `cmdline` as root during a run finds the token in `/proc/1/environ` with the
  old binary and nowhere with the new one.
- After start-up the token exists only in the supervisor's heap.

**/proc (mode B):**

- The learner's `/proc` is its own pid namespace, mounted
  `hidepid=invisible`; the init is root and invisible.
- Masked with `/dev/null`: `kcore`, `kallsyms`, `keys`, `key-users`,
  `timer_list`, `sched_debug`, `sysrq-trigger`, `kpage*`, `slabinfo`,
  `vmallocinfo`, `config.gz`, `latency_stats`, `timer_stats`.
- `acpi`, `asound`, `scsi` and `driver` are covered with empty tmpfs.
- `/proc/sys`, `bus`, `fs` and `irq` are read-only.

**/dev (mode B):** a read-only tmpfs holding only `null`, `zero`, `full`,
`random`, `urandom` and `tty`, the `/proc/self/fd` symlinks, and a private
empty `/dev/shm`.

**Other paths (mode B):** a fresh read-only sysfs of the empty network
namespace. Empty read-only tmpfs over `/.fly`, `/.fly-upper-layer`, `/run`,
`/var/run`, `/root`, `/home`, `/mnt`, `/media`, `/srv`, `/sys/fs/cgroup`,
`/sys/kernel/debug`, `/sys/kernel/security` and `/sys/firmware`. The root
filesystem is read-only, nosuid and nodev.

**Mode A:** `/proc/1/environ` (the grader) is unreadable because the grader is
non-dumpable. `/proc/1/cmdline` is readable; it contains nothing secret.
Mode A has no token.

**Fly's in-VM API and metadata:** `/.fly` and `/run` are masked. The learner
has no network (next subsection), so the Fly init's API, which is reached over
a unix socket under `/.fly`, and the metadata service cannot be reached.

**Other runs:** every run has its own VM in mode B and its own container in
mode A. Nothing from another run exists where learner code executes. Results
live only in the API.

The learner sees `snoop.hpp` and `recon.hpp` probe results such as
`No such file or directory`, `Permission denied` and `Read-only file system`.

### Reading hidden tests or the solution

The tests: accepted (section 1). The solution is not in the image (section 1).
The challenge tree in the image is root-owned and read-only.

### Tampering with results

**Forging a pass for one's own run is an accepted risk.** The tests are linked
into the same process as the learner's code. Learner code can therefore:

- call `exit(0)` after writing a fake report;
- patch doctest in memory;
- write the XML report file directly.

**The pass rule raises the bar.** A stage passes only if all of these hold:

- the process exited normally with code 0;
- no sanitizer report appeared in the output;
- the doctest XML report is complete and parses;
- every test case in it passed.

An early `exit()` or a missing report is reported as `failed` with a hint. The
API also recomputes `passed` from the stage statuses instead of trusting the
grader's flag.

**Cross-user impact is not possible.**

- A run machine's token is valid only for its own run. It is fetch-once and
  post-once, and bound to that machine's 6PN address.
- `/internal/result` checks that `run_id` matches the token's run.
- Results are sanitised: requested stages only, strings capped and made valid
  UTF-8, `passed` recomputed.
- Learner code inside the VM cannot reach the API anyway: it has no network,
  and the token sits in root's memory in another pid namespace.

**The in-sandbox status channel (mode B)** cannot be written by learner code
since the fd-leak fix.

**Later stages' executables:** in modes B and setuid, the build tree is
handed back to root after the build, so a test cannot replace a later stage's
executable.

### Network exfiltration and SSRF into 6PN

**Fly does not provide a per-machine egress firewall that we rely on.** A run
machine as a whole has network access: it needs 6PN to reach the API, and
whatever outbound access Fly gives machines.

The guarantee rests on the layers inside the VM:

1. **Network namespace:** every learner command is in a new, empty network
   namespace with only `lo` down/up. There is no route anywhere, including to
   6PN or to the API.
2. **Seccomp:** only `AF_UNIX` sockets can be created. That rules out inet,
   inet6, netlink, packet and vsock, which matters because vsock is not
   namespaced and reaches the Firecracker host side. Namespace creation and
   entry are denied.
3. **Uid and capabilities:** uid 10001, no capabilities, `no_new_privs`, and no
   setuid binaries in the image.
4. **Firecracker** is the outer boundary.

The supervisor refuses to run in mode B without a private network namespace
(`RequireIsolation`).

**Mode A** uses `--network none`. The grader additionally refuses to grade if
any interface other than `lo` is visible.

The learner sees `Address family not supported by protocol` for
`socket(AF_INET)`, `socket(AF_VSOCK)` and bash `/dev/tcp`, and name resolution
fails (sample `network.hpp`).

**SSRF from the API:**

- The API fetches only fixed GitHub API URLs built from validated owner, repo
  and path components.
- It follows at most 3 redirects and refuses any redirect that changes scheme
  or host.
- No URL comes from learner input.

### Kernel exploitation inside the microVM

This is the residual risk. A kernel exploit from learner code (any syscall the
filter allows) would give root in that one VM. The attacker would gain:

- one run VM;
- the single-use token for their own run, which is already fetched and bound to
  that machine's address, so it can only post a result for their own run;
- no secrets: the grader app has none, and `FLY_API_TOKEN` and the GitHub
  credentials never leave the API;
- a 6PN network (`cppatlas`) that contains only the API's two ports. On 8080
  that is the public API; on 8081 there is `/internal/*`, where every endpoint
  needs a token bound to another machine's address, plus the read-only
  `/internal/stats`;
- whatever outbound internet access Fly gives a machine, for at most the run's
  wall clock (120 s). After that the machine is destroyed.

Escaping Firecracker itself is out of scope; it is Fly's boundary.

### Webhook spoofing, replay and confused deputy

**Signature:**

- `X-Hub-Signature-256` HMAC-SHA256 is verified over the raw body (at most
  1 MiB) before anything is parsed, using a constant-time comparison.
- An empty secret rejects everything, and sha1 signatures are never accepted.
- `ping` and `push` are handled; every other event gets 204.

**Replay:**

- delivery-ID dedupe (LRU of 4096);
- commit dedupe on `repoID@sha`;
- events whose `pushed_at` is older than 24 h are dropped;
- tag pushes, deletions, non-branch refs and malformed SHAs are ignored.

**Confused deputy:**

- Installation tokens are requested for the single repository of the event,
  with `checks:write`, `contents:read` and `metadata:read` only.
- Files are fetched at the pushed SHA from that repository, and only from an
  allowlist: `.cppatlas.json` (at most 4 KiB, strict schema) and the challenge's
  allowed learner files (default `include/my/vector.hpp`, 256 KiB each).
- The learner repository's `tests/` and every other file are never used.
- The tests always come from the grader image.

**Throttling:** per-IP rate limit on the webhook route, a per-installation
token bucket, and a bounded per-repository scheduler.

### Markdown and mention injection into Check Runs

- Text is cleaned to valid UTF-8, with ANSI escapes, C0/C1 controls (except
  `\n` and `\t`) and bidi overrides removed.
- Untrusted text appears only inside inline code spans or fenced code blocks.
  The fence is longer than any backtick run in the content, the info string is
  `text`, and the block is always closed.
- Code spans and blocks are what neutralise `@mentions` and links; there is no
  separate `@` escaping.
- Compiler and preset labels are restricted to `[A-Za-z0-9 ._+()-]`.
- Titles come from trusted strings.
- Summary and text are capped at 65535 bytes. There are at most 50
  annotations, each pointing only at allowlisted paths.

### Abuse, DoS and the Fly bill

**Client identity:** `ClientKey` is the client IP (`Fly-Client-IP`). For IPv6
the key is the /64, so a host cannot rotate addresses inside its own prefix.
The same key is used for the rate limiters, the per-client run cap and the
long-poll waiter caps. GitHub runs are keyed by `gh:owner/repo`.

| Control | Default | Env |
|---|---|---|
| Rate limit, `POST /runs` | 6/min, burst 3 per key | `RATE_RUNS_PER_MIN`, `RATE_RUNS_BURST` |
| Rate limit, polls | 120/min, burst 30 | `RATE_POLL_*` |
| Rate limit, webhook | 300/min, burst 60 per IP | `RATE_WEBHOOK_*` |
| Runs queued or running per client | 2 | `MAX_RUNS_PER_CLIENT` |
| Queue | 20; web share 15, GitHub share 10 | `QUEUE_SIZE`, `QUEUE_MAX_WEB`, `QUEUE_MAX_GITHUB` |
| Global concurrency (machines at once) | 4 | `MAX_CONCURRENT_RUNS` |
| Global run-rate ceiling | 120 per 10 min, burst 40 | `GLOBAL_RUNS_PER_10MIN`, `GLOBAL_RUNS_BURST` |
| Per-run wall clock | 120 s | `RUN_TIMEOUT` |
| Long-poll waiters | 4 per client, 64 in total; over the cap, an immediate response | `LONGPOLL_MAX_PER_CLIENT`, `LONGPOLL_MAX_TOTAL` |
| Stored results | 64 MiB and 500 runs, oldest evicted first; 15 min TTL | `MAX_STORED_BYTES`, `MAX_STORED_RUNS`, `RESULT_TTL` |
| Per-result cap | 512 KiB (body cap 2 MiB); traces 64 KiB per stage | `MAX_RESULT_BYTES` |
| Request bodies | `POST /runs` 512 KiB, webhook 1 MiB | - |
| Leaked machines | janitor every 2 min (see section 2) | - |

**Worst-case spend.**

- Machines exist only while a run is in progress, and at most 4 at a time.
- Each is shared-cpu-4x with 4 GB, at about $0.0000103/s.
- Saturated continuously, that is 4 × $0.0000103 × 3600 ≈ **$0.15 per hour**,
  or about **$3.6 per day**.
- The global run-rate ceiling (120 per 10 minutes × at most 120 s each) cannot
  push the number of concurrent machines above the concurrency cap. It limits
  churn: machine creations and API calls.
- The janitor bounds leaks to about 5 minutes per machine.
- The always-on API machine (shared-cpu-1x, 512 MB) is a fixed extra cost.

### Run IDs as bearer capabilities

- A run ID is 128 random bits (22 base64url characters).
- Anyone holding the ID can read that run's status and result until the 15
  minute TTL ends. There is no binding to the submitter.
- A run view never contains the submitted files; the job's files are dropped
  once the run finishes.
- Logs use an 8-character prefix, with one known exception (section 5).
- A GitHub run's ID is the Check Run's `external_id`, which is visible to
  anyone who can see the repository's checks.

### Supply chain

- **Base images are pinned by multi-arch index digest** in `grader/Dockerfile`:
  `gcc:16.2@sha256:...`, `ubuntu:26.04@sha256:...` and `golang:1.27@sha256:...`.
  The same digests resolve to the linux/amd64 and linux/arm64 images; the file
  explains how to refresh them.
- **Packages** come from Ubuntu's signed archive only (no third-party apt
  repository).
- **The grader binary** is built statically with `CGO_ENABLED=0` and the Go
  standard library only.
- **No setuid or setgid binaries.** All s-bits are stripped in the toolchain
  stage, and build-time assertions in that stage and the final stage fail the
  build if any remain. The base image had 11, including `su`, `mount` and
  `passwd`.
- **Image contents:**
  - the toolchain (GCC 16.2, clang 21, binutils, cmake, ninja, ccache, make,
    coreutils, util-linux);
  - the filtered challenge tree;
  - prebuilt doctest objects and a read-only ccache;
  - the grader binary and the entrypoint.

## 4. Verification

### What was verified locally

Docker ran on colima (Apple Virtualization.framework, linux/arm64).

**Unit tests:**

- `go test ./internal/grader/...` on macOS.
- The sandbox suite (`internal/grader/sandbox`, built with
  `go test -c` for linux) inside the grader image, in both modes:
  - mode A: `--user 10001 --cap-drop ALL --read-only --network none` and the
    other docker flags;
  - mode B: `--privileged` as root, which gives namespaces and cgroup v2.

**What the sandbox suite covers:**

- exit codes and signals;
- timeout kills the whole tree;
- orphans are swept;
- output flood;
- fork bomb;
- isolation;
- only fds 0-2 reach the command;
- live seccomp: AF_INET refused, PER_LINUX32 refused, ADDR_NO_RANDOMIZE allowed
  in mode B, syslog refused;
- the mode B `/dev`, `/dev/shm` and `/proc` view;
- `KillAll`;
- a BPF evaluator that checks the filter's decisions for both the amd64 and
  the arm64 table;
- every syscall number cross-checked against the kernel UAPI headers. Both
  architectures' headers were checked, the amd64 ones inside the amd64 image.

**Samples** (`grader/testdata/*.hpp`, run with `run-samples.sh`):

- every sample in mode A;
- the reference solution, all 8 stages, gcc and clang × debug and asan-ubsan,
  in mode A and in a mode B simulation;
- the mode B simulation: a privileged grader container plus a fake API
  container on a docker network, the token passed as env exactly as the Fly
  backend does. It ran starter, solution, fork-bomb, network, snoop, recon,
  signal-grader, memory-bomb, disk-fill and fd-leak, and the
  `/proc/*/environ` token scan.

**linux/amd64 under qemu-user emulation:**

- The full grader image builds for linux/amd64 from the same Dockerfile and
  digests.
- The sandbox suite and grades ran in mode A only, with the filter disabled:
  - qemu-user answers `PR_SET_SECCOMP` with EINVAL, so no x86-64 seccomp filter
    can be installed under emulation (with the filter enabled the grader fails
    closed: every command fails to start);
  - qemu-user refuses namespace clone flags, so namespace mode cannot run
    either;
  - what ran: all sandbox tests except the live-seccomp and namespace ones,
    the starter and fd-leak samples, and the solution on all 8 stages
    (gcc-debug, passed).
- **The x86-64 filter has never been executed by a kernel.** Its decisions are
  covered only by the BPF evaluator test and the header cross-check.

### What could not be verified before deployment

- Real Fly/Firecracker behaviour:
  - cgroup v2 availability and controller delegation in the VM;
  - whether `hidepid=invisible` is supported, or the `hidepid=2` fallback is
    used;
  - the `/.fly` paths;
  - 6PN reachability rules and isolation of the custom network;
  - the create response's `private_ip` and the peer address the API actually
    sees;
  - mknod of `/dev` nodes (there is a bind fallback).
- linux/amd64 seccomp, ptrace (LSan) and the sanitizer runtimes under a real
  x86-64 kernel.
- Whether ASan or LSan on Fly's kernel needs `personality(ADDR_NO_RANDOMIZE)`.
  It is allowed in case it does.

### Post-deploy checklist

Run these against the deployed service through `POST /runs`, with the sample
file as `include/my/vector.hpp`, stage 2, so failing output is shown:

1. `recon.hpp`. Expected:
   - `uid=10001`
   - `netifs: lo`
   - no `token-in:` / `secret-file:` lines
   - `CapEff: 0`, `NoNewPrivs: 1`, `Seccomp: 2`
   - `oom_score_adj: 1000`
   - a `cgroup:` line under `cppatlas-sandbox`
   - `/.fly` absent, `unshare` refused
2. `snoop.hpp`. Expected:
   - `/proc/1/*` absent
   - `/etc/shadow` denied
   - `/opt` read-only
   - `kill(1)` refused
3. `network.hpp`. Expected:
   - every socket call `Address family not supported`
   - name resolution failure
4. `fork-bomb.hpp`. Expected: a stage `timeout`; the next submission works and
   the machine is gone afterwards (`fly machines list -a cppatlas-grader`).
5. `fd-leak.hpp`. Expected: only fds 0, 1 and 2 are listed, and the result is
   not `sandbox_error`.
6. The reference solution, all stages, with gcc/clang × debug/asan-ubsan.
   Expected: everything passes. This is the first execution of the amd64
   filter and of LSan on amd64.
7. In the machine's logs, `sandbox: {Mode:namespaces ... Cgroup:...}` with a
   non-empty `Cgroup`.
8. `disk-fill.hpp`, stages 1-2. Expected: stage 1 `failed` with the disk hint;
   stage 2 graded normally.

## 5. Accepted risks and known gaps

| Risk | Why accepted | What would change the decision |
|---|---|---|
| A learner can forge a pass for their own run | Learner code shares a process with the tests. Nothing of value is gained: no other user is affected, and the tests and solution are public. | Results acquiring value, such as certificates, rankings or rewards. Then run the tests out-of-process against a compiled library, with a signed result channel. |
| Hidden tests are readable by learner code | They are public | Private test suites |
| All API state (runs, results, tokens, limiters, dedupe sets) is in memory, single instance | Simplicity. A restart loses queued and running runs (they fail `shutting_down`), and the janitor reaps orphaned machines. | Horizontal scaling or uptime requirements. Note that the janitor is not owner-scoped and would reap a second instance's machines. |
| Mode A shares a uid between the grader and learner code | Development and self-hosting only. The grader is non-dumpable and ignores signals; no secrets exist in mode A. | Using mode A to serve untrusted public traffic |
| No re-run from the GitHub UI (`check_run` rerequested is not handled); regrading needs a new push | Scope | Learner demand |
| A delivery that was rate-limited or malformed cannot be redelivered with the same delivery ID (it is deduped before the per-installation limit) | Scope; a new push regrades | Fix by forgetting the delivery ID on those paths |
| A 5xx on Check Run creation is not retried (creation is not idempotent), so that commit gets no check | Avoids duplicate checks | Adding an idempotency marker (`external_id` lookup) before retrying |
| Kernel 0-day inside the microVM | Firecracker is the outer boundary; impact is bounded (section 3) | Evidence of escapes, or secrets ever being placed in run machines |
| The x86-64 seccomp filter has only been checked by evaluator and headers, not by a kernel | No amd64 host available | The post-deploy checklist failing |
| ptrace is allowed inside the sandbox | LSan needs it. It reaches only the learner's own processes. | A ptrace-based kernel bug class; then drop LSan or restrict the requests to the read-only set |
| The custom 6PN network and the org are deployment facts, not checked by code | `fly` commands in `scripts/deploy.md` set them | Automating deployment |
| `/internal/stats` is readable by any 6PN peer without a token | Counters only. Learner code has no network, so only a run machine's root (after a kernel exploit) could read it. | Putting anything sensitive in stats |
| The per-run token is visible in the Fly machine config (Machines API, dashboard) and to Fly's in-VM init | Anyone who can read those already holds Fly access to the grader app. The token is single-use and short-lived. | Long-lived tokens |
| The raw per-run token is held in API memory until the run ends | Needed to start the machine | - |
| One GitHub log line contains the full run ID (`internal/github/grade.go`, grading log) | Logs are operator-only | Shipping logs to third parties; switch that line to `LogID` |
| Run IDs are bearer read capabilities with no submitter binding | Results contain only the learner's own diagnostics and expire after 15 minutes | Results containing personal data |
| The rate limiter evicts the least-recently-seen key when its 10,000-entry map is full, so a flood across many keys can reset other keys' buckets | The global concurrency, queue and run-rate ceiling still bound cost | Sustained distributed abuse |
| Mode A `/tmp` and build-tree leftovers persist across stages of one run | Self-inflicted only | - |

## 6. Operational rules

- **Fly org.** Use only the org `personal`. Never use the org
  `rakshith-aloori`: check `fly orgs list` and pass `--org personal` or `-a
  <app>` explicitly on every command.
- **The grader app.** `cppatlas-grader` must never get secrets, services, IP
  addresses, volumes or `fly deploy`. Its machines are created only by the API.
  The image is pushed with `scripts/build-grader.sh --push-fly` and referenced
  by `GRADER_IMAGE`.
- **The API app** holds the only secrets: `FLY_API_TOKEN` (the app-scoped
  deploy token for `cppatlas-grader`), `GITHUB_APP_PRIVATE_KEY` and
  `GITHUB_WEBHOOK_SECRET`.
- **Secret storage.** The operator keeps secrets in `~/.config/cppatlas-runner/`
  (mode 0700, files 0600) and passes them to `fly secrets import` / `fly
  secrets set` on stdin or from those files, never echoed to the terminal or
  shell history.
- **Token rotation.**
  - `FLY_API_TOKEN`: create a new deploy token for `cppatlas-grader`, import
    it, deploy the API, then revoke the old one (`fly tokens revoke`). Do this
    at least yearly (tokens are created with an 8760 h expiry) and immediately
    on suspected exposure.
  - The GitHub App key: generate a new key in the App settings, import it,
    deploy, then delete the old key.
  - The webhook secret: set the new secret in the App settings and with `fly
    secrets` together; deliveries in between fail with 401 and can be
    redelivered.
- **Base image digests.** Refresh them deliberately (see the comment in
  `grader/Dockerfile`), then re-run the samples and the solution matrix before
  pushing.
- **Reporting a vulnerability.** Email `security@cppatlas.com` (TODO: owner to
  confirm this address). Do not open a public issue for security reports.
  Please include the sample submission or request that shows the problem. We
  aim to acknowledge within 3 working days.
