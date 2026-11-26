"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Code2,
  Copy,
  Info,
  Play,
  RotateCcw,
  Square,
  Terminal,
  X,
} from "lucide-react";
import { CourseRailShell, type RailChallengeInfo } from "@/components/build/CourseRailShell";
import { DifficultyBadge } from "@/components/build/DifficultyBadge";
import { markStagesDone, StageDoneButton, useBuildDone } from "@/components/build/StageDone";
import type { BuildStageMeta } from "@/lib/build-challenges";
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
  type TestCase,
} from "@/lib/grader-client";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------ code store (vector)

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
    // storage blocked
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

// ------------------------------------------------------------------ grader state

type Phase = "idle" | "submitting" | "cooldown" | "queued" | "running" | "done" | "error" | "stopped";

interface Notice {
  title: string;
  detail?: string;
  action: "submit" | "watch" | null;
  retryAt?: number;
}

interface RunState {
  phase: Phase;
  lines: LogLine[];
  startedAt: number;
  cooldownUntil: number;
  runId: string;
  stageRun: number;
  only: boolean;
  passed: boolean;
  testOutcomes: Record<string, "passed" | "failed">;
  notice: Notice | null;
}

const IDLE: RunState = {
  phase: "idle",
  lines: [],
  startedAt: 0,
  cooldownUntil: 0,
  runId: "",
  stageRun: 0,
  only: false,
  passed: false,
  testOutcomes: {},
  notice: null,
};

const AUTO_RETRY_MAX_SEC = 60;
const IN_FLIGHT: readonly Phase[] = ["submitting", "cooldown", "queued", "running"];

const toneClass: Record<LogLine["tone"], string> = {
  plain: "text-[#dde5f4]",
  pass: "text-[#6fd6a4]",
  fail: "text-[#ff9a8a]",
  dim: "text-white/55",
};

