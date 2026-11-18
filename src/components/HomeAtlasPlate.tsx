"use client";

import Link from "next/link";
import { useMemo, useState, type PointerEvent } from "react";
import {
  LABEL_LEADING,
  LABEL_SIZE,
  MAP_HEIGHT,
  MAP_WIDTH,
  TOWN_RADIUS,
  type AtlasMap,
} from "@/components/atlas-map-geometry";
import { useProgress } from "@/components/ProgressProvider";
import { cn } from "@/lib/utils";

export interface AtlasTopic {
  slug: string;
  title: string;
  minutes: number;
}

export interface AtlasRegion {
  label: string;
  tracks: { id: string; title: string; topics: AtlasTopic[] }[];
}

const DOT = "block size-[9px] rounded-full border transition-transform";
const UNREAD_DOT = "border-ink-soft";
const READ_DOT = "border-ink bg-sun";

/** Where the compass rose sits: an empty patch of sea in the south west. */
const COMPASS = { x: 96, y: 548 };

type Readout = { text: string; track: string } | null;

interface Handlers {
  show: (topic: AtlasTopic, track: string) => void;
  showTrack: (title: string, topics: number, track: string) => void;
  onPointer: (fn: () => void) => (e: PointerEvent) => void;
  clear: () => void;
}

/**
 * The home page's track map. From the md breakpoint up it is an illustrated
 * atlas plate: each track an island, each region a continent, each topic a
 * town. Narrower screens get the same data as a list.
 */
export function HomeAtlasPlate({
  regions,
  map,
}: {
  regions: AtlasRegion[];
  /** Built on the server by `buildAtlasMap(regions)`. */
  map: AtlasMap;
}) {
  const [readout, setReadout] = useState<Readout>(null);
  const { hydrated, completedTopics } = useProgress();
  // Every town stays hollow until stored progress is read, so the server and
  // first client render agree.
  const read = useMemo(
    () => new Set(hydrated ? completedTopics : []),
    [hydrated, completedTopics]
  );

  const trackCount = regions.reduce((n, r) => n + r.tracks.length, 0);
  const topicCount = regions.reduce(
    (n, r) => n + r.tracks.reduce((m, t) => m + t.topics.length, 0),
    0
  );

  const handlers: Handlers = {
    show: (topic, track) =>
      setReadout({ text: `${topic.title}, ${topic.minutes} min read`, track }),
    showTrack: (title, topics, track) =>
      setReadout({ text: `${title}, ${topics} topics`, track }),
    onPointer: (fn) => (e) => {
      if (e.pointerType !== "touch") fn();
    },
    clear: () => setReadout(null),
  };

  return (
    <div className="rounded-[3px] border border-line-strong bg-paper-raised p-[5px] text-left">
      <div className="relative overflow-hidden rounded-[2px] border border-line">
        <div className="relative md:hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-60 [background-image:linear-gradient(var(--line)_1px,transparent_1px),linear-gradient(90deg,var(--line)_1px,transparent_1px)] [background-position:-1px_-1px] [background-size:3.5rem_3.5rem]"
          />
          <AtlasList regions={regions} read={read} {...handlers} />
        </div>
        <div className="hidden md:block">
          <AtlasSvg
            map={map}
            read={read}
            liftedTrack={readout?.track ?? null}
            {...handlers}
          />
        </div>
        <div className="relative flex flex-col gap-3 border-t border-line px-6 py-4 text-sm text-ink-soft sm:flex-row sm:items-center sm:justify-between sm:px-10">
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <li className="flex items-center gap-2">
              <span aria-hidden className={cn(DOT, UNREAD_DOT)} />
              Not read yet
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden className={cn(DOT, READ_DOT)} />
              Read
            </li>
          </ul>
          <p
            aria-live="off"
            className={cn(
              "h-5 min-w-0 truncate sm:w-[24rem] sm:text-end",
              readout && "text-ink"
            )}
          >
            {readout?.text ?? `${topicCount} topics in ${trackCount} tracks`}
          </p>
        </div>
      </div>
    </div>
  );
}

