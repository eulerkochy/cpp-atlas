#!/usr/bin/env bash
# Build the cppatlas grader image.
#
# Usage: scripts/build-grader.sh [--challenge-dir DIR] [--challenge NAME]
#          [--tag TAG] [--platform linux/amd64|linux/arm64]
#          [--target toolchain|grader] [--push-fly]
#
# The challenge directory is filtered into a temp copy (no solution/, build/,
# .git, .github, .devcontainer, ci.sh, *.jsonl) and handed to buildx as the
# named build context "challenge". The runner/ directory is the main context.
#
# --push-fly builds linux/amd64 and pushes registry.fly.io/cppatlas-grader:<version>.
# The run machines live in the Fly app "cppatlas-grader" in the `personal` org.
# NEVER use the org `rakshith-aloori`. This script never creates apps; the
# app must already exist.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNNER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_DIR="$(cd "$RUNNER_DIR/.." && pwd)"

CHALLENGE_DIR="$REPO_DIR/challenges/vector"
CHALLENGE="vector"
TAG="cppatlas-grader:dev"
PLATFORM=""
TARGET="grader"
PUSH_FLY=0
FLY_APP="cppatlas-grader"

die() { echo "build-grader: $*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --challenge-dir) [ $# -ge 2 ] || die "--challenge-dir needs a value"; CHALLENGE_DIR="$2"; shift 2 ;;
    --challenge)     [ $# -ge 2 ] || die "--challenge needs a value"; CHALLENGE="$2"; shift 2 ;;
    --tag)           [ $# -ge 2 ] || die "--tag needs a value"; TAG="$2"; shift 2 ;;
    --platform)      [ $# -ge 2 ] || die "--platform needs a value"; PLATFORM="$2"; shift 2 ;;
    --target)        [ $# -ge 2 ] || die "--target needs a value"; TARGET="$2"; shift 2 ;;
    --push-fly)      PUSH_FLY=1; shift ;;
    -h|--help)       sed -n '2,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

case "$TARGET" in toolchain|grader) ;; *) die "--target must be toolchain or grader" ;; esac
case "$CHALLENGE" in *[!A-Za-z0-9._-]*|"") die "bad --challenge name" ;; esac
[ -d "$CHALLENGE_DIR" ] || die "challenge dir not found: $CHALLENGE_DIR"
command -v docker >/dev/null || die "docker not found"
command -v rsync >/dev/null || die "rsync not found"

if [ -z "$PLATFORM" ]; then
  case "$(docker version --format '{{.Server.Arch}}' 2>/dev/null || uname -m)" in
    arm64|aarch64) PLATFORM="linux/arm64" ;;
    *)             PLATFORM="linux/amd64" ;;
  esac
fi
case "$PLATFORM" in linux/amd64|linux/arm64) ;; *) die "--platform must be linux/amd64 or linux/arm64" ;; esac

STAGE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/cppatlas-challenge.XXXXXX")"
trap 'rm -rf "$STAGE_DIR"' EXIT

# Filtered copy of the challenge: the private solution must never reach the image.
rsync -a --delete \
  --exclude='/solution' --exclude='/build' --exclude='.git' --exclude='.github' \
  --exclude='/.devcontainer' --exclude='/ci.sh' --exclude='*.jsonl' \
  --exclude='fuzz.cpp' --exclude='.DS_Store' --exclude='/node_modules' \
  "$CHALLENGE_DIR"/ "$STAGE_DIR"/
[ ! -e "$STAGE_DIR/solution" ] || die "solution directory leaked into staged context"
if [ -n "$(find "$STAGE_DIR" \( -name solution -o -name fuzz.cpp \) -print | head -1)" ]; then
  die "forbidden file in staged challenge context"
fi

# Version: repo git short sha + short content hash of the staged challenge tree.
SHA="$(git -C "$REPO_DIR" rev-parse --short=9 HEAD 2>/dev/null || echo nogit)"
if command -v sha256sum >/dev/null; then SUM=sha256sum; else SUM="shasum -a 256"; fi
TREE_HASH="$(cd "$STAGE_DIR" && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 $SUM | $SUM | cut -c1-8)"
GRADER_VERSION="${SHA}-${TREE_HASH}"

PUSH_ARGS=(--load)
if [ "$PUSH_FLY" = 1 ]; then
  command -v fly >/dev/null || die "fly CLI not found"
  # Read-only check; also confirms we are logged in. Check the org by hand.
  WHO="$(fly auth whoami 2>/dev/null)" || die "not logged in to fly (fly auth whoami failed)"
  echo "fly user: $WHO (Fly org must be 'personal'; never 'rakshith-aloori')"
  PLATFORM="linux/amd64"
  TARGET="grader"
  TAG="registry.fly.io/${FLY_APP}:${GRADER_VERSION}"
  fly auth docker >/dev/null || die "fly auth docker failed"
  PUSH_ARGS=(--push)
fi

echo "== building target=$TARGET platform=$PLATFORM tag=$TAG version=$GRADER_VERSION"
docker buildx build \
  --platform "$PLATFORM" \
  --target "$TARGET" \
  --file "$RUNNER_DIR/grader/Dockerfile" \
  --build-context "challenge=$STAGE_DIR" \
  --build-arg "CHALLENGE=$CHALLENGE" \
  --build-arg "GRADER_VERSION=$GRADER_VERSION" \
  --tag "$TAG" \
  "${PUSH_ARGS[@]}" \
  "$RUNNER_DIR"

echo "== done: $TAG (version $GRADER_VERSION)"
if [ "$PUSH_FLY" = 1 ]; then
  echo "image ref: $TAG"
else
  docker image inspect "$TAG" --format 'size: {{.Size}} bytes' 2>/dev/null \
    | awk '{printf "image size: %.0f MB (%s bytes)\n", $2/1000000, $2}' || true
fi
