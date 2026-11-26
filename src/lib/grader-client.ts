/**
 * Browser client for the cppatlas grader (https://run.cppatlas.com), and the
 * renderer that turns a finished run into the same log lines `./cppatlas
 * submit` prints. Framework-free and dependency-free so it can be driven from
 * a plain node script (`node --experimental-strip-types`): no imports, no
 * enums, no parameter properties.
 *
 * API contract: runner/README.md ("Public API") and
 * runner/internal/protocol/protocol.go.
 */

// ------------------------------------------------------------------ types

export type Compiler = "gcc" | "clang";
export type Preset = "debug" | "asan-ubsan";

export interface RunRequest {
  challenge: string;
  stage: number;
  only?: boolean;
  files: Record<string, string>;
  options: { compiler: Compiler; preset: Preset };
}

export interface Accepted {
  id: string;
  status: string;
  url?: string;
  queue_position?: number;
}

export interface RunError {
  code: string;
  message: string;
}

export interface TestCase {
  name: string;
  status: string;
  messages?: string[];
}

export interface CompileSummary {
  first_error?: string;
  preflight?: string[];
  output?: string;
  truncated?: boolean;
  error_count?: number;
}

export interface StageResult {
  stage: number;
  status: string; // passed | failed | compile_error | timeout | crashed | skipped
  phase?: string;
  compile?: CompileSummary;
  tests?: TestCase[];
  counts?: { total: number; passed: number; failed: number };
  output?: string;
  output_truncated?: boolean;
  signal?: string;
  exit_code?: number;
  running_test?: string;
  hint?: string;
  build_ms?: number;
  run_ms?: number;
}

export interface Result {
  run_id?: string;
  status: string; // completed | error
  passed: boolean;
  challenge?: string;
  compiler?: string;
  preset?: string;
  stages: StageResult[];
  timings?: { total_ms: number; setup_ms: number; build_ms: number; test_ms: number };
  error?: RunError;
}

export interface RunView {
  id: string;
  status: string; // queued | running | completed | error | timeout
  challenge?: string;
  stages?: number[];
  queue_position?: number;
  result?: Result;
  error?: RunError;
}

export const TERMINAL_STATUSES: readonly string[] = ["completed", "error", "timeout"];

export function isTerminal(v: RunView): boolean {
  return TERMINAL_STATUSES.includes(v.status);
}

// ----------------------------------------------------------------- config

export const DEFAULT_API_BASE = "https://run.cppatlas.com";
export const ALLOWED_ORIGINS: readonly string[] = ["https://cppatlas.com", "https://www.cppatlas.com"];
/** Browser-side cap; the server allows 512 KB per request body. */
export const MAX_CODE_BYTES = 256 * 1024;

export const CORS_MESSAGE = "Grading from the browser works on cppatlas.com; use ./cppatlas submit locally";

/** NEXT_PUBLIC_CPPATLAS_API (inlined at build time) or the production grader. */
export function apiBase(): string {
  const v = process.env.NEXT_PUBLIC_CPPATLAS_API;
  return (v && v.trim() ? v.trim() : DEFAULT_API_BASE).replace(/\/+$/, "");
}

/**
 * A failed fetch from a page the grader does not allow (CORS) looks exactly
 * like a network failure. Only blame CORS when we talk to the real grader from
 * an origin it does not allow; an overridden base is assumed to be set up.
 */
export function isCorsBlockedOrigin(origin: string, base: string): boolean {
  return base === DEFAULT_API_BASE && !ALLOWED_ORIGINS.includes(origin);
}

export function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

// ----------------------------------------------------------------- errors

export type GraderErrorKind =
  | "http" // the grader answered with an error document (status, code, ...)
  | "network" // fetch rejected or timed out (CORS looks like this too)
  | "bad_response" // not JSON / not the expected shape
  | "not_found" // the run id is unknown or expired
  | "deadline" // the client gave up waiting
  | "aborted"; // the caller aborted (stop button, unmount)

export class GraderError extends Error {
  kind: GraderErrorKind;
  status: number;
  code: string;
  field: string;
  /** Seconds, for 429/503 responses. */
  retryAfterSec: number;
  /** Set when the run was accepted, so the caller can keep watching it. */
  runId: string;

