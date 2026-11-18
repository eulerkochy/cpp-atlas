"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronDown, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Window } from "@/components/Window";
import { layoutMap, pathLabels, type LayoutNode } from "@/lib/map-layout";
import { cn } from "@/lib/utils";
import type { TopicMapNode } from "@/types/topics";

function getAncestorSet(
  nodeById: Map<string, LayoutNode>,
  selectedId: string
): Set<string> {
  const set = new Set<string>();
  let cur = nodeById.get(selectedId);
  while (cur) {
    set.add(cur.id);
    cur = cur.parentId ? nodeById.get(cur.parentId) : undefined;
  }
  return set;
}

function getAdjacentInColumn(
  nodes: LayoutNode[],
  current: LayoutNode,
  direction: 1 | -1
): LayoutNode | undefined {
  const sameDepth = nodes
    .filter((n) => n.depth === current.depth)
    .sort((a, b) => a.cy - b.cy);
  const idx = sameDepth.findIndex((n) => n.id === current.id);
  if (idx < 0) return undefined;
  return sameDepth[idx + direction];
}

export function MindMap({
  slug,
  title,
  root,
}: {
  slug: string;
  title: string;
  root: TopicMapNode;
}) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedId, setSelectedId] = useState<string>("0");
  const [sizeMode, setSizeMode] = useState<"fit" | "actual">("fit");
  const nodeRefs = useRef<Map<string, SVGGElement>>(new Map());

  const layout = useMemo(
    () => layoutMap(root, collapsedIds),
    [root, collapsedIds]
  );

  const effectiveSelectedId = layout.nodeById.has(selectedId)
    ? selectedId
    : layout.rootId;
  const selectedNode =
    layout.nodeById.get(effectiveSelectedId) ?? layout.nodes[0];
  const ancestors = useMemo(
    () => getAncestorSet(layout.nodeById, selectedNode.id),
    [layout.nodeById, selectedNode.id]
  );
  const breadcrumb = useMemo(
    () => pathLabels(layout, selectedNode.id),
    [layout, selectedNode.id]
  );

  const focusNode = (id: string) => {
    setSelectedId(id);
    requestAnimationFrame(() => {
      nodeRefs.current.get(id)?.focus();
    });
  };

  const toggleCollapse = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandAll = () => {
    setCollapsedIds(new Set());
  };

  const handleNodeKeyDown = (
    e: React.KeyboardEvent<SVGGElement>,
    node: LayoutNode
  ) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      if (!node.hasChildren) return;
      if (node.collapsed) {
        setCollapsedIds((prev) => {
          const next = new Set(prev);
          next.delete(node.id);
          return next;
        });
        focusNode(`${node.id}.0`);
      } else if (node.childIds.length > 0) {
        focusNode(node.childIds[0]);
      }
      return;
    }

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (node.parentId) {
        focusNode(node.parentId);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = getAdjacentInColumn(layout.nodes, node, 1);
      if (next) focusNode(next.id);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = getAdjacentInColumn(layout.nodes, node, -1);
      if (prev) focusNode(prev.id);
      return;
    }

    if (
      e.key === "Enter" ||
      e.key === " " ||
      e.key === "+" ||
      e.key === "=" ||
      e.key === "-"
    ) {
      if (!node.hasChildren) return;
      e.preventDefault();
      if (e.key === "+" || e.key === "=") {
        if (node.collapsed) toggleCollapse(node.id);
      } else if (e.key === "-") {
        if (!node.collapsed) toggleCollapse(node.id);
      } else {
        toggleCollapse(node.id);
      }
    }
  };

  const childNodes = selectedNode.childIds
    .map((id) => layout.nodeById.get(id))
    .filter((n): n is LayoutNode => Boolean(n));

  return (
    <Window
      as="section"
      aria-label={`${title} concept map`}
      title={`${slug}.map`}
      actions={
        <div className="flex flex-wrap items-center gap-1.5">
          {collapsedIds.size > 0 ? (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={expandAll}
              className="cursor-pointer"
            >
              Expand all
            </Button>
          ) : null}

          <div
            role="group"
            aria-label="Map zoom mode"
            className="inline-flex items-center rounded-full border border-line bg-paper p-0.5"
          >
            <button
              type="button"
              aria-pressed={sizeMode === "fit"}
              onClick={() => setSizeMode("fit")}
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-colors cursor-pointer",
                sizeMode === "fit"
                  ? "bg-sun text-ink"
                  : "text-ink-soft hover:text-ink"
              )}
            >
              <Minimize2 className="size-3" aria-hidden />
              <span>Fit</span>
            </button>
            <button
              type="button"
              aria-pressed={sizeMode === "actual"}
              onClick={() => setSizeMode("actual")}
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-colors cursor-pointer",
                sizeMode === "actual"
                  ? "bg-sun text-ink"
                  : "text-ink-soft hover:text-ink"
              )}
            >
              <Maximize2 className="size-3" aria-hidden />
              <span>Actual size</span>
            </button>
          </div>
        </div>
      }
      bodyClassName="grid lg:grid-cols-[minmax(0,1fr)_320px]"
    >
      <div
        className={cn(
          "bg-paper/45 p-3 sm:p-5",
          sizeMode === "actual"
            ? "overflow-auto max-h-[640px]"
            : "overflow-x-auto"
        )}
      >
        <svg
          role="tree"
          aria-label={`${title} hierarchy`}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          width={sizeMode === "actual" ? layout.width : undefined}
          height={sizeMode === "actual" ? layout.height : undefined}
          className={cn(
            "block select-none",
            sizeMode === "fit"
              ? "h-auto w-full min-w-[540px] max-h-[580px]"
              : "max-w-none"
          )}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Cubic Bezier branches */}
          <g aria-hidden="true">
            {layout.edges.map((edge) => {
              const onPath =
                ancestors.has(edge.parentId) && ancestors.has(edge.childId);
              return (
                <path
                  key={edge.id}
                  d={edge.d}
                  fill="none"
                  stroke={onPath ? "var(--ink)" : "var(--line-strong)"}
                  strokeWidth={onPath ? 2.2 : 1.4}
                  strokeLinecap="round"
                />
              );
            })}
          </g>

          {/* Interactive nodes */}
          {layout.nodes.map((node) => {
            const isSelected = node.id === selectedNode.id;
            const isRoot = node.depth === 0;
            const isBranch = node.depth === 1;

            const fill = isRoot
              ? "var(--ink)"
              : isBranch
                ? "var(--sun)"
                : isSelected
                  ? "var(--sun-wash)"
                  : "var(--paper-raised)";

            const textFill = isRoot ? "var(--paper)" : "var(--ink)";
            const stroke = isSelected
              ? "var(--ink)"
              : isRoot
                ? "var(--ink)"
                : isBranch
                  ? "var(--line-strong)"
                  : "var(--line-strong)";

            const strokeWidth = isSelected ? 2.2 : 1.25;
            const rx = isRoot ? 14 : isBranch ? 12 : 10;
            const fontSize = isRoot ? 13.5 : isBranch ? 12.5 : 12;
            const lineHeight = isRoot ? 19 : 17;
            const textStartY =
              node.cy - ((node.lines.length - 1) * lineHeight) / 2;
            const textCenterX =
              node.x + (node.width - (node.hasChildren ? 10 : 0)) / 2;

            return (
              <g key={node.id}>
                {isSelected ? (
                  <rect
                    aria-hidden="true"
                    x={node.x - 4}
                    y={node.y - 4}
                    width={node.width + 8}
                    height={node.height + 8}
                    rx={rx + 3}
                    fill="none"
                    stroke="var(--sun)"
                    strokeWidth={3}
                  />
                ) : null}

                <g
                  ref={(el) => {
                    if (el) nodeRefs.current.set(node.id, el);
                    else nodeRefs.current.delete(node.id);
                  }}
                  role="button"
                  tabIndex={isSelected ? 0 : -1}
                  aria-pressed={isSelected}
                  aria-label={`${node.label}${
                    node.hasChildren
                      ? node.collapsed
                        ? ", collapsed"
                        : ", expanded"
                      : ""
                  }`}
                  onClick={() => setSelectedId(node.id)}
                  onKeyDown={(e) => handleNodeKeyDown(e, node)}
                  className="cursor-pointer outline-none focus-visible:outline-none"
                >
                  <rect
                    x={node.x}
                    y={node.y}
                    width={node.width}
                    height={node.height}
                    rx={rx}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                  />
                  <text
                    x={textCenterX}
                    y={textStartY}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={textFill}
                    fontSize={fontSize}
                    fontWeight={isRoot || isBranch ? 600 : 500}
                    fontFamily={
                      isRoot ? "var(--font-display)" : "var(--font-sans)"
                    }
                  >
                    {node.lines.map((line, li) => (
                      <tspan
                        key={li}
                        x={textCenterX}
                        dy={li === 0 ? 0 : lineHeight}
                      >
                        {line}
                      </tspan>
                    ))}
                  </text>
                </g>

                {node.hasChildren ? (
                  <g
                    role="button"
                    tabIndex={0}
                    aria-expanded={!node.collapsed}
                    aria-label={
                      node.collapsed
                        ? `Expand ${node.label}`
                        : `Collapse ${node.label}`
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCollapse(node.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleCollapse(node.id);
                      }
                    }}
                    className="cursor-pointer outline-none"
                  >
                    <circle
                      cx={node.x + node.width}
                      cy={node.cy}
                      r={10}
                      fill={
                        node.collapsed ? "var(--ink)" : "var(--paper-raised)"
                      }
                      stroke="var(--ink)"
                      strokeWidth={1.3}
                    />
                    <text
                      x={node.x + node.width}
                      y={node.cy}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={node.collapsed ? "var(--paper)" : "var(--ink)"}
                      fontSize={13}
                      fontWeight={600}
                      fontFamily="var(--font-mono)"
                    >
                      {node.collapsed ? "+" : "-"}
                    </text>
                  </g>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Right note inspector */}
      <aside
        aria-live="polite"
        className="flex flex-col justify-between gap-6 border-t border-line bg-paper-raised px-5 py-5 lg:border-t-0 lg:border-l lg:px-6 lg:py-6"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-faint">
            {breadcrumb.map((part, idx) => (
              <span key={`${part}-${idx}`} className="inline-flex items-center gap-1.5">
                {idx > 0 ? <span aria-hidden>/</span> : null}
                <span
                  className={cn(
                    idx === breadcrumb.length - 1 && "font-medium text-ink-soft"
                  )}
                >
                  {part}
                </span>
              </span>
            ))}
          </div>

          <div>
            <span className="inline-flex rounded-[var(--radius-chip)] border border-line bg-paper px-2 py-0.5 font-mono text-[11px] text-ink-soft">
              {selectedNode.depth === 0
                ? "Root concept"
                : selectedNode.depth === 1
                  ? "Branch"
                  : `Level ${selectedNode.depth}`}
            </span>
            <h3 className="mt-2 font-display text-2xl leading-snug font-[450] tracking-[-0.015em] text-ink">
              {selectedNode.label}
            </h3>
          </div>

          <p className="text-[0.97rem] leading-relaxed text-ink-body">
            {selectedNode.note}
          </p>

          {selectedNode.hasChildren ? (
            <div className="space-y-2 border-t border-line pt-4">
              <div className="flex items-center justify-between gap-2 text-xs text-ink-soft">
                <span>
                  {selectedNode.allChildCount}{" "}
                  {selectedNode.allChildCount === 1 ? "subtopic" : "subtopics"}
                </span>
                <button
                  type="button"
                  onClick={() => toggleCollapse(selectedNode.id)}
                  className="font-medium text-ink underline decoration-line-strong underline-offset-3 hover:decoration-ink cursor-pointer"
                >
                  {selectedNode.collapsed ? "Expand branch" : "Collapse branch"}
                </button>
              </div>
              {!selectedNode.collapsed && childNodes.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {childNodes.map((ch) => (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => focusNode(ch.id)}
                      className="rounded-full border border-line bg-paper px-2.5 py-1 text-xs text-ink-body transition-colors hover:border-ink/40 hover:bg-sun-wash/60 hover:text-ink cursor-pointer"
                    >
                      {ch.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <p className="border-t border-line pt-4 text-xs leading-relaxed text-ink-faint">
          Click any node or use arrow keys to navigate branches. Press{" "}
          <kbd className="rounded border border-line bg-paper px-1 font-mono text-[10px] text-ink">
            Enter
          </kbd>{" "}
          or{" "}
          <kbd className="rounded border border-line bg-paper px-1 font-mono text-[10px] text-ink">
            +
          </kbd>
          /
          <kbd className="rounded border border-line bg-paper px-1 font-mono text-[10px] text-ink">
            -
          </kbd>{" "}
          to fold.
        </p>
      </aside>
    </Window>
  );
}

function OutlineBranch({
  node,
  depth = 0,
}: {
  node: TopicMapNode;
  depth?: number;
}) {
  return (
    <li className={cn(depth > 0 && "mt-2")}>
      <div className="text-sm leading-relaxed">
        <span
          className={cn(
            "font-medium text-ink",
            depth === 0 && "font-display text-base"
          )}
        >
          {node.label}
        </span>
        {node.note ? (
          <span className="text-ink-soft"> — {node.note}</span>
        ) : null}
      </div>
      {node.children && node.children.length > 0 ? (
        <ul className="mt-2 space-y-1.5 border-l border-line pl-4">
          {node.children.map((ch, idx) => (
            <OutlineBranch key={`${ch.label}-${idx}`} node={ch} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function MapOutline({ root }: { root: TopicMapNode }) {
  return (
    <details className="group rounded-[var(--radius-panel)] border border-line bg-paper-raised px-5 py-4">
      <summary className="inline-flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
        <ChevronDown
          className="size-4 text-ink-soft transition-transform duration-150 group-open:rotate-180"
          aria-hidden
        />
        <span>Text outline of this concept map</span>
      </summary>
      <ul className="mt-4 space-y-2 border-t border-line pt-4">
        <OutlineBranch node={root} />
      </ul>
    </details>
  );
}
