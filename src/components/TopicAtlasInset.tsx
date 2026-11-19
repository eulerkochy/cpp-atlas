"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { TOWN_RADIUS, type MapViewBox } from "@/components/atlas-map-geometry";
import { useProgress } from "@/components/ProgressProvider";
import { cn } from "@/lib/utils";

export interface TopicAtlasInsetIsland {
  id: string;
  /** Region index within this inset so shared borders clip to same-continent neighbours. */
  r: number;
  /** Delta-encoded integer outline points `[x0, y0, dx1, dy1, ...]`. */
  pts: number[];
}

export interface TopicAtlasInsetTown {
  slug: string;
  title: string;
  minutes: number;
  x: number;
  y: number;
  simulator?: boolean;
}

export interface TopicAtlasInsetRoute {
  dir: "in" | "out";
  d: string;
  sea?: boolean;
}

export interface TopicAtlasInsetProps {
  currentSlug: string;
  islandId: string;
  islandTitle: string;
  regionLabel: string;
  viewBox: MapViewBox;
  islands: TopicAtlasInsetIsland[];
  label: {
    lines: string[];
    x: number;
    y: number;
  };
  towns: TopicAtlasInsetTown[];
  graticule: string[];
  routes: TopicAtlasInsetRoute[];
}

const round = (n: number) => Math.round(n * 10) / 10;

