#!/usr/bin/env bash
# ci.sh - maintainer CI for "Build your own std::vector" (not shipped to learners).
#
#   ./ci.sh                      full matrix (all compilers, debug + asan-ubsan)
#   ./ci.sh --quick              debug preset only
#   ./ci.sh --only solution      one leg; comma-separated list allowed:
#                                solution,std,starter,fuzz,smoke
#   ./ci.sh -j 8                 parallelism for builds and ctest (default: all cores)
#   ./ci.sh --fail-fast          stop after the first failing cell (default: keep going)
#   ./ci.sh --no-ccache          disable ccache (CCACHE_DISABLE=1) for cold timings
#   ./ci.sh --docker [args...]   build .devcontainer/Dockerfile (GCC 16.2 + Clang 21) and run
#                                ./ci.sh [args] inside it, against a copy of this tree
#
# Legs (per compiler):
#   solution  stages 1-8 + harness selftest against solution/include   (debug, asan-ubsan)
#   std       stages 1-8 + harness selftest against std::vector        (debug, asan-ubsan)
#   starter   learner starter: stages 1-2 build and fail cleanly at run time, stages
#             3-8 fail to compile with ONLY preflight static_assert diagnostics (debug)
#   fuzz      solution/tests/fuzz.cpp differential fuzzer               (asan-ubsan)
#   smoke     ./cppatlas test: solution -> all 8 pass, exit 0; starter -> exit 1,
#             names stage 1; starter --only 3 -> preflight bullet list only (debug)
#
# Environment:
#   CI_COMPILERS="g++-16 /opt/homebrew/opt/llvm/bin/clang++"   compilers to use
#   CI_DOCKER_COMPILERS="g++ clang++-21"   compilers inside --docker (default: those two)
#   CI_BUILD_ROOT=dir            build root (default: build/ci next to this script)
#   CI_FUZZ_ARGS="300 200 4242"  fuzzer arguments: sequences-per-type steps seed
#
# Exit status: 0 if every cell passed, 1 otherwise, 2 on usage/setup errors.
# Portable to bash 3.2 (macOS) and Linux.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BR="${CI_BUILD_ROOT:-$ROOT/build/ci}"
FUZZ_ARGS="${CI_FUZZ_ARGS:-300 200 4242}"
STAGES="01 02 03 04 05 06 07 08"
NSTAGES=8

die() { echo "ci.sh: $*" >&2; exit 2; }

ncpu() { getconf _NPROCESSORS_ONLN 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4; }

now() { perl -MTime::HiRes=time -e 'printf "%.1f", time' 2>/dev/null || date +%s; }
elapsed() { perl -e 'printf "%.1f", $ARGV[1] - $ARGV[0]' "$1" "$2" 2>/dev/null || echo "?"; }

# ----------------------------------------------------------------- arguments
QUICK=0
ONLY="solution,std,starter,fuzz,smoke"
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
    -h | --help) sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown argument '$1' (try --help)" ;;
    esac
done
case "$JOBS" in '' | *[!0-9]*) die "-j needs a number" ;; esac
for leg in $(echo "$ONLY" | tr ',' ' '); do
    case "$leg" in solution | std | starter | fuzz | smoke) ;; *) die "unknown leg '$leg' for --only" ;; esac
done
want() { case ",$ONLY," in *",$1,"*) return 0 ;; *) return 1 ;; esac; }

