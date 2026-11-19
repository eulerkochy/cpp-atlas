"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  Bookmark,
  BookOpen,
  Check,
  ExternalLink,
  ListChecks,
  MapPin,
  Minus,
  Network,
  Plus,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import {
  LABEL_LEADING,
  LABEL_SIZE,
  MAP_HEIGHT,
  MAP_WIDTH,
  TOWN_RADIUS,
  type AtlasMap,
  type MapIsland,
  type MapRoute,
  type MapTown,
  type MapViewBox,
} from "@/components/atlas-map-geometry";
import { useProgress } from "@/components/ProgressProvider";
import type { AtlasRegionData, AtlasTopicData } from "@/lib/atlas-data";
import { cn } from "@/lib/utils";
import { standardRefToUrl } from "@/types/topics";

export type AtlasLayer = "routes" | "next-up" | "simulators" | "saved";

export interface WorldAtlasProps {
  regions: AtlasRegionData[];
  map: AtlasMap;
  mode?: "home" | "explorer" | "locator";
  highlightedSlugs?: ReadonlySet<string> | null;
  activeTrackId?: string | null;
  selectedSlug?: string | null;
  defaultSelectedSlug?: string | null;
  defaultCamera?: string; // "world" | region id | region label | track id
  defaultLayers?: AtlasLayer[];
  onSelectTopic?: (slug: string | null) => void;
  onSelectTrack?: (trackId: string) => void;
  renderTopicExtra?: (topic: AtlasTopicData) => ReactNode;
  className?: string;
}

const WORLD_VIEWBOX: MapViewBox = {
  x: 0,
  y: 0,
  w: MAP_WIDTH,
  h: MAP_HEIGHT,
};

const MAX_ZOOM = 4.2;
const LABEL_ZOOM_THRESHOLD = 1.45;
const COMPASS = { x: 92, y: 542 };
const SCALE_BAR = { x: 896, y: 576 };

const LAYER_OPTIONS: { key: AtlasLayer; label: string }[] = [
  { key: "routes", label: "Routes" },
  { key: "next-up", label: "Next up" },
  { key: "simulators", label: "Simulators" },
  { key: "saved", label: "Saved" },
];

function defaultLayersForMode(
  mode: "home" | "explorer" | "locator",
  override?: AtlasLayer[]
): AtlasLayer[] {
  if (override) return override;
  if (mode === "explorer") return ["routes", "next-up", "simulators", "saved"];
  return ["routes", "simulators", "saved"];
}

function clampViewBox(vb: MapViewBox): MapViewBox {
  const minW = MAP_WIDTH / MAX_ZOOM;
  const w = Math.max(minW, Math.min(MAP_WIDTH, vb.w));
  const h = w * (MAP_HEIGHT / MAP_WIDTH);
  const x = Math.max(0, Math.min(MAP_WIDTH - w, vb.x));
  const y = Math.max(0, Math.min(MAP_HEIGHT - h, vb.y));
  return { x, y, w, h };
}

function resolveCameraTarget(
  camera: string | undefined,
  map: AtlasMap
): { id: string | null; viewBox: MapViewBox } {
  if (!camera || camera === "world") {
    return { id: "world", viewBox: WORLD_VIEWBOX };
  }
  const region = map.regions.find(
    (r) =>
      r.id === camera || r.label.toLowerCase() === camera.trim().toLowerCase()
  );
  if (region) {
    return { id: region.id, viewBox: clampViewBox(region.viewBox) };
  }
  const island = map.islands.find((isl) => isl.id === camera);
  if (island) {
    return { id: null, viewBox: clampViewBox(island.viewBox) };
  }
  return { id: "world", viewBox: WORLD_VIEWBOX };
}

function findInitialView(
  map: AtlasMap,
  defaultCamera: string | undefined,
  initialSlug: string | null | undefined,
  mode: "home" | "explorer" | "locator"
): { id: string | null; viewBox: MapViewBox } {
  if (defaultCamera && defaultCamera !== "world") {
    return resolveCameraTarget(defaultCamera, map);
  }
  if (
    initialSlug &&
    mode === "explorer" &&
    (!defaultCamera || defaultCamera === "world")
  ) {
    const island = map.islands.find((isl) =>
      isl.towns.some((t) => t.slug === initialSlug)
    );
    if (island) {
      return { id: null, viewBox: clampViewBox(island.viewBox) };
    }
  }
  return { id: "world", viewBox: WORLD_VIEWBOX };
}

