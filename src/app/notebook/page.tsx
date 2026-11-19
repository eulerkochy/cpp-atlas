import type { Metadata } from "next";
import { Suspense } from "react";
import { NotebookLmIcon } from "@/components/AiBrandIcons";
import {
  NotebookStudioClient,
  type NotebookTopicOption,
} from "@/components/NotebookStudioClient";
import { PageHeader } from "@/components/PageHeader";
import { buildOgImageUrl, SITE } from "@/lib/site";
import { getSiteStats } from "@/lib/site-stats";
import { getAllTopics } from "@/lib/topics";

export function generateMetadata(): Metadata {
  const stats = getSiteStats();
  const title = "NotebookLM & Gemini Studio";
  const description = `Grounded Q&A, two-host Audio Overviews, Study Guides, and public NotebookLM workspaces across all ${stats.topics} C++ study topics and ${stats.referencePages.toLocaleString("en-US")} offline reference pages.`;
  const ogImage = buildOgImageUrl({
    title: "NotebookLM & Gemini Studio",
    kicker: "Audio Overviews · Study Guides",
    meta: `${stats.topics} study topics + ${stats.referencePages.toLocaleString("en-US")} reference pages`,
    sub: "Live grounded chat & two-host audio",
  });
  return {
    title,
    description,
    alternates: { canonical: "/notebook" },
    openGraph: {
      title,
      description,
      url: "/notebook",
      siteName: SITE.name,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: `${title} — ${SITE.name}`,
        },
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

function StudioSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, idx) => (
          <div
            key={idx}
            className="h-32 rounded-[var(--radius-panel)] border border-line bg-paper-raised"
          />
        ))}
      </div>
      <div className="grid items-start gap-8 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="h-[540px] rounded-[var(--radius-window)] border border-line bg-paper-raised" />
        <div className="h-[640px] rounded-[var(--radius-window)] border border-line bg-paper-raised" />
      </div>
    </div>
  );
}

export default function NotebookPage() {
  const topics: NotebookTopicOption[] = getAllTopics().map((t) => ({
    slug: t.slug,
    title: t.title,
    trackTitle: t.trackTitle,
    summary: t.summary,
  }));

  return (
    <>
      <PageHeader
        title="NotebookLM & Gemini studio"
        icon={
          <span
            aria-hidden
            className="inline-flex size-12 items-center justify-center rounded-2xl border border-ink/12 bg-sun text-ink shadow-[0_6px_20px_-8px_rgb(120_80_0/0.3)] sm:size-14"
          >
            <NotebookLmIcon className="size-6 sm:size-7" />
          </span>
        }
      >
        Open curated public NotebookLM workspaces or run grounded multi-source
        Q&amp;A, two-host Audio Overviews, and Study Guides directly inside C++
        Atlas—with clean Markdown always one click away.
      </PageHeader>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Suspense fallback={<StudioSkeleton />}>
          <NotebookStudioClient topics={topics} />
        </Suspense>
      </div>
    </>
  );
}
