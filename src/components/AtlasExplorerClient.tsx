"use client";

import {
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Map as MapIcon,
  Network,
  Search,
  X,
} from "lucide-react";
import { CurriculumGraph } from "@/components/CurriculumGraph";
import { MapPreview } from "@/components/MapPreview";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { WorldAtlas } from "@/components/WorldAtlas";
import type { AtlasMap } from "@/components/atlas-map-geometry";
import type { AtlasRegionData, AtlasTopicData } from "@/lib/atlas-data";
import type { TopicMapNode, TopicSummary } from "@/types/topics";

export interface AtlasExplorerClientProps {
  regions: AtlasRegionData[];
  map: AtlasMap;
  allTopicSummaries: TopicSummary[];
  mapRootsBySlug: Record<string, TopicMapNode>;
}

const ATLAS_URL_EVENT = "cppatlas:atlas-url";

interface AtlasUrlSnapshot {
  search: string;
  cameraSpec: string;
  cameraRevision: number;
}

const SERVER_URL_SNAPSHOT: AtlasUrlSnapshot = {
  search: "",
  cameraSpec: "world",
  cameraRevision: 0,
};

let cachedSnapshot: AtlasUrlSnapshot | null = null;
let currentCameraSpec = "world";
let currentCameraRevision = 0;

function readInitialCameraFromSearch(search: string): {
  cameraSpec: string;
  cameraRevision: number;
} {
  const params = new URLSearchParams(search);
  const topic = params.get("topic")?.trim();
  const region = params.get("region")?.trim();
  const track = params.get("track")?.trim();
  if (!topic && region) {
    return { cameraSpec: region, cameraRevision: 1 };
  }
  if (!topic && track) {
    return { cameraSpec: track, cameraRevision: 1 };
  }
  return { cameraSpec: "world", cameraRevision: 0 };
}

function readClientUrlSnapshot(): AtlasUrlSnapshot {
  const search = window.location.search;
  if (cachedSnapshot === null) {
    const initial = readInitialCameraFromSearch(search);
    currentCameraSpec = initial.cameraSpec;
    currentCameraRevision = initial.cameraRevision;
  }
  if (
    cachedSnapshot &&
    cachedSnapshot.search === search &&
    cachedSnapshot.cameraSpec === currentCameraSpec &&
    cachedSnapshot.cameraRevision === currentCameraRevision
  ) {
    return cachedSnapshot;
  }
  cachedSnapshot = {
    search,
    cameraSpec: currentCameraSpec,
    cameraRevision: currentCameraRevision,
  };
  return cachedSnapshot;
}

function subscribeAtlasUrl(cb: () => void) {
  const onPopState = () => {
    const params = new URLSearchParams(window.location.search);
    const topic = params.get("topic")?.trim();
    const region = params.get("region")?.trim();
    const track = params.get("track")?.trim();
    if (!topic && region) {
      currentCameraSpec = region;
      currentCameraRevision += 1;
    } else if (!topic && track) {
      currentCameraSpec = track;
      currentCameraRevision += 1;
    } else if (!topic && !region && !track) {
      currentCameraSpec = "world";
      currentCameraRevision += 1;
    }
    cb();
  };

  window.addEventListener("popstate", onPopState);
  window.addEventListener(ATLAS_URL_EVENT, cb);
  return () => {
    window.removeEventListener("popstate", onPopState);
    window.removeEventListener(ATLAS_URL_EVENT, cb);
    cachedSnapshot = null;
    currentCameraSpec = "world";
    currentCameraRevision = 0;
  };
}

