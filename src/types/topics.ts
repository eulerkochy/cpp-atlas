import type { CppRefHeading, MemoryMapKind, ReferenceLang } from "@/types/cpp";

export interface TopicSearchResult {
  slug: string;
  title: string;
  summary: string;
  trackTitle: string;
  minutes: number;
  urlPath: string;
}

export interface UnifiedSearchResultItem {
  lang: ReferenceLang;
  name: string;
  path: string;
  urlPath: string;
  type: string;
  hasCompanion: boolean;
  companionShortTitle?: string;
  kind?: "topic" | "reference" | "standard";
  slug?: string;
}

export type SimulatorKind = MemoryMapKind;

export type TopicQuizKind = "warmup" | "tricky" | "standardese";

export interface CppRefLink {
  title: string;
  path: string;
  href: string;
  externalUrl: string;
}

export interface TopicMapNode {
  label: string;
  note: string;
  children?: TopicMapNode[];
}

export interface TopicMap {
  root: TopicMapNode;
}

export interface TopicQuizQuestion {
  id: string;
  kind: TopicQuizKind;
  prompt: string;
  code?: string;
  options: string[];
  answer: number;
  explanation: string;
  refs: string[];
  topicSlug: string;
  topicTitle: string;
  trackId: string;
}

export interface TrackDefinition {
  id: string;
  title: string;
  description: string;
  topics: string[];
}

export interface TopicSummary {
  slug: string;
  title: string;
  summary: string;
  trackId: string;
  trackTitle: string;
  minutes: number;
  standard: string[];
  cppreference: CppRefLink[];
  prerequisites: string[];
  simulator?: SimulatorKind;
  questionCount: number;
  questionIds: string[];
  map: TopicMap | null;
}

export interface TrackWithTopics {
  id: string;
  title: string;
  description: string;
  topics: TopicSummary[];
}

export interface Topic {
  slug: string;
  title: string;
  summary: string;
  trackId: string;
  trackTitle: string;
  minutes: number;
  standard: string[];
  cppreference: CppRefLink[];
  prerequisites: string[];
  simulator?: SimulatorKind;
  body: string;
  headings: CppRefHeading[];
  map: TopicMap | null;
  questions: TopicQuizQuestion[];
}

export interface TopicNeighbours {
  prev: TopicSummary | null;
  next: TopicSummary | null;
}

export const SIMULATOR_BY_TOPIC: Record<string, SimulatorKind> = {
  "value-categories": "value-categories",
  "copy-elision": "value-categories",
  "object-lifetime-and-storage": "object-lifetime",
  "atomics-and-memory-ordering": "memory-model",
  "forwarding-references-and-perfect-forwarding": "move-and-forwarding",
  "copy-and-move": "move-and-forwarding",
  "sfinae-and-concepts": "templates-and-concepts",
  "coroutines": "coroutine-frame",
  "inheritance-and-virtual-functions": "vtable-layout",
  "crtp-and-deducing-this": "vtable-layout",
  "containers-and-iterator-invalidation": "container-invalidation",
  "strings-views-and-spans": "container-invalidation",
  "smart-pointers-and-allocators": "smart-pointers",
  "raii-and-resource-management": "smart-pointers",
  "overload-resolution": "overload-lookup",
  "name-lookup-and-adl": "overload-lookup",
  "cpp26-contracts-reflection-execution": "cpp26-preview",
};

export function getSimulatorForTopic(slug: string): SimulatorKind | undefined {
  return SIMULATOR_BY_TOPIC[slug];
}

/**
 * Strips inline markdown formatting (`code`, **bold**, *italic*, [text](url))
 * to yield plain text for heading labels and slug generation.
 */
export function stripMarkdownInline(raw: string): string {
  return raw
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`+([^`]*)`+/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/\\([\\`*_{}[\]()#+\-.!|>])/g, "$1")
    .trim();
}

export function slugifyHeading(text: string): string {
  const plain = stripMarkdownInline(text)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return plain || "section";
}

export function createHeadingSlugger(): (text: string) => string {
  const counts = new Map<string, number>();
  return (text: string) => {
    const base = slugifyHeading(text);
    const prev = counts.get(base) ?? 0;
    counts.set(base, prev + 1);
    return prev === 0 ? base : `${base}-${prev + 1}`;
  };
}

export function extractHeadingsFromMarkdown(markdown: string): CppRefHeading[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const headings: CppRefHeading[] = [];
  const nextSlug = createHeadingSlugger();

  let activeFenceChar: "`" | "~" | null = null;
  let activeFenceLen = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})(.*)$/);
    if (fenceMatch) {
      const char = fenceMatch[1][0] as "`" | "~";
      const len = fenceMatch[1].length;
      if (!activeFenceChar) {
        activeFenceChar = char;
        activeFenceLen = len;
        continue;
      } else if (
        char === activeFenceChar &&
        len >= activeFenceLen &&
        !fenceMatch[2].trim()
      ) {
        activeFenceChar = null;
        activeFenceLen = 0;
        continue;
      }
    }

    if (activeFenceChar) continue;

    const headingMatch = line.match(/^(#{2,3})\s+(.+?)\s*#*\s*$/);
    if (!headingMatch) continue;

    const level = headingMatch[1].length as 2 | 3;
    const displayText = stripMarkdownInline(headingMatch[2]);
    if (!displayText) continue;

    headings.push({
      id: nextSlug(displayText),
      text: displayText,
      level,
    });
  }

  return headings;
}

/**
 * Converts an ISO C++ standard reference like `[basic.lval]` or `[expr.ref]/4`
 * into an eel.is/c++draft permalink.
 */
export function standardRefToUrl(ref: string): string {
  const bracketMatch = ref.match(/\[([a-zA-Z0-9._-]+)\](?:[#/](\d+(?:\.\d+)*))?/);
  if (bracketMatch) {
    const stable = bracketMatch[1];
    const anchor = bracketMatch[2] ? `#${bracketMatch[2]}` : "";
    return `https://eel.is/c++draft/${stable}${anchor}`;
  }
  const bareMatch = ref.match(/\b([a-z]+(?:\.[a-z0-9_]+)+)\b/);
  if (bareMatch) {
    return `https://eel.is/c++draft/${bareMatch[1]}`;
  }
  return "https://eel.is/c++draft/";
}
