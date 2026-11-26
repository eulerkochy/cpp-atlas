import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ExternalLink } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ChessWorkbench } from "@/components/build/ChessWorkbench";
import { DifficultyBadge } from "@/components/build/DifficultyBadge";
import { StageDoneCount, StageDoneDot } from "@/components/build/StageDone";
import { JsonLd } from "@/components/JsonLd";
import { TopicMarkdown } from "@/components/TopicMarkdown";
import { getBuildChallenge, getLiveChallengeSlugs } from "@/lib/build-challenges";
import { absoluteUrl, buildOgImageUrl, SITE } from "@/lib/site";

function buildSetupSteps(slug: string): { title: string; body: ReactNode; href?: string; cta?: string }[] {
  return [
    { title: "Use the template", body: "Make your own copy of the challenge repository." },
    { title: "Clone it", body: "Or open it in a Codespace." },
    {
      title: "Submit",
      body: (
        <>
          Run <code className="font-mono text-[0.9em] text-ink">./cppatlas submit</code>. A pass advances{" "}
          <code className="font-mono text-[0.9em] text-ink">.cppatlas.json</code>.
        </>
      ),
    },
    {
      title: "Install the app",
      body: "Optional. Grades every push, on any or all of your repositories.",
      href: "https://github.com/apps/c-atlas-grader/installations/new",
      cta: "Install c-atlas-grader",
    },
    {
      title: "Push",
      body: (
        <>
          Look for the <code className="font-mono text-[0.9em] text-ink">cppatlas / {slug}</code> check on the commit.
        </>
      ),
    },
  ];
}

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

  const setupSteps = buildSetupSteps(challenge.slug);
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
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-ink-soft">
          <span className="inline-flex items-center rounded-[var(--radius-chip)] border border-line bg-paper-raised px-2 py-0.5 font-mono text-xs">
            {challenge.standard}
          </span>
          <span className="tabular-nums">{challenge.stages.length} stages</span>
          <StageDoneCount ids={stageIds} />
        </div>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <a
            href={challenge.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ size: "lg" })}
          >
            Use the template
            <ExternalLink className="size-4" aria-hidden />
          </a>
          <Link
            href={`/build/${challenge.slug}/${challenge.stages[0].slug}`}
            className={buttonVariants({ size: "lg", variant: "outline" })}
          >
            Read stage 1
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>

        <section
          aria-labelledby="setup-heading"
          className="mt-12 rounded-[var(--radius-panel)] border border-line bg-paper-raised"
        >
          <h2
            id="setup-heading"
            className="border-b border-line px-5 py-3 text-sm font-medium text-ink"
          >
            Set up in five steps
          </h2>
          <ol className="grid divide-y divide-line md:grid-cols-5 md:divide-x md:divide-y-0">
            {setupSteps.map((step, i) => (
              <li key={step.title} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3 p-5 md:block">
                <span className="font-display text-xl leading-none font-[450] text-ink-faint tabular-nums md:block">
                  {i + 1}
                </span>
                <div className="min-w-0 md:mt-3">
                  <p className="font-medium text-ink">{step.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-soft">{step.body}</p>
                  {step.href ? (
                    <a
                      href={step.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonVariants({ variant: "outline", size: "sm", className: "mt-3 h-10 border-ink/25" })}
                    >
                      {step.cta}
                      <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      </header>

      {challenge.slug === "chess" ? (
        <div className="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
          <ChessWorkbench />
        </div>
      ) : null}

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
                    className="group grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 p-4 transition-colors hover:bg-paper-sunk/65 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink sm:p-5"
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
