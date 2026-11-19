"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { useProgress } from "@/components/ProgressProvider";
import { TopicsAtlasHeader } from "@/components/TopicsAtlasHeader";
import {
  ContentsChips,
  ContentsRail,
  useCurrentTrack,
  type ContentsTrack,
} from "@/components/TopicsContents";
import { ReadDot, TrackList } from "@/components/TrackList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AtlasPayload } from "@/lib/atlas-data";
import { groupTracks } from "@/lib/track-groups";
import { cn } from "@/lib/utils";
import type { TopicSummary, TrackWithTopics } from "@/types/topics";

type TopicFilter = "all" | "next-up" | "saved" | "completed";

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
  atlas,
}: {
  tracks: TrackWithTopics[];
  atlas: AtlasPayload;
}) {
  const { hydrated, completedTopics, bookmarkedTopics } = useProgress();
  const [filter, setFilter] = useState<TopicFilter>("all");
  const [query, setQuery] = useState("");

  // Tracks in atlas order (region by region), empty tracks dropped.
  const activeTracks = useMemo(
    () =>
      groupTracks(tracks.filter((t) => t.topics.length > 0)).flatMap(
        (group) => group.tracks
      ),
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
    let saved = 0;
    let completed = 0;

    for (const topic of allTopics) {
      if (isTopicNextUp(topic, completedSet, knownSlugs)) nextUp++;
      if (savedSet.has(topic.slug)) saved++;
      if (completedSet.has(topic.slug)) completed++;
    }

    return {
      all: allTopics.length,
      "next-up": nextUp,
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

  const contents = useMemo(() => {
    const shown = new Map(filteredTracks.map((t) => [t.id, t.topics.length]));
    const entries: ContentsTrack[] = activeTracks.map((t) => ({
      id: t.id,
      title: t.title,
      count: shown.get(t.id) ?? 0,
    }));
    return { entries, groups: groupTracks(entries) };
  }, [activeTracks, filteredTracks]);

  const shownIds = useMemo(
    () => filteredTracks.map((t) => t.id),
    [filteredTracks]
  );
  const [currentTrack, setCurrentTrack] = useCurrentTrack(shownIds);

  const highlightedSlugs = useMemo(
    () =>
      isDefaultView
        ? null
        : new Set(filteredTracks.flatMap((t) => t.topics.map((tp) => tp.slug))),
    [isDefaultView, filteredTracks]
  );

  const handleSelectTrack = useCallback(
    (trackId: string) => {
      setCurrentTrack(trackId);
      const reduce =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document
        .getElementById(trackId)
        ?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
    },
    [setCurrentTrack]
  );

  const filterPills: { key: TopicFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "next-up", label: "Next up", count: counts["next-up"] },
    { key: "saved", label: "Saved", count: counts.saved },
    { key: "completed", label: "Completed", count: counts.completed },
  ];

  const resetFilters = () => {
    setFilter("all");
    setQuery("");
  };

  if (activeTracks.length === 0) {
    return (
      <div className="rounded-[var(--radius-panel)] border border-line bg-paper-raised p-8 text-sm text-ink-soft">
        Study topics are being prepared. Check back shortly or browse the{" "}
        <Link
          href="/w/cpp"
          className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
        >
          full C++ reference
        </Link>
        .
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-3 border-y border-line py-4 md:flex-row md:items-center md:justify-between">
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

        <div className="relative w-full md:w-80">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-faint"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter topics by title, standard clause, or cppreference path"
            placeholder="Title, [basic.lval] or /w/cpp path"
            className="h-9 rounded-full border-line-strong bg-paper-raised pr-9 pl-9 text-sm text-ink placeholder:text-ink-faint [&::-webkit-search-cancel-button]:appearance-none"
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

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 text-sm text-ink-soft">
        <p className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-2">
            <ReadDot read={false} />
            Not read yet
          </span>
          <span className="inline-flex items-center gap-2">
            <ReadDot read />
            Read
          </span>
        </p>
        {!isDefaultView ? (
          <p className="flex items-center gap-4">
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
          </p>
        ) : null}
      </div>

      <TopicsAtlasHeader
        atlas={atlas}
        highlightedSlugs={highlightedSlugs}
        activeTrackId={currentTrack}
        onSelectTrack={handleSelectTrack}
        matchCount={matchCount}
        totalCount={allTopics.length}
        isFiltered={!isDefaultView}
      />

      <div className="lg:grid lg:grid-cols-[14.5rem_minmax(0,1fr)] lg:gap-11">
        <aside className="hidden lg:sticky lg:top-24 lg:block lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto lg:pt-4 lg:pb-6">
          <p className="mb-5 font-display text-lg font-[450] text-ink">
            Contents
          </p>
          <ContentsRail
            groups={contents.groups}
            current={currentTrack}
            onNavigate={setCurrentTrack}
          />
        </aside>

        <div className="min-w-0">
          {filteredTracks.length > 0 ? (
            <>
              <ContentsChips
                tracks={contents.entries}
                current={currentTrack}
                onNavigate={setCurrentTrack}
              />
              <div className="pt-6 lg:pt-4">
                <TrackList
                  tracks={filteredTracks}
                  readSlugs={completedSet}
                  savedSlugs={savedSet}
                />
              </div>
            </>
          ) : (
            <div className="mt-6 rounded-[var(--radius-panel)] border border-line bg-paper-raised p-10 text-center space-y-3">
              <p className="font-display text-xl font-[450] text-ink">
                No topics match this filter yet
              </p>
              <p className="mx-auto max-w-[46ch] text-sm leading-relaxed text-ink-soft">
                {filter === "saved" && hydrated && savedSet.size === 0
                  ? "Save any topic from its header bar to collect it here."
                  : filter === "completed" &&
                      hydrated &&
                      completedSet.size === 0
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

          <p className="mt-10 border-t border-line pt-5 text-sm">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route handler, not a page */}
            <a
              href="/api/notebook/topics-all?download=1"
              className="text-ink-soft underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink"
            >
              Download all topics as Markdown
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
