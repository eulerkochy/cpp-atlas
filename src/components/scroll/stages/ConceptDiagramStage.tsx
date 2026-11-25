"use client";

import { useId, useMemo } from "react";
import type {
  ConceptStageBeat,
  ConceptStageData,
  ConceptStageEdge,
  ConceptStageNode,
} from "@/lib/scroll-types";

export interface ConceptDiagramStageProps {
  stage: ConceptStageData;
  progress: number;
  isActive: boolean;
  isPaused: boolean;
  isRotated: boolean;
  captionsEnabled: boolean;
}

interface PositionedNode {
  node: ConceptStageNode;
  x: number; // left
  y: number; // top
  w: number;
  h: number;
  cx: number;
  cy: number;
  depth: number;
  lines: string[];
  subLine?: string;
}

interface RoutedEdge {
  index: number;
  edge: ConceptStageEdge;
  d: string;
  labelX: number;
  labelY: number;
}

type LayoutOrientation = "tb" | "lr" | "hub" | "grid";

const CANVAS_W = 640;
const CANVAS_H = 360;
const SAFE_LEFT = 24;
const SAFE_RIGHT = 616;
const SAFE_TOP = 54;
const SAFE_BOTTOM = 296;

function wrapLabel(text: string, maxChars: number, maxLines: number): string[] {
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean) return [""];
  const limit = Math.max(8, maxChars);
  if (clean.length <= limit) return [clean];

  const words = clean.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    if (current.length + 1 + word.length <= limit) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) {
        break;
      }
    }
  }

  // Append remaining words onto the final line if we broke early
  const consumedWords = lines.join(" ").split(" ").filter(Boolean).length;
  const remaining =
    lines.length === maxLines - 1
      ? words.slice(consumedWords).join(" ")
      : current;

  if (remaining) {
    if (remaining.length > limit) {
      lines.push(`${remaining.slice(0, Math.max(4, limit - 1)).trimEnd()}…`);
    } else {
      lines.push(remaining);
    }
  }

  return lines.slice(0, maxLines);
}