  constructor(
    kind: GraderErrorKind,
    message: string,
    extra: { status?: number; code?: string; field?: string; retryAfterSec?: number; runId?: string } = {}
  ) {
    super(message);
    this.name = "GraderError";
    this.kind = kind;
    this.status = extra.status ?? 0;
    this.code = extra.code ?? "";
    this.field = extra.field ?? "";
    this.retryAfterSec = extra.retryAfterSec ?? 0;
    this.runId = extra.runId ?? "";
  }
}

/** Retry-After as seconds (delta or HTTP date), clamped to 1..600; `fallback` when absent. */
export function parseRetryAfter(header: string | null, fallback = 10, now = Date.now()): number {
  if (header) {
    const t = header.trim();
    if (/^\d+$/.test(t)) return Math.min(600, Math.max(1, Number(t)));
    const at = Date.parse(t);
    if (!Number.isNaN(at)) return Math.min(600, Math.max(1, Math.ceil((at - now) / 1000)));
  }
  return fallback;
}

export function describeLimit(code: string): string {
  switch (code) {
    case "queue_full":
      return "The grader's queue is full right now.";
    case "too_many_runs":
      return "You already have runs in progress on the grader.";
    case "rate_limited":
      return "You are submitting too often.";
    default:
      return "The grader is limiting requests.";
  }
}

// -------------------------------------------------------------- transport

export interface ClientOptions {
  base?: string;
  signal?: AbortSignal;
  fetch?: typeof fetch;
  /** Per-request timeout on top of the long-poll wait. */
  requestTimeoutMs?: number;
}

function isAbort(err: unknown, signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted) || (err instanceof Error && err.name === "AbortError");
}

/** setTimeout that rejects with an "aborted" GraderError when `signal` aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new GraderError("aborted", "aborted"));
      return;
    }
    const onAbort = () => {
      clearTimeout(t);
      reject(new GraderError("aborted", "aborted"));
    };
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, Math.max(0, ms));
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

interface RawResponse {
  status: number;
  headers: Headers;
  body: unknown; // parsed JSON, or undefined when the body was not JSON
  text: string;
}

async function request(url: string, init: RequestInit, opts: ClientOptions): Promise<RawResponse> {
  const doFetch = opts.fetch ?? fetch;
  const outer = opts.signal;
  if (outer?.aborted) throw new GraderError("aborted", "aborted");
  // Own controller: aborts on the caller's signal or on the request timeout.
  const ctl = new AbortController();
  let timedOut = false;
  const onAbort = () => ctl.abort();
  outer?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    ctl.abort();
  }, opts.requestTimeoutMs ?? 45_000);
  try {
    let res: Response;
    try {
      res = await doFetch(url, { ...init, signal: ctl.signal, cache: "no-store" });
    } catch (err) {
      if (outer?.aborted) throw new GraderError("aborted", "aborted");
      if (timedOut) throw new GraderError("network", "the grader did not answer in time");
      if (isAbort(err)) throw new GraderError("aborted", "aborted");
      throw new GraderError("network", "could not reach the grader");
    }
    let text: string;
    try {
      text = await res.text();
    } catch {
      if (outer?.aborted) throw new GraderError("aborted", "aborted");
      throw new GraderError("network", "the connection to the grader dropped");
    }
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = undefined;
    }
    return { status: res.status, headers: res.headers, body, text };
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", onAbort);
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Turns a non-2xx response into a GraderError (error document or not). */
function httpError(res: RawResponse, runId = ""): GraderError {
  const e = isObject(res.body) && isObject(res.body.error) ? res.body.error : null;
  const code = e && typeof e.code === "string" ? e.code : "";
  const field = e && typeof e.field === "string" ? e.field : "";
  const message = e && typeof e.message === "string" ? e.message : "";
  if (res.status === 404 && runId) {
    return new GraderError("not_found", message || "run not found", { status: 404, code: code || "not_found", runId });
  }
  if (!e) {
    return new GraderError("bad_response", `the grader answered HTTP ${res.status} with something this page cannot read`, {
      status: res.status,
      runId,
    });
  }
  const retryAfterSec =
    res.status === 429 || res.status === 503
      ? parseRetryAfter(res.headers.get("Retry-After"), res.status === 429 ? 10 : 30)
      : 0;
  return new GraderError("http", message || `HTTP ${res.status}`, { status: res.status, code, field, retryAfterSec, runId });
}

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

function asRunError(v: unknown): RunError | undefined {
  if (!isObject(v)) return undefined;
  return { code: str(v.code) || "error", message: str(v.message) ?? "" };
}

