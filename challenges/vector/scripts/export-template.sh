#!/usr/bin/env bash
# export-template.sh - produce the standalone learner repository tree for the
# GitHub template eulerkochy/cpp-vector-challenge.
#
#   challenges/vector/scripts/export-template.sh <outdir>
#
# <outdir> must not exist or must be empty. The result contains include/,
# tests/ (with support/), cmake/, CMakeLists.txt, CMakePresets.json, cppatlas,
# .cppatlas.json (stage 1), .devcontainer/, .gitignore, README.md and
# .github/workflows/test.yml. solution/, ci.sh, scripts/ and build directories
# are not copied, and every block between `maintainer:begin` and
# `maintainer:end` marker lines (any comment syntax) is removed from the
# copied files. Nothing is committed or pushed.
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)"

[ $# -eq 1 ] || { echo "usage: $0 <outdir>" >&2; exit 2; }
OUT="$1"
if [ -e "$OUT" ] && { [ ! -d "$OUT" ] || [ -n "$(ls -A "$OUT")" ]; }; then
    echo "export-template: refusing to use '$OUT': it exists and is not an empty directory" >&2
    exit 1
fi
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
if [ "$OUT" = "$SRC" ] || case "$OUT" in "$SRC"/*) true ;; *) false ;; esac; then
    echo "export-template: outdir must be outside $SRC" >&2
    exit 1
fi

copy_tree() { # copy_tree <relative dir>
    mkdir -p "$OUT/$(dirname "$1")"
    cp -R "$SRC/$1" "$OUT/$1"
}
copy_file() { # copy_file <relative file>
    mkdir -p "$OUT/$(dirname "$1")"
    cp -p "$SRC/$1" "$OUT/$1"
}

copy_tree include
copy_tree tests
copy_tree cmake
copy_tree .devcontainer
for f in CMakeLists.txt CMakePresets.json cppatlas .gitignore README.md .github/workflows/test.yml; do
    copy_file "$f"
done
# A fresh learner always starts at stage 1, whatever the maintainer's file says.
printf '{"challenge":"vector","stage":1}\n' >"$OUT/.cppatlas.json"

# Drop build products and editor droppings that may sit in the source tree.
find "$OUT" \( -name build -o -name .DS_Store -o -name '*.jsonl' \) -prune -exec rm -rf {} +
rm -f "$OUT/compile_commands.json" "$OUT/CMakeUserPresets.json"

# Remove maintainer-only blocks.
strip_maintainer() {
    local f="$1" tmp
    tmp="$(mktemp)"
    awk '
        /maintainer:begin/ { skip = 1; next }
        /maintainer:end/   { skip = 0; next }
        !skip { print }
    ' "$f" >"$tmp"
    cat "$tmp" >"$f"
    rm -f "$tmp"
}
for f in CMakeLists.txt cppatlas README.md tests/support/README.md .github/workflows/test.yml; do
    strip_maintainer "$OUT/$f"
done
chmod +x "$OUT/cppatlas"

# Sanity: nothing may still point at the private files.
LINK='https://github.com/eulerkochy/cpp-atlas/tree/main/challenges/vector/solution'
stale="$(grep -rnI -e solution -e 'ci\.sh' -e maintainer "$OUT" | grep -v -F "$LINK" || true)"
# The word "solution" in prose ("Your solution is yours") is fine.
stale="$(printf '%s\n' "$stale" | grep -v -e 'Your solution is yours' -e 'reference solution is public at' -e '^$' || true)"
if [ -n "$stale" ]; then
    echo "export-template: stale references remain:" >&2
    echo "$stale" >&2
    exit 1
fi
grep -qF "$LINK" "$OUT/README.md" || { echo "export-template: README is missing the public solution link" >&2; exit 1; }

echo "exported template to $OUT"
