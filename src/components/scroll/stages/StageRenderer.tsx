"use client";

import { useCallback, useMemo, useState } from "react";
import { CodeWalkthroughStage } from "./CodeWalkthroughStage";
import { ConceptDiagramStage } from "./ConceptDiagramStage";
import { EvolutionDiffStage } from "./EvolutionDiffStage";
import { TrapQuizStage } from "./TrapQuizStage";
import type { ScrollCaptionCue, ScrollCard } from "@/lib/scroll-types";
import "./stage.css";

export interface StageRendererProps {
  card: ScrollCard;
  isActive: boolean; // only active slide animates / plays!
  isPaused: boolean; // user tapped stage to pause
  isRotated: boolean; // landscape theater mode
  captionsEnabled: boolean; // global CC toggle
  progress: number; // 0..1 continuous playback progress owned by ScrollSlide
  onTrapAnswer?: (
    card: ScrollCard,
    selectedIndex: number,
    isCorrect: boolean
  ) => void;
  existingTrapResult?: { selectedIndex: number; isCorrect: boolean } | null;
}

function findTimedCaption(
  captions: ScrollCaptionCue[],
  currentSec: number
): string | null {
  if (!captions || captions.length === 0) return null;

  for (const cue of captions) {
    if (currentSec >= cue.startSec && currentSec < cue.endSec) {
      return cue.text;
    }
  }

  // Clamp cleanly to the first or final cue at exact boundaries (0 or durationSec)
  if (currentSec <= captions[0].startSec) {
    return captions[0].text;
  }
  const lastCue = captions[captions.length - 1];
  if (currentSec >= lastCue.startSec) {
    return lastCue.text;
  }

  // Fallback for any small gap between cues: latest cue that already started
  for (let i = captions.length - 1; i >= 0; i--) {
    if (currentSec >= captions[i].startSec) {
      return captions[i].text;
    }
  }

  return captions[0].text;
}

function resolveStageCaption(
  card: ScrollCard,
  clampedProgress: number,
  trapAnswered: boolean
): string | null {
  const { stage } = card;

  if (stage.type === "trap") {
    if (trapAnswered) {
      return stage.clause
        ? `${stage.clause}: ${stage.explanation}`
        : stage.explanation;
    }
    const currentSec = clampedProgress * Math.max(1, card.durationSec);
    return findTimedCaption(card.captions, currentSec) ?? stage.question;
  }

  const currentSec = clampedProgress * Math.max(1, card.durationSec);
  const timed = findTimedCaption(card.captions, currentSec);
  if (timed) return timed;

  // Fallback directly to active beat's caption
  const beats = stage.beats;
  if (!beats || beats.length === 0) return card.summary || null;
  const beatIndex = Math.min(
    beats.length - 1,
    Math.floor(clampedProgress * beats.length)
  );
  return beats[beatIndex]?.caption ?? card.summary ?? null;
}

function stripInlineBackticks(raw: string): string {
  return raw.replace(/`([^`]+)`/g, "$1");
}

export function StageRenderer({
  card,
  isActive,
  isPaused,
  isRotated,
  captionsEnabled,
  progress,
  onTrapAnswer,
  existingTrapResult,
}: StageRendererProps) {
  const [answeredCardId, setAnsweredCardId] = useState<string | null>(null);

  const clampedProgress = Number.isFinite(progress)
    ? Math.min(1, Math.max(0, progress))
    : 0;

  const trapAnswered =
    Boolean(existingTrapResult) || answeredCardId === card.id;

  const handleTrapAnswer = useCallback(
    (answeredCard: ScrollCard, selectedIndex: number, isCorrect: boolean) => {
      setAnsweredCardId(answeredCard.id);
      onTrapAnswer?.(answeredCard, selectedIndex, isCorrect);
    },
    [onTrapAnswer]
  );

  const activeCaption = useMemo(() => {
    if (!captionsEnabled) return null;
    const raw = resolveStageCaption(card, clampedProgress, trapAnswered);
    return raw ? stripInlineBackticks(raw).trim() : null;
  }, [captionsEnabled, card, clampedProgress, trapAnswered]);

  const shouldFreezeAnimations = !isActive || isPaused;

  return (
    <div
      data-stage-kind={card.stage.type}
      data-stage-rotated={isRotated ? "true" : "false"}
      className={`scroll-stage-root relative aspect-video h-full w-full overflow-hidden ring-1 ring-inset ring-white/[0.08] select-none ${
        shouldFreezeAnimations ? "scroll-stage-paused" : ""
      }`}
    >
      {/* Active Stage Variant */}
      {card.stage.type === "concept" ? (
        <ConceptDiagramStage
          stage={card.stage}
          progress={clampedProgress}
          isActive={isActive}
          isPaused={isPaused}
          isRotated={isRotated}
          captionsEnabled={captionsEnabled}
        />
      ) : card.stage.type === "code" ? (
        <CodeWalkthroughStage
          stage={card.stage}
          progress={clampedProgress}
          isActive={isActive}
          isPaused={isPaused}
          isRotated={isRotated}
          captionsEnabled={captionsEnabled}
        />
      ) : card.stage.type === "evolution" ? (
        <EvolutionDiffStage
          stage={card.stage}
          progress={clampedProgress}
          isActive={isActive}
          isPaused={isPaused}
          isRotated={isRotated}
          captionsEnabled={captionsEnabled}
        />
      ) : (
        <TrapQuizStage
          key={card.id}
          card={card}
          stage={card.stage}
          isActive={isActive}
          isRotated={isRotated}
          captionsEnabled={captionsEnabled}
          onTrapAnswer={handleTrapAnswer}
          existingTrapResult={existingTrapResult}
        />
      )}

      {/* AlphaXiv-style Live Closed Captions Overlay */}
      {captionsEnabled && activeCaption ? (
        <div
          aria-live="polite"
          data-scroll-caption="true"
          className="pointer-events-none absolute inset-x-0 bottom-2 z-20 flex justify-center px-3 sm:bottom-2.5 sm:px-4"
        >
          <p
            key={activeCaption}
            className={`stage-caption-enter max-w-[94%] rounded bg-black/80 px-3 py-1 text-center leading-snug text-white shadow-[0_2px_12px_rgba(0,0,0,0.7)] ring-1 ring-white/10 backdrop-blur-sm ${
              isRotated
                ? "line-clamp-2 text-[13px] sm:text-[14.5px]"
                : "line-clamp-2 text-[12px] sm:text-[13px]"
            }`}
          >
            {activeCaption}
          </p>
        </div>
      ) : null}
    </div>
  );
}