function asStage(v: unknown): StageResult | null {
  if (!isObject(v) || num(v.stage) === undefined || typeof v.status !== "string") return null;
  const c = isObject(v.compile) ? v.compile : null;
  const k = isObject(v.counts) ? v.counts : null;
  const tests = Array.isArray(v.tests)
    ? v.tests.flatMap((t): TestCase[] =>
        isObject(t) && typeof t.name === "string" && typeof t.status === "string"
          ? [
              {
                name: t.name,
                status: t.status,
                messages: Array.isArray(t.messages) ? t.messages.filter((m): m is string => typeof m === "string") : [],
              },
            ]
          : []
      )
    : undefined;
  return {
    stage: v.stage as number,
    status: v.status,
    phase: str(v.phase),
    compile: c
      ? {
          first_error: str(c.first_error),
          preflight: Array.isArray(c.preflight) ? c.preflight.filter((p): p is string => typeof p === "string") : undefined,
          output: str(c.output),
          truncated: c.truncated === true,
          error_count: num(c.error_count),
        }
      : undefined,
    tests,
    counts:
      k && num(k.total) !== undefined && num(k.passed) !== undefined
        ? { total: k.total as number, passed: k.passed as number, failed: num(k.failed) ?? 0 }
        : undefined,
    output: str(v.output),
    output_truncated: v.output_truncated === true,
    signal: str(v.signal),
    exit_code: num(v.exit_code),
    running_test: str(v.running_test),
    hint: str(v.hint),
    build_ms: num(v.build_ms),
    run_ms: num(v.run_ms),
  };
}

function asResult(v: unknown): Result | undefined {
  if (!isObject(v) || typeof v.status !== "string") return undefined;
  const t = isObject(v.timings) ? v.timings : null;
  return {
    run_id: str(v.run_id),
    status: v.status,
    passed: v.passed === true,
    challenge: str(v.challenge),
    compiler: str(v.compiler),
    preset: str(v.preset),
    // Go encodes an empty slice as null; anything that is not a stage is dropped.
    stages: Array.isArray(v.stages) ? v.stages.flatMap((s) => asStage(s) ?? []) : [],
    timings: t
      ? { total_ms: num(t.total_ms) ?? 0, setup_ms: num(t.setup_ms) ?? 0, build_ms: num(t.build_ms) ?? 0, test_ms: num(t.test_ms) ?? 0 }
      : undefined,
    error: asRunError(v.error),
  };
}

/**
 * Validates a snapshot and copies it into a well-typed value, so rendering
 * never trips over a missing or mistyped field. Null when unusable.
 */
function asRunView(body: unknown): RunView | null {
  if (!isObject(body) || typeof body.id !== "string" || typeof body.status !== "string") return null;
  const v: RunView = {
    id: body.id,
    status: body.status,
    challenge: str(body.challenge),
    queue_position: num(body.queue_position),
    result: asResult(body.result),
    error: asRunError(body.error),
  };
  // A completed run must carry a result; error/timeout runs explain themselves via `error`.
  if (v.status === "completed" && !v.result) return null;
  return v;
}

/** POST /runs. Resolves with the 202 body; throws GraderError otherwise. */
export async function submitRun(req: RunRequest, opts: ClientOptions = {}): Promise<Accepted> {
  const base = opts.base ?? apiBase();
  const res = await request(
    `${base}/runs`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) },
    { requestTimeoutMs: 30_000, ...opts }
  );
  if (res.status < 200 || res.status >= 300) throw httpError(res);
  const b = isObject(res.body) ? res.body : {};
  // The id is in the body; the (exposed) Location header "/runs/<id>" is the fallback.
  const fromLocation = /\/runs\/([A-Za-z0-9_-]+)\/?$/.exec(res.headers.get("Location") ?? "")?.[1] ?? "";
  const id = typeof b.id === "string" && b.id ? b.id : fromLocation;
  if (!id) {
    throw new GraderError("bad_response", `the grader accepted the run but sent something this page cannot read`, {
      status: res.status,
    });
  }
  return {
    id,
    status: typeof b.status === "string" && b.status ? b.status : "queued",
    url: typeof b.url === "string" ? b.url : undefined,
    queue_position: typeof b.queue_position === "number" ? b.queue_position : undefined,
  };
}

