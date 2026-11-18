"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Check,
  ListChecks,
  Maximize2,
  Minimize2,
  Network,
} from "lucide-react";
import { useProgress } from "@/components/ProgressProvider";
import { cn } from "@/lib/utils";
import { Window } from "@/components/Window";
import type { TopicSummary } from "@/types/topics";

const NODE_WIDTH = 168;
const COL_GAP = 40;
const V_GAP = 16;
const PADDING_X = 24;
const PADDING_Y = 24;
const LINE_HEIGHT = 14.5;

interface GraphNode {
  topic: TopicSummary;
  col: number;
  orderInCol: number;
  lines: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
}

interface GraphEdge {
  id: string;
  from: string;
  to: string;
  d: string;
}

function wrapTitle(label: string, maxChars: number): string[] {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    if (current.length + 1 + word.length <= maxChars) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

function buildCurriculumLayout(topics: TopicSummary[]) {
  const topicBySlug = new Map(topics.map((t) => [t.slug, t]));
  const indexBySlug = new Map(topics.map((t, idx) => [t.slug, idx]));
  const depthMemo = new Map<string, number>();

  const computeDepth = (slug: string, visiting: Set<string>): number => {
    const cached = depthMemo.get(slug);
    if (cached !== undefined) return cached;
    if (visiting.has(slug)) return 0;

    visiting.add(slug);
    const topic = topicBySlug.get(slug);
    if (!topic) {
      visiting.delete(slug);
      return 0;
    }

    const validPres = topic.prerequisites.filter((pre) => topicBySlug.has(pre));
    const depth =
      validPres.length === 0
        ? 0
        : 1 +
          Math.max(...validPres.map((pre) => computeDepth(pre, visiting)));
    visiting.delete(slug);
    depthMemo.set(slug, depth);
    return depth;
  };

  for (const topic of topics) {
    computeDepth(topic.slug, new Set());
  }

  const columns = new Map<number, TopicSummary[]>();
  let maxCol = 0;

  for (const topic of topics) {
    const col = depthMemo.get(topic.slug) ?? 0;
    if (col > maxCol) maxCol = col;
    const list = columns.get(col) ?? [];
    list.push(topic);
    columns.set(col, list);
  }

  for (const [col, list] of columns.entries()) {
    list.sort(
      (a, b) => (indexBySlug.get(a.slug) ?? 0) - (indexBySlug.get(b.slug) ?? 0)
    );
    columns.set(col, list);
  }

  const measuredBySlug = new Map<
    string,
    { lines: string[]; height: number }
  >();
  const colHeights = new Map<number, number>();
  let maxColHeight = 0;

  for (const [col, list] of columns.entries()) {
    let colHeight = 0;
    list.forEach((topic, idx) => {
      const lines = wrapTitle(topic.title, 22);
      const height = Math.max(46, 16 + lines.length * LINE_HEIGHT);
      measuredBySlug.set(topic.slug, { lines, height });
      colHeight += height + (idx > 0 ? V_GAP : 0);
    });
    colHeights.set(col, colHeight);
    if (colHeight > maxColHeight) maxColHeight = colHeight;
  }

  const nodes: GraphNode[] = [];
  const nodeBySlug = new Map<string, GraphNode>();

  for (let col = 0; col <= maxCol; col++) {
    const list = columns.get(col) ?? [];
    const colHeight = colHeights.get(col) ?? 0;
    let curY = PADDING_Y + (maxColHeight - colHeight) / 2;
    const x = PADDING_X + col * (NODE_WIDTH + COL_GAP);

    list.forEach((topic, orderInCol) => {
      const measured = measuredBySlug.get(topic.slug) ?? {
        lines: [topic.title],
        height: 46,
      };
      const node: GraphNode = {
        topic,
        col,
        orderInCol,
        lines: measured.lines,
        x,
        y: curY,
        width: NODE_WIDTH,
        height: measured.height,
        cx: x + NODE_WIDTH / 2,
        cy: curY + measured.height / 2,
      };
      nodes.push(node);
      nodeBySlug.set(topic.slug, node);
      curY += measured.height + V_GAP;
    });
  }

  const edges: GraphEdge[] = [];
  const dependentsBySlug = new Map<string, TopicSummary[]>();

  for (const topic of topics) {
    const to = nodeBySlug.get(topic.slug);
    if (!to) continue;

    for (const preSlug of topic.prerequisites) {
      const from = nodeBySlug.get(preSlug);
      if (!from) continue;

      const list = dependentsBySlug.get(preSlug) ?? [];
      list.push(topic);
      dependentsBySlug.set(preSlug, list);

      const x1 = from.x + from.width;
      const y1 = from.cy;
      const x2 = to.x;
      const y2 = to.cy;
      const dx = Math.max(24, (x2 - x1) * 0.46);

      edges.push({
        id: `${preSlug}->${topic.slug}`,
        from: preSlug,
        to: topic.slug,
        d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
      });
    }
  }

  const width = Math.max(
    480,
    PADDING_X * 2 + (maxCol + 1) * NODE_WIDTH + maxCol * COL_GAP
  );
  const height = Math.max(240, PADDING_Y * 2 + maxColHeight);

  return {
    nodes,
    edges,
    nodeBySlug,
    topicBySlug,
    dependentsBySlug,
    columns,
    maxCol,
    width,
    height,
  };
}

function collectReachable(
  startSlug: string,
  nextOf: (slug: string) => string[]
): Set<string> {
  const visited = new Set<string>();
  const queue = [...nextOf(startSlug)];

  while (queue.length > 0) {
    const cur = queue.shift();
    if (!cur || visited.has(cur)) continue;
    visited.add(cur);
    for (const nxt of nextOf(cur)) {
      if (!visited.has(nxt) && nxt !== startSlug) {
        queue.push(nxt);
      }
    }
  }

  return visited;
}

export function CurriculumGraph({ topics }: { topics: TopicSummary[] }) {
  const { hydrated, completedTopics, bookmarkedTopics, answeredQuizzes } =
    useProgress();

  const layout = useMemo(() => buildCurriculumLayout(topics), [topics]);

  const defaultSlug = useMemo(() => {
    if (layout.topicBySlug.has("value-categories")) return "value-categories";
    return topics[0]?.slug ?? "";
  }, [layout.topicBySlug, topics]);

  const [selectedSlug, setSelectedSlug] = useState<string>(defaultSlug);
  const [focusedSlug, setFocusedSlug] = useState<string>(defaultSlug);
  const [sizeMode, setSizeMode] = useState<"scroll" | "fit">("scroll");
  const nodeRefs = useRef<Map<string, SVGGElement>>(new Map());

  const activeSlug = layout.topicBySlug.has(selectedSlug)
    ? selectedSlug
    : defaultSlug;
  const activeFocusedSlug = layout.topicBySlug.has(focusedSlug)
    ? focusedSlug
    : activeSlug;

  const selectedTopic = layout.topicBySlug.get(activeSlug);

  const completedSet = useMemo(
    () => new Set(hydrated ? completedTopics : []),
    [hydrated, completedTopics]
  );
  const savedSet = useMemo(
    () => new Set(hydrated ? bookmarkedTopics : []),
    [hydrated, bookmarkedTopics]
  );

  const nextUpSet = useMemo(() => {
    const set = new Set<string>();
    for (const topic of topics) {
      if (completedSet.has(topic.slug)) continue;
      const ready = topic.prerequisites.every(
        (pre) => !layout.topicBySlug.has(pre) || completedSet.has(pre)
      );
      if (ready) set.add(topic.slug);
    }
    return set;
  }, [topics, completedSet, layout.topicBySlug]);

  const { ancestors, descendants } = useMemo(() => {
    if (!activeSlug) {
      return { ancestors: new Set<string>(), descendants: new Set<string>() };
    }
    const anc = collectReachable(activeSlug, (slug) =>
      (layout.topicBySlug.get(slug)?.prerequisites ?? []).filter((p) =>
        layout.topicBySlug.has(p)
      )
    );
    const desc = collectReachable(activeSlug, (slug) =>
      (layout.dependentsBySlug.get(slug) ?? []).map((t) => t.slug)
    );
    return { ancestors: anc, descendants: desc };
  }, [activeSlug, layout.topicBySlug, layout.dependentsBySlug]);

  const selectAndScrollToNode = (slug: string) => {
    setSelectedSlug(slug);
    setFocusedSlug(slug);
    requestAnimationFrame(() => {
      const el = nodeRefs.current.get(slug);
      el?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    });
  };

  const moveFocusTo = (slug: string) => {
    setFocusedSlug(slug);
    requestAnimationFrame(() => {
      const el = nodeRefs.current.get(slug);
      el?.focus();
      el?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    });
  };

  const handleNodeKeyDown = (
    e: React.KeyboardEvent<SVGGElement>,
    node: GraphNode
  ) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setSelectedSlug(node.topic.slug);
      setFocusedSlug(node.topic.slug);
      return;
    }

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const colTopics = layout.columns.get(node.col) ?? [];
      const delta = e.key === "ArrowDown" ? 1 : -1;
      const target = colTopics[node.orderInCol + delta];
      if (target) moveFocusTo(target.slug);
      return;
    }

    if (e.key === "ArrowRight") {
      e.preventDefault();
      const deps = layout.dependentsBySlug.get(node.topic.slug) ?? [];
      if (deps.length > 0) {
        moveFocusTo(deps[0].slug);
        return;
      }
      for (let c = node.col + 1; c <= layout.maxCol; c++) {
        const list = layout.columns.get(c);
        if (list && list.length > 0) {
          moveFocusTo(list[0].slug);
          return;
        }
      }
      return;
    }

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      const pres = node.topic.prerequisites.filter((p) =>
        layout.topicBySlug.has(p)
      );
      if (pres.length > 0) {
        moveFocusTo(pres[0]);
        return;
      }
      for (let c = node.col - 1; c >= 0; c--) {
        const list = layout.columns.get(c);
        if (list && list.length > 0) {
          moveFocusTo(list[0].slug);
          return;
        }
      }
    }
  };

  if (topics.length === 0 || !selectedTopic) {
    return null;
  }

  const directPrereqs = selectedTopic.prerequisites
    .map((pre) => layout.topicBySlug.get(pre))
    .filter((t): t is TopicSummary => Boolean(t));
  const directDependents = layout.dependentsBySlug.get(selectedTopic.slug) ?? [];
  const selectedQuizCleared = hydrated
    ? selectedTopic.questionIds.filter((id) => answeredQuizzes[id]?.correct)
        .length
    : 0;

  const isSelectedCompleted = completedSet.has(selectedTopic.slug);
  const isSelectedSaved = savedSet.has(selectedTopic.slug);
  const isSelectedNextUp = nextUpSet.has(selectedTopic.slug);

  const backgroundEdges: GraphEdge[] = [];
  const ancestorEdges: GraphEdge[] = [];
  const descendantEdges: GraphEdge[] = [];

  for (const edge of layout.edges) {
    if (
      ancestors.has(edge.from) &&
      (ancestors.has(edge.to) || edge.to === activeSlug)
    ) {
      ancestorEdges.push(edge);
    } else if (
      (edge.from === activeSlug || descendants.has(edge.from)) &&
      descendants.has(edge.to)
    ) {
      descendantEdges.push(edge);
    } else {
      backgroundEdges.push(edge);
    }
  }

  return (
    <Window
      as="section"
      aria-label="Curriculum prerequisite graph"
      title="curriculum-prerequisites.svg"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <div className="hidden items-center gap-3 text-[11px] text-ink-soft md:flex">
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2.5 rounded-full border border-ink bg-sun"
              />
              <span>Selected</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2.5 rounded-full border border-[color:var(--right)] bg-right-wash"
              />
              <span>Completed</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2.5 rounded-full border-2 border-[color:var(--sun-deep)] bg-paper-raised"
              />
              <span>Next up</span>
            </span>
          </div>

          <div
            role="group"
            aria-label="Graph zoom mode"
            className="inline-flex items-center rounded-full border border-line bg-paper p-0.5"
          >
            <button
              type="button"
              aria-pressed={sizeMode === "scroll"}
              onClick={() => setSizeMode("scroll")}
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-colors cursor-pointer",
                sizeMode === "scroll"
                  ? "bg-sun text-ink"
                  : "text-ink-soft hover:text-ink"
              )}
            >
              <Maximize2 className="size-3" aria-hidden />
              <span>Readable</span>
            </button>
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
              <span>Fit all</span>
            </button>
          </div>
        </div>
      }
      bodyClassName="divide-y divide-line"
    >
      <div className="overflow-x-auto bg-paper/45 p-3 sm:p-5">
        <svg
          role="group"
          aria-label={`Curriculum prerequisites DAG across ${topics.length} topics`}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className={cn(
            "block select-none",
            sizeMode === "scroll"
              ? "h-auto w-[2120px] max-w-none"
              : "h-auto w-full min-w-[680px]"
          )}
          preserveAspectRatio="xMidYMid meet"
        >
          <g aria-hidden="true">
            {backgroundEdges.map((edge) => (
              <path
                key={edge.id}
                d={edge.d}
                fill="none"
                stroke="var(--line-strong)"
                strokeWidth={1.2}
                strokeLinecap="round"
                opacity={0.42}
              />
            ))}
            {ancestorEdges.map((edge) => (
              <path
                key={edge.id}
                d={edge.d}
                fill="none"
                stroke="var(--ink)"
                strokeWidth={2.2}
                strokeLinecap="round"
              />
            ))}
            {descendantEdges.map((edge) => (
              <path
                key={edge.id}
                d={edge.d}
                fill="none"
                stroke="var(--sun-deep)"
                strokeWidth={2.2}
                strokeLinecap="round"
              />
            ))}
          </g>

          {layout.nodes.map((node) => {
            const slug = node.topic.slug;
            const isSelected = slug === activeSlug;
            const isCompleted = completedSet.has(slug);
            const isNextUp = nextUpSet.has(slug);
            const isAncestor = ancestors.has(slug);
            const isDescendant = descendants.has(slug);
            const onPath = isSelected || isAncestor || isDescendant;

            let fill = "var(--paper-raised)";
            let stroke = "var(--line-strong)";
            let strokeWidth = 1.25;

            if (isSelected) {
              fill = "var(--sun)";
              stroke = "var(--ink)";
              strokeWidth = 2.2;
            } else if (isCompleted) {
              fill = "var(--right-wash)";
              stroke = "var(--right)";
              strokeWidth = onPath ? 2 : 1.4;
            } else if (isNextUp) {
              fill = "var(--paper-raised)";
              stroke = "var(--sun-deep)";
              strokeWidth = 2;
            } else if (isAncestor) {
              fill = "var(--paper-raised)";
              stroke = "var(--ink)";
              strokeWidth = 1.75;
            } else if (isDescendant) {
              fill = "var(--sun-wash)";
              stroke = "var(--sun-deep)";
              strokeWidth = 1.6;
            }

            const textStartY =
              node.cy - ((node.lines.length - 1) * LINE_HEIGHT) / 2;

            return (
              <g
                key={slug}
                opacity={onPath || isCompleted || isNextUp ? 1 : 0.78}
              >
                {isSelected ? (
                  <rect
                    aria-hidden="true"
                    x={node.x - 4}
                    y={node.y - 4}
                    width={node.width + 8}
                    height={node.height + 8}
                    rx={14}
                    fill="none"
                    stroke="var(--sun)"
                    strokeWidth={3}
                  />
                ) : null}

                <g
                  ref={(el) => {
                    if (el) nodeRefs.current.set(slug, el);
                    else nodeRefs.current.delete(slug);
                  }}
                  role="button"
                  tabIndex={slug === activeFocusedSlug ? 0 : -1}
                  aria-pressed={isSelected}
                  aria-label={`${node.topic.title}, ${node.topic.trackTitle}${
                    isCompleted
                      ? ", completed"
                      : isNextUp
                        ? ", next up"
                        : ""
                  }`}
                  onClick={() => {
                    setSelectedSlug(slug);
                    setFocusedSlug(slug);
                  }}
                  onKeyDown={(e) => handleNodeKeyDown(e, node)}
                  className="cursor-pointer outline-none"
                >
                  <rect
                    x={node.x}
                    y={node.y}
                    width={node.width}
                    height={node.height}
                    rx={11}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                  />

                  <text
                    x={node.cx}
                    y={textStartY}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="var(--ink)"
                    fontSize={11.5}
                    fontWeight={isSelected ? 600 : 500}
                    fontFamily="var(--font-sans)"
                  >
                    {node.lines.map((line, li) => (
                      <tspan
                        key={li}
                        x={node.cx}
                        dy={li === 0 ? 0 : LINE_HEIGHT}
                      >
                        {line}
                      </tspan>
                    ))}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
      </div>

      <div
        aria-live="polite"
        className="space-y-5 bg-paper-raised px-5 py-5 sm:px-6 sm:py-6"
      >
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-[var(--radius-chip)] bg-paper-sunk px-2 py-0.5 font-medium text-ink-soft">
                {selectedTopic.trackTitle}
              </span>
              {isSelectedCompleted ? (
                <span className="inline-flex items-center gap-1 rounded-[var(--radius-chip)] bg-right-wash px-2 py-0.5 font-medium text-[color:var(--right)]">
                  <Check className="size-3" aria-hidden />
                  <span>Completed</span>
                </span>
              ) : isSelectedNextUp ? (
                <span className="rounded-[var(--radius-chip)] border border-[color:var(--sun-deep)]/40 bg-sun-wash px-2 py-0.5 font-medium text-ink">
                  Next up
                </span>
              ) : null}
              {isSelectedSaved ? (
                <span className="rounded-[var(--radius-chip)] border border-ink/20 bg-sun-wash px-2 py-0.5 font-medium text-ink">
                  Saved
                </span>
              ) : null}
              <span className="font-mono text-ink-soft tabular-nums">
                {hydrated && selectedTopic.questionIds.length > 0
                  ? `${selectedQuizCleared}/${selectedTopic.questionIds.length} cleared`
                  : `${selectedTopic.questionCount} quiz ${
                      selectedTopic.questionCount === 1
                        ? "question"
                        : "questions"
                    }`}
              </span>
              <span className="text-ink-faint tabular-nums">
                {selectedTopic.minutes} min read
              </span>
            </div>

            <h2 className="font-display text-2xl leading-snug font-[450] tracking-[-0.02em] text-ink">
              {selectedTopic.title}
            </h2>

            {selectedTopic.summary ? (
              <p className="max-w-[68ch] text-sm leading-relaxed text-ink-soft">
                {selectedTopic.summary}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link
              href={`/topics/${selectedTopic.slug}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-ink px-3.5 text-xs font-medium text-paper transition-colors hover:bg-ink/85"
            >
              <BookOpen className="size-3.5" aria-hidden />
              <span>Read topic</span>
            </Link>
            <Link
              href={`/topics/${selectedTopic.slug}?view=map`}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line-strong bg-paper-raised px-3.5 text-xs font-medium text-ink transition-colors hover:border-ink/40 hover:bg-paper"
            >
              <Network className="size-3.5" aria-hidden />
              <span>Open concept map</span>
            </Link>
            <Link
              href={`/topics/${selectedTopic.slug}?view=quiz`}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-sun px-3.5 text-xs font-medium text-ink transition-colors hover:bg-sun/90"
            >
              <ListChecks className="size-3.5" aria-hidden />
              <span>Take quiz</span>
            </Link>
          </div>
        </div>

        <div className="grid gap-5 border-t border-line pt-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-medium text-ink">
              Read first ({directPrereqs.length})
            </p>
            {directPrereqs.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {directPrereqs.map((pre) => {
                  const done = completedSet.has(pre.slug);
                  return (
                    <div
                      key={pre.slug}
                      className={cn(
                        "inline-flex items-center overflow-hidden rounded-full border text-xs",
                        done
                          ? "border-[color:var(--right)]/30 bg-right-wash/60"
                          : "border-line-strong bg-paper"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => selectAndScrollToNode(pre.slug)}
                        className="inline-flex items-center gap-1.5 px-3 py-1 font-medium text-ink hover:bg-sun-wash/60 cursor-pointer"
                      >
                        {done ? (
                          <Check
                            className="size-3 text-[color:var(--right)]"
                            aria-hidden
                          />
                        ) : null}
                        <span>{pre.title}</span>
                      </button>
                      <Link
                        href={`/topics/${pre.slug}`}
                        aria-label={`Open ${pre.title}`}
                        className="border-l border-line px-2 py-1 text-ink-faint hover:bg-ink/5 hover:text-ink"
                      >
                        <ArrowUpRight className="size-3.5" aria-hidden />
                      </Link>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-ink-faint">
                No prerequisites. Start the curriculum here.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-ink">
              Unlocks next ({directDependents.length})
            </p>
            {directDependents.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {directDependents.map((dep) => {
                  const done = completedSet.has(dep.slug);
                  const ready = nextUpSet.has(dep.slug);
                  return (
                    <div
                      key={dep.slug}
                      className={cn(
                        "inline-flex items-center overflow-hidden rounded-full border text-xs",
                        done
                          ? "border-[color:var(--right)]/30 bg-right-wash/60"
                          : ready
                            ? "border-[color:var(--sun-deep)]/50 bg-sun-wash/50"
                            : "border-line-strong bg-paper"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => selectAndScrollToNode(dep.slug)}
                        className="inline-flex items-center gap-1.5 px-3 py-1 font-medium text-ink hover:bg-sun-wash/60 cursor-pointer"
                      >
                        {done ? (
                          <Check
                            className="size-3 text-[color:var(--right)]"
                            aria-hidden
                          />
                        ) : null}
                        <span>{dep.title}</span>
                      </button>
                      <Link
                        href={`/topics/${dep.slug}`}
                        aria-label={`Open ${dep.title}`}
                        className="border-l border-line px-2 py-1 text-ink-faint hover:bg-ink/5 hover:text-ink"
                      >
                        <ArrowUpRight className="size-3.5" aria-hidden />
                      </Link>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-ink-faint">
                Capstone topic in this branch.
              </p>
            )}
          </div>
        </div>
      </div>
    </Window>
  );
}