# ----------------------------------------------------------------- docker mode
if [ $DOCKER -eq 1 ]; then
    command -v docker >/dev/null 2>&1 || die "docker not found"
    docker info >/dev/null 2>&1 || die "docker daemon not reachable (macOS + Colima: run 'colima start')"
    IMG="cppatlas-vector-ci:local"
    mkdir -p "$BR"
    echo "docker: building $IMG from .devcontainer/Dockerfile ..."
    docker build -q -t "$IMG" -f "$ROOT/.devcontainer/Dockerfile" "$ROOT/.devcontainer" >"$BR/docker-build.log" 2>&1 ||
        { tail -30 "$BR/docker-build.log"; die "docker build failed (log: $BR/docker-build.log)"; }
    # The tree is copied in (docker cp), not bind-mounted: the Docker VM may not
    # share this host path (Colima does not share /private/tmp, for example).
    DARGS="--cap-add=SYS_PTRACE --security-opt seccomp=unconfined -e NO_COLOR=1 -e CI_BUILD_ROOT=/tmp/ci-build"
    # CI_DOCKER_COMPILERS (not CI_COMPILERS: host paths mean nothing in the container)
    # picks the compilers inside the container; default: the image's GCC 16.2 (g++)
    # and Clang 21 (clang++-21), the verified pair.
    ENVF="$BR/docker-env.txt"
    echo "CI_COMPILERS=${CI_DOCKER_COMPILERS:-g++ clang++-21}" >"$ENVF"
    [ -n "${CI_FUZZ_ARGS:-}" ] && echo "CI_FUZZ_ARGS=$CI_FUZZ_ARGS" >>"$ENVF"
    # shellcheck disable=SC2086 # DARGS / PASS_ARGS are intentionally word-split
    CID="$(docker create $DARGS --env-file "$ENVF" "$IMG" \
        bash -c 'cd /workspaces/vector && ./ci.sh "$@"' ci.sh $PASS_ARGS)"
    trap 'docker rm -f "$CID" >/dev/null 2>&1 || true' EXIT
    parent="$(dirname "$ROOT")"
    base="$(basename "$ROOT")"
    # bsdtar (macOS): rename with -s and drop xattrs / AppleDouble files, which
    # the container filesystem rejects (com.apple.provenance).
    if tar --version 2>/dev/null | grep -q GNU; then
        tflags="--transform=s,^$base,vector,"
    else
        tflags="-s,^$base,vector, --no-xattrs --no-mac-metadata"
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

# A short, stable tag per compiler: gcc16, clang21, appleclang17.
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

if [ $QUICK -eq 1 ]; then PRESETS="debug"; else PRESETS="debug asan-ubsan"; fi
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
# begin_cell NAME ; end_cell STATUS PASSED TOTAL LOGDIR [DETAIL]
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

# configure DIR PRESET CXX [cmake args...] -> 0/1, log DIR/ci-configure.log
# Every cell starts from an empty build dir (ccache keeps that cheap).
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

# cmake/Sanitizers.cmake probes the ASan runtime once per build dir on macOS +
# Clang (up to 20 s when the runtime hangs). Probe once per compiler per ci run
# and pre-seed the result into the other fresh build dirs.
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

# Parse ctest output into DIR/ci-results.txt: "name<TAB>status" per test.
parse_ctest() {
    sed -nE 's/^ *[0-9]+\/[0-9]+ Test +#[0-9]+: ([^ ]+) \.*[ *]*([A-Za-z][A-Za-z :-]*[A-Za-z]).*/\1	\2/p' "$1"
}

