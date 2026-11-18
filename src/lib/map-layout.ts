import type { TopicMapNode } from "@/types/topics";

export interface LayoutNode {
  id: string;
  parentId: string | null;
  childIds: string[];
  allChildCount: number;
  hasChildren: boolean;
  collapsed: boolean;
  depth: number;
  label: string;
  lines: string[];
  note: string;
  x: number;
  y: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
}

export interface LayoutEdge {
  id: string;
  parentId: string;
  childId: string;
  d: string;
  depth: number;
}

export interface MapLayout {
  width: number;
  height: number;
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  nodeById: Map<string, LayoutNode>;
  rootId: string;
}

interface BuildItem {
  id: string;
  parentId: string | null;
  depth: number;
  label: string;
  lines: string[];
  note: string;
  allChildCount: number;
  hasChildren: boolean;
  collapsed: boolean;
  width: number;
  height: number;
  children: BuildItem[];
  x: number;
  y: number;
  cy: number;
}

const PADDING_X = 28;
const PADDING_Y = 28;
const H_GAP = 64;
const V_GAP = 14;

function wrapLabel(label: string, maxChars: number): string[] {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    if (current.length + 1 + word.length <= maxChars) {
      current += " " + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

function measureBox(
  label: string,
  depth: number,
  hasChildren: boolean
): { lines: string[]; width: number; height: number } {
  const maxChars = depth === 0 ? 20 : depth === 1 ? 19 : 21;
  const lines = wrapLabel(label, maxChars);
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);

  const charWidth = depth === 0 ? 8.3 : depth === 1 ? 7.6 : 7.2;
  const lineHeight = depth === 0 ? 19 : 17;
  const padLeft = depth === 0 ? 18 : 14;
  const padRight = (depth === 0 ? 18 : 14) + (hasChildren ? 12 : 0);
  const padY = depth === 0 ? 12 : 9;

  const minWidth = depth === 0 ? 132 : 112;
  const width = Math.max(
    minWidth,
    Math.ceil(longest * charWidth + padLeft + padRight)
  );
  const height = Math.max(36, padY * 2 + lines.length * lineHeight);

  return { lines, width, height };
}

function buildTree(
  node: TopicMapNode,
  id: string,
  parentId: string | null,
  depth: number,
  collapsedIds?: ReadonlySet<string>
): BuildItem {
  const rawChildren = Array.isArray(node.children) ? node.children : [];
  const hasChildren = rawChildren.length > 0;
  const collapsed = hasChildren && Boolean(collapsedIds?.has(id));
  const { lines, width, height } = measureBox(node.label, depth, hasChildren);

  const visibleChildren = collapsed
    ? []
    : rawChildren.map((child, idx) =>
        buildTree(child, `${id}.${idx}`, id, depth + 1, collapsedIds)
      );

  return {
    id,
    parentId,
    depth,
    label: node.label,
    lines,
    note: node.note,
    allChildCount: rawChildren.length,
    hasChildren,
    collapsed,
    width,
    height,
    children: visibleChildren,
    x: 0,
    y: 0,
    cy: 0,
  };
}

function collectDepthWidths(item: BuildItem, widths: Map<number, number>) {
  const prev = widths.get(item.depth) ?? 0;
  if (item.width > prev) widths.set(item.depth, item.width);
  for (const ch of item.children) {
    collectDepthWidths(ch, widths);
  }
}

function shiftSubtreeY(item: BuildItem, dy: number) {
  item.y += dy;
  item.cy += dy;
  for (const ch of item.children) {
    shiftSubtreeY(ch, dy);
  }
}

function assignPositions(
  item: BuildItem,
  colX: Map<number, number>,
  state: { nextY: number }
): { top: number; bottom: number } {
  item.x = colX.get(item.depth) ?? PADDING_X;

  if (item.children.length === 0) {
    item.y = state.nextY;
    item.cy = item.y + item.height / 2;
    state.nextY = item.y + item.height + V_GAP;
    return { top: item.y, bottom: item.y + item.height };
  }

  let childTop = Infinity;
  let childBottom = -Infinity;
  for (const ch of item.children) {
    const bounds = assignPositions(ch, colX, state);
    childTop = Math.min(childTop, bounds.top);
    childBottom = Math.max(childBottom, bounds.bottom);
  }

  const firstCy = item.children[0].cy;
  const lastCy = item.children[item.children.length - 1].cy;
  item.cy = (firstCy + lastCy) / 2;
  item.y = item.cy - item.height / 2;

  // Ensure a tall parent node never collides above previous sibling subtrees
  if (item.y < childTop && item.y < state.nextY) {
    const desiredTop = childTop;
    if (item.y < desiredTop) {
      const shift = desiredTop - item.y;
      for (const ch of item.children) shiftSubtreeY(ch, shift);
      item.y += shift;
      item.cy += shift;
      childBottom += shift;
      state.nextY = Math.max(state.nextY, childBottom + V_GAP);
    }
  }

  const bottom = Math.max(childBottom, item.y + item.height);
  state.nextY = Math.max(state.nextY, bottom + V_GAP);
  return { top: Math.min(childTop, item.y), bottom };
}

export function layoutMap(
  root: TopicMapNode,
  collapsedIds?: ReadonlySet<string>
): MapLayout {
  const tree = buildTree(root, "0", null, 0, collapsedIds);

  const depthWidths = new Map<number, number>();
  collectDepthWidths(tree, depthWidths);

  const colX = new Map<number, number>();
  const maxDepth = Math.max(...depthWidths.keys());
  let curX = PADDING_X;
  for (let d = 0; d <= maxDepth; d++) {
    colX.set(d, curX);
    curX += (depthWidths.get(d) ?? 120) + H_GAP;
  }

  assignPositions(tree, colX, { nextY: PADDING_Y });

  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];
  const nodeById = new Map<string, LayoutNode>();

  let maxRight = 0;
  let maxBottom = 0;

  function flatten(item: BuildItem) {
    const layoutNode: LayoutNode = {
      id: item.id,
      parentId: item.parentId,
      childIds: item.children.map((c) => c.id),
      allChildCount: item.allChildCount,
      hasChildren: item.hasChildren,
      collapsed: item.collapsed,
      depth: item.depth,
      label: item.label,
      lines: item.lines,
      note: item.note,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      cx: item.x + item.width / 2,
      cy: item.cy,
    };

    nodes.push(layoutNode);
    nodeById.set(layoutNode.id, layoutNode);

    const foldExtra = layoutNode.hasChildren ? 14 : 0;
    maxRight = Math.max(maxRight, layoutNode.x + layoutNode.width + foldExtra);
    maxBottom = Math.max(maxBottom, layoutNode.y + layoutNode.height);

    for (const ch of item.children) {
      const x1 = item.x + item.width + (item.hasChildren ? 10 : 0);
      const y1 = item.cy;
      const x2 = ch.x;
      const y2 = ch.cy;
      const dx = Math.max(18, (x2 - x1) * 0.52);

      edges.push({
        id: `${item.id}->${ch.id}`,
        parentId: item.id,
        childId: ch.id,
        d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
        depth: ch.depth,
      });
      flatten(ch);
    }
  }

  flatten(tree);

  return {
    width: Math.max(360, Math.ceil(maxRight + PADDING_X)),
    height: Math.max(220, Math.ceil(maxBottom + PADDING_Y)),
    nodes,
    edges,
    nodeById,
    rootId: tree.id,
  };
}

