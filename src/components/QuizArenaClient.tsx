"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { RotateCcw, Shuffle, Target } from "lucide-react";
import { useProgress } from "@/components/ProgressProvider";
import { QuizModule } from "@/components/QuizModule";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ALL_QUIZZES } from "@/data/companions";
import { cn } from "@/lib/utils";
import type { QuizQuestion } from "@/types/cpp";

const TABS = ["all", "unanswered", "missed", "saved", "cppcon-stage"] as const;
type FilterTab = (typeof TABS)[number];
const QUIZ_TAB_EVENT = "cppatlas:quiztab";

function isFilterTab(value: string | null): value is FilterTab {
  return Boolean(value) && (TABS as readonly string[]).includes(value as string);
}

function readQuizTab(): FilterTab {
  if (typeof window === "undefined") return "all";
  const param = new URLSearchParams(window.location.search).get("tab");
  return isFilterTab(param) ? param : "all";
}

function subscribeQuizTab(callback: () => void) {
  window.addEventListener("popstate", callback);
  window.addEventListener(QUIZ_TAB_EVENT, callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener(QUIZ_TAB_EVENT, callback);
  };
}

function switchQuizTab(next: FilterTab) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (next === "all") url.searchParams.delete("tab");
  else url.searchParams.set("tab", next);
  window.history.replaceState(null, "", url);
  window.dispatchEvent(new Event(QUIZ_TAB_EVENT));
}

export interface QuizTrackFilter {
  id: string;
  title: string;
}