function truncateLine(text: string, maxChars: number): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, Math.max(4, maxChars - 1)).trimEnd()}…`;
}

function resolveNodeTone(
  group?: string,
  label?: string
): "coral" | "emerald" | "amber" | "white" {
  const combined = `${group ?? ""} ${label ?? ""}`.toLowerCase();
  if (
    /\bub\b|trap|pitfall|danger|error|invalid|dangling|hazard|race|leak/.test(
      combined
    )
  ) {
    return "coral";
  }
  if (
    group?.toLowerCase() === "leaf" ||
    /safe|modern|valid|guarantee|elision|zero[- ]cost|verified/.test(combined)
  ) {
    return "emerald";
  }
  if (/\bptr\b|pointer|lifetime|temp|warn|constraint|order/.test(combined)) {
    return "amber";
  }
  return "white";
}

function getBoxBorderPoint(
  box: { cx: number; cy: number; w: number; h: number },
  targetX: number,
  targetY: number,
  pad: number
): { x: number; y: number } {
  const dx = targetX - box.cx;
  const dy = targetY - box.cy;
  if (dx === 0 && dy === 0) return { x: box.cx, y: box.cy };
  const hw = box.w / 2 + pad;
  const hh = box.h / 2 + pad;
  const scale = 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh);
  return {
    x: box.cx + dx * scale,
    y: box.cy + dy * scale,
  };
}

function computeConceptLayout(
  rawNodes: ConceptStageNode[],
  edges: ConceptStageEdge[]
): {
  nodes: PositionedNode[];
  edges: RoutedEdge[];
  orientation: LayoutOrientation;
} {
  // Deduplicate nodes preserving order (cap gracefully at 12 for crisp 16:9 readability)
  const seen = new Set<string>();
  const uniqueNodes: ConceptStageNode[] = [];
  for (const n of rawNodes) {
    if (!n?.id || seen.has(n.id)) continue;
    seen.add(n.id);
    uniqueNodes.push(n);
    if (uniqueNodes.length >= 12) break;
  }

  if (uniqueNodes.length === 0) {
    return { nodes: [], edges: [], orientation: "grid" };
  }

  const nodeById = new Map(uniqueNodes.map((n) => [n.id, n]));
  const validEdges = edges
    .map((edge, index) => ({ edge, index }))
    .filter(
      ({ edge }) =>
        edge.from !== edge.to && nodeById.has(edge.from) && nodeById.has(edge.to)
    );

  // Build adjacency and in-degree
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const n of uniqueNodes) {
    outgoing.set(n.id, []);
    incoming.set(n.id, []);
  }
  for (const { edge } of validEdges) {
    outgoing.get(edge.from)!.push(edge.to);
    incoming.get(edge.to)!.push(edge.from);
  }

  // BFS depth assignment
  const depthMap = new Map<string, number>();
  const roots = uniqueNodes.filter((n) => (incoming.get(n.id)?.length ?? 0) === 0);
  const seeds = roots.length > 0 ? roots : [uniqueNodes[0]];
  const queue: string[] = [];

  for (const seed of seeds) {
    depthMap.set(seed.id, 0);
    queue.push(seed.id);
  }

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const curDepth = depthMap.get(cur) ?? 0;
    for (const next of outgoing.get(cur) ?? []) {
      if (!depthMap.has(next)) {
        depthMap.set(next, curDepth + 1);
        queue.push(next);
      }
    }
  }

  // Assign any disconnected / cycle-isolated nodes
  for (const n of uniqueNodes) {
    if (!depthMap.has(n.id)) {
      depthMap.set(n.id, 0);
    }
  }

  // Group into layers
  const maxDepth = Math.max(...Array.from(depthMap.values()));
  const layers: ConceptStageNode[][] = Array.from(
    { length: maxDepth + 1 },
    () => []
  );
  for (const n of uniqueNodes) {
    layers[depthMap.get(n.id) ?? 0].push(n);
  }

  const layerCount = layers.length;
  const maxLayerSize = Math.max(...layers.map((l) => l.length));
  const safeW = SAFE_RIGHT - SAFE_LEFT;
  const safeH = SAFE_BOTTOM - SAFE_TOP;

  let orientation: LayoutOrientation;
  if (validEdges.length === 0 || layerCount === 1) {
    orientation = "grid";
  } else if (
    layerCount === 2 &&
    layers[0].length === 1 &&
    layers[1].length >= 5
  ) {
    orientation = "hub";
  } else if (
    layerCount >= 4 ||
    (layerCount === 3 && maxLayerSize <= 3) ||
    (layerCount === 2 && layers[0].length >= 2 && layers[1].length >= 2 && maxLayerSize <= 3)
  ) {
    orientation = "lr";
  } else {
    orientation = "tb";
  }

  const posMap = new Map<string, PositionedNode>();

  const buildPositioned = (
    node: ConceptStageNode,
    cx: number,
    cy: number,
    w: number,
    h: number,
    depth: number
  ): PositionedNode => {
    const charsPerLine = Math.max(10, Math.floor((w - 18) / 6.4));
    const lines = wrapLabel(node.label, charsPerLine, 2);
    const showSub = Boolean(node.sub && h >= 44);
    const subLine = showSub
      ? truncateLine(node.sub!, Math.max(11, Math.floor((w - 16) / 5.4)))
      : undefined;
    return {
      node,
      x: cx - w / 2,
      y: cy - h / 2,
      w,
      h,
      cx,
      cy,
      depth,
      lines,
      subLine,
    };
  };

  if (orientation === "grid") {
    const count = uniqueNodes.length;
    const cols = count <= 2 ? count : count <= 4 ? 2 : count <= 9 ? 3 : 4;
    const rows = Math.ceil(count / cols);
    const gapX = cols >= 4 ? 14 : 22;
    const gapY = rows >= 3 ? 14 : 22;
    const nodeW = Math.max(110, Math.min(182, Math.floor((safeW - (cols - 1) * gapX) / cols)));
    const nodeH = Math.max(44, Math.min(62, Math.floor((safeH - (rows - 1) * gapY) / rows)));
    const totalH = rows * nodeH + (rows - 1) * gapY;
    const startY = SAFE_TOP + (safeH - totalH) / 2;

    for (let r = 0; r < rows; r++) {
      const rowNodes = uniqueNodes.slice(r * cols, (r + 1) * cols);
      const totalRowW = rowNodes.length * nodeW + (rowNodes.length - 1) * gapX;
      const startX = SAFE_LEFT + (safeW - totalRowW) / 2;
      const cy = startY + r * (nodeH + gapY) + nodeH / 2;
      rowNodes.forEach((node, c) => {
        const cx = startX + c * (nodeW + gapX) + nodeW / 2;
        posMap.set(node.id, buildPositioned(node, cx, cy, nodeW, nodeH, 0));
      });
    }
  } else if (orientation === "hub") {
    const root = layers[0][0];
    const leaves = layers[1];
    const leftCount = Math.ceil(leaves.length / 2);
    const leftLeaves = leaves.slice(0, leftCount);
    const rightLeaves = leaves.slice(leftCount);

    const centerW = 152;
    const centerH = 56;
    const centerX = CANVAS_W / 2;
    const centerY = SAFE_TOP + safeH / 2;
    posMap.set(root.id, buildPositioned(root, centerX, centerY, centerW, centerH, 0));

    const sideW = 156;
    const placeColumn = (items: ConceptStageNode[], cx: number) => {
      const n = items.length;
      if (n === 0) return;
      const gapY = n >= 4 ? 10 : 16;
      const nodeH = Math.max(38, Math.min(54, Math.floor((safeH - (n - 1) * gapY) / n)));
      const totalH = n * nodeH + (n - 1) * gapY;
      const startY = SAFE_TOP + (safeH - totalH) / 2;
      items.forEach((node, idx) => {
        const cy = startY + idx * (nodeH + gapY) + nodeH / 2;
        posMap.set(node.id, buildPositioned(node, cx, cy, sideW, nodeH, 1));
      });
    };

    placeColumn(leftLeaves, SAFE_LEFT + sideW / 2 + 4);
    placeColumn(rightLeaves, SAFE_RIGHT - sideW / 2 - 4);
  } else if (orientation === "lr") {
    const gapX = layerCount >= 5 ? 16 : 26;
    const nodeW = Math.max(
      96,
      Math.min(162, Math.floor((safeW - (layerCount - 1) * gapX) / layerCount))
    );
    const totalW = layerCount * nodeW + (layerCount - 1) * gapX;
    const startX = SAFE_LEFT + (safeW - totalW) / 2;

    layers.forEach((layer, colIdx) => {
      // Barycenter sort against previously placed parents
      const ordered = [...layer];
      if (colIdx > 0) {
        ordered.sort((a, b) => {
          const avgY = (id: string) => {
            const parents = (incoming.get(id) ?? [])
              .map((pid) => posMap.get(pid)?.cy)
              .filter((v): v is number => typeof v === "number");
            return parents.length > 0
              ? parents.reduce((s, v) => s + v, 0) / parents.length
              : CANVAS_H / 2;
          };
          return avgY(a.id) - avgY(b.id);
        });
      }

      const k = ordered.length;
      const gapY = k >= 4 ? 10 : 18;
      const nodeH = Math.max(38, Math.min(58, Math.floor((safeH - (k - 1) * gapY) / k)));
      const totalH = k * nodeH + (k - 1) * gapY;
      const startY = SAFE_TOP + (safeH - totalH) / 2;
      const cx = startX + colIdx * (nodeW + gapX) + nodeW / 2;

      ordered.forEach((node, rowIdx) => {
        const cy = startY + rowIdx * (nodeH + gapY) + nodeH / 2;
        posMap.set(node.id, buildPositioned(node, cx, cy, nodeW, nodeH, colIdx));
      });
    });
  } else {
    // Top-to-Bottom layered tree/DAG
    const gapY = layerCount === 2 ? 44 : 30;
    const nodeH = Math.max(
      42,
      Math.min(layerCount === 3 ? 50 : 56, Math.floor((safeH - (layerCount - 1) * gapY) / layerCount))
    );
    const totalH = layerCount * nodeH + (layerCount - 1) * gapY;
    const startY = SAFE_TOP + (safeH - totalH) / 2;

    layers.forEach((layer, rowIdx) => {
      const ordered = [...layer];
      if (rowIdx > 0) {
        ordered.sort((a, b) => {
          const avgX = (id: string) => {
            const parents = (incoming.get(id) ?? [])
              .map((pid) => posMap.get(pid)?.cx)
              .filter((v): v is number => typeof v === "number");
            return parents.length > 0
              ? parents.reduce((s, v) => s + v, 0) / parents.length
              : CANVAS_W / 2;
          };
          return avgX(a.id) - avgX(b.id);
        });
      }

      const k = ordered.length;
      const gapX = k >= 5 ? 10 : k === 4 ? 14 : 20;
      const nodeW = Math.max(
        96,
        Math.min(184, Math.floor((safeW - (k - 1) * gapX) / k))
      );
      const totalW = k * nodeW + (k - 1) * gapX;
      const startX = SAFE_LEFT + (safeW - totalW) / 2;
      const cy = startY + rowIdx * (nodeH + gapY) + nodeH / 2;

      ordered.forEach((node, colIdx) => {
        const cx = startX + colIdx * (nodeW + gapX) + nodeW / 2;
        posMap.set(node.id, buildPositioned(node, cx, cy, nodeW, nodeH, rowIdx));
      });
    });
  }

  // Route crisp edges between positioned nodes
  const routedEdges: RoutedEdge[] = [];
  for (const { edge, index } of validEdges) {
    const src = posMap.get(edge.from);
    const dst = posMap.get(edge.to);
    if (!src || !dst) continue;

    let d: string;
    let labelX: number;
    let labelY: number;

    const dy = dst.cy - src.cy;
    const dx = dst.cx - src.cx;

    if (orientation === "tb" && Math.abs(dy) > 20) {
      const goingDown = dy > 0;
      const x1 = src.cx;
      const y1 = goingDown ? src.y + src.h + 1 : src.y - 1;
      const x2 = dst.cx;
      const y2 = goingDown ? dst.y - 6 : dst.y + dst.h + 6;
      const midY = (y1 + y2) / 2;
      d = `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${x1.toFixed(1)} ${midY.toFixed(1)}, ${x2.toFixed(1)} ${midY.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`;
      labelX = (x1 + x2) / 2;
      labelY = midY;
    } else if ((orientation === "lr" || orientation === "hub") && Math.abs(dx) > 28) {
      const goingRight = dx > 0;
      const x1 = goingRight ? src.x + src.w + 1 : src.x - 1;
      const y1 = src.cy;
      const x2 = goingRight ? dst.x - 6 : dst.x + dst.w + 6;
      const y2 = dst.cy;
      const midX = (x1 + x2) / 2;
      d = `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${midX.toFixed(1)} ${y1.toFixed(1)}, ${midX.toFixed(1)} ${y2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`;
      labelX = midX;
      labelY = (y1 + y2) / 2;
    } else {
      const p1 = getBoxBorderPoint(src, dst.cx, dst.cy, 2);
      const p2 = getBoxBorderPoint(dst, src.cx, src.cy, 6);
      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2;
      const len = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
      const curve = Math.min(18, len * 0.12);
      const nx = -(p2.y - p1.y) / len;
      const ny = (p2.x - p1.x) / len;
      const cx = mx + nx * curve;
      const cy = my + ny * curve;
      d = `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
      labelX = 0.25 * p1.x + 0.5 * cx + 0.25 * p2.x;
      labelY = 0.25 * p1.y + 0.5 * cy + 0.25 * p2.y;
    }

    routedEdges.push({ index, edge, d, labelX, labelY });
  }

  return {
    nodes: uniqueNodes
      .map((n) => posMap.get(n.id))
      .filter((n): n is PositionedNode => Boolean(n)),
    edges: routedEdges,
    orientation,
  };
}

