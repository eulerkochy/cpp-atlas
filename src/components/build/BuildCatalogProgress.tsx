"use client";

import { useBuildDone } from "@/components/build/StageDone";

export function BuildCatalogProgress({
  challengeSlug,
  stageSlugs,
}: {
  challengeSlug: string;
  stageSlugs: string[];
}) {
  const { done, hydrated } = useBuildDone();
  const total = stageSlugs.length;
  const doneCount = hydrated
    ? stageSlugs.filter((s) => done.has(`${challengeSlug}/${s}`)).length
    : 0;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-ink-soft tabular-nums">
        <span>
          {doneCount > 0 ? `${doneCount} of ${total} stages complete` : `${total} stages`}
        </span>
        {doneCount > 0 ? <span>{pct}%</span> : null}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-[color:var(--right)] transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