# ----------------------------------------------------------------- leg: matrix cell
matrix_cell() {
    local tag="$1" cxx="$2" preset="$3" subject="$4" dir arg
    dir="$BR/$tag/$preset-$subject"
    case "$subject" in
    solution) arg="-DCPPATLAS_SOLUTION=ON" ;;
    std) arg="-DUSE_STD=ON" ;;
    esac
    begin_cell "$tag $preset $subject"
    if ! configure "$dir" "$preset" "$cxx" -DUSE_STD=OFF -DCPPATLAS_SOLUTION=OFF "$arg"; then
        end_cell FAIL 0 $((NSTAGES + 1)) "$dir" "configure failed: $dir/ci-configure.log"
        return
    fi
    # -k 0: build every target that can be built, so one broken stage
    # does not hide the results of the others.
    local brc=0
    cmake --build "$dir" -j "$JOBS" -- -k 0 >"$dir/ci-build.log" 2>&1 || brc=$?
    local warnings
    warnings="$(grep -c 'warning:' "$dir/ci-build.log" || true)"
    (cd "$dir" && ctest -j "$JOBS" --output-on-failure --timeout 120) >"$dir/ci-test.log" 2>&1 || true
    parse_ctest "$dir/ci-test.log" >"$dir/ci-results.txt"
    local total passed failing
    total="$(wc -l <"$dir/ci-results.txt" | tr -d ' ')"
    passed="$(awk -F'\t' '$2 == "Passed"' "$dir/ci-results.txt" | wc -l | tr -d ' ')"
    failing="$(awk -F'\t' '$2 != "Passed" { printf "%s%s (%s)", sep, $1, $2; sep = ", " }' "$dir/ci-results.txt")"
    local detail=""
    [ $brc -ne 0 ] && detail="build failed (see $dir/ci-build.log)"
    [ -n "$failing" ] && detail="${detail:+$detail; }failing: $failing"
    [ "$total" -ne $((NSTAGES + 1)) ] && detail="${detail:+$detail; }expected $((NSTAGES + 1)) tests, ctest ran $total"
    [ "$warnings" -gt 0 ] && detail="${detail:+$detail; }$warnings compiler warning(s)"
    if [ $brc -eq 0 ] && [ -z "$failing" ] && [ "$total" -eq $((NSTAGES + 1)) ] && [ "$warnings" -eq 0 ]; then
        end_cell PASS "$passed" "$total" "$dir"
    else
        end_cell FAIL "$passed" $((NSTAGES + 1)) "$dir" "$detail"
    fi
}

# ----------------------------------------------------------------- leg: starter
# Splits a ninja -k 0 log into DIR/ci-stage-NN.err, one file per failed stage
# object: the compiler output that ninja prints after "FAILED: <object>" and
# the command line.
split_ninja_log() {
    local log="$1" dir="$2"
    rm -f "$dir"/ci-stage-*.err
    awk -v dir="$dir" '
        /^FAILED: / {
            cur = ""
            if (match($0, /stage_[0-9][0-9]\.cpp\.o/)) cur = substr($0, RSTART + 6, 2)
            else cur = "other"
            out = dir "/ci-stage-" cur ".err"; printf "" > out
            skipcmd = 1; next
        }
        /^\[[0-9]+\/[0-9]+\] / || /^ninja: / { cur = ""; next }
        skipcmd == 1 { skipcmd = 0; next }
        cur != "" { print >> out }
    ' "$log"
}

