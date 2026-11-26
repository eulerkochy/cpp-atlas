"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import Link from "next/link";
import { ArrowRight, Check, CircleAlert, Info, Play, RotateCcw, Square, X } from "lucide-react";
import { Window } from "@/components/Window";
import {
  apiBase,
  byteLength,
  CORS_MESSAGE,
  describeLimit,
  GraderError,
  isCorsBlockedOrigin,
  MAX_CODE_BYTES,
  outcomeOf,
  prefix,
  renderRun,
  sleep,
  statusLine,
  submitRun,
  submittingLine,
  watchRun,
  type Compiler,
  type LogLine,
  type Preset,
  type RunRequest,
} from "@/lib/grader-client";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------ code store
//
// One localStorage key per challenge (the learner edits one file across all
// stages). A tiny external store so every mounted panel (Next keeps up to
// three visited pages alive, hidden) shows the same code, and so the first
// client render matches the server (null snapshot = "nothing stored yet").

const CODE_PREFIX = "cpp-atlas-build-code-v1:";
const codeMem = new Map<string, string | null>();
const codeListeners = new Set<() => void>();
const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();
let storageListening = false;

function emitCode() {
  for (const l of codeListeners) l();
}

function readStoredCode(key: string): string | null {
  if (!codeMem.has(key)) {
    let v: string | null = null;
    try {
      v = window.localStorage.getItem(key);
    } catch {
      v = null;
    }
    codeMem.set(key, v);
  }
  return codeMem.get(key) ?? null;
}

function flushCode(key: string) {
  const t = pendingWrites.get(key);
  if (t) clearTimeout(t);
  pendingWrites.delete(key);
  const v = codeMem.get(key);
  try {
    if (v === null || v === undefined) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, v);
  } catch {
    // storage full or blocked: the code stays in memory for this visit
  }
}

function flushAll() {
  for (const key of [...pendingWrites.keys()]) flushCode(key);
}

function writeStoredCode(key: string, value: string | null) {
  codeMem.set(key, value);
  emitCode();
  const t = pendingWrites.get(key);
  if (t) clearTimeout(t);
  pendingWrites.set(
    key,
    setTimeout(() => flushCode(key), 400)
  );
}

function subscribeCode(cb: () => void) {
  codeListeners.add(cb);
  if (!storageListening) {
    storageListening = true;
    window.addEventListener("storage", (e) => {
      if (e.key && e.key.startsWith(CODE_PREFIX) && !pendingWrites.has(e.key)) {
        codeMem.set(e.key, e.newValue);
        emitCode();
      }
    });
    window.addEventListener("pagehide", flushAll);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushAll();
    });
  }
  return () => {
    codeListeners.delete(cb);
  };
}

// ------------------------------------------------------- stage progress
// Written in exactly the format src/components/build/StageDone.tsx reads:
// a JSON array of "<challenge>/<stage-slug>" ids under this key, followed by
// this window event so mounted StageDone buttons re-read it.
const DONE_KEY = "cpp-atlas-build-v1";
const DONE_EVENT = "cpp-atlas-build-change";

function markStagesDone(ids: string[]) {
  try {
    let current: string[] = [];
    try {
      const v: unknown = JSON.parse(window.localStorage.getItem(DONE_KEY) ?? "[]");
      if (Array.isArray(v)) current = v.filter((x): x is string => typeof x === "string");
    } catch {
      current = [];
    }
    const next = new Set(current);
    for (const id of ids) next.add(id);
    window.localStorage.setItem(DONE_KEY, JSON.stringify([...next]));
    window.dispatchEvent(new Event(DONE_EVENT));
  } catch {
    // storage unavailable: progress simply is not remembered
  }
}

// ----------------------------------------------------------------- state

type Phase = "idle" | "submitting" | "cooldown" | "queued" | "running" | "done" | "error" | "stopped";

interface Notice {
  title: string;
  detail?: string;
  /** What the retry button does: resubmit, or resume polling the same run. */
  action: "submit" | "watch" | null;
  /** Epoch ms before which the retry button stays disabled (Retry-After). */
  retryAt?: number;
}

interface RunState {
  phase: Phase;
  lines: LogLine[];
  startedAt: number;
  cooldownUntil: number;
  runId: string;
  stageRun: number;
  passed: boolean;
  notice: Notice | null;
}

