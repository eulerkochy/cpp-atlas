#!/usr/bin/env bash
# ci.sh - maintainer CI for "Build your own chess engine" (not shipped to learners).
#
#   ./ci.sh                      full matrix (all compilers, all presets)
#   ./ci.sh --quick              debug-starter, debug-solution, export-template only
#   ./ci.sh --only starter       one leg; comma-separated list allowed:
#                                starter,solution,asan,release,export
#   ./ci.sh -j 8                 parallelism for builds and ctest (default: all cores)
#   ./ci.sh --fail-fast          stop after the first failing cell (default: keep going)
#   ./ci.sh --no-ccache          disable ccache (CCACHE_DISABLE=1) for cold timings
#   ./ci.sh --docker [args...]   build .devcontainer/Dockerfile (GCC 16.2 + Clang 21) and run
#                                ./ci.sh [args] inside it, against a copy of this tree
#
# Legs (per compiler unless noted):
#   starter   debug-starter: all 9 stages + chess_engine compile with 0 warnings;
#             each stage fails cleanly at run time (exit != 0, no crash signal)
#   solution  debug-solution: -DCPPATLAS_SOLUTION=ON passes stages 1..9 + chess_engine uci/quit
#   asan      asan-ubsan-solution: -DCPPATLAS_SOLUTION=ON -DCPPATLAS_SANITIZE=ON passes 1..9
#   release   release-solution: -DCPPATLAS_SOLUTION=ON release passes 1..9 + solution/tests/fuzz.cpp
#             (+ magic_gen --check and chess_bench --quick when present)
#   export    export-template: runs scripts/export-template.sh and builds debug cleanly (once)
#
# Environment:
#   CI_COMPILERS="g++-16 /opt/homebrew/opt/llvm/bin/clang++"   compilers to use
#   CI_DOCKER_COMPILERS="g++ clang++-21"   compilers inside --docker (default: those two)
#   CI_BUILD_ROOT=dir            build root (default: build/ci next to this script)
#
# Exit status: 0 if every cell passed, 1 otherwise, 2 on usage/setup errors.
# Portable to bash 3.2 (macOS) and Linux.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BR="${CI_BUILD_ROOT:-$ROOT/build/ci}"
STAGES="01 02 03 04 05 06 07 08 09"
NSTAGES=9

die() { echo "ci.sh: $*" >&2; exit 2; }

ncpu() { getconf _NPROCESSORS_ONLN 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4; }

now() { perl -MTime::HiRes=time -e 'printf "%.1f", time' 2>/dev/null || date +%s; }
elapsed() { perl -e 'printf "%.1f", $ARGV[1] - $ARGV[0]' "$1" "$2" 2>/dev/null || echo "?"; }

# ----------------------------------------------------------------- arguments
QUICK=0
ONLY="starter,solution,asan,release,export"
JOBS="$(ncpu)"
KEEP_GOING=1
DOCKER=0
PASS_ARGS=""
while [ $# -gt 0 ]; do
    case "$1" in
    --quick) QUICK=1; PASS_ARGS="$PASS_ARGS --quick"; shift ;;
    --only) [ $# -ge 2 ] || die "--only needs a value"; ONLY="$2"; PASS_ARGS="$PASS_ARGS --only $2"; shift 2 ;;
    --only=*) ONLY="${1#--only=}"; PASS_ARGS="$PASS_ARGS $1"; shift ;;
    -j) [ $# -ge 2 ] || die "-j needs a value"; JOBS="$2"; PASS_ARGS="$PASS_ARGS -j $2"; shift 2 ;;
    -j*) JOBS="${1#-j}"; PASS_ARGS="$PASS_ARGS -j ${1#-j}"; shift ;;
    --keep-going) KEEP_GOING=1; PASS_ARGS="$PASS_ARGS $1"; shift ;;
    --fail-fast | --no-keep-going) KEEP_GOING=0; PASS_ARGS="$PASS_ARGS $1"; shift ;;
    --no-ccache) export CCACHE_DISABLE=1; PASS_ARGS="$PASS_ARGS $1"; shift ;;
    --docker) DOCKER=1; shift ;;
    -h | --help) sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown argument '$1' (try --help)" ;;
    esac