/** Reconstructs a closed Catmull-Rom cubic Bezier path from delta-encoded points. */
function decodeCatmullRomPath(encoded: number[]): string {
  if (encoded.length < 6) return "";
  const pts: { x: number; y: number }[] = [];
  let x = encoded[0];
  let y = encoded[1];
  pts.push({ x, y });
  for (let i = 2; i + 1 < encoded.length; i += 2) {
    x += encoded[i];
    y += encoded[i + 1];
    pts.push({ x, y });
  }
  const n = pts.length;
  let d = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1x = round(p1.x + (p2.x - p0.x) / 6);
    const c1y = round(p1.y + (p2.y - p0.y) / 6);
    const c2x = round(p2.x - (p3.x - p1.x) / 6);
    const c2y = round(p2.y - (p3.y - p1.y) / 6);
    d += `C${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }
  return `${d}Z`;
}

/**
 * Engraved local cartographic inset for a single study topic page, cropped to
 * its island and immediate neighbouring coastlines.
 */
export function TopicAtlasInset({
  currentSlug,
  islandId,
  islandTitle,
  regionLabel,
  viewBox,
  islands,
  label,
  towns,
  graticule,
  routes,
}: TopicAtlasInsetProps) {
  const rawId = useId();
  const svgPrefix = useMemo(
    () => rawId.replace(/[^a-zA-Z0-9_-]/g, "") || "inset",
    [rawId]
  );

  const { hydrated, completedTopics, bookmarkedTopics } = useProgress();
  const completedSet = useMemo(
    () => new Set(hydrated ? completedTopics : []),
    [hydrated, completedTopics]
  );
  const savedSet = useMemo(
    () => new Set(hydrated ? bookmarkedTopics : []),
    [hydrated, bookmarkedTopics]
  );

  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);
  const [focusedSlug, setFocusedSlug] = useState<string | null>(null);

  const decodedIslands = useMemo(
    () =>
      islands.map((isl) => ({
        ...isl,
        d: decodeCatmullRomPath(isl.pts),
      })),
    [islands]
  );

  const currentIdx = decodedIslands.findIndex((isl) => isl.id === islandId);
  const currentIsland = currentIdx >= 0 ? decodedIslands[currentIdx] : null;
  const laterSameRegion = useMemo(
    () =>
      currentIsland
        ? decodedIslands
            .slice(currentIdx + 1)
            .filter((other) => other.r === currentIsland.r)
        : [],
    [decodedIslands, currentIsland, currentIdx]
  );

  const activeSlug = hoveredSlug ?? focusedSlug;
  const activeTown = activeSlug
    ? (towns.find((t) => t.slug === activeSlug) ?? null)
    : null;

  return (
    <section
      aria-label={`${islandTitle} island inset map`}
      className="rounded-[3px] border border-line-strong bg-paper-raised p-[4px]"
    >
      <div className="overflow-hidden rounded-[2px] border border-line bg-paper-raised">
        <div className="flex items-baseline justify-between gap-2 border-b border-line px-2.5 py-1.5">
          <span className="min-w-0 truncate font-display text-xs italic tracking-[0.08em] text-ink-soft">
            {regionLabel}
          </span>
          <Link
            href={`/maps?topic=${currentSlug}`}
            className="shrink-0 text-[11px] font-medium text-ink-soft underline decoration-line-strong underline-offset-3 hover:text-ink hover:decoration-ink"
          >
            World map
          </Link>
        </div>

        <svg
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
          role="group"
          aria-label={`Map of ${islandTitle}`}
          className="block h-auto w-full select-none [--atlas-shallow:color-mix(in_oklab,var(--sky-wash),var(--paper-raised)_55%)] dark:[--atlas-shallow:color-mix(in_oklab,var(--sky-wash),var(--ink)_7%)]"
        >
          <defs>
            <marker
              id={`${svgPrefix}-arrow-in`}
              markerUnits="userSpaceOnUse"
              markerWidth={6}
              markerHeight={6}
              refX={13.5}
              refY={3}
              orient="auto"
            >
              <path d="M 0.5 0.8 L 5.5 3 L 0.5 5.2 Z" className="fill-ink" />
            </marker>
            <marker
              id={`${svgPrefix}-arrow-out`}
              markerUnits="userSpaceOnUse"
              markerWidth={6}
              markerHeight={6}
              refX={11.5}
              refY={3}
              orient="auto"
            >
              <path
                d="M 0.5 0.8 L 5.5 3 L 0.5 5.2 Z"
                className="fill-[var(--sun-deep)]"
              />
            </marker>
            {decodedIslands.map((isl, idx) => {
              const earlier = decodedIslands
                .slice(0, idx)
                .filter((other) => other.r === isl.r);
              return earlier.length > 0 ? (
                <clipPath key={isl.id} id={`${svgPrefix}-border-${isl.id}`}>
                  {earlier.map((other) => (
                    <path key={other.id} d={other.d} />
                  ))}
                </clipPath>
              ) : null;
            })}
            {currentIsland && laterSameRegion.length > 0 ? (
              <mask id={`${svgPrefix}-current-mask`}>
                <path d={currentIsland.d} fill="white" />
                {laterSameRegion.map((other) => (
                  <path key={other.id} d={other.d} fill="black" />
                ))}
              </mask>
            ) : null}
          </defs>

          {/* Sea */}
          <rect
            x={viewBox.x}
            y={viewBox.y}
            width={viewBox.w}
            height={viewBox.h}
            className="fill-sky-wash"
          />

          {/* Cropped graticule */}
          <g aria-hidden className="fill-none stroke-line" strokeWidth={0.85}>
            {graticule.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>

          {/* Two-step coastal shallows */}
          <g aria-hidden strokeLinejoin="round">
            {decodedIslands.map((isl) => (
              <path
                key={isl.id}
                d={isl.d}
                strokeWidth={26}
                className="fill-[var(--atlas-shallow)] stroke-[var(--atlas-shallow)] opacity-45"
              />
            ))}
            {decodedIslands.map((isl) => (
              <path
                key={isl.id}
                d={isl.d}
                strokeWidth={12}
                className="fill-[var(--atlas-shallow)] stroke-[var(--atlas-shallow)]"
              />
            ))}
          </g>

          {/* Landmasses & shared dashed continental borders */}
          <g aria-hidden strokeLinejoin="round">
            {decodedIslands.map((isl) => (
              <path
                key={isl.id}
                d={isl.d}
                strokeWidth={isl.id === islandId ? 2.6 : 2.1}
                className="fill-none stroke-ink"
              />
            ))}
            {decodedIslands.map((isl) => (
              <path
                key={isl.id}
                d={isl.d}
                className="fill-paper-raised"
              />
            ))}
            {currentIsland ? (
              <path
                d={currentIsland.d}
                mask={
                  laterSameRegion.length > 0
                    ? `url(#${svgPrefix}-current-mask)`
                    : undefined
                }
                className="fill-sun-wash"
              />
            ) : null}
            {decodedIslands.map((isl, idx) =>
              decodedIslands
                .slice(0, idx)
                .some((other) => other.r === isl.r) ? (
                <path
                  key={isl.id}
                  d={isl.d}
                  clipPath={`url(#${svgPrefix}-border-${isl.id})`}
                  strokeWidth={1}
                  strokeDasharray="5 3"
                  className="fill-none stroke-ink-soft"
                />
              ) : null
            )}
          </g>

          {/* Island name */}
          <text
            aria-hidden
            x={label.x}
            y={label.y}
            textAnchor="middle"
            fontSize={12.5}
            className="pointer-events-none font-display fill-ink/85 font-[500]"
          >
            {label.lines.map((line, i) => (
              <tspan key={line} x={label.x} dy={i === 0 ? 0 : 14}>
                {line}
              </tspan>
            ))}
          </text>

          {/* Connected prerequisite and dependent routes */}
          <g aria-hidden className="pointer-events-none fill-none">
            {routes.map((route, idx) => (
              <path
                key={`${route.dir}-${idx}`}
                d={route.d}
                strokeWidth={1.6}
                strokeDasharray={route.sea ? "4 3" : undefined}
                markerEnd={
                  route.dir === "in"
                    ? `url(#${svgPrefix}-arrow-in)`
                    : `url(#${svgPrefix}-arrow-out)`
                }
                className={
                  route.dir === "in"
                    ? "stroke-ink"
                    : "stroke-[var(--sun-deep)]"
                }
              />
            ))}
          </g>

          {/* Sibling towns and current town beacon */}
          {towns.map((town) => {
            const isCurrent = town.slug === currentSlug;
            const isCompleted = completedSet.has(town.slug);
            const isSaved = savedSet.has(town.slug);
            const radius = isCurrent ? TOWN_RADIUS * 1.1 : TOWN_RADIUS;
            const ringInner = radius + 3;
            const crossOuter = radius + 8.5;

            return (
              <Link
                key={town.slug}
                href={`/topics/${town.slug}`}
                aria-label={`${town.title}, ${town.minutes} min read${
                  isCurrent ? " (current topic)" : ""
                }${isCompleted ? ", read" : ""}`}
                aria-current={isCurrent ? "page" : undefined}
                className="group/town outline-none"
                onPointerEnter={(e) => {
                  if (e.pointerType !== "touch") {
                    setHoveredSlug(town.slug);
                  }
                }}
                onPointerLeave={() => {
                  setHoveredSlug((cur) => (cur === town.slug ? null : cur));
                }}
                onFocus={() => setFocusedSlug(town.slug)}
                onBlur={() => {
                  setFocusedSlug((cur) => (cur === town.slug ? null : cur));
                }}
              >
                <circle
                  cx={town.x}
                  cy={town.y}
                  r={10}
                  className="fill-transparent"
                />

                {isCurrent ? (
                  <g aria-hidden className="pointer-events-none">
                    <circle
                      cx={town.x}
                      cy={town.y}
                      r={radius + 5.2}
                      strokeWidth={1.1}
                      strokeDasharray="2.5 2"
                      className="fill-none stroke-[var(--sun-deep)]"
                    />
                    <circle
                      cx={town.x}
                      cy={town.y}
                      r={ringInner}
                      strokeWidth={1.25}
                      className="fill-none stroke-ink"
                    />
                    <line
                      x1={town.x}
                      y1={town.y - ringInner}
                      x2={town.x}
                      y2={town.y - crossOuter}
                      strokeWidth={1.15}
                      strokeLinecap="round"
                      className="stroke-ink"
                    />
                    <line
                      x1={town.x}
                      y1={town.y + ringInner}
                      x2={town.x}
                      y2={town.y + crossOuter}
                      strokeWidth={1.15}
                      strokeLinecap="round"
                      className="stroke-ink"
                    />
                    <line
                      x1={town.x - ringInner}
                      y1={town.y}
                      x2={town.x - crossOuter}
                      y2={town.y}
                      strokeWidth={1.15}
                      strokeLinecap="round"
                      className="stroke-ink"
                    />
                    <line
                      x1={town.x + ringInner}
                      y1={town.y}
                      x2={town.x + crossOuter}
                      y2={town.y}
                      strokeWidth={1.15}
                      strokeLinecap="round"
                      className="stroke-ink"
                    />
                  </g>
                ) : null}

                <circle
                  cx={town.x}
                  cy={town.y}
                  r={radius}
                  strokeWidth={isCurrent ? 1.5 : 1.25}
                  className={cn(
                    "origin-center transition-transform duration-150 [transform-box:fill-box] group-hover/town:scale-[1.35] group-hover/town:stroke-ink group-focus-visible/town:scale-[1.35] group-focus-visible/town:stroke-ink",
                    isCompleted
                      ? "fill-sun stroke-ink"
                      : isCurrent
                        ? "fill-paper-raised stroke-ink"
                        : "fill-paper-raised stroke-ink-soft"
                  )}
                />

                {town.simulator ? (
                  <>
                    {!isCurrent ? (
                      <circle
                        cx={town.x}
                        cy={town.y}
                        r={radius + 2}
                        strokeWidth={0.95}
                        className="pointer-events-none fill-none stroke-ink-soft"
                      />
                    ) : null}
                    <circle
                      cx={town.x}
                      cy={town.y}
                      r={1.45}
                      className="pointer-events-none fill-ink"
                    />
                  </>
                ) : null}

                {isSaved ? (
                  <g aria-hidden className="pointer-events-none">
                    <line
                      x1={town.x + 1.5}
                      y1={town.y - radius - 0.5}
                      x2={town.x + 1.5}
                      y2={town.y - radius - 8}
                      strokeWidth={1.1}
                      className="stroke-ink"
                    />
                    <path
                      d={`M${town.x + 1.5} ${town.y - radius - 8}L${town.x + 6.5} ${town.y - radius - 5.9}L${town.x + 1.5} ${town.y - radius - 3.8}Z`}
                      className="fill-ink"
                    />
                  </g>
                ) : null}

                <circle
                  cx={town.x}
                  cy={town.y}
                  r={9.5}
                  strokeWidth={1.4}
                  className="fill-none stroke-ink opacity-0 group-focus-visible/town:opacity-100"
                />
              </Link>
            );
          })}
        </svg>

        <div className="flex items-center justify-between gap-2 border-t border-line px-2.5 py-1.5 text-xs">
          <span
            className={cn(
              "min-w-0 truncate",
              activeTown ? "font-medium text-ink" : "text-ink-soft"
            )}
          >
            {activeTown ? activeTown.title : islandTitle}
          </span>
          <span className="shrink-0 text-ink-faint tabular-nums">
            {activeTown
              ? `${activeTown.minutes} min`
              : `${towns.length} ${towns.length === 1 ? "topic" : "topics"}`}
          </span>
        </div>
      </div>
    </section>
  );
}
