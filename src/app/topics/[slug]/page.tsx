import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import { MemoryMapStage } from "@/components/memory-maps/MemoryMapStage";
import { MapOutline, MindMap } from "@/components/MindMap";
import { ReferenceViews } from "@/components/ReferenceViews";
import { SectionRail } from "@/components/SectionRail";
import { TopicMarkdown } from "@/components/TopicMarkdown";
import { AllQuestions, TopicQuizRunner } from "@/components/TopicQuizRunner";
import {
  TopicNotebookActions,
  TopicStudyActions,
  TopicViewSwitcher,
} from "@/components/TopicViewActions";
import { JsonLd } from "@/components/JsonLd";
import { TrackProgressCount } from "@/components/TrackProgressCount";
import { absoluteUrl, buildOgImageUrl, SITE } from "@/lib/site";
import {
  getAllTopics,
  getDependents,
  getNeighbours,
  getTopic,
  standardRefToUrl,
} from "@/lib/topics";

export async function generateStaticParams() {
  const topics = getAllTopics();
  if (topics.length === 0) {
    return [{ slug: "value-categories" }];
  }
  return topics.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const topic = getTopic(slug);
  if (!topic) {
    return { title: "Topic not found" };
  }
  const description =
    topic.summary ||
    `${topic.title} — ${topic.trackTitle} study topic on C++ Atlas.`;
  const metaBadge = `${topic.minutes} min read / ${topic.questions.length} questions${topic.simulator ? " / Simulator" : ""}`;
  const ogImage = buildOgImageUrl({
    title: topic.title,
    kicker: topic.trackTitle,
    meta: metaBadge,
  });

  return {
    title: topic.title,
    description,
    alternates: {
      canonical: `/topics/${topic.slug}`,
      types: { "text/markdown": `/api/notebook/topic/${topic.slug}` },
    },
    openGraph: {
      title: topic.title,
      description,
      type: "article",
      url: `/topics/${topic.slug}`,
      siteName: SITE.name,
      section: topic.trackTitle,
      tags: topic.standard,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: `${topic.title} — C++ Atlas`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: topic.title,
      description,
      images: [ogImage],
    },
  };
}

function TopicSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-28 pb-12 sm:px-6 sm:pt-36 space-y-6 animate-pulse">
      <div className="h-4 w-56 rounded bg-paper-sunk" />
      <div className="h-12 w-2/3 rounded bg-paper-sunk" />
      <div className="h-64 rounded-[var(--radius-window)] border border-line bg-paper-raised" />
    </div>
  );
}

