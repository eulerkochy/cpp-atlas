import type { AiSourceRef } from "@/lib/ai-links";
import { absoluteUrl } from "@/lib/site";

export interface PublicNotebookWorkspace {
  id: string;
  scope: "atlas" | "continent";
  title: string;
  subtitle: string;
  envVar: string;
  notebookUrl: string | null;
  trackIds: readonly string[];
  starterSources: AiSourceRef[];
  sourceUrls: string[];
}

function normalizeUrl(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
}

function toTopicSources(slugs: readonly string[]): AiSourceRef[] {
  return slugs.map((slug) => ({ kind: "topic", slug }));
}

function toTopicMarkdownUrls(slugs: readonly string[]): string[] {
  return slugs.map((slug) => absoluteUrl(`/api/notebook/topic/${slug}`));
}

const PUBLIC_NOTEBOOKS: readonly PublicNotebookWorkspace[] = [
  {
    id: "full-atlas",
    scope: "atlas",
    title: "Complete C++ Atlas",
    subtitle: "Cross-continent synthesis across all 13 tracks and 115 topics.",
    envVar: "NEXT_PUBLIC_NOTEBOOKLM_URL_ATLAS",
    notebookUrl: normalizeUrl(
      process.env.NEXT_PUBLIC_NOTEBOOKLM_URL_ATLAS ??
        "https://notebook.google.com/notebook/aa0a5052-cde9-47b0-a12e-8abb2b27bbdf"
    ),
    trackIds: [],
    starterSources: toTopicSources([
      "value-categories",
      "object-lifetime-and-storage",
      "atomics-and-memory-ordering",
      "sfinae-and-concepts",
    ]),
    sourceUrls: [
      absoluteUrl("/api/notebook/topics-all"),
      ...toTopicMarkdownUrls([
        "value-categories",
        "object-lifetime-and-storage",
        "atomics-and-memory-ordering",
        "sfinae-and-concepts",
      ]),
    ],
  },
  {
    id: "language-basics",
    scope: "continent",
    title: "Language basics",
    subtitle: "Linkage, types, value categories, evaluation order & overload lookup.",
    envVar: "NEXT_PUBLIC_NOTEBOOKLM_URL_LANGUAGE_BASICS",
    notebookUrl: normalizeUrl(
      process.env.NEXT_PUBLIC_NOTEBOOKLM_URL_LANGUAGE_BASICS ??
        "https://notebook.google.com/notebook/79ad47a9-62f3-457c-93ff-58f7a7150815"
    ),
    trackIds: [
      "program-structure",
      "types-and-initialization",
      "value-semantics",
      "expressions-and-functions",
    ],
    starterSources: toTopicSources([
      "value-categories",
      "copy-and-move",
      "copy-elision",
      "overload-resolution",
    ]),
    sourceUrls: toTopicMarkdownUrls([
      "value-categories",
      "copy-and-move",
      "copy-elision",
      "overload-resolution",
    ]),
  },
  {
    id: "building-abstractions",
    scope: "continent",
    title: "Building abstractions",
    subtitle: "Classes, RAII, templates, concepts & error-handling guarantees.",
    envVar: "NEXT_PUBLIC_NOTEBOOKLM_URL_BUILDING_ABSTRACTIONS",
    notebookUrl: normalizeUrl(
      process.env.NEXT_PUBLIC_NOTEBOOKLM_URL_BUILDING_ABSTRACTIONS ??
        "https://notebook.google.com/notebook/aaac05cc-fe8d-4a60-97ad-b9c807930fc3"
    ),
    trackIds: ["classes", "templates", "errors"],
    starterSources: toTopicSources([
      "raii-and-resource-management",
      "forwarding-references-and-perfect-forwarding",
      "concepts-and-constraints",
      "exceptions-and-stack-unwinding",
    ]),
    sourceUrls: toTopicMarkdownUrls([
      "raii-and-resource-management",
      "forwarding-references-and-perfect-forwarding",
      "concepts-and-constraints",
      "exceptions-and-stack-unwinding",
    ]),
  },
  {
    id: "the-machine",
    scope: "continent",
    title: "The machine",
    subtitle: "Object lifetime, strict aliasing, memory ordering & coroutines.",
    envVar: "NEXT_PUBLIC_NOTEBOOKLM_URL_THE_MACHINE",
    notebookUrl: normalizeUrl(
      process.env.NEXT_PUBLIC_NOTEBOOKLM_URL_THE_MACHINE ??
        "https://notebook.google.com/notebook/6a346204-2da8-4eef-bd86-2e950e4132d9"
    ),
    trackIds: ["memory-model", "concurrency"],
    starterSources: toTopicSources([
      "object-lifetime-and-storage",
      "strict-aliasing-and-ub",
      "atomics-and-memory-ordering",
      "coroutines",
    ]),
    sourceUrls: toTopicMarkdownUrls([
      "object-lifetime-and-storage",
      "strict-aliasing-and-ub",
      "atomics-and-memory-ordering",
      "coroutines",
    ]),
  },
  {
    id: "library-and-cpp26",
    scope: "continent",
    title: "Library and C++26",
    subtitle: "Containers, ranges, utilities, contracts, reflection & std::execution.",
    envVar: "NEXT_PUBLIC_NOTEBOOKLM_URL_LIBRARY_AND_CPP26",
    notebookUrl: normalizeUrl(
      process.env.NEXT_PUBLIC_NOTEBOOKLM_URL_LIBRARY_AND_CPP26 ??
        "https://notebook.google.com/notebook/687e54b2-8e82-4b27-b863-1ebc4283c4b7"
    ),
    trackIds: ["containers", "algorithms-and-ranges", "utilities", "cpp26"],
    starterSources: toTopicSources([
      "containers-and-iterator-invalidation",
      "ranges-and-views",
      "contracts",
      "reflection",
    ]),
    sourceUrls: toTopicMarkdownUrls([
      "containers-and-iterator-invalidation",
      "ranges-and-views",
      "contracts",
      "reflection",
    ]),
  },
];

export function getPublicNotebooks(): readonly PublicNotebookWorkspace[] {
  return PUBLIC_NOTEBOOKS;
}

export function getWorkspaceForTrack(
  trackId?: string
): PublicNotebookWorkspace {
  if (trackId) {
    const matched = PUBLIC_NOTEBOOKS.find(
      (ws) => ws.scope === "continent" && ws.trackIds.includes(trackId)
    );
    if (matched) return matched;
  }
  return PUBLIC_NOTEBOOKS[0];
}

export function resolveBestPublicNotebookUrl(trackId?: string): string | null {
  const ws = getWorkspaceForTrack(trackId);
  return ws.notebookUrl ?? PUBLIC_NOTEBOOKS[0].notebookUrl ?? null;
}