function matchesSearchQuery(topic: AtlasTopicData, q: string): boolean {
  if (!q) return true;
  if (topic.title.toLowerCase().includes(q)) return true;
  if (topic.slug.toLowerCase().includes(q)) return true;
  if (topic.summary.toLowerCase().includes(q)) return true;
  if (topic.trackTitle.toLowerCase().includes(q)) return true;
  if (topic.standard.some((clause) => clause.toLowerCase().includes(q))) {
    return true;
  }
  return topic.cppreference.some(
    (ref) =>
      ref.path.toLowerCase().includes(q) ||
      ref.href.toLowerCase().includes(q) ||
      ref.title.toLowerCase().includes(q)
  );
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function WorldAtlas({
  regions,
  map,
  mode = "home",
  highlightedSlugs,
  activeTrackId = null,
  selectedSlug,
  defaultSelectedSlug = null,
  defaultCamera,
  defaultLayers,
  onSelectTopic,
  onSelectTrack,
  renderTopicExtra,
  className,
}: WorldAtlasProps) {
  const router = useRouter();
  const rawId = useId();
  const svgPrefix = useMemo(
    () => rawId.replace(/[^a-zA-Z0-9_-]/g, "") || "atlas",
    [rawId]
  );

  const {
    hydrated,
    completedTopics,
    bookmarkedTopics,
    toggleTopicCompleted,
    toggleTopicBookmark,
  } = useProgress();

  const completedSet = useMemo(
    () => new Set(hydrated ? completedTopics : []),
    [hydrated, completedTopics]
  );
  const savedSet = useMemo(
    () => new Set(hydrated ? bookmarkedTopics : []),
    [hydrated, bookmarkedTopics]
  );

  const isSelectedControlled = selectedSlug !== undefined;
  const [internalSelectedSlug, setInternalSelectedSlug] = useState<
    string | null
  >(defaultSelectedSlug);
  const activeSelectedSlug = isSelectedControlled
    ? selectedSlug
    : internalSelectedSlug;

  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);
  const [focusedSlug, setFocusedSlug] = useState<string | null>(null);
  const [hoveredTrackId, setHoveredTrackId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"map" | "index">("map");
  const [searchQuery, setSearchQuery] = useState("");

  const [activeLayers, setActiveLayers] = useState<Set<AtlasLayer>>(
    () => new Set(defaultLayersForMode(mode, defaultLayers))
  );

  const initialCamera = useMemo(
    () =>
      findInitialView(
        map,
        defaultCamera,
        selectedSlug ?? defaultSelectedSlug,
        mode
      ),
    // Initial state computation only
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const [viewBox, setViewBox] = useState<MapViewBox>(initialCamera.viewBox);
  const [activeCameraId, setActiveCameraId] = useState<string | null>(
    initialCamera.id
  );

  const svgRef = useRef<SVGSVGElement | null>(null);
  const animRafRef = useRef<number | null>(null);
  const viewBoxRef = useRef<MapViewBox>(viewBox);
  const didDragRef = useRef(false);
  const selfSelectedRef = useRef<string | null | undefined>(undefined);
  const prevExternalSelectedRef = useRef<string | null | undefined>(
    selectedSlug
  );

  useEffect(() => {
    viewBoxRef.current = viewBox;
  }, [viewBox]);

  useEffect(() => {
    return () => {
      if (animRafRef.current !== null) {
        cancelAnimationFrame(animRafRef.current);
      }
    };
  }, []);

  const stopCameraAnimation = useCallback(() => {
    if (animRafRef.current !== null) {
      cancelAnimationFrame(animRafRef.current);
      animRafRef.current = null;
    }
  }, []);

  const animateCameraTo = useCallback(
    (rawTarget: MapViewBox, cameraId: string | null = null) => {
      stopCameraAnimation();
      const target = clampViewBox(rawTarget);
      const nextCameraId =
        Math.abs(target.w - MAP_WIDTH) < 4 ? "world" : cameraId;
      setActiveCameraId(nextCameraId);

      if (prefersReducedMotion()) {
        animRafRef.current = requestAnimationFrame(() => {
          animRafRef.current = null;
          viewBoxRef.current = target;
          setViewBox(target);
        });
        return;
      }

      const start = viewBoxRef.current;
      const startTime = performance.now();
      const duration = 360;

      const tick = (now: number) => {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / duration);
        // Smooth ease-out cubic
        const ease = 1 - (1 - t) ** 3;
        const next: MapViewBox = {
          x: start.x + (target.x - start.x) * ease,
          y: start.y + (target.y - start.y) * ease,
          w: start.w + (target.w - start.w) * ease,
          h: start.h + (target.h - start.h) * ease,
        };
        viewBoxRef.current = next;
        setViewBox(next);
        if (t < 1) {
          animRafRef.current = requestAnimationFrame(tick);
        } else {
          animRafRef.current = null;
        }
      };

      animRafRef.current = requestAnimationFrame(tick);
    },
    [stopCameraAnimation]
  );

  // Build fast lookup tables from regions & map.
  const {
    topicBySlug,
    dependentsBySlug,
    townBySlug,
    islandById,
    nextUpSet,
    totalTopics,
    totalTracks,
  } = useMemo(() => {
    const tMap = new Map<string, AtlasTopicData>();
    const depMap = new Map<string, AtlasTopicData[]>();
    let tracksCount = 0;

    for (const region of regions) {
      for (const track of region.tracks) {
        tracksCount++;
        for (const topic of track.topics) {
          tMap.set(topic.slug, topic);
        }
      }
    }

    for (const topic of tMap.values()) {
      for (const pre of topic.prerequisites) {
        if (!tMap.has(pre) || pre === topic.slug) continue;
        const list = depMap.get(pre) ?? [];
        list.push(topic);
        depMap.set(pre, list);
      }
    }

    const slugs = new Set(tMap.keys());
    const readySet = new Set<string>();
    for (const topic of tMap.values()) {
      if (completedSet.has(topic.slug)) continue;
      const ready = topic.prerequisites.every(
        (pre) => !slugs.has(pre) || completedSet.has(pre)
      );
      if (ready) readySet.add(topic.slug);
    }

    const townLookup = new Map<string, MapTown>();
    const islandLookup = new Map<string, MapIsland>();
    for (const island of map.islands) {
      islandLookup.set(island.id, island);
      for (const town of island.towns) {
        townLookup.set(town.slug, town);
      }
    }

    return {
      topicBySlug: tMap,
      dependentsBySlug: depMap,
      townBySlug: townLookup,
      islandById: islandLookup,
      nextUpSet: readySet,
      totalTopics: tMap.size,
      totalTracks: tracksCount,
    };
  }, [regions, map.islands, completedSet]);

  const flyToTown = useCallback(
    (slug: string) => {
      const town = townBySlug.get(slug);
      if (!town) return;
      const island = islandById.get(town.trackId);
      const current = viewBoxRef.current;
      const currentZoom = MAP_WIDTH / current.w;
      const targetW =
        currentZoom >= 1.65
          ? current.w
          : Math.min(island?.viewBox.w ?? 420, 440);
      const targetH = targetW * (MAP_HEIGHT / MAP_WIDTH);
      animateCameraTo(
        {
          x: town.x - targetW / 2,
          y: town.y - targetH / 2,
          w: targetW,
          h: targetH,
        },
        null
      );
    },
    [townBySlug, islandById, animateCameraTo]
  );

  // Sync external controlled selectedSlug changes (e.g. from URL or parent search).
  useEffect(() => {
    if (!isSelectedControlled) return;
    if (selectedSlug === prevExternalSelectedRef.current) return;
    prevExternalSelectedRef.current = selectedSlug;

    if (selfSelectedRef.current === selectedSlug) {
      selfSelectedRef.current = undefined;
      return;
    }
    if (selectedSlug) {
      flyToTown(selectedSlug);
    }
  }, [isSelectedControlled, selectedSlug, flyToTown]);

  const selectTown = useCallback(
    (slug: string | null, opts?: { pan?: boolean }) => {
      if (isSelectedControlled) {
        selfSelectedRef.current = slug;
      } else {
        setInternalSelectedSlug(slug);
      }
      onSelectTopic?.(slug);
      if (slug && opts?.pan) {
        flyToTown(slug);
      }
    },
    [isSelectedControlled, onSelectTopic, flyToTown]
  );

  // Internal search highlight in uncontrolled explorer mode.
  const hasExternalHighlights = highlightedSlugs !== undefined;
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const internalHighlightedSlugs = useMemo(() => {
    if (hasExternalHighlights || mode !== "explorer" || !normalizedQuery) {
      return null;
    }
    const matches = new Set<string>();
    for (const topic of topicBySlug.values()) {
      if (matchesSearchQuery(topic, normalizedQuery)) {
        matches.add(topic.slug);
      }
    }
    return matches;
  }, [hasExternalHighlights, mode, normalizedQuery, topicBySlug]);

  const effectiveHighlights = hasExternalHighlights
    ? highlightedSlugs
    : internalHighlightedSlugs;

  const zoom = MAP_WIDTH / viewBox.w;
  const showTownLabels = zoom >= LABEL_ZOOM_THRESHOLD;

  const zoomBy = useCallback(
    (factor: number) => {
      const cur = viewBoxRef.current;
      const nextW = Math.max(
        MAP_WIDTH / MAX_ZOOM,
        Math.min(MAP_WIDTH, cur.w / factor)
      );
      const nextH = nextW * (MAP_HEIGHT / MAP_WIDTH);
      const cx = cur.x + cur.w / 2;
      const cy = cur.y + cur.h / 2;
      animateCameraTo(
        {
          x: cx - nextW / 2,
          y: cy - nextH / 2,
          w: nextW,
          h: nextH,
        },
        Math.abs(nextW - MAP_WIDTH) < 4 ? "world" : null
      );
    },
    [animateCameraTo]
  );

  const toggleLayer = (layer: AtlasLayer) => {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  };

  // Drag-to-pan when zoomed in.
  const handleSvgPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    if (MAP_WIDTH / viewBoxRef.current.w <= 1.05) return;

    const svg = svgRef.current;
    if (!svg) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const startVb = viewBoxRef.current;
    let moved = false;
    didDragRef.current = false;

    const onMove = (ev: globalThis.PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) > 5) {
        moved = true;
        didDragRef.current = true;
        stopCameraAnimation();
        setActiveCameraId(null);
      }
      if (!moved) return;
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const svgDx = (dx / rect.width) * startVb.w;
      const svgDy = (dy / rect.height) * startVb.h;
      const next = clampViewBox({
        ...startVb,
        x: startVb.x - svgDx,
        y: startVb.y - svgDy,
      });
      viewBoxRef.current = next;
      setViewBox(next);
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", cleanup);
      window.removeEventListener("pointercancel", cleanup);
      if (moved) {
        window.setTimeout(() => {
          didDragRef.current = false;
        }, 0);
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", cleanup);
    window.addEventListener("pointercancel", cleanup);
  };

  const handleSvgClickCapture = (e: MouseEvent<SVGSVGElement>) => {
    if (didDragRef.current) {
      e.preventDefault();
      e.stopPropagation();
      didDragRef.current = false;
    }
  };

  // Determine which town's routes and nameplate are illuminated.
  const illuminatedSlug =
    hoveredSlug ?? focusedSlug ?? activeSelectedSlug ?? null;
  const selectedTopic = activeSelectedSlug
    ? (topicBySlug.get(activeSelectedSlug) ?? null)
    : null;
  const hoveredTopic = hoveredSlug ? (topicBySlug.get(hoveredSlug) ?? null) : null;
  const focusedTopic = focusedSlug ? (topicBySlug.get(focusedSlug) ?? null) : null;
  const readoutTopic = hoveredTopic ?? focusedTopic ?? selectedTopic;

  const liftedTrack =
    activeTrackId ?? hoveredTrackId ?? selectedTopic?.trackId ?? null;

  const { backgroundRoutes, ancestorRoutes, dependentRoutes } = useMemo(() => {
    const bg: MapRoute[] = [];
    const anc: MapRoute[] = [];
    const dep: MapRoute[] = [];

    for (const route of map.routes) {
      if (illuminatedSlug && route.to === illuminatedSlug) {
        anc.push(route);
      } else if (illuminatedSlug && route.from === illuminatedSlug) {
        dep.push(route);
      } else {
        bg.push(route);
      }
    }

    return { backgroundRoutes: bg, ancestorRoutes: anc, dependentRoutes: dep };
  }, [map.routes, illuminatedSlug]);

  const highlightedRouteSlugs = useMemo(() => {
    const ancestors = new Set<string>();
    const dependents = new Set<string>();
    for (const r of ancestorRoutes) ancestors.add(r.from);
    for (const r of dependentRoutes) dependents.add(r.to);
    return { ancestors, dependents };
  }, [ancestorRoutes, dependentRoutes]);

  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && effectiveHighlights && effectiveHighlights.size > 0) {
      const firstSlug = Array.from(effectiveHighlights)[0];
      if (firstSlug) {
        e.preventDefault();
        selectTown(firstSlug, { pan: true });
      }
    }
  };

  const handleIslandActivate = (island: MapIsland) => {
    onSelectTrack?.(island.id);
    if (mode !== "locator") {
      animateCameraTo(island.viewBox, null);
    }
  };

  const hoveredIsland = hoveredTrackId ? islandById.get(hoveredTrackId) : null;
  const readoutText = readoutTopic
    ? `${readoutTopic.title}, ${readoutTopic.minutes} min read`
    : hoveredIsland
      ? `${hoveredIsland.title}, ${hoveredIsland.towns.length} topics`
      : `${totalTopics} topics in ${totalTracks} tracks`;

  // Nameplate town at World zoom (< 1.45x).
  const nameplateTown =
    !showTownLabels && illuminatedSlug
      ? (townBySlug.get(illuminatedSlug) ?? null)
      : null;

  const selectedPrereqs = useMemo(() => {
    if (!selectedTopic) return [];
    return selectedTopic.prerequisites
      .map((pre) => topicBySlug.get(pre))
      .filter((t): t is AtlasTopicData => Boolean(t));
  }, [selectedTopic, topicBySlug]);

  const selectedDependents = useMemo(() => {
    if (!selectedTopic) return [];
    return dependentsBySlug.get(selectedTopic.slug) ?? [];
  }, [selectedTopic, dependentsBySlug]);

  return (
    <div
      className={cn(
        "rounded-[3px] border border-line-strong bg-paper-raised p-[5px] text-left",
        className
      )}
    >
      <div className="relative overflow-hidden rounded-[2px] border border-line bg-paper-raised">
        {/* Top cartographic bar: continent cameras, optional search, zoom controls, layers */}
        <div className="border-b border-line bg-paper-raised px-3 py-2.5 sm:px-4">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div
              role="group"
              aria-label="Atlas continent cameras"
              className="flex flex-wrap items-center gap-1.5"
            >
              <button
                type="button"
                aria-pressed={activeCameraId === "world"}
                onClick={() => animateCameraTo(WORLD_VIEWBOX, "world")}
                className={cn(
                  "inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium transition-colors cursor-pointer",
                  activeCameraId === "world"
                    ? "border-ink/30 bg-sun text-ink"
                    : "border-line-strong bg-paper-raised text-ink-soft hover:border-ink/40 hover:text-ink"
                )}
              >
                World
              </button>
              {map.regions.map((region) => {
                const active = activeCameraId === region.id;
                return (
                  <button
                    key={region.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => animateCameraTo(region.viewBox, region.id)}
                    className={cn(
                      "inline-flex h-7 items-center rounded-full border px-3 font-display text-[13px] italic tracking-[0.04em] transition-colors cursor-pointer",
                      active
                        ? "border-ink/30 bg-sun text-ink"
                        : "border-line-strong bg-paper-raised text-ink-soft hover:border-ink/40 hover:text-ink"
                    )}
                  >
                    {region.label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {mode === "explorer" && !hasExternalHighlights ? (
                <div className="relative w-full sm:w-64">
                  <Search
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-faint"
                  />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    aria-label="Find a town, standard clause, or cppreference path"
                    placeholder="Find a town, [clause], or /w/cpp path"
                    className="h-7 w-full rounded-full border border-line-strong bg-paper pr-7 pl-8 text-xs text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none [&::-webkit-search-cancel-button]:appearance-none"
                  />
                  {searchQuery ? (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      aria-label="Clear map search"
                      className="absolute top-1/2 right-1.5 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-ink-faint hover:bg-ink/5 hover:text-ink cursor-pointer"
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  ) : null}
                </div>
              ) : null}

              {/* Mobile Map / Index switch */}
              <div
                role="group"
                aria-label="Mobile view mode"
                className="inline-flex items-center rounded-full border border-line-strong bg-paper p-0.5 md:hidden"
              >
                <button
                  type="button"
                  aria-pressed={mobileView === "map"}
                  onClick={() => setMobileView("map")}
                  className={cn(
                    "h-6 rounded-full px-2.5 text-xs font-medium transition-colors cursor-pointer",
                    mobileView === "map"
                      ? "bg-sun text-ink"
                      : "text-ink-soft hover:text-ink"
                  )}
                >
                  Map
                </button>
                <button
                  type="button"
                  aria-pressed={mobileView === "index"}
                  onClick={() => setMobileView("index")}
                  className={cn(
                    "h-6 rounded-full px-2.5 text-xs font-medium transition-colors cursor-pointer",
                    mobileView === "index"
                      ? "bg-sun text-ink"
                      : "text-ink-soft hover:text-ink"
                  )}
                >
                  Index
                </button>
              </div>

              {/* Zoom controls */}
              <div
                role="group"
                aria-label="Map zoom controls"
                className="inline-flex items-center gap-0.5 rounded-full border border-line-strong bg-paper p-0.5"
              >
                <button
                  type="button"
                  onClick={() => zoomBy(1.45)}
                  disabled={zoom >= MAX_ZOOM - 0.05}
                  aria-label="Zoom in"
                  className="inline-flex size-6 items-center justify-center rounded-full text-ink-soft hover:bg-paper-raised hover:text-ink disabled:opacity-35 cursor-pointer"
                >
                  <Plus className="size-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => zoomBy(1 / 1.45)}
                  disabled={zoom <= 1.02}
                  aria-label="Zoom out"
                  className="inline-flex size-6 items-center justify-center rounded-full text-ink-soft hover:bg-paper-raised hover:text-ink disabled:opacity-35 cursor-pointer"
                >
                  <Minus className="size-3.5" aria-hidden />
                </button>
                <span
                  aria-hidden
                  className="px-1.5 font-mono text-[11px] text-ink-faint tabular-nums"
                >
                  {zoom.toFixed(1)}×
                </span>
                <button
                  type="button"
                  onClick={() => animateCameraTo(WORLD_VIEWBOX, "world")}
                  disabled={zoom <= 1.02 && activeCameraId === "world"}
                  aria-label="Reset map zoom"
                  className="inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium text-ink-soft hover:bg-paper-raised hover:text-ink disabled:opacity-35 cursor-pointer"
                >
                  <RotateCcw className="size-3" aria-hidden />
                  <span>Reset</span>
                </button>
              </div>
            </div>
          </div>

          {/* Layer toggles */}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
            <div
              role="group"
              aria-label="Cartographic layers"
              className="flex flex-wrap items-center gap-1.5"
            >
              {LAYER_OPTIONS.map((layer) => {
                const active = activeLayers.has(layer.key);
                return (
                  <button
                    key={layer.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleLayer(layer.key)}
                    className={cn(
                      "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors cursor-pointer",
                      active
                        ? "border-ink/30 bg-sun-wash text-ink"
                        : "border-line bg-paper text-ink-soft hover:border-line-strong hover:text-ink"
                    )}
                  >
                    <LayerSwatch layer={layer.key} active={active} />
                    <span>{layer.label}</span>
                    {layer.key === "next-up" && hydrated ? (
                      <span className="font-mono text-[10px] text-ink-soft tabular-nums">
                        {nextUpSet.size}
                      </span>
                    ) : null}
                    {layer.key === "saved" && hydrated && savedSet.size > 0 ? (
                      <span className="font-mono text-[10px] text-ink-soft tabular-nums">
                        {savedSet.size}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {effectiveHighlights ? (
              <span className="font-mono text-[11px] text-ink-soft tabular-nums">
                {effectiveHighlights.size}{" "}
                {effectiveHighlights.size === 1 ? "town" : "towns"} highlighted
              </span>
            ) : null}
          </div>
        </div>

        {/* Mobile Index view (< md when switched to Index) */}
        {mobileView === "index" ? (
          <div className="relative md:hidden">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-60 [background-image:linear-gradient(var(--line)_1px,transparent_1px),linear-gradient(90deg,var(--line)_1px,transparent_1px)] [background-position:-1px_-1px] [background-size:3.5rem_3.5rem]"
            />
            <MobileAtlasList
              regions={regions}
              read={completedSet}
              saved={savedSet}
              nextUp={nextUpSet}
              selectedSlug={activeSelectedSlug ?? null}
              highlightedSlugs={effectiveHighlights ?? null}
              showNextUp={activeLayers.has("next-up")}
              showSimulators={activeLayers.has("simulators")}
              showSaved={activeLayers.has("saved")}
              onSelect={(slug) => {
                if (activeSelectedSlug === slug) {
                  router.push(`/topics/${slug}`);
                } else {
                  selectTown(slug, { pan: false });
                }
              }}
            />
          </div>
        ) : null}

        {/* Interactive SVG World Atlas (shown on md+ and on mobile when mobileView === "map") */}
        <div
          className={cn(
            mobileView === "index" ? "hidden md:block" : "block"
          )}
        >
          <svg
            ref={svgRef}
            viewBox={`${viewBox.x.toFixed(2)} ${viewBox.y.toFixed(2)} ${viewBox.w.toFixed(2)} ${viewBox.h.toFixed(2)}`}
            role="group"
            aria-label="Interactive C++ World Atlas"
            onPointerDown={handleSvgPointerDown}
            onClickCapture={handleSvgClickCapture}
            className={cn(
              "block h-auto w-full select-none [--atlas-shallow:color-mix(in_oklab,var(--sky-wash),var(--paper-raised)_55%)] dark:[--atlas-shallow:color-mix(in_oklab,var(--sky-wash),var(--ink)_7%)]",
              zoom > 1.05
                ? "touch-none cursor-grab active:cursor-grabbing"
                : "touch-pan-y"
            )}
          >
            <defs>
              <marker
                id={`${svgPrefix}-arrow-ink`}
                markerUnits="userSpaceOnUse"
                markerWidth={7}
                markerHeight={7}
                refX={12}
                refY={3.5}
                orient="auto"
              >
                <path d="M 0.5 1 L 6 3.5 L 0.5 6 Z" className="fill-ink" />
              </marker>
              <marker
                id={`${svgPrefix}-arrow-sun`}
                markerUnits="userSpaceOnUse"
                markerWidth={7}
                markerHeight={7}
                refX={12}
                refY={3.5}
                orient="auto"
              >
                <path
                  d="M 0.5 1 L 6 3.5 L 0.5 6 Z"
                  className="fill-[var(--sun-deep)]"
                />
              </marker>
              {map.islands.map((island, index) => {
                const earlier = map.islands
                  .slice(0, index)
                  .filter((o) => o.region === island.region);
                return earlier.length ? (
                  <clipPath
                    key={island.id}
                    id={`${svgPrefix}-border-${island.id}`}
                  >
                    {earlier.map((o) => (
                      <path key={o.id} d={o.path} />
                    ))}
                  </clipPath>
                ) : null;
              })}
              {liftedTrack
                ? (() => {
                    const lifted = map.islands.find(
                      (i) => i.id === liftedTrack
                    );
                    if (!lifted) return null;
                    return (
                      <mask id={`${svgPrefix}-lifted`}>
                        <path d={lifted.path} fill="white" />
                        {map.islands
                          .slice(map.islands.indexOf(lifted) + 1)
                          .filter((o) => o.region === lifted.region)
                          .map((o) => (
                            <path key={o.id} d={o.path} fill="black" />
                          ))}
                      </mask>
                    );
                  })()
                : null}
            </defs>

            {/* Sea & click-empty-sea deselection */}
            <rect
              x={0}
              y={0}
              width={MAP_WIDTH}
              height={MAP_HEIGHT}
              className="fill-sky-wash"
              onClick={() => {
                if (activeSelectedSlug) selectTown(null);
              }}
            />

            {/* Curved graticule */}
            <g aria-hidden className="fill-none stroke-line" strokeWidth={1}>
              {map.graticule.map((d) => (
                <path key={d} d={d} />
              ))}
            </g>

            {/* Two-step coastal shallows */}
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

            {/* Clickable italic Fraunces continent sea-labels */}
            {map.regions.map((region) => (
              <g
                key={region.id}
                role="button"
                tabIndex={0}
                aria-label={`Focus ${region.label} continent`}
                onClick={() => animateCameraTo(region.viewBox, region.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    animateCameraTo(region.viewBox, region.id);
                  }
                }}
                className="group/region cursor-pointer outline-none"
              >
                <text
                  x={region.x}
                  y={region.y}
                  textAnchor="middle"
                  fontSize={19}
                  letterSpacing="0.08em"
                  className="font-display fill-ink-soft italic transition-colors group-hover/region:fill-ink group-focus-visible/region:fill-ink"
                >
                  {region.label}
                </text>
              </g>
            ))}

            <Compass />
            <ScaleBar />

            {/* Landmasses & shared dashed borders */}
            <g aria-hidden strokeLinejoin="round">
              {map.islands.map((island) => (
                <path
                  key={island.id}
                  d={island.path}
                  strokeWidth={island.id === liftedTrack ? 3.8 : 2.5}
                  className="fill-none stroke-ink"
                />
              ))}
              {map.islands.map((island) => (
                <path
                  key={island.id}
                  d={island.path}
                  className="fill-paper-raised"
                />
              ))}
              {liftedTrack
                ? (() => {
                    const lifted = map.islands.find(
                      (i) => i.id === liftedTrack
                    );
                    if (!lifted) return null;
                    return (
                      <path
                        d={lifted.path}
                        mask={`url(#${svgPrefix}-lifted)`}
                        className="fill-sun-wash motion-safe:animate-in motion-safe:fade-in-0"
                      />
                    );
                  })()
                : null}
              {map.islands.map((island, index) =>
                map.islands
                  .slice(0, index)
                  .some((o) => o.region === island.region) ? (
                  <path
                    key={island.id}
                    d={island.path}
                    clipPath={`url(#${svgPrefix}-border-${island.id})`}
                    strokeWidth={1}
                    strokeDasharray="5 3"
                    className="fill-none stroke-ink-soft"
                  />
                ) : null
              )}
            </g>

            {/* Prerequisite routes */}
            <g aria-hidden className="pointer-events-none fill-none">
              {activeLayers.has("routes")
                ? backgroundRoutes.map((route) => (
                    <path
                      key={route.id}
                      d={route.d}
                      strokeWidth={0.85}
                      strokeDasharray={route.crossesSea ? "4 3" : undefined}
                      opacity={illuminatedSlug ? 0.08 : 0.16}
                      className="stroke-ink-faint"
                    />
                  ))
                : null}
              {ancestorRoutes.map((route) => (
                <path
                  key={route.id}
                  d={route.d}
                  strokeWidth={1.9}
                  strokeDasharray={route.crossesSea ? "4 3" : undefined}
                  markerEnd={`url(#${svgPrefix}-arrow-ink)`}
                  className="stroke-ink"
                />
              ))}
              {dependentRoutes.map((route) => (
                <path
                  key={route.id}
                  d={route.d}
                  strokeWidth={1.9}
                  strokeDasharray={route.crossesSea ? "4 3" : undefined}
                  markerEnd={`url(#${svgPrefix}-arrow-sun)`}
                  className="stroke-[var(--sun-deep)]"
                />
              ))}
            </g>

            {/* Country titles & Town landmarks */}
            {map.islands.map((island) => {
              const { label } = island;
              return (
                <g key={island.id}>
                  <g
                    role="button"
                    tabIndex={0}
                    aria-label={`${island.title}, ${island.towns.length} topics`}
                    onClick={() => handleIslandActivate(island)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleIslandActivate(island);
                      }
                    }}
                    onPointerEnter={(e) => {
                      if (e.pointerType !== "touch") {
                        setHoveredTrackId(island.id);
                      }
                    }}
                    onPointerLeave={() => setHoveredTrackId(null)}
                    onFocus={() => setHoveredTrackId(island.id)}
                    onBlur={() => setHoveredTrackId(null)}
                    className="group/label cursor-pointer outline-none"
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
                  </g>

                  {island.towns.map((town) => {
                    const isCompleted = completedSet.has(town.slug);
                    const isSaved = savedSet.has(town.slug);
                    const isSimulator = Boolean(town.simulator);
                    const isNextUp = nextUpSet.has(town.slug);
                    const isSelected = activeSelectedSlug === town.slug;
                    const isIlluminated = illuminatedSlug === town.slug;
                    const isPrereqLink = highlightedRouteSlugs.ancestors.has(
                      town.slug
                    );
                    const isDepLink = highlightedRouteSlugs.dependents.has(
                      town.slug
                    );
                    const isDimmed =
                      Boolean(effectiveHighlights) &&
                      !effectiveHighlights?.has(town.slug) &&
                      !isSelected &&
                      !isIlluminated;
                    const showNextUpHalo =
                      activeLayers.has("next-up") && isNextUp;
                    const showSimRing =
                      isSimulator && activeLayers.has("simulators");
                    const showPennant = isSaved && activeLayers.has("saved");

                    return (
                      <Link
                        key={town.slug}
                        href={`/topics/${town.slug}`}
                        aria-label={`${town.title}, ${town.minutes} min read${
                          isCompleted ? ", read" : ""
                        }${isSelected ? ", selected (activate again to open)" : ""}`}
                        aria-current={isSelected ? "location" : undefined}
                        className={cn(
                          "group/town outline-none transition-opacity duration-150",
                          isDimmed && "opacity-25"
                        )}
                        onClick={(e) => {
                          if (
                            e.metaKey ||
                            e.ctrlKey ||
                            e.shiftKey ||
                            e.altKey
                          ) {
                            return;
                          }
                          if (activeSelectedSlug !== town.slug) {
                            e.preventDefault();
                            selectTown(town.slug, { pan: false });
                          }
                        }}
                        onPointerEnter={(e) => {
                          if (e.pointerType !== "touch") {
                            setHoveredSlug(town.slug);
                          }
                        }}
                        onPointerLeave={() => {
                          setHoveredSlug((cur) =>
                            cur === town.slug ? null : cur
                          );
                        }}
                        onFocus={() => setFocusedSlug(town.slug)}
                        onBlur={() => {
                          setFocusedSlug((cur) =>
                            cur === town.slug ? null : cur
                          );
                        }}
                      >
                        {/* Hit target */}
                        <circle
                          cx={town.x}
                          cy={town.y}
                          r={11}
                          className="fill-transparent"
                        />

                        {/* Next-up dashed frontier halo */}
                        {showNextUpHalo ? (
                          <circle
                            cx={town.x}
                            cy={town.y}
                            r={TOWN_RADIUS + 3.6}
                            strokeWidth={1.3}
                            strokeDasharray="2.5 2"
                            className="fill-none stroke-[var(--sun-deep)]"
                          />
                        ) : null}

                        {/* Illuminated prerequisite/dependent ring */}
                        {isPrereqLink || isDepLink ? (
                          <circle
                            cx={town.x}
                            cy={town.y}
                            r={TOWN_RADIUS + 2.8}
                            strokeWidth={1.4}
                            className={cn(
                              "fill-none",
                              isPrereqLink
                                ? "stroke-ink"
                                : "stroke-[var(--sun-deep)]"
                            )}
                          />
                        ) : null}

                        {/* Selected beacon ring */}
                        {isSelected ? (
                          <circle
                            cx={town.x}
                            cy={town.y}
                            r={TOWN_RADIUS + 4.4}
                            strokeWidth={1.6}
                            className="fill-none stroke-ink"
                          />
                        ) : null}

                        {/* Main town marker */}
                        <circle
                          cx={town.x}
                          cy={town.y}
                          r={TOWN_RADIUS}
                          strokeWidth={isSelected ? 1.6 : 1.25}
                          className={cn(
                            "origin-center transition-transform duration-150 [transform-box:fill-box] group-hover/town:scale-[1.45] group-hover/town:stroke-ink group-focus-visible/town:scale-[1.45] group-focus-visible/town:stroke-ink",
                            isSelected && "scale-[1.35]",
                            isCompleted
                              ? "fill-sun stroke-ink"
                              : "fill-paper-raised stroke-ink-soft"
                          )}
                        />

                        {/* Simulator double-ring / bullseye symbol */}
                        {showSimRing ? (
                          <>
                            <circle
                              cx={town.x}
                              cy={town.y}
                              r={TOWN_RADIUS + 2.1}
                              strokeWidth={0.95}
                              className="pointer-events-none fill-none stroke-ink-soft"
                            />
                            <circle
                              cx={town.x}
                              cy={town.y}
                              r={1.55}
                              className="pointer-events-none fill-ink"
                            />
                          </>
                        ) : isSimulator ? (
                          <circle
                            cx={town.x}
                            cy={town.y}
                            r={1.45}
                            className="pointer-events-none fill-ink-soft"
                          />
                        ) : null}

                        {/* Bookmarked pennant above town */}
                        {showPennant ? (
                          <g
                            aria-hidden
                            className="pointer-events-none"
                          >
                            <line
                              x1={town.x + 1.5}
                              y1={town.y - TOWN_RADIUS - 0.5}
                              x2={town.x + 1.5}
                              y2={town.y - TOWN_RADIUS - 8.5}
                              strokeWidth={1.1}
                              className="stroke-ink"
                            />
                            <path
                              d={`M${town.x + 1.5} ${town.y - TOWN_RADIUS - 8.5}L${town.x + 7} ${town.y - TOWN_RADIUS - 6.3}L${town.x + 1.5} ${town.y - TOWN_RADIUS - 4.1}Z`}
                              className="fill-ink"
                            />
                          </g>
                        ) : null}

                        {/* Keyboard focus ring */}
                        <circle
                          cx={town.x}
                          cy={town.y}
                          r={10}
                          strokeWidth={1.5}
                          className="fill-none stroke-ink opacity-0 group-focus-visible/town:opacity-100"
                        />
                      </Link>
                    );
                  })}
                </g>
              );
            })}

            {/* Semantic zoom town labels (zoom >= 1.45) */}
            {showTownLabels ? (
              <g aria-hidden className="pointer-events-none">
                {map.islands.flatMap((island) =>
                  island.towns.map((town) => {
                    const isSelected = activeSelectedSlug === town.slug;
                    const isIlluminated = illuminatedSlug === town.slug;
                    const isDimmed =
                      Boolean(effectiveHighlights) &&
                      !effectiveHighlights?.has(town.slug) &&
                      !isSelected &&
                      !isIlluminated;
                    const fontSize = Math.max(
                      5.4,
                      Math.min(8.8, 11.4 / Math.pow(zoom, 0.52))
                    );
                    const haloStroke = Math.max(1.6, 2.8 / Math.sqrt(zoom));
                    const gap = TOWN_RADIUS + 4.2 / Math.sqrt(zoom);

                    let x = town.x;
                    let y = town.y;
                    let textAnchor: "start" | "middle" | "end" = "middle";
                    let dominantBaseline: "auto" | "central" | "hanging" =
                      "central";

                    if (town.labelSide === "above") {
                      y = town.y - gap;
                      dominantBaseline = "auto";
                    } else if (town.labelSide === "below") {
                      y = town.y + gap + 0.5;
                      dominantBaseline = "hanging";
                    } else if (town.labelSide === "left") {
                      x = town.x - gap;
                      textAnchor = "end";
                    } else {
                      x = town.x + gap;
                      textAnchor = "start";
                    }

                    return (
                      <text
                        key={`lbl-${town.slug}`}
                        x={x}
                        y={y}
                        textAnchor={textAnchor}
                        dominantBaseline={dominantBaseline}
                        fontSize={fontSize}
                        stroke="var(--paper-raised)"
                        strokeWidth={haloStroke}
                        strokeLinejoin="round"
                        style={{ paintOrder: "stroke" }}
                        className={cn(
                          "font-sans",
                          isSelected || isIlluminated
                            ? "fill-ink font-semibold"
                            : "fill-ink-body font-medium",
                          isDimmed && "opacity-25"
                        )}
                      >
                        {town.title}
                      </text>
                    );
                  })
                )}
              </g>
            ) : null}

            {/* World-zoom floating cartographic nameplate */}
            {nameplateTown ? (
              <WorldNameplate town={nameplateTown} viewBox={viewBox} />
            ) : null}
          </svg>
        </div>

        {/* Integrated Waypoint Card when a town is selected */}
        {selectedTopic ? (
          <WaypointCard
            topic={selectedTopic}
            mode={mode}
            isCompleted={completedSet.has(selectedTopic.slug)}
            isSaved={savedSet.has(selectedTopic.slug)}
            isNextUp={nextUpSet.has(selectedTopic.slug)}
            prereqs={selectedPrereqs}
            dependents={selectedDependents}
            completedSet={completedSet}
            nextUpSet={nextUpSet}
            onClose={() => selectTown(null)}
            onNavigateTown={(slug) => selectTown(slug, { pan: true })}
            onToggleRead={() => toggleTopicCompleted(selectedTopic.slug)}
            onToggleSave={() => toggleTopicBookmark(selectedTopic.slug)}
            renderTopicExtra={renderTopicExtra}
          />
        ) : null}

        {/* Cartographic Legend & Readout Footer */}
        <div className="relative flex flex-col gap-3 border-t border-line bg-paper-raised px-5 py-3.5 text-sm text-ink-soft lg:flex-row lg:items-center lg:justify-between sm:px-6">
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
            <li className="flex items-center gap-2">
              <span
                aria-hidden
                className="block size-[9px] rounded-full border border-ink-soft bg-paper-raised"
              />
              Not read yet
            </li>
            <li className="flex items-center gap-2">
              <span
                aria-hidden
                className="block size-[9px] rounded-full border border-ink bg-sun"
              />
              Read
            </li>
            <li className="flex items-center gap-2">
              <span
                aria-hidden
                className="relative flex size-3.5 items-center justify-center rounded-full border border-ink-soft"
              >
                <span className="size-1.5 rounded-full bg-ink" />
              </span>
              Simulator
            </li>
            <li className="flex items-center gap-2">
              <span
                aria-hidden
                className="block size-3 rounded-full border border-dashed border-[var(--sun-deep)]"
              />
              Next up
            </li>
            <li className="flex items-center gap-2">
              <svg
                aria-hidden
                viewBox="0 0 18 6"
                className="h-1.5 w-4 overflow-visible"
              >
                <line
                  x1={0}
                  y1={3}
                  x2={18}
                  y2={3}
                  strokeWidth={1.5}
                  className="stroke-ink"
                />
              </svg>
              Land route
            </li>
            <li className="flex items-center gap-2">
              <svg
                aria-hidden
                viewBox="0 0 18 6"
                className="h-1.5 w-4 overflow-visible"
              >
                <line
                  x1={0}
                  y1={3}
                  x2={18}
                  y2={3}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  className="stroke-[var(--sun-deep)]"
                />
              </svg>
              Sea crossing
            </li>
          </ul>
          <p
            aria-live="off"
            className={cn(
              "h-5 min-w-0 truncate text-xs lg:max-w-[26rem] lg:text-end",
              readoutTopic && "font-medium text-ink"
            )}
          >
            {readoutText}
          </p>
        </div>
      </div>
    </div>
  );
}

function LayerSwatch({
  layer,
  active,
}: {
  layer: AtlasLayer;
  active: boolean;
}) {
  if (layer === "routes") {
    return (
      <svg aria-hidden viewBox="0 0 12 8" className="h-2 w-3">
        <path
          d="M1 6 Q6 1 11 6"
          fill="none"
          strokeWidth={1.4}
          strokeDasharray="2.5 1.5"
          className={active ? "stroke-ink" : "stroke-ink-soft"}
        />
      </svg>
    );
  }
  if (layer === "next-up") {
    return (
      <span
        aria-hidden
        className="block size-2.5 rounded-full border border-dashed border-[var(--sun-deep)]"
      />
    );
  }
  if (layer === "simulators") {
    return (
      <span
        aria-hidden
        className="flex size-2.5 items-center justify-center rounded-full border border-ink-soft"
      >
        <span className="size-1 rounded-full bg-ink" />
      </span>
    );
  }
  return (
    <Bookmark
      aria-hidden
      className={cn("size-2.5", active ? "fill-ink text-ink" : "text-ink-soft")}
    />
  );
}

function WorldNameplate({
  town,
  viewBox,
}: {
  town: MapTown;
  viewBox: MapViewBox;
}) {
  const pw = Math.min(260, Math.max(84, town.title.length * 6.3 + 22));
  const ph = 22;
  const px = Math.max(
    viewBox.x + 8,
    Math.min(viewBox.x + viewBox.w - pw - 8, town.x - pw / 2)
  );
  const fitsAbove = town.y - 13 - ph >= viewBox.y + 8;
  const py = fitsAbove ? town.y - 13 - ph : town.y + 13;
  const stemY1 = fitsAbove ? py + ph : py;
  const stemY2 = fitsAbove
    ? town.y - TOWN_RADIUS - 2
    : town.y + TOWN_RADIUS + 2;

  return (
    <g aria-hidden className="pointer-events-none">
      <line
        x1={town.x}
        y1={stemY1}
        x2={town.x}
        y2={stemY2}
        strokeWidth={1}
        className="stroke-ink"
      />
      <rect
        x={px}
        y={py}
        width={pw}
        height={ph}
        rx={2.5}
        strokeWidth={1.1}
        className="fill-paper-raised stroke-ink"
      />
      <text
        x={px + pw / 2}
        y={py + ph / 2 + 0.5}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={10.5}
        className="font-sans fill-ink font-medium"
      >
        {town.title}
      </text>
    </g>
  );
}

function WaypointCard({
  topic,
  mode,
  isCompleted,
  isSaved,
  isNextUp,
  prereqs,
  dependents,
  completedSet,
  nextUpSet,
  onClose,
  onNavigateTown,
  onToggleRead,
  onToggleSave,
  renderTopicExtra,
}: {
  topic: AtlasTopicData;
  mode: "home" | "explorer" | "locator";
  isCompleted: boolean;
  isSaved: boolean;
  isNextUp: boolean;
  prereqs: AtlasTopicData[];
  dependents: AtlasTopicData[];
  completedSet: ReadonlySet<string>;
  nextUpSet: ReadonlySet<string>;
  onClose: () => void;
  onNavigateTown: (slug: string) => void;
  onToggleRead: () => void;
  onToggleSave: () => void;
  renderTopicExtra?: (topic: AtlasTopicData) => ReactNode;
}) {
  const extra = renderTopicExtra ? renderTopicExtra(topic) : null;

  return (
    <section
      aria-live="polite"
      aria-label={`Selected town: ${topic.title}`}
      className="border-t border-line bg-paper-raised px-5 py-5 sm:px-6 sm:py-6"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="font-display text-sm italic tracking-[0.06em] text-ink-soft">
              {topic.regionLabel}
            </span>
            <span aria-hidden className="text-ink-faint">
              /
            </span>
            <Link
              href={`/topics#${topic.trackId}`}
              className="text-ink-soft underline decoration-transparent underline-offset-4 hover:text-ink hover:decoration-line-strong"
            >
              {topic.trackTitle}
            </Link>
            <span className="rounded-[var(--radius-chip)] border border-line bg-paper px-2 py-0.5 font-mono text-[11px] text-ink-soft tabular-nums">
              {topic.minutes} min read
            </span>
            {topic.simulator ? (
              <span className="rounded-[var(--radius-chip)] bg-sun-wash px-2 py-0.5 text-[11px] font-medium text-ink">
                Simulator
              </span>
            ) : null}
            {isCompleted ? (
              <span className="inline-flex items-center gap-1 rounded-[var(--radius-chip)] border border-ink/25 bg-sun px-2 py-0.5 text-[11px] font-medium text-ink">
                <Check className="size-3" aria-hidden />
                <span>Read</span>
              </span>
            ) : isNextUp ? (
              <span className="rounded-[var(--radius-chip)] border border-dashed border-[var(--sun-deep)] bg-sun-wash px-2 py-0.5 text-[11px] font-medium text-ink">
                Next up
              </span>
            ) : null}
          </div>

          <h3 className="font-display text-2xl leading-snug font-[450] tracking-[-0.02em] text-ink">
            {topic.title}
          </h3>

          {topic.summary ? (
            <p className="max-w-[66ch] text-sm leading-relaxed text-ink-body">
              {topic.summary}
            </p>
          ) : null}

          {topic.standard.length > 0 ? (
            <ul
              aria-label="ISO C++ standard clauses"
              className="flex flex-wrap items-center gap-1.5 pt-0.5"
            >
              {topic.standard.map((clause) => (
                <li key={clause}>
                  <a
                    href={standardRefToUrl(clause)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-[var(--radius-chip)] border border-line bg-paper px-2 py-0.5 font-mono text-[11px] text-ink-soft hover:border-ink/40 hover:text-ink"
                  >
                    <span>{clause}</span>
                    <ExternalLink className="size-2.5" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={isCompleted}
            onClick={onToggleRead}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors cursor-pointer",
              isCompleted
                ? "border-ink/30 bg-sun text-ink"
                : "border-line-strong bg-paper-raised text-ink hover:border-ink/40"
            )}
          >
            <Check className="size-3.5" aria-hidden />
            <span>{isCompleted ? "Read" : "Mark read"}</span>
          </button>

          <button
            type="button"
            aria-pressed={isSaved}
            onClick={onToggleSave}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors cursor-pointer",
              isSaved
                ? "border-ink/30 bg-sun-wash text-ink"
                : "border-line-strong bg-paper-raised text-ink hover:border-ink/40"
            )}
          >
            <Bookmark
              className="size-3.5"
              fill={isSaved ? "currentColor" : "none"}
              aria-hidden
            />
            <span>{isSaved ? "Saved" : "Save"}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close waypoint card"
            className="inline-flex size-8 items-center justify-center rounded-full border border-line bg-paper text-ink-soft hover:border-line-strong hover:text-ink cursor-pointer"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>

      <div
        className={cn(
          "mt-5 grid gap-5 border-t border-line pt-4",
          extra ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_18rem]" : "md:grid-cols-2"
        )}
      >
        {/* Read first & Unlocks next */}
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-medium text-ink">
              Read first ({prereqs.length})
            </p>
            {prereqs.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {prereqs.map((pre) => {
                  const done = completedSet.has(pre.slug);
                  return (
                    <button
                      key={pre.slug}
                      type="button"
                      onClick={() => onNavigateTown(pre.slug)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                        done
                          ? "border-ink/30 bg-sun-wash text-ink hover:bg-sun/60"
                          : "border-line-strong bg-paper text-ink-body hover:border-ink/40 hover:text-ink"
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "size-2 rounded-full border",
                          done
                            ? "border-ink bg-sun"
                            : "border-ink-soft bg-paper-raised"
                        )}
                      />
                      <span>{pre.title}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-ink-faint">
                No prerequisites. Good place to start.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-ink">
              Unlocks next ({dependents.length})
            </p>
            {dependents.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {dependents.map((dep) => {
                  const done = completedSet.has(dep.slug);
                  const ready = nextUpSet.has(dep.slug);
                  return (
                    <button
                      key={dep.slug}
                      type="button"
                      onClick={() => onNavigateTown(dep.slug)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                        done
                          ? "border-ink/30 bg-sun-wash text-ink hover:bg-sun/60"
                          : ready
                            ? "border-dashed border-[var(--sun-deep)] bg-sun-wash/50 text-ink hover:bg-sun-wash"
                            : "border-line-strong bg-paper text-ink-body hover:border-ink/40 hover:text-ink"
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "size-2 rounded-full border",
                          done
                            ? "border-ink bg-sun"
                            : "border-[var(--sun-deep)] bg-paper-raised"
                        )}
                      />
                      <span>{dep.title}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-ink-faint">
                End-of-branch specialization topic.
              </p>
            )}
          </div>
        </div>

        {/* Offline cppreference links */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-ink">
            Reference addresses ({topic.cppreference.length})
          </p>
          {topic.cppreference.length > 0 ? (
            <ul className="space-y-1.5">
              {topic.cppreference.slice(0, 4).map((ref) => (
                <li key={ref.path} className="min-w-0">
                  {ref.local ? (
                    <Link
                      href={ref.href}
                      className="group inline-flex max-w-full flex-col rounded-sm"
                    >
                      <span className="truncate text-xs font-medium text-ink underline decoration-line-strong underline-offset-3 group-hover:decoration-ink">
                        {ref.title}
                      </span>
                      <span className="truncate font-mono text-[11px] text-ink-faint">
                        /w/cpp/{ref.path}
                      </span>
                    </Link>
                  ) : (
                    <a
                      href={ref.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group inline-flex max-w-full flex-col rounded-sm"
                    >
                      <span className="inline-flex items-center gap-1 truncate text-xs font-medium text-ink underline decoration-line-strong underline-offset-3 group-hover:decoration-ink">
                        <span className="truncate">{ref.title}</span>
                        <ExternalLink className="size-2.5 shrink-0" aria-hidden />
                      </span>
                      <span className="truncate font-mono text-[11px] text-ink-faint">
                        {ref.path}
                      </span>
                    </a>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-ink-faint">
              No direct cppreference links listed.
            </p>
          )}
        </div>

        {/* Optional caller inset (e.g. MapPreview in AtlasExplorerClient) */}
        {extra ? (
          <div className="rounded-[var(--radius-chip)] border border-line bg-paper p-3">
            {extra}
          </div>
        ) : null}
      </div>

      {/* Direct action links */}
      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <Link
          href={`/topics/${topic.slug}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-ink px-3.5 text-xs font-medium text-paper transition-colors hover:bg-ink/85"
        >
          <BookOpen className="size-3.5" aria-hidden />
          <span>Read topic</span>
        </Link>

        <Link
          href={`/topics/${topic.slug}?view=map`}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line-strong bg-paper-raised px-3.5 text-xs font-medium text-ink transition-colors hover:border-ink/40 hover:bg-paper"
        >
          <Network className="size-3.5" aria-hidden />
          <span>{topic.simulator ? "Simulator" : "Concept map"}</span>
        </Link>

        {topic.questionCount > 0 ? (
          <Link
            href={`/topics/${topic.slug}?view=quiz`}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-sun px-3.5 text-xs font-medium text-ink transition-colors hover:bg-sun/90"
          >
            <ListChecks className="size-3.5" aria-hidden />
            <span>Quiz ({topic.questionCount})</span>
          </Link>
        ) : null}

        {mode !== "explorer" ? (
          <Link
            href={`/maps?topic=${topic.slug}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-paper px-3.5 text-xs font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
          >
            <MapPin className="size-3.5" aria-hidden />
            <span>Open full Atlas</span>
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function MobileAtlasList({
  regions,
  read,
  saved,
  nextUp,
  selectedSlug,
  highlightedSlugs,
  showNextUp,
  showSimulators,
  showSaved,
  onSelect,
}: {
  regions: AtlasRegionData[];
  read: ReadonlySet<string>;
  saved: ReadonlySet<string>;
  nextUp: ReadonlySet<string>;
  selectedSlug: string | null;
  highlightedSlugs: ReadonlySet<string> | null;
  showNextUp: boolean;
  showSimulators: boolean;
  showSaved: boolean;
  onSelect: (slug: string) => void;
}) {
  return (
    <div className="relative grid max-h-[26rem] gap-x-8 gap-y-8 overflow-y-auto px-5 py-6 sm:grid-cols-2 sm:px-6">
      {regions.map((region) => (
        <div key={region.id}>
          <h3 className="font-display text-[0.975rem] italic tracking-[0.08em] text-ink-soft">
            {region.label}
          </h3>
          <ul className="mt-3 space-y-3.5">
            {region.tracks.map((track) => (
              <li key={track.id}>
                <Link
                  href={`/topics#${track.id}`}
                  className="rounded-sm font-display text-[1.15rem] leading-snug font-[450] tracking-[-0.02em] text-ink decoration-sun decoration-[2.5px] underline-offset-[4px] hover:underline"
                >
                  {track.title}
                </Link>
                <ul className="-ml-1 mt-1 flex flex-wrap gap-1">
                  {track.topics.map((topic) => {
                    const isRead = read.has(topic.slug);
                    const isSel = selectedSlug === topic.slug;
                    const isDim =
                      Boolean(highlightedSlugs) &&
                      !highlightedSlugs?.has(topic.slug) &&
                      !isSel;
                    const isSim = showSimulators && Boolean(topic.simulator);
                    const isReady = showNextUp && nextUp.has(topic.slug);
                    const isBookmarked = showSaved && saved.has(topic.slug);

                    return (
                      <li key={topic.slug}>
                        <button
                          type="button"
                          onClick={() => onSelect(topic.slug)}
                          aria-label={topic.title}
                          aria-pressed={isSel}
                          className={cn(
                            "relative flex size-6 items-center justify-center rounded-full cursor-pointer",
                            isDim && "opacity-25",
                            isSel && "ring-2 ring-ink ring-offset-1 ring-offset-paper-raised"
                          )}
                        >
                          <span
                            aria-hidden
                            className={cn(
                              "flex size-[10px] items-center justify-center rounded-full border transition-transform",
                              isRead
                                ? "border-ink bg-sun"
                                : "border-ink-soft bg-paper-raised",
                              isReady && "ring-1 ring-dashed ring-[var(--sun-deep)] ring-offset-1"
                            )}
                          >
                            {isSim ? (
                              <span className="size-[3px] rounded-full bg-ink" />
                            ) : null}
                          </span>
                          {isBookmarked ? (
                            <span
                              aria-hidden
                              className="absolute top-0 right-0 size-1.5 rounded-full bg-ink"
                            />
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
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

/** A subtle graphic scale bar in the southeast open sea. */
function ScaleBar() {
  const { x, y } = SCALE_BAR;
  const segW = 28;
  const barH = 4;
  return (
    <g aria-hidden className="pointer-events-none">
      <text
        x={x}
        y={y - 6}
        fontSize={9.5}
        letterSpacing="0.06em"
        className="font-display fill-ink-soft italic"
      >
        Atlas scale
      </text>
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          x={x + i * segW}
          y={y}
          width={segW}
          height={barH}
          strokeWidth={0.8}
          className={cn(
            "stroke-ink-soft",
            i % 2 === 0 ? "fill-ink-soft" : "fill-paper-raised"
          )}
        />
      ))}
      <text
        x={x}
        y={y + 13}
        textAnchor="middle"
        fontSize={8.5}
        className="font-mono fill-ink-soft"
      >
        0
      </text>
      <text
        x={x + segW * 2}
        y={y + 13}
        textAnchor="middle"
        fontSize={8.5}
        className="font-mono fill-ink-soft"
      >
        2
      </text>
      <text
        x={x + segW * 4}
        y={y + 13}
        textAnchor="middle"
        fontSize={8.5}
        className="font-mono fill-ink-soft"
      >
        4 continents
      </text>
    </g>
  );
}
