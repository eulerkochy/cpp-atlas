"use client";

import { useProgress } from "@/components/ProgressProvider";
import { cn } from "@/lib/utils";

export function TrackProgressCount({
  questionIds,
  className,
}: {
  questionIds: string[];
  className?: string;
}) {
  const { hydrated, answeredQuizzes } = useProgress();
  if (!hydrated || questionIds.length === 0) return null;

  const answered = questionIds.filter((id) => Boolean(answeredQuizzes[id])).length;
  if (answered === 0) return null;
  const correct = questionIds.filter((id) => answeredQuizzes[id]?.correct).length;

  return (
    <span className={cn("tabular-nums text-ink-soft", className)}>
      {correct}/{questionIds.length} cleared
    </span>
  );
}