const IDLE: RunState = {
  phase: "idle",
  lines: [],
  startedAt: 0,
  cooldownUntil: 0,
  runId: "",
  stageRun: 0,
  passed: false,
  notice: null,
};

/** Longer Retry-After waits are left to the learner (the button counts down). */
const AUTO_RETRY_MAX_SEC = 60;

const IN_FLIGHT: readonly Phase[] = ["submitting", "cooldown", "queued", "running"];

export interface GraderPanelStage {
  number: number;
  slug: string;
  title: string;
}

interface Props {
  challenge: string;
  challengeTitle: string;
  stage: number;
  stages: GraderPanelStage[];
  starter: { path: string; content: string } | null;
}

// Log colours come from the site tokens (the same verdict colours the quiz and
// debugger use), so the log follows the theme. Every tone also carries a word
// or a mark in the text itself ("Test passed.", "✗ ..."), never colour alone.
const toneClass: Record<LogLine["tone"], string> = {
  plain: "text-[color:var(--code-ink)]",
  pass: "text-[color:var(--right)]",
  fail: "text-wrong",
  dim: "text-ink-faint",
};

type Tint = "neutral" | "active" | "pass" | "fail" | "warn";

const pillTint: Record<Tint, string> = {
  neutral: "border-line-strong bg-paper-sunk text-ink-soft",
  active: "border-sun-deep/45 bg-sun-wash text-ink",
  pass: "border-[color:var(--right)]/30 bg-right-wash text-[color:var(--right)]",
  fail: "border-wrong/35 bg-wrong-wash text-wrong",
  warn: "border-sun-deep/45 bg-sun-wash text-ink",
};

const noticeTint: Record<Exclude<Tint, "active" | "pass">, string> = {
  neutral: "border-line bg-paper-sunk/65",
  warn: "border-sun-deep/45 bg-sun-wash/70",
  fail: "border-wrong/35 bg-wrong-wash",
};

/** Pill buttons: h-10 keeps every tap target at 40px. */
const secondaryButton =
  "inline-flex h-10 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border border-line-strong bg-paper-raised px-4 text-sm font-medium text-ink-soft transition-colors hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:border-line-strong disabled:hover:text-ink-soft";

function noticeFor(err: GraderError, base: string): Notice {
  const wait = err.retryAfterSec > 0 ? Date.now() + err.retryAfterSec * 1000 : undefined;
  switch (err.kind) {
    case "network":
      if (!err.runId) {
        if (isCorsBlockedOrigin(window.location.origin, base)) return { title: CORS_MESSAGE, action: null };
        return { title: "Could not reach the grader.", detail: "Check your connection and try again.", action: "submit" };
      }
      return {
        title: "Lost contact with the grader while waiting for the result.",
        detail: "The run may still finish. Try again to keep watching it.",
        action: "watch",
      };
    case "not_found":
      return { title: "The run expired on the grader before its result arrived.", detail: "Run it again.", action: "submit" };
    case "deadline":
      return {
        title: "Still no result after 5 minutes.",
        detail: "The grader may be very busy. You can keep watching or run it again later.",
        action: "watch",
      };
    case "bad_response":
      return {
        title: "The grader sent a response this page could not read.",
        detail: err.message,
        // Polling again only helps if the bad answer came from a proxy or a
        // failing server; an unreadable 2xx snapshot will read the same again.
        action: err.runId && (err.status === 0 || err.status >= 500) ? "watch" : "submit",
      };
    case "http": {
      // Failing while polling (the run was accepted): resume that run rather
      // than submitting a second one.
      const retry = err.runId ? "watch" : "submit";
      if (err.status === 429) {
        return { title: describeLimit(err.code), detail: err.message, action: retry, retryAt: wait };
      }
      if (err.status === 503) {
        return {
          title: "The grader is restarting or temporarily unavailable.",
          detail: err.message,
          action: retry,
          retryAt: wait,
        };
      }
      if (err.status === 400 || err.status === 413 || err.status === 415) {
        return {
          title: "The grader rejected this submission.",
          detail: `${err.field ? `${err.field}: ` : ""}${err.message}`,
          action: null,
        };
      }
      return {
        title: "The grader had a problem; this is not your code.",
        detail: `HTTP ${err.status}${err.code ? ` ${err.code}` : ""}: ${err.message}`,
        action: retry,
      };
    }
    default:
      return { title: err.message, action: "submit" };
  }
}