export function findNode(layout: MapLayout, id: string): LayoutNode | undefined;
export function findNode(
  root: TopicMapNode,
  idOrLabel: string
): TopicMapNode | undefined;
export function findNode(
  target: MapLayout | TopicMapNode,
  idOrLabel: string
): LayoutNode | TopicMapNode | undefined {
  if ("nodeById" in target) {
    return target.nodeById.get(idOrLabel);
  }

  function walk(
    node: TopicMapNode,
    currentId: string
  ): TopicMapNode | undefined {
    if (currentId === idOrLabel || node.label === idOrLabel) return node;
    const children = node.children ?? [];
    for (let i = 0; i < children.length; i++) {
      const found = walk(children[i], `${currentId}.${i}`);
      if (found) return found;
    }
    return undefined;
  }

  return walk(target, "0");
}

export function pathLabels(
  target: MapLayout | TopicMapNode,
  id: string
): string[] {
  if ("nodeById" in target) {
    const labels: string[] = [];
    let cur = target.nodeById.get(id);
    while (cur) {
      labels.unshift(cur.label);
      cur = cur.parentId ? target.nodeById.get(cur.parentId) : undefined;
    }
    return labels;
  }

  const segments = id.split(".");
  if (segments[0] !== "0") return [];
  const labels: string[] = [target.label];
  let node: TopicMapNode | undefined = target;
  for (let i = 1; i < segments.length; i++) {
    const idx = Number(segments[i]);
    if (!Number.isInteger(idx) || !node?.children?.[idx]) break;
    node = node.children[idx];
    labels.push(node.label);
  }
  return labels;
}

export function countMapStats(root: TopicMapNode): {
  nodes: number;
  branches: number;
  maxDepth: number;
} {
  let nodes = 0;
  let maxDepth = 0;

  function walk(node: TopicMapNode, depth: number) {
    nodes++;
    if (depth > maxDepth) maxDepth = depth;
    for (const child of node.children ?? []) {
      walk(child, depth + 1);
    }
  }

  walk(root, 0);
  return {
    nodes,
    branches: root.children?.length ?? 0,
    maxDepth,
  };
}
