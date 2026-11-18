import { NextResponse } from "next/server";
import { COMPANION_OVERLAYS } from "@/data/companions";
import {
  ALL_CPPREF_DOMAINS,
  ALL_CREF_DOMAINS,
  TOTAL_COMBINED_STATS,
} from "@/lib/cppref-index";
import { getAllTopics } from "@/lib/topics";

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://cpp-atlas.vercel.app";

export function GET() {
  const topics = getAllTopics();

  const lines: string[] = [
    "# C++ Atlas",
    "",
    `> ${topics.length} structured C++ study topics paired with a full 1:1 indexed companion to en.cppreference.com covering ${TOTAL_COMBINED_STATS.uniquePages} pages and ${TOTAL_COMBINED_STATS.totalEntries} symbols across ${TOTAL_COMBINED_STATS.domainCount} C++ and C domains.`,
    "",
    "## Gemini Notebook / NotebookLM Audio Overview Ingestion",
    "",
    `- Complete study guide (all topics combined): ${BASE_URL}/api/notebook/topics-all`,
    "- Every `/topics/<slug>` exposes clean Markdown (with concept map outline and quiz traps) at `/api/notebook/topic/<slug>`.",
    "- Every `/w/cpp/<path>` and `/w/c/<path>` page renders complete server-side semantic HTML (`<article>`), making direct URL ingestion reliable.",
    "- Every reference page also exposes clean Audio-Overview-ready Markdown at `/api/notebook/<path>` (or `/api/notebook/c/<path>` for C pages).",
    "",
    "## Study Topics (with Concept Maps & Standardese Quizzes)",
    "",
    ...topics.map(
      (t) =>
        `- [${t.title}](${BASE_URL}/topics/${t.slug}) — [Markdown](${BASE_URL}/api/notebook/topic/${t.slug}): ${t.summary}`
    ),
    "",
    "## Flagship Interactive Study Companions",
    "",
    ...COMPANION_OVERLAYS.map(
      (c) =>
        `- [${c.title}](${BASE_URL}/w/cpp/${c.primaryPath}) — [Markdown](${BASE_URL}/api/notebook/${c.primaryPath}): ${c.mentalModelOneLiner}`
    ),
    "",
    "## C++ Reference Domains (/w/cpp)",
    "",
    ...ALL_CPPREF_DOMAINS.map(
      (d) =>
        `- ${d.name} (${d.count} entries): ${BASE_URL}/explore?lang=cpp&domain=${encodeURIComponent(d.name)}`
    ),
    "",
    "## C Reference Domains (/w/c)",
    "",
    ...ALL_CREF_DOMAINS.map(
      (d) =>
        `- ${d.name} (${d.count} entries): ${BASE_URL}/explore?lang=c&domain=${encodeURIComponent(d.name)}`
    ),
    "",
    "## Global Endpoints",
    "",
    `- Study Topics: ${BASE_URL}/topics`,
    `- Concept Maps: ${BASE_URL}/maps`,
    `- Study Desk: ${BASE_URL}/study`,
    `- C++11–C++26 Evolution Timeline: ${BASE_URL}/standards`,
    `- All Topics Markdown: ${BASE_URL}/api/notebook/topics-all`,
    `- Unified Portal: ${BASE_URL}/w`,
    `- Root C++ Reference: ${BASE_URL}/w/cpp`,
    `- Root C Reference: ${BASE_URL}/w/c`,
    `- Full Directory: ${BASE_URL}/explore`,
    `- Standardese Quiz Arena: ${BASE_URL}/quiz`,
    `- NotebookLM Podcast Studio: ${BASE_URL}/notebook`,
    `- Full XML Sitemap (${TOTAL_COMBINED_STATS.uniquePages + topics.length + 11} URLs): ${BASE_URL}/sitemap.xml`,
    "",
  ];

  return new NextResponse(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
