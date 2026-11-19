"use client";

import {
  Bookmark,
  BugPlay,
  CheckCircle2,
  ListChecks,
  Network,
} from "lucide-react";
import { useProgress } from "@/components/ProgressProvider";
import { switchReferenceView } from "@/components/ReferenceViews";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function TopicViewSwitcher({
  hasMap,
  hasDebugger = false,
  hasQuiz,
  questionCount,
}: {
  hasMap: boolean;
  hasDebugger?: boolean;
  hasQuiz: boolean;
  questionCount: number;
}) {
  if (!hasMap && !hasDebugger && !hasQuiz) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6 max-w-[var(--measure)]">
      {hasMap ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => switchReferenceView("map", true)}
          className="cursor-pointer"
        >
          <Network className="size-4" aria-hidden />
          <span>Open concept map</span>
        </Button>
      ) : null}

      {hasDebugger ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => switchReferenceView("debugger", true)}
          className="cursor-pointer"
        >
          <BugPlay className="size-4" aria-hidden />
          <span>Open debugger</span>
        </Button>
      ) : null}

      {hasQuiz ? (
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={() => switchReferenceView("quiz", true)}
          className="cursor-pointer bg-sun text-ink hover:bg-sun/90"
        >
          <ListChecks className="size-4" aria-hidden />
          <span>
            Test yourself ({questionCount}{" "}
            {questionCount === 1 ? "question" : "questions"})
          </span>
        </Button>
      ) : null}
    </div>
  );
}

export function TopicStudyActions({ slug }: { slug: string }) {
  const {
    hydrated,
    bookmarkedTopics,
    completedTopics,
    toggleTopicBookmark,
    toggleTopicCompleted,
  } = useProgress();

  const isSaved = hydrated && bookmarkedTopics.includes(slug);
  const isCompleted = hydrated && completedTopics.includes(slug);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant={isSaved ? "secondary" : "ghost"}
        size="xs"
        aria-pressed={isSaved}
        onClick={() => toggleTopicBookmark(slug)}
        className={cn(
          "cursor-pointer",
          isSaved && "bg-sun-wash border-ink/20 text-ink hover:bg-sun-wash/90"
        )}
      >
        <Bookmark
          aria-hidden
          className="size-3.5"
          fill={isSaved ? "currentColor" : "none"}
        />
        <span>{isSaved ? "Saved" : "Save topic"}</span>
      </Button>

      <Button
        type="button"
        variant={isCompleted ? "secondary" : "ghost"}
        size="xs"
        aria-pressed={isCompleted}
        onClick={() => toggleTopicCompleted(slug)}
        className={cn(
          "cursor-pointer",
          isCompleted &&
            "bg-right-wash border-[color:var(--right)]/30 text-[color:var(--right)] hover:bg-right-wash/90"
        )}
      >
        <CheckCircle2 aria-hidden className="size-3.5" />
        <span>{isCompleted ? "Completed" : "Mark read"}</span>
      </Button>
    </div>
  );
}

export function TopicStatusBadges({
  slug,
  hasSimulator = false,
  className,
}: {
  slug: string;
  hasSimulator?: boolean;
  className?: string;
}) {
  const { hydrated, bookmarkedTopics, completedTopics } = useProgress();

  const isSaved = hydrated && bookmarkedTopics.includes(slug);
  const isCompleted = hydrated && completedTopics.includes(slug);

  if (!hasSimulator && !isSaved && !isCompleted) return null;

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      {hasSimulator ? (
        <span className="rounded-[var(--radius-chip)] bg-sun-wash px-2 py-0.5 text-[11px] font-medium text-ink">
          Debugger
        </span>
      ) : null}
      {isSaved ? (
        <span className="rounded-[var(--radius-chip)] border border-ink/20 bg-sun-wash px-2 py-0.5 text-[11px] font-medium text-ink">
          Saved
        </span>
      ) : null}
      {isCompleted ? (
        <span className="rounded-[var(--radius-chip)] border border-[color:var(--right)]/25 bg-right-wash px-2 py-0.5 text-[11px] font-medium text-[color:var(--right)]">
          Done
        </span>
      ) : null}
    </span>
  );
}
