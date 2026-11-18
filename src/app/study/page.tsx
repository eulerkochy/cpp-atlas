import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import {
  StudyDeskClient,
  type StudyQuizMeta,
} from "@/components/StudyDeskClient";
import { ALL_QUIZZES } from "@/data/companions";
import { getAllTopics, getTracks } from "@/lib/topics";
import type { TrackWithTopics } from "@/types/topics";

export const metadata: Metadata = {
  title: "Study Desk",
  description:
    "Track completed C++ topics, standard-lawyer quiz mastery, missed traps, saved reference pages, and portable JSON progress backups.",
};

export default function StudyPage() {
  const rawTracks = getTracks();
  const tracks: TrackWithTopics[] = rawTracks.map((track) => ({
    ...track,
    topics: track.topics.map((topic) => ({
      ...topic,
      map: null,
    })),
  }));

  const topics = getAllTopics();
  const seenIds = new Set<string>();
  const quizMeta: StudyQuizMeta[] = [];

  for (const topic of topics) {
    for (const q of topic.questions) {
      if (seenIds.has(q.id)) continue;
      seenIds.add(q.id);
      quizMeta.push({
        id: q.id,
        topicTitle: topic.title,
        href: `/topics/${topic.slug}?view=quiz`,
        linkLabel: `/topics/${topic.slug}`,
        standardClause: q.refs.join(", ") || "ISO C++",
      });
    }
  }

  for (const q of ALL_QUIZZES) {
    if (seenIds.has(q.id)) continue;
    seenIds.add(q.id);
    quizMeta.push({
      id: q.id,
      topicTitle: q.topicTitle,
      href: q.href ?? `/w/cpp/${q.canonicalPath}?view=quiz`,
      linkLabel: q.linkLabel ?? `/w/cpp/${q.canonicalPath}`,
      standardClause: q.standardClause,
    });
  }

  return (
    <>
      <PageHeader title="Study desk">
        <p>
          Track mastery across all {topics.length} study topics and{" "}
          {quizMeta.length} standard-lawyer traps, jump into unlocked
          prerequisites, or back up your browser state as JSON.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <Link
            href="/topics"
            className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
          >
            Browse topics
          </Link>
          <Link
            href="/maps"
            className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
          >
            Curriculum graph
          </Link>
          <Link
            href="/quiz"
            className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
          >
            Standardese quiz arena
          </Link>
          <Link
            href="/standards"
            className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
          >
            C++11–C++26 timeline
          </Link>
        </div>
      </PageHeader>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <StudyDeskClient tracks={tracks} quizMeta={quizMeta} />
      </div>
    </>
  );
}
