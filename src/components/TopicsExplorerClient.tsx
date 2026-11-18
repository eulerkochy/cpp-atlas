"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { useProgress } from "@/components/ProgressProvider";
import { TrackList } from "@/components/TrackList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { TopicSummary, TrackWithTopics } from "@/types/topics";

type TopicFilter = "all" | "next-up" | "simulator" | "saved" | "completed";

function isTopicNextUp(
  topic: TopicSummary,
  completedSet: ReadonlySet<string>,
  knownSlugs: ReadonlySet<string>
): boolean {
  return (
    !completedSet.has(topic.slug) &&
    topic.prerequisites.every(
      (pre) => !knownSlugs.has(pre) || completedSet.has(pre)
    )
  );
}

function matchesQuery(topic: TopicSummary, q: string): boolean {
  if (!q) return true;
  if (topic.title.toLowerCase().includes(q)) return true;
  if (topic.summary.toLowerCase().includes(q)) return true;
  if (topic.trackTitle.toLowerCase().includes(q)) return true;
  if (topic.slug.toLowerCase().includes(q)) return true;
  if (topic.standard.some((clause) => clause.toLowerCase().includes(q))) {
    return true;
  }
  if (
    topic.cppreference.some(
      (ref) =>
        ref.path.toLowerCase().includes(q) ||
        ref.href.toLowerCase().includes(q) ||
        ref.title.toLowerCase().includes(q)
    )
  ) {
    return true;
  }
  return false;
}

export function TopicsExplorerClient({
  tracks,
}: {
  tracks: TrackWithTopics[];
}) {
  const { hydrated, completedTopics, bookmarkedTopics } = useProgress();
  const [filter, setFilter] = useState<TopicFilter>("all");
  const [query, setQuery] = useState("");

  const activeTracks = useMemo(
    () => tracks.filter((t) => t.topics.length > 0),
    [tracks]
  );

  const { allTopics, knownSlugs, completedSet, savedSet } = useMemo(() => {
    const flat = activeTracks.flatMap((t) => t.topics);
    return {
      allTopics: flat,
      knownSlugs: new Set(flat.map((t) => t.slug)),
      completedSet: new Set(hydrated ? completedTopics : []),
      savedSet: new Set(hydrated ? bookmarkedTopics : []),
    };
  }, [activeTracks, hydrated, completedTopics, bookmarkedTopics]);

  const counts = useMemo(() => {
    let nextUp = 0;
    let simulator = 0;
    let saved = 0;
    let completed = 0;

    for (const topic of allTopics) {
      if (isTopicNextUp(topic, completedSet, knownSlugs)) nextUp++;
      if (topic.simulator) simulator++;
      if (savedSet.has(topic.slug)) saved++;
      if (completedSet.has(topic.slug)) completed++;
    }

    return {
      all: allTopics.length,
      "next-up": nextUp,
      simulator,
      saved,
      completed,
    };
  }, [allTopics, knownSlugs, completedSet, savedSet]);

  const normalizedQuery = query.trim().toLowerCase();
  const isDefaultView = filter === "all" && normalizedQuery.length === 0;

  const filteredTracks = useMemo(() => {
    if (isDefaultView) return activeTracks;

    return activeTracks
      .map((track) => ({
        ...track,
        topics: track.topics.filter((topic) => {
          if (
            filter === "next-up" &&
            !isTopicNextUp(topic, completedSet, knownSlugs)
          ) {
            return false;
          }
          if (filter === "simulator" && !topic.simulator) return false;
          if (filter === "saved" && !savedSet.has(topic.slug)) return false;
          if (filter === "completed" && !completedSet.has(topic.slug)) {
            return false;
          }
          return matchesQuery(topic, normalizedQuery);
        }),
      }))
      .filter((track) => track.topics.length > 0);
  }, [
    isDefaultView,
    activeTracks,
    filter,
    normalizedQuery,
    savedSet,
    completedSet,
    knownSlugs,
  ]);

  const matchCount = useMemo(
    () => filteredTracks.reduce((sum, tr) => sum + tr.topics.length, 0),
    [filteredTracks]
  );

  const filterPills: { key: TopicFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "next-up", label: "Next up", count: counts["next-up"] },
    { key: "simulator", label: "With simulator", count: counts.simulator },
    { key: "saved", label: "Saved", count: counts.saved },
    { key: "completed", label: "Completed", count: counts.completed },
  ];

  const resetFilters = () => {
    setFilter("all");
    setQuery("");
  };

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-4 border-y border-line py-5 lg:flex-row lg:items-center lg:justify-between">
        <div
          role="group"
          aria-label="Filter topics"
          className="flex flex-wrap items-center gap-1.5"
        >
          {filterPills.map((pill) => {
            const active = filter === pill.key;
            return (
              <Button
                key={pill.key}
                type="button"
                size="xs"
                variant={active ? "default" : "outline"}
                aria-pressed={active}
                onClick={() => setFilter(pill.key)}
                className={cn(
                  "cursor-pointer",
                  active && "bg-sun text-ink border-ink/30 hover:bg-sun/90"
                )}
              >
                <span>{pill.label}</span>
                <span className="font-mono text-[11px] opacity-75 tabular-nums">
                  {pill.count}
                </span>
              </Button>
            );
          })}
        </div>

        <div className="relative w-full lg:w-96">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-faint"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter topics by title, standard clause, or cppreference path"
            placeholder="Filter by title, [basic.lval], or /w/cpp path…"
            className="h-9 rounded-full border-line-strong bg-paper-raised pr-9 pl-9 text-sm text-ink placeholder:text-ink-faint"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search filter"
              className="absolute top-1/2 right-2.5 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-ink-faint hover:bg-ink/5 hover:text-ink cursor-pointer"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>

      {!isDefaultView ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-soft">
          <span className="tabular-nums">
            Showing {matchCount} of {allTopics.length}{" "}
            {allTopics.length === 1 ? "topic" : "topics"}
          </span>
          <button
            type="button"
            onClick={resetFilters}
            className="text-xs font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink cursor-pointer"
          >
            Reset filters
          </button>
        </div>
      ) : null}

      {isDefaultView ? (
        <TrackList headingLevel={2} tracks={tracks} />
      ) : filteredTracks.length > 0 ? (
        <TrackList headingLevel={2} tracks={filteredTracks} />
      ) : (
        <div className="rounded-[var(--radius-panel)] border border-line bg-paper-raised p-10 text-center space-y-3">
          <p className="font-display text-xl font-[450] text-ink">
            No topics match this filter yet
          </p>
          <p className="mx-auto max-w-[46ch] text-sm leading-relaxed text-ink-soft">
            {filter === "saved" && hydrated && savedSet.size === 0
              ? "Save any topic from its header bar to collect it here."
              : filter === "completed" && hydrated && completedSet.size === 0
                ? "Mark topics as read as you work through the curriculum."
                : "Try another filter pill or broaden your search query."}
          </p>
          <div className="pt-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={resetFilters}
              className="cursor-pointer"
            >
              Show all topics
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