export function ConceptDiagramStage({
  stage,
  progress,
  isRotated,
  captionsEnabled,
}: ConceptDiagramStageProps) {
  const rawUid = useId();
  const uid = rawUid.replace(/[^a-zA-Z0-9_-]/g, "");

  const beats = stage.beats;
  const beatCount = Math.max(1, beats.length);
  const clampedProgress = Number.isFinite(progress)
    ? Math.min(1, Math.max(0, progress))
    : 0;
  const beatIndex = Math.min(beatCount - 1, Math.floor(clampedProgress * beatCount));
  const beatLocalProgress = Math.min(
    1,
    Math.max(0, clampedProgress * beatCount - beatIndex)
  );

  const activeBeat: ConceptStageBeat | undefined = beats[beatIndex];

  const layout = useMemo(
    () => computeConceptLayout(stage.nodes, stage.edges),
    [stage.nodes, stage.edges]
  );

  const { activeNodeSet, visitedNodeSet, activeEdgeSet, visitedEdgeSet } = useMemo(() => {
    const activeNodes = new Set<string>(activeBeat?.activeNodeIds ?? []);
    const visitedNodes = new Set<string>();
    const activeEdges = new Set<number>(activeBeat?.highlightEdgeIndices ?? []);
    const visitedEdges = new Set<number>();

    for (let i = 0; i < beatIndex; i++) {
      const b = beats[i];
      if (!b) continue;
      for (const id of b.activeNodeIds) visitedNodes.add(id);
      for (const idx of b.highlightEdgeIndices ?? []) visitedEdges.add(idx);
    }

    // If a beat doesn't specify explicit edge indices, softly illuminate edges
    // connecting active nodes or leading from visited -> active nodes.
    if (activeEdges.size === 0 && activeNodes.size > 0) {
      layout.edges.forEach(({ index, edge }) => {
        const bothActive = activeNodes.has(edge.from) && activeNodes.has(edge.to);
        const leadsIntoActive =
          (visitedNodes.has(edge.from) || activeNodes.has(edge.from)) &&
          activeNodes.has(edge.to);
        if (bothActive || leadsIntoActive) {
          activeEdges.add(index);
        }
      });
    }

    // Also mark edges between visited nodes as visited
    layout.edges.forEach(({ index, edge }) => {
      if (visitedNodes.has(edge.from) && visitedNodes.has(edge.to)) {
        visitedEdges.add(index);
      }
    });

    return {
      activeNodeSet: activeNodes,
      visitedNodeSet: visitedNodes,
      activeEdgeSet: activeEdges,
      visitedEdgeSet: visitedEdges,
    };
  }, [activeBeat, beatIndex, beats, layout.edges]);

  const beatCounterText = `${String(beatIndex + 1).padStart(2, "0")} / ${String(beatCount).padStart(2, "0")}`;

  return (
    <div className="scroll-stage-grid relative h-full w-full overflow-hidden">
      {/* Top HUD: Beat counter + active step title + micro progress pips */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-2 px-3 pt-2.5 sm:px-3.5 sm:pt-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 rounded border border-white/15 bg-black/75 px-1.5 py-0.5 font-mono text-[9.5px] font-medium tabular-nums tracking-wider text-white/75 backdrop-blur-sm sm:text-[10px]">
            {beatCounterText}
          </span>
          {activeBeat?.title ? (
            <span
              key={`title-${beatIndex}`}
              className="stage-beat-enter truncate rounded border border-white/12 bg-white/[0.06] px-2 py-0.5 text-[10.5px] font-medium tracking-tight text-white/95 backdrop-blur-sm sm:text-[11.5px]"
            >
              {activeBeat.title}
            </span>
          ) : null}
        </div>

        {/* Segmented beat progress bar */}
        <div className="flex shrink-0 items-center gap-1" aria-hidden="true">
          {beats.map((_, i) => {
            const fill =
              i < beatIndex ? 1 : i === beatIndex ? Math.max(0.15, beatLocalProgress) : 0;
            return (
              <div
                key={i}
                className="h-1 w-3.5 overflow-hidden rounded-full bg-white/15 sm:w-4"
              >
                <div
                  className="h-full origin-left rounded-full bg-white transition-transform duration-150 ease-linear"
                  style={{ transform: `scaleX(${fill})` }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Crisp Manim 16:9 Vector Diagram */}
      <svg
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        className="h-full w-full"
        role="img"
        aria-label={activeBeat?.title ? `Concept diagram: ${activeBeat.title}` : "Concept diagram"}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <marker
            id={`${uid}-arrow-dim`}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="5.5"
            markerHeight="5.5"
            orient="auto-start-reverse"
          >
            <path d="M 1 1.5 L 8.5 5 L 1 8.5 z" fill="rgba(255,255,255,0.22)" />
          </marker>
          <marker
            id={`${uid}-arrow-visited`}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 1 1.5 L 8.5 5 L 1 8.5 z" fill="rgba(255,255,255,0.52)" />
          </marker>
          <marker
            id={`${uid}-arrow-active`}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6.5"
            markerHeight="6.5"
            orient="auto-start-reverse"
          >
            <path d="M 1 1.5 L 8.5 5 L 1 8.5 z" fill="#ff4d5a" />
          </marker>
          <filter id={`${uid}-glow`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Edges Layer */}
        <g>
          {layout.edges.map(({ index, edge, d, labelX, labelY }) => {
            const isHighlighted = activeEdgeSet.has(index);
            const isVisited = !isHighlighted && visitedEdgeSet.has(index);
            const strokeColor = isHighlighted
              ? "rgba(255, 77, 90, 0.9)"
              : isVisited
                ? "rgba(255, 255, 255, 0.45)"
                : "rgba(255, 255, 255, 0.16)";
            const markerId = isHighlighted
              ? `url(#${uid}-arrow-active)`
              : isVisited
                ? `url(#${uid}-arrow-visited)`
                : `url(#${uid}-arrow-dim)`;

            return (
              <g
                key={`edge-${index}-${edge.from}-${edge.to}`}
                className="transition-opacity duration-500 ease-out"
                style={{ opacity: isHighlighted ? 1 : isVisited ? 0.85 : 0.45 }}
              >
                {/* Base structural path */}
                <path
                  d={d}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={isHighlighted ? 2 : 1.3}
                  strokeLinecap="round"
                  markerEnd={markerId}
                  className="transition-all duration-500 ease-out"
                />
                {/* Marching highlight energy dash on active edges */}
                {isHighlighted ? (
                  <path
                    d={d}
                    fill="none"
                    stroke="#ffffff"
                    strokeOpacity={0.85}
                    strokeWidth={1.6}
                    strokeLinecap="round"
                    className="stage-edge-flow"
                  />
                ) : null}

                {/* Optional crisp pill edge label */}
                {edge.label ? (
                  <g
                    transform={`translate(${labelX.toFixed(1)}, ${labelY.toFixed(1)})`}
                    className="transition-opacity duration-500 ease-out"
                    style={{ opacity: isHighlighted ? 1 : isVisited ? 0.65 : 0.25 }}
                  >
                    <rect
                      x={-(Math.min(18, edge.label.length) * 3.1 + 7)}
                      y={-8.5}
                      width={Math.min(18, edge.label.length) * 6.2 + 14}
                      height={17}
                      rx={4}
                      fill="#050608"
                      stroke={
                        isHighlighted
                          ? "rgba(255, 77, 90, 0.55)"
                          : "rgba(255, 255, 255, 0.18)"
                      }
                      strokeWidth={0.9}
                    />
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize="8.8"
                      fontFamily="var(--font-mono, ui-monospace, monospace)"
                      fill={isHighlighted ? "#ffffff" : "rgba(255,255,255,0.68)"}
                    >
                      {truncateLine(edge.label, 18)}
                    </text>
                  </g>
                ) : null}
              </g>
            );
          })}
        </g>

        {/* Nodes Layer */}
        <g>
          {layout.nodes.map((item) => {
            const isNodeActive = activeNodeSet.has(item.node.id);
            const isNodeVisited = !isNodeActive && visitedNodeSet.has(item.node.id);
            const tone = resolveNodeTone(item.node.group, item.node.label);

            const accentColor =
              tone === "emerald"
                ? "#34d399"
                : tone === "amber"
                  ? "#fbbf24"
                  : "#ff4d5a";

            const activeStroke =
              tone === "emerald"
                ? "#34d399"
                : tone === "amber"
                  ? "#fbbf24"
                  : tone === "coral"
                    ? "#ff4d5a"
                    : "#ffffff";

            const opacity = isNodeActive ? 1 : isNodeVisited ? 0.44 : 0.24;
            const hasSub = Boolean(item.subLine);
            const lineCount = item.lines.length;

            // Vertical text centering inside node box
            const titleStartY =
              lineCount === 1
                ? hasSub
                  ? item.cy - 6.5
                  : item.cy + 0.5
                : hasSub
                  ? item.cy - 11.5
                  : item.cy - 5.5;

            return (
              <g
                key={item.node.id}
                className="transition-all duration-500 ease-out"
                style={{
                  opacity,
                  transformOrigin: `${item.cx}px ${item.cy}px`,
                  transform: isNodeActive ? "scale(1.03)" : "scale(1)",
                }}
              >
                {/* Pulsing Manim halo ring for active nodes */}
                {isNodeActive ? (
                  <rect
                    x={item.x - 4}
                    y={item.y - 4}
                    width={item.w + 8}
                    height={item.h + 8}
                    rx={12}
                    fill="none"
                    stroke={accentColor}
                    strokeWidth={1.4}
                    filter={`url(#${uid}-glow)`}
                    className="stage-node-pulse"
                  />
                ) : null}

                {/* Main node plate */}
                <rect
                  x={item.x}
                  y={item.y}
                  width={item.w}
                  height={item.h}
                  rx={8}
                  fill={isNodeActive ? "#0e1118" : "#080a0f"}
                  stroke={
                    isNodeActive
                      ? activeStroke
                      : isNodeVisited
                        ? "rgba(255, 255, 255, 0.34)"
                        : "rgba(255, 255, 255, 0.16)"
                  }
                  strokeWidth={isNodeActive ? 1.8 : 1.1}
                  strokeDasharray={!isNodeActive && !isNodeVisited ? "3 3" : undefined}
                  className="transition-all duration-500 ease-out"
                />

                {/* Top accent micro-indicator inside active node */}
                {isNodeActive ? (
                  <rect
                    x={item.x + 10}
                    y={item.y + 0.5}
                    width={Math.min(28, item.w * 0.28)}
                    height={2.2}
                    rx={1.1}
                    fill={accentColor}
                  />
                ) : null}

                {/* Primary wrapped node label */}
                <text
                  x={item.cx}
                  y={titleStartY}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={isNodeActive ? "#ffffff" : "rgba(255,255,255,0.88)"}
                  fontSize={item.w < 118 ? "10.3" : "11.3"}
                  fontWeight={isNodeActive ? 650 : 500}
                  fontFamily="var(--font-sans, system-ui, sans-serif)"
                >
                  {item.lines.map((line, lineIdx) => (
                    <tspan
                      key={lineIdx}
                      x={item.cx}
                      dy={lineIdx === 0 ? 0 : 12.5}
                    >
                      {line}
                    </tspan>
                  ))}
                </text>

                {/* Optional crisp mono subtitle */}
                {item.subLine ? (
                  <text
                    x={item.cx}
                    y={
                      lineCount === 1
                        ? item.cy + 10
                        : item.cy + 13.5
                    }
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={
                      isNodeActive
                        ? "rgba(255, 255, 255, 0.62)"
                        : "rgba(255, 255, 255, 0.4)"
                    }
                    fontSize="8.8"
                    fontFamily="var(--font-mono, ui-monospace, monospace)"
                  >
                    {item.subLine}
                  </text>
                ) : null}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Safe-corner Callout micro-badge (lifts cleanly above CC when captions are enabled) */}
      {activeBeat?.callout ? (
        <div
          key={`callout-${beatIndex}`}
          className={`stage-beat-enter pointer-events-none absolute inset-x-3 z-10 flex transition-all duration-300 sm:inset-x-3.5 ${
            captionsEnabled
              ? isRotated
                ? "bottom-12"
                : "bottom-10"
              : "bottom-2.5 sm:bottom-3"
          }`}
        >
          <div className="inline-flex max-w-full items-center gap-1.5 overflow-hidden rounded-md border border-white/14 bg-black/80 px-2.5 py-1 backdrop-blur-md">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff4d5a] shadow-[0_0_8px_#ff4d5a]"
              aria-hidden="true"
            />
            <span className="min-w-0 truncate font-mono text-[10px] leading-tight text-white/90 sm:text-[11px]">
              {activeBeat.callout}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
