"use client";

import Link from "next/link";
import { useId, useMemo, useSyncExternalStore } from "react";
import { ChevronDown, ChevronUp, Map as MapIcon } from "lucide-react";
import { WorldAtlas } from "@/components/WorldAtlas";
import type { AtlasPayload } from "@/lib/atlas-data";

const MAP_COLLAPSED_STORAGE_KEY = "cpp-atlas-topics-map-collapsed-v1";
const MAP_COLLAPSED_EVENT = "cpp-atlas-topics-map-collapsed-change";

let fallbackCollapsed = false;

function getMapCollapsedSnapshot(): boolean {
  try {
    return window.localStorage.getItem(MAP_COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    return fallbackCollapsed;
  }
}

function getMapCollapsedServerSnapshot(): boolean {
  return false;
}

function subscribeMapCollapsed(callback: () => void): () => void {
  const onChange = () => callback();
  window.addEventListener("storage", onChange);
  window.addEventListener(MAP_COLLAPSED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(MAP_COLLAPSED_EVENT, onChange);
  };
}

function writeMapCollapsed(collapsed: boolean) {
  fallbackCollapsed = collapsed;
  try {
    if (collapsed) {
      window.localStorage.setItem(MAP_COLLAPSED_STORAGE_KEY, "1");
    } else {
      window.localStorage.removeItem(MAP_COLLAPSED_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors in restricted environments
  }
  window.dispatchEvent(new Event(MAP_COLLAPSED_EVENT));
}

export interface TopicsAtlasHeaderProps {
  atlas: AtlasPayload;
  highlightedSlugs: ReadonlySet<string> | null;
  activeTrackId: string | null;
  onSelectTrack: (trackId: string) => void;
  matchCount?: number;
  totalCount?: number;
  isFiltered?: boolean;
}

/**
 * Collapsible cartographic locator plate mounted above the /topics gazetteer.
 * Syncs live with filter highlights and active scroll-spy track.
 */
export function TopicsAtlasHeader({
  atlas,
  highlightedSlugs,
  activeTrackId,
  onSelectTrack,
  matchCount,
  totalCount,
  isFiltered = false,
}: TopicsAtlasHeaderProps) {
  const headingId = useId();
  const plateId = useId();

  const collapsed = useSyncExternalStore(
    subscribeMapCollapsed,
    getMapCollapsedSnapshot,
    getMapCollapsedServerSnapshot
  );

  const { trackTitleById, trackCount, topicCount } = useMemo(() => {
    const titles = new Map<string, string>();
    let topicsTotal = 0;
    for (const region of atlas.regions) {
      for (const track of region.tracks) {
        titles.set(track.id, track.title);
        topicsTotal += track.topics.length;
      }
    }
    return {
      trackTitleById: titles,
      trackCount: titles.size,
      topicCount: topicsTotal,
    };
  }, [atlas.regions]);

  const activeTrackTitle = activeTrackId
    ? (trackTitleById.get(activeTrackId) ?? null)
    : null;

  const statusText =
    isFiltered && matchCount !== undefined && totalCount !== undefined
      ? `${matchCount} of ${totalCount} matching ${totalCount === 1 ? "town" : "towns"}`
      : activeTrackTitle
        ? `Focused track: ${activeTrackTitle}`
        : `${atlas.regions.length} continents, ${trackCount} tracks, ${topicCount} towns`;

  const headerLeft = (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2
        id={headingId}
        className="inline-flex items-center gap-2 font-display text-lg font-[450] tracking-[-0.015em] text-ink"
      >
        <MapIcon className="size-4 text-ink-soft" aria-hidden />
        <span>World map</span>
      </h2>
      <span className="text-xs text-ink-soft tabular-nums">{statusText}</span>
    </div>
  );

  const headerRight = (
    <div className="flex flex-wrap items-center gap-3">
      <Link
        href="/maps"
        className="text-xs font-medium text-ink-soft underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink"
      >
        Open full World Atlas
      </Link>
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-controls={plateId}
        onClick={() => writeMapCollapsed(!collapsed)}
        className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line-strong bg-paper-raised px-3 text-xs font-medium text-ink transition-colors hover:border-ink/40 hover:bg-paper cursor-pointer"
      >
        {collapsed ? (
          <>
            <ChevronDown className="size-3.5 text-ink-soft" aria-hidden />
            <span>Show map</span>
          </>
        ) : (
          <>
            <ChevronUp className="size-3.5 text-ink-soft" aria-hidden />
            <span>Hide map</span>
          </>
        )}
      </button>
    </div>
  );

  return (
    <section aria-labelledby={headingId} className="mb-8">
      {collapsed ? (
        <div className="rounded-[3px] border border-line-strong bg-paper-raised p-[5px]">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[2px] border border-line bg-paper-raised px-4 py-2.5 sm:px-5">
            {headerLeft}
            {headerRight}
          </div>
        </div>
      ) : (
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-0.5">
          {headerLeft}
          {headerRight}
        </div>
      )}

      <div id={plateId} hidden={collapsed}>
        {!collapsed ? (
          <WorldAtlas
            mode="locator"
            regions={atlas.regions}
            map={atlas.map}
            highlightedSlugs={highlightedSlugs}
            activeTrackId={activeTrackId}
            onSelectTrack={onSelectTrack}
          />
        ) : null}
      </div>
    </section>
  );
}
