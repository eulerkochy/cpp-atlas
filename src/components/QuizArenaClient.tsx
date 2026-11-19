"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { RotateCcw, Shuffle, Target } from "lucide-react";
import { useProgress } from "@/components/ProgressProvider";
import { QuizModule } from "@/components/QuizModule";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { QuizQuestion } from "@/types/cpp";

const TABS = ["all", "unanswered", "missed", "saved", "cppcon-stage"] as const;
type FilterTab = (typeof TABS)[number];
const QUIZ_TAB_EVENT = "cppatlas:quiztab";
const PAGE_SIZE = 20;

let cachedQuizBank: QuizQuestion[] | null = null;
let inflightQuizBank: Promise<QuizQuestion[]> | null = null;

function loadFullQuizBank(): Promise<QuizQuestion[]> {
  if (cachedQuizBank) {
    return Promise.resolve(cachedQuizBank);
  }
  if (inflightQuizBank) {
    return inflightQuizBank;
  }

  inflightQuizBank = fetch("/api/quiz/questions")
    .then(async (res) => {
      if (!res.ok) {
        throw new Error(`Failed to load quiz bank (${res.status})`);
      }
      const data = (await res.json()) as QuizQuestion[];
      cachedQuizBank = data;
      return data;
    })
    .finally(() => {
      inflightQuizBank = null;
    });

  return inflightQuizBank;
}

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
  initialQuestions = [],
  totalCount,
  tracks = [],
}: {
  initialQuestions?: QuizQuestion[];
  totalCount?: number;
  tracks?: QuizTrackFilter[];
}) {
  const {
    hydrated,
    answeredQuizzes,
    bookmarkedQuizzes,
    resetProgress,
  } = useProgress();

  const [fullQuestions, setFullQuestions] = useState<QuizQuestion[] | null>(
    () => cachedQuizBank
  );
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    if (fullQuestions) return;
    let cancelled = false;
    void loadFullQuizBank()
      .then((bank) => {
        if (!cancelled) {
          setFullQuestions(bank);
        }
      })
      .catch(() => {
        // Keep initialQuestions fallback if network fails
      });
    return () => {
      cancelled = true;
    };
  }, [fullQuestions]);

  const allQuestions = fullQuestions ?? initialQuestions;
  const displayTotal = fullQuestions
    ? fullQuestions.length
    : (totalCount ?? initialQuestions.length);

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
    ? Object.keys(answeredQuizzes).filter(
        (id) => !fullQuestions || allQuestionIds.has(id)
      ).length
    : 0;
  const correctCount = hydrated
    ? Object.entries(answeredQuizzes).filter(
        ([id, r]) => (!fullQuestions || allQuestionIds.has(id)) && r.correct
      ).length
    : 0;
  const missedCount = hydrated
    ? Object.entries(answeredQuizzes).filter(
        ([id, r]) => (!fullQuestions || allQuestionIds.has(id)) && !r.correct
      ).length
    : 0;
  const pct =
    displayTotal > 0 ? Math.round((correctCount / displayTotal) * 100) : 0;

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

  const visibleQuestions = lightningIds
    ? filteredQuestions
    : filteredQuestions.slice(0, visibleCount);

  const selectTab = (next: FilterTab) => {
    setVisibleCount(PAGE_SIZE);
    switchQuizTab(next);
  };

  const selectTopicFilter = (next: string) => {
    setTopicFilter(next);
    setVisibleCount(PAGE_SIZE);
  };

  const startLightningRound = async () => {
    let sourcePool = fullQuestions;
    if (!sourcePool) {
      try {
        sourcePool = await loadFullQuizBank();
        setFullQuestions(sourcePool);
      } catch {
        sourcePool = initialQuestions;
      }
    }
    const pool = [...sourcePool];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    setLightningIds(pool.slice(0, 5).map((q) => q.id));
    setVisibleCount(PAGE_SIZE);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-5 border-y border-line py-5 sm:flex-row sm:items-center">
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-ink">
              Cleared {correctCount} of {displayTotal} standard traps
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
            onClick={() => {
              if (lightningIds) {
                setLightningIds(null);
                setVisibleCount(PAGE_SIZE);
              } else {
                void startLightningRound();
              }
            }}
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
                selectTab("missed");
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
                selectTab(v);
              }
            }}
            className="w-full"
          >
            <TabsList className="max-w-full flex-wrap">
              <TabsTrigger
                value="all"
                className="h-8 px-3.5 text-xs cursor-pointer"
              >
                All traps ({displayTotal})
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
              onClick={() => selectTopicFilter("all")}
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
                onClick={() => selectTopicFilter(tr.id)}
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
              onClick={() => selectTopicFilter("reference-companions")}
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

      {!fullQuestions && (tab !== "all" || topicFilter !== "all") ? (
        <p className="text-xs text-ink-soft">Loading full question bank…</p>
      ) : null}

      <QuizModule
        questions={visibleQuestions}
        showTopicLink
        headingLevel={2}
      />

      {!lightningIds && filteredQuestions.length > visibleQuestions.length ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
          <p className="text-xs text-ink-soft tabular-nums">
            Showing {visibleQuestions.length} of {filteredQuestions.length} traps
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
              className="rounded-full cursor-pointer"
            >
              Show {Math.min(PAGE_SIZE, filteredQuestions.length - visibleQuestions.length)} more
            </Button>
            {filteredQuestions.length <= 100 ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setVisibleCount(filteredQuestions.length)}
                className="rounded-full cursor-pointer"
              >
                Show all ({filteredQuestions.length})
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
