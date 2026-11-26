import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ExternalLink } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ChallengeOverviewRail } from "@/components/build/ChallengeOverviewRail";
import { ChessWorkbench } from "@/components/build/ChessWorkbench";
import type { RailChallengeInfo } from "@/components/build/CourseRailShell";
import { DifficultyBadge } from "@/components/build/DifficultyBadge";
import { StageDoneCount, StageDoneDot } from "@/components/build/StageDone";
import { JsonLd } from "@/components/JsonLd";
import { TopicMarkdown } from "@/components/TopicMarkdown";
import {
  getBuildChallenge,
  getChallengeStarter,
  getLiveChallengeSlugs,
} from "@/lib/build-challenges";
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
  const hasBrowserGrader = getChallengeStarter(challenge.slug) !== null;

  const railChallenge: RailChallengeInfo = {
    slug: challenge.slug,
    title: challenge.title,
    standard: challenge.standard,
    repoUrl: challenge.repoUrl,
    hasBrowserGrader,
    stages: challenge.stages.map((s) => ({
      number: s.number,
      slug: s.slug,
      title: s.title,
    })),
  };

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
      <ChallengeOverviewRail challenge={railChallenge} prerequisites={challenge.prerequisites}>
        <div className="space-y-10">
          <header className="space-y-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-ink-soft">
              <span className="inline-flex items-center rounded-[var(--radius-chip)] border border-line bg-paper-raised px-2 py-0.5 font-mono text-ink">
                {challenge.standard}
              </span>
              <span className="tabular-nums">{challenge.stages.length} stages</span>
              <span>·</span>
              <span>{hasBrowserGrader ? "Template repo + browser grader" : "Template repo"}</span>
              <StageDoneCount ids={stageIds} />
            </div>

            <h1 className="max-w-[24ch] font-display text-[clamp(2rem,4.2vw,2.85rem)] leading-[1.06] font-[500] tracking-[-0.03em] text-ink text-balance">
              {challenge.title}
            </h1>

            <p className="max-w-[62ch] text-[1.06rem] leading-relaxed text-ink-soft">
              {challenge.description}
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
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
              className="rounded-[var(--radius-panel)] border border-line bg-paper-raised"
            >
              <h2
                id="setup-heading"
                className="border-b border-line px-5 py-3 text-sm font-medium text-ink"
              >
                Set up in five steps
              </h2>
              <ol className="divide-y divide-line">
                {setupSteps.map((step, i) => (
                  <li
                    key={step.title}
                    className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-start gap-3.5">
                      <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-line-strong bg-paper-sunk font-mono text-xs font-medium text-ink-soft tabular-nums">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">{step.title}</p>
                        <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{step.body}</p>
                      </div>
                    </div>
                    {step.href ? (
                      <a
                        href={step.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonVariants({
                          variant: "outline",
                          size: "sm",
                          className: "h-9 shrink-0 self-start border-ink/25 sm:self-center",
                        })}
                      >
                        {step.cta}
                        <ExternalLink className="size-3.5" aria-hidden />
                      </a>
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>
          </header>

          {challenge.slug === "chess" ? <ChessWorkbench /> : null}

          <div className="[&_.prose-atlas>*:first-child]:mt-0">
            <TopicMarkdown content={challenge.overview} />
          </div>

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
      </ChallengeOverviewRail>
    </>
  );
}
