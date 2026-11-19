import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  type MapIsland,
  type MapViewBox,
} from "@/components/atlas-map-geometry";
import { MemoryMapStage } from "@/components/memory-maps/MemoryMapStage";
import { MapOutline, MindMap } from "@/components/MindMap";
import { PageAiHeaderBar, PageAiRailWidget } from "@/components/PageAiActions";
import { ReferenceViews } from "@/components/ReferenceViews";
import { SectionRail } from "@/components/SectionRail";
import {
  TopicAtlasInset,
  type TopicAtlasInsetProps,
} from "@/components/TopicAtlasInset";
import { TopicMarkdown } from "@/components/TopicMarkdown";
import { AllQuestions, TopicQuizRunner } from "@/components/TopicQuizRunner";
import {
  TopicStudyActions,
  TopicViewSwitcher,
} from "@/components/TopicViewActions";
import { JsonLd } from "@/components/JsonLd";
import { TrackProgressCount } from "@/components/TrackProgressCount";
import type { AiPageContext } from "@/lib/ai-links";
import { getAtlasPayload, type AtlasPayload } from "@/lib/atlas-data";
import { absoluteUrl, buildOgImageUrl, SITE } from "@/lib/site";
import {
  getAllTopics,
  getDependents,
  getNeighbours,
  getTopic,
  standardRefToUrl,
} from "@/lib/topics";

const roundTenth = (n: number) => Math.round(n * 10) / 10;

