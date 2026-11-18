"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Bookmark,
  Check,
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
import { standardRefToUrl } from "@/types/topics";
import type { QuizQuestion, TrapLevel } from "@/types/cpp";

const LETTERS = ["A", "B", "C", "D", "E"];

const TRAP_LABEL: Record<TrapLevel, string> = {
  subtle: "Warm-up",
  "standard-lawyer": "Standard lawyer",
  "cppcon-stage": "CppCon stage",
};

function hasStandardRef(clause: string): boolean {
  return (
    /\[[a-zA-Z0-9._-]+\]/.test(clause) ||
    /\b[a-z]+(?:\.[a-z0-9_]+)+\b/.test(clause)
  );
}

function StandardClauseLink({
  clause,
  asChip = false,
}: {
  clause: string;
  asChip?: boolean;
}) {
  if (hasStandardRef(clause)) {
    return (
      <a
        href={standardRefToUrl(clause)}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "inline-flex items-center gap-1 font-mono text-xs text-ink-soft transition-colors hover:text-ink",
          asChip
            ? "rounded-[var(--radius-chip)] border border-line bg-paper px-2 py-0.5 hover:border-ink/40"
            : "underline decoration-line-strong underline-offset-3 hover:decoration-ink"
        )}
      >
        <span>{clause}</span>
        <ExternalLink className="size-2.5" aria-hidden />
      </a>
    );
  }

  return (
    <span
      className={cn(
        "font-mono text-xs text-ink-soft",
        asChip &&
          "rounded-[var(--radius-chip)] border border-line bg-paper px-2 py-0.5"
      )}
    >
      {clause}
    </span>
  );
}

