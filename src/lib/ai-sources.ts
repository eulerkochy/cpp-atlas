import { encodeAiSourceKey, type AiSourceRef } from "@/lib/ai-links";
import { referenceToMarkdown, resolveReferencePage } from "@/lib/cppref-engine";
import { referenceHref } from "@/lib/reference";
import { SITE } from "@/lib/site";
import { getTopic, topicToMarkdown } from "@/lib/topics";

export interface ResolvedAiDocument {
  key: string;
  kind: "topic" | "reference";
  title: string;
  urlPath: string;
  markdown: string;
}

export interface ResolveAiSourcesResult {
  documents: ResolvedAiDocument[];
  contextText: string;
}

function truncateMarkdown(md: string, maxChars: number): string {
  if (md.length <= maxChars) return md;
  const slice = md.slice(0, Math.max(400, maxChars - 120));
  const lastBreak = slice.lastIndexOf("\n\n");
  const cleanCut =
    lastBreak > maxChars * 0.5 ? slice.slice(0, lastBreak) : slice;
  return `${cleanCut.trimEnd()}\n\n[... truncated for context budget; read the full page on C++ Atlas for remaining tables/examples ...]`;
}

function resolveOneReference(
  lang: "cpp" | "c",
  rawPath: string,
  includeQuizAnswers: boolean
): ResolvedAiDocument | null {
  const segments = rawPath.split("/").filter(Boolean);
  let resolved = resolveReferencePage(lang, segments);

  if (resolved.kind === "redirect") {
    const targetSubpath = resolved.to
      .slice(`/w/${lang}`.length)
      .replace(/^\/+/, "");
    resolved = resolveReferencePage(lang, targetSubpath);
  }

  if (resolved.kind !== "page") return null;

  const page = resolved.page;
  const markdown = referenceToMarkdown(page, {
    includeQuizAnswers,
  }).trim();
  const urlPath = referenceHref(lang, page.pagePath);

  return {
    key: encodeAiSourceKey({ kind: "reference", lang, path: page.pagePath }),
    kind: "reference",
    title: page.title,
    urlPath,
    markdown,
  };
}

export function resolveAiSources(
  sources: AiSourceRef[],
  options?: {
    includeQuizAnswers?: boolean;
    maxSources?: number;
    maxTotalChars?: number;
  }
): ResolveAiSourcesResult {
  const includeQuizAnswers = options?.includeQuizAnswers ?? true;
  const maxSources = options?.maxSources ?? 10;
  const maxTotalChars = options?.maxTotalChars ?? 160_000;

  const seen = new Set<string>();
  const rawDocs: ResolvedAiDocument[] = [];

  for (const src of sources) {
    if (rawDocs.length >= maxSources) break;
    const key = encodeAiSourceKey(src);
    if (seen.has(key)) continue;

    if (src.kind === "topic") {
      const topic = getTopic(src.slug);
      if (!topic) continue;
      const docKey = encodeAiSourceKey({ kind: "topic", slug: topic.slug });
      if (seen.has(docKey)) continue;
      seen.add(docKey);
      rawDocs.push({
        key: docKey,
        kind: "topic",
        title: topic.title,
        urlPath: `/topics/${topic.slug}`,
        markdown: topicToMarkdown(topic, { includeQuizAnswers }).trim(),
      });
    } else {
      const doc = resolveOneReference(src.lang, src.path, includeQuizAnswers);
      if (!doc || seen.has(doc.key)) continue;
      seen.add(doc.key);
      rawDocs.push(doc);
    }
  }

  if (rawDocs.length === 0) {
    return { documents: [], contextText: "" };
  }

  const perDocBudget = Math.max(
    6_000,
    Math.floor(maxTotalChars / rawDocs.length)
  );
  let remaining = maxTotalChars;
  const fittedDocs: ResolvedAiDocument[] = [];

  for (let i = 0; i < rawDocs.length; i++) {
    const doc = rawDocs[i];
    const docsLeft = rawDocs.length - i;
    const fairShare = Math.max(
      4_000,
      Math.floor(remaining / docsLeft),
      Math.min(perDocBudget, remaining)
    );
    const md =
      doc.markdown.length <= remaining
        ? doc.markdown.length <= fairShare || docsLeft === 1
          ? doc.markdown
          : truncateMarkdown(doc.markdown, fairShare)
        : truncateMarkdown(doc.markdown, remaining);

    remaining = Math.max(0, remaining - md.length);
    fittedDocs.push({ ...doc, markdown: md });
  }

  const contextText = fittedDocs
    .map(
      (doc, idx) =>
        `[${idx + 1}] ${doc.title} (${SITE.host}${doc.urlPath})\n\n${doc.markdown}`
    )
    .join("\n\n---\n\n");

  return { documents: fittedDocs, contextText };
}