function encodeIslandOutlinePoints(pathData: string, step: number): number[] {
  const pts: { x: number; y: number }[] = [];
  const startMatch = pathData.match(/^M(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/);
  if (startMatch) {
    pts.push({ x: Number(startMatch[1]), y: Number(startMatch[2]) });
  }
  const curveRe =
    /C-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g;
  let match: RegExpExecArray | null;
  while ((match = curveRe.exec(pathData)) !== null) {
    pts.push({ x: Number(match[1]), y: Number(match[2]) });
  }
  if (
    pts.length > 1 &&
    Math.hypot(
      pts[pts.length - 1].x - pts[0].x,
      pts[pts.length - 1].y - pts[0].y
    ) < 0.2
  ) {
    pts.pop();
  }
  const out: number[] = [];
  let prevX = 0;
  let prevY = 0;
  for (let i = 0; i < pts.length; i += step) {
    const x = Math.round(pts[i].x);
    const y = Math.round(pts[i].y);
    if (i === 0) {
      out.push(x, y);
    } else {
      out.push(x - prevX, y - prevY);
    }
    prevX = x;
    prevY = y;
  }
  return out;
}

function fitInsetViewBox(island: MapIsland): MapViewBox {
  const aspect = 1.35;
  const pad = 18;
  const minX = Math.min(island.bounds.x, island.label.box.x);
  const minY = Math.min(island.bounds.y, island.label.box.y);
  const maxX = Math.max(
    island.bounds.x + island.bounds.w,
    island.label.box.x + island.label.box.w
  );
  const maxY = Math.max(
    island.bounds.y + island.bounds.h,
    island.label.box.y + island.label.box.h
  );
  let w = maxX - minX + pad * 2;
  let h = maxY - minY + pad * 2;
  if (w / h < aspect) {
    w = h * aspect;
  } else {
    h = w / aspect;
  }
  w = Math.min(MAP_WIDTH, w);
  h = Math.min(MAP_HEIGHT, h);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const x = Math.max(0, Math.min(MAP_WIDTH - w, cx - w / 2));
  const y = Math.max(0, Math.min(MAP_HEIGHT - h, cy - h / 2));
  return {
    x: roundTenth(x),
    y: roundTenth(y),
    w: roundTenth(w),
    h: roundTenth(h),
  };
}

function boxesIntersect(a: MapViewBox, b: MapViewBox, pad: number): boolean {
  return (
    a.x < b.x + b.w + pad &&
    a.x + a.w + pad > b.x &&
    a.y < b.y + b.h + pad &&
    a.y + a.h + pad > b.y
  );
}

function cropGraticule(graticule: string[], vb: MapViewBox): string[] {
  const out: string[] = [];
  for (const d of graticule) {
    if (d.includes("H")) {
      const match = d.match(/^M0 (\d+(?:\.\d+)?)H/);
      if (match) {
        const y = Number(match[1]);
        if (y >= vb.y - 2 && y <= vb.y + vb.h + 2) {
          out.push(`M${Math.round(vb.x)} ${y}H${Math.round(vb.x + vb.w)}`);
        }
      }
      continue;
    }
    const pairs = d
      .slice(1)
      .split("L")
      .map((pair) => pair.split(" ").map(Number));
    const kept = pairs.filter(
      ([x, y]) =>
        x >= vb.x - 28 &&
        x <= vb.x + vb.w + 28 &&
        y >= vb.y - 28 &&
        y <= vb.y + vb.h + 28
    );
    if (kept.length >= 2) {
      const slim = kept.filter(
        (_pt, idx) => idx === 0 || idx === kept.length - 1 || idx % 2 === 0
      );
      out.push(
        "M" + slim.map(([x, y]) => `${Math.round(x)} ${Math.round(y)}`).join("L")
      );
    }
  }
  return out;
}

function buildTopicInsetData(
  payload: AtlasPayload,
  topicSlug: string,
  trackId: string
): {
  inset: TopicAtlasInsetProps | null;
  region: { id: string; label: string } | null;
} {
  const matchedRegion =
    payload.regions.find((r) =>
      r.tracks.some(
        (tr) => tr.id === trackId || tr.topics.some((tp) => tp.slug === topicSlug)
      )
    ) ?? null;

  const currentIsland = payload.map.islands.find(
    (isl) =>
      isl.id === trackId || isl.towns.some((tw) => tw.slug === topicSlug)
  );

  if (!currentIsland) {
    return {
      inset: null,
      region: matchedRegion
        ? { id: matchedRegion.id, label: matchedRegion.label }
        : null,
    };
  }

  const fallbackRegionCam = payload.map.regions.find(
    (r) => r.label === currentIsland.region
  );
  const region = matchedRegion
    ? { id: matchedRegion.id, label: matchedRegion.label }
    : fallbackRegionCam
      ? { id: fallbackRegionCam.id, label: fallbackRegionCam.label }
      : { id: "", label: currentIsland.region };

  const viewBox = fitInsetViewBox(currentIsland);
  const visibleIslands = payload.map.islands.filter(
    (isl) =>
      isl.id === currentIsland.id || boxesIntersect(isl.bounds, viewBox, 12)
  );
  const regionNames = [...new Set(visibleIslands.map((isl) => isl.region))];

  const routes = payload.map.routes
    .filter((rt) => rt.from === topicSlug || rt.to === topicSlug)
    .map((rt) => ({
      dir: (rt.to === topicSlug ? "in" : "out") as "in" | "out",
      d: rt.d,
      ...(rt.crossesSea ? { sea: true } : {}),
    }));

  return {
    region: region.id ? region : null,
    inset: {
      currentSlug: topicSlug,
      islandId: currentIsland.id,
      islandTitle: currentIsland.title,
      regionLabel: currentIsland.region,
      viewBox,
      islands: visibleIslands.map((isl) => ({
        id: isl.id,
        r: regionNames.indexOf(isl.region),
        pts: encodeIslandOutlinePoints(
          isl.path,
          isl.id === currentIsland.id ? 2 : 3
        ),
      })),
      label: {
        lines: currentIsland.label.lines,
        x: currentIsland.label.x,
        y: currentIsland.label.y,
      },
      towns: currentIsland.towns.map((town) => ({
        slug: town.slug,
        title: town.title,
        minutes: town.minutes,
        x: town.x,
        y: town.y,
        ...(town.simulator ? { simulator: true } : {}),
      })),
      graticule: cropGraticule(payload.map.graticule, viewBox),
      routes,
    },
  };
}

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
  const metaBadge = `${topic.minutes} min read / ${topic.questions.length} questions${topic.simulator ? " / Debugger" : ""}`;
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
  const { inset, region } = buildTopicInsetData(
    getAtlasPayload(),
    topic.slug,
    topic.trackId
  );

  const aiContext: AiPageContext = {
    kind: "topic",
    title: topic.title,
    subtitle: topic.summary || undefined,
    urlPath: `/topics/${topic.slug}`,
    markdownEndpoint: `/api/notebook/topic/${topic.slug}`,
    slug: topic.slug,
    trackId: topic.trackId,
    trackTitle: topic.trackTitle,
    clauses: topic.standard,
  };

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
          hasMap={Boolean(topic.map)}
          hasDebugger={Boolean(topic.simulator)}
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
          {inset ? <TopicAtlasInset {...inset} /> : null}

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

          <PageAiRailWidget context={aiContext} />
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
    </div>
  );

  const debuggerPanel = topic.simulator ? (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 space-y-4">
      <div className="space-y-1">
        <h2 className="font-display text-2xl font-[450] tracking-[-0.02em] text-ink">
          Interactive debugger
        </h2>
        <p className="text-sm text-ink-soft">
          Step through execution, set breakpoints, and inspect live watch, memory, and compiler state.
        </p>
      </div>
      <MemoryMapStage kind={topic.simulator} topicSlug={topic.slug} />
    </div>
  ) : undefined;

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
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
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
              {region ? (
                <>
                  <li aria-hidden className="text-ink-faint">
                    /
                  </li>
                  <li>
                    <Link
                      href={`/maps?region=${region.id}`}
                      className="font-display italic tracking-[0.08em] text-ink-soft underline decoration-transparent underline-offset-4 hover:text-ink hover:decoration-line-strong"
                    >
                      {region.label}
                    </Link>
                  </li>
                </>
              ) : null}
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

          <Link
            href={`/maps?topic=${topic.slug}`}
            className="text-xs text-ink-soft underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink"
          >
            Locate on map
          </Link>
        </div>

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

        <div className="mt-4">
          <PageAiHeaderBar context={aiContext} />
        </div>
      </header>

      <ReferenceViews
        read={readPanel}
        map={mapPanel}
        debug={debuggerPanel}
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
