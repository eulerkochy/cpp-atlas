import type { Metadata } from "next";
import Link from "next/link";
import { AtlasExplorerClient } from "@/components/AtlasExplorerClient";
import { MapPreview } from "@/components/MapPreview";
import { PageHeader } from "@/components/PageHeader";
import { getAtlasPayload } from "@/lib/atlas-data";
import { countMapStats } from "@/lib/map-layout";
import { buildOgImageUrl, SITE } from "@/lib/site";
import { getSiteStats } from "@/lib/site-stats";
import { getTracks } from "@/lib/topics";
import { groupTracks } from "@/lib/track-groups";
import type { TopicMapNode, TopicSummary } from "@/types/topics";

export function generateMetadata(): Metadata {
  const stats = getSiteStats();
  const title = "World Atlas";
  const description = `Explore ${stats.topics} C++ study topics across 4 continents and ${stats.tracks} tracks on the interactive World Atlas, trace prerequisite routes, and open ${stats.simulators} live machine-model simulators.`;
  const ogImage = buildOgImageUrl({
    title: "The C++ World Atlas",
    kicker: `${stats.topics} Topics across 4 Continents`,
    meta: `${stats.tracks} tracks / ${stats.simulators} machine simulators`,
    sub: "World map / Prerequisite routes / Concept folios",
  });
  return {
    title,
    description,
    alternates: { canonical: "/maps" },
    openGraph: {
      title,
      description,
      url: "/maps",
      siteName: SITE.name,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: `${title} — ${SITE.name}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default function MapsPage() {
  const { regions, map } = getAtlasPayload();
  const rawTracks = getTracks();
  const siteStats = getSiteStats();

  const allTopicSummaries: TopicSummary[] = rawTracks.flatMap((track) =>
    track.topics.map((topic) => ({ ...topic, map: null }))
  );

  const mapRootsBySlug: Record<string, TopicMapNode> = {};
  for (const track of rawTracks) {
    for (const topic of track.topics) {
      if (topic.map?.root) {
        mapRootsBySlug[topic.slug] = topic.map.root;
      }
    }
  }

  const tracksWithMaps = rawTracks
    .map((track) => ({
      ...track,
      topicsWithMaps: track.topics.filter((t) => Boolean(t.map)),
    }))
    .filter((track) => track.topicsWithMaps.length > 0);

  const continentGroups = groupTracks(tracksWithMaps);
  const totalMaps = tracksWithMaps.reduce(
    (sum, t) => sum + t.topicsWithMaps.length,
    0
  );

  return (
    <>
      <PageHeader title="World Atlas">
        <p>
          {regions.length > 0
            ? `Explore ${allTopicSummaries.length} study topics across ${regions.length} continents and ${map.islands.length} tracks. Search by title, ISO clause, or /w/cpp path, trace prerequisite routes, switch to dependency columns, or browse ${totalMaps} concept maps and ${siteStats.simulators} machine-model simulators below.`
            : "Interactive world atlas, concept maps, and machine-model simulators for every study topic."}
        </p>
      </PageHeader>

      <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        {regions.length > 0 ? (
          <AtlasExplorerClient
            regions={regions}
            map={map}
            allTopicSummaries={allTopicSummaries}
            mapRootsBySlug={mapRootsBySlug}
          />
        ) : null}

        {continentGroups.length === 0 ? (
          <div className="mt-10 rounded-[3px] border border-line-strong bg-paper-raised p-[5px]">
            <div className="rounded-[2px] border border-line p-8 text-sm text-ink-soft">
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
          </div>
        ) : (
          <section
            aria-labelledby="concept-maps-heading"
            className="mt-20 border-t border-line pt-14"
          >
            <div className="mb-12 max-w-[58ch]">
              <h2
                id="concept-maps-heading"
                className="font-display text-[clamp(1.75rem,3.5vw,2.35rem)] leading-tight font-[450] tracking-[-0.025em] text-ink"
              >
                Concept-map folio
              </h2>
              <p className="mt-2.5 text-[0.975rem] leading-relaxed text-ink-soft">
                Each town on the world map expands into a concept tree and reading
                guide, arranged below across the four continents.
              </p>
            </div>

            <div className="space-y-20">
              {continentGroups.map((group) => (
                <section
                  key={group.id}
                  aria-labelledby={`maps-continent-${group.id}`}
                  className="space-y-12"
                >
                  <div className="border-b border-line pb-3">
                    <h3
                      id={`maps-continent-${group.id}`}
                      className="font-display text-[1.25rem] italic tracking-[0.08em] text-ink-soft"
                    >
                      {group.label}
                    </h3>
                  </div>

                  <div className="space-y-16">
                    {group.tracks.map((track) => (
                      <section
                        key={track.id}
                        id={track.id}
                        aria-labelledby={`maps-track-${track.id}`}
                        className="grid scroll-mt-28 gap-6 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:gap-16"
                      >
                        <div className="lg:sticky lg:top-28 lg:self-start">
                          <h4
                            id={`maps-track-${track.id}`}
                            className="font-display text-[1.85rem] leading-tight font-[450] tracking-[-0.025em] text-ink"
                          >
                            {track.title}
                          </h4>
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
                                className="group block rounded-[3px] border border-line-strong bg-paper-raised p-[5px] transition-colors hover:border-ink/45"
                              >
                                <div className="flex h-full flex-col justify-between overflow-hidden rounded-[2px] border border-line bg-paper-raised">
                                  <div className="bg-paper/65 p-4">
                                    {topic.map ? (
                                      <MapPreview
                                        root={topic.map.root}
                                        className="h-32 w-full"
                                      />
                                    ) : null}
                                  </div>

                                  <div className="space-y-1.5 border-t border-line px-4 py-3.5">
                                    <h5 className="font-display text-[1.15rem] leading-snug font-[450] tracking-[-0.015em] text-ink decoration-sun decoration-2 underline-offset-[5px] group-hover:underline">
                                      {topic.title}
                                    </h5>
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
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
