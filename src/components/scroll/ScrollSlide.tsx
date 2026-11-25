"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";
import {
  Bookmark,
  BookOpen,
  Captions,
  Heart,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Share2,
} from "lucide-react";
import type { ScrollCard } from "@/lib/scroll-types";
import { cn } from "@/lib/utils";
import { StageRenderer } from "./stages/StageRenderer";

export interface ScrollSlideProps {
  card: ScrollCard;
  index: number;
  reasonBadge: string;
  rankTag: string;
  isDueReview: boolean;
  isActive: boolean;
  shouldRenderStage: boolean;
  isPaused: boolean;
  isRotated: boolean;
  captionsEnabled: boolean;
  isLiked: boolean;
  isSaved: boolean;
  existingTrapResult?: { selectedIndex: number; isCorrect: boolean } | null;
  onTogglePause: () => void;
  onSetPaused: (paused: boolean) => void;
  onToggleRotate: () => void;
  onToggleCaptions: () => void;
  onLike: (card: ScrollCard) => void;
  onSave: (card: ScrollCard) => void;
  onShare: (card: ScrollCard) => void;
  onReadClick: (card: ScrollCard) => void;
  onTrapAnswer: (
    card: ScrollCard,
    selectedIndex: number,
    isCorrect: boolean
  ) => void;
}

function buildTagPills(card: ScrollCard): string[] {
  const candidates: string[] = [];
  if (card.standard) candidates.push(card.standard);
  if (card.trackTitle) candidates.push(card.trackTitle);
  for (const tag of card.tags) {
    if (tag) candidates.push(tag);
  }
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const raw of candidates) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(trimmed);
  }
  return unique;
}

function defaultKindBadge(kind: ScrollCard["kind"]): string {
  switch (kind) {
    case "code":
      return "✦ Code Walkthrough";
    case "evolution":
      return "✦ C++ Evolution";
    case "trap":
      return "✦ Trap Check";
    case "concept":
    default:
      return "✦ Visual Explainer";
  }
}

function formatKindBadge(card: ScrollCard): string {
  const trimmed = card.badgeLabel.trim();
  const normalized = trimmed.toLowerCase();
  if (
    !trimmed ||
    (card.origin === "reference" && normalized === "cppreference") ||
    (card.origin === "ai" && normalized.includes("adaptive ai"))
  ) {
    return defaultKindBadge(card.kind);
  }
  if (/^[✦⚡↺↑★•]/.test(trimmed)) return trimmed;
  return `✦ ${trimmed}`;
}

