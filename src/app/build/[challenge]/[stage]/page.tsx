import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { DifficultyBadge } from "@/components/build/DifficultyBadge";
import { GraderPanel } from "@/components/build/GraderPanel";
import { StageDoneButton } from "@/components/build/StageDone";
import { JsonLd } from "@/components/JsonLd";
import { TopicMarkdown } from "@/components/TopicMarkdown";
import {
  getBuildChallenge,
  getBuildStage,
  getChallengeStarter,
  getLiveChallengeSlugs,
} from "@/lib/build-challenges";
import { absoluteUrl, buildOgImageUrl, SITE } from "@/lib/site";

type Params = Promise<{ challenge: string; stage: string }>;

export async function generateStaticParams() {
  return getLiveChallengeSlugs().flatMap((challenge) =>
    (getBuildChallenge(challenge)?.stages ?? []).map((s) => ({ challenge, stage: s.slug }))
  );
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { challenge, stage: stageSlug } = await params;
  const data = getBuildStage(challenge, stageSlug);
  if (!data) return { title: "Stage not found" };
  const { stage } = data;
  const title = `Stage ${stage.number}: ${stage.title}`;
  const path = `/build/${challenge}/${stage.slug}`;
  const ogImage = buildOgImageUrl({
    title: stage.title,
    kicker: `${data.challenge.title} / Stage ${stage.number} of ${data.stageCount}`,
    meta: `${stage.estimate}`,
  });
  return {
    title,
    description: stage.summary,
    alternates: { canonical: path },
    openGraph: {
      title,
      description: stage.summary,
      type: "article",
      url: path,
      siteName: SITE.name,
      images: [{ url: ogImage, width: 1200, height: 630, alt: `${title} — ${SITE.name}` }],
    },
    twitter: { card: "summary_large_image", title, description: stage.summary, images: [ogImage] },
  };
}

const adjacentLink =
  "group rounded-[var(--radius-panel)] border border-line bg-paper-raised p-4 transition-colors hover:border-line-strong";
const adjacentTitle =
  "mt-1 font-display text-lg font-[450] text-ink decoration-sun decoration-2 underline-offset-4 group-hover:underline";

