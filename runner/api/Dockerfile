# syntax=docker/dockerfile:1
#
# Public/internal API image for cppatlas.com's challenge runner.
# Build context is the runner/ directory:
#   docker build -f api/Dockerfile runner/
# Production runs with BACKEND=fly, so no Docker socket is needed in the image.

FROM golang:1.27 AS build
WORKDIR /src
ENV CGO_ENABLED=0 GOFLAGS=-mod=readonly
COPY go.mod ./
# The module is stdlib-only today; this keeps working if go.sum appears later.
RUN go mod download
COPY . .
RUN go build -trimpath -ldflags "-s -w" -o /out/cppatlas-api ./cmd/api

# distroless/static ships CA roots (api.github.com, api.machines.dev), tzdata
# and a nonroot user (uid 65532), and nothing else.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/cppatlas-api /cppatlas-api
USER nonroot:nonroot
# 8080 public (behind Fly's proxy), 8081 private 6PN-only (never in fly.toml services).
EXPOSE 8080 8081
ENTRYPOINT ["/cppatlas-api"]