/** GET /runs/{id}?wait=N, once. */
export async function getRun(id: string, waitSec: number, opts: ClientOptions = {}): Promise<RunView> {
  const base = opts.base ?? apiBase();
  const res = await request(
    `${base}/runs/${encodeURIComponent(id)}?wait=${waitSec}`,
    { method: "GET" },
    { requestTimeoutMs: (waitSec + 15) * 1000, ...opts }
  );
  if (res.status < 200 || res.status >= 300) throw httpError(res, id);
  const v = asRunView(res.body);
  if (!v) {
    throw new GraderError("bad_response", `the grader sent a run snapshot this page cannot read (HTTP ${res.status})`, {
      status: res.status,
      runId: id,
    });
  }
  return v;
}

export interface WatchOptions extends ClientOptions {
  /** Long-poll wait per request (server max 25). Short so queued -> running shows up promptly. */
  waitSec?: number;
  /** Minimum time between polls whose status did not change (guards degraded long-polls). */
  minPollIntervalMs?: number;
  /** Give up after this long (from the start of watching). */
  deadlineMs?: number;
  /** Delays for consecutive transient failures; one retry per entry. */
  backoffMs?: number[];
  /** The status already shown (e.g. from the 202), so it is not reported again. */
  initial?: { status: string; queue_position?: number };
  onUpdate?: (v: RunView) => void;
  onRetry?: (info: { attempt: number; delayMs: number; reason: string }) => void;
  now?: () => number;
}

function transient(err: GraderError): boolean {
  if (err.kind === "network") return true;
  if (err.kind === "bad_response") return err.status >= 500 || err.status === 0;
  if (err.kind === "http") return err.status === 429 || err.status >= 500;
  return false;
}

/**
 * Polls a run until it is terminal. Calls onUpdate on every status or queue
 * position change. Retries transient failures with backoff; throws
 * GraderError (with runId) for 404, deadline, abort and exhausted retries.
 */
export async function watchRun(id: string, opts: WatchOptions = {}): Promise<RunView> {
  const now = opts.now ?? Date.now;
  const waitSec = opts.waitSec ?? 4;
  const minInterval = opts.minPollIntervalMs ?? 1000;
  const deadline = now() + (opts.deadlineMs ?? 5 * 60_000);
  const backoff = opts.backoffMs ?? [1000, 2000, 4000, 8000];
  let last = opts.initial ? `${opts.initial.status}:${opts.initial.queue_position ?? ""}` : "";
  let failures = 0;

  for (;;) {
    if (now() >= deadline) {
      throw new GraderError("deadline", "gave up waiting for the grader", { runId: id });
    }
    const started = now();
    let view: RunView;
    try {
      view = await getRun(id, waitSec, opts);
    } catch (e) {
      const err = e instanceof GraderError ? e : new GraderError("network", String(e));
      err.runId = id;
      if (!transient(err)) throw err;
      if (failures >= backoff.length) throw err;
      const delayMs =
        err.status === 429 || err.status === 503 ? Math.max(backoff[failures], err.retryAfterSec * 1000) : backoff[failures];
      failures++;
      opts.onRetry?.({ attempt: failures, delayMs, reason: err.message });
      await sleep(Math.min(delayMs, Math.max(0, deadline - now())), opts.signal);
      continue;
    }
    failures = 0;
    const key = `${view.status}:${view.queue_position ?? ""}`;
    const changed = key !== last;
    last = key;
    if (changed || isTerminal(view)) opts.onUpdate?.(view);
    if (isTerminal(view)) return view;
    // A degraded long-poll (or a misbehaving proxy) answers at once: never loop tighter than minInterval.
    const elapsed = now() - started;
    if (!changed && elapsed < minInterval) await sleep(minInterval - elapsed, opts.signal);
    else if (opts.signal?.aborted) throw new GraderError("aborted", "aborted", { runId: id });
  }
}

// -------------------------------------------------------------- log lines

export type Tone = "plain" | "pass" | "fail" | "dim";

export interface LogLine {
  /** 0 = `[cppatlas]`, N = `[tester::#N]`. */
  stage: number;
  text: string;
  tone: Tone;
  /** Collapsible block shown under this line ("show full compiler output"). */
  details?: { summary: string; body: string };
}

export function prefix(line: LogLine): string {
  return line.stage === 0 ? "[cppatlas]" : `[tester::#${line.stage}]`;
}

/** Plain-text form of a line, exactly as the CLI prints it (without colour). */
export function formatLine(line: LogLine): string {
  return `${prefix(line)} ${line.text}`;
}

