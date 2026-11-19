import { ALL_QUIZZES } from "@/data/companions";
import { getAllTopics, getTracks } from "@/lib/topics";
import type { MemoryMapKind, QuizQuestion } from "@/types/cpp";

export const QUIZ_INITIAL_PAGE_SIZE = 20;

export interface QuizTrackFilter {
  id: string;
  title: string;
}

export function getQuizTrackFilters(): QuizTrackFilter[] {
  return getTracks()
    .filter((t) => t.topics.some((topic) => topic.questionCount > 0))
    .map((t) => ({
      id: `track:${t.id}`,
      title: t.title,
    }));
}

export function getAllQuizQuestions(): QuizQuestion[] {
  const topics = getAllTopics();
  const combined: QuizQuestion[] = [];
  const seen = new Set<string>();

  for (const topic of topics) {
    for (const q of topic.questions) {
      if (seen.has(q.id)) continue;
      seen.add(q.id);
      combined.push({
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
      });
    }
  }

  for (const q of ALL_QUIZZES) {
    if (seen.has(q.id)) continue;
    seen.add(q.id);
    combined.push(q);
  }

  return combined;
}
