import { NextResponse } from "next/server";
import { COMPANION_OVERLAYS } from "@/data/companions";
import { getDomainsForLang, getIndexStats } from "@/lib/cppref-index";
import { referenceHref } from "@/lib/reference";
import { SITE } from "@/lib/site";
import { getAllTopics } from "@/lib/topics";

const BASE_URL = SITE.url;

export function GET() {
  const topics = getAllTopics();
  const stats = getIndexStats("all");
  const cpp = getIndexStats("cpp");
  const cStats = getIndexStats("c");

  const lines: string[] = [
    "# C++ Atlas",
    "",
    `> ${topics.length} structured C++ study topics paired with an offline 1:1 copy of en.cppreference.com covering ${stats.pages} pages (${cpp.pages} C++, ${cStats.pages} C) across ${stats.domainCount} domains (CC-BY-SA 3.0 / GFDL).`,
    "",
    "## Plain Markdown & NotebookLM Ingestion",
    "",
    `- Complete study guide (all topics combined): ${BASE_URL}/api/notebook/topics-all`,
    "- Every `/topics/<slug>` exposes clean Markdown (with concept map outline and quiz traps) at `/api/notebook/topic/<slug>`.",
    "- Every `/w/cpp/<path>` and `/w/c/<path>` page renders complete server-side semantic HTML (`<article>`), making direct URL ingestion reliable.",
    "- Every reference page also exposes clean Audio-Overview-ready Markdown at `/api/notebook/cpp/<path>` (or `/api/notebook/c/<path>` for C pages).",
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
        `- [${c.title}](${BASE_URL}${referenceHref("cpp", c.primaryPath)}) — [Markdown](${BASE_URL}/api/notebook${referenceHref("cpp", c.primaryPath).slice(2)}): ${c.mentalModelOneLiner}`
    ),
    "",
    "## C++ Reference Domains (/w/cpp)",
    "",
    ...getDomainsForLang("cpp").map(
      (d) =>
        `- ${d.name} (${d.count} pages): ${BASE_URL}/explore?lang=cpp&domain=${encodeURIComponent(d.name)}`
    ),
    "",
    "## C Reference Domains (/w/c)",
    "",
    ...getDomainsForLang("c").map(
      (d) =>
        `- ${d.name} (${d.count} pages): ${BASE_URL}/explore?lang=c&domain=${encodeURIComponent(d.name)}`
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
    `- Standardese Quiz: ${BASE_URL}/quiz`,
    `- Markdown & NotebookLM Studio: ${BASE_URL}/notebook`,
    `- Sitemap index (topics plus all ${stats.pages.toLocaleString("en-US")} reference pages): ${BASE_URL}/sitemap.xml`,
    "",
  ];

  return new NextResponse(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