/**
 * Server messages arrive lower-case ("you already have ..."); show them as a
 * sentence, but leave codes and field names ("backend_unavailable: ...") alone.
 */
function sentence(text: string): string {
  return /^[a-z]+(\s|$)/.test(text) ? text[0].toUpperCase() + text.slice(1) : text;
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------- component

export function GraderPanel({ challenge, challengeTitle, stage, stages, starter }: Props) {
  const codeKey = CODE_PREFIX + challenge;
  const filePath = starter?.path ?? "include/my/vector.hpp";
  const stored = useSyncExternalStore(
    subscribeCode,
    () => readStoredCode(codeKey),
    () => null
  );
  const code = stored ?? starter?.content ?? "";

  const [compiler, setCompiler] = useState<Compiler>("gcc");
  const [sanitizers, setSanitizers] = useState(false);
  const [run, setRun] = useState<RunState>(IDLE);
  const [now, setNow] = useState(0);
  const [inputError, setInputError] = useState("");

  const epoch = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const escapeArmed = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const inFlight = IN_FLIGHT.includes(run.phase);
  const retryAt = run.notice?.retryAt ?? 0;
  const ticking = inFlight || retryAt > now;

  // Elapsed / countdown ticker (only while something is counting).
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [ticking]);

  // Stop watching when the page is hidden (Next keeps it alive in <Activity>)
  // or unmounted. The flow itself records "stopped watching".
  useEffect(() => {
    const ctl = controller;
    return () => ctl.current?.abort();
  }, []);

  // Follow the log while it grows, unless the reader scrolled up.
  useEffect(() => {
    const el = logRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [run.lines.length]);

  const titles: Record<number, string> = {};
  for (const s of stages) titles[s.number] = s.title;
  const lastStage = stages.length;

  function setCode(value: string) {
    writeStoredCode(codeKey, value);
    if (inputError) setInputError("");
  }

  function resetToStarter() {
    if (!starter) return;
    if (stored !== null && stored !== starter.content) {
      if (!window.confirm("Replace your code in this box with the starter file? This cannot be undone.")) return;
    }
    writeStoredCode(codeKey, null);
    setInputError("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      escapeArmed.current = true;
      return;
    }
    if (e.key === "Tab" && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && !escapeArmed.current) {
      e.preventDefault();
      const ta = e.currentTarget;
      ta.setRangeText("    ", ta.selectionStart, ta.selectionEnd, "end");
      setCode(ta.value);
      return;
    }
    escapeArmed.current = false;
  }

  function stop() {
    controller.current?.abort();
  }

  async function start(mode: "submit" | "watch") {
    if (controller.current && !controller.current.signal.aborted) return; // a run is in flight
    if (mode === "watch" && !run.runId) return;

    const files: Record<string, string> = { [filePath]: code };
    if (mode === "submit") {
      if (!code.trim()) {
        setInputError(`Paste your ${filePath} into the box first.`);
        return;
      }
      if (byteLength(code) > MAX_CODE_BYTES) {
        setInputError(`That file is over ${MAX_CODE_BYTES / 1024} KB. The grader accepts one header up to that size.`);
        return;
      }
    }
    setInputError("");

    const my = ++epoch.current;
    const ctl = new AbortController();
    controller.current = ctl;
    const { signal } = ctl;
    const base = apiBase();
    const update = (fn: (s: RunState) => RunState) => {
      if (epoch.current === my) setRun(fn);
    };
    const append = (...lines: LogLine[]) => update((s) => ({ ...s, lines: [...s.lines, ...lines] }));
    const t0 = mode === "submit" ? Date.now() : run.startedAt || Date.now();
    const stageRun = mode === "submit" ? stage : run.stageRun;
    const preset: Preset = sanitizers ? "asan-ubsan" : "debug";
    stickToBottom.current = true;
    setNow(Date.now());

    const fail = (err: GraderError) => {
      if (err.kind === "aborted") {
        append({ stage: 0, text: "stopped watching (the run may still finish on the grader)", tone: "dim" });
        update((s) => ({
          ...s,
          phase: "stopped",
          notice: s.runId
            ? { title: "Stopped watching.", detail: "The grader cannot cancel a run; it may still finish.", action: "watch" }
            : null,
        }));
        return;
      }
      const notice = noticeFor(err, base);
      if (epoch.current === my) setNow(Date.now());
      append({ stage: 0, text: `error: ${notice.title}`, tone: "fail" });
      update((s) => ({ ...s, phase: "error", notice }));
    };

    let runId = mode === "watch" ? run.runId : "";
    try {
      let initial: { status: string; queue_position?: number } | undefined;
      if (mode === "submit") {
        update(() => ({
          ...IDLE,
          phase: "submitting",
          startedAt: t0,
          stageRun,
          lines: [submittingLine(filePath, stageRun, compiler, preset)],
        }));
        const req: RunRequest = { challenge, stage: stageRun, files, options: { compiler, preset } };
        let autoRetried = false;
        for (;;) {
          try {
            const acc = await submitRun(req, { base, signal });
            runId = acc.id;
            initial = { status: acc.status || "queued", queue_position: acc.queue_position };
            const queued = statusLine({ id: acc.id, status: acc.status || "queued", queue_position: acc.queue_position });
            if (queued) append(queued);
            update((s) => ({ ...s, runId: acc.id, phase: acc.status === "running" ? "running" : "queued" }));
            break;
          } catch (e) {
            const err = e instanceof GraderError ? e : new GraderError("bad_response", String(e));
            if (err.kind === "http" && err.status === 429 && !autoRetried && err.retryAfterSec <= AUTO_RETRY_MAX_SEC) {
              // Honour Retry-After once, visibly, then try again; a second 429 is shown to the learner.
              autoRetried = true;
              const until = Date.now() + err.retryAfterSec * 1000;
              append({
                stage: 0,
                text: `${describeLimit(err.code)} Retrying in ${err.retryAfterSec}s.`,
                tone: "dim",
              });
              update((s) => ({ ...s, phase: "cooldown", cooldownUntil: until }));
              if (epoch.current === my) setNow(Date.now());
              await sleep(err.retryAfterSec * 1000, signal);
              append({ stage: 0, text: "retrying ...", tone: "dim" });
              update((s) => ({ ...s, phase: "submitting", cooldownUntil: 0 }));
              continue;
            }
            throw err;
          }
        }
      } else {
        append({ stage: 0, text: "watching the run again ...", tone: "dim" });
        update((s) => ({ ...s, phase: "queued", notice: null }));
      }

      const view = await watchRun(runId, {
        base,
        signal,
        initial,
        onUpdate: (v) => {
          const line = statusLine(v);
          if (line) append(line);
          if (v.status === "queued" || v.status === "running") update((s) => ({ ...s, phase: v.status as Phase }));
        },
        onRetry: ({ attempt, delayMs }) =>
          append({
            stage: 0,
            text: `lost contact with the grader; retrying in ${Math.round(delayMs / 1000)}s (attempt ${attempt})`,
            tone: "dim",
          }),
      });

      const lines = renderRun(view, { titles, focusStage: stageRun }, Date.now() - t0);
      const outcome = outcomeOf(view, stageRun);
      // Record the pass first: navigating away during the reveal must not lose it.
      if (outcome.kind === "passed") {
        markStagesDone(stages.filter((s) => s.number <= stageRun).map((s) => `${challenge}/${s.slug}`));
      }
      // Reveal the tester lines with a short stagger (instant for reduced
      // motion). The result is already here, so Stop or hiding the page just
      // shows the rest at once instead of leaving a half-printed log.
      let shown = 0;
      if (!prefersReducedMotion()) {
        const step = Math.max(8, Math.min(30, 1200 / Math.max(1, lines.length)));
        try {
          for (; shown < lines.length; shown++) {
            append(lines[shown]);
            await sleep(step, signal);
          }
        } catch {
          shown++; // lines[shown] was appended before the sleep was aborted
        }
      }
      if (shown < lines.length) append(...lines.slice(shown));
      if (outcome.kind === "passed") {
        update((s) => ({ ...s, phase: "done", passed: true, notice: null }));
      } else if (outcome.kind === "failed") {
        update((s) => ({ ...s, phase: "done", passed: false, notice: null }));
      } else {
        update((s) => ({
          ...s,
          phase: "error",
          notice: {
            title: "The grader had a problem; this is not your code.",
            detail: `${outcome.code}: ${outcome.message}`,
            action: "submit",
          },
        }));
      }
    } catch (e) {
      // Anything that is not a GraderError is a bug on this page, not the network.
      fail(e instanceof GraderError ? e : new GraderError("bad_response", String(e), { runId }));
    } finally {
      if (controller.current === ctl) controller.current = null;
    }
  }

  const elapsed = run.startedAt ? Math.max(0, Math.floor((now - run.startedAt) / 1000)) : 0;
  const cooldownLeft = Math.max(0, Math.ceil((run.cooldownUntil - now) / 1000));
  const retryLeft = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const runBlocked = inFlight || retryLeft > 0;
  const passedRun = run.phase === "done" && run.passed;
  const failedRun = run.phase === "done" && !run.passed;
  const passedStage = run.stageRun;
  const passedNext = stages.find((s) => s.number === passedStage + 1) ?? null;

  const notice = run.notice;
  const isCors = notice?.title === CORS_MESSAGE;
  const noticeKind: keyof typeof noticeTint =
    !notice || run.phase === "stopped" || isCors
      ? "neutral"
      : // Only a rejected submission is about the learner's input; everything
        // else is the grader or the network, so it gets the softer warning tint.
        notice.action === null
        ? "fail"
        : "warn";
  const NoticeIcon = noticeKind === "neutral" ? Info : CircleAlert;

  // The log header's status: a word (and a count while something is pending),
  // tinted, with an icon for the settled states. Colour is never the only cue.
  const status: { label: string; count?: string; tint: Tint } =
    run.phase === "submitting"
      ? { label: "Submitting", count: `${elapsed}s`, tint: "active" }
      : run.phase === "cooldown"
        ? { label: "Waiting", count: `${cooldownLeft}s`, tint: "warn" }
        : run.phase === "queued"
          ? { label: "Queued", count: `${elapsed}s`, tint: "active" }
          : run.phase === "running"
            ? { label: "Running", count: `${elapsed}s`, tint: "active" }
            : passedRun
              ? { label: "Passed", tint: "pass" }
              : failedRun
                ? { label: "Failed", tint: "fail" }
                : run.phase === "error"
                  ? isCors
                    ? { label: "Not available here", tint: "neutral" }
                    : notice?.retryAt
                      ? { label: "Busy", tint: "warn" }
                      : { label: "Error", tint: noticeKind === "fail" ? "fail" : "warn" }
                  : run.phase === "stopped"
                    ? { label: "Stopped", tint: "neutral" }
                    : { label: "Ready", tint: "neutral" };
  const StatusIcon =
    status.tint === "pass"
      ? Check
      : status.tint === "fail"
        ? X
        : run.phase === "stopped"
          ? Square
          : run.phase === "error"
            ? isCors
              ? Info
              : CircleAlert
            : null;

  const codeId = `grader-code-${challenge}`;
  const helpId = `grader-code-help-${challenge}`;
  const errorId = `grader-code-error-${challenge}`;
  const edited = starter !== null && stored !== null && stored !== starter.content;

  return (
    <section aria-labelledby="grader-panel-title" className="space-y-4">
      <div className="space-y-1">
        <h3 id="grader-panel-title" className="text-base font-medium text-ink">
          Or run it here, in the browser
        </h3>
        <p className="text-sm text-ink-soft">
          Paste your <code className="font-mono text-[0.85em]">{filePath}</code> below. It stays in this browser, and
          each run starts a fresh machine, so expect 5 to 25 seconds.
        </p>
      </div>

      <Window
        size="code"
        title={filePath}
        actions={
          edited ? (
            <button
              type="button"
              onClick={resetToStarter}
              className="-my-1 inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius-chip)] px-1.5 text-xs text-ink-soft underline decoration-line-strong underline-offset-3 hover:text-ink hover:decoration-ink"
            >
              <RotateCcw className="size-3" aria-hidden />
              Reset to the starter
            </button>
          ) : starter ? (
            <span className="text-xs text-ink-faint">{stored === null ? "Starter file" : "Your code"}</span>
          ) : null
        }
        className="has-[textarea[aria-invalid]]:border-wrong has-[textarea:focus-visible]:border-ink has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-offset-2 has-[textarea:focus-visible]:outline-ink"
      >
        <label htmlFor={codeId} className="sr-only">
          Contents of {filePath}
        </label>
        <textarea
          id={codeId}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          wrap="off"
          rows={16}
          aria-describedby={inputError ? `${errorId} ${helpId}` : helpId}
          aria-invalid={inputError ? true : undefined}
          className="block h-[min(22rem,60svh)] min-h-40 w-full resize-y bg-transparent px-4 py-3 font-mono text-[0.8rem] leading-relaxed text-[color:var(--code-ink)] outline-none focus-visible:outline-none"
        />
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line bg-paper-sunk/50 px-4 py-3">
          <label className="inline-flex items-center gap-2 text-sm text-ink-soft">
            <span>Compiler</span>
            <select
              value={compiler}
              onChange={(e) => setCompiler(e.target.value === "clang" ? "clang" : "gcc")}
              disabled={inFlight}
              className="h-10 cursor-pointer rounded-[var(--radius-chip)] border border-line-strong bg-paper-raised px-2 text-sm text-ink disabled:cursor-not-allowed disabled:opacity-55"
            >
              <option value="gcc">GCC 16.2</option>
              <option value="clang">Clang 21</option>
            </select>
          </label>
          <label
            className={cn(
              "inline-flex min-h-10 items-center gap-2 text-sm text-ink-soft",
              inFlight ? "cursor-not-allowed opacity-55" : "cursor-pointer"
            )}
          >
            <input
              type="checkbox"
              checked={sanitizers}
              onChange={(e) => setSanitizers(e.target.checked)}
              disabled={inFlight}
              className="size-4 cursor-[inherit] accent-[var(--ink)]"
            />
            <span>
              Sanitizers <span className="text-ink-faint">(ASan + UBSan)</span>
            </span>
          </label>
          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
            {inFlight ? (
              <button type="button" onClick={stop} className={cn(secondaryButton, "flex-1 sm:flex-none")}>
                <Square className="size-3" aria-hidden />
                Stop watching
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void start("submit")}
              disabled={runBlocked}
              className={cn(
                "inline-flex h-10 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full border px-5 text-sm font-medium sm:flex-none",
                // While blocked the button steps back to a quiet pill (a faded
                // yellow reads as olive at night), so only live actions are yellow.
                runBlocked
                  ? "cursor-not-allowed border-line-strong bg-paper-sunk text-ink-soft"
                  : "cursor-pointer border-ink bg-sun text-ink"
              )}
            >
              <Play className="size-3.5" aria-hidden />
              <span className="tabular-nums">
                {inFlight ? "Running ..." : retryLeft > 0 ? `Run again in ${retryLeft}s` : "Run on the grader"}
              </span>
            </button>
          </div>
        </div>
      </Window>

      <div className="space-y-1.5">
        {inputError ? (
          <p id={errorId} role="alert" className="flex items-start gap-2 text-sm text-wrong">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{inputError}</span>
          </p>
        ) : null}
        <p id={helpId} className="text-xs text-ink-faint">
          Tab inserts four spaces. Press Esc, then Tab, to leave the editor.
        </p>
      </div>

      {run.phase !== "idle" ? (
        <Window
          size="code"
          title="grader log"
          actions={
            <span
              className={cn(
                "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium",
                pillTint[status.tint]
              )}
            >
              {inFlight ? (
                <span
                  aria-hidden
                  className="size-1.5 rounded-full bg-sun-deep motion-safe:animate-pulse"
                />
              ) : StatusIcon ? (
                <StatusIcon className="size-3" aria-hidden />
              ) : null}
              <span>{status.label}</span>
              {status.count ? <span className="tabular-nums text-ink-soft">{status.count}</span> : null}
            </span>
          }
        >
          <div
            ref={logRef}
            role="log"
            aria-live="polite"
            aria-label="Grader log"
            tabIndex={0}
            onScroll={(e) => {
              const el = e.currentTarget;
              stickToBottom.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
            }}
            className="max-h-[min(28rem,65svh)] min-h-28 overflow-y-auto bg-paper-sunk/40 px-4 py-3 font-mono text-[0.78rem] leading-[1.65] focus-visible:outline-offset-[-2px]"
          >
            {run.lines.map((line, i) => {
              const tag = prefix(line);
              // Hanging indent: wrapped text lines up after the prefix, and the
              // line still copies as one "[prefix] text" line, as the CLI prints it.
              const hang = `${tag.length + 1}ch`;
              return (
                // Keyed per run, so a new run does not inherit an opened <details>.
                <div key={`${run.startedAt}:${i}`}>
                  <div
                    style={{ paddingLeft: hang, textIndent: `-${hang}` }}
                    className={cn("whitespace-pre-wrap [overflow-wrap:anywhere]", toneClass[line.tone])}
                  >
                    <span className={line.stage === 0 ? "text-ink-faint" : "text-[color:var(--code-blue)]"}>{tag}</span>{" "}
                    {line.text}
                  </div>
                  {line.details ? (
                    <details style={{ marginLeft: hang }} className="my-1.5">
                      <summary className="inline-flex min-h-7 cursor-pointer items-center text-[color:var(--code-blue)] underline decoration-[color:var(--code-blue)]/40 underline-offset-3 hover:decoration-[color:var(--code-blue)]">
                        {line.details.summary}
                      </summary>
                      <pre className="mt-1.5 max-h-80 overflow-auto rounded-[var(--radius-chip)] border border-line bg-paper-raised p-3 text-[color:var(--code-ink)] focus-visible:outline-offset-[-2px]">
                        {line.details.body}
                      </pre>
                    </details>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Window>
      ) : null}

      {notice ? (
        <div
          role="status"
          className={cn("flex gap-3 rounded-[var(--radius-panel)] border px-4 py-3 text-sm", noticeTint[noticeKind])}
        >
          <NoticeIcon
            className={cn("mt-0.5 size-4 shrink-0", noticeKind === "fail" ? "text-wrong" : "text-ink-soft")}
            aria-hidden
          />
          <div className="min-w-0 space-y-2">
            {isCors ? (
              <>
                <p className="font-medium text-ink">Grading from the browser works on cppatlas.com.</p>
                <p className="text-ink-soft">
                  On this copy of the site, run <code className="font-mono text-[0.9em] text-ink">./cppatlas submit</code>{" "}
                  from your challenge repo instead.
                </p>
              </>
            ) : (
              <>
                <p className="font-medium text-ink">{notice.title}</p>
                {notice.detail ? <p className="break-words text-ink-soft">{sentence(notice.detail)}</p> : null}
              </>
            )}
            {notice.action ? (
              <button
                type="button"
                onClick={() => void start(notice.action === "watch" ? "watch" : "submit")}
                disabled={retryLeft > 0}
                className={cn(secondaryButton, "text-ink")}
              >
                <span className="tabular-nums">
                  {retryLeft > 0
                    ? `Try again in ${retryLeft}s`
                    : notice.action === "watch"
                      ? "Keep watching"
                      : "Try again"}
                </span>
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {failedRun ? (
        <p className="flex items-start gap-2 text-sm text-ink-soft">
          <X className="mt-0.5 size-4 shrink-0 text-wrong" aria-hidden />
          <span>Not passing yet. Fix the first failure in the log, then run again.</span>
        </p>
      ) : null}

      {passedRun ? (
        <div className="flex gap-3 rounded-[var(--radius-panel)] border border-[color:var(--right)]/35 bg-right-wash px-4 py-4">
          <span className="mt-1 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--right)] text-paper">
            <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
          </span>
          <div className="min-w-0 space-y-2">
            {passedStage >= lastStage ? (
              <>
                <p className="font-display text-xl font-[450] tracking-[-0.01em] text-ink">
                  All {lastStage} stages pass. You completed {challengeTitle}.
                </p>
                <Link
                  href={`/build/${challenge}`}
                  className="group inline-flex items-center gap-1.5 text-sm font-medium text-ink"
                >
                  <span className="underline decoration-sun decoration-2 underline-offset-4 group-hover:decoration-ink">
                    Back to {challengeTitle}
                  </span>
                  <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </>
            ) : passedNext ? (
              <>
                <p className="font-display text-xl font-[450] tracking-[-0.01em] text-ink">
                  Stage {passedStage} passes.
                </p>
                <Link
                  href={`/build/${challenge}/${passedNext.slug}`}
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-ink bg-sun px-4 text-sm font-medium text-ink"
                >
                  Continue to stage {passedNext.number}: {passedNext.title}
                  <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </>
            ) : null}
            <p className="text-sm text-ink-soft">
              {passedStage === 1 ? "Stage 1 is" : `Stages 1 to ${passedStage} are`} marked done on this site. Your
              repo&apos;s <code className="font-mono text-[0.9em]">.cppatlas.json</code> only advances when you run{" "}
              <code className="font-mono text-[0.9em]">./cppatlas submit</code> there.
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