done
case "$JOBS" in '' | *[!0-9]*) die "-j needs a number" ;; esac
for leg in $(echo "$ONLY" | tr ',' ' '); do
    case "$leg" in starter | solution | asan | release | export) ;; *) die "unknown leg '$leg' for --only" ;; esac
done
want() { case ",$ONLY," in *",$1,"*) return 0 ;; *) return 1 ;; esac; }

# ----------------------------------------------------------------- docker mode
if [ $DOCKER -eq 1 ]; then
    command -v docker >/dev/null 2>&1 || die "docker not found"
    docker info >/dev/null 2>&1 || die "docker daemon not reachable (macOS + Colima: run 'colima start')"
    IMG="cppatlas-chess-ci:local"
    mkdir -p "$BR"
    echo "docker: building $IMG from .devcontainer/Dockerfile ..."
    docker build -q -t "$IMG" -f "$ROOT/.devcontainer/Dockerfile" "$ROOT/.devcontainer" >"$BR/docker-build.log" 2>&1 ||
        { tail -30 "$BR/docker-build.log"; die "docker build failed (log: $BR/docker-build.log)"; }
    DARGS="--cap-add=SYS_PTRACE --security-opt seccomp=unconfined -e NO_COLOR=1 -e CI_BUILD_ROOT=/tmp/ci-build"
    ENVF="$BR/docker-env.txt"
    echo "CI_COMPILERS=${CI_DOCKER_COMPILERS:-g++ clang++-21}" >"$ENVF"
    # shellcheck disable=SC2086 # DARGS / PASS_ARGS are intentionally word-split
    CID="$(docker create $DARGS --env-file "$ENVF" "$IMG" \
        bash -c 'cd /workspaces/chess && ./ci.sh "$@"' ci.sh $PASS_ARGS)"
    trap 'docker rm -f "$CID" >/dev/null 2>&1 || true' EXIT
    parent="$(dirname "$ROOT")"
    base="$(basename "$ROOT")"
    if tar --version 2>/dev/null | grep -q GNU; then
        tflags="--transform=s,^$base,chess,"
    else
        tflags="-s,^$base,chess, --no-xattrs --no-mac-metadata"
    fi
    # shellcheck disable=SC2086 # tflags is intentionally word-split
    (cd "$parent" && COPYFILE_DISABLE=1 tar -cf - --exclude "$base/build" --exclude "$base/.cache" \
        $tflags "$base") | docker cp - "$CID:/workspaces/"
    rc=0
    docker start -a "$CID" || rc=$?
    if [ $rc -ne 0 ]; then
        rm -rf "$BR/docker-logs"
        docker cp "$CID:/tmp/ci-build" "$BR/docker-logs" >/dev/null 2>&1 &&
            echo "docker: container build root copied to $BR/docker-logs"
    fi
    exit $rc
fi

command -v cmake >/dev/null 2>&1 || die "cmake not found"
command -v ninja >/dev/null 2>&1 || die "ninja not found"
command -v ctest >/dev/null 2>&1 || die "ctest not found"

# ----------------------------------------------------------------- compilers
discover_compilers() {
    local c v best=""
    if [ "$(uname -s)" = "Darwin" ]; then
        for d in /opt/homebrew/bin /usr/local/bin; do
            for c in "$d"/g++-[0-9]*; do
                [ -x "$c" ] || continue
                v="${c##*/g++-}"
                case "$v" in *[!0-9]*) continue ;; esac
                if [ -z "$best" ] || [ "$v" -gt "${best##*/g++-}" ]; then best="$c"; fi
            done
        done
        [ -n "$best" ] && echo "$best"
        for c in /opt/homebrew/opt/llvm/bin/clang++ /usr/local/opt/llvm/bin/clang++ /usr/bin/clang++; do
            if [ -x "$c" ]; then echo "$c"; break; fi
        done
    else
        for c in g++-16 g++; do
            if command -v "$c" >/dev/null 2>&1; then command -v "$c"; break; fi
        done
        for c in clang++-21 clang++; do
            if command -v "$c" >/dev/null 2>&1; then command -v "$c"; break; fi
        done
    fi
}