async function TopicLoader({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const topic = getTopic(slug);
  if (!topic) {
    notFound();
  }

  const neighbours = getNeighbours(topic.slug);
  const resolvedPrerequisites = topic.prerequisites
    .map((preSlug) => getTopic(preSlug))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));
  const dependents = getDependents(topic.slug);

  const readPanel = (
    <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[12rem_minmax(0,1fr)] xl:grid-cols-[12rem_minmax(0,1fr)_16rem] xl:gap-12">
      <aside className="hidden lg:block">
        {topic.headings.length > 0 ? (
          <div className="sticky top-28 max-h-[calc(100vh-8rem)] overflow-y-auto overscroll-contain px-1 pt-1.5 pb-6">
            <SectionRail headings={topic.headings} label="On this page" />
          </div>
        ) : null}
      </aside>

      <div className="min-w-0 space-y-10">
        <TopicMarkdown content={topic.body} />

        <TopicViewSwitcher
          hasMap={Boolean(topic.map || topic.simulator)}
          hasQuiz={topic.questions.length > 0}
          questionCount={topic.questions.length}
        />

        {neighbours.prev || neighbours.next ? (
          <nav
            aria-label="Adjacent topics"
            className="grid max-w-[var(--measure)] gap-4 border-t border-line pt-8 sm:grid-cols-2"
          >
            {neighbours.prev ? (
              <Link
                href={`/topics/${neighbours.prev.slug}`}
                className="group rounded-[var(--radius-panel)] border border-line bg-paper-raised p-4 transition-colors hover:border-line-strong"
              >
                <span className="inline-flex items-center gap-1.5 text-xs text-ink-faint">
                  <ArrowLeft className="size-3.5" aria-hidden />
                  <span>Previous topic</span>
                </span>
                <div className="mt-1 font-display text-lg font-[450] text-ink decoration-sun decoration-2 underline-offset-4 group-hover:underline">
                  {neighbours.prev.title}
                </div>
                <div className="mt-0.5 text-xs text-ink-soft">
                  {neighbours.prev.trackTitle}
                </div>
              </Link>
            ) : (
              <div />
            )}

            {neighbours.next ? (
              <Link
                href={`/topics/${neighbours.next.slug}`}
                className="group rounded-[var(--radius-panel)] border border-line bg-paper-raised p-4 text-right transition-colors hover:border-line-strong"
              >
                <span className="inline-flex items-center justify-end gap-1.5 text-xs text-ink-faint">
                  <span>Next topic</span>
                  <ArrowRight className="size-3.5" aria-hidden />
                </span>
                <div className="mt-1 font-display text-lg font-[450] text-ink decoration-sun decoration-2 underline-offset-4 group-hover:underline">
                  {neighbours.next.title}
                </div>
                <div className="mt-0.5 text-xs text-ink-soft">
                  {neighbours.next.trackTitle}
                </div>
              </Link>
            ) : null}
          </nav>
        ) : null}
      </div>

      <aside className="space-y-8 text-sm lg:col-start-2 xl:col-start-3 xl:row-start-1">
        <div className="space-y-8 xl:sticky xl:top-28 xl:max-h-[calc(100vh-8rem)] xl:overflow-y-auto xl:overscroll-contain xl:px-1.5 xl:pt-1.5 xl:pb-6">
          {topic.cppreference.length > 0 ? (
            <div className="space-y-3">
              <p className="font-medium text-ink">
                Further reading in the reference
              </p>
              <ul className="space-y-2.5">
                {topic.cppreference.map((ref) => (
                  <li key={ref.path} className="space-y-0.5">
                    <div className="flex items-start justify-between gap-2">
                      {ref.local ? (
                        <Link
                          href={ref.href}
                          className="text-sm font-medium text-ink underline decoration-line-strong underline-offset-3 hover:decoration-ink"
                        >
                          {ref.title}
                        </Link>
                      ) : (
                        <a
                          href={ref.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-ink underline decoration-line-strong underline-offset-3 hover:decoration-ink"
                        >
                          {ref.title}
                        </a>
                      )}
                      <a
                        href={ref.externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${ref.title} on en.cppreference.com`}
                        className="mt-0.5 shrink-0 text-ink-faint hover:text-ink"
                      >
                        <ExternalLink className="size-3.5" aria-hidden />
                      </a>
                    </div>
                    <div className="font-mono text-[11px] text-ink-faint [overflow-wrap:anywhere]">
                      {ref.local
                        ? `/w/cpp/${ref.path}`
                        : "not in the offline snapshot"}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {resolvedPrerequisites.length > 0 ? (
            <div className="space-y-3 border-t border-line pt-6">
              <p className="font-medium text-ink">Read first</p>
              <ul className="space-y-2">
                {resolvedPrerequisites.map((pre) => (
                  <li key={pre.slug}>
                    <Link
                      href={`/topics/${pre.slug}`}
                      className="text-sm text-ink-soft underline decoration-line-strong underline-offset-3 hover:text-ink hover:decoration-ink"
                    >
                      {pre.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {dependents.length > 0 ? (
            <div className="space-y-3 border-t border-line pt-6">
              <p className="font-medium text-ink">Unlocks next</p>
              <ul className="space-y-2">
                {dependents.map((dep) => (
                  <li key={dep.slug}>
                    <Link
                      href={`/topics/${dep.slug}`}
                      className="text-sm text-ink-soft underline decoration-line-strong underline-offset-3 hover:text-ink hover:decoration-ink"
                    >
                      {dep.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="space-y-2.5 border-t border-line pt-6">
            <p className="font-medium text-ink">NotebookLM</p>
            <p className="leading-relaxed text-ink-soft">
              Export this topic with its map outline and standardese quiz as a
              clean Markdown source.
            </p>
            <TopicNotebookActions slug={topic.slug} />
          </div>
        </div>
      </aside>
    </div>
  );

  const mapPanel = (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 space-y-6">
      <h2 className="sr-only">Concept map</h2>
      {topic.map ? (
        <>
          <MindMap
            slug={topic.slug}
            title={topic.title}
            root={topic.map.root}
          />
          <MapOutline root={topic.map.root} />
        </>
      ) : (
        <div className="rounded-[var(--radius-panel)] border border-line bg-paper-raised p-8 text-sm text-ink-soft">
          A concept map for this topic is not available yet.
        </div>
      )}

      {topic.simulator ? (
        <section className="space-y-4 pt-4">
          <h3 className="font-display text-2xl font-[450] tracking-[-0.02em] text-ink">
            Interactive simulator
          </h3>
          <MemoryMapStage kind={topic.simulator} />
        </section>
      ) : null}
    </div>
  );

  const quizPanel =
    topic.questions.length > 0 ? (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-2xl font-[450] tracking-[-0.02em] text-ink">
            Check your understanding
          </h2>
          <Link
            href="/quiz"
            className="text-sm text-ink-soft underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink"
          >
            Open all quizzes
          </Link>
        </div>

        <TopicQuizRunner
          slug={topic.slug}
          title={topic.title}
          questions={topic.questions}
        />

        <AllQuestions questions={topic.questions} />
      </div>
    ) : undefined;

  const url = absoluteUrl(`/topics/${topic.slug}`);
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: topic.title,
      description: topic.summary,
      url,
      inLanguage: "en",
      timeRequired: `PT${topic.minutes}M`,
      isPartOf: { "@type": "WebSite", name: SITE.name, url: SITE.url },
      about: topic.standard.map((s) => ({
        "@type": "Thing",
        name: `C++ standard ${s}`,
      })),
      citation: topic.cppreference.map((l) => ({
        "@type": "CreativeWork",
        name: l.title,
        url: l.local ? absoluteUrl(l.href) : l.href,
      })),
    },
    ...(topic.questions.length
      ? [
          {
            "@context": "https://schema.org",
            "@type": "Quiz",
            name: `${topic.title}: quiz`,
            url: `${url}?view=quiz`,
            about: topic.title,
            hasPart: topic.questions.map((q) => ({
              "@type": "Question",
              eduQuestionType: "Multiple choice",
              text: q.prompt,
              suggestedAnswer: q.options
                .map((o, i) => ({ "@type": "Answer", text: o, position: i }))
                .filter((a) => a.position !== q.answer),
              acceptedAnswer: {
                "@type": "Answer",
                text: q.options[q.answer],
                position: q.answer,
                answerExplanation: { "@type": "Comment", text: q.explanation },
              },
            })),
          },
        ]
      : []),
  ];

  return (
    <>
      <JsonLd data={jsonLd} />
      <header className="mx-auto max-w-7xl px-4 pt-28 pb-10 sm:px-6 sm:pt-36">
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-ink-soft">
            <li>
              <Link
                href="/topics"
                className="underline decoration-transparent underline-offset-4 hover:text-ink hover:decoration-line-strong"
              >
                Topics
              </Link>
            </li>
            <li aria-hidden className="text-ink-faint">
              /
            </li>
            <li>
              <Link
                href={`/topics#${topic.trackId}`}
                className="underline decoration-transparent underline-offset-4 hover:text-ink hover:decoration-line-strong"
              >
                {topic.trackTitle}
              </Link>
            </li>
          </ol>
        </nav>

        <h1 className="mt-4 max-w-[24ch] font-display text-[clamp(2.2rem,5.5vw,4rem)] leading-[1.04] font-[450] tracking-[-0.035em] text-ink text-balance">
          {topic.title}
        </h1>

        {topic.summary ? (
          <p className="mt-5 max-w-[60ch] text-[1.125rem] leading-relaxed text-ink-soft sm:text-[1.2rem]">
            {topic.summary}
          </p>
        ) : null}

        <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-ink-soft">
          {topic.standard.length > 0 ? (
            <ul
              aria-label="ISO C++ standard clauses"
              className="flex flex-wrap items-center gap-1.5"
            >
              {topic.standard.map((clause) => (
                <li key={clause}>
                  <a
                    href={standardRefToUrl(clause)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-[var(--radius-chip)] border border-line bg-paper-raised px-2 py-0.5 font-mono text-xs text-ink-soft hover:border-ink/40 hover:text-ink"
                  >
                    <span>{clause}</span>
                    <ExternalLink className="size-2.5" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}

          <span className="tabular-nums">{topic.minutes} min read</span>

          <span className="tabular-nums">
            {topic.questions.length}{" "}
            {topic.questions.length === 1 ? "question" : "questions"}
          </span>

          <TrackProgressCount
            questionIds={topic.questions.map((q) => q.id)}
            className="text-xs"
          />

          <TopicStudyActions slug={topic.slug} />
        </div>
      </header>

      <ReferenceViews
        read={readPanel}
        map={mapPanel}
        quiz={quizPanel}
        questionCount={topic.questions.length}
      />
    </>
  );
}

export default function TopicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense fallback={<TopicSkeleton />}>
      <TopicLoader params={params} />
    </Suspense>
  );
}