export function QuizModule({
  questions,
  showTopicLink = false,
  headingLevel = 3,
}: {
  questions: QuizQuestion[];
  showTopicLink?: boolean;
  headingLevel?: 2 | 3;
}) {
  const {
    hydrated,
    answeredQuizzes,
    bookmarkedQuizzes,
    recordQuizAnswer,
    clearQuizAnswer,
    toggleQuizBookmark,
  } = useProgress();
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const [shareFeedback, setShareFeedback] = useState<{
    id: string;
    status: "copied" | "error";
  } | null>(null);
  const shareTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (shareTimerRef.current !== null) {
        window.clearTimeout(shareTimerRef.current);
      }
    };
  }, []);

  const handleShareTrap = async (questionId: string) => {
    const shareUrl = `${window.location.origin}${window.location.pathname}#trap-${questionId}`;
    if (shareTimerRef.current !== null) {
      window.clearTimeout(shareTimerRef.current);
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareFeedback({ id: questionId, status: "copied" });
    } catch {
      setShareFeedback({ id: questionId, status: "error" });
    }
    shareTimerRef.current = window.setTimeout(() => {
      setShareFeedback(null);
      shareTimerRef.current = null;
    }, 1800);
  };

  if (questions.length === 0) {
    return (
      <div className="rounded-[var(--radius-window)] border border-line bg-paper-raised p-10 text-center text-sm text-ink-soft shadow-window">
        No quiz questions match this filter yet. Choose another tab or track
        filter to continue.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {questions.map((q, idx) => {
        const record = hydrated ? answeredQuizzes[q.id] : undefined;
        const isBookmarked = hydrated && bookmarkedQuizzes.includes(q.id);
        const revealed = Boolean(record);
        const isCopied =
          shareFeedback?.id === q.id && shareFeedback.status === "copied";
        const isCopyError =
          shareFeedback?.id === q.id && shareFeedback.status === "error";

        return (
          <Window
            key={q.id}
            id={`trap-${q.id}`}
            as="section"
            size="window"
            title={`${q.id}.quiz`}
            className="scroll-mt-28"
            actions={
              <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
                {showTopicLink ? (
                  <Link
                    href={q.href ?? `/w/cpp/${q.canonicalPath}`}
                    className="max-w-full truncate rounded-full px-2 py-0.5 font-mono text-xs text-ink-soft hover:bg-ink/5 hover:text-ink"
                  >
                    {q.linkLabel ?? `/w/cpp/${q.canonicalPath}`}
                  </Link>
                ) : null}
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => handleShareTrap(q.id)}
                  aria-label={`Copy link to ${q.id}`}
                  className={cn(
                    "cursor-pointer",
                    isCopied && "text-[color:var(--right)]",
                    isCopyError && "text-wrong"
                  )}
                >
                  {isCopied ? (
                    <Check className="size-3.5" aria-hidden />
                  ) : (
                    <Share2 className="size-3.5" aria-hidden />
                  )}
                  <span>
                    {isCopied
                      ? "Copied link"
                      : isCopyError
                        ? "Copy failed"
                        : "Share"}
                  </span>
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant={isBookmarked ? "secondary" : "ghost"}
                  onClick={() => toggleQuizBookmark(q.id)}
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
              </div>
            }
            bodyClassName="px-5 py-6 sm:px-8 sm:py-7 space-y-5"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-ink-faint">
                Question {idx + 1}
              </span>
              <span
                className={cn(
                  "inline-flex h-6 items-center rounded-[var(--radius-chip)] px-2 text-xs font-medium",
                  q.trapLevel === "subtle" && "bg-paper-sunk text-ink-soft",
                  q.trapLevel === "standard-lawyer" && "bg-sun-wash text-ink",
                  q.trapLevel === "cppcon-stage" && "bg-ink text-paper"
                )}
              >
                {q.difficultyLabel ?? TRAP_LABEL[q.trapLevel]}
              </span>
              <StandardClauseLink clause={q.standardClause} asChip />
            </div>

            <Heading className="font-display text-[1.4rem] leading-[1.3] font-[450] tracking-[-0.015em] text-ink text-balance">
              {q.prompt}
            </Heading>

            {q.code ? (
              <div className="overflow-hidden rounded-[var(--radius-panel)] border border-line bg-paper-raised">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-paper/70 px-3.5 py-1.5">
                  <span className="font-mono text-[11px] text-ink-faint">
                    snippet.cpp
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openInGodbolt(q.code!)}
                      aria-label="Open in Compiler Explorer"
                      className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 font-sans text-xs font-medium text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink cursor-pointer"
                    >
                      <ExternalLink className="size-3" aria-hidden />
                      <span>Compiler Explorer</span>
                    </button>
                    <CopyCodeButton code={q.code} showGodbolt={false} />
                  </div>
                </div>
                <pre className="m-0 overflow-x-auto px-5 py-4 font-mono text-[0.84rem] leading-[1.7] text-[#262626]">
                  <code
                    dangerouslySetInnerHTML={{ __html: highlightCppCode(q.code) }}
                  />
                </pre>
              </div>
            ) : null}

            <ul className="space-y-2" role="list" aria-label="Options">
              {q.options.map((opt, optionIndex) => {
                const isSelected = record?.selectedIndex === optionIndex;
                const isAnswer = optionIndex === q.correctIndex;
                const state = revealed
                  ? isAnswer
                    ? "right"
                    : isSelected
                      ? "wrong"
                      : "idle"
                  : "idle";

                return (
                  <li key={`${q.id}-${optionIndex}`}>
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() =>
                        recordQuizAnswer(q.id, optionIndex, isAnswer)
                      }
                      className={cn(
                        "group flex w-full items-start gap-3 rounded-2xl border px-3.5 py-3 text-left text-[0.97rem] leading-snug transition-colors duration-150 cursor-pointer",
                        state === "idle" &&
                          "border-line bg-paper-raised text-ink-body hover:border-line-strong hover:bg-paper",
                        state === "idle" && revealed && "opacity-75",
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
                          state === "idle" &&
                            "border-line-strong text-ink-soft",
                          state === "right" &&
                            "border-[var(--right)] bg-[var(--right)] text-white",
                          state === "wrong" && "border-wrong bg-wrong text-white"
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
                      {revealed && isAnswer ? (
                        <span className="sr-only"> (correct answer)</span>
                      ) : null}
                      {revealed && isSelected && !isAnswer ? (
                        <span className="sr-only"> (your answer)</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>

            <div aria-live="polite">
              {record ? (
                <div
                  className={cn(
                    "space-y-2.5 rounded-2xl px-4 py-4 text-[0.95rem] leading-relaxed",
                    record.correct ? "bg-right-wash/60" : "bg-wrong-wash/60"
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p
                      className={cn(
                        "font-semibold",
                        record.correct
                          ? "text-[color:var(--right)]"
                          : "text-wrong"
                      )}
                    >
                      {record.correct
                        ? "Correct."
                        : `Not quite. The answer is ${LETTERS[q.correctIndex]}.`}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <StandardClauseLink clause={q.standardClause} />
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        onClick={() => clearQuizAnswer(q.id)}
                        className="cursor-pointer text-ink-soft hover:text-ink"
                      >
                        <RotateCcw className="size-3" aria-hidden />
                        <span>Try again</span>
                      </Button>
                    </div>
                  </div>
                  <p className="text-ink-body">{q.explanation}</p>
                  {q.cppconNote ? (
                    <p className="rounded-xl bg-sun-wash/75 px-3 py-2 text-xs leading-relaxed text-ink">
                      <strong className="font-semibold">CppCon talk note: </strong>
                      {q.cppconNote}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </Window>
        );
      })}
    </div>
  );
}
