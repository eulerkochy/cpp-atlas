import { absoluteUrl } from "@/lib/site";
import type { ReferenceLang } from "@/types/cpp";

export type AiSourceRef =
  | { kind: "topic"; slug: string }
  | { kind: "reference"; lang: ReferenceLang; path: string };

export interface AiPageContext {
  kind: "topic" | "reference";
  title: string;
  subtitle?: string;
  urlPath: string;
  markdownEndpoint: string;
  slug?: string;
  lang?: ReferenceLang;
  refPath?: string;
  trackId?: string;
  trackTitle?: string;
  clauses?: string[];
  standards?: string[];
}

export const GEMINI_WEB_URL = "https://gemini.google.com/app";
export const NOTEBOOKLM_WEB_URL = "https://notebooklm.google.com/";

const SAFE_TOPIC_SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export function encodeAiSourceKey(src: AiSourceRef): string {
  return src.kind === "topic"
    ? `topic:${src.slug}`
    : `ref:${src.lang}:${src.path}`;
}

export function parseAiSourceKey(raw: string): AiSourceRef | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("topic:")) {
    const slug = trimmed.slice("topic:".length).trim();
    if (!SAFE_TOPIC_SLUG_RE.test(slug)) return null;
    return { kind: "topic", slug };
  }

  if (trimmed.startsWith("ref:")) {
    const rest = trimmed.slice("ref:".length);
    const colonIdx = rest.indexOf(":");
    if (colonIdx === -1) return null;
    const lang = rest.slice(0, colonIdx).trim();
    if (lang !== "cpp" && lang !== "c") return null;
    const refPath = rest.slice(colonIdx + 1).trim().replace(/^\/+/, "");
    return { kind: "reference", lang, path: refPath };
  }

  return null;
}

export function contextToSourceRef(ctx: AiPageContext): AiSourceRef {
  if (ctx.kind === "topic") {
    const slug =
      ctx.slug ?? ctx.urlPath.replace(/^\/topics\//, "").replace(/\/+$/, "");
    return { kind: "topic", slug };
  }
  const lang: ReferenceLang =
    ctx.lang ?? (ctx.urlPath.startsWith("/w/c") ? "c" : "cpp");
  const fallbackPath = ctx.urlPath
    .replace(new RegExp(`^/w/${lang}/?`), "")
    .replace(/\/+$/, "");
  return {
    kind: "reference",
    lang,
    path: ctx.refPath !== undefined ? ctx.refPath : fallbackPath,
  };
}

export function buildExternalPrompt(ctx: AiPageContext): string {
  const pageUrl = absoluteUrl(ctx.urlPath);
  const mdUrl = absoluteUrl(ctx.markdownEndpoint);
  const lines: string[] = [
    `I am studying "${ctx.title}" from C++ Atlas.`,
    `Page: ${pageUrl}`,
    `Clean Markdown source: ${mdUrl}`,
  ];

  const metaParts: string[] = [];
  if (ctx.trackTitle) metaParts.push(`Track: ${ctx.trackTitle}`);
  if (ctx.clauses && ctx.clauses.length > 0) {
    metaParts.push(`ISO C++ clauses: ${ctx.clauses.join(", ")}`);
  }
  if (ctx.standards && ctx.standards.length > 0) {
    metaParts.push(`Standards: ${ctx.standards.join(", ")}`);
  }
  if (metaParts.length > 0) {
    lines.push(metaParts.join(" · "));
  }

  lines.push(
    "",
    "Please:",
    "1. Explain the core mental model and exact language/library rules clearly.",
    "2. Highlight subtle edge cases, undefined behavior traps, and standard revision changes (C++11 through C++26).",
    "3. Wait for my follow-up questions."
  );

  return lines.join("\n");
}

export function buildBundlePrompt(
  sources: { name: string; urlPath: string }[]
): string {
  const listed = sources
    .slice(0, 12)
    .map((s) => `- ${s.name}: ${absoluteUrl(s.urlPath)}`)
    .join("\n");

  return [
    "I am studying this bundle of C++ Atlas sources:",
    listed || `- C++ Atlas: ${absoluteUrl("/")}`,
    "",
    "Synthesize how these topics connect, highlight subtle ISO C++ / undefined behavior traps across them, and give me a short active-recall quiz when I'm ready.",
  ].join("\n");
}

export function buildChatGptUrl(prompt: string): string {
  return `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
}

export function buildClaudeUrl(prompt: string): string {
  return `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
}

export function buildStudioHref(
  ctx: AiPageContext,
  tab?: "chat" | "audio" | "guides"
): string {
  const params = new URLSearchParams();
  params.set("source", encodeAiSourceKey(contextToSourceRef(ctx)));
  if (tab) params.set("tab", tab);
  return `/notebook?${params.toString()}`;
}