starter_cell() {
    local tag="$1" cxx="$2" dir="$BR/$tag/debug-starter"
    begin_cell "$tag debug starter"
    if ! configure "$dir" debug "$cxx" -DUSE_STD=OFF -DCPPATLAS_SOLUTION=OFF; then
        end_cell FAIL 0 $((NSTAGES + 1)) "$dir" "configure failed: $dir/ci-configure.log"
        return
    fi
    cmake --build "$dir" -j "$JOBS" -- -k 0 >"$dir/ci-build.log" 2>&1 || true
    split_ninja_log "$dir/ci-build.log" "$dir"
    (cd "$dir" && ctest -j "$JOBS" --output-on-failure --timeout 120) >"$dir/ci-test.log" 2>&1 || true
    parse_ctest "$dir/ci-test.log" >"$dir/ci-results.txt"

    local ok=0 problems="" nn n st errs bad total_err=0
    status_of() { awk -F'\t' -v t="$1" '$1 == t { print $2 }' "$dir/ci-results.txt"; }

    # harness selftest must pass even with the starter.
    st="$(status_of harness-selftest)"
    if [ "$st" = "Passed" ]; then ok=$((ok + 1)); else problems="$problems
harness-selftest: expected Passed, got '${st:-missing}'"; fi

    for nn in $STAGES; do
        n="${nn#0}"
        if [ "$n" -le 2 ]; then
            # Must compile, run, and fail cleanly: a plain doctest failure, not a
            # crash, timeout or sanitizer report.
            st="$(status_of "stage-$nn")"
            if [ -f "$dir/ci-stage-$nn.err" ]; then
                problems="$problems
stage $n: expected to compile with the starter, but it does not ($dir/ci-stage-$nn.err)"
            elif [ "$st" != "Failed" ]; then
                problems="$problems
stage $n: expected a clean test failure ('Failed'), got '${st:-missing}'"
            else
                local rc=0
                "$dir/stage_$nn" >"$dir/ci-stage-$nn.run" 2>&1 || rc=$?
                if [ $rc -ge 1 ] && [ $rc -lt 128 ] && grep -q 'Status: FAILURE' "$dir/ci-stage-$nn.run" &&
                    ! grep -qE 'Sanitizer|runtime error:|terminate called|libc\+\+abi|Segmentation|crashed' "$dir/ci-stage-$nn.run"; then
                    ok=$((ok + 1))
                else
                    problems="$problems
stage $n: did not fail cleanly (exit $rc; see $dir/ci-stage-$nn.run)"
                fi
            fi
        else
            # Must fail to compile with ONLY preflight static_asserts for this stage.
            if [ ! -f "$dir/ci-stage-$nn.err" ]; then
                problems="$problems
stage $n: expected a compile failure with the starter, but it compiled"
                continue
            fi
            errs="$(grep -c 'error:' "$dir/ci-stage-$nn.err" || true)"
            total_err=$((total_err + errs))
            bad="$(grep 'error:' "$dir/ci-stage-$nn.err" |
                grep -vE "static assert(ion)? failed.*: stage $n \(" || true)"
            if [ "$errs" -eq 0 ]; then
                problems="$problems
stage $n: compile failed without any 'error:' line ($dir/ci-stage-$nn.err)"
            elif [ -n "$bad" ]; then
                problems="$problems
stage $n: non-preflight compiler errors ($dir/ci-stage-$nn.err):
$(echo "$bad" | head -5 | cut -c1-200 | sed 's/^/  /')"
            elif grep -q 'warning:' "$dir/ci-stage-$nn.err"; then
                problems="$problems
stage $n: compiler warnings next to the preflight errors ($dir/ci-stage-$nn.err)"
            else
                ok=$((ok + 1))
            fi
        fi
    done
    # Nothing else may have failed or produced errors (e.g. doctest main, selftest).
    if [ -f "$dir/ci-stage-other.err" ]; then
        problems="$problems
a non-stage target failed to build ($dir/ci-stage-other.err)"
    fi
    local all_err
    all_err="$(grep -c 'error:' "$dir/ci-build.log" || true)"
    if [ "$all_err" -ne "$total_err" ]; then
        problems="$problems
$all_err 'error:' lines in the build log, but only $total_err belong to stages 3-8"
    fi
    if [ -z "$problems" ] && [ $ok -eq $((NSTAGES + 1)) ]; then
        end_cell PASS "$ok" $((NSTAGES + 1)) "$dir"
    else
        end_cell FAIL "$ok" $((NSTAGES + 1)) "$dir" "$(echo "$problems" | sed '/^$/d')"
    fi
}

