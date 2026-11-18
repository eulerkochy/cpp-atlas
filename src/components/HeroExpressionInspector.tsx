"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Check, X } from "lucide-react";
import { useProgress } from "@/components/ProgressProvider";
import { Button, buttonVariants } from "@/components/ui/button";
import { Window } from "@/components/Window";
import { ALL_QUIZZES, COMPANION_OVERLAYS } from "@/data/companions";
import { highlightCppCode } from "@/lib/cpp-highlight";
import { cn } from "@/lib/utils";
import type { QuizQuestion, TrapLevel } from "@/types/cpp";

const LETTERS = ["A", "B", "C", "D", "E"];

const HERO_IDS = ["vc-q2", "mm-q1", "ol-q1", "vc-q3"];

const LEVEL_LABEL: Record<TrapLevel, string> = {
  subtle: "Warm-up",
  "standard-lawyer": "Standard lawyer",
  "cppcon-stage": "CppCon stage",
};

const TOPIC_SHORT_BY_ID = new Map(
  COMPANION_OVERLAYS.map((c) => [c.id, c.shortTitle])
);

const HERO_QUESTIONS: QuizQuestion[] = HERO_IDS.map((id) =>
  ALL_QUIZZES.find((q) => q.id === id)
).filter((q): q is QuizQuestion => Boolean(q));

function DifficultyChip({ level }: { level: TrapLevel }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-[var(--radius-chip)] px-2 text-xs font-medium",
        level === "subtle" && "bg-paper-sunk text-ink-soft",
        level === "standard-lawyer" && "bg-sun-wash text-ink",
        level === "cppcon-stage" && "bg-ink text-paper"
      )}
    >
      {LEVEL_LABEL[level]}
    </span>
  );
}

