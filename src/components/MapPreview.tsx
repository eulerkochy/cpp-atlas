import { layoutMap } from "@/lib/map-layout";
import type { TopicMapNode } from "@/types/topics";

export interface MapPreviewGeometry {
  width: number;
  height: number;
  edgesD: string;
  depth0D: string;
  depth1D: string;
  depthLeafD: string;
}

function roundedRectPath(
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number
): string {
  const rx = Math.round(x);
  const ry = Math.round(y);
  const rw = Math.round(w);
  const rh = Math.round(h);
  const r = Math.min(Math.round(radius), Math.floor(rw / 2), Math.floor(rh / 2));
  return `M${rx + r} ${ry}h${rw - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${rh - 2 * r}a${r} ${r} 0 0 1 -${r} ${r}h-${rw - 2 * r}a${r} ${r} 0 0 1 -${r} -${r}v-${rh - 2 * r}a${r} ${r} 0 0 1 ${r} -${r}z`;
}

function roundEdgePath(d: string): string {
  return d.replace(/-?\d+(?:\.\d+)?/g, (num) => String(Math.round(Number(num))));
}

export function buildMapPreviewGeometry(root: TopicMapNode): MapPreviewGeometry {
  const layout = layoutMap(root);

  const edgesD = layout.edges.map((edge) => roundEdgePath(edge.d)).join(" ");
  const depth0Parts: string[] = [];
  const depth1Parts: string[] = [];
  const depthLeafParts: string[] = [];

  for (const node of layout.nodes) {
    const path = roundedRectPath(
      node.x,
      node.y,
      node.width,
      node.height,
      node.depth === 0 ? 12 : 9
    );
    if (node.depth === 0) depth0Parts.push(path);
    else if (node.depth === 1) depth1Parts.push(path);
    else depthLeafParts.push(path);
  }

  return {
    width: layout.width,
    height: layout.height,
    edgesD,
    depth0D: depth0Parts.join(" "),
    depth1D: depth1Parts.join(" "),
    depthLeafD: depthLeafParts.join(" "),
  };
}

export function MapPreviewSvg({
  geometry,
  className,
}: {
  geometry: MapPreviewGeometry;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      className={className ?? "h-36 w-full"}
      preserveAspectRatio="xMidYMid meet"
    >
      {geometry.edgesD ? (
        <path
          d={geometry.edgesD}
          fill="none"
          stroke="var(--line-strong)"
          strokeWidth={2.2}
          strokeLinecap="round"
        />
      ) : null}

      {geometry.depth0D ? (
        <path
          d={geometry.depth0D}
          fill="var(--ink)"
          stroke="var(--ink)"
          strokeWidth={1.8}
        />
      ) : null}

      {geometry.depth1D ? (
        <path
          d={geometry.depth1D}
          fill="var(--sun)"
          stroke="var(--line-strong)"
          strokeWidth={1.8}
        />
      ) : null}

      {geometry.depthLeafD ? (
        <path
          d={geometry.depthLeafD}
          fill="var(--paper-raised)"
          stroke="var(--line-strong)"
          strokeWidth={1.8}
        />
      ) : null}
    </svg>
  );
}

/**
 * Compact, wordless SVG silhouette preview of a topic's concept map for `/maps`.
 */
export function MapPreview({
  root,
  className,
}: {
  root: TopicMapNode;
  className?: string;
}) {
  return (
    <MapPreviewSvg
      geometry={buildMapPreviewGeometry(root)}
      className={className}
    />
  );
}