export function ScrollSlide({
  card,
  index,
  reasonBadge,
  rankTag,
  isDueReview,
  isActive,
  shouldRenderStage,
  isPaused,
  isRotated,
  captionsEnabled,
  isLiked,
  isSaved,
  existingTrapResult,
  onTogglePause,
  onSetPaused,
  onToggleRotate,
  onToggleCaptions,
  onLike,
  onSave,
  onShare,
  onReadClick,
  onTrapAnswer,
}: ScrollSlideProps) {
  const isTrap = card.stage.type === "trap";
  const isTrapAnswered = isTrap && Boolean(existingTrapResult);

  const [progress, setProgress] = useState<number>(() =>
    isTrapAnswered ? 1 : 0
  );
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);

  const scrubberRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const needsResetOnActivateRef = useRef(false);

  const durationSec = Math.max(4, card.durationSec || 15);

  // Derived progress & expansion states (no synchronous setState inside effects)
  const displayProgress = isTrapAnswered ? 1 : isActive ? progress : 0;
  const isTagsExpanded = isActive && tagsExpanded;
  const isSummaryExpanded = isActive && summaryExpanded;

  // Smooth requestAnimationFrame clock driving StageRenderer beats & bottom scrubber
  useEffect(() => {
    if (!isActive) {
      needsResetOnActivateRef.current = true;
      return;
    }

    if (isPaused || isTrapAnswered || !shouldRenderStage) {
      return;
    }

    let rafId = 0;
    let lastTs = performance.now();

    const tick = (now: number) => {
      const dtSec = Math.min(0.1, Math.max(0, (now - lastTs) / 1000));
      lastTs = now;

      if (needsResetOnActivateRef.current) {
        needsResetOnActivateRef.current = false;
        setProgress(0);
        setTagsExpanded(false);
        setSummaryExpanded(false);
      } else if (!isDraggingRef.current) {
        const delta = dtSec / durationSec;
        setProgress((prev) => {
          const next = prev + delta;
          if (isTrap) {
            return next >= 1 ? 1 : next;
          }
          return next >= 1 ? next % 1 : next;
        });
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [isActive, isPaused, isTrap, isTrapAnswered, shouldRenderStage, durationSec]);

  const handleStageTap = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.closest(
          "button, a, input, textarea, [role='button'], [data-no-pause='true']"
        )
      ) {
        return;
      }
      onTogglePause();
    },
    [onTogglePause]
  );

  const handleRestart = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      needsResetOnActivateRef.current = false;
      setProgress(0);
      onSetPaused(false);
    },
    [onSetPaused]
  );

  const handlePlayPauseClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      onTogglePause();
    },
    [onTogglePause]
  );

  const handleRotateClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      onToggleRotate();
    },
    [onToggleRotate]
  );

  const seekFromClientX = useCallback((clientX: number) => {
    const el = scrubberRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    needsResetOnActivateRef.current = false;
    setProgress(ratio);
  }, []);

  const handleScrubPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      isDraggingRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      seekFromClientX(e.clientX);
    },
    [seekFromClientX]
  );

  const handleScrubPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return;
      e.stopPropagation();
      seekFromClientX(e.clientX);
    },
    [seekFromClientX]
  );

  const handleScrubPointerUp = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return;
      e.stopPropagation();
      isDraggingRef.current = false;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    },
    []
  );

  const allPills = useMemo(() => buildTagPills(card), [card]);
  const visiblePills = isTagsExpanded ? allPills : allPills.slice(0, 3);
  const hiddenPillCount = Math.max(0, allPills.length - 3);
  const summaryHasMore = card.summary.length > 96;

  const statusPillLabel = rankTag || reasonBadge || "For You";
  const kindBadgeLabel = formatKindBadge(card);

  const originPill = useMemo(() => {
    if (card.origin === "ai") {
      const reason = card.aiReason?.trim();
      const label = reason
        ? /^[✦⚡↺↑★•]/.test(reason)
          ? reason
          : `✦ ${reason}`
        : statusPillLabel.toLowerCase().includes("adaptive ai")
          ? "✦ Gemini"
          : "✦ Adaptive AI";
      return { kind: "ai" as const, label };
    }
    if (card.origin === "reference") {
      if (statusPillLabel.toLowerCase().includes("cppreference")) {
        return null;
      }
      return { kind: "reference" as const, label: "cppreference" };
    }
    return null;
  }, [card.aiReason, card.origin, statusPillLabel]);

  const durationCue = useMemo(() => {
    if (card.stage.type === "trap") {
      if (isTrapAnswered && card.stage.clause) {
        const clause = card.stage.clause.trim();
        return clause.includes("[") ? clause : `[${clause}]`;
      }
      return "1-tap check";
    }
    const beatsCount = card.stage.beats.length;
    return `${Math.round(durationSec)}s · ${beatsCount} steps`;
  }, [card.stage, durationSec, isTrapAnswered]);

  // Lightweight virtualized placeholder for distant slides (|index - activeIndex| > 2)
  if (!shouldRenderStage) {
    return (
      <section
        aria-label={card.title}
        data-slide-index={index}
        data-card-id={card.id}
        className="relative h-dvh w-full shrink-0 snap-start snap-always overflow-hidden bg-black"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            background: `radial-gradient(60% 45% at 50% 32%, ${card.accentHex} 0%, transparent 72%)`,
          }}
        />
        <span className="sr-only">{card.title}</span>
      </section>
    );
  }

  return (
    <section
      aria-label={card.title}
      data-slide-index={index}
      data-card-id={card.id}
      className="relative h-dvh w-full shrink-0 snap-start snap-always overflow-hidden bg-black select-none"
    >
      {/* Atmospheric blurred radial mesh tinted with card.accentHex */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 scale-125 opacity-45 blur-3xl transition-opacity duration-700"
        style={{
          background: `radial-gradient(64% 50% at 50% 34%, ${card.accentHex} 0%, ${card.accentHex}55 38%, rgba(0,0,0,0) 78%)`,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-black/35"
      />
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/55 to-transparent transition-all duration-300",
          isRotated ? "h-[28%]" : "h-[56%]"
        )}
      />

      {/* Upper / Middle 16:9 Stage */}
      <div
        className={cn(
          "absolute inset-x-0 z-10 transition-all duration-300 ease-out",
          isRotated
            ? "top-1/2 -translate-y-1/2 px-3 sm:px-6"
            : "top-[31%] -translate-y-1/2 px-0 sm:px-2.5"
        )}
      >
        <div
          data-tap-target="true"
          onClick={handleStageTap}
          className={cn(
            "relative mx-auto aspect-video w-full overflow-hidden bg-[#050608] ring-1 ring-white/10 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)] cursor-pointer transition-all duration-300",
            isRotated
              ? "max-h-[calc(100dvh-8rem)] max-w-[calc((100dvh-8rem)*16/9)] rounded-xl"
              : "sm:rounded-lg"
          )}
        >
          <StageRenderer
            card={card}
            isActive={isActive}
            isPaused={isPaused}
            isRotated={isRotated}
            captionsEnabled={captionsEnabled}
            progress={displayProgress}
            onTrapAnswer={onTrapAnswer}
            existingTrapResult={existingTrapResult}
          />

          {/* Paused 3-button centered frosted-glass overlay (alphaXiv style) */}
          {isActive && isPaused ? (
            <div className="scroll-controls-enter absolute inset-0 z-30 flex items-center justify-center bg-black/45 backdrop-blur-[2px]">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={handleRestart}
                  aria-label="Restart explainer"
                  title="Restart"
                  className="flex size-11 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/25 backdrop-blur-md transition-all hover:bg-white/25 active:scale-90 cursor-pointer"
                >
                  <RotateCcw className="size-4.5" aria-hidden />
                </button>

                <button
                  type="button"
                  onClick={handlePlayPauseClick}
                  aria-label={isPaused ? "Resume playback" : "Pause playback"}
                  title={isPaused ? "Play (Space)" : "Pause (Space)"}
                  className="flex size-14 items-center justify-center rounded-full bg-white/20 text-white ring-1 ring-white/35 backdrop-blur-md shadow-[0_8px_28px_rgba(0,0,0,0.5)] transition-all hover:bg-white/30 active:scale-90 cursor-pointer"
                >
                  {isPaused ? (
                    <Play className="size-6 translate-x-0.5 fill-white" aria-hidden />
                  ) : (
                    <Pause className="size-6 fill-white" aria-hidden />
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleRotateClick}
                  aria-label={
                    isRotated
                      ? "Rotate back to portrait"
                      : "Rotate to watch sideways"
                  }
                  title={
                    isRotated
                      ? "Rotate back to portrait (R)"
                      : "Rotate to watch sideways (R)"
                  }
                  className="flex size-11 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/25 backdrop-blur-md transition-all hover:bg-white/25 active:scale-90 cursor-pointer"
                >
                  {isRotated ? (
                    <Minimize2 className="size-4.5" aria-hidden />
                  ) : (
                    <RotateCw className="size-4.5" aria-hidden />
                  )}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Bottom Overlay: Full Portrait Mode vs Compact Landscape Theater Bar */}
      {isRotated ? (
        <div className="absolute inset-x-0 bottom-3 z-20 flex items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium backdrop-blur-md",
                isDueReview
                  ? "bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/45"
                  : "bg-white/15 text-white/95"
              )}
            >
              {statusPillLabel}
            </span>
            {originPill ? (
              <span
                className={cn(
                  "hidden max-w-[165px] shrink-0 truncate rounded-full px-2 py-0.5 text-[10px] font-medium backdrop-blur-md sm:inline-flex",
                  originPill.kind === "ai"
                    ? "bg-violet-400/18 text-violet-100 ring-1 ring-violet-300/35"
                    : "bg-sky-400/15 font-mono text-sky-200 ring-1 ring-sky-300/30"
                )}
              >
                {originPill.label}
              </span>
            ) : null}
            <h2 className="truncate text-[15px] font-bold text-white">
              <Link
                href={card.readHref}
                onClick={() => onReadClick(card)}
                className="hover:underline decoration-white/50 underline-offset-4"
              >
                {card.title}
              </Link>
            </h2>
          </div>

          <nav
            aria-label="Card actions"
            className="flex shrink-0 items-center gap-2"
          >
            <button
              type="button"
              onClick={() => onLike(card)}
              aria-pressed={isLiked}
              aria-label={isLiked ? "Unlike card" : "Like card"}
              className={cn(
                "flex size-9 items-center justify-center rounded-full ring-1 backdrop-blur-md transition-all active:scale-90 cursor-pointer",
                isLiked
                  ? "bg-[#ff4d5a]/25 text-[#ff4d5a] ring-[#ff4d5a]/60"
                  : "bg-white/12 text-white ring-white/15 hover:bg-white/20"
              )}
            >
              <Heart
                className={cn("size-4", isLiked && "fill-[#ff4d5a]")}
                aria-hidden
              />
            </button>

            <button
              type="button"
              onClick={() => onSave(card)}
              aria-pressed={isSaved}
              aria-label={
                isSaved ? "Remove saved card" : "Save for spaced review"
              }
              className={cn(
                "flex size-9 items-center justify-center rounded-full ring-1 backdrop-blur-md transition-all active:scale-90 cursor-pointer",
                isSaved
                  ? "bg-amber-400/20 text-amber-300 ring-amber-300/60"
                  : "bg-white/12 text-white ring-white/15 hover:bg-white/20"
              )}
            >
              <Bookmark
                className={cn("size-4", isSaved && "fill-amber-300")}
                aria-hidden
              />
            </button>

            <button
              type="button"
              onClick={onToggleCaptions}
              aria-pressed={captionsEnabled}
              aria-label={
                captionsEnabled ? "Disable captions" : "Enable captions"
              }
              className={cn(
                "flex size-9 items-center justify-center rounded-full ring-1 backdrop-blur-md transition-all active:scale-90 cursor-pointer",
                captionsEnabled
                  ? "bg-white text-black ring-white"
                  : "bg-white/12 text-white ring-white/15 hover:bg-white/20"
              )}
            >
              <Captions className="size-4" aria-hidden />
            </button>

            <button
              type="button"
              onClick={onToggleRotate}
              aria-label="Rotate back to portrait"
              title="Rotate back to portrait (R)"
              className="flex h-9 items-center gap-1.5 rounded-full bg-white/15 px-3 text-xs font-medium text-white ring-1 ring-white/20 backdrop-blur-md transition-all hover:bg-white/25 cursor-pointer"
            >
              <Minimize2 className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">Portrait</span>
            </button>

            <Link
              href={card.readHref}
              onClick={() => onReadClick(card)}
              className="flex h-9 items-center gap-1.5 rounded-full bg-[#ff4d5a] px-3.5 text-xs font-semibold text-white shadow-[0_6px_20px_-4px_rgba(255,77,90,0.65)] transition-all hover:bg-[#ff3645] active:scale-95"
            >
              <BookOpen className="size-3.5" aria-hidden />
              <span>Read</span>
            </Link>
          </nav>
        </div>
      ) : (
        <div className="absolute inset-x-0 bottom-0 z-20 flex items-end gap-3 px-3.5 pb-5">
          {/* Left Metadata Column */}
          <div className="min-w-0 flex-1">
            {/* Status Row */}
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[11px] leading-none">
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-1 font-medium tracking-tight backdrop-blur-md",
                  isDueReview
                    ? "bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/45"
                    : "bg-white/15 text-white/95"
                )}
              >
                {statusPillLabel}
              </span>
              <span className="inline-flex items-center rounded-full bg-[#ff4d5a]/92 px-2 py-1 font-semibold tracking-tight text-white">
                {kindBadgeLabel}
              </span>
              {originPill ? (
                <span
                  data-scroll-origin={originPill.kind}
                  className={cn(
                    "inline-flex max-w-[180px] items-center truncate rounded-full px-2 py-1 tracking-tight backdrop-blur-md",
                    originPill.kind === "ai"
                      ? "bg-violet-400/18 font-medium text-violet-100 ring-1 ring-violet-300/35"
                      : "bg-sky-400/15 font-mono text-[10px] font-medium text-sky-200 ring-1 ring-sky-300/30"
                  )}
                >
                  {originPill.label}
                </span>
              ) : null}
              <span className="font-mono text-[11px] text-white/55 tabular-nums">
                {durationCue}
              </span>
            </div>

            {/* Title */}
            <h2 className="mb-1.5 text-[17px] leading-tight font-bold text-balance text-white">
              <Link
                href={card.readHref}
                onClick={() => onReadClick(card)}
                className="hover:underline decoration-white/50 underline-offset-4"
              >
                {card.title}
              </Link>
            </h2>

            {/* Tag Pills */}
            {allPills.length > 0 ? (
              <ul
                aria-label="Card topics and tags"
                className="mb-2 flex flex-wrap items-center gap-1.5"
              >
                {visiblePills.map((pill) => (
                  <li
                    key={pill}
                    className="rounded-full border border-white/15 bg-black/45 px-2 py-0.5 text-[11px] font-medium text-white/80 backdrop-blur-sm"
                  >
                    {pill}
                  </li>
                ))}
                {hiddenPillCount > 0 ? (
                  <li>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTagsExpanded((v) => !v);
                      }}
                      className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/90 transition-colors hover:bg-white/20 cursor-pointer"
                    >
                      {isTagsExpanded
                        ? "show less"
                        : `+${hiddenPillCount} more`}
                    </button>
                  </li>
                ) : null}
              </ul>
            ) : null}

            {/* Summary with inline more / less toggle */}
            <div className="text-[13.5px] leading-snug text-white/80">
              <p
                className={cn(
                  "transition-all",
                  !isSummaryExpanded && "line-clamp-2",
                  isSummaryExpanded && "max-h-32 overflow-y-auto pr-1"
                )}
              >
                {card.summary}
              </p>
              {summaryHasMore ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSummaryExpanded((v) => !v);
                  }}
                  className="mt-0.5 inline-block text-[12px] font-semibold text-white/90 underline decoration-white/35 underline-offset-2 transition-colors hover:text-white cursor-pointer"
                >
                  {isSummaryExpanded ? "less" : "more"}
                </button>
              ) : null}
            </div>
          </div>

          {/* Right Vertical Action Rail */}
          <nav
            aria-label="Card actions"
            className="z-20 flex shrink-0 flex-col items-center gap-3 pb-0.5"
          >
            {/* 1. Like */}
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                onClick={() => onLike(card)}
                aria-pressed={isLiked}
                aria-label={isLiked ? "Unlike card" : "Like card"}
                title="Like (L)"
                className={cn(
                  "flex size-10 items-center justify-center rounded-full ring-1 backdrop-blur-md transition-all active:scale-90 cursor-pointer",
                  isLiked
                    ? "bg-[#ff4d5a]/25 text-[#ff4d5a] ring-[#ff4d5a]/65 shadow-[0_0_20px_-4px_rgba(255,77,90,0.6)]"
                    : "bg-white/12 text-white ring-white/15 hover:bg-white/22"
                )}
              >
                <Heart
                  className={cn("size-[18px]", isLiked && "fill-[#ff4d5a]")}
                  aria-hidden
                />
              </button>
              <span className="text-[11px] leading-none font-medium text-white/85">
                {isLiked ? "Liked" : "Like"}
              </span>
            </div>

            {/* 2. Save / SR */}
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                onClick={() => onSave(card)}
                aria-pressed={isSaved}
                aria-label={
                  isSaved ? "Remove saved card" : "Save for spaced review"
                }
                title="Save for spaced review (S)"
                className={cn(
                  "flex size-10 items-center justify-center rounded-full ring-1 backdrop-blur-md transition-all active:scale-90 cursor-pointer",
                  isSaved
                    ? "bg-amber-400/22 text-amber-300 ring-amber-300/65"
                    : "bg-white/12 text-white ring-white/15 hover:bg-white/22"
                )}
              >
                <Bookmark
                  className={cn("size-[18px]", isSaved && "fill-amber-300")}
                  aria-hidden
                />
              </button>
              <span className="text-[11px] leading-none font-medium text-white/85">
                {isSaved ? "Saved" : "Save"}
              </span>
            </div>

            {/* 3. Share */}
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                onClick={() => onShare(card)}
                aria-label="Share link to this card"
                title="Copy deep link"
                className="flex size-10 items-center justify-center rounded-full bg-white/12 text-white ring-1 ring-white/15 backdrop-blur-md transition-all hover:bg-white/22 active:scale-90 cursor-pointer"
              >
                <Share2 className="size-[18px]" aria-hidden />
              </button>
              <span className="text-[11px] leading-none font-medium text-white/85">
                Share
              </span>
            </div>

            {/* 4. CC */}
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                onClick={onToggleCaptions}
                aria-pressed={captionsEnabled}
                aria-label={
                  captionsEnabled ? "Disable captions" : "Enable captions"
                }
                title="Toggle captions (C)"
                className={cn(
                  "flex size-10 items-center justify-center rounded-full ring-1 backdrop-blur-md transition-all active:scale-90 cursor-pointer",
                  captionsEnabled
                    ? "bg-white text-black ring-white shadow-[0_0_18px_-4px_rgba(255,255,255,0.75)]"
                    : "bg-white/12 text-white ring-white/15 hover:bg-white/22"
                )}
              >
                <Captions className="size-[18px]" aria-hidden />
              </button>
              <span className="text-[11px] leading-none font-medium text-white/85">
                CC
              </span>
            </div>

            {/* 5. Read (Primary Coral CTA) */}
            <div className="flex flex-col items-center gap-1">
              <Link
                href={card.readHref}
                onClick={() => onReadClick(card)}
                aria-label={`Read ${card.readLabel || card.title}`}
                title={card.readLabel || "Read full C++ Atlas article"}
                className="flex size-10 items-center justify-center rounded-full bg-[#ff4d5a] text-white ring-1 ring-[#ff4d5a]/80 shadow-[0_8px_24px_-6px_rgba(255,77,90,0.75)] transition-all hover:bg-[#ff3645] active:scale-90"
              >
                <BookOpen className="size-[18px]" aria-hidden />
              </Link>
              <span className="text-[11px] leading-none font-semibold text-white">
                Read
              </span>
            </div>
          </nav>
        </div>
      )}

      {/* Bottom Edge 3px Interactive Progress Scrubber */}
      <div
        ref={scrubberRef}
        role="slider"
        tabIndex={isActive ? 0 : -1}
        aria-label="Explainer playback progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(displayProgress * 100)}
        onPointerDown={handleScrubPointerDown}
        onPointerMove={handleScrubPointerMove}
        onPointerUp={handleScrubPointerUp}
        onPointerCancel={handleScrubPointerUp}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            needsResetOnActivateRef.current = false;
            setProgress((p) => Math.max(0, p - 0.1));
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            needsResetOnActivateRef.current = false;
            setProgress((p) => Math.min(1, p + 0.1));
          }
        }}
        className="group absolute inset-x-0 bottom-0 z-30 flex h-4 items-end cursor-pointer touch-none"
      >
        <div className="h-[3px] w-full overflow-hidden bg-white/20 transition-[height] duration-150 group-hover:h-[5px]">
          <div
            className="h-full w-full origin-left bg-white/95 will-change-transform"
            style={{
              transform: `scaleX(${Math.min(1, Math.max(0, displayProgress))})`,
            }}
          />
        </div>
      </div>
    </section>
  );
}