function msgLines(stage: number, text: string, indent: string, tone: Tone, out: LogLine[], maxLines = Infinity) {
  const lines = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");
  const shown = lines.slice(0, maxLines);
  for (const l of shown) out.push({ stage, text: indent + l, tone });
  if (lines.length > shown.length) {
    out.push({ stage, text: `${indent}... ${lines.length - shown.length} more lines`, tone: "dim" });
  }
}

export function stagesLabel(n: number): string {
  return n === 1 ? "stage 1" : `stages 1..${n}`;
}

export function submittingLine(file: string, stage: number, compiler: Compiler, preset: Preset): LogLine {
  return { stage: 0, text: `submitting ${file} for ${stagesLabel(stage)} (${compiler}, ${preset})`, tone: "dim" };
}

/** The `[cppatlas]` line for a non-terminal status, or null. */
export function statusLine(v: RunView): LogLine | null {
  if (v.status === "queued") {
    return { stage: 0, text: v.queue_position ? `queued (position ${v.queue_position})` : "queued", tone: "dim" };
  }
  if (v.status === "running") return { stage: 0, text: "running ...", tone: "dim" };
  return null;
}

function seconds(ms: number | undefined): string {
  return `${((ms ?? 0) / 1000).toFixed(1)}s`;
}

export interface RenderContext {
  /** Stage number -> title. */
  titles: Record<number, string>;
  /** The page's own stage: always shown in full. */
  focusStage: number;
}

function renderStage(s: StageResult, r: Result, ctx: RenderContext, out: LogLine[]) {
  const n = s.stage;
  const title = ctx.titles[n] ?? `Stage ${n}`;
  if (s.status === "skipped") {
    out.push({ stage: n, text: `skipped (Stage #${n}: ${title})`, tone: "dim" });
    return;
  }
  out.push({ stage: n, text: `Running tests for Stage #${n}: ${title}`, tone: "plain" });
  const counts = s.counts;
  const compact = s.status === "passed" && n !== ctx.focusStage;

  if (compact) {
    if (counts) out.push({ stage: n, text: `${counts.passed} of ${counts.total} test cases passed`, tone: "dim" });
    out.push({ stage: n, text: "Test passed.", tone: "pass" });
    return;
  }

  if (s.status === "compile_error") {
    out.push({ stage: n, text: "✗ does not compile", tone: "fail" });
    const c = s.compile ?? {};
    if (c.first_error) msgLines(n, c.first_error, "    ", "fail", out, 20);
    if (c.output) {
      out.push({
        stage: n,
        text: c.error_count ? `${c.error_count} error${c.error_count === 1 ? "" : "s"} in total` : "compiler output",
        tone: "dim",
        details: {
          summary: c.truncated ? "show full compiler output (truncated by the grader)" : "show full compiler output",
          body: c.output,
        },
      });
    }
    if (c.preflight && c.preflight.length > 0) {
      out.push({ stage: n, text: "Your vector is missing something this stage needs:", tone: "plain" });
      for (const p of c.preflight) msgLines(n, `- ${p}`, "    ", "fail", out);
    }
    // e.g. the compiler ran out of memory or flooded its output.
    if (s.hint) msgLines(n, s.hint, "    ", "plain", out);
    out.push({ stage: n, text: "Test failed.", tone: "fail" });
    return;
  }

  // Like the CLI: no "compiled" line when the build itself timed out; the
  // per-stage build time falls back to the run's total build time.
  if (!(s.status === "timeout" && s.phase === "build")) {
    const preset = r.preset ?? "";
    const build = s.build_ms || r.timings?.build_ms || 0;
    out.push({
      stage: n,
      text: `compiled${r.compiler ? ` with ${r.compiler}` : ""}${preset ? ` (${preset})` : ""}${build ? ` in ${seconds(build)}` : ""}`,
      tone: "dim",
    });
  }

  for (const t of s.tests ?? []) {
    const ok = t.status === "passed";
    out.push({ stage: n, text: `${ok ? "✓" : "✗"} ${t.name}`, tone: ok ? "pass" : "fail" });
    if (!ok) for (const m of t.messages ?? []) msgLines(n, m, "    ", "plain", out, 40);
  }

  const stopped = s.status === "timeout" || s.status === "crashed";
  // A failed stage with no failing test case (the program exited early, no
  // test ran, output flood, ...): the hint and the captured output say why.
  const unexplained = s.status === "failed" && !(s.tests ?? []).some((t) => t.status !== "passed");
  if (unexplained && s.hint) msgLines(n, s.hint, "    ", "plain", out);
  if (unexplained && s.running_test) out.push({ stage: n, text: `    while running: ${s.running_test}`, tone: "plain" });

  if (stopped) {
    const what =
      s.status === "timeout"
        ? `✗ timed out${s.phase ? ` during the ${s.phase === "build" ? "build" : "tests"}` : ""}`
        : `✗ crashed${s.signal ? ` (${s.signal})` : s.exit_code !== undefined ? ` (exit code ${s.exit_code})` : ""}`;
    out.push({ stage: n, text: what, tone: "fail" });
    if (s.running_test) out.push({ stage: n, text: `    while running: ${s.running_test}`, tone: "plain" });
    if (s.hint) msgLines(n, s.hint, "    ", "plain", out);
  }

  if (counts) {
    out.push({
      stage: n,
      text: `${counts.passed} of ${counts.total} test cases passed${s.run_ms !== undefined ? ` (${s.run_ms} ms)` : ""}`,
      tone: "dim",
    });
  }

  if (s.output && (stopped || unexplained)) {
    out.push({
      stage: n,
      text: "captured output:",
      tone: "dim",
      details: {
        summary: s.output_truncated ? "show captured test output (truncated by the grader)" : "show captured test output",
        body: s.output,
      },
    });
    msgLines(n, s.output, "    ", "dim", out, 30);
  }

  if (s.status === "passed") out.push({ stage: n, text: "Test passed.", tone: "pass" });
  else out.push({ stage: n, text: "Test failed.", tone: "fail" });
}

