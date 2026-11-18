"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Bookmark,
  Check,
  ChevronDown,
  ExternalLink,
  RotateCcw,
  Share2,
  X,
} from "lucide-react";
import { CopyCodeButton } from "@/components/CopyCodeButton";
import { useProgress } from "@/components/ProgressProvider";
import { Button } from "@/components/ui/button";
import { Window } from "@/components/Window";
import { highlightCppCode } from "@/lib/cpp-highlight";
import { openInGodbolt } from "@/lib/godbolt";
import { cn } from "@/lib/utils";
import {
  standardRefToUrl,
  type TopicQuizKind,
  type TopicQuizQuestion,
} from "@/types/topics";

const LETTERS = ["A", "B", "C", "D", "E"];

const KIND_LABEL: Record<TopicQuizKind, string> = {
  warmup: "Warm-up",
  tricky: "Tricky",
  standardese: "Standardese",
};

interface SessionCheck {
  selected: number;
  correct: boolean;
}

function QuizCodeBox({
  code,
  compact = false,
}: {
  code: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[var(--radius-panel)] border border-line",
        compact ? "bg-paper" : "bg-paper-raised"
      )}
    >
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 border-b border-line px-3.5",
          compact ? "bg-paper-raised/70 py-1" : "bg-paper/70 py-1.5"
        )}
      >
        <span className="font-mono text-[11px] text-ink-faint">
          snippet.cpp
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-quiz-control="godbolt"
            onClick={() => openInGodbolt(code)}
            aria-label="Open in Compiler Explorer"
            className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 font-sans text-xs font-medium text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink cursor-pointer"
          >
            <ExternalLink className="size-3" aria-hidden />
            <span>Compiler Explorer</span>
          </button>
          <span className="inline-flex" data-quiz-control="copy">
            <CopyCodeButton code={code} showGodbolt={false} />
          </span>
        </div>
      </div>
      <pre
        className={cn(
          "m-0 overflow-x-auto font-mono text-[#262626]",
          compact
            ? "px-4 py-3 text-[0.82rem] leading-[1.65]"
            : "px-5 py-4 text-[0.84rem] leading-[1.7]"
        )}
      >
        <code
          dangerouslySetInnerHTML={{
            __html: highlightCppCode(code),
          }}
        />
      </pre>
    </div>
  );
}