compiler_tag() {
    local cxx="$1" ver id
    ver="$("$cxx" --version 2>/dev/null | head -n 1)"
    if echo "$ver" | grep -q 'Apple clang'; then id=appleclang
    elif echo "$ver" | grep -q 'clang'; then id=clang
    else id=gcc
    fi
    v="$("$cxx" -dumpversion 2>/dev/null || echo 0)"
    echo "$id${v%%.*}"
}

COMPILERS="${CI_COMPILERS:-$(discover_compilers | tr '\n' ' ')}"
[ -n "${COMPILERS// /}" ] || die "no C++ compiler found (set CI_COMPILERS)"
TAGS=""
CXXS=""
for c in $COMPILERS; do
    p="$(command -v "$c" 2>/dev/null)" || die "compiler '$c' not found"
    t="$(compiler_tag "$p")"
    while echo " $TAGS " | grep -q " $t "; do t="${t}x"; done
    TAGS="$TAGS $t"
    CXXS="$CXXS $p"
done

CCACHE="$(command -v ccache 2>/dev/null || true)"
[ -n "${CCACHE_DISABLE:-}" ] && CCACHE=""

mkdir -p "$BR"
SUMMARY="$BR/summary.txt"
: >"$SUMMARY"
rm -f "$BR"/asan-probe-*.txt
FAILED_CELLS=0
CELL_NO=0
T_START="$(now)"

echo "ci.sh: build root $BR, -j $JOBS, ccache: ${CCACHE:-off}"
set -- $CXXS
i=0
for t in $TAGS; do
    i=$((i + 1))
    eval "cxx=\${$i}"
    echo "  $t = $cxx ($("$cxx" --version | head -n 1))"
done
echo

# ----------------------------------------------------------------- cell plumbing
begin_cell() {
    CELL_NAME="$1"
    CELL_NO=$((CELL_NO + 1))
    CELL_T0="$(now)"
    printf '%-34s ' "$CELL_NAME"
}
end_cell() {
    local status="$1" passed="$2" total="$3" logdir="$4" detail="${5:-}" secs
    secs="$(elapsed "$CELL_T0" "$(now)")"
    printf '%-4s %5s %7ss\n' "$status" "$passed/$total" "$secs"
    printf '%s\t%s\t%s\t%s\t%s\n' "$CELL_NAME" "$status" "$passed/$total" "$secs" "$logdir" >>"$SUMMARY"
    if [ -n "$detail" ]; then echo "$detail" >"$logdir/ci-detail.txt"; fi
    if [ "$status" != "PASS" ]; then
        FAILED_CELLS=$((FAILED_CELLS + 1))
        [ -n "$detail" ] && echo "$detail" | sed 's/^/    /'
        echo "    logs: $logdir"
        if [ $KEEP_GOING -eq 0 ]; then print_summary; exit 1; fi
    fi
}

print_summary() {
    echo
    echo "Summary ($(elapsed "$T_START" "$(now)")s total)"
    printf '%-34s %-4s %7s %8s\n' "cell" "res" "passed" "time"
    printf '%-34s %-4s %7s %8s\n' "----" "---" "------" "----"
    while IFS="$(printf '\t')" read -r name status counts secs logdir; do
        printf '%-34s %-4s %7s %7ss\n' "$name" "$status" "$counts" "$secs"
    done <"$SUMMARY"
    echo
    if [ $FAILED_CELLS -eq 0 ]; then
        echo "ci.sh: all $CELL_NO cells passed"
    else
        echo "ci.sh: $FAILED_CELLS of $CELL_NO cells FAILED:"
        awk -F'\t' '$2 != "PASS" { print "  " $1 "  ->  " $5 "/ci-detail.txt" }' "$SUMMARY"
    fi
}

