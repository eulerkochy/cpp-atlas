"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { TrackGroup } from "@/lib/track-groups";

export interface ContentsTrack {
  id: string;
  title: string;
  /** Topics in this track that the current filters show. */
  count: number;
}

/** Share of the viewport height at which the reading line sits. */
const READING_LINE = 0.35;

/**
 * Scroll-spy over the track sections. The current track is the last section
 * whose top has passed a reading line a third of the way down the viewport
 * (the last one once the page is scrolled to the end). Two observers trigger
 * the measurement: one on the reading line, for ordinary scrolling, and one
 * on the whole viewport, for jumps that skip past the line.
 */
export function useCurrentTrack(ids: readonly string[]) {
  const [current, setCurrent] = useState<string | null>(null);
  const key = ids.join("|");

  useEffect(() => {
    const order = key ? key.split("|") : [];
    const sections = order
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;

    const measure = () => {
      const line = window.innerHeight * READING_LINE;
      const root = document.documentElement;
      const atEnd = window.scrollY + window.innerHeight >= root.scrollHeight - 2;
      let next = sections[0];
      for (const section of sections) {
        if (section.getBoundingClientRect().top <= line) next = section;
      }
      if (atEnd && sections.at(-1)!.getBoundingClientRect().top < window.innerHeight) {
        next = sections.at(-1)!;
      }
      setCurrent(next.id);
    };

    const lineObserver = new IntersectionObserver(measure, {
      rootMargin: `-${READING_LINE * 100}% 0px -${100 - READING_LINE * 100 - 1}% 0px`,
    });
    const viewObserver = new IntersectionObserver(measure);
    for (const section of sections) {
      lineObserver.observe(section);
      viewObserver.observe(section);
    }
    return () => {
      lineObserver.disconnect();
      viewObserver.disconnect();
    };
  }, [key]);

  const valid = current !== null && ids.includes(current) ? current : null;
  return [valid ?? ids[0] ?? null, setCurrent] as const;
}

/** Desktop contents rail: the tracks under their region labels. */
export function ContentsRail({
  groups,
  current,
  onNavigate,
}: {
  groups: TrackGroup<ContentsTrack>[];
  current: string | null;
  onNavigate: (id: string) => void;
}) {
  const navRef = useRef<HTMLElement>(null);

  // The rail can be taller than a short viewport: keep the current entry visible.
  useEffect(() => {
    const nav = navRef.current;
    const scroller = nav?.closest("aside");
    if (!nav || !scroller || !current) return;
    const link = nav.querySelector<HTMLElement>(`a[href="#${current}"]`);
    if (!link) return;
    const box = scroller.getBoundingClientRect();
    const item = link.getBoundingClientRect();
    if (item.top < box.top) {
      scroller.scrollTop -= box.top - item.top + 24;
    } else if (item.bottom > box.bottom) {
      scroller.scrollTop += item.bottom - box.bottom + 24;
    }
  }, [current]);

  return (
    <nav ref={navRef} aria-label="Tracks" className="space-y-6">
      {groups.map((group) => (
        <div key={group.id}>
          <p className="font-display text-[0.95rem] italic tracking-[0.06em] text-ink-soft">
            {group.label}
          </p>
          <ul className="mt-2 space-y-0.5">
            {group.tracks.map((track) => {
              const isCurrent = track.id === current;
              if (track.count === 0) {
                return (
                  <li
                    key={track.id}
                    className="flex items-baseline justify-between gap-3 py-1 pl-3 text-sm text-ink-faint opacity-60"
                  >
                    <span className="min-w-0">{track.title}</span>
                    <span className="text-xs tabular-nums">0</span>
                  </li>
                );
              }
              return (
                <li key={track.id}>
                  <a
                    href={`#${track.id}`}
                    aria-current={isCurrent ? "location" : undefined}
                    onClick={() => onNavigate(track.id)}
                    className={cn(
                      "relative flex items-baseline justify-between gap-3 rounded-sm py-1 pl-3 text-sm transition-colors",
                      isCurrent
                        ? "font-medium text-ink"
                        : "text-ink-soft hover:text-ink"
                    )}
                  >
                    {isCurrent ? (
                      <span
                        aria-hidden
                        className="absolute top-1/2 left-0 h-4 w-[3px] -translate-y-1/2 rounded-full bg-sun"
                      />
                    ) : null}
                    <span className="min-w-0">{track.title}</span>
                    <span className="text-xs font-normal text-ink-faint tabular-nums">
                      {track.count}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Phone and tablet: one sticky, horizontally scrollable row of track chips. */
export function ContentsChips({
  tracks,
  current,
  onNavigate,
}: {
  tracks: ContentsTrack[];
  current: string | null;
  onNavigate: (id: string) => void;
}) {
  const rowRef = useRef<HTMLUListElement>(null);

  // Keep the current chip in view as the reader scrolls the page.
  useEffect(() => {
    const row = rowRef.current;
    if (!row || !current) return;
    const chip = row.querySelector<HTMLElement>(`[data-chip="${current}"]`);
    if (!chip) return;
    const left = chip.offsetLeft - row.offsetLeft;
    const right = left + chip.offsetWidth;
    if (left >= row.scrollLeft && right <= row.scrollLeft + row.clientWidth) {
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollTo({ left: Math.max(0, left - 16), behavior: reduce ? "auto" : "smooth" });
  }, [current]);

  return (
    <nav
      aria-label="Tracks"
      className="sticky top-[4.25rem] z-30 -mx-4 border-b border-line bg-paper/95 backdrop-blur sm:top-[4.75rem] sm:-mx-6 lg:hidden"
    >
      <ul
        ref={rowRef}
        className="relative flex gap-1.5 overflow-x-auto px-4 py-2 [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden"
      >
        {tracks.map((track) => {
          const isCurrent = track.id === current;
          const empty = track.count === 0;
          return (
            <li key={track.id} data-chip={track.id} className="shrink-0">
              {empty ? (
                <span className="inline-flex h-8 items-center rounded-full border border-line px-3 text-[0.8125rem] whitespace-nowrap text-ink-faint opacity-60">
                  {track.title}
                </span>
              ) : (
                <a
                  href={`#${track.id}`}
                  aria-current={isCurrent ? "location" : undefined}
                  onClick={() => onNavigate(track.id)}
                  className={cn(
                    "inline-flex h-8 items-center rounded-full border px-3 text-[0.8125rem] whitespace-nowrap transition-colors",
                    isCurrent
                      ? "border-ink/30 bg-sun font-medium text-ink"
                      : "border-line text-ink-soft hover:border-line-strong hover:text-ink"
                  )}
                >
                  {track.title}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