export function TopicQuizRunner({
  slug,
  title,
  questions,
}: {
  slug: string;
  title: string;
  questions: TopicQuizQuestion[];
}) {
  const {
    hydrated,
    answeredQuizzes,
    bookmarkedQuizzes,
    recordQuizAnswer,
    toggleQuizBookmark,
  } = useProgress();
  const containerRef = useRef<HTMLDivElement>(null);

  const [deckIds, setDeckIds] = useState<string[]>(() =>
    questions.map((q) => q.id)
  );
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [checkedMap, setCheckedMap] = useState<Record<string, SessionCheck>>(
    {}
  );
  const [localSessionOnly, setLocalSessionOnly] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "copied" | "error">(
    "idle"
  );
  const shareTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (shareTimerRef.current !== null) {
        window.clearTimeout(shareTimerRef.current);
      }
    };
  }, []);

  const deck = useMemo(() => {
    const questionById = new Map(questions.map((q) => [q.id, q]));
    return deckIds
      .map((id) => questionById.get(id))
      .filter((q): q is TopicQuizQuestion => Boolean(q));
  }, [questions, deckIds]);

  const effectiveCheckedMap = useMemo(() => {
    const map: Record<string, SessionCheck> = {};
    for (const q of questions) {
      const local = checkedMap[q.id];
      if (local) {
        map[q.id] = local;
      } else if (hydrated && !localSessionOnly) {
        const saved = answeredQuizzes[q.id];
        if (saved) {
          map[q.id] = {
            selected: saved.selectedIndex,
            correct: saved.correct,
          };
        }
      }
    }
    return map;
  }, [questions, checkedMap, hydrated, localSessionOnly, answeredQuizzes]);

  const current = deck[index] ?? deck[0];
  const currentCheck = current ? effectiveCheckedMap[current.id] : undefined;
  const isChecked = Boolean(currentCheck);
  const effectiveSelected = isChecked
    ? (currentCheck?.selected ?? null)
    : selected;
  const isLast = index >= deck.length - 1;
  const isBookmarked =
    hydrated && current ? bookmarkedQuizzes.includes(current.id) : false;

  const handleCheck = useCallback(() => {
    if (!current || effectiveSelected === null || isChecked) return;
    const isCorrect = effectiveSelected === current.answer;
    setCheckedMap((prev) => ({
      ...prev,
      [current.id]: { selected: effectiveSelected, correct: isCorrect },
    }));
    recordQuizAnswer(current.id, effectiveSelected, isCorrect);
  }, [current, effectiveSelected, isChecked, recordQuizAnswer]);

  const handleNext = useCallback(() => {
    if (!isChecked) return;
    if (isLast) {
      setShowResults(true);
      return;
    }
    const nextIdx = index + 1;
    const nextQ = deck[nextIdx];
    const nextChecked = nextQ ? effectiveCheckedMap[nextQ.id] : undefined;
    setIndex(nextIdx);
    setSelected(nextChecked ? nextChecked.selected : null);
  }, [isChecked, isLast, index, deck, effectiveCheckedMap]);

  const jumpTo = (targetIdx: number) => {
    const targetQ = deck[targetIdx];
    if (!targetQ) return;
    setShowResults(false);
    setShareState("idle");
    setIndex(targetIdx);
    const existing = effectiveCheckedMap[targetQ.id];
    setSelected(existing ? existing.selected : null);
  };

  const startOver = () => {
    setLocalSessionOnly(true);
    setDeckIds(questions.map((q) => q.id));
    setCheckedMap({});
    setIndex(0);
    setSelected(null);
    setShowResults(false);
    setShareState("idle");
  };

  const retryMissed = () => {
    const missedIds = deck
      .filter(
        (q) =>
          effectiveCheckedMap[q.id] && !effectiveCheckedMap[q.id].correct
      )
      .map((q) => q.id);
    if (missedIds.length === 0) {
      startOver();
      return;
    }
    setLocalSessionOnly(true);
    setDeckIds(missedIds);
    setCheckedMap({});
    setIndex(0);
    setSelected(null);
    setShowResults(false);
    setShareState("idle");
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const root = containerRef.current;
      // Do not intercept keyboard shortcuts when inside a hidden tab panel
      if (!root || root.offsetParent === null) return;

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable ||
          target.closest('[role="dialog"]'))
      ) {
        return;
      }

      if (showResults || !current) return;

      const selectOption = (idx: number) => {
        e.preventDefault();
        setSelected(idx);
        requestAnimationFrame(() => {
          root
            .querySelector<HTMLButtonElement>(`[data-quiz-option="${idx}"]`)
            ?.focus({ preventScroll: true });
        });
      };

      const num = Number(e.key);
      if (
        e.key >= "1" &&
        e.key <= "5" &&
        num >= 1 &&
        num <= current.options.length &&
        !isChecked
      ) {
        selectOption(num - 1);
        return;
      }

      const lower = e.key.toLowerCase();
      if (lower >= "a" && lower <= "e" && !isChecked) {
        const idx = lower.charCodeAt(0) - 97;
        if (idx >= 0 && idx < current.options.length) {
          selectOption(idx);
          return;
        }
      }

      if (lower === "s") {
        if (e.repeat) return;
        e.preventDefault();
        toggleQuizBookmark(current.id);
        return;
      }

      if (e.key === "Enter") {
        // Avoid double-triggering if focus is already on an action button or link
        if (
          target?.closest(
            "a[href], summary, [data-quiz-action], [data-quiz-control]"
          )
        ) {
          return;
        }
        const isAllowedExternalTarget =
          target === document.body ||
          target === document.documentElement ||
          Boolean(target?.closest('[role="tab"]'));
        if (
          target &&
          !isAllowedExternalTarget &&
          !root.contains(target) &&
          target.closest("a, button, summary, [role='button'], [tabindex]")
        ) {
          return;
        }

        if (!isChecked && effectiveSelected !== null) {
          e.preventDefault();
          e.stopPropagation();
          handleCheck();
        } else if (isChecked) {
          e.preventDefault();
          e.stopPropagation();
          handleNext();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    showResults,
    current,
    isChecked,
    effectiveSelected,
    handleCheck,
    handleNext,
    toggleQuizBookmark,
  ]);

  if (questions.length === 0) {
    return (
      <Window title={`${slug}.quiz`} bodyClassName="p-8 text-sm text-ink-soft">
        No quiz questions are available for {title} yet.
      </Window>
    );
  }

  const correctCount = deck.filter(
    (q) => effectiveCheckedMap[q.id]?.correct
  ).length;
  const missedCount = deck.filter((q) => {
    const chk = effectiveCheckedMap[q.id];
    return Boolean(chk && !chk.correct);
  }).length;

  const handleShareScore = async () => {
    const grid = deck
      .map((q) => (effectiveCheckedMap[q.id]?.correct ? "🟩" : "🟥"))
      .join("");
    const text = `C++ Atlas — ${title}\nCleared ${correctCount}/${deck.length} standardese traps: ${grid}\n${window.location.origin}/topics/${slug}?view=quiz`;
    if (shareTimerRef.current !== null) {
      window.clearTimeout(shareTimerRef.current);
    }
    try {
      await navigator.clipboard.writeText(text);
      setShareState("copied");
    } catch {
      setShareState("error");
    }
    shareTimerRef.current = window.setTimeout(() => {
      setShareState("idle");
      shareTimerRef.current = null;
    }, 1800);
  };

  return (
    <div ref={containerRef}>
      <Window
        as="section"
        aria-label={`${title} quiz`}
        title={`${slug}.quiz`}
        actions={
          <div className="flex items-center gap-2">
            {!showResults && current ? (
              <Button
                type="button"
                size="xs"
                variant={isBookmarked ? "secondary" : "ghost"}
                data-quiz-control="bookmark"
                onClick={() => toggleQuizBookmark(current.id)}
                aria-pressed={isBookmarked}
                className={cn(
                  "cursor-pointer",
                  isBookmarked && "bg-sun-wash border-ink/20 text-ink"
                )}
              >
                <Bookmark
                  aria-hidden
                  className="size-3.5"
                  fill={isBookmarked ? "currentColor" : "none"}
                />
                <span>{isBookmarked ? "Saved" : "Save"}</span>
              </Button>
            ) : null}
            <span className="font-mono text-xs text-ink-soft tabular-nums">
              {showResults
                ? `${correctCount}/${deck.length} correct`
                : `${index + 1} / ${deck.length}`}
            </span>
          </div>
        }
        bodyClassName="px-5 py-6 sm:px-8 sm:py-7 space-y-6"
      >
        {/* Segmented progress bar */}
        <div
          className="grid gap-1.5"
          style={{
            gridTemplateColumns: `repeat(${deck.length}, minmax(0, 1fr))`,
          }}
          role="navigation"
          aria-label="Question progress"
        >
          {deck.map((q, qi) => {
            const chk = effectiveCheckedMap[q.id];
            const isCurrent = !showResults && qi === index;
            return (
              <button
                key={q.id}
                type="button"
                data-quiz-control="progress"
                onClick={() => jumpTo(qi)}
                aria-label={`Question ${qi + 1}${
                  chk
                    ? chk.correct
                      ? ", answered correctly"
                      : ", answered incorrectly"
                    : ""
                }`}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "h-2.5 rounded-full transition-all cursor-pointer",
                  chk?.correct && "bg-[var(--right)]",
                  chk && !chk.correct && "bg-wrong",
                  !chk && isCurrent && "bg-sun",
                  !chk && !isCurrent && "bg-paper-sunk hover:bg-line-strong",
                  isCurrent && "ring-2 ring-ink ring-offset-2 ring-offset-paper-raised"
                )}
              />
            );
          })}
        </div>

        {showResults ? (
          <div className="space-y-6 py-2" aria-live="polite">
            <div className="space-y-2">
              <p className="font-mono text-xs text-ink-faint">
                Quiz complete
              </p>
              <h3 className="font-display text-3xl font-[450] tracking-[-0.025em] text-ink">
                {correctCount} of {deck.length} cleared
              </h3>
              <p className="max-w-[56ch] text-sm leading-relaxed text-ink-soft">
                {missedCount === 0
                  ? "Every standardese trap in this run was answered accurately. Your results are saved in this browser."
                  : `${missedCount} ${
                      missedCount === 1 ? "question needs" : "questions need"
                    } another look. Review the explanations below or retry just the missed ones.`}
              </p>
            </div>

            <ul className="divide-y divide-line border-y border-line">
              {deck.map((q, qi) => {
                const chk = effectiveCheckedMap[q.id];
                const ok = Boolean(chk?.correct);
                return (
                  <li key={q.id}>
                    <button
                      type="button"
                      onClick={() => jumpTo(qi)}
                      className="flex w-full items-center justify-between gap-4 py-3 text-left transition-colors hover:bg-paper cursor-pointer"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          aria-hidden
                          className={cn(
                            "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                            ok
                              ? "bg-right-wash text-[color:var(--right)]"
                              : "bg-wrong-wash text-wrong"
                          )}
                        >
                          {ok ? (
                            <Check className="size-3.5" />
                          ) : (
                            <X className="size-3.5" />
                          )}
                        </span>
                        <span className="truncate text-sm text-ink-body">
                          <span className="mr-2 font-mono text-xs text-ink-faint">
                            Q{qi + 1}
                          </span>
                          {q.prompt}
                        </span>
                      </div>
                      <span className="shrink-0 font-mono text-xs text-ink-soft">
                        {KIND_LABEL[q.kind]}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-wrap items-center gap-3">
              {missedCount > 0 ? (
                <Button
                  type="button"
                  onClick={retryMissed}
                  className="cursor-pointer bg-sun text-ink hover:bg-sun/90"
                >
                  <RotateCcw className="size-4" aria-hidden />
                  <span>Retry missed ({missedCount})</span>
                </Button>
              ) : null}
              <Button
                type="button"
                variant={missedCount > 0 ? "outline" : "default"}
                onClick={startOver}
                className="cursor-pointer"
              >
                <RotateCcw className="size-4" aria-hidden />
                <span>Start over</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                data-quiz-action="share"
                onClick={handleShareScore}
                className={cn(
                  "cursor-pointer",
                  shareState === "copied" &&
                    "border-[color:var(--right)]/40 bg-right-wash/60 text-[color:var(--right)]",
                  shareState === "error" &&
                    "border-wrong/40 bg-wrong-wash/60 text-wrong"
                )}
              >
                {shareState === "copied" ? (
                  <Check className="size-4" aria-hidden />
                ) : (
                  <Share2 className="size-4" aria-hidden />
                )}
                <span>
                  {shareState === "copied"
                    ? "Copied score card"
                    : shareState === "error"
                      ? "Copy failed"
                      : "Share score"}
                </span>
              </Button>
            </div>
          </div>
        ) : current ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-ink-faint">
                Question {index + 1} of {deck.length}
              </span>
              <span
                className={cn(
                  "inline-flex h-6 items-center rounded-[var(--radius-chip)] px-2 text-xs font-medium",
                  current.kind === "warmup" && "bg-paper-sunk text-ink-soft",
                  current.kind === "tricky" && "bg-sun-wash text-ink",
                  current.kind === "standardese" && "bg-ink text-paper"
                )}
              >
                {KIND_LABEL[current.kind]}
              </span>
              {current.refs.map((ref) => (
                <a
                  key={ref}
                  href={standardRefToUrl(ref)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-[var(--radius-chip)] border border-line bg-paper px-2 py-0.5 font-mono text-xs text-ink-soft hover:border-ink/40 hover:text-ink"
                >
                  <span>{ref}</span>
                  <ExternalLink className="size-2.5" aria-hidden />
                </a>
              ))}
            </div>

            <h3 className="font-display text-[1.45rem] leading-[1.3] font-[450] tracking-[-0.015em] text-ink text-balance">
              {current.prompt}
            </h3>

            {current.code ? <QuizCodeBox code={current.code} /> : null}

            <ul className="space-y-2.5" role="list" aria-label="Options">
              {current.options.map((opt, optionIndex) => {
                const isSelected = effectiveSelected === optionIndex;
                const isAnswer = optionIndex === current.answer;
                const state = isChecked
                  ? isAnswer
                    ? "right"
                    : isSelected
                      ? "wrong"
                      : "idle"
                  : isSelected
                    ? "picked"
                    : "idle";

                return (
                  <li key={`${current.id}-${optionIndex}`}>
                    <button
                      type="button"
                      data-quiz-option={optionIndex}
                      aria-pressed={isSelected}
                      disabled={isChecked}
                      onClick={() => !isChecked && setSelected(optionIndex)}
                      className={cn(
                        "group flex w-full items-start gap-3 rounded-2xl border px-3.5 py-3 text-left text-[0.97rem] leading-snug transition-colors duration-150",
                        !isChecked && "cursor-pointer",
                        state === "idle" &&
                          "border-line bg-paper-raised text-ink-body hover:border-line-strong hover:bg-paper",
                        state === "idle" && isChecked && "opacity-75",
                        state === "picked" &&
                          "border-ink bg-sun-wash/75 text-ink",
                        state === "right" &&
                          "border-[color:var(--right)]/40 bg-right-wash text-ink",
                        state === "wrong" &&
                          "border-wrong/40 bg-wrong-wash text-ink"
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "mt-px inline-flex size-6 shrink-0 items-center justify-center rounded-md border font-mono text-xs",
                          state === "idle" && "border-line-strong text-ink-soft",
                          state === "picked" &&
                            "border-ink bg-sun text-ink font-semibold",
                          state === "right" &&
                            "border-[var(--right)] bg-[var(--right)] text-white",
                          state === "wrong" &&
                            "border-wrong bg-wrong text-white"
                        )}
                      >
                        {state === "right" ? (
                          <Check className="size-3.5" />
                        ) : state === "wrong" ? (
                          <X className="size-3.5" />
                        ) : (
                          LETTERS[optionIndex]
                        )}
                      </span>
                      <span className="sr-only">{LETTERS[optionIndex]}. </span>
                      <span className="min-w-0 flex-1 pt-0.5">{opt}</span>
                      {isChecked && isAnswer ? (
                        <span className="sr-only"> (correct answer)</span>
                      ) : null}
                      {isChecked && isSelected && !isAnswer ? (
                        <span className="sr-only"> (your answer)</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="text-xs text-ink-faint">
                Keys:{" "}
                <kbd className="rounded border border-line bg-paper px-1 font-mono text-[10px] text-ink">
                  1-{current.options.length}
                </kbd>{" "}
                select,{" "}
                <kbd className="rounded border border-line bg-paper px-1 font-mono text-[10px] text-ink">
                  Enter
                </kbd>{" "}
                check/next,{" "}
                <kbd className="rounded border border-line bg-paper px-1 font-mono text-[10px] text-ink">
                  S
                </kbd>{" "}
                save
              </div>

              {!isChecked ? (
                <Button
                  type="button"
                  data-quiz-action="check"
                  disabled={effectiveSelected === null}
                  onClick={handleCheck}
                  className="cursor-pointer"
                >
                  Check answer
                </Button>
              ) : (
                <Button
                  type="button"
                  data-quiz-action="next"
                  onClick={handleNext}
                  className="cursor-pointer bg-sun text-ink hover:bg-sun/90"
                >
                  <span>{isLast ? "See results" : "Next question"}</span>
                  <ArrowRight className="size-4" aria-hidden />
                </Button>
              )}
            </div>

            <div aria-live="polite">
              {currentCheck ? (
                <div
                  className={cn(
                    "space-y-2.5 rounded-2xl px-4 py-4 text-[0.95rem] leading-relaxed",
                    currentCheck.correct
                      ? "bg-right-wash/65"
                      : "bg-wrong-wash/65"
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p
                      className={cn(
                        "font-semibold",
                        currentCheck.correct
                          ? "text-[color:var(--right)]"
                          : "text-wrong"
                      )}
                    >
                      {currentCheck.correct
                        ? "Correct."
                        : `Not quite. The answer is ${LETTERS[current.answer]}.`}
                    </p>
                    {current.refs.length > 0 ? (
                      <span className="font-mono text-xs text-ink-soft">
                        {current.refs.join(", ")}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-ink-body">{current.explanation}</p>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </Window>
    </div>
  );
}

export function AllQuestions({
  questions,
}: {
  questions: TopicQuizQuestion[];
}) {
  if (questions.length === 0) return null;

  return (
    <details className="group rounded-[var(--radius-panel)] border border-line bg-paper-raised px-5 py-4">
      <summary className="inline-flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
        <ChevronDown
          className="size-4 text-ink-soft transition-transform duration-150 group-open:rotate-180"
          aria-hidden
        />
        <span>All {questions.length} questions and explanations</span>
      </summary>

      <ol className="mt-5 space-y-6 border-t border-line pt-5">
        {questions.map((q, qi) => (
          <li key={q.id} className="space-y-3 border-b border-line pb-6 last:border-b-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-ink-faint">
                Q{qi + 1}
              </span>
              <span className="rounded-[var(--radius-chip)] bg-paper-sunk px-2 py-0.5 text-xs font-medium text-ink-soft">
                {KIND_LABEL[q.kind]}
              </span>
              {q.refs.map((ref) => (
                <a
                  key={ref}
                  href={standardRefToUrl(ref)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-[var(--radius-chip)] border border-line bg-paper px-2 py-0.5 font-mono text-xs text-ink-soft hover:border-ink/40 hover:text-ink"
                >
                  {ref}
                </a>
              ))}
            </div>

            <p className="font-display text-lg font-[450] text-ink">
              {q.prompt}
            </p>

            {q.code ? <QuizCodeBox code={q.code} compact /> : null}

            <ul className="space-y-1 text-sm text-ink-body">
              {q.options.map((opt, oi) => (
                <li
                  key={`${q.id}-all-${oi}`}
                  className={cn(
                    "rounded-lg px-2.5 py-1",
                    oi === q.answer && "bg-right-wash/60 font-medium text-ink"
                  )}
                >
                  <span className="mr-2 font-mono text-xs text-ink-faint">
                    {LETTERS[oi]}.
                  </span>
                  {opt}
                </li>
              ))}
            </ul>

            <p className="text-sm leading-relaxed text-ink-soft">
              <strong className="font-semibold text-ink">Explanation: </strong>
              {q.explanation}
            </p>
          </li>
        ))}
      </ol>
    </details>
  );
}