export type Outcome =
  | { kind: "passed" }
  | { kind: "failed"; stage: number } // the learner's code did not pass `stage`
  | { kind: "grader_error"; code: string; message: string }; // not the learner's fault

/** `focusStage`: the stage the run was submitted for; a pass must include it. */
export function outcomeOf(v: RunView, focusStage?: number): Outcome {
  if (v.status === "timeout") {
    return { kind: "grader_error", code: v.error?.code ?? "timeout", message: v.error?.message ?? "the run took too long and was stopped" };
  }
  if (v.status === "error") {
    return { kind: "grader_error", code: v.error?.code ?? "error", message: v.error?.message ?? "the grader failed" };
  }
  const r = v.result;
  if (!r || r.status === "error") {
    return {
      kind: "grader_error",
      code: r?.error?.code ?? v.error?.code ?? "no_result",
      message: r?.error?.message ?? v.error?.message ?? "the grader finished without a result",
    };
  }
  if (r.passed && (focusStage === undefined || r.stages.some((s) => s.stage === focusStage && s.status === "passed"))) {
    return { kind: "passed" };
  }
  const bad = r.stages.find((s) => s.status !== "passed" && s.status !== "skipped");
  if (!bad) {
    // Not passed, yet no stage failed (no stages at all, or the asked-for stage is missing).
    return { kind: "grader_error", code: "no_result", message: "the grader finished without a result for this stage" };
  }
  return { kind: "failed", stage: bad.stage };
}

/**
 * All the lines for a terminal run: the tester lines per stage, then the
 * `[cppatlas]` verdict and timing lines. `clientMs` is the wall time the
 * page measured from submit to result.
 */
export function renderRun(v: RunView, ctx: RenderContext, clientMs: number): LogLine[] {
  const out: LogLine[] = [];
  const o = outcomeOf(v, ctx.focusStage);
  if (o.kind === "grader_error") {
    out.push({ stage: 0, text: "the grader had a problem; this is not your code", tone: "fail" });
    out.push({ stage: 0, text: `${o.code}: ${o.message}`, tone: "dim" });
    out.push({ stage: 0, text: `gave up after ${seconds(clientMs)}`, tone: "dim" });
    return out;
  }
  const r = v.result as Result;
  for (const s of [...r.stages].sort((a, b) => a.stage - b.stage)) renderStage(s, r, ctx, out);
  const t = r.timings;
  out.push({
    stage: 0,
    text:
      `finished in ${seconds(clientMs)}` +
      (t ? ` (grader: total ${t.total_ms} ms, build ${t.build_ms} ms, test ${t.test_ms} ms)` : ""),
    tone: "dim",
  });
  return out;
}