# ----------------------------------------------------------------- leg: fuzz
fuzz_cell() {
    local tag="$1" cxx="$2" dir="$BR/$tag/fuzz-asan-ubsan"
    begin_cell "$tag asan-ubsan fuzz"
    rm -rf "$dir"
    mkdir -p "$dir/src"
    seed_asan_probe "$dir" "$cxx"
    # A throw-away CMake project, so the fuzzer gets exactly the sanitizer flags
    # (including the macOS Homebrew-LLVM ASan workaround) of the asan-ubsan preset.
    cat >"$dir/src/CMakeLists.txt" <<EOF
cmake_minimum_required(VERSION 3.23)
if(CMAKE_HOST_APPLE AND NOT DEFINED CMAKE_OSX_SYSROOT AND NOT DEFINED ENV{SDKROOT})
  execute_process(COMMAND xcrun --show-sdk-path OUTPUT_VARIABLE _sdk
                  OUTPUT_STRIP_TRAILING_WHITESPACE ERROR_QUIET)
  if(_sdk)
    set(CMAKE_OSX_SYSROOT "\${_sdk}" CACHE PATH "macOS SDK")
  endif()
endif()
project(cppatlas_fuzz LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CPPATLAS_SANITIZE ON)
include("$ROOT/cmake/Sanitizers.cmake")
add_library(fuzz_flags INTERFACE)
target_compile_options(fuzz_flags INTERFACE -Wall -Wextra -O1 -g)
cppatlas_apply_sanitizers(fuzz_flags)
# Homebrew LLVM 21.1.2 + macOS 27 SDK: the SDK's math.h expects clang's float.h
# to provide INFINITY/NAN (__need_infinity_nan) when __has_feature(modules) is
# true, but this LLVM's float.h does not, so <cmath>/<random> fail to compile.
include(CheckCXXSourceCompiles)
check_cxx_source_compiles("#include <random>\nint main() { std::mt19937 r(1); return std::uniform_int_distribution<int>(0, 3)(r); }" CPPATLAS_RANDOM_OK)
if(NOT CPPATLAS_RANDOM_OK)
  message(STATUS "cppatlas-ci: WORKAROUND - <random> does not compile (INFINITY missing); defining INFINITY/NAN")
  add_compile_definitions("INFINITY=__builtin_huge_valf()" "NAN=__builtin_nanf(\"\")")
endif()
add_executable(fuzz "$ROOT/solution/tests/fuzz.cpp")
target_include_directories(fuzz PRIVATE "$ROOT/solution/include" "$ROOT/tests/support")
target_link_libraries(fuzz PRIVATE fuzz_flags)
string(REPLACE ";" "\n" _env "\${CPPATLAS_TEST_ENV}")
file(WRITE "\${CMAKE_BINARY_DIR}/fuzz-env.txt" "\${_env}\n")
EOF
    local launcher=""
    [ -n "$CCACHE" ] && launcher="-DCMAKE_CXX_COMPILER_LAUNCHER=$CCACHE"
    if ! cmake -S "$dir/src" -B "$dir" -G Ninja -DCMAKE_BUILD_TYPE=Debug -C "$dir/ci-cache-seed.cmake" \
        -DCMAKE_CXX_COMPILER="$cxx" $launcher >"$dir/ci-configure.log" 2>&1; then
        end_cell FAIL 0 1 "$dir" "configure failed: $dir/ci-configure.log"
        return
    fi
    remember_asan_probe "$dir"
    if ! cmake --build "$dir" -j "$JOBS" >"$dir/ci-build.log" 2>&1; then
        end_cell FAIL 0 1 "$dir" "build failed: $dir/ci-build.log"
        return
    fi
    local rc=0
    # shellcheck disable=SC2046,SC2086
    # detect_stack_use_after_return=0: with GCC's libasan on Linux the fake stack
    # degrades badly once exceptions unwind through instrumented frames (the
    # fuzzer injects thousands): 1.5 s -> 95 s. The stage tests keep it on.
    (export $(grep -v '^$' "$dir/fuzz-env.txt" | tr '\n' ' ') &&
        export ASAN_OPTIONS="${ASAN_OPTIONS:-}:detect_stack_use_after_return=0" &&
        "$dir/fuzz" $FUZZ_ARGS) >"$dir/ci-test.log" 2>&1 || rc=$?
    if [ $rc -eq 0 ] && ! grep -qE 'Sanitizer|runtime error:' "$dir/ci-test.log"; then
        end_cell PASS 1 1 "$dir"
    else
        end_cell FAIL 0 1 "$dir" "fuzz $FUZZ_ARGS exited $rc: $(tail -n 3 "$dir/ci-test.log" | cut -c1-200)"
    fi
}

