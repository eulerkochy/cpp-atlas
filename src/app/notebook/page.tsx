import type { Metadata } from "next";
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
  const title = "Markdown & NotebookLM Export";
  const description = `Bundle any of the ${stats.topics} C++ study topics or ${stats.referencePages.toLocaleString("en-US")} offline reference pages into clean plain Markdown for NotebookLM or local tools.`;
  const ogImage = buildOgImageUrl({
    title: "Plain Markdown & NotebookLM Studio",
    kicker: "Clean .md Bundles",
    meta: `${stats.topics} study topics + ${stats.referencePages.toLocaleString("en-US")} reference pages`,
    sub: "NotebookLM & local LLM ready",
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
      images: [{ url: ogImage, width: 1200, height: 630, alt: `${title} — ${SITE.name}` }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
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
      <PageHeader title="Markdown & NotebookLM studio">
        Combine any study topics or pages from the offline C++ and C reference
        into plain, hierarchically structured Markdown—ready for Google
        NotebookLM Audio Overviews, offline reading, or local LLM context.
      </PageHeader>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <NotebookStudioClient topics={topics} />
      </div>
    </>
  );
}