function AtlasList({
  regions,
  read,
  show,
  onPointer,
  clear,
}: { regions: AtlasRegion[]; read: Set<string> } & Handlers) {
  return (
    <div className="relative grid gap-x-10 gap-y-12 px-6 pt-10 pb-12 sm:grid-cols-2 sm:px-10 sm:pt-12">
      {regions.map((region) => (
        <div key={region.label}>
          <h3 className="font-display text-[0.975rem] tracking-[0.08em] text-ink-soft italic">
            {region.label}
          </h3>
          <ul className="mt-4 space-y-4">
            {region.tracks.map((track) => (
              <li key={track.id}>
                <Link
                  href={`/topics#${track.id}`}
                  className="rounded-sm font-display text-[1.3rem] leading-snug font-[450] tracking-[-0.02em] text-ink decoration-sun decoration-[3px] underline-offset-[5px] hover:underline"
                >
                  {track.title}
                </Link>
                <ul className="-ml-[5.5px] mt-1 flex flex-wrap">
                  {track.topics.map((topic) => (
                    <li key={topic.slug}>
                      <Link
                        href={`/topics/${topic.slug}`}
                        aria-label={topic.title}
                        onPointerEnter={onPointer(() => show(topic, track.id))}
                        onPointerLeave={clear}
                        onFocus={() => show(topic, track.id)}
                        onBlur={clear}
                        className="group flex size-5 items-center justify-center rounded-full"
                      >
                        <span
                          aria-hidden
                          className={cn(
                            DOT,
                            "group-hover:scale-[1.45] group-hover:border-ink group-focus-visible:scale-[1.45] group-focus-visible:border-ink",
                            read.has(topic.slug) ? READ_DOT : UNREAD_DOT
                          )}
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function AtlasSvg({
  map,
  read,
  liftedTrack,
  show,
  showTrack,
  onPointer,
  clear,
}: {
  map: AtlasMap;
  read: Set<string>;
  liftedTrack: string | null;
} & Handlers) {
  return (
    <svg
      viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
      role="group"
      aria-label="Map of the study tracks"
      className="block h-auto w-full select-none [--atlas-shallow:color-mix(in_oklab,var(--sky-wash),var(--paper-raised)_55%)] dark:[--atlas-shallow:color-mix(in_oklab,var(--sky-wash),var(--ink)_7%)]"
    >
      <rect width={MAP_WIDTH} height={MAP_HEIGHT} className="fill-sky-wash" />
      <g aria-hidden className="fill-none stroke-line" strokeWidth={1}>
        {map.graticule.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>

      <g aria-hidden strokeLinejoin="round">
        {map.islands.map((island) => (
          <path
            key={island.id}
            d={island.path}
            strokeWidth={30}
            className="fill-[var(--atlas-shallow)] stroke-[var(--atlas-shallow)] opacity-45"
          />
        ))}
        {map.islands.map((island) => (
          <path
            key={island.id}
            d={island.path}
            strokeWidth={13}
            className="fill-[var(--atlas-shallow)] stroke-[var(--atlas-shallow)]"
          />
        ))}
      </g>

      {map.regions.map((region) => (
        <text
          key={region.label}
          aria-hidden
          x={region.x}
          y={region.y}
          textAnchor="middle"
          fontSize={19}
          letterSpacing="0.16em"
          className="font-display fill-ink-soft italic"
        >
          {region.label}
        </text>
      ))}

      <Compass />

      <Land map={map} liftedTrack={liftedTrack} />

      {map.islands.map((island) => {
        const { label } = island;
        const showThis = () =>
          showTrack(island.title, island.towns.length, island.id);
        return (
          <g key={island.id}>
            <Link
              href={`/topics#${island.id}`}
              aria-label={island.title}
              className="group/label outline-none"
              onPointerEnter={onPointer(showThis)}
              onPointerLeave={clear}
              onFocus={showThis}
              onBlur={clear}
            >
              <rect
                x={label.box.x - 6}
                y={label.box.y - 3}
                width={label.box.w + 12}
                height={label.box.h + 6}
                rx={3}
                strokeWidth={1.5}
                className="fill-transparent stroke-ink opacity-0 group-focus-visible/label:opacity-100"
              />
              <text
                x={label.x}
                y={label.y}
                textAnchor="middle"
                fontSize={LABEL_SIZE}
                className="font-display fill-ink font-[500] decoration-sun decoration-[2.5px] underline-offset-[3px] group-hover/label:underline"
              >
                {label.lines.map((line, i) => (
                  <tspan
                    key={line}
                    x={label.x}
                    dy={i === 0 ? 0 : LABEL_LEADING}
                  >
                    {line}
                  </tspan>
                ))}
              </text>
            </Link>
            {island.towns.map((town) => (
              <Link
                key={town.slug}
                href={`/topics/${town.slug}`}
                aria-label={town.title}
                className="group/town outline-none"
                onPointerEnter={onPointer(() => show(town, island.id))}
                onPointerLeave={clear}
                onFocus={() => show(town, island.id)}
                onBlur={clear}
              >
                <circle
                  cx={town.x}
                  cy={town.y}
                  r={11}
                  className="fill-transparent"
                />
                <circle
                  cx={town.x}
                  cy={town.y}
                  r={TOWN_RADIUS}
                  strokeWidth={1.25}
                  className={cn(
                    "origin-center transition-transform duration-150 [transform-box:fill-box] group-hover/town:scale-[1.45] group-hover/town:stroke-ink group-focus-visible/town:scale-[1.45] group-focus-visible/town:stroke-ink",
                    read.has(town.slug)
                      ? "fill-sun stroke-ink"
                      : "fill-paper-raised stroke-ink-soft"
                  )}
                />
                <circle
                  cx={town.x}
                  cy={town.y}
                  r={10}
                  strokeWidth={1.5}
                  className="fill-none stroke-ink opacity-0 group-focus-visible/town:opacity-100"
                />
              </Link>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Countries of one continent overlap. Every outline is stroked first at
 * double width and every fill laid over it, so only the outer coast keeps
 * its ink line; shared borders are then drawn dashed, each country's outline
 * clipped to the countries drawn before it.
 */
function Land({
  map,
  liftedTrack,
}: {
  map: AtlasMap;
  liftedTrack: string | null;
}) {
  const lifted = map.islands.find((i) => i.id === liftedTrack);
  return (
    <g aria-hidden strokeLinejoin="round">
      <defs>
        {map.islands.map((island, index) => {
          const earlier = map.islands
            .slice(0, index)
            .filter((o) => o.region === island.region);
          return earlier.length ? (
            <clipPath key={island.id} id={`atlas-border-${island.id}`}>
              {earlier.map((o) => (
                <path key={o.id} d={o.path} />
              ))}
            </clipPath>
          ) : null;
        })}
      </defs>
      {map.islands.map((island) => (
        <path
          key={island.id}
          d={island.path}
          strokeWidth={island.id === liftedTrack ? 3.8 : 2.5}
          className="fill-none stroke-ink"
        />
      ))}
      {map.islands.map((island) => (
        <path key={island.id} d={island.path} className="fill-paper-raised" />
      ))}
      {lifted ? (
        <>
          <mask id="atlas-lifted">
            <path d={lifted.path} fill="white" />
            {map.islands
              .slice(map.islands.indexOf(lifted) + 1)
              .filter((o) => o.region === lifted.region)
              .map((o) => (
                <path key={o.id} d={o.path} fill="black" />
              ))}
          </mask>
          <path
            d={lifted.path}
            mask="url(#atlas-lifted)"
            className="fill-sun-wash motion-safe:animate-in motion-safe:fade-in-0"
          />
        </>
      ) : null}
      {map.islands.map((island, index) =>
        map.islands
          .slice(0, index)
          .some((o) => o.region === island.region) ? (
          <path
            key={island.id}
            d={island.path}
            clipPath={`url(#atlas-border-${island.id})`}
            strokeWidth={1}
            strokeDasharray="5 3"
            className="fill-none stroke-ink-soft"
          />
        ) : null
      )}
    </g>
  );
}

const f = (n: number) => n.toFixed(1);

/** A small eight-point compass rose. */
function Compass() {
  const { x, y } = COMPASS;
  const waist = 4.5;
  const at = (angle: number, length: number) => {
    const a = (angle * Math.PI) / 180;
    return `${f(x + Math.sin(a) * length)} ${f(y - Math.cos(a) * length)}`;
  };
  // Each point is two half-blades, one shaded and one plain.
  const blade = (angle: number, length: number) => [
    `M${x} ${y}L${at(angle - 90, waist)}L${at(angle, length)}Z`,
    `M${x} ${y}L${at(angle + 90, waist)}L${at(angle, length)}Z`,
  ];
  return (
    <g aria-hidden strokeLinejoin="round" strokeWidth={0.8}>
      <circle cx={x} cy={y} r={18} className="fill-none stroke-ink-soft" />
      {[45, 135, 225, 315, 0, 90, 180, 270].map((angle) => {
        const [shaded, plain] = blade(angle, angle % 90 === 0 ? 28 : 15);
        return (
          <g key={angle}>
            <path d={shaded} className="fill-ink-soft stroke-ink-soft" />
            <path d={plain} className="fill-paper-raised stroke-ink-soft" />
          </g>
        );
      })}
      <text
        x={x}
        y={y - 35}
        textAnchor="middle"
        fontSize={13}
        className="font-display fill-ink-soft"
      >
        N
      </text>
    </g>
  );
}
