import { NextResponse } from "next/server";
import { STANDARDS_MILESTONES } from "@/data/standards-evolution";
import { searchCppRefIndex } from "@/lib/cppref-index";
import { getAllTopics } from "@/lib/topics";
import type { ReferenceLang } from "@/types/cpp";
import type {
  TopicSearchResult,
  UnifiedSearchResultItem,
} from "@/types/topics";

function searchStandards(query: string, limit = 4): UnifiedSearchResultItem[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  const scored: { item: UnifiedSearchResultItem; score: number }[] = [];

  for (const m of STANDARDS_MILESTONES) {
    const titleLower = m.title.toLowerCase();
    const eraLower = m.era.toLowerCase();
    const paperLower = m.paper.toLowerCase();
    const clauseLower = m.clause.toLowerCase();
    const idLower = m.id.toLowerCase();
    const shiftLower = m.shift.toLowerCase();
    const slugLower = m.topicSlug.toLowerCase();
    const cpprefLower = m.cpprefPath.toLowerCase();

    let score = 0;
    if (
      paperLower === trimmed ||
      idLower === trimmed ||
      clauseLower === trimmed ||
      titleLower === trimmed
    ) {
      score = 120;
    } else if (
      paperLower.startsWith(trimmed) ||
      titleLower.startsWith(trimmed) ||
      clauseLower.includes(trimmed)
    ) {
      score = 90;
    } else if (titleLower.includes(trimmed) || eraLower === trimmed) {
      score = 70;
    } else if (
      eraLower.includes(trimmed) ||
      shiftLower.includes(trimmed) ||
      slugLower.includes(trimmed) ||
      cpprefLower.includes(trimmed)
    ) {
      score = 45;
    }

    if (score > 0) {
      scored.push({
        score,
        item: {
          kind: "standard" as const,
          lang: "cpp" as const,
          name: `${m.era}: ${m.title}`,
          path: m.id,
          urlPath: `/standards#${m.id}`,
          type: m.era,
          hasCompanion: false,
          companionShortTitle: m.paper,
        },
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.item);
}

function searchTopics(query: string, limit: number): TopicSearchResult[] {
  const all = getAllTopics();
  const trimmed = query.trim().toLowerCase();

  if (!trimmed) {
    return all.slice(0, limit).map((t) => ({
      slug: t.slug,
      title: t.title,
      summary: t.summary,
      trackTitle: t.trackTitle,
      minutes: t.minutes,
      urlPath: `/topics/${t.slug}`,
    }));
  }

  const scored: { topic: TopicSearchResult; score: number }[] = [];

  for (const t of all) {
    const titleLower = t.title.toLowerCase();
    const slugLower = t.slug.toLowerCase();
    const summaryLower = t.summary.toLowerCase();
    const trackLower = t.trackTitle.toLowerCase();
    const standardJoined = t.standard.join(" ").toLowerCase();
    const cpprefJoined = t.cppreference
      .map((c) => `${c.title} ${c.path}`)
      .join(" ")
      .toLowerCase();

    let score = 0;
    if (titleLower === trimmed || slugLower === trimmed) {
      score = 120;
    } else if (titleLower.startsWith(trimmed) || slugLower.startsWith(trimmed)) {
      score = 95;
    } else if (titleLower.includes(trimmed) || slugLower.includes(trimmed)) {
      score = 75;
    } else if (standardJoined.includes(trimmed)) {
      score = 65;
    } else if (cpprefJoined.includes(trimmed)) {
      score = 55;
    } else if (summaryLower.includes(trimmed) || trackLower.includes(trimmed)) {
      score = 40;
    }

    if (score > 0) {
      scored.push({
        score,
        topic: {
          slug: t.slug,
          title: t.title,
          summary: t.summary,
          trackTitle: t.trackTitle,
          minutes: t.minutes,
          urlPath: `/topics/${t.slug}`,
        },
      });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.topic.title.localeCompare(b.topic.title));
  return scored.slice(0, limit).map((s) => s.topic);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const domain = searchParams.get("domain") ?? undefined;
  const rawLang = searchParams.get("lang");
  const lang: "all" | ReferenceLang =
    rawLang === "cpp" || rawLang === "c" ? rawLang : "all";
  const rawLimit = Number(searchParams.get("limit") ?? "40");
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(rawLimit, 1), 100)
    : 40;

  const includeTopics =
    (!domain || domain === "all") && (lang === "all" || lang === "cpp");
  const topics = includeTopics
    ? searchTopics(q, q.trim() ? Math.min(10, limit) : 6)
    : [];

  const refResults: UnifiedSearchResultItem[] = searchCppRefIndex(
    q,
    domain,
    limit,
    lang
  ).map((item) => ({
    ...item,
    kind: "reference" as const,
  }));

  const topicAsUnified: UnifiedSearchResultItem[] = q.trim()
    ? topics.map((t) => ({
        kind: "topic" as const,
        slug: t.slug,
        lang: "cpp" as const,
        name: t.title,
        path: t.slug,
        urlPath: t.urlPath,
        type: "Study topic",
        hasCompanion: true,
        companionShortTitle: t.trackTitle,
      }))
    : [];

  const standardResults: UnifiedSearchResultItem[] =
    q.trim() && includeTopics ? searchStandards(q, 4) : [];

  const minRefQuota = Math.min(refResults.length, 6);
  const remainingAfterCore = Math.max(
    0,
    limit - topicAsUnified.length - minRefQuota
  );
  const standardSlice = standardResults.slice(0, remainingAfterCore);
  const maxRefs = Math.max(
    0,
    limit - topicAsUnified.length - standardSlice.length
  );

  const results = [
    ...topicAsUnified,
    ...refResults.slice(0, maxRefs),
    ...standardSlice,
  ].slice(0, limit);

  return NextResponse.json({
    query: q,
    count: results.length,
    topics,
    results,
  });
}