configure() {
    local dir="$1" preset="$2" cxx="$3"
    shift 3
    rm -rf "$dir"
    mkdir -p "$dir"
    seed_asan_probe "$dir" "$cxx"
    (cd "$ROOT" && cmake --preset "$preset" -B "$dir" -C "$dir/ci-cache-seed.cmake" -DCMAKE_CXX_COMPILER="$cxx" "$@") \
        >"$dir/ci-configure.log" 2>&1 || return 1
    remember_asan_probe "$dir"
}

seed_asan_probe() {
    local dir="$1" cxx="$2" f="$BR/asan-probe-$(echo "$2" | tr -c 'A-Za-z0-9' '_').txt"
    : >"$dir/ci-cache-seed.cmake"
    if [ -f "$f" ]; then cp "$f" "$dir/ci-cache-seed.cmake"; fi
    CI_SEED_FILE="$f"
}
remember_asan_probe() {
    local dir="$1" mode probed
    [ -s "$CI_SEED_FILE" ] && return 0
    mode="$(sed -n 's/^CPPATLAS_ASAN_MODE:INTERNAL=//p' "$dir/CMakeCache.txt")"
    probed="$(sed -n 's/^CPPATLAS_ASAN_PROBED_FOR:INTERNAL=//p' "$dir/CMakeCache.txt")"
    if [ -n "$mode" ] && [ -n "$probed" ]; then
        printf 'set(CPPATLAS_ASAN_MODE "%s" CACHE INTERNAL "")\nset(CPPATLAS_ASAN_PROBED_FOR "%s" CACHE INTERNAL "")\n' \
            "$mode" "$probed" >"$CI_SEED_FILE"
    fi
}

parse_ctest() {
    sed -nE 's/^ *[0-9]+\/[0-9]+ Test +#[0-9]+: ([^ ]+) \.*[ *]*([A-Za-z][A-Za-z :-]*[A-Za-z]).*/\1	\2/p' "$1"
}

# ----------------------------------------------------------------- leg: starter
starter_cell() {
    local tag="$1" cxx="$2" dir="$BR/$tag/debug-starter"
    local total_checks=$((NSTAGES + 1)) # 9 stages + chess_engine
    begin_cell "$tag debug-starter"
    if ! configure "$dir" debug "$cxx" -DCPPATLAS_SOLUTION=OFF; then
        end_cell FAIL 0 "$total_checks" "$dir" "configure failed: $dir/ci-configure.log"
        return
    fi
    local brc=0
    cmake --build "$dir" -j "$JOBS" -- -k 0 >"$dir/ci-build.log" 2>&1 || brc=$?
    local warnings
    warnings="$(grep -c 'warning:' "$dir/ci-build.log" || true)"
    (cd "$dir" && ctest -j "$JOBS" --output-on-failure --timeout 120) >"$dir/ci-test.log" 2>&1 || true
    parse_ctest "$dir/ci-test.log" >"$dir/ci-results.txt"

    local ok=0 problems="" nn n st rc
    status_of() { awk -F'\t' -v t="$1" '$1 == t { print $2 }' "$dir/ci-results.txt"; }

    if [ $brc -ne 0 ]; then
        problems="$problems
build failed against starter headers ($dir/ci-build.log)"
    fi
    if [ "$warnings" -gt 0 ]; then
        problems="$problems
$warnings compiler warning(s) ($dir/ci-build.log)"
    fi

    if [ -x "$dir/chess_engine" ]; then
        rc=0
        printf 'uci\nquit\n' | "$dir/chess_engine" >"$dir/ci-engine.run" 2>&1 || rc=$?
        if [ $rc -eq 0 ]; then
            ok=$((ok + 1))
        else
            problems="$problems
chess_engine exited $rc on 'uci\\nquit' ($dir/ci-engine.run)"
        fi
    else
        problems="$problems
chess_engine binary was not built"
    fi

    for nn in $STAGES; do
        n="${nn#0}"
        st="$(status_of "stage-$nn")"
        if [ "$st" != "Failed" ]; then
            problems="$problems
stage $n: expected a clean test failure ('Failed'), got '${st:-missing}'"
        else
            rc=0
            "$dir/stage_$nn" >"$dir/ci-stage-$nn.run" 2>&1 || rc=$?
            if [ $rc -ge 1 ] && [ $rc -lt 128 ] && grep -q 'Status: FAILURE' "$dir/ci-stage-$nn.run" &&
                ! grep -qE 'Sanitizer|runtime error:|terminate called|libc\+\+abi|Segmentation|crashed' "$dir/ci-stage-$nn.run"; then
                ok=$((ok + 1))
            else
                problems="$problems
stage $n: did not fail cleanly (exit $rc; see $dir/ci-stage-$nn.run)"
            fi
        fi
    done

    if [ -z "$problems" ] && [ $ok -eq $total_checks ]; then
        end_cell PASS "$ok" "$total_checks" "$dir"
    else
        end_cell FAIL "$ok" "$total_checks" "$dir" "$(echo "$problems" | sed '/^$/d')"
    fi
}

