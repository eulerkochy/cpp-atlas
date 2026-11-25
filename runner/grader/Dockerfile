# syntax=docker/dockerfile:1
#
# cppatlas grader image: the sandboxed environment that compiles and runs a
# submission against a challenge's tests.
#
# Base: Ubuntu 26.04 LTS ("resolute", glibc 2.43). GCC 16.2 is not in Ubuntu's
# archive, so it is copied from the official gcc:16.2 image (Debian trixie,
# glibc 2.41, built with prefix /usr/local); Ubuntu 26.04's glibc is newer, so
# those binaries run unmodified. apt.llvm.org publishes llvm-toolchain-resolute-21.
# (Fallback if that ever stops holding: debian:trixie-slim + llvm-toolchain-trixie-21.)
#
# Build (always through scripts/build-grader.sh; build context is runner/):
#   docker buildx build -f runner/grader/Dockerfile \
#     --build-context challenge=<filtered challenge dir> runner/
#
# Stages: toolchain (compilers only), gobuild (static grader binary), grader (final).
#
# USER: intentionally NOT set (root). The docker backend passes
# `--user 10001:10001 --read-only --tmpfs /work --tmpfs /tmp` explicitly; on
# Fly the entrypoint starts as root (supervisor) and drops privileges itself.

# Base images are pinned by the digest of their multi-arch index (the tag is
# kept for readability; with both present, the digest wins). The same digest
# resolves to the linux/amd64 (Fly) and linux/arm64 (local) images. To
# refresh, read the current index digest (read-only registry query):
#   docker buildx imagetools inspect ubuntu:26.04 | sed -n 's/^Digest: *//p'
# and likewise for gcc:16.2 and golang:1.27, then rebuild and re-run the
# samples (runner/grader/testdata/run-samples.sh) before pushing.
ARG UBUNTU_IMAGE=ubuntu:26.04@sha256:d66b366dac61b575bee2aef07e9c26e8070096fbe84a3d4d3eb0da069b5d76db
ARG GCC_IMAGE=gcc:16.2@sha256:b560ecf8f694944afa8137ba7462a73f75bb799880535fcd7e0dfc890ba8b27a
ARG GO_IMAGE=golang:1.27@sha256:5f1b98fa02fe396ebce2a0227a0e08309e11792915b9dd2e1f71053d7e7e6666

# ---------------------------------------------------------------- gcc-pruned
# Only what compiling/linking C++ (+ sanitizer runtimes) needs. Dropped: Go,
# Fortran, gccgo, libgo/libgfortran/libcaf, lto1/lto-dump, hwasan/itm/ssp/cc1
# libs, gcc plugin headers, python pretty printers, docs/man/locale/info, *.la.
FROM ${GCC_IMAGE} AS gcc-pruned
RUN set -eux; \
    cd /usr/local; \
    T="$(gcc -dumpmachine)"; V="$(gcc -dumpversion)"; \
    # libexec: keep cc1, cc1plus, collect2, lto-wrapper (+plugin), mapper server
    cd libexec/gcc/$T/$V; \
    rm -rf f951 go1 cgo vet buildid test2json install-tools lto1 plugin; \
    cd /usr/local; \
    rm -rf share man src games sbin etc lib/python* \
           bin/go bin/gofmt bin/gccgo bin/gfortran bin/lto-dump bin/gcov* \
           bin/"$T"-gccgo bin/"$T"-gfortran; \
    rm -rf lib/gcc/$T/$V/plugin lib/gcc/$T/$V/finclude lib/gcc/$T/$V/install-tools \
           lib/gcc/$T/$V/libcaf_* lib/gcc/$T/$V/libgcov.a; \
    cd lib64; \
    rm -rf go libgo* libgfortran* libhwasan* libitm* libssp* libcc1* \
           *.la *-gdb.py libgomp.spec libitm.spec libgfortran.spec; \
    # cc / cpp aliases
    cd /usr/local/bin; ln -sf gcc cc; \
    # make sure the cc1plus we kept still runs
    /usr/local/bin/g++ --version | head -1

# ---------------------------------------------------------------- toolchain
FROM ${UBUNTU_IMAGE} AS toolchain

ARG DEBIAN_FRONTEND=noninteractive
ARG LLVM_VERSION=21

# Ubuntu 26.04 ships clang-21 (21.1.x) in its own, already-signed archive, so
# apt.llvm.org (and its extra key/curl/gnupg trust step) is not needed here.
# binutils (as/ld/ar) and libc6-dev are needed by both compilers.
# libstdc++-15-dev / libgcc-15-dev are pulled in by clang-21 but unused (the
# clang config below points at GCC 16.2), so they are removed from dpkg.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates binutils libc6-dev cmake ninja-build ccache \
      util-linux coreutils make \
      clang-${LLVM_VERSION} libclang-rt-${LLVM_VERSION}-dev \
 && dpkg --remove --force-depends $(dpkg-query -W -f='${Package} ' 'libstdc++-*-dev' 'libgcc-*-dev') \
 && rm -rf /var/lib/apt/lists/* /var/cache/apt/* /var/log/apt /var/log/dpkg.log /var/log/alternatives.log \
           /usr/share/doc /usr/share/man /usr/share/info /usr/share/locale /usr/share/lintian \
           /usr/share/bug /usr/share/common-licenses \
           /usr/lib/llvm-${LLVM_VERSION}/share /usr/lib/llvm-${LLVM_VERSION}/build \
           /usr/share/cmake-*/Help /usr/share/cmake-*/Tests

