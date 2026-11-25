"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Check, CheckCircle2, ShieldAlert, X, XCircle } from "lucide-react";
import { highlightCppLines } from "./CodeWalkthroughStage";
import type { ScrollCard, TrapStageData } from "@/lib/scroll-types";

export interface TrapQuizStageProps {
  card: ScrollCard;
  stage: TrapStageData;
  isActive: boolean;
  isRotated: boolean;
  captionsEnabled: boolean;
  onTrapAnswer?: (card: ScrollCard, selectedIndex: number, isCorrect: boolean) => void;
  existingTrapResult?: { selectedIndex: number; isCorrect: boolean } | null;
}

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

function renderInlineCode(text: string) {
  const parts = text.split(/`([^`]+)`/g);
  if (parts.length === 1) return text;

  return parts.map((part, idx) =>
    idx % 2 === 1 ? (
      <code
        key={idx}
        className="rounded border border-white/12 bg-white/[0.08] px-1 py-px font-mono text-[0.92em] font-medium text-[#e0f2fe]"
      >
        {part}
      </code>
    ) : (
      <Fragment key={idx}>{part}</Fragment>
    )
  );
}

export function TrapQuizStage({
  card,
  stage,
  isActive,
  isRotated,
  captionsEnabled,
  onTrapAnswer,
  existingTrapResult,
}: TrapQuizStageProps) {
  const [localResult, setLocalResult] = useState<{
    selectedIndex: number;
    isCorrect: boolean;
  } | null>(null);

  const resolvedResult = existingTrapResult ?? localResult;
  const isAnswered = resolvedResult !== null;

  const codeLines = useMemo(
    () => (stage.code ? highlightCppLines(stage.code) : []),
    [stage.code]
  );

  const hasCode = codeLines.length > 0;
  const maxOptionLen = useMemo(
    () => stage.options.reduce((max, opt) => Math.max(max, opt.length), 0),
    [stage.options]
  );

  const useTwoColGrid =
    stage.options.length === 2 ||
    (stage.options.length === 4 && (isRotated || hasCode || maxOptionLen <= 46));

  const handleSelect = useCallback(
    (idx: number) => {
      if (isAnswered) return;
      if (idx < 0 || idx >= stage.options.length) return;
      const isCorrect = idx === stage.correctIndex;
      setLocalResult({ selectedIndex: idx, isCorrect });
      onTrapAnswer?.(card, idx, isCorrect);
    },
    [card, isAnswered, onTrapAnswer, stage.correctIndex, stage.options.length]
  );

  // Conflict-free numeric 1–4 keyboard shortcuts while active & unanswered
  // (avoids stealing global 'c' for CC or 'j'/'k'/'l'/'r'/'s' from ScrollFeedClient)
  useEffect(() => {
    if (!isActive || isAnswered) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      const digit = Number(e.key);
      if (Number.isInteger(digit) && digit >= 1 && digit <= stage.options.length) {
        e.preventDefault();
        e.stopPropagation();
        handleSelect(digit - 1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSelect, isActive, isAnswered, stage.options.length]);

  const clauseLabel = stage.clause?.trim() || "ISO C++";
  const compactAnswered = isAnswered && !isRotated;
  const visibleOptions = stage.options
    .map((option, idx) => ({ option, idx }))
    .filter(({ idx }) =>
      compactAnswered
        ? idx === stage.correctIndex || idx === resolvedResult?.selectedIndex
        : true
    );
  const answeredTwoCol = compactAnswered && visibleOptions.length === 2;

  return (
    <div
      className={`scroll-stage-grid relative flex h-full w-full flex-col ${
        compactAnswered
          ? "gap-1.5 p-2 sm:gap-2 sm:p-3"
          : "gap-1.5 p-2.5 sm:gap-2 sm:p-3.5"
      } ${captionsEnabled ? "pb-9 sm:pb-10" : ""}`}
    >
      {/* Top Trap Bar */}
      <div className="flex shrink-0 items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded border border-[#ff4d5a]/40 bg-[#ff4d5a]/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-[#ff6b76] sm:text-[10px]">
            <ShieldAlert className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
            Trap Check
          </span>
          {!isAnswered ? (
            <span className="hidden font-mono text-[9px] text-white/45 sm:inline">
              Tap or press 1–{stage.options.length}
            </span>
          ) : null}
        </div>

        {/* ISO Clause pill: subtle hint before answer, bright citation once answered */}
        <span
          className={`max-w-[56%] shrink-0 truncate rounded border px-1.5 py-0.5 font-mono text-[9px] font-medium transition-all duration-300 sm:text-[10px] ${
            isAnswered
              ? resolvedResult.isCorrect
                ? "border-[#34d399]/45 bg-[#34d399]/15 text-[#6ee7b7]"
                : "border-[#ff4d5a]/45 bg-[#ff4d5a]/15 text-[#ff8a93]"
              : "border-white/12 bg-white/[0.04] text-white/45"
          }`}
        >
          {isAnswered ? clauseLabel : "ISO Standardese"}
        </span>
      </div>

      {/* Interactive Quiz Surface (Question + Optional Code + 1-Tap Options) */}
      <div
        data-no-pause="true"
        onClick={(e) => e.stopPropagation()}
        className={`stage-scroll flex flex-col gap-1.5 pr-0.5 sm:gap-2 ${
          compactAnswered
            ? "shrink-0 overflow-visible"
            : "min-h-0 flex-1 overflow-y-auto"
        }`}
      >
        {/* Question Stem */}
        <p
          className={`shrink-0 font-semibold leading-snug text-white ${
            isRotated
              ? "text-[13px] sm:text-[14.5px]"
              : compactAnswered
                ? "line-clamp-2 text-[10.5px] sm:text-[11.8px]"
                : hasCode
                  ? "line-clamp-2 text-[10.8px] sm:line-clamp-3 sm:text-[12px]"
                  : "text-[11.5px] sm:text-[13px]"
          }`}
        >
          {renderInlineCode(stage.question)}
        </p>

        {/* Optional Syntax-Highlighted C++ Snippet (collapsed on portrait after answering so verdict + answers never clip) */}
        {hasCode && !compactAnswered ? (
          <div
            onClick={(e) => e.stopPropagation()}
            className={`stage-scroll scroll-stage-code shrink-0 overflow-auto rounded-md border border-white/10 bg-[#080a0f]/95 px-2 py-1.5 sm:px-2.5 ${
              isRotated
                ? "max-h-[130px] text-[11.5px] leading-[1.42] sm:text-[12.5px]"
                : "max-h-[56px] text-[9.5px] leading-[1.32] sm:max-h-[82px] sm:text-[10.6px]"
            }`}
          >
            {codeLines.map((lineHtml, idx) => (
              <div key={idx} className="whitespace-pre">
                <code dangerouslySetInnerHTML={{ __html: lineHtml }} />
              </div>
            ))}
          </div>
        ) : null}

        {/* Tactile 1-Tap Options (collapses unselected distractors in portrait once answered) */}
        <div
          role="group"
          aria-label="Answer choices"
          className={`grid shrink-0 ${
            compactAnswered
              ? answeredTwoCol
                ? "grid-cols-2 gap-1.5"
                : "grid-cols-1 gap-1.5"
              : useTwoColGrid
                ? "grid-cols-2 gap-1.5"
                : "grid-cols-1 gap-1.5"
          }`}
        >
          {visibleOptions.map(({ option, idx }) => {
            const letter = OPTION_LETTERS[idx] ?? String(idx + 1);
            const isSelected = resolvedResult?.selectedIndex === idx;
            const isCorrectOption = idx === stage.correctIndex;

            let buttonStyle =
              "border-white/15 bg-white/[0.045] text-white/92 hover:border-white/35 hover:bg-white/[0.09] active:scale-[0.985] cursor-pointer";
            let badgeStyle = "border-white/20 bg-white/[0.07] text-white/75";

            if (isAnswered) {
              if (isCorrectOption) {
                buttonStyle =
                  "border-[#34d399] bg-[#34d399]/18 text-white shadow-[0_0_16px_rgba(52,211,153,0.18)] cursor-default";
                badgeStyle = "border-[#34d399] bg-[#34d399] text-black";
              } else if (isSelected) {
                buttonStyle =
                  "border-[#ff4d5a] bg-[#ff4d5a]/18 text-white shadow-[0_0_16px_rgba(255,77,90,0.2)] cursor-default";
                badgeStyle = "border-[#ff4d5a] bg-[#ff4d5a] text-white";
              } else {
                buttonStyle =
                  "border-white/8 bg-white/[0.02] text-white/40 opacity-45 cursor-default";
                badgeStyle = "border-white/10 bg-white/[0.03] text-white/35";
              }
            }

            return (
              <button
                key={`${stage.trapId}-opt-${idx}`}
                type="button"
                disabled={isAnswered}
                data-trap-option={idx}
                aria-pressed={isSelected}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelect(idx);
                }}
                className={`group flex items-start gap-1.5 rounded-md border px-2 text-left transition-all duration-200 focus-visible:outline-2 focus-visible:outline-white sm:gap-2 sm:px-2.5 ${
                  compactAnswered ? "min-h-[30px] py-1" : "min-h-[34px] py-1.5"
                } ${buttonStyle}`}
              >
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border font-mono text-[9px] font-bold transition-colors sm:h-[18px] sm:w-[18px] sm:text-[9.5px] ${badgeStyle}`}
                >
                  {isAnswered && isCorrectOption ? (
                    <Check className="h-2.5 w-2.5 stroke-[3]" />
                  ) : isAnswered && isSelected ? (
                    <X className="h-2.5 w-2.5 stroke-[3]" />
                  ) : (
                    letter
                  )}
                </span>
                <span
                  className={`min-w-0 flex-1 leading-tight ${
                    isRotated
                      ? "text-[11.5px] sm:text-[12.5px]"
                      : compactAnswered
                        ? "line-clamp-2 text-[9.6px] sm:line-clamp-3 sm:text-[10.8px]"
                        : useTwoColGrid
                          ? "text-[9.8px] sm:text-[10.8px]"
                          : "text-[10.5px] sm:text-[11.5px]"
                  }`}
                >
                  {renderInlineCode(option)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Crisp Glass Verdict Bar (revealed immediately on 1-tap answer) */}
      {isAnswered ? (
        <div
          data-no-pause="true"
          data-trap-verdict={resolvedResult.isCorrect ? "correct" : "wrong"}
          onClick={(e) => e.stopPropagation()}
          className={`stage-verdict-enter flex flex-col rounded-lg border px-2.5 py-1.5 backdrop-blur-md sm:px-3 sm:py-2 ${
            compactAnswered ? "min-h-0 flex-1" : "shrink-0"
          } ${
            resolvedResult.isCorrect
              ? "border-[#34d399]/45 bg-[#06140f]/95 shadow-[0_0_24px_rgba(52,211,153,0.12)]"
              : "border-[#ff4d5a]/45 bg-[#16070a]/95 shadow-[0_0_24px_rgba(255,77,90,0.14)]"
          }`}
        >
          <div className="mb-0.5 flex shrink-0 items-center justify-between gap-2">
            <span
              className={`inline-flex items-center gap-1 text-[10.5px] font-semibold tracking-tight sm:text-[11.5px] ${
                resolvedResult.isCorrect ? "text-[#34d399]" : "text-[#ff6b76]"
              }`}
            >
              {resolvedResult.isCorrect ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  Correct — Standardese Verified
                </>
              ) : (
                <>
                  <XCircle className="h-3.5 w-3.5 shrink-0" />
                  Trap Sprung — Answer is{" "}
                  {OPTION_LETTERS[stage.correctIndex] ?? stage.correctIndex + 1}
                </>
              )}
            </span>
            <span className="max-w-[44%] shrink-0 truncate rounded border border-white/15 bg-white/[0.06] px-1.5 py-px font-mono text-[8.5px] text-white/80 sm:text-[9.5px]">
              {clauseLabel}
            </span>
          </div>
          <p
            className={`stage-scroll overflow-y-auto text-[10px] leading-snug text-white/88 sm:text-[11px] ${
              compactAnswered ? "min-h-0 flex-1" : "max-h-[42px] sm:max-h-[54px]"
            }`}
          >
            {renderInlineCode(stage.explanation)}
          </p>
        </div>
      ) : null}
    </div>
  );
}
