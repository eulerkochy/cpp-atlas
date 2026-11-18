import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { TopicsExplorerClient } from "@/components/TopicsExplorerClient";
import { getAllTopics, getTracks } from "@/lib/topics";

export const metadata: Metadata = {
  title: "Topics",
  description:
    "Structured C++ study tracks from translation units and value semantics to the memory model, coroutines, ranges, and C++26.",
};

export default function TopicsPage() {
  const tracks = getTracks();
  const activeTracks = tracks.filter((t) => t.topics.length > 0);
  const topics = getAllTopics();
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
          {topics.length > 0
            ? `${topics.length} deep-dive topics organized across ${activeTracks.length} study tracks. Each topic pairs prose, an interactive concept map, and a standard-lawyer quiz.`
            : "Structured C++ study tracks pairing original prose, interactive concept maps, and standard-lawyer quizzes."}
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
