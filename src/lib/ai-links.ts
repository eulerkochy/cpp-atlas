import { SITE } from "@/lib/site";
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

export interface ExternalPromptOptions {
  maxMarkdownChars?: number;
  copiedFullToClipboard?: boolean;
}

export const GEMINI_WEB_URL = "https://gemini.google.com/app";
export const NOTEBOOKLM_WEB_URL = "https://notebooklm.google.com/";
export const MAX_EXTERNAL_URL_LENGTH = 5500;

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

/**
 * Strip external HTTP(S) URLs from exported Markdown so consumer AI chat
 * interfaces do not attempt live web fetches on pasted context.
 */
export function stripUrlsFromMarkdown(markdown: string): string {
  return markdown
    .replace(/\s*\|\s*Source:\s*https?:\/\/\S+/gi, "")
    .replace(
      /\[([^\]\n]+)\]\(https?:\/\/(?:[^()\s]+|\([^()\s]*\))+\)/g,
      "$1"
    )
    .replace(/[ \t]*\(https?:\/\/(?:[^()\s]+|\([^()\s]*\))+\)/g, "")
    .replace(/<https?:\/\/[^>\s]+>/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Truncate Markdown on paragraph/line boundaries and close any open code fence.
 */
export function truncateMarkdownCleanly(
  markdown: string,
  maxChars: number
): { text: string; truncated: boolean } {
  if (maxChars <= 0) {
    return { text: "", truncated: markdown.length > 0 };
  }
  if (markdown.length <= maxChars) {
    return { text: markdown, truncated: false };
  }

  let sliced = markdown.slice(0, maxChars);
  const lastPara = sliced.lastIndexOf("\n\n");
  if (lastPara >= Math.floor(maxChars * 0.65)) {
    sliced = sliced.slice(0, lastPara);
  } else {
    const lastLine = sliced.lastIndexOf("\n");
    if (lastLine >= Math.floor(maxChars * 0.5)) {
      sliced = sliced.slice(0, lastLine);
    }
  }

  sliced = sliced.trimEnd();
  const fenceCount = sliced
    .split(/\r?\n/)
    .filter((line) => line.trimStart().startsWith("```")).length;
  if (fenceCount % 2 === 1) {
    sliced += "\n```";
  }

  return { text: sliced, truncated: true };
}

function appendEmbeddedMarkdown(
  lines: string[],
  markdown?: string,
  options?: ExternalPromptOptions
): void {
  const cleaned = markdown ? stripUrlsFromMarkdown(markdown) : "";
  if (!cleaned) return;

  const clipped =
    typeof options?.maxMarkdownChars === "number"
      ? truncateMarkdownCleanly(cleaned, options.maxMarkdownChars)
      : { text: cleaned, truncated: false };

  if (!clipped.text) return;

  lines.push(
    "",
    "Use the study material pasted below as your source context (do not attempt to fetch external URLs):",
    "",
    "---",
    clipped.text,
    "---"
  );

  if (clipped.truncated) {
    lines.push(
      options?.copiedFullToClipboard
        ? "[Excerpt truncated to fit URL length — the complete Markdown has also been copied to the clipboard if you need the rest.]"
        : "[Excerpt truncated to fit URL length.]"
    );
  }
}

function formatSitePath(urlPath: string): string {
  const normalized = urlPath.startsWith("/") ? urlPath : `/${urlPath}`;
  return `${SITE.host}${normalized}`;
}

export function buildExternalPrompt(
  ctx: AiPageContext,
  markdown?: string,
  options?: ExternalPromptOptions
): string {
  const lines: string[] = [
    `I am studying "${ctx.title}" from C++ Atlas.`,
    `Source: C++ Atlas (${formatSitePath(ctx.urlPath)})`,
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

  appendEmbeddedMarkdown(lines, markdown, options);

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
  sources: { name: string; urlPath: string }[],
  markdown?: string,
  options?: ExternalPromptOptions
): string {
  const listed = sources
    .slice(0, 12)
    .map((s) => `- ${s.name} (${formatSitePath(s.urlPath)})`)
    .join("\n");

  const lines: string[] = [
    "I am studying this bundle of C++ Atlas sources:",
    listed || `- C++ Atlas (${SITE.host}/)`,
  ];

  appendEmbeddedMarkdown(lines, markdown, options);

  lines.push(
    "",
    "Synthesize how these topics connect, highlight subtle ISO C++ / undefined behavior traps across them, and give me a short active-recall quiz when I'm ready."
  );

  return lines.join("\n");
}

export function buildChatGptUrl(prompt: string): string {
  return `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
}

export function buildClaudeUrl(prompt: string): string {
  return `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
}

export function buildBoundedExternalUrl(
  target: "chatgpt" | "claude",
  buildPrompt: (opts?: ExternalPromptOptions) => string,
  rawMarkdown?: string
): { url: string; truncated: boolean } {
  const urlFn = target === "chatgpt" ? buildChatGptUrl : buildClaudeUrl;
  const fullUrl = urlFn(buildPrompt());
  if (fullUrl.length <= MAX_EXTERNAL_URL_LENGTH) {
    return { url: fullUrl, truncated: false };
  }

  const minChars = 600;
  const cleanedLen = rawMarkdown ? stripUrlsFromMarkdown(rawMarkdown).length : 4500;
  let low = minChars;
  let high = Math.max(minChars, Math.min(cleanedLen, 4500));

  const minCandidate = urlFn(
    buildPrompt({ maxMarkdownChars: low, copiedFullToClipboard: true })
  );
  if (minCandidate.length > MAX_EXTERNAL_URL_LENGTH) {
    return {
      url: urlFn(buildPrompt({ maxMarkdownChars: 0, copiedFullToClipboard: true })),
      truncated: true,
    };
  }

  let bestUrl = minCandidate;
  for (let i = 0; i < 8 && low <= high; i++) {
    const mid = Math.floor((low + high) / 2);
    const candidate = urlFn(
      buildPrompt({ maxMarkdownChars: mid, copiedFullToClipboard: true })
    );
    if (candidate.length <= MAX_EXTERNAL_URL_LENGTH) {
      bestUrl = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return { url: bestUrl, truncated: true };
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
