import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import {
  QuizArenaClient,
  type QuizTrackFilter,
} from "@/components/QuizArenaClient";
import { ALL_QUIZZES } from "@/data/companions";
import { getAllTopics, getTracks } from "@/lib/topics";
import type { MemoryMapKind, QuizQuestion } from "@/types/cpp";

export const metadata: Metadata = {
  title: "CppCon Standardese Quiz Arena",
  description:
    "ISO C++ standard-lawyer questions across all study tracks and reference companions, testing value categories, memory model atomics, lifetime traps, move semantics, and C++20/26.",
};

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
      <PageHeader title="Standardese quiz arena">
        {totalCount} tricky ISO C++ standard-lawyer questions that break
        intuition in production and make memorable CppCon talk moments. Every
        trap cites the exact clause and links back to its topic or 1:1
        reference page.
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
