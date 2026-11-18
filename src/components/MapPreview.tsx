import { layoutMap } from "@/lib/map-layout";
import type { TopicMapNode } from "@/types/topics";

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
  const layout = layoutMap(root);

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      className={className ?? "h-36 w-full"}
      preserveAspectRatio="xMidYMid meet"
    >
      {layout.edges.map((edge) => (
        <path
          key={edge.id}
          d={edge.d}
          fill="none"
          stroke="var(--line-strong)"
          strokeWidth={2.2}
          strokeLinecap="round"
        />
      ))}

      {layout.nodes.map((node) => {
        const fill =
          node.depth === 0
            ? "var(--ink)"
            : node.depth === 1
              ? "var(--sun)"
              : "var(--paper-raised)";
        const stroke =
          node.depth === 0
            ? "var(--ink)"
            : node.depth === 1
              ? "var(--line-strong)"
              : "var(--line-strong)";

        return (
          <rect
            key={node.id}
            x={node.x}
            y={node.y}
            width={node.width}
            height={node.height}
            rx={node.depth === 0 ? 12 : 9}
            fill={fill}
            stroke={stroke}
            strokeWidth={1.8}
          />
        );
      })}
    </svg>
  );
}
