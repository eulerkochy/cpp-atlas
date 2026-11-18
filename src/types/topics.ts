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
  /** /w/cpp/<path> when the offline snapshot has the page, else the cppreference.com URL. */
  href: string;
  externalUrl: string;
  /** Whether href points at the offline copy. */
  local: boolean;
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
  // Value categories & initialization
  "value-categories": "value-categories",
  "copy-elision": "value-categories",
  "reference-binding-and-temporaries": "value-categories",
  // Object lifetime, aliasing & dynamic storage
  "object-lifetime-and-storage": "object-lifetime",
  "dynamic-allocation-new-and-delete": "object-lifetime",
  "strict-aliasing-and-ub": "object-lifetime",
  "strict-aliasing-and-undefined-behavior": "object-lifetime",
  // Memory model, atomics & lock-free concurrency
  "atomics-and-memory-ordering": "memory-model",
  "lock-free-programming-and-aba": "memory-model",
  "hazard-pointers-and-rcu": "memory-model",
  // Move semantics & perfect forwarding
  "forwarding-references-and-perfect-forwarding": "move-and-forwarding",
  "copy-and-move": "move-and-forwarding",
  // Templates, SFINAE & C++20 concepts
  "sfinae-and-concepts": "templates-and-concepts",
  "sfinae": "templates-and-concepts",
  "concepts-and-constraints": "templates-and-concepts",
  // Coroutines & generators
  "coroutines": "coroutine-frame",
  "coroutine-library-and-generators": "coroutine-frame",
  // Polymorphic vtables, object layout & deducing this
  "inheritance-and-virtual-functions": "vtable-layout",
  "multiple-and-virtual-inheritance": "vtable-layout",
  "object-layout-and-alignment": "vtable-layout",
  "crtp-and-deducing-this": "vtable-layout",
  // Containers, SSO, views & invalidation
  "containers-and-iterator-invalidation": "container-invalidation",
  "iterator-invalidation": "container-invalidation",
  "sequence-containers": "container-invalidation",
  "strings-views-and-spans": "container-invalidation",
  "strings-and-string-view": "container-invalidation",
  "span-and-mdspan": "container-invalidation",
  // Smart pointers, RAII & allocators
  "smart-pointers-and-allocators": "smart-pointers",
  "smart-pointers": "smart-pointers",
  "allocators-and-pmr": "smart-pointers",
  "raii-and-resource-management": "smart-pointers",
  // Overload resolution, operators & ADL
  "overload-resolution": "overload-lookup",
  "operator-overloading": "overload-lookup",
  "name-lookup-and-adl": "overload-lookup",
  "dependent-names-and-two-phase-lookup": "overload-lookup",
  // C++26 contracts, static reflection & senders/receivers
  "cpp26-contracts-reflection-execution": "cpp26-preview",
  "contracts": "cpp26-preview",
  "reflection": "cpp26-preview",
  "senders-and-receivers": "cpp26-preview",
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
