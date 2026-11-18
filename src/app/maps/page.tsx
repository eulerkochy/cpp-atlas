import type { Metadata } from "next";
import Link from "next/link";
import { CurriculumGraph } from "@/components/CurriculumGraph";
import { MapPreview } from "@/components/MapPreview";
import { PageHeader } from "@/components/PageHeader";
import { countMapStats } from "@/lib/map-layout";
import { getTracks } from "@/lib/topics";

export const metadata: Metadata = {
  title: "Maps",
  description:
    "Interactive concept maps for every C++ topic, showing structural hierarchies and key language guarantees at a glance.",
};

export default function MapsPage() {
  const rawTracks = getTracks();
  const allTopicSummaries = rawTracks.flatMap((track) =>
    track.topics.map((topic) => ({ ...topic, map: null }))
  );

  const tracks = rawTracks
    .map((track) => ({
      ...track,
      topicsWithMaps: track.topics.filter((t) => Boolean(t.map)),
    }))
    .filter((track) => track.topicsWithMaps.length > 0);

  const totalMaps = tracks.reduce(
    (sum, t) => sum + t.topicsWithMaps.length,
    0
  );

  return (
    <>
      <PageHeader title="Maps">
        <p>
          {totalMaps > 0
            ? `${totalMaps} interactive concept maps across ${tracks.length} tracks. Select any card to explore branches, notes, and simulators.`
            : "Interactive concept maps for every study topic."}
        </p>
      </PageHeader>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {allTopicSummaries.length > 0 ? (
          <div className="mb-16">
            <CurriculumGraph topics={allTopicSummaries} />
          </div>
        ) : null}

        {tracks.length === 0 ? (
          <div className="rounded-[var(--radius-panel)] border border-line bg-paper-raised p-8 text-sm text-ink-soft">
            Concept maps are being prepared. Visit{" "}
            <Link
              href="/topics"
              className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
            >
              Topics
            </Link>{" "}
            or browse the{" "}
            <Link
              href="/w/cpp"
              className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
            >
              C++ reference
            </Link>
            .
          </div>
        ) : (
          <div className="space-y-20">
            {tracks.map((track) => (
              <section
                key={track.id}
                id={track.id}
                aria-labelledby={`maps-track-${track.id}`}
                className="grid scroll-mt-28 gap-6 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:gap-16"
              >
                <div className="lg:sticky lg:top-28 lg:self-start">
                  <h2
                    id={`maps-track-${track.id}`}
                    className="font-display text-[2rem] leading-tight font-[450] tracking-[-0.025em] text-ink"
                  >
                    {track.title}
                  </h2>
                  <p className="mt-3 max-w-[38ch] leading-relaxed text-ink-soft">
                    {track.description}
                  </p>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  {track.topicsWithMaps.map((topic) => {
                    const stats = topic.map
                      ? countMapStats(topic.map.root)
                      : { nodes: 0, branches: 0, maxDepth: 0 };

                    return (
                      <Link
                        key={topic.slug}
                        href={`/topics/${topic.slug}?view=map`}
                        className="group flex flex-col justify-between gap-4 rounded-[var(--radius-panel)] border border-line bg-paper-raised p-5 transition-colors hover:border-ink/40"
                      >
                        <div className="rounded-xl border border-line bg-paper/65 p-3">
                          {topic.map ? (
                            <MapPreview
                              root={topic.map.root}
                              className="h-32 w-full"
                            />
                          ) : null}
                        </div>

                        <div className="space-y-1.5">
                          <h3 className="font-display text-xl leading-snug font-[450] tracking-[-0.015em] text-ink decoration-sun decoration-2 underline-offset-[5px] group-hover:underline">
                            {topic.title}
                          </h3>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-ink-soft">
                            <span>{stats.branches} branches</span>
                            <span>{stats.nodes} nodes</span>
                            {topic.simulator ? (
                              <span className="rounded-[var(--radius-chip)] bg-sun-wash px-1.5 py-0.5 font-sans text-[11px] font-medium text-ink">
                                Simulator
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