function replaceAtlasUrl(
  patch: {
    topic?: string | null;
    track?: string | null;
    region?: string | null;
  },
  cameraTarget?: string
) {
  const url = new URL(window.location.href);
  if (patch.topic !== undefined) {
    if (patch.topic) url.searchParams.set("topic", patch.topic);
    else url.searchParams.delete("topic");
  }
  if (patch.track !== undefined) {
    if (patch.track) url.searchParams.set("track", patch.track);
    else url.searchParams.delete("track");
  }
  if (patch.region !== undefined) {
    if (patch.region) url.searchParams.set("region", patch.region);
    else url.searchParams.delete("region");
  }

  if (cameraTarget !== undefined) {
    currentCameraSpec = cameraTarget;
    currentCameraRevision += 1;
  }

  window.history.replaceState(null, "", url);
  window.dispatchEvent(new Event(ATLAS_URL_EVENT));
}

function matchesAtlasQuery(topic: AtlasTopicData, q: string): boolean {
  if (!q) return true;
  if (topic.title.toLowerCase().includes(q)) return true;
  if (topic.slug.toLowerCase().includes(q)) return true;
  if (topic.summary.toLowerCase().includes(q)) return true;
  if (topic.trackTitle.toLowerCase().includes(q)) return true;
  if (topic.regionLabel.toLowerCase().includes(q)) return true;
  if (topic.standard.some((clause) => clause.toLowerCase().includes(q))) {
    return true;
  }
  return topic.cppreference.some(
    (ref) =>
      ref.path.toLowerCase().includes(q) ||
      ref.href.toLowerCase().includes(q) ||
      ref.title.toLowerCase().includes(q) ||
      `/w/cpp/${ref.path}`.toLowerCase().includes(q)
  );
}

