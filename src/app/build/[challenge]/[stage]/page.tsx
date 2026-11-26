import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StageWorkspace } from "@/components/build/StageWorkspace";
import type { RailChallengeInfo } from "@/components/build/CourseRailShell";
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

export default async function StagePage({ params }: { params: Params }) {
  const { challenge, stage: stageSlug } = await params;
  const data = getBuildStage(challenge, stageSlug);
  const fullChallenge = getBuildChallenge(challenge);
  if (!data || !fullChallenge) notFound();

  const { stage, prev, next } = data;
  const base = `/build/${challenge}`;
  // Read at build time (the page is prerendered via generateStaticParams).
  const starter = getChallengeStarter(challenge);

  const railChallenge: RailChallengeInfo = {
    slug: fullChallenge.slug,
    title: fullChallenge.title,
    standard: fullChallenge.standard,
    repoUrl: fullChallenge.repoUrl,
    hasBrowserGrader: starter !== null,
    stages: fullChallenge.stages.map((s) => ({
      number: s.number,
      slug: s.slug,
      title: s.title,
    })),
  };

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
      <StageWorkspace
        challenge={railChallenge}
        stage={stage}
        prev={prev}
        next={next}
        starter={starter}
      >
        <TopicMarkdown content={data.body} />
      </StageWorkspace>
    </>
  );
}