# ----------------------------------------------------------------- leg: solution (debug / asan-ubsan)
solution_cell() {
    local tag="$1" cxx="$2" preset="$3" dir extra_args=""
    dir="$BR/$tag/${preset}-solution"
    [ "$preset" = "asan-ubsan" ] && extra_args="-DCPPATLAS_SANITIZE=ON"
    begin_cell "$tag ${preset}-solution"
    # shellcheck disable=SC2086
    if ! configure "$dir" "$preset" "$cxx" -DCPPATLAS_SOLUTION=ON $extra_args; then
        end_cell FAIL 0 $((NSTAGES + 1)) "$dir" "configure failed: $dir/ci-configure.log"
        return
    fi
    local brc=0
    cmake --build "$dir" -j "$JOBS" -- -k 0 >"$dir/ci-build.log" 2>&1 || brc=$?
    local warnings
    warnings="$(grep -c 'warning:' "$dir/ci-build.log" || true)"
    (cd "$dir" && ctest -j "$JOBS" --output-on-failure --timeout 120) >"$dir/ci-test.log" 2>&1 || true
    parse_ctest "$dir/ci-test.log" >"$dir/ci-results.txt"

    local total passed failing detail="" engine_ok=0
    total="$(wc -l <"$dir/ci-results.txt" | tr -d ' ')"
    passed="$(awk -F'\t' '$2 == "Passed"' "$dir/ci-results.txt" | wc -l | tr -d ' ')"
    failing="$(awk -F'\t' '$2 != "Passed" { printf "%s%s (%s)", sep, $1, $2; sep = ", " }' "$dir/ci-results.txt")"

    if [ -x "$dir/chess_engine" ]; then
        local erc=0
        printf 'uci\nquit\n' | "$dir/chess_engine" >"$dir/ci-engine.run" 2>&1 || erc=$?
        if [ $erc -eq 0 ] && grep -q 'uciok' "$dir/ci-engine.run"; then
            engine_ok=1
        else
            detail="${detail:+$detail; }chess_engine failed uci/quit (rc=$erc, see $dir/ci-engine.run)"
        fi
    else
        detail="${detail:+$detail; }chess_engine binary missing"
    fi

    [ $brc -ne 0 ] && detail="build failed (see $dir/ci-build.log)${detail:+; $detail}"
    [ -n "$failing" ] && detail="${detail:+$detail; }failing: $failing"
    [ "$total" -ne $NSTAGES ] && detail="${detail:+$detail; }expected $NSTAGES tests, ctest ran $total"
    [ "$warnings" -gt 0 ] && detail="${detail:+$detail; }$warnings compiler warning(s)"

    local ok_count=$((passed + engine_ok))
    if [ $brc -eq 0 ] && [ -z "$failing" ] && [ "$total" -eq $NSTAGES ] && [ $engine_ok -eq 1 ] && [ "$warnings" -eq 0 ]; then
        end_cell PASS "$ok_count" $((NSTAGES + 1)) "$dir"
    else
        end_cell FAIL "$ok_count" $((NSTAGES + 1)) "$dir" "$detail"
    fi
}

