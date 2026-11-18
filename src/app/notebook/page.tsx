import type { Metadata } from "next";
import {
  NotebookStudioClient,
  type NotebookTopicOption,
} from "@/components/NotebookStudioClient";
import { PageHeader } from "@/components/PageHeader";
import { getAllTopics } from "@/lib/topics";

export const metadata: Metadata = {
  title: "Gemini NotebookLM Podcast Studio",
  description:
    "Assemble clean, Audio-Overview-ready Markdown bundles from study topics and any indexed cppreference pages for Google NotebookLM.",
};

export default function NotebookPage() {
  const topics: NotebookTopicOption[] = getAllTopics().map((t) => ({
    slug: t.slug,
    title: t.title,
    trackTitle: t.trackTitle,
    summary: t.summary,
  }));

  return (
    <>
      <PageHeader title="NotebookLM studio">
        Combine any study topics or pages from the 1:1 C++ and C reference index
        into plain, hierarchically structured Markdown for Google NotebookLM
        Audio Overviews—complete with concept maps and Socratic quiz traps.
      </PageHeader>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <NotebookStudioClient topics={topics} />
      </div>
    </>
  );
}
