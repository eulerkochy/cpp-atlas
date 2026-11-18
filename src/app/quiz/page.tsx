import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import {
  QuizArenaClient,
  type QuizTrackFilter,
} from "@/components/QuizArenaClient";
import { ALL_QUIZZES } from "@/data/companions";
import { buildOgImageUrl, SITE } from "@/lib/site";
import { getSiteStats } from "@/lib/site-stats";
import { getAllTopics, getTracks } from "@/lib/topics";
import type { MemoryMapKind, QuizQuestion } from "@/types/cpp";

export function generateMetadata(): Metadata {
  const stats = getSiteStats();
  const title = `Standardese Quiz (${stats.traps.toLocaleString("en-US")} Questions)`;
  const description = `${stats.traps.toLocaleString("en-US")} clause-cited ISO C++ questions across ${stats.tracks} tracks, testing value categories, object lifetime, UB, atomics, templates, and C++26.`;
  const ogImage = buildOgImageUrl({
    title: `${stats.traps.toLocaleString("en-US")} Clause-Cited C++ Traps`,
    kicker: "Standardese Quiz",
    meta: `Across ${stats.topics} study topics & reference companions`,
    sub: "Clause-cited verdicts & ISO links",
  });
  return {
    title,
    description,
    alternates: { canonical: "/quiz" },
    openGraph: {
      title,
      description,
      url: "/quiz",
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

export default function QuizPage() {
  const topics = getAllTopics();
  const tracks = getTracks().filter((t) =>
    t.topics.some((topic) => topic.questionCount > 0)
  );

  const trackFilters: QuizTrackFilter[] = tracks.map((t) => ({
    id: `track:${t.id}`,
    title: t.title,
  }));

  const topicQuestions: QuizQuestion[] = topics.flatMap((topic) =>
    topic.questions.map((q) => ({
      id: q.id,
      companionId: (topic.simulator ?? "value-categories") as MemoryMapKind,
      canonicalPath: topic.cppreference[0]?.path ?? "language",
      topicTitle: topic.title,
      trapLevel:
        q.kind === "warmup"
          ? "subtle"
          : q.kind === "standardese"
            ? "cppcon-stage"
            : "standard-lawyer",
      difficultyLabel:
        q.kind === "warmup"
          ? "Warm-up"
          : q.kind === "standardese"
            ? "Standardese"
            : "Tricky",
      standardClause: q.refs.join(", ") || "ISO C++",
      prompt: q.prompt,
      code: q.code,
      options: q.options,
      correctIndex: q.answer,
      explanation: q.explanation,
      href: `/topics/${topic.slug}?view=quiz`,
      linkLabel: `/topics/${topic.slug}`,
      filterGroupId: `track:${topic.trackId}`,
    }))
  );

  const totalCount = topicQuestions.length + ALL_QUIZZES.length;

  return (
    <>
      <PageHeader title="Standardese quiz">
        {totalCount.toLocaleString("en-US")} clause-cited C++ questions built
        around the tempting wrong answer—covering overload resolution, object
        lifetime, undefined behavior, atomics, templates, and C++26. Every
        verdict explains the abstract-machine rule and links directly to the ISO
        draft.
      </PageHeader>

      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <QuizArenaClient
          topicQuestions={topicQuestions}
          tracks={trackFilters}
        />
      </div>
    </>
  );
}
