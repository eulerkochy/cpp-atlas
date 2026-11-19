import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { QuizArenaClient } from "@/components/QuizArenaClient";
import {
  getAllQuizQuestions,
  getQuizTrackFilters,
  QUIZ_INITIAL_PAGE_SIZE,
} from "@/lib/quiz-bank";
import { buildOgImageUrl, SITE } from "@/lib/site";
import { getSiteStats } from "@/lib/site-stats";

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
      images: [
        { url: ogImage, width: 1200, height: 630, alt: `${title} — ${SITE.name}` },
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

export default function QuizPage() {
  const allQuestions = getAllQuizQuestions();
  const trackFilters = getQuizTrackFilters();
  const initialQuestions = allQuestions.slice(0, QUIZ_INITIAL_PAGE_SIZE);

  return (
    <>
      <PageHeader title="Standardese quiz">
        {allQuestions.length.toLocaleString("en-US")} clause-cited C++ questions
        built around the tempting wrong answer—covering overload resolution,
        object lifetime, undefined behavior, atomics, templates, and C++26.
        Every verdict explains the abstract-machine rule and links directly to
        the ISO draft.
      </PageHeader>

      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <QuizArenaClient
          initialQuestions={initialQuestions}
          totalCount={allQuestions.length}
          tracks={trackFilters}
        />
      </div>
    </>
  );
}