# ----------------------------------------------------------------- leg: release + fuzz
release_cell() {
    local tag="$1" cxx="$2" dir="$BR/$tag/release-solution"
    local has_fuzz=0 has_magic_gen=0 has_bench=0 expected=$NSTAGES
    [ -f "$ROOT/solution/tests/fuzz.cpp" ] && has_fuzz=1 && expected=$((expected + 1))
    [ -f "$ROOT/tools/magic_gen.cpp" ] && has_magic_gen=1 && expected=$((expected + 1))
    [ -f "$ROOT/bench/sliding_bench.cpp" ] && has_bench=1 && expected=$((expected + 1))
    begin_cell "$tag release-solution"
    if ! configure "$dir" release "$cxx" -DCPPATLAS_SOLUTION=ON; then
        end_cell FAIL 0 "$expected" "$dir" "configure failed: $dir/ci-configure.log"
        return
    fi
    local brc=0
    cmake --build "$dir" -j "$JOBS" -- -k 0 >"$dir/ci-build.log" 2>&1 || brc=$?
    local warnings
    warnings="$(grep -c 'warning:' "$dir/ci-build.log" || true)"
    (cd "$dir" && ctest -j "$JOBS" --output-on-failure --timeout 120) >"$dir/ci-test.log" 2>&1 || true
    parse_ctest "$dir/ci-test.log" >"$dir/ci-results.txt"

    local total passed failing detail="" fuzz_ok=0 magic_gen_ok=0 bench_ok=0
    total="$(wc -l <"$dir/ci-results.txt" | tr -d ' ')"
    passed="$(awk -F'\t' '$2 == "Passed"' "$dir/ci-results.txt" | wc -l | tr -d ' ')"
    failing="$(awk -F'\t' '$2 != "Passed" { printf "%s%s (%s)", sep, $1, $2; sep = ", " }' "$dir/ci-results.txt")"

    if [ $has_fuzz -eq 1 ]; then
        local fdir="$dir/fuzz" sysroot="" frc=0
        mkdir -p "$fdir"
        if [ "$(uname -s)" = "Darwin" ] && [ -z "${SDKROOT:-}" ] && command -v xcrun >/dev/null 2>&1; then
            sysroot="$(xcrun --show-sdk-path 2>/dev/null || true)"
        fi
        # shellcheck disable=SC2086
        if "$cxx" -std=c++23 -O2 -Wall -Wextra ${sysroot:+-isysroot "$sysroot"} \
            -I"$ROOT/solution/include" -I"$ROOT/include" \
            "$ROOT/solution/tests/fuzz.cpp" -o "$fdir/fuzz" >"$fdir/build.log" 2>&1; then
            local fwarn
            fwarn="$(grep -c 'warning:' "$fdir/build.log" || true)"
            warnings=$((warnings + fwarn))
            "$fdir/fuzz" >"$fdir/run.log" 2>&1 || frc=$?
            if [ $frc -eq 0 ]; then
                fuzz_ok=1
            else
                detail="${detail:+$detail; }fuzz.cpp exited $frc (see $fdir/run.log)"
            fi
        else
            detail="${detail:+$detail; }fuzz.cpp failed to compile (see $fdir/build.log)"
        fi
    fi

    if [ $has_magic_gen -eq 1 ]; then
        if [ -x "$dir/magic_gen" ]; then
            local mrc=0
            "$dir/magic_gen" --check >"$dir/ci-magic-gen.run" 2>&1 || mrc=$?
            if [ $mrc -eq 0 ]; then
                magic_gen_ok=1
            else
                detail="${detail:+$detail; }magic_gen --check exited $mrc (see $dir/ci-magic-gen.run)"
            fi
        else
            detail="${detail:+$detail; }magic_gen binary missing"
        fi
    fi

    if [ $has_bench -eq 1 ]; then
        if [ -x "$dir/chess_bench" ]; then
            local brc2=0
            "$dir/chess_bench" --quick >"$dir/ci-chess-bench.run" 2>&1 || brc2=$?
            if [ $brc2 -eq 0 ]; then
                bench_ok=1
            else
                detail="${detail:+$detail; }chess_bench --quick exited $brc2 (see $dir/ci-chess-bench.run)"
            fi
        else
            detail="${detail:+$detail; }chess_bench binary missing"
        fi
    fi

    [ $brc -ne 0 ] && detail="build failed (see $dir/ci-build.log)${detail:+; $detail}"
    [ -n "$failing" ] && detail="${detail:+$detail; }failing: $failing"
    [ "$total" -ne $NSTAGES ] && detail="${detail:+$detail; }expected $NSTAGES tests, ctest ran $total"
    [ "$warnings" -gt 0 ] && detail="${detail:+$detail; }$warnings compiler warning(s)"

    local ok_count=$((passed + fuzz_ok + magic_gen_ok + bench_ok))
    if [ $brc -eq 0 ] && [ -z "$failing" ] && [ "$total" -eq $NSTAGES ] &&
       [ $ok_count -eq $expected ] && [ "$warnings" -eq 0 ]; then
        end_cell PASS "$ok_count" "$expected" "$dir"
    else
        end_cell FAIL "$ok_count" "$expected" "$dir" "$detail"
    fi
}

