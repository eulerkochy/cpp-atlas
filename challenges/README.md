# Authoring challenges

Notes for maintainers adding a challenge. This directory is not exported to
learners: `challenges/<name>/scripts/export-template.sh` copies only the
learner-facing tree.

## What a challenge directory looks like

Read `challenges/vector` as the reference. Each challenge has:

- `cppatlas`: a bash script (3.2 compatible) with the learner commands.
  `submit` grades remotely on the grader (the default), `test` builds and runs
  the suite locally (optional), `doctor` checks local tools against the grader's
  versions (local testing only, warns, never hard-fails), plus `stages`,
  `clean` and `help`.
- `.cppatlas.json`: the learner's progress, e.g. `{"challenge":"vector","stage":1}`.
  `submit` and `test` advance it when stages 1..N pass. The GitHub App ignores
  repositories that do not have it.
- Marker blocks: text between `maintainer:begin` and `maintainer:end` marker
  lines (any comment syntax) is removed from exported files. Use them for
  maintainer-only notes in README.md, workflow files and similar.
- `scripts/export-template.sh <outdir>`: writes the learner template tree
  (no reference solution, `ci.sh`, `scripts/` or maintainer blocks; progress
  reset to stage 1). It fails if the words "solution", "ci.sh" or "maintainer"
  remain in exported files, other than a few allowed phrases. Read its sanity
  check before editing README.md or the workflow.
- `ci.sh`: runs every stage against the reference solution and against the
  standard library, under both compilers and the sanitizer presets. Run it
  before changing any test.
- `.github/workflows/test.yml`: a manual (`workflow_dispatch`) fallback for
  learners who do not install the GitHub App. It must not trigger on push, or a
  push would produce two checks.
- `.devcontainer/`, `CMakePresets.json`, `cmake/`, `tests/`, `include/`: the
  local environment and harness.
- Site content lives in `content/build/<name>/` (`challenge.json`,
  `overview.md`, `stages/`) and is registered in `content/build/catalog.json`.
  `pnpm check:content` validates it. Add the challenge to `CHALLENGE_FILES` in
  `src/proxy.ts` so its paths get real 404s.

## Dependencies

The vector challenge has no third-party library dependencies. The only thing it
bundles is doctest, vendored unmodified as `tests/support/doctest.h` (license in
`tests/support/doctest.LICENSE.txt`, provenance in `tests/support/THIRD_PARTY.md`).
It is not fetched at configure time and `CMakeLists.txt` does not call
`find_package` or `FetchContent`. vcpkg is not used by the vector challenge.

If a future challenge needs libraries, use vcpkg in manifest mode:

- Put a `vcpkg.json` in the challenge directory with a pinned
  `builtin-baseline`, so every build resolves the same versions.
- Point CMake at the vcpkg toolchain file from `CMakePresets.json`
  (`CMAKE_TOOLCHAIN_FILE`), so `cmake --preset ...` installs the manifest.
- Bake the same manifest into the dev container image and into the grader
  image, so local, Actions and grader builds use identical versions.
- Use binary caching to keep builds fast.
- The grader sandbox has no network access at run time. Every dependency must
  already be installed in the grader image; the build must not try to download
  anything.

Do not add vcpkg files until a challenge actually needs them.