# ----------------------------------------------------------------- leg: smoke
smoke_cell() {
    local tag="$1" cxx="$2" dir="$BR/$tag/smoke" rc out problems="" ok=0
    begin_cell "$tag debug smoke (./cppatlas)"
    rm -rf "$dir"
    mkdir -p "$dir"

    # 1. solution: all 8 stages pass, exit 0.
    rc=0
    out="$dir/ci-solution.log"
    CXX="$cxx" NO_COLOR=1 CPPATLAS_BUILD_DIR="$dir/solution" CPPATLAS_CMAKE_ARGS="-DCPPATLAS_SOLUTION=ON" \
        "$ROOT/cppatlas" test 8 >"$out" 2>&1 </dev/null || rc=$?
    local passes
    passes="$(grep -cE '^stage [1-8] ✓' "$out" || true)"
    if [ $rc -eq 0 ] && [ "$passes" -eq $NSTAGES ] && grep -q "All $NSTAGES stages pass" "$out"; then
        ok=$((ok + 1))
    else
        problems="$problems
solution: exit $rc, $passes/$NSTAGES stages passed ($out)"
    fi

    # 2. starter: exit non-zero and name stage 1 as the failing stage.
    rc=0
    out="$dir/ci-starter.log"
    CXX="$cxx" NO_COLOR=1 CPPATLAS_BUILD_DIR="$dir/starter" CPPATLAS_CMAKE_ARGS="" \
        "$ROOT/cppatlas" test >"$out" 2>&1 </dev/null || rc=$?
    if [ $rc -ne 0 ] && grep -qE '^stage 1 ✗' "$out" && ! grep -qE '^stage [2-8] ' "$out" &&
        grep -q 'next: read https://cppatlas.com/build/vector/empty-vector' "$out" &&
        ! grep -qE 'crashed|did not finish' "$out"; then
        ok=$((ok + 1))
    else
        problems="$problems
starter: exit $rc, expected non-zero with 'stage 1 ✗' and nothing after it ($out)"
    fi

    # 3. starter, --only 3: "does not compile" + the preflight bullet list, and
    #    no raw compiler errors ("fix these first").
    rc=0
    out="$dir/ci-starter-only3.log"
    CXX="$cxx" NO_COLOR=1 CPPATLAS_BUILD_DIR="$dir/starter" CPPATLAS_CMAKE_ARGS="" \
        "$ROOT/cppatlas" test --only 3 >"$out" 2>&1 </dev/null || rc=$?
    if [ $rc -ne 0 ] && grep -qE '^stage 3 ✗ growth \(does not compile\)' "$out" &&
        grep -q 'Your vector is missing something this stage needs' "$out" &&
        grep -qE '^    - stage 3 \(growth\): my::vector<T> needs `void reserve' "$out" &&
        ! grep -q 'fix these first' "$out" && ! grep -q 'error:' "$out"; then
        ok=$((ok + 1))
    else
        problems="$problems
starter --only 3: exit $rc, expected only the preflight bullet list ($out)"
    fi

    if [ -z "$problems" ]; then
        end_cell PASS "$ok" 3 "$dir"
    else
        end_cell FAIL "$ok" 3 "$dir" "$(echo "$problems" | sed '/^$/d')"
    fi
}

# ----------------------------------------------------------------- run
i=0
for tag in $TAGS; do
    i=$((i + 1))
    eval "cxx=\${$i}"
    for preset in $PRESETS; do
        if want solution; then matrix_cell "$tag" "$cxx" "$preset" solution; fi
        if want std; then matrix_cell "$tag" "$cxx" "$preset" std; fi
    done
    if want starter; then starter_cell "$tag" "$cxx"; fi
    if want fuzz; then fuzz_cell "$tag" "$cxx"; fi
    if want smoke; then smoke_cell "$tag" "$cxx"; fi
done

[ $CELL_NO -gt 0 ] || die "nothing to run"
print_summary
[ $FAILED_CELLS -eq 0 ]
