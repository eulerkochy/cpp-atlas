"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import {
  Check,
  Database,
  ExternalLink,
  Flame,
  KeyRound,
  Layers,
  Loader2,
  RotateCcw,
  Sparkles,
  Target,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import {
  verifyGeminiKey,
  type GeminiKeyPersistence,
} from "@/lib/ai-client";
import type { TopAffinitiesResult } from "@/lib/scroll-ranker";
import type {
  ScrollFocusMode,
  ScrollUserProfile,
} from "@/lib/scroll-storage";
import type { ScrollFeedMeta } from "@/lib/scroll-types";
import { cn } from "@/lib/utils";

const AI_STUDIO_KEY_URL = "https://aistudio.google.com/app/apikey";

export interface ScrollOverlayDrawerProps {
  open: boolean;
  onClose: () => void;
  profile: ScrollUserProfile;
  affinities: TopAffinitiesResult;
  meta: ScrollFeedMeta;
  loadedPoolCount: number;
  sessionAiCount: number;
  serverAiConfigured: boolean | null;
  sessionGeminiKey: string;
  geminiKeyPersistence: GeminiKeyPersistence | null;
  onSaveGeminiKey: (key: string, persistence: GeminiKeyPersistence) => void;
  onClearGeminiKey: () => void;
  onToggleAdaptiveAi: (enabled: boolean) => void;
  isGeneratingAi: boolean;
  aiStatusNote: string | null;
  onGenerateNow: () => void;
  onSelectMode: (mode: ScrollFocusMode) => void;
  onResetWeights: () => void;
}

const MODE_OPTIONS: {
  id: ScrollFocusMode;
  label: string;
  desc: string;
}[] = [
  { id: "for-you", label: "For You", desc: "Adaptive mix" },
  { id: "visuals", label: "Visuals", desc: "Diagrams & diffs" },
  { id: "traps", label: "Traps", desc: "1-tap ISO checks" },
  { id: "reviews", label: "Reviews", desc: "Spaced repetition" },
];