export default async function StagePage({ params }: { params: Params }) {
  const { challenge, stage: stageSlug } = await params;
  const data = getBuildStage(challenge, stageSlug);
  if (!data) notFound();
  const { stage, prev, next } = data;
  const base = `/build/${challenge}`;
  // Read at build time (the page is prerendered via generateStaticParams).
  const starter = getChallengeStarter(challenge);
  const allStages = (getBuildChallenge(challenge)?.stages ?? []).map((s) => ({
    number: s.number,
    slug: s.slug,
    title: s.title,
  }));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: `Stage ${stage.number}: ${stage.title}`,
    description: stage.summary,
    url: absoluteUrl(`${base}/${stage.slug}`),
    inLanguage: "en",
    isPartOf: { "@type": "Course", name: data.challenge.title, url: absoluteUrl(base) },
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <header className="mx-auto max-w-6xl px-4 pt-28 pb-10 sm:px-6 sm:pt-36">
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-ink-soft">
            <li>
              <Link href="/build" className="underline decoration-transparent underline-offset-4 hover:text-ink hover:decoration-line-strong">
                Build
              </Link>
            </li>
            <li aria-hidden className="text-ink-faint">/</li>
            <li>
              <Link href={base} className="underline decoration-transparent underline-offset-4 hover:text-ink hover:decoration-line-strong">
                {data.challenge.title}
              </Link>
            </li>
          </ol>
        </nav>
        <p className="mt-6 text-sm font-medium text-ink-soft tabular-nums">
          Stage {stage.number} of {data.stageCount}
        </p>
        <h1 className="mt-2 max-w-[24ch] font-display text-[clamp(2.2rem,5.5vw,4rem)] leading-[1.04] font-[450] tracking-[-0.035em] text-ink text-balance">
          {stage.title}
        </h1>
        <p className="mt-5 max-w-[60ch] text-[1.125rem] leading-relaxed text-ink-soft sm:text-[1.2rem]">
          {stage.summary}
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-3 text-sm text-ink-soft">
          <DifficultyBadge difficulty={stage.difficulty} />
          <span>{stage.estimate}</span>
          {stage.concepts.length > 0 ? (
            <ul aria-label="Concepts" className="flex flex-wrap items-center gap-1.5">
              {stage.concepts.map((c) => (
                <li
                  key={c}
                  className="rounded-[var(--radius-chip)] border border-line bg-paper-raised px-2 py-0.5 font-mono text-xs text-ink-soft"
                >
                  {c}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-12 px-4 pb-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="min-w-0 space-y-10">
          <TopicMarkdown content={data.body} />

          <section aria-labelledby="run-heading" className="max-w-[var(--measure)] space-y-8">
            <div className="space-y-2">
              <h2 id="run-heading" className="font-display text-2xl font-[450] tracking-[-0.02em] text-ink">
                Run the tests
              </h2>
              <p className="text-[0.98rem] leading-relaxed text-ink-soft">
                {stage.number === 1
                  ? "The grader builds your header and runs the stage 1 tests."
                  : `The grader runs stages 1 to ${stage.number} in order and stops at the first stage that fails.`}
              </p>
            </div>

            <div className="space-y-3 rounded-[var(--radius-panel)] border border-line bg-paper-sunk/65 p-5">
              <h3 className="text-base font-medium text-ink">From your challenge repo</h3>
              <pre className="overflow-x-auto rounded-[var(--radius-chip)] border border-line bg-paper-raised px-4 py-3 font-mono text-[0.82rem] text-ink-body">
                <code>./cppatlas submit</code>
              </pre>
              <p className="text-sm text-ink-soft">
                To run the same tests on your machine instead, use{" "}
                <code className="font-mono text-[0.9em]">./cppatlas test {stage.number}</code>. They live in{" "}
                <code className="font-mono text-[0.9em]">{stage.testFile}</code>.
              </p>
              <div className="pt-1">
                <StageDoneButton id={`${challenge}/${stage.slug}`} />
              </div>
            </div>

            <GraderPanel
              key={stage.slug}
              challenge={challenge}
              challengeTitle={data.challenge.title}
              stage={stage.number}
              stages={allStages}
              starter={starter}
            />
          </section>

          <nav aria-label="Adjacent stages" className="grid max-w-[var(--measure)] gap-4 border-t border-line pt-8 sm:grid-cols-2">
            {prev ? (
              <Link href={`${base}/${prev.slug}`} className={adjacentLink}>
                <span className="inline-flex items-center gap-1.5 text-xs text-ink-faint">
                  <ArrowLeft className="size-3.5" aria-hidden />
                  <span>Previous stage</span>
                </span>
                <div className={adjacentTitle}>{prev.number}. {prev.title}</div>
              </Link>
            ) : (
              <div />
            )}
            {next ? (
              <Link href={`${base}/${next.slug}`} className={`${adjacentLink} sm:text-right`}>
                <span className="inline-flex items-center gap-1.5 text-xs text-ink-faint sm:justify-end">
                  <span>Next stage</span>
                  <ArrowRight className="size-3.5" aria-hidden />
                </span>
                <div className={adjacentTitle}>{next.number}. {next.title}</div>
              </Link>
            ) : (
              <Link href={base} className={`${adjacentLink} sm:text-right`}>
                <span className="text-xs text-ink-faint">Finished</span>
                <div className={adjacentTitle}>Back to the challenge</div>
              </Link>
            )}
          </nav>
        </div>

        <aside className="space-y-8 text-sm">
          {stage.atlasTopics.length > 0 ? (
            <div className="space-y-3 lg:sticky lg:top-28">
              <p className="font-medium text-ink">Read on the Atlas</p>
              <ul className="space-y-2">
                {stage.atlasTopics.map((t) => (
                  <li key={t.slug}>
                    <Link
                      href={`/topics/${t.slug}`}
                      className="text-sm text-ink-soft underline decoration-line-strong underline-offset-3 hover:text-ink hover:decoration-ink"
                    >
                      {t.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>
    </>
  );
}
