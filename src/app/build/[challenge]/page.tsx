import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { DifficultyBadge } from "@/components/build/DifficultyBadge";
import { StageDoneCount, StageDoneDot } from "@/components/build/StageDone";
import { JsonLd } from "@/components/JsonLd";
import { TopicMarkdown } from "@/components/TopicMarkdown";
import { getBuildChallenge, getLiveChallengeSlugs } from "@/lib/build-challenges";
import { absoluteUrl, buildOgImageUrl, SITE } from "@/lib/site";

type Params = Promise<{ challenge: string }>;

export async function generateStaticParams() {
  return getLiveChallengeSlugs().map((challenge) => ({ challenge }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { challenge: slug } = await params;
  const challenge = getBuildChallenge(slug);
  if (!challenge) return { title: "Challenge not found" };
  const path = `/build/${challenge.slug}`;
  const ogImage = buildOgImageUrl({
    title: challenge.title,
    kicker: "C++ Atlas Challenge",
    meta: `${challenge.stages.length} stages / ${challenge.standard}`,
  });
  return {
    title: challenge.title,
    description: challenge.tagline,
    alternates: { canonical: path },
    openGraph: {
      title: challenge.title,
      description: challenge.tagline,
      type: "article",
      url: path,
      siteName: SITE.name,
      images: [{ url: ogImage, width: 1200, height: 630, alt: `${challenge.title} — ${SITE.name}` }],
    },
    twitter: { card: "summary_large_image", title: challenge.title, description: challenge.tagline, images: [ogImage] },
  };
}

export default async function ChallengePage({ params }: { params: Params }) {
  const { challenge: slug } = await params;
  const challenge = getBuildChallenge(slug);
  if (!challenge) notFound();

  const stageIds = challenge.stages.map((s) => `${challenge.slug}/${s.slug}`);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: challenge.title,
    description: challenge.description,
    url: absoluteUrl(`/build/${challenge.slug}`),
    inLanguage: "en",
    provider: { "@type": "Organization", name: SITE.name, url: SITE.url },
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <header className="mx-auto max-w-6xl px-4 pt-28 pb-10 sm:px-6 sm:pt-36">
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-ink-soft">
            <li>
              <Link
                href="/build"
                className="underline decoration-transparent underline-offset-4 hover:text-ink hover:decoration-line-strong"
              >
                Build
              </Link>
            </li>
          </ol>
        </nav>
        <h1 className="mt-4 max-w-[24ch] font-display text-[clamp(2.2rem,5.5vw,4rem)] leading-[1.04] font-[450] tracking-[-0.035em] text-ink text-balance">
          {challenge.title}
        </h1>
        <p className="mt-5 max-w-[60ch] text-[1.125rem] leading-relaxed text-ink-soft sm:text-[1.2rem]">
          {challenge.description}
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-ink-soft">
          <span className="inline-flex items-center rounded-[var(--radius-chip)] border border-line bg-paper-raised px-2 py-0.5 font-mono text-xs">
            {challenge.standard}
          </span>
          <span className="tabular-nums">{challenge.stages.length} stages</span>
          <a
            href={challenge.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink"
          >
            <span>Template repository</span>
            <ExternalLink className="size-3" aria-hidden />
          </a>
          <StageDoneCount ids={stageIds} />
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-12 px-4 pb-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="min-w-0 space-y-12">
          <TopicMarkdown content={challenge.overview} />

          <section aria-labelledby="stages-heading" className="space-y-4">
            <h2 id="stages-heading" className="font-display text-2xl font-[450] tracking-[-0.02em] text-ink">
              Stages
            </h2>
            <ol className="divide-y divide-line rounded-[var(--radius-panel)] border border-line bg-paper-raised">
              {challenge.stages.map((s) => (
                <li key={s.slug}>
                  <Link
                    href={`/build/${challenge.slug}/${s.slug}`}
                    className="group grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 p-4 transition-colors hover:bg-paper-sunk/65 sm:p-5"
                  >
                    <span className="font-display text-xl leading-tight font-[450] text-ink-faint tabular-nums">
                      {s.number}
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                        <StageDoneDot id={`${challenge.slug}/${s.slug}`} />
                        <span className="font-display text-lg font-[450] tracking-[-0.01em] text-ink decoration-sun decoration-2 underline-offset-4 group-hover:underline">
                          {s.title}
                        </span>
                        <DifficultyBadge difficulty={s.difficulty} />
                        <span className="text-xs text-ink-soft">{s.estimate}</span>
                      </span>
                      <span className="mt-1.5 block text-sm leading-relaxed text-ink-soft">
                        {s.summary}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-8 text-sm">
          {challenge.prerequisites.length > 0 ? (
            <div className="space-y-3 lg:sticky lg:top-28">
              <p className="font-medium text-ink">Read first</p>
              <ul className="space-y-2">
                {challenge.prerequisites.map((t) => (
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