export function ScrollOverlayDrawer({
  open,
  onClose,
  profile,
  affinities,
  meta,
  loadedPoolCount,
  sessionAiCount,
  serverAiConfigured,
  sessionGeminiKey,
  geminiKeyPersistence,
  onSaveGeminiKey,
  onClearGeminiKey,
  onToggleAdaptiveAi,
  isGeneratingAi,
  aiStatusNote,
  onGenerateNow,
  onSelectMode,
  onResetWeights,
}: ScrollOverlayDrawerProps) {
  const rememberId = useId();
  const [draftKey, setDraftKey] = useState("");
  const [rememberKey, setRememberKey] = useState(true);
  const [verifyingKey, setVerifyingKey] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const { streak, preferences } = profile;
  const adaptiveAiEnabled = preferences.adaptiveAiEnabled;
  const dailyGoal = Math.max(1, streak.dailyGoal || 5);
  const dailyPct = Math.min(
    100,
    Math.round((streak.todayCards / dailyGoal) * 100)
  );
  const trapTotal = streak.todayTrapsTotal;
  const trapRight = streak.todayTrapsRight;
  const visualCount =
    (meta.countsByKind.concept ?? 0) +
    (meta.countsByKind.code ?? 0) +
    (meta.countsByKind.evolution ?? 0);
  const trapCount = meta.countsByKind.trap ?? 0;

  const poolCounts = meta.poolCounts;
  const totalAvailable = Math.max(
    loadedPoolCount,
    meta.totalAvailable ?? visualCount + trapCount
  );

  const hasGeminiReady =
    serverAiConfigured === true || Boolean(sessionGeminiKey);

  const aiStatusLabel =
    serverAiConfigured === true
      ? "Gemini ready (Server)"
      : sessionGeminiKey
        ? "Gemini ready (Your key)"
        : serverAiConfigured === null
          ? "Checking Gemini availability…"
          : "Offline pool only — add Gemini key for live AI cards";

  async function handleConnectKey(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = draftKey.trim();
    if (!trimmed || verifyingKey) return;

    setVerifyingKey(true);
    setVerifyError(null);
    const result = await verifyGeminiKey(trimmed);
    setVerifyingKey(false);

    if (!result.ok) {
      setVerifyError(
        result.error ||
          "Could not verify this Gemini API key. Check Google AI Studio and try again."
      );
      return;
    }

    setDraftKey("");
    onSaveGeminiKey(trimmed, rememberKey ? "local" : "session");
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Scroll streak, spaced repetition, Adaptive AI, and For-You feed controls"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="scroll-sheet-enter w-full max-w-md overflow-hidden rounded-t-2xl border border-white/15 bg-[#0b0c10]/95 text-white shadow-[0_24px_80px_rgba(0,0,0,0.85)] backdrop-blur-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-6 items-center justify-center rounded-full bg-[#ff4d5a]/15 text-[#ff4d5a]">
              <Flame className="size-3.5" aria-hidden />
            </span>
            <h2 className="text-sm font-semibold tracking-tight text-white">
              Your Scroll Pulse
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="flex size-8 items-center justify-center rounded-full bg-white/8 text-white/75 transition-colors hover:bg-white/15 hover:text-white cursor-pointer"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="max-h-[80dvh] space-y-3.5 overflow-y-auto px-4 py-4">
          {/* Knowledge Pool Banner */}
          <div
            data-scroll-pool-summary="true"
            className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5"
          >
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 font-semibold text-white">
                <Database className="size-3.5 text-sky-300" aria-hidden />
                <span className="tabular-nums">
                  {totalAvailable.toLocaleString("en-US")}+ cards
                </span>
              </span>
              <span className="text-[11px] text-white/55">
                Core + Reference + AI
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[10px] text-white/50 tabular-nums">
              {poolCounts ? (
                <>
                  <span>
                    core {(poolCounts.core + poolCounts.simulator).toLocaleString("en-US")}
                  </span>
                  <span>·</span>
                  <span>
                    puzzles {poolCounts.procedural.toLocaleString("en-US")}
                  </span>
                  <span>·</span>
                  <span>
                    cppref {poolCounts.reference.toLocaleString("en-US")}
                  </span>
                </>
              ) : (
                <span>
                  {visualCount.toLocaleString("en-US")} visuals ·{" "}
                  {trapCount.toLocaleString("en-US")} traps
                </span>
              )}
              {sessionAiCount > 0 ? (
                <>
                  <span>·</span>
                  <span className="text-violet-300">
                    +{sessionAiCount} AI tailored
                  </span>
                </>
              ) : null}
            </div>
          </div>

          {/* Daily Streak + Today's Progress */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-center gap-2">
                <Flame
                  className={cn(
                    "size-4",
                    streak.currentDays > 0 ? "text-[#ff4d5a]" : "text-white/40"
                  )}
                  aria-hidden
                />
                <span className="text-base font-bold tabular-nums text-white">
                  {streak.currentDays}{" "}
                  {streak.currentDays === 1 ? "day" : "days"}
                </span>
                <span className="text-xs text-white/50">streak</span>
              </div>
              {streak.longestDays > 0 ? (
                <span className="font-mono text-[11px] text-white/45 tabular-nums">
                  best {streak.longestDays}d
                </span>
              ) : null}
            </div>

            <div className="mt-3">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-white/70">Today&apos;s goal</span>
                <span className="font-mono tabular-nums text-white/90">
                  {streak.todayCards}/{dailyGoal} cards
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[#ff4d5a] transition-all duration-300"
                  style={{ width: `${dailyPct}%` }}
                />
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-white/8 pt-2.5 text-xs text-white/65">
              <span className="inline-flex items-center gap-1.5">
                <Target className="size-3.5 text-emerald-400" aria-hidden />
                Traps nailed today
              </span>
              <span className="font-mono font-medium tabular-nums text-white/90">
                {trapTotal > 0 ? `${trapRight}/${trapTotal}` : "0 yet"}
              </span>
            </div>
          </div>

          {/* Adaptive AI Section */}
          <div
            data-scroll-ai-section="true"
            className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex size-6 items-center justify-center rounded-full bg-violet-400/15 text-violet-300">
                  <Sparkles className="size-3.5" aria-hidden />
                </span>
                <div>
                  <div className="text-xs font-semibold text-white">
                    Adaptive AI
                  </div>
                  <div className="text-[11px] text-white/50">
                    Grounded Gemini remediation &amp; deep dives
                  </div>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={adaptiveAiEnabled}
                aria-label="Toggle Adaptive AI card generation"
                data-scroll-ai-toggle="true"
                onClick={() => onToggleAdaptiveAi(!adaptiveAiEnabled)}
                className={cn(
                  "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors cursor-pointer",
                  adaptiveAiEnabled ? "bg-[#ff4d5a]" : "bg-white/15"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "inline-block size-5 rounded-full bg-white shadow transition-transform",
                    adaptiveAiEnabled ? "translate-x-4" : "translate-x-0"
                  )}
                />
              </button>
            </div>

            {/* Live Gemini Status Pill */}
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/8 bg-black/40 px-2.5 py-2 text-[11px]">
              <span className="inline-flex min-w-0 items-center gap-1.5 text-white/80">
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    hasGeminiReady
                      ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]"
                      : serverAiConfigured === null
                        ? "bg-white/40"
                        : "bg-amber-400/80"
                  )}
                />
                <span className="truncate">{aiStatusLabel}</span>
              </span>

              {serverAiConfigured === false && sessionGeminiKey ? (
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-[10px] text-white/45">
                    {geminiKeyPersistence === "session" ? "tab" : "saved"}
                  </span>
                  <button
                    type="button"
                    onClick={onClearGeminiKey}
                    className="text-[11px] font-medium text-white/60 underline decoration-white/25 underline-offset-2 transition-colors hover:text-[#ff4d5a] cursor-pointer"
                  >
                    Disconnect
                  </button>
                </div>
              ) : null}
            </div>

            {/* 1-tap Generate Now when Gemini is ready */}
            {hasGeminiReady ? (
              <div className="mt-2.5 flex items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={isGeneratingAi}
                  onClick={onGenerateNow}
                  data-scroll-ai-generate-now="true"
                  className={cn(
                    "inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all cursor-pointer",
                    isGeneratingAi
                      ? "bg-white/10 text-white/60 cursor-wait"
                      : "bg-white text-black hover:bg-white/90 active:scale-[0.98]"
                  )}
                >
                  {isGeneratingAi ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      <span>Tailoring 3 cards…</span>
                    </>
                  ) : (
                    <>
                      <Wand2 className="size-3.5" aria-hidden />
                      <span>Generate 3 tailored cards now</span>
                    </>
                  )}
                </button>
              </div>
            ) : null}

            {/* Inline BYOK Gemini Key form when no server key & no session key */}
            {serverAiConfigured === false && !sessionGeminiKey ? (
              <div className="mt-2.5 space-y-2 border-t border-white/8 pt-2.5">
                <div className="flex items-center justify-between gap-2 text-[11px] text-white/60">
                  <span className="inline-flex items-center gap-1">
                    <KeyRound className="size-3 text-white/50" aria-hidden />
                    <span>Bring your own Gemini key</span>
                  </span>
                  <a
                    href={AI_STUDIO_KEY_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-white/80 underline decoration-white/30 underline-offset-2 hover:text-white"
                  >
                    <span>Get free key</span>
                    <ExternalLink className="size-2.5" aria-hidden />
                  </a>
                </div>

                <form
                  onSubmit={handleConnectKey}
                  className="flex items-center gap-1.5"
                >
                  <input
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    aria-label="Gemini API key"
                    placeholder="Paste Gemini API key (AIza…)"
                    value={draftKey}
                    onChange={(e) => {
                      setDraftKey(e.target.value);
                      if (verifyError) setVerifyError(null);
                    }}
                    disabled={verifyingKey}
                    className="h-8 min-w-0 flex-1 rounded-lg border border-white/15 bg-black/60 px-2.5 font-mono text-[11px] text-white placeholder:font-sans placeholder:text-white/40 focus:border-white/40 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={verifyingKey || !draftKey.trim()}
                    className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-white px-3 text-xs font-semibold text-black transition-opacity hover:bg-white/90 disabled:opacity-40 cursor-pointer"
                  >
                    {verifyingKey ? (
                      <>
                        <Loader2 className="size-3 animate-spin" aria-hidden />
                        <span>Verify</span>
                      </>
                    ) : (
                      <>
                        <Check className="size-3" aria-hidden />
                        <span>Connect</span>
                      </>
                    )}
                  </button>
                </form>

                <label
                  htmlFor={rememberId}
                  className="flex cursor-pointer items-center gap-2 text-[11px] text-white/55 select-none"
                >
                  <input
                    id={rememberId}
                    type="checkbox"
                    checked={rememberKey}
                    onChange={(e) => setRememberKey(e.target.checked)}
                    disabled={verifyingKey}
                    className="size-3.5 rounded border-white/25 bg-black accent-[#ff4d5a]"
                  />
                  <span>Remember in this browser (never sent to our DB)</span>
                </label>

                {verifyError ? (
                  <p
                    role="alert"
                    className="rounded-lg border border-[#ff4d5a]/35 bg-[#ff4d5a]/10 px-2.5 py-1.5 text-[11px] text-[#ff9aa2]"
                  >
                    {verifyError}
                  </p>
                ) : null}
              </div>
            ) : null}

            {aiStatusNote ? (
              <p className="mt-2 text-[11px] text-violet-200/80">
                {aiStatusNote}
              </p>
            ) : null}
          </div>

          {/* Spaced-Repetition Due Queue */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                <span
                  className={cn(
                    "inline-block size-2 rounded-full",
                    affinities.dueReviewCount > 0
                      ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]"
                      : "bg-white/25"
                  )}
                  aria-hidden
                />
                <span>
                  {affinities.dueReviewCount > 0
                    ? `${affinities.dueReviewCount} due for review`
                    : "Review queue caught up"}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-white/50">
                {affinities.totalQueuedReviews > 0
                  ? `${affinities.totalQueuedReviews} saved or missed cards scheduled`
                  : "Save a card or miss a trap to schedule spaced review"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                onSelectMode("reviews");
                onClose();
              }}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-all active:scale-95 cursor-pointer",
                affinities.dueReviewCount > 0
                  ? "bg-[#ff4d5a] text-white hover:bg-[#ff3645]"
                  : "bg-white/12 text-white/85 ring-1 ring-white/15 hover:bg-white/20"
              )}
            >
              Review due now
            </button>
          </div>

          {/* Feed Mode Selector */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-wider text-white/50 uppercase">
                Feed Mode
              </span>
              <span className="font-mono text-[11px] text-white/40 tabular-nums">
                {visualCount.toLocaleString("en-US")} visuals ·{" "}
                {trapCount.toLocaleString("en-US")} traps
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {MODE_OPTIONS.map((mode) => {
                const active = preferences.focusMode === mode.id;
                const showDueDot =
                  mode.id === "reviews" && affinities.dueReviewCount > 0;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      onSelectMode(mode.id);
                      onClose();
                    }}
                    className={cn(
                      "flex flex-col items-start rounded-xl border px-3 py-2 text-left transition-all cursor-pointer",
                      active
                        ? "border-white bg-white text-black"
                        : "border-white/12 bg-white/[0.04] text-white hover:border-white/25 hover:bg-white/[0.08]"
                    )}
                  >
                    <span className="flex w-full items-center justify-between text-xs font-semibold">
                      <span className="inline-flex items-center gap-1.5">
                        {mode.id === "for-you" ? (
                          <Sparkles className="size-3" aria-hidden />
                        ) : mode.id === "traps" ? (
                          <Zap className="size-3" aria-hidden />
                        ) : mode.id === "visuals" ? (
                          <Layers className="size-3" aria-hidden />
                        ) : null}
                        {mode.label}
                      </span>
                      {showDueDot ? (
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0.5 font-mono text-[10px] leading-none tabular-nums",
                            active
                              ? "bg-black/15 text-black"
                              : "bg-amber-400/20 text-amber-300"
                          )}
                        >
                          {affinities.dueReviewCount}
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 text-[11px]",
                        active ? "text-black/65" : "text-white/50"
                      )}
                    >
                      {mode.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Top Learned For-You Tracks */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold tracking-wider text-white/50 uppercase">
                Top For-You Tracks
              </span>
              <button
                type="button"
                onClick={onResetWeights}
                className="inline-flex items-center gap-1 rounded-full border border-white/12 bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-white/75 transition-colors hover:border-white/25 hover:bg-white/12 hover:text-white cursor-pointer"
              >
                <RotateCcw className="size-3" aria-hidden />
                <span>Reset For-You weights</span>
              </button>
            </div>

            {affinities.topTracks.length > 0 ? (
              <ul className="space-y-2.5">
                {affinities.topTracks.map((track) => (
                  <li key={track.trackId} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-medium text-white/90">
                        {track.trackTitle}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-white/50 tabular-nums">
                        +{track.score.toFixed(1)}
                      </span>
                    </div>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-[#ff4d5a]/90 transition-all duration-300"
                        style={{ width: `${track.strengthPct}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs leading-relaxed text-white/50">
                Like, save, dwell on visuals, or answer traps to tune your
                adaptive For-You mix in real time.
              </p>
            )}
          </div>

          {/* Subtle Desktop Keyboard Hints */}
          <div className="hidden flex-wrap items-center justify-center gap-x-3 gap-y-1 pt-0.5 font-mono text-[10px] text-white/40 sm:flex">
            <span>↑↓ / j k next</span>
            <span>Space pause</span>
            <span>C captions</span>
            <span>R rotate</span>
            <span>L like</span>
            <span>S save</span>
          </div>
        </div>
      </div>
    </div>
  );
}
