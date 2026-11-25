#!/usr/bin/env bash
# Grade sample submissions with the local-docker (mode A) hardening flags and
# print one summary line per sample, plus the full Result JSON under $OUT.
#
#   runner/grader/testdata/run-samples.sh [IMAGE] [sample.hpp ...]
#
# Env: STAGES (JSON list, default [1]), COMPILER (gcc|clang), PRESET
# (debug|asan-ubsan), OUT (result dir, default a temp dir), EXTRA_JOB (JSON
# merged into the job), DOCKER_ARGS (extra docker run args).
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
img=${1:-cppatlas-grader:dev}; shift || true
samples=("$@"); [ ${#samples[@]} -gt 0 ] || samples=("$here"/*.hpp)
out=${OUT:-$(mktemp -d)}
mkdir -p "$out"
for f in "${samples[@]}"; do
  name=$(basename "$f" .hpp)
  python3 - "$f" "$name" > "$out/$name.job.json" <<'PY'
import json, os, sys
job = {"run_id": "sample-" + sys.argv[2], "challenge": "vector",
       "stages": json.loads(os.environ.get("STAGES", "[1]")),
       "stop_on_fail": os.environ.get("STOP_ON_FAIL") == "1",
       "files": {"include/my/vector.hpp": open(sys.argv[1]).read()},
       "options": {"compiler": os.environ.get("COMPILER", "gcc"),
                   "preset": os.environ.get("PRESET", "debug"),
                   "trace": os.environ.get("TRACE") == "1"},
       "limits": {}}
job.update(json.loads(os.environ.get("EXTRA_JOB", "{}")))
print(json.dumps(job))
PY
  start=$(python3 -c 'import time; print(time.time())')
  # shellcheck disable=SC2086
  docker run --rm -i --network none --read-only --user 10001:10001 --cap-drop ALL \
    --security-opt no-new-privileges --pids-limit 256 --memory 3g --memory-swap 3g --cpus 2 \
    --ulimit core=0:0 \
    --tmpfs /work:rw,exec,nosuid,nodev,size=1g,uid=10001,gid=10001,mode=0700 \
    --tmpfs /tmp:rw,nosuid,nodev,size=64m ${DOCKER_ARGS:-} \
    "$img" < "$out/$name.job.json" > "$out/$name.result.json" 2> "$out/$name.stderr" || true
  python3 - "$out/$name.result.json" "$name" "$start" <<'PY'
import json, sys, time
wall = time.time() - float(sys.argv[3])
try:
    r = json.load(open(sys.argv[1]))
except Exception as e:
    print(f"{sys.argv[2]:16} wall={wall:5.1f}s  NO RESULT ({e})"); sys.exit()
st = [f"{s['stage']}:{s['status']}" + (f"({s.get('signal')})" if s.get('signal') else "") for s in r.get("stages", [])]
first = ""
for s in r.get("stages", []):
    c = s.get("compile") or {}
    first = c.get("first_error") or (c.get("preflight") or [""])[0] or s.get("hint", "")
    if first: break
err = r.get("error") or {}
print(f"{sys.argv[2]:16} wall={wall:5.1f}s status={r['status']} passed={r.get('passed')} stages={' '.join(st)} "
      f"build={r['timings'].get('build_ms')}ms total={r['timings'].get('total_ms')}ms size={len(open(sys.argv[1]).read())}B"
      + (f" error={err.get('code')}" if err else "") + (f"\n    {first[:160]}" if first else ""))
PY
done
echo "results in $out"