export function AtlasExplorerClient({
  regions,
  map,
  allTopicSummaries,
  mapRootsBySlug,
}: AtlasExplorerClientProps) {
  const [view, setView] = useState<"world" | "columns">("world");
  const [query, setQuery] = useState("");

  const urlSnapshot = useSyncExternalStore(
    subscribeAtlasUrl,
    readClientUrlSnapshot,
    () => SERVER_URL_SNAPSHOT
  );

  const { allTopics, topicSlugs, trackIds, regionLookup } = useMemo(() => {
    const flatTopics: AtlasTopicData[] = [];
    const slugs = new Set<string>();
    const tracks = new Set<string>();
    const regLookup = new Map<string, string>();

    for (const region of regions) {
      regLookup.set(region.id.toLowerCase(), region.id);
      regLookup.set(region.label.toLowerCase(), region.id);
      for (const track of region.tracks) {
        tracks.add(track.id);
        for (const topic of track.topics) {
          flatTopics.push(topic);
          slugs.add(topic.slug);
        }
      }
    }

    return {
      allTopics: flatTopics,
      topicSlugs: slugs,
      trackIds: tracks,
      regionLookup: regLookup,
    };
  }, [regions]);

  const { validTopicSlug, validTrackId, validRegionId } = useMemo(() => {
    const params = new URLSearchParams(urlSnapshot.search);
    const rawTopic = params.get("topic")?.trim() ?? "";
    const rawTrack = params.get("track")?.trim() ?? "";
    const rawRegion = params.get("region")?.trim() ?? "";

    const resolvedTopic = rawTopic && topicSlugs.has(rawTopic) ? rawTopic : null;
    const resolvedTrack = rawTrack && trackIds.has(rawTrack) ? rawTrack : null;
    const resolvedRegion = rawRegion
      ? (regionLookup.get(rawRegion.toLowerCase()) ?? null)
      : null;

    return {
      validTopicSlug: resolvedTopic,
      validTrackId: resolvedTrack,
      validRegionId: resolvedRegion,
    };
  }, [urlSnapshot.search, topicSlugs, trackIds, regionLookup]);

  const defaultCamera = useMemo(() => {
    const spec = urlSnapshot.cameraSpec.trim();
    if (!spec || spec === "world") return "world";
    const asRegion = regionLookup.get(spec.toLowerCase());
    if (asRegion) return asRegion;
    if (trackIds.has(spec)) return spec;
    return "world";
  }, [urlSnapshot.cameraSpec, regionLookup, trackIds]);

  const atlasKey = `${urlSnapshot.cameraRevision}:${defaultCamera}`;

  const normalizedQuery = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!normalizedQuery) return [];
    return allTopics.filter((topic) =>
      matchesAtlasQuery(topic, normalizedQuery)
    );
  }, [allTopics, normalizedQuery]);

  const highlightedSlugs = useMemo(() => {
    if (!normalizedQuery) return null;
    return new Set(matches.map((topic) => topic.slug));
  }, [normalizedQuery, matches]);

  const activeMatchIndex = useMemo(() => {
    if (!validTopicSlug || matches.length === 0) return -1;
    return matches.findIndex((topic) => topic.slug === validTopicSlug);
  }, [validTopicSlug, matches]);

  const handleSelectTopic = useCallback((slug: string | null) => {
    replaceAtlasUrl({
      topic: slug,
      track: null,
      region: null,
    });
  }, []);

  const handleSelectTrack = useCallback((trackId: string) => {
    replaceAtlasUrl({
      track: trackId,
      topic: null,
      region: null,
    });
  }, []);

  const jumpToRegion = useCallback((regionId: string) => {
    if (!regionId) {
      replaceAtlasUrl(
        { region: null, track: null, topic: null },
        "world"
      );
      return;
    }
    replaceAtlasUrl(
      { region: regionId, track: null, topic: null },
      regionId
    );
  }, []);

  const jumpToTrack = useCallback((trackId: string) => {
    if (!trackId) {
      replaceAtlasUrl(
        { track: null, region: null, topic: null },
        "world"
      );
      return;
    }
    replaceAtlasUrl(
      { track: trackId, region: null, topic: null },
      trackId
    );
  }, []);

  const handleAtlasClickCapture = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const cameraBtn = target.closest<HTMLButtonElement>(
        '[aria-label="Atlas continent cameras"] button'
      );
      if (cameraBtn) {
        const label = cameraBtn.textContent?.trim().toLowerCase() ?? "";
        if (label === "world") {
          replaceAtlasUrl({ region: null, track: null });
          return;
        }
        const regionId = regionLookup.get(label);
        if (regionId) {
          replaceAtlasUrl({ region: regionId, track: null });
        }
        return;
      }

      const resetBtn = target.closest<HTMLButtonElement>(
        'button[aria-label="Reset map zoom"]'
      );
      if (resetBtn) {
        replaceAtlasUrl({ region: null, track: null });
        return;
      }

      const seaRegion = target.closest<SVGGElement>(
        'g[aria-label^="Focus "][aria-label$=" continent"]'
      );
      if (seaRegion) {
        const aria = seaRegion.getAttribute("aria-label") ?? "";
        const label = aria
          .slice("Focus ".length, -" continent".length)
          .trim()
          .toLowerCase();
        const regionId = regionLookup.get(label);
        if (regionId) {
          replaceAtlasUrl({ region: regionId, track: null });
        }
      }
    },
    [regionLookup]
  );

  const stepMatch = useCallback(
    (delta: 1 | -1) => {
      if (matches.length === 0) return;
      const nextIndex =
        activeMatchIndex < 0
          ? delta > 0
            ? 0
            : matches.length - 1
          : (activeMatchIndex + delta + matches.length) % matches.length;
      const target = matches[nextIndex];
      if (target) {
        handleSelectTopic(target.slug);
      }
    },
    [matches, activeMatchIndex, handleSelectTopic]
  );

  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && matches.length > 0) {
      e.preventDefault();
      stepMatch(e.shiftKey ? -1 : 1);
    }
  };

  const renderTopicExtra = useCallback(
    (topic: AtlasTopicData) => {
      const root = mapRootsBySlug[topic.slug];
      return root ? <MapPreview root={root} className="h-32 w-full" /> : null;
    },
    [mapRootsBySlug]
  );

  return (
    <Tabs
      value={view}
      onValueChange={(next) => {
        if (next === "world" || next === "columns") {
          setView(next);
        }
      }}
      className="space-y-5"
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <TabsList aria-label="Atlas view">
          <TabsTrigger value="world" className="cursor-pointer">
            <MapIcon aria-hidden />
            <span>World map</span>
          </TabsTrigger>
          <TabsTrigger value="columns" className="cursor-pointer">
            <Network aria-hidden />
            <span>Dependency columns</span>
          </TabsTrigger>
        </TabsList>

        {view === "world" ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-72">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-faint"
                />
                <Input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  aria-label="Search towns by title, standard clause, or cppreference path"
                  placeholder="Title, [clause], or /w/cpp path"
                  className="h-9 rounded-full border-line-strong bg-paper-raised pr-9 pl-9 text-sm text-ink placeholder:text-ink-faint [&::-webkit-search-cancel-button]:appearance-none"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Clear search"
                    className="absolute top-1/2 right-2.5 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-ink-faint hover:bg-ink/5 hover:text-ink cursor-pointer"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                ) : null}
              </div>

              {normalizedQuery ? (
                <div className="inline-flex h-9 items-center gap-1 rounded-full border border-line-strong bg-paper-raised px-2">
                  <span className="px-1.5 font-mono text-xs text-ink-soft tabular-nums">
                    {matches.length === 0
                      ? "0 matches"
                      : activeMatchIndex >= 0
                        ? `${activeMatchIndex + 1} of ${matches.length}`
                        : `${matches.length} ${matches.length === 1 ? "match" : "matches"}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => stepMatch(-1)}
                    disabled={matches.length === 0}
                    aria-label="Previous match"
                    className="inline-flex size-6 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-paper hover:text-ink disabled:opacity-35 cursor-pointer"
                  >
                    <ChevronLeft className="size-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => stepMatch(1)}
                    disabled={matches.length === 0}
                    aria-label="Next match"
                    className="inline-flex size-6 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-paper hover:text-ink disabled:opacity-35 cursor-pointer"
                  >
                    <ChevronRight className="size-3.5" aria-hidden />
                  </button>
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              <select
                id="atlas-continent-jump"
                aria-label="Jump to continent"
                value={validRegionId ?? ""}
                onChange={(e) => jumpToRegion(e.target.value)}
                className="h-9 min-w-0 rounded-full border border-line-strong bg-paper-raised px-3.5 font-display text-[13px] italic tracking-[0.04em] text-ink focus:border-ink focus:outline-none cursor-pointer"
              >
                <option value="" className="font-sans not-italic">
                  All continents
                </option>
                {regions.map((region) => (
                  <option key={region.id} value={region.id}>
                    {region.label}
                  </option>
                ))}
              </select>

              <select
                id="atlas-track-jump"
                aria-label="Jump to track"
                value={validTrackId ?? ""}
                onChange={(e) => jumpToTrack(e.target.value)}
                className="h-9 min-w-0 rounded-full border border-line-strong bg-paper-raised px-3.5 text-xs text-ink focus:border-ink focus:outline-none cursor-pointer"
              >
                <option value="">All {map.islands.length} tracks</option>
                {regions.map((region) => (
                  <optgroup key={region.id} label={region.label}>
                    {region.tracks.map((track) => (
                      <option key={track.id} value={track.id}>
                        {track.title} ({track.topics.length})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>
        ) : null}
      </div>

      <TabsContent value="world">
        <div onClickCapture={handleAtlasClickCapture}>
          <WorldAtlas
            key={atlasKey}
            regions={regions}
            map={map}
            mode="explorer"
            highlightedSlugs={highlightedSlugs}
            activeTrackId={validTrackId}
            selectedSlug={validTopicSlug}
            defaultCamera={defaultCamera}
            onSelectTopic={handleSelectTopic}
            onSelectTrack={handleSelectTrack}
            renderTopicExtra={renderTopicExtra}
          />
        </div>
      </TabsContent>

      <TabsContent value="columns">
        {view === "columns" ? (
          <CurriculumGraph topics={allTopicSummaries} />
        ) : null}
      </TabsContent>
    </Tabs>
  );
}