# GCC 16.2 (prefix /usr/local). /usr/local/lib64 must precede the distro's
# libstdc++ in the loader search path: g++ does not emit an rpath, and
# programs using C++23 symbols need GCC 16.2's libstdc++.so.6 at run time.
COPY --from=gcc-pruned /usr/local /usr/local
RUN printf '/usr/local/lib64\n/usr/local/lib\n' > /etc/ld.so.conf.d/00-gcc16.conf \
 && ldconfig \
 && ldconfig -p | grep -m1 'libstdc++.so.6 .*/usr/local/lib64'

# clang++-21 uses GCC 16.2's libstdc++/libgcc (clang reads <name>.cfg from the
# directory of the real binary), so both compilers see the same C++23 library.
RUN GCC_DIR="$(dirname "$(g++ -print-libgcc-file-name)")" \
 && for n in clang clang++; do \
      echo "--gcc-install-dir=${GCC_DIR}" > "/usr/lib/llvm-${LLVM_VERSION}/bin/$n.cfg"; \
    done \
 && ln -sf clang++-${LLVM_VERSION} /usr/bin/clang++ \
 && ln -sf clang-${LLVM_VERSION} /usr/bin/clang \
 && clang++ --version | head -1

# No setuid/setgid binaries: nothing in the image may raise privileges (su,
# mount, passwd, unix_chkpwd, ... come with the base). The run-time sandbox
# also sets no_new_privs, so this is a second, independent layer.
RUN find / -xdev -perm /6000 -type f -exec chmod a-s {} + \
 && test -z "$(find / -xdev -perm /6000 -type f -print)" \
 || { echo "setuid/setgid files remain:" >&2; find / -xdev -perm /6000 -type f >&2; exit 1; }

# ---------------------------------------------------------------- gobuild
FROM --platform=$BUILDPLATFORM ${GO_IMAGE} AS gobuild
ARG TARGETOS
ARG TARGETARCH
ARG GRADER_VERSION=dev
WORKDIR /src
COPY go.mod ./
COPY . .
RUN --mount=type=cache,target=/root/.cache/go-build \
    --mount=type=cache,target=/go/pkg/mod \
    CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    go build -trimpath -ldflags "-s -w -X main.version=${GRADER_VERSION}" \
      -o /out/cppatlas-grader ./cmd/grader

# ---------------------------------------------------------------- grader
FROM toolchain AS grader
ARG CHALLENGE=vector
ARG GRADER_VERSION=dev
ENV LANG=C.UTF-8

LABEL com.cppatlas.grader.version="${GRADER_VERSION}" \
      com.cppatlas.challenge="${CHALLENGE}" \
      org.opencontainers.image.title="cppatlas-grader"

# Unprivileged identity used inside the sandbox.
RUN groupadd --gid 10001 sandbox \
 && useradd --uid 10001 --gid 10001 --home-dir /nonexistent --no-create-home \
      --shell /usr/sbin/nologin sandbox \
 && install -d -m 0755 /work /opt/cppatlas/challenges/${CHALLENGE}

COPY --from=gobuild --chmod=0755 /out/cppatlas-grader /usr/local/bin/cppatlas-grader
COPY --chmod=0755 grader/entrypoint /usr/local/bin/entrypoint

# Challenge tree: root-owned, read-only for everyone else. The private
# solution never belongs here; build-grader.sh filters it out, and this
# check makes the build fail if it ever sneaks in.
COPY --from=challenge --chown=0:0 --chmod=u=rwX,go=rX / /opt/cppatlas/challenges/${CHALLENGE}/src/
RUN set -eu; cd /opt/cppatlas/challenges/${CHALLENGE}/src; \
    test ! -e solution; \
    test -z "$(find . \( -name solution -o -name fuzz.cpp -o -name '*.jsonl' -o -name .git -o -name .devcontainer -o -name .github -o -name build -o -name ci.sh \) -print)" \
      || { echo "forbidden file in challenge tree:" >&2; find . \( -name solution -o -name fuzz.cpp -o -name '*.jsonl' -o -name .git -o -name .devcontainer -o -name .github -o -name build -o -name ci.sh \) >&2; exit 1; }

# Prebuild doctest main/support objects and warm ccache (as root; the grader
# binary chooses the layout under .../prebuilt/). Permissions are fixed in the
# same layer so files are not duplicated.
RUN umask 022 \
 && /usr/local/bin/cppatlas-grader prebuild --challenge ${CHALLENGE} \
 && chown -R 0:0 /opt/cppatlas \
 && chmod -R u+rwX,go+rX,go-w /opt/cppatlas

# Re-assert on the final image (nothing above may have added one).
RUN test -z "$(find / -xdev -perm /6000 -type f -print)" \
 || { echo "setuid/setgid files in the grader image:" >&2; find / -xdev -perm /6000 -type f >&2; exit 1; }

WORKDIR /work
ENTRYPOINT ["/usr/local/bin/entrypoint"]
