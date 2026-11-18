import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { TopicsExplorerClient } from "@/components/TopicsExplorerClient";
import { buildOgImageUrl, SITE } from "@/lib/site";
import { getSiteStats } from "@/lib/site-stats";
import { getTracks } from "@/lib/topics";

export function generateMetadata(): Metadata {
  const stats = getSiteStats();
  const title = "Study Topics";
  const description = `${stats.topics} deep-dive C++ study topics across ${stats.tracks} tracks, from translation units and value categories to atomics, coroutines, ranges, and C++26.`;
  const ogImage = buildOgImageUrl({
    title: `${stats.topics} C++ Study Topics`,
    kicker: `${stats.tracks} Structured Tracks`,
    meta: `${stats.traps.toLocaleString("en-US")} clause-cited questions / ${stats.simulators} simulators`,
  });
  return {
    title,
    description,
    alternates: { canonical: "/topics" },
    openGraph: {
      title,
      description,
      url: "/topics",
      siteName: SITE.name,
      images: [{ url: ogImage, width: 1200, height: 630, alt: `${title} — ${SITE.name}` }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default function TopicsPage() {
  const tracks = getTracks();
  const stats = getSiteStats();
  const clientTracks = tracks.map((track) => ({
    ...track,
    topics: track.topics.map((topic) => ({
      ...topic,
      map: null,
    })),
  }));

  return (
    <>
      <PageHeader title="Topics">
        <p>
          {stats.topics > 0
            ? `${stats.topics} deep-dive articles organized across ${stats.tracks} study tracks. Each topic pairs original prose, an interactive concept map, and a clause-cited quiz.`
            : "Structured C++ study tracks pairing original prose, interactive concept maps, and clause-cited quizzes."}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <Link
            href="/maps"
            className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
          >
            Browse concept maps
          </Link>
          <Link
            href="/standards"
            className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
          >
            C++11–C++26 timeline
          </Link>
          <Link
            href="/study"
            className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
          >
            Study desk
          </Link>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route handler, not a page */}
          <a
            href="/api/notebook/topics-all?download=1"
            className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
          >
            Download all topics as Markdown
          </a>
        </div>
      </PageHeader>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <TopicsExplorerClient tracks={clientTracks} />
      </div>
    </>
  );
}