# ----------------------------------------------------------------- leg: export-template
export_cell() {
    local cxx="$1" dir="$BR/export-template" repo
    begin_cell "export-template"
    rm -rf "$dir"
    mkdir -p "$dir"
    repo="$(mktemp -d "${TMPDIR:-/tmp}/cppatlas-chess-export.XXXXXX")"
    if ! "$ROOT/scripts/export-template.sh" "$repo" >"$dir/export.log" 2>&1; then
        rm -rf "$repo"
        end_cell FAIL 0 2 "$dir" "export-template.sh failed: $(tail -n 5 "$dir/export.log")"
        return
    fi
    if ! (cd "$repo" && cmake --preset debug -DCMAKE_CXX_COMPILER="$cxx" && cmake --build --preset debug -j "$JOBS") \
        >"$dir/build.log" 2>&1; then
        rm -rf "$repo"
        end_cell FAIL 1 2 "$dir" "exported template debug build failed (see $dir/build.log)"
        return
    fi
    local warnings
    warnings="$(grep -c 'warning:' "$dir/build.log" || true)"
    rm -rf "$repo"
    if [ "$warnings" -gt 0 ]; then
        end_cell FAIL 1 2 "$dir" "exported template had $warnings compiler warning(s) ($dir/build.log)"
        return
    fi
    end_cell PASS 2 2 "$dir"
}

# ----------------------------------------------------------------- run
i=0
first_cxx=""
for tag in $TAGS; do
    i=$((i + 1))
    eval "cxx=\${$i}"
    [ -z "$first_cxx" ] && first_cxx="$cxx"
    if want starter; then starter_cell "$tag" "$cxx"; fi
    if want solution; then solution_cell "$tag" "$cxx" debug; fi
    if [ $QUICK -eq 0 ]; then
        if want asan; then solution_cell "$tag" "$cxx" asan-ubsan; fi
        if want release; then release_cell "$tag" "$cxx"; fi
    fi
done
if want export; then export_cell "$first_cxx"; fi

[ $CELL_NO -gt 0 ] || die "nothing to run"
print_summary
[ $FAILED_CELLS -eq 0 ]