function noticeFor(err: GraderError, base: string): Notice {
  const wait = err.retryAfterSec > 0 ? Date.now() + err.retryAfterSec * 1000 : undefined;
  switch (err.kind) {
    case "network":
      if (!err.runId) {
        if (isCorsBlockedOrigin(window.location.origin, base)) return { title: CORS_MESSAGE, action: null };
        return { title: "Could not reach the grader.", detail: "Check your connection and try again.", action: "submit" };
      }
      return {
        title: "Lost contact with the grader while waiting.",
        detail: "Try again to keep watching the run.",
        action: "watch",
      };
    case "not_found":
      return { title: "The run expired before its result arrived.", detail: "Run it again.", action: "submit" };
    case "deadline":
      return { title: "Still no result after 5 minutes.", detail: "Keep watching or try again later.", action: "watch" };
    case "bad_response":
      return {
        title: "Unreadable grader response.",
        detail: err.message,
        action: err.runId && (err.status === 0 || err.status >= 500) ? "watch" : "submit",
      };
    case "http": {
      const retry = err.runId ? "watch" : "submit";
      if (err.status === 429) return { title: describeLimit(err.code), detail: err.message, action: retry, retryAt: wait };
      if (err.status === 503) return { title: "Grader is temporarily unavailable.", detail: err.message, action: retry, retryAt: wait };
      if (err.status === 400 || err.status === 413 || err.status === 415) {
        return { title: "Submission rejected.", detail: `${err.field ? `${err.field}: ` : ""}${err.message}`, action: null };
      }
      return { title: "Grader error.", detail: `HTTP ${err.status}: ${err.message}`, action: retry };
    }
    default:
      return { title: err.message, action: "submit" };
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function mapStageOutcomes(tests: TestCase[] | undefined): Record<string, "passed" | "failed"> {
  const out: Record<string, "passed" | "failed"> = {};
  if (!tests) return out;
  for (const t of tests) {
    out[t.name] = t.status === "passed" ? "passed" : "failed";
  }
  return out;
}

const adjacentLink =
  "group rounded-xl border border-line bg-paper-raised p-4 transition-colors hover:border-line-strong";
const adjacentTitle =
  "mt-1 font-display text-base font-[500] text-ink decoration-sun decoration-2 underline-offset-4 group-hover:underline";

export function StageWorkspace({
  challenge,
  stage,
  prev,
  next,
  starter,
  children,
}: {
  challenge: RailChallengeInfo;
  stage: BuildStageMeta;
  prev: BuildStageMeta | null;
  next: BuildStageMeta | null;
  starter: { path: string; content: string } | null;
  children: ReactNode;
}) {
  const { done, hydrated } = useBuildDone();
  const stageDoneId = `${challenge.slug}/${stage.slug}`;
  const isCompleted = hydrated && done.has(stageDoneId);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [dockHint, setDockHint] = useState<string>("");

  // Browser grader state (only active when starter !== null, i.e., vector)
  const codeKey = CODE_PREFIX + challenge.slug;
  const stored = useSyncExternalStore(
    subscribeCode,
    () => (starter ? readStoredCode(codeKey) : null),
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

  const inFlight = IN_FLIGHT.includes(run.phase);
  const retryAt = run.notice?.retryAt ?? 0;
  const ticking = inFlight || retryAt > now;

  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [ticking]);

  useEffect(() => {
    const ctl = controller;
    return () => ctl.current?.abort();
  }, []);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [run.lines.length, consoleOpen]);

  function copyText(text: string, key: string, hint?: string) {
    try {
      void navigator.clipboard.writeText(text);
    } catch {
      // ignore clipboard restrictions
    }
    setCopiedKey(key);
    if (hint) setDockHint(hint);
    setTimeout(() => {
      setCopiedKey((cur) => (cur === key ? null : cur));
    }, 1800);
  }

  function setCode(value: string) {
    writeStoredCode(codeKey, value);
    if (inputError) setInputError("");
  }

  function resetToStarter() {
    if (!starter) return;
    if (stored !== null && stored !== starter.content) {
      if (!window.confirm("Replace your code in the browser editor with the starter file?")) return;
    }
    writeStoredCode(codeKey, null);
    setInputError("");
  }

  function onEditorKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
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

  const startGrader = useCallback(
    async (mode: "submit" | "watch", onlyStage: boolean) => {
      if (!starter) return;
      if (controller.current && !controller.current.signal.aborted) return;
      if (mode === "watch" && !run.runId) return;

      const filePath = starter.path;
      const files: Record<string, string> = { [filePath]: code };
      if (mode === "submit") {
        if (!code.trim()) {
          setInputError(`Paste your ${filePath} in the browser editor first.`);
          setEditorOpen(true);
          return;
        }
        if (byteLength(code) > MAX_CODE_BYTES) {
          setInputError(`File exceeds ${MAX_CODE_BYTES / 1024} KB limit.`);
          setEditorOpen(true);
          return;
        }
      }
      setInputError("");
      setConsoleOpen(true);

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
      const stageRun = mode === "submit" ? stage.number : run.stageRun;
      const only = mode === "submit" ? onlyStage : run.only;
      const preset: Preset = sanitizers ? "asan-ubsan" : "debug";
      setNow(Date.now());

      const titles: Record<number, string> = {};
      for (const s of challenge.stages) titles[s.number] = s.title;

      const fail = (err: GraderError) => {
        if (err.kind === "aborted") {
          append({ stage: 0, text: "stopped watching (run may still finish on grader)", tone: "dim" });
          update((s) => ({
            ...s,
            phase: "stopped",
            notice: s.runId ? { title: "Stopped watching.", detail: "Run may still finish.", action: "watch" } : null,
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
            only,
            lines: [submittingLine(filePath, stageRun, compiler, preset)],
          }));
          const req: RunRequest = {
            challenge: challenge.slug,
            stage: stageRun,
            only,
            files,
            options: { compiler, preset },
          };
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
                autoRetried = true;
                const until = Date.now() + err.retryAfterSec * 1000;
                append({ stage: 0, text: `${describeLimit(err.code)} Retrying in ${err.retryAfterSec}s.`, tone: "dim" });
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
              text: `lost contact with grader; retrying in ${Math.round(delayMs / 1000)}s (attempt ${attempt})`,
              tone: "dim",
            }),
        });

        const lines = renderRun(view, { titles, focusStage: stageRun }, Date.now() - t0);
        const outcome = outcomeOf(view, stageRun);
        const stageResult = view.result?.stages?.find((st) => st.stage === stageRun);
        const testOutcomes = mapStageOutcomes(stageResult?.tests);

        if (outcome.kind === "passed" && !only) {
          markStagesDone(
            challenge.stages
              .filter((s) => s.number <= stageRun)
              .map((s) => `${challenge.slug}/${s.slug}`)
          );
        }

        let shown = 0;
        if (!prefersReducedMotion()) {
          const step = Math.max(8, Math.min(25, 1000 / Math.max(1, lines.length)));
          try {
            for (; shown < lines.length; shown++) {
              append(lines[shown]);
              await sleep(step, signal);
            }
          } catch {
            shown++;
          }
        }
        if (shown < lines.length) append(...lines.slice(shown));

        if (outcome.kind === "passed") {
          update((s) => ({ ...s, phase: "done", passed: true, testOutcomes, notice: null }));
        } else if (outcome.kind === "failed") {
          update((s) => ({ ...s, phase: "done", passed: false, testOutcomes, notice: null }));
        } else {
          update((s) => ({
            ...s,
            phase: "error",
            testOutcomes,
            notice: { title: "Grader internal error.", detail: `${outcome.code}: ${outcome.message}`, action: "submit" },
          }));
        }
      } catch (e) {
        fail(e instanceof GraderError ? e : new GraderError("bad_response", String(e), { runId }));
      } finally {
        if (controller.current === ctl) controller.current = null;
      }
    },
    [challenge.slug, challenge.stages, code, compiler, run.only, run.runId, run.stageRun, run.startedAt, sanitizers, stage.number, starter]
  );

  // Cmd/Ctrl + Enter submits stage for browser-grader challenges
  useEffect(() => {
    if (!starter) return;
    function onWindowKey(e: globalThis.KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !inFlight) {
        e.preventDefault();
        void startGrader("submit", false);
      }
    }
    window.addEventListener("keydown", onWindowKey);
    return () => window.removeEventListener("keydown", onWindowKey);
  }, [inFlight, startGrader, starter]);

  const elapsed = run.startedAt ? Math.max(0, Math.floor((now - run.startedAt) / 1000)) : 0;
  const retryLeft = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const runBlocked = inFlight || retryLeft > 0;
  const edited = starter !== null && stored !== null && stored !== starter.content;

  const passedTestsCount = stage.tests.filter((t) => run.testOutcomes[t] === "passed").length;
  const hasRunResults = Object.keys(run.testOutcomes).length > 0;

  const submitCmd = "./cppatlas submit";
  const submitOnlyCmd = `./cppatlas submit --only ${stage.number}`;
  const testStageCmd = `./cppatlas test ${stage.number}`;

  // ---------------------------------------------------------------- right rail
  const rightRail = (
    <div className="space-y-6">
      {starter ? (
        <div className="space-y-2.5">
          {inFlight ? (
            <button
              type="button"
              onClick={() => controller.current?.abort()}
              className="flex h-11 w-full cursor-pointer items-center justify-between rounded-xl bg-ink px-4 text-sm font-medium text-paper transition-opacity hover:opacity-90"
            >
              <span className="inline-flex items-center gap-2">
                <Square className="size-3.5" aria-hidden />
                <span>Stop watching ({elapsed}s)</span>
              </span>
              <span className="font-mono text-xs opacity-70">Running</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={runBlocked}
              onClick={() => void startGrader("submit", false)}
              className="flex h-11 w-full cursor-pointer items-center justify-between rounded-xl bg-ink px-4 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-55"
            >
              <span>{retryLeft > 0 ? `Retry in ${retryLeft}s` : `Submit stage ${stage.number}`}</span>
              <kbd className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-[11px] text-paper/90">⌘ ↵</kbd>
            </button>
          )}

          <button
            type="button"
            disabled={runBlocked}
            onClick={() => void startGrader("submit", true)}
            className="flex h-10 w-full cursor-pointer items-center justify-center rounded-xl border border-line-strong bg-paper-raised px-4 text-sm font-medium text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-55"
          >
            Run stage {stage.number} only
          </button>

          <p className="text-xs leading-relaxed text-ink-soft">
            Submit grades stages 1 to {stage.number} and stops at the first failure.
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
            <select
              aria-label="Compiler"
              value={compiler}
              onChange={(e) => setCompiler(e.target.value === "clang" ? "clang" : "gcc")}
              disabled={inFlight}
              className="h-8 cursor-pointer rounded-lg border border-line-strong bg-paper-raised px-2 text-xs text-ink"
            >
              <option value="gcc">GCC 16.2</option>
              <option value="clang">Clang 21</option>
            </select>
            <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-paper-sunk/70 px-2.5 text-ink-soft">
              <input
                type="checkbox"
                checked={sanitizers}
                onChange={(e) => setSanitizers(e.target.checked)}
                disabled={inFlight}
                className="size-3.5 accent-[var(--ink)]"
              />
              <span>ASan + UBSan</span>
            </label>
          </div>

          {run.notice ? (
            <div
              role="status"
              className={cn(
                "flex gap-2 rounded-xl border p-3 text-xs",
                run.notice.action === null
                  ? "border-wrong/35 bg-wrong-wash text-wrong"
                  : "border-line-strong bg-paper-sunk text-ink-soft"
              )}
            >
              {run.notice.action === null ? (
                <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              ) : (
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              )}
              <div className="min-w-0 space-y-1">
                <p className="font-medium text-ink">
                  {run.notice.title === CORS_MESSAGE
                    ? "Browser grading runs on cppatlas.com. Use ./cppatlas submit locally."
                    : run.notice.title}
                </p>
                {run.notice.detail ? <p className="break-words">{run.notice.detail}</p> : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={() => copyText(submitCmd, "submit-cmd", `Copied "${submitCmd}" — run inside your cloned repo.`)}
            className="flex h-11 w-full cursor-pointer items-center justify-between rounded-xl bg-ink px-4 text-sm font-medium text-paper transition-opacity hover:opacity-90"
          >
            <span>{copiedKey === "submit-cmd" ? "Copied ./cppatlas submit" : `Submit stage ${stage.number}`}</span>
            {copiedKey === "submit-cmd" ? (
              <Check className="size-4" aria-hidden />
            ) : (
              <Copy className="size-3.5 opacity-80" aria-hidden />
            )}
          </button>

          <button
            type="button"
            onClick={() =>
              copyText(submitOnlyCmd, "submit-only-cmd", `Copied "${submitOnlyCmd}" — grades only stage ${stage.number}.`)
            }
            className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-line-strong bg-paper-raised px-4 text-sm font-medium text-ink transition-colors hover:border-ink"
          >
            {copiedKey === "submit-only-cmd" ? <Check className="size-3.5" aria-hidden /> : null}
            <span>{copiedKey === "submit-only-cmd" ? `Copied ${submitOnlyCmd}` : `Run stage ${stage.number} only`}</span>
          </button>

          <p className="text-xs leading-relaxed text-ink-soft">
            Clone the template repo and run{" "}
            <code className="font-mono text-[0.92em] text-ink">./cppatlas submit</code>. Submit grades stages 1 to{" "}
            {stage.number} and advances <code className="font-mono text-[0.92em] text-ink">.cppatlas.json</code> on pass.
          </p>
        </div>
      )}

      <div className="space-y-3 border-t border-line pt-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">Tests</h2>
          <span className="text-xs text-ink-soft tabular-nums">
            {hasRunResults ? `${passedTestsCount}/${stage.tests.length} passed` : `${stage.tests.length} cases`}
          </span>
        </div>

        <ul className="space-y-2">
          {stage.tests.map((testName) => {
            const outcome = run.testOutcomes[testName];
            const showDone = !starter && isCompleted;
            return (
              <li key={testName} className="flex items-start gap-2.5 text-[0.8125rem] leading-snug">
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full border",
                    outcome === "passed" || showDone
                      ? "border-[color:var(--right)] bg-[color:var(--right)] text-paper dark:text-[#07150f]"
                      : outcome === "failed"
                        ? "border-wrong bg-wrong text-paper"
                        : "border-line-strong bg-transparent"
                  )}
                >
                  {outcome === "passed" || showDone ? (
                    <Check className="size-2.5" strokeWidth={3} />
                  ) : outcome === "failed" ? (
                    <X className="size-2.5" strokeWidth={3} />
                  ) : null}
                </span>
                <span
                  className={cn(
                    "min-w-0",
                    outcome === "failed"
                      ? "font-medium text-wrong"
                      : outcome === "passed" || showDone
                        ? "text-ink"
                        : "text-ink-soft"
                  )}
                >
                  {testName}
                </span>
              </li>
            );
          })}
        </ul>

        <p className="text-xs leading-relaxed text-ink-faint">
          {starter
            ? "Not run yet. Each turns green or red after a run."
            : `Defined in ${stage.testFile}. Run ./cppatlas submit or ${testStageCmd} locally.`}
        </p>
      </div>

      <div className="space-y-3 border-t border-line pt-5">
        <StageDoneButton id={stageDoneId} className="w-full justify-center rounded-xl" />
      </div>

      {stage.atlasTopics.length > 0 ? (
        <div className="space-y-2.5 border-t border-line pt-5 text-sm">
          <p className="text-xs font-semibold text-ink">Read on the Atlas</p>
          <ul className="space-y-1.5">
            {stage.atlasTopics.map((t) => (
              <li key={t.slug}>
                <Link
                  href={`/topics/${t.slug}`}
                  className="text-xs text-ink-soft underline decoration-line-strong underline-offset-3 hover:text-ink hover:decoration-ink"
                >
                  {t.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );

  // --------------------------------------------------------------- bottom dock
  const dockSummary = starter
    ? run.phase === "idle"
      ? "Idle. Output streams here when you submit."
      : run.phase === "done"
        ? run.passed
          ? `Stage ${stage.number} passed ✓`
          : `Stage ${stage.number} failed — open console for details.`
        : run.phase === "error"
          ? run.notice?.title ?? "Grader error."
          : `${run.phase} (${elapsed}s)...`
    : dockHint || `Template repo · ${stage.testFile} · git push runs cppatlas / ${challenge.slug}`;

  const bottomDock = (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#131b2b] text-[#e4ecf9] dark:bg-[#050914]">
      {consoleOpen ? (
        <div className="border-b border-white/10 bg-[#0d1422] px-4 py-3 sm:px-6">
          <div className="mx-auto max-w-6xl space-y-3">
            {starter ? (
              run.lines.length > 0 ? (
                <div
                  ref={logRef}
                  role="log"
                  aria-live="polite"
                  className="max-h-56 overflow-y-auto font-mono text-xs leading-relaxed rad-pane-scroll"
                >
                  {run.lines.map((line, i) => (
                    <div key={`${run.startedAt}:${i}`} className={cn("whitespace-pre-wrap", toneClass[line.tone])}>
                      <span className="text-white/45">{prefix(line)}</span> {line.text}
                      {line.details ? (
                        <pre className="my-1.5 overflow-x-auto rounded-lg border border-white/10 bg-black/35 p-2.5 text-[11px] text-[#dde5f4]">
                          {line.details.body}
                        </pre>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-xs text-white/75">
                  <span>
                    No browser run yet. Click <strong className="text-white">Submit stage {stage.number}</strong> or run{" "}
                    <code className="rounded bg-white/10 px-1.5 py-0.5 text-white">{submitCmd}</code> locally.
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditorOpen(true)}
                    className="cursor-pointer rounded-lg border border-white/20 px-2.5 py-1 text-xs text-white hover:bg-white/10"
                  >
                    Open browser editor
                  </button>
                </div>
              )
            ) : (
              <div className="grid gap-3 font-mono text-xs md:grid-cols-2">
                <div className="space-y-1.5 rounded-lg border border-white/10 bg-black/25 p-3">
                  <div className="text-[11px] text-white/55">1. Grade remotely (or test locally)</div>
                  <div className="flex items-center justify-between gap-2 text-white">
                    <code>{submitCmd}</code>
                    <button
                      type="button"
                      onClick={() => copyText(submitCmd, "dock-submit")}
                      className="cursor-pointer rounded border border-white/15 px-2 py-0.5 text-[11px] text-white/80 hover:bg-white/10"
                    >
                      {copiedKey === "dock-submit" ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-white/85">
                    <code>{submitOnlyCmd}</code>
                    <button
                      type="button"
                      onClick={() => copyText(submitOnlyCmd, "dock-submit-only")}
                      className="cursor-pointer rounded border border-white/15 px-2 py-0.5 text-[11px] text-white/80 hover:bg-white/10"
                    >
                      {copiedKey === "dock-submit-only" ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-white/75">
                    <code>{testStageCmd}</code>
                    <button
                      type="button"
                      onClick={() => copyText(testStageCmd, "dock-test")}
                      className="cursor-pointer rounded border border-white/15 px-2 py-0.5 text-[11px] text-white/80 hover:bg-white/10"
                    >
                      {copiedKey === "dock-test" ? "Copied" : "Copy"}
                    </button>
                  </div>
                  {challenge.slug === "chess" && stage.number === 3 ? (
                    <div className="flex items-center justify-between gap-2 text-[#ffc93a]">
                      <code>./cppatlas bench</code>
                      <button
                        type="button"
                        onClick={() => copyText("./cppatlas bench", "dock-bench")}
                        className="cursor-pointer rounded border border-white/15 px-2 py-0.5 text-[11px] text-white/80 hover:bg-white/10"
                      >
                        {copiedKey === "dock-bench" ? "Copied" : "Copy"}
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-1.5 rounded-lg border border-white/10 bg-black/25 p-3">
                  <div className="text-[11px] text-white/55">
                    2. Or push with .cppatlas.json at stage {stage.number} (c-atlas-grader GitHub App)
                  </div>
                  <div className="flex items-center justify-between gap-2 text-white">
                    <code className="truncate">
                      git add -A &amp;&amp; git commit -m &quot;stage {stage.number}&quot; &amp;&amp; git push
                    </code>
                    <button
                      type="button"
                      onClick={() =>
                        copyText(
                          `git add -A && git commit -m "stage ${stage.number}" && git push`,
                          "dock-push"
                        )
                      }
                      className="shrink-0 cursor-pointer rounded border border-white/15 px-2 py-0.5 text-[11px] text-white/80 hover:bg-white/10"
                    >
                      {copiedKey === "dock-push" ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <div className="text-[11px] text-white/55">
                    Checks run automatically on GitHub under <span className="text-white/85">cppatlas / {challenge.slug}</span>.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      <div className="flex h-10 items-center justify-between gap-3 px-4 font-mono text-xs sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-white">
            <Terminal className="size-3.5 text-[#ffc93a]" aria-hidden />
            <span>$ {submitCmd}</span>
          </span>
          <span className="hidden truncate text-white/65 sm:inline">{dockSummary}</span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => copyText(submitCmd, "bar-copy")}
            className="hidden cursor-pointer items-center gap-1 rounded border border-white/15 px-2 py-0.5 text-[11px] text-white/80 hover:bg-white/10 sm:inline-flex"
          >
            {copiedKey === "bar-copy" ? <Check className="size-3" aria-hidden /> : <Copy className="size-3" aria-hidden />}
            <span>{copiedKey === "bar-copy" ? "Copied" : "Copy"}</span>
          </button>
          <button
            type="button"
            onClick={() => setConsoleOpen((o) => !o)}
            className="inline-flex cursor-pointer items-center gap-1 rounded border border-white/20 bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-white hover:bg-white/15"
          >
            <span>{consoleOpen ? "Close console" : "Open console"}</span>
            {consoleOpen ? <ChevronDown className="size-3" aria-hidden /> : <ChevronUp className="size-3" aria-hidden />}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <CourseRailShell
      challenge={challenge}
      activeStageSlug={stage.slug}
      activeLabel={stage.title}
      rightRail={rightRail}
      bottomDock={bottomDock}
    >
      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-2.5 text-sm">
          <span className="font-medium text-ink-soft tabular-nums">
            Stage {stage.number} of {challenge.stages.length}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
              isCompleted
                ? "bg-right-wash text-[color:var(--right)]"
                : "bg-sun text-[color:var(--on-sun)]"
            )}
          >
            {isCompleted ? "Completed" : "In progress"}
          </span>
        </div>

        <h1 className="font-display text-[clamp(2rem,4vw,2.75rem)] leading-[1.06] font-[500] tracking-[-0.03em] text-ink text-balance">
          {stage.title}
        </h1>

        <p className="max-w-[60ch] text-[1.08rem] leading-relaxed text-ink-soft">{stage.summary}</p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-ink-soft">
          <DifficultyBadge difficulty={stage.difficulty} />
          <span>about {stage.estimate}</span>
          {stage.concepts.map((c) => (
            <span
              key={c}
              className="rounded-[var(--radius-chip)] border border-line bg-paper-sunk px-2 py-0.5 font-mono text-[11px] text-ink-soft"
            >
              {c}
            </span>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-paper-raised px-4 py-2.5 shadow-[0_1px_2px_rgb(0_0_0/0.03)]">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="text-xs font-medium text-ink-soft">You edit</span>
            <code className="truncate font-mono text-[0.84rem] font-medium text-ink">{stage.editFile}</code>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => copyText(stage.editFile, "edit-path")}
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-line-strong bg-paper-raised px-2.5 text-xs font-medium text-ink transition-colors hover:border-ink"
            >
              {copiedKey === "edit-path" ? <Check className="size-3" aria-hidden /> : <Copy className="size-3" aria-hidden />}
              <span>{copiedKey === "edit-path" ? "Copied" : "Copy path"}</span>
            </button>
            {starter ? (
              <button
                type="button"
                onClick={() => setEditorOpen((o) => !o)}
                className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-paper-sunk px-2.5 text-xs font-medium text-ink transition-colors hover:border-line-strong"
              >
                <Code2 className="size-3.5" aria-hidden />
                <span>{editorOpen ? "Hide editor" : "Edit in browser"}</span>
              </button>
            ) : null}
          </div>
        </div>

        {starter && editorOpen ? (
          <div className="overflow-hidden rounded-xl border border-line bg-paper-raised">
            <div className="flex items-center justify-between border-b border-line bg-paper-sunk/60 px-4 py-2 text-xs">
              <span className="font-mono text-ink">{starter.path}</span>
              <div className="flex items-center gap-3">
                {edited ? (
                  <button
                    type="button"
                    onClick={resetToStarter}
                    className="inline-flex cursor-pointer items-center gap-1 text-ink-soft hover:text-ink"
                  >
                    <RotateCcw className="size-3" aria-hidden />
                    <span>Reset to starter</span>
                  </button>
                ) : (
                  <span className="text-ink-faint">Starter file</span>
                )}
              </div>
            </div>
            <textarea
              aria-label={`Contents of ${starter.path}`}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={onEditorKeyDown}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              wrap="off"
              rows={15}
              className="block h-[min(22rem,55svh)] min-h-40 w-full resize-y bg-transparent px-4 py-3 font-mono text-[0.8rem] leading-relaxed text-[color:var(--code-ink)] outline-none"
            />
            {inputError ? (
              <p role="alert" className="border-t border-wrong/20 bg-wrong-wash px-4 py-2 text-xs text-wrong">
                {inputError}
              </p>
            ) : null}
            <div className="flex items-center justify-between border-t border-line bg-paper-sunk/50 px-4 py-2 text-xs text-ink-faint">
              <span>Tab inserts 4 spaces · Esc then Tab leaves editor</span>
              <button
                type="button"
                disabled={runBlocked}
                onClick={() => void startGrader("submit", false)}
                className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border border-ink bg-sun px-3 font-medium text-ink disabled:opacity-55"
              >
                <Play className="size-3" aria-hidden />
                <span>Run on grader</span>
              </button>
            </div>
          </div>
        ) : null}
      </header>

      <div className="mt-8 [&_.prose-atlas>*:first-child]:mt-0">{children}</div>

      <nav aria-label="Adjacent stages" className="mt-12 grid gap-4 border-t border-line pt-8 sm:grid-cols-2">
        {prev ? (
          <Link href={`/build/${challenge.slug}/${prev.slug}`} className={adjacentLink}>
            <span className="inline-flex items-center gap-1.5 text-xs text-ink-faint">
              <ArrowLeft className="size-3.5" aria-hidden />
              <span>Previous stage</span>
            </span>
            <div className={adjacentTitle}>
              {prev.number}. {prev.title}
            </div>
          </Link>
        ) : (
          <div />
        )}
        {next ? (
          <Link href={`/build/${challenge.slug}/${next.slug}`} className={`${adjacentLink} sm:text-right`}>
            <span className="inline-flex items-center gap-1.5 text-xs text-ink-faint sm:justify-end">
              <span>Next stage</span>
              <ArrowRight className="size-3.5" aria-hidden />
            </span>
            <div className={adjacentTitle}>
              {next.number}. {next.title}
            </div>
          </Link>
        ) : (
          <Link href={`/build/${challenge.slug}`} className={`${adjacentLink} sm:text-right`}>
            <span className="text-xs text-ink-faint">Finished</span>
            <div className={adjacentTitle}>Back to {challenge.title}</div>
          </Link>
        )}
      </nav>
    </CourseRailShell>
  );
}