export function QuizArenaClient({
  topicQuestions = [],
  tracks = [],
}: {
  topicQuestions?: QuizQuestion[];
  tracks?: QuizTrackFilter[];
}) {
  const {
    hydrated,
    answeredQuizzes,
    bookmarkedQuizzes,
    resetProgress,
  } = useProgress();

  const allQuestions = useMemo(() => {
    const seen = new Set<string>();
    const combined: QuizQuestion[] = [];
    for (const q of topicQuestions) {
      if (!seen.has(q.id)) {
        seen.add(q.id);
        combined.push(q);
      }
    }
    for (const q of ALL_QUIZZES) {
      if (!seen.has(q.id)) {
        seen.add(q.id);
        combined.push(q);
      }
    }
    return combined;
  }, [topicQuestions]);

  const tab = useSyncExternalStore(
    subscribeQuizTab,
    readQuizTab,
    () => "all" as FilterTab
  );
  const [topicFilter, setTopicFilter] = useState<string>("all");
  const [lightningIds, setLightningIds] = useState<string[] | null>(null);

  const allQuestionIds = useMemo(
    () => new Set(allQuestions.map((q) => q.id)),
    [allQuestions]
  );

  const answeredCount = hydrated
    ? Object.keys(answeredQuizzes).filter((id) => allQuestionIds.has(id)).length
    : 0;
  const correctCount = hydrated
    ? Object.entries(answeredQuizzes).filter(
        ([id, r]) => allQuestionIds.has(id) && r.correct
      ).length
    : 0;
  const missedCount = hydrated
    ? Object.entries(answeredQuizzes).filter(
        ([id, r]) => allQuestionIds.has(id) && !r.correct
      ).length
    : 0;
  const pct =
    allQuestions.length > 0
      ? Math.round((correctCount / allQuestions.length) * 100)
      : 0;

  const filteredQuestions = useMemo(() => {
    if (lightningIds) {
      return allQuestions.filter((q) => lightningIds.includes(q.id));
    }

    return allQuestions.filter((q) => {
      if (topicFilter !== "all") {
        if (topicFilter === "reference-companions") {
          if (q.filterGroupId) return false;
        } else {
          const group = q.filterGroupId ?? `companion:${q.companionId}`;
          if (group !== topicFilter) return false;
        }
      }
      if (tab === "unanswered") {
        return hydrated ? !answeredQuizzes[q.id] : true;
      }
      if (tab === "missed") {
        return hydrated
          ? Boolean(answeredQuizzes[q.id]) && !answeredQuizzes[q.id].correct
          : false;
      }
      if (tab === "saved") {
        return hydrated ? bookmarkedQuizzes.includes(q.id) : false;
      }
      if (tab === "cppcon-stage") {
        return q.trapLevel === "cppcon-stage";
      }
      return true;
    });
  }, [
    allQuestions,
    lightningIds,
    topicFilter,
    tab,
    hydrated,
    answeredQuizzes,
    bookmarkedQuizzes,
  ]);

  const startLightningRound = () => {
    const pool = [...allQuestions];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    setLightningIds(pool.slice(0, 5).map((q) => q.id));
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-5 border-y border-line py-5 sm:flex-row sm:items-center">
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-ink">
              Cleared {correctCount} of {allQuestions.length} standard traps
            </span>
            <span className="font-mono text-ink-soft tabular-nums">
              {answeredCount} attempted ({pct}% score)
            </span>
          </div>
          <Progress value={pct} className="h-2 bg-paper-sunk" />
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={lightningIds ? "default" : "secondary"}
            onClick={
              lightningIds
                ? () => setLightningIds(null)
                : startLightningRound
            }
            className="cursor-pointer"
          >
            <Shuffle className="size-3.5" aria-hidden />
            <span>
              {lightningIds
                ? "Exit lightning round"
                : "Pick 5 random traps"}
            </span>
          </Button>

          {missedCount > 0 ? (
            <Button
              type="button"
              size="sm"
              variant={!lightningIds && tab === "missed" ? "default" : "outline"}
              onClick={() => {
                setLightningIds(null);
                switchQuizTab("missed");
              }}
              className={cn(
                "cursor-pointer",
                !lightningIds &&
                  tab === "missed" &&
                  "bg-sun text-ink border-ink/30 hover:bg-sun/90"
              )}
            >
              <Target className="size-3.5" aria-hidden />
              <span>Drill missed ({missedCount})</span>
            </Button>
          ) : null}

          {answeredCount > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={resetProgress}
              className="cursor-pointer text-xs"
            >
              <RotateCcw className="size-3.5" aria-hidden />
              <span>Reset progress</span>
            </Button>
          ) : null}
        </div>
      </div>

      {!lightningIds ? (
        <div className="space-y-4">
          <Tabs
            value={tab}
            onValueChange={(v) => {
              if (typeof v === "string" && isFilterTab(v)) {
                switchQuizTab(v);
              }
            }}
            className="w-full"
          >
            <TabsList className="max-w-full flex-wrap">
              <TabsTrigger
                value="all"
                className="h-8 px-3.5 text-xs cursor-pointer"
              >
                All traps ({allQuestions.length})
              </TabsTrigger>
              <TabsTrigger
                value="unanswered"
                className="h-8 px-3.5 text-xs cursor-pointer"
              >
                Unanswered
              </TabsTrigger>
              <TabsTrigger
                value="missed"
                className="h-8 px-3.5 text-xs cursor-pointer"
              >
                Missed ({missedCount})
              </TabsTrigger>
              <TabsTrigger
                value="saved"
                className="h-8 px-3.5 text-xs cursor-pointer"
              >
                Saved ({hydrated ? bookmarkedQuizzes.length : 0})
              </TabsTrigger>
              <TabsTrigger
                value="cppcon-stage"
                className="h-8 px-3.5 text-xs cursor-pointer"
              >
                Standardese &amp; CppCon
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="xs"
              variant={topicFilter === "all" ? "default" : "outline"}
              aria-pressed={topicFilter === "all"}
              onClick={() => setTopicFilter("all")}
              className={cn(
                "cursor-pointer",
                topicFilter === "all" &&
                  "bg-sun text-ink border-ink/30 hover:bg-sun/90"
              )}
            >
              All tracks
            </Button>
            {tracks.map((tr) => (
              <Button
                key={tr.id}
                type="button"
                size="xs"
                variant={topicFilter === tr.id ? "default" : "outline"}
                aria-pressed={topicFilter === tr.id}
                onClick={() => setTopicFilter(tr.id)}
                className={cn(
                  "cursor-pointer",
                  topicFilter === tr.id &&
                    "bg-sun text-ink border-ink/30 hover:bg-sun/90"
                )}
              >
                {tr.title}
              </Button>
            ))}
            <Button
              type="button"
              size="xs"
              variant={
                topicFilter === "reference-companions" ? "default" : "outline"
              }
              aria-pressed={topicFilter === "reference-companions"}
              onClick={() => setTopicFilter("reference-companions")}
              className={cn(
                "cursor-pointer",
                topicFilter === "reference-companions" &&
                  "bg-sun text-ink border-ink/30 hover:bg-sun/90"
              )}
            >
              Reference traps
            </Button>
          </div>
        </div>
      ) : null}

      <QuizModule
        questions={filteredQuestions}
        showTopicLink
        headingLevel={2}
      />
    </div>
  );
}