export function HeroExpressionInspector() {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const headingId = useId();
  const { recordQuizAnswer } = useProgress();

  const q = HERO_QUESTIONS[index] ?? ALL_QUIZZES[0];
  if (!q) return null;

  const topicShort = TOPIC_SHORT_BY_ID.get(q.companionId) ?? q.topicTitle;
  const correct = checked && selected === q.correctIndex;

  function check() {
    if (selected === null || checked) return;
    recordQuizAnswer(q.id, selected, selected === q.correctIndex);
    setChecked(true);
  }

  function next() {
    setIndex((i) => (i + 1) % HERO_QUESTIONS.length);
    setSelected(null);
    setChecked(false);
    requestAnimationFrame(() =>
      document.getElementById(headingId)?.focus({ preventScroll: true })
    );
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement;
    if (target.closest("a, input, textarea, details > summary")) return;
    const key = e.key.toLowerCase();
    if (!checked) {
      const n = "12345".indexOf(key);
      const l = "abcde".indexOf(key);
      const i = n !== -1 ? n : l;
      if (i !== -1 && i < q.options.length) {
        e.preventDefault();
        setSelected(i);
        return;
      }
    }
    if (e.key === "Enter") {
      const btn = target.closest("button");
      if (
        btn &&
        !btn.hasAttribute("data-option") &&
        !btn.hasAttribute("data-primary")
      ) {
        return;
      }
      e.preventDefault();
      if (checked) next();
      else check();
    }
  }

  return (
    <div onKeyDown={onKeyDown}>
      <Window
        as="section"
        aria-label="Try a question"
        title={`${q.companionId}.quiz`}
        actions={
          <Link
            href={`/w/cpp/${q.canonicalPath}?view=quiz`}
            className="rounded-full px-2.5 py-1 text-xs text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
          >
            From {topicShort}
          </Link>
        }
        bodyClassName="px-5 py-6 sm:px-8 sm:py-8"
      >
        <div className="grid gap-8 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:gap-10">
          <div className="min-w-0 space-y-5">
            <DifficultyChip level={q.trapLevel} />
            <h2
              id={headingId}
              tabIndex={-1}
              className="font-display text-[1.45rem] leading-[1.3] font-[450] tracking-[-0.015em] text-ink text-balance outline-none sm:text-[1.6rem]"
            >
              {q.prompt}
            </h2>
            {q.code ? (
              <div className="overflow-hidden rounded-[var(--radius-panel)] border border-line bg-paper-raised">
                <pre className="m-0 overflow-x-auto px-5 py-4 font-mono text-[0.84rem] leading-[1.7] text-[var(--code-ink)]">
                  <code
                    dangerouslySetInnerHTML={{
                      __html: highlightCppCode(q.code),
                    }}
                  />
                </pre>
              </div>
            ) : null}
          </div>

          <div className="min-w-0 space-y-4">
            <ul className="space-y-2" role="list" aria-label="Options">
              {q.options.map((opt, i) => {
                const isSel = selected === i;
                const isAnswer = i === q.correctIndex;
                const state = checked
                  ? isAnswer
                    ? "right"
                    : isSel
                      ? "wrong"
                      : "idle"
                  : isSel
                    ? "selected"
                    : "idle";
                return (
                  <li key={`${q.id}-${i}`}>
                    <button
                      type="button"
                      data-option={i}
                      aria-pressed={isSel}
                      disabled={checked}
                      onClick={() => !checked && setSelected(i)}
                      className={cn(
                        "group flex w-full items-start gap-3 rounded-2xl border px-3.5 py-3 text-left text-[0.97rem] leading-snug transition-colors duration-150 disabled:cursor-default cursor-pointer",
                        state === "idle" &&
                          "border-line bg-paper-raised text-ink-body hover:border-line-strong hover:bg-paper",
                        state === "idle" && checked && "opacity-70",
                        state === "selected" && "border-ink bg-sun-wash text-ink",
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
                          state === "selected" &&
                            "border-ink bg-ink text-paper",
                          state === "right" &&
                            "border-[var(--right)] bg-[var(--right)] text-paper-raised",
                          state === "wrong" && "border-wrong bg-wrong text-paper-raised"
                        )}
                      >
                        {state === "right" ? (
                          <Check className="size-3.5" />
                        ) : state === "wrong" ? (
                          <X className="size-3.5" />
                        ) : (
                          LETTERS[i]
                        )}
                      </span>
                      <span className="sr-only">{LETTERS[i]}. </span>
                      <span className="min-w-0 flex-1 pt-0.5">{opt}</span>
                      {checked && isAnswer ? (
                        <span className="sr-only"> (correct answer)</span>
                      ) : null}
                      {checked && isSel && !isAnswer ? (
                        <span className="sr-only"> (your answer)</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-wrap items-center gap-3">
              {checked ? (
                <>
                  {HERO_QUESTIONS.length > 1 ? (
                    <Button data-primary onClick={next}>
                      Next question
                    </Button>
                  ) : null}
                  <Link
                    href={`/w/cpp/${q.canonicalPath}`}
                    className={buttonVariants({ variant: "secondary" })}
                  >
                    Read {topicShort}
                  </Link>
                </>
              ) : (
                <Button
                  data-primary
                  onClick={check}
                  disabled={selected === null}
                >
                  Check answer
                </Button>
              )}
            </div>

            <div aria-live="polite">
              {checked ? (
                <div
                  className={cn(
                    "space-y-3 rounded-2xl px-4 py-4 text-[0.95rem] leading-relaxed",
                    correct ? "bg-right-wash/60" : "bg-wrong-wash/60"
                  )}
                >
                  <p
                    className={cn(
                      "font-semibold",
                      correct ? "text-[color:var(--right)]" : "text-wrong"
                    )}
                  >
                    {correct
                      ? "Correct."
                      : `Not quite. The answer is ${LETTERS[q.correctIndex]}.`}
                  </p>
                  <div className="text-ink-body">{q.explanation}</div>
                  <ul
                    className="flex flex-wrap gap-1.5"
                    aria-label="Standard references"
                  >
                    <li className="rounded-[var(--radius-chip)] border border-line bg-paper px-2 py-0.5 font-mono text-xs text-ink-soft">
                      {q.standardClause}
                    </li>
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </Window>
    </div>
  );
}
