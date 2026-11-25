import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  createGeminiClient,
  GEMINI_STUDIO_MODEL,
} from "@/lib/gemini";
import {
  getReferenceEntry,
  listedReferenceEntries,
  referenceHref,
  type ReferenceIndexEntry,
} from "@/lib/reference";
import {
  SCROLL_CARD_KINDS,
  type CodeStageBeat,
  type CodeStageData,
  type ConceptStageBeat,
  type ConceptStageData,
  type ConceptStageEdge,
  type ConceptStageNode,
  type EvolutionBeatPhase,
  type EvolutionStageBeat,
  type EvolutionStageData,
  type ScrollCaptionCue,
  type ScrollCard,
  type ScrollCardDifficulty,
  type ScrollCardKind,
  type ScrollGenerateRequest,
  type ScrollGenerateResponse,
  type ScrollGenerateTrigger,
  type TrapStageData,
} from "@/lib/scroll-types";
import {
  getAllTopics,
  getDependents,
  getTopic,
  getTracks,
  topicsForCppPath,
  topicToMarkdown,
  type Topic,
} from "@/lib/topics";
import { TRACK_GROUPS } from "@/lib/track-groups";

// ---------------------------------------------------------------------------
// Constants & domain metadata (aligned with scroll-corpus.ts)
// ---------------------------------------------------------------------------

const MAX_CHARS_PER_SOURCE = 6_000;
const MIN_REFERENCE_MD_CHARS = 320;
const CACHE_MAX_ENTRIES = 250;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

const REF_MD_ROOT = path.resolve(
  /* turbopackIgnore: true */ process.cwd(),
  "data",
  "reference",
  "md"
);

const CONTINENT_ACCENTS: Record<string, Record<ScrollCardKind, string>> = {
  "language-basics": {
    concept: "#3b82f6",
    code: "#0ea5e9",
    evolution: "#6366f1",
    trap: "#f43f5e",
  },
  "building-abstractions": {
    concept: "#8b5cf6",
    code: "#a855f7",
    evolution: "#7c3aed",
    trap: "#ec4899",
  },
  "the-machine": {
    concept: "#f97316",
    code: "#ef4444",
    evolution: "#f59e0b",
    trap: "#ff4d5a",
  },
  "library-and-cpp26": {
    concept: "#10b981",
    code: "#14b8a6",
    evolution: "#06b6d4",
    trap: "#f43f5e",
  },
};

const DEFAULT_ACCENTS: Record<ScrollCardKind, string> = {
  concept: "#3b82f6",
  code: "#0ea5e9",
  evolution: "#6366f1",
  trap: "#ff4d5a",
};

const DEFAULT_EXPLORE_TRACKS = [
  "value-semantics",
  "memory-model",
  "templates",
  "containers",
  "algorithms-and-ranges",
  "concurrency",
  "cpp26",
] as const;

const DEFAULT_ESCALATE_TRACKS = [
  "memory-model",
  "templates",
  "value-semantics",
  "concurrency",
  "cpp26",
] as const;

/** Low-signal reference top-level directories excluded from auto-selection. */
const SKIP_REF_SECTIONS = new Set([
  "experimental",
  "symbol_index",
  "compiler_support",
  "header",
  "keyword",
  "keywords",
  "links",
  "index",
  "comment",
  "current_status",
  "feature_test",
  "freestanding",
  "standard_library",
  "11",
  "14",
  "17",
  "20",
  "23",
  "26",
]);

/** Maps each C++ Atlas study track to preferred cppreference path prefixes. */
const TRACK_REFERENCE_PREFIXES: Record<string, readonly string[]> = {
  "program-structure": [
    "language/lookup",
    "language/adl",
    "language/storage_duration",
    "language/modules",
    "language/namespace",
    "language/definition",
    "language/attributes",
    "language/translation_phases",
    "preprocessor/",
  ],
  "types-and-initialization": [
    "language/initialization",
    "language/value_initialization",
    "language/list_initialization",
    "language/aggregate_initialization",
    "language/implicit_conversion",
    "language/explicit_cast",
    "language/cv",
    "language/auto",
    "language/decltype",
    "language/enum",
    "language/union",
    "types/",
  ],
  "value-semantics": [
    "language/value_category",
    "language/copy_elision",
    "language/move_constructor",
    "language/move_assignment",
    "language/copy_constructor",
    "language/reference_initialization",
    "language/reference",
    "utility/move",
    "utility/forward",
    "utility/exchange",
  ],
  "expressions-and-functions": [
    "language/eval_order",
    "language/constexpr",
    "language/consteval",
    "language/lambda",
    "language/overload_resolution",
    "language/operators",
    "language/operator_comparison",
    "language/structured_binding",
    "language/default_arguments",
    "language/functions",
  ],
  classes: [
    "language/class",
    "language/constructor",
    "language/destructor",
    "language/virtual",
    "language/override",
    "language/derived_class",
    "language/access",
    "language/cast_operator",
    "language/explicit",
    "language/this",
    "language/pointer",
  ],
  templates: [
    "language/templates",
    "language/template_argument_deduction",
    "language/sfinae",
    "language/constraints",
    "language/fold",
    "language/parameter_pack",
    "language/class_template_argument_deduction",
    "language/dependent_name",
    "language/partial_specialization",
    "concepts/",
    "types/",
  ],
  errors: [
    "language/exceptions",
    "language/noexcept",
    "language/try",
    "language/throw",
    "error/",
    "utility/expected",
    "utility/optional",
  ],
  "memory-model": [
    "language/lifetime",
    "language/object",
    "language/alignas",
    "language/memory_model",
    "language/new",
    "atomic/",
    "memory/",
  ],
  concurrency: [
    "thread/",
    "atomic/",
    "coroutine/",
    "language/coroutines",
    "algorithm/execution_policy_tag",
  ],
  containers: [
    "container/vector",
    "container/unordered_map",
    "container/map",
    "container/deque",
    "container/span",
    "container/mdspan",
    "container/flat_map",
    "container/array",
    "container/",
    "string/basic_string_view",
    "string/",
  ],
  "algorithms-and-ranges": [
    "ranges/",
    "algorithm/",
    "iterator/",
  ],
  utilities: [
    "utility/optional",
    "utility/variant",
    "utility/expected",
    "utility/functional",
    "utility/tuple",
    "utility/format",
    "chrono/",
    "filesystem/",
    "numeric/bit",
    "numeric/",
    "io/print",
    "io/",
  ],
  cpp26: [
    "execution/",
    "container/inplace_vector",
    "container/flat_map",
    "utility/functional/function_ref",
    "utility/functional/move_only_function",
    "memory/out_ptr",
    "language/pack_indexing",
    "language/contracts",
    "language/static_assert",
    "numeric/simd",
    "ranges/",
  ],
};

const VALID_KINDS = new Set<string>(SCROLL_CARD_KINDS);
const VALID_EVOLUTION_PHASES: readonly EvolutionBeatPhase[] = [
  "problem",
  "shift",
  "modern",
  "payoff",
] as const;

// ---------------------------------------------------------------------------
// Grounded source representation
// ---------------------------------------------------------------------------

export interface GroundedScrollSource {
  kind: "topic" | "reference";
  /** Normalized source key, e.g. "topic/value-categories" or "cpp/utility/move". */
  sourcePath: string;
  title: string;
  /** Guaranteed valid local route ("/topics/<slug>" or "/w/cpp/<path>"). */
  readHref: string;
  readLabel: string;
  trackId: string;
  trackTitle: string;
  continentId: string;
  continentLabel: string;
  topicSlug?: string;
  prerequisites: string[];
  clauses: string[];
  tags: string[];
  /** Truncated local markdown content (~6,000 chars max). */
  markdown: string;
}

// ---------------------------------------------------------------------------
// Shared Server-Side LRU Cache (capped at 250 entries, 6-hour TTL)
// ---------------------------------------------------------------------------

interface CachedGenerationEntry {
  createdAt: number;
  cards: ScrollCard[];
  sourceTitles: string[];
  model: string;
}

class ScrollGeneratorLruCache {
  private readonly store = new Map<string, CachedGenerationEntry>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;

  constructor(maxEntries: number, ttlMs: number) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
  }

  get(key: string): CachedGenerationEntry | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.store.delete(key);
      return null;
    }
    // Refresh recency (MRU at tail)
    this.store.delete(key);
    this.store.set(key, entry);
    return entry;
  }

  set(key: string, entry: CachedGenerationEntry): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }
    this.store.set(key, entry);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

declare global {
  var __cppAtlasScrollGenCache: ScrollGeneratorLruCache | undefined;
}

function getGeneratorCache(): ScrollGeneratorLruCache {
  if (!globalThis.__cppAtlasScrollGenCache) {
    globalThis.__cppAtlasScrollGenCache = new ScrollGeneratorLruCache(
      CACHE_MAX_ENTRIES,
      CACHE_TTL_MS
    );
  }
  return globalThis.__cppAtlasScrollGenCache;
}

export function clearScrollGeneratorCache(): void {
  getGeneratorCache().clear();
}

// ---------------------------------------------------------------------------
// Text, domain, and path-safe file helpers
// ---------------------------------------------------------------------------

function stripMarkdownCppSafe(raw: string): string {
  const codeSpans: string[] = [];
  const protectedCode = raw.replace(
    /(`+)([^`]*?)\1/g,
    (_m, _ticks: string, inner: string) => {
      const idx = codeSpans.push(inner) - 1;
      return `\u0000CODE${idx}\u0000`;
    }
  );

  const stripped = protectedCode
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/~~([^~\n]+?)~~/g, "$1")
    .replace(/\*\*(?!\s)([^*\n]+?)(?<!\s)\*\*/g, "$1")
    .replace(/(?<![\w])__(?!\s)([^_\n]+?)(?<!\s)__(?![\w])/g, "$1")
    .replace(/(?<![\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])/g, "$1")
    .replace(/(?<![\w])_(?!\s)([^_\n]+?)(?<!\s)_(?![\w])/g, "$1")
    .replace(/\\([\\`*_{}[\]()#+\-.!|>])/g, "$1");

  return stripped.replace(/\u0000CODE(\d+)\u0000/g, (_m, idxStr: string) => {
    return codeSpans[Number(idxStr)] ?? "";
  });
}

function cleanPlainText(raw: string): string {
  const withoutFences = raw.replace(/```[\s\S]*?```/g, " ");
  const withoutBlockquote = withoutFences.replace(/^\s*>\s?/gm, "");
  return stripMarkdownCppSafe(withoutBlockquote)
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

function clampText(raw: string, maxLen: number): string {
  const text = cleanPlainText(raw);
  if (text.length <= maxLen) return text;
  const slice = text.slice(0, Math.max(1, maxLen - 1));
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > maxLen * 0.55 ? slice.slice(0, lastSpace) : slice;
  return `${cut.replace(/[,;:\-–—\s]+$/, "")}…`;
}

function stripCodeFences(raw: string): string {
  let code = raw.replace(/\r\n?/g, "\n").trim();
  const fenced = code.match(/^```[a-zA-Z0-9_+-]*\n([\s\S]*?)\n?```$/);
  if (fenced) {
    code = fenced[1];
  } else {
    code = code
      .replace(/^```[a-zA-Z0-9_+-]*\s*\n?/, "")
      .replace(/\n?```\s*$/, "");
  }
  return code.replace(/^\n+|\n+$/g, "");
}

function truncateSourceMarkdown(md: string, maxChars = MAX_CHARS_PER_SOURCE): string {
  const normalized = md.replace(/\r\n?/g, "\n").trim();
  if (normalized.length <= maxChars) return normalized;
  const slice = normalized.slice(0, Math.max(600, maxChars - 96));
  const lastPara = slice.lastIndexOf("\n\n");
  const lastLine = slice.lastIndexOf("\n");
  const cut =
    lastPara > maxChars * 0.55
      ? slice.slice(0, lastPara)
      : lastLine > maxChars * 0.55
        ? slice.slice(0, lastLine)
        : slice;
  return `${cut.trimEnd()}\n\n[... truncated to source budget ...]`;
}

function shortHash(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 12);
}

function lookupContinent(trackId: string): { id: string; label: string } {
  for (const group of TRACK_GROUPS) {
    if (group.trackIds.includes(trackId)) {
      return { id: group.id, label: group.label };
    }
  }
  const fallback = TRACK_GROUPS[TRACK_GROUPS.length - 1];
  return { id: fallback.id, label: fallback.label };
}

function getAccentHex(continentId: string, kind: ScrollCardKind): string {
  return CONTINENT_ACCENTS[continentId]?.[kind] ?? DEFAULT_ACCENTS[kind];
}

let cachedTrackTitles: Map<string, string> | null = null;

function getTrackTitleMap(): Map<string, string> {
  if (!cachedTrackTitles) {
    cachedTrackTitles = new Map(
      getTracks().map((track) => [track.id, track.title])
    );
  }
  return cachedTrackTitles;
}

function resolveTrackTitle(trackId: string): string {
  return (
    getTrackTitleMap().get(trackId) ??
    trackId
      .split("-")
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
      .join(" ")
  );
}

function inferTrackForReferencePath(refPath: string, fallbackTrackId?: string): string {
  const norm = refPath.replace(/^\/+/, "");
  for (const [trackId, prefixes] of Object.entries(TRACK_REFERENCE_PREFIXES)) {
    for (const prefix of prefixes) {
      if (norm === prefix || norm.startsWith(prefix)) {
        return trackId;
      }
    }
  }
  if (fallbackTrackId && getTrackTitleMap().has(fallbackTrackId)) {
    return fallbackTrackId;
  }
  const first = norm.split("/")[0];
  switch (first) {
    case "container":
    case "string":
      return "containers";
    case "algorithm":
    case "ranges":
    case "iterator":
      return "algorithms-and-ranges";
    case "thread":
    case "coroutine":
      return "concurrency";
    case "atomic":
    case "memory":
      return "memory-model";
    case "concepts":
      return "templates";
    case "error":
      return "errors";
    case "execution":
      return "cpp26";
    case "language":
      return "value-semantics";
    default:
      return "utilities";
  }
}

function normalizeSeenSourceSet(seenSourcePaths?: string[]): Set<string> {
  const out = new Set<string>();
  if (!seenSourcePaths) return out;
  for (const raw of seenSourcePaths) {
    if (typeof raw !== "string") continue;
    const cleaned = raw.trim().replace(/^\/+/, "");
    if (!cleaned) continue;
    out.add(cleaned);
    if (cleaned.startsWith("w/cpp/")) {
      const sub = cleaned.slice("w/cpp/".length);
      out.add(`cpp/${sub}`);
      out.add(sub);
    } else if (cleaned.startsWith("cpp/")) {
      out.add(cleaned.slice("cpp/".length));
    } else if (cleaned.startsWith("topics/")) {
      const slug = cleaned.slice("topics/".length);
      out.add(`topic/${slug}`);
      out.add(slug);
    } else if (cleaned.startsWith("topic/")) {
      out.add(cleaned.slice("topic/".length));
    } else {
      out.add(`topic/${cleaned}`);
      out.add(`cpp/${cleaned}`);
    }
  }
  return out;
}

function isSourceSeen(sourcePath: string, seen: Set<string>): boolean {
  if (seen.has(sourcePath)) return true;
  if (sourcePath.startsWith("topic/")) {
    return seen.has(sourcePath.slice("topic/".length));
  }
  if (sourcePath.startsWith("cpp/")) {
    return seen.has(sourcePath.slice("cpp/".length));
  }
  return false;
}

function referenceFileKey(entry: ReferenceIndexEntry): string {
  if (entry.file) return entry.file;
  if (entry.path === "") return "_root";
  return entry.path.replace(/\*/g, "_star_").replace(/"/g, "_q_");
}

/**
 * Safely reads a cppreference markdown file from `data/reference/md/<file>.md`
 * with strict path traversal protection and ~6,000 char truncation.
 */
export function readReferenceMarkdownSafe(
  entry: ReferenceIndexEntry,
  maxChars = MAX_CHARS_PER_SOURCE
): string | null {
  const key = referenceFileKey(entry);
  if (!key || key.includes("\0") || key.includes("..") || path.isAbsolute(key)) {
    return null;
  }

  const candidate = path.resolve(
    /* turbopackIgnore: true */ REF_MD_ROOT,
    `${key}.md`
  );

  // Strict path traversal guard: resolved path must stay inside data/reference/md/
  if (
    !candidate.startsWith(`${REF_MD_ROOT}${path.sep}`) ||
    !candidate.endsWith(".md")
  ) {
    return null;
  }

  let raw: string;
  try {
    raw = fs.readFileSync(candidate, "utf8");
  } catch {
    return null;
  }

  if (raw.trim().length < MIN_REFERENCE_MD_CHARS) {
    return null;
  }
  return truncateSourceMarkdown(raw, maxChars);
}

function extractIsoClausesFromText(text: string): string[] {
  const matches = text.match(/\[[a-z][a-z0-9._-]{2,40}\](?:\/\d+(?:\.\d+)?)?/g);
  if (!matches) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    if (!m.includes(".")) continue;
    const key = m.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
    if (out.length >= 6) break;
  }
  return out;
}

function buildTopicSource(topic: Topic): GroundedScrollSource {
  const continent = lookupContinent(topic.trackId);
  const fullMd = topicToMarkdown(topic, { includeQuizAnswers: true });
  return {
    kind: "topic",
    sourcePath: `topic/${topic.slug}`,
    title: topic.title,
    readHref: `/topics/${topic.slug}`,
    readLabel: "Read guide",
    trackId: topic.trackId,
    trackTitle: topic.trackTitle,
    continentId: continent.id,
    continentLabel: continent.label,
    topicSlug: topic.slug,
    prerequisites: topic.prerequisites.slice(0, 4),
    clauses: topic.standard.slice(0, 6),
    tags: [topic.trackTitle, ...topic.standard.slice(0, 2)],
    markdown: truncateSourceMarkdown(fullMd, MAX_CHARS_PER_SOURCE),
  };
}

function buildReferenceSource(
  entry: ReferenceIndexEntry,
  preferredTrackId?: string,
  linkedTopicSlug?: string
): GroundedScrollSource | null {
  if (entry.kind === "redirect" || !entry.path) return null;
  const markdown = readReferenceMarkdownSafe(entry, MAX_CHARS_PER_SOURCE);
  if (!markdown) return null;

  const trackId = inferTrackForReferencePath(entry.path, preferredTrackId);
  const continent = lookupContinent(trackId);
  const trackTitle = resolveTrackTitle(trackId);
  const clauses = extractIsoClausesFromText(markdown);

  return {
    kind: "reference",
    sourcePath: `cpp/${entry.path}`,
    title: entry.title,
    readHref: referenceHref("cpp", entry.path),
    readLabel: "Read reference",
    trackId,
    trackTitle,
    continentId: continent.id,
    continentLabel: continent.label,
    topicSlug: linkedTopicSlug,
    prerequisites: [],
    clauses,
    tags: [trackTitle, "cppreference", entry.section].filter(Boolean),
    markdown,
  };
}

// ---------------------------------------------------------------------------
// Reference index helpers & keyword scoring
// ---------------------------------------------------------------------------

let eligibleRefEntriesCache: ReferenceIndexEntry[] | null = null;

function getEligibleReferenceEntries(): ReferenceIndexEntry[] {
  if (!eligibleRefEntriesCache) {
    eligibleRefEntriesCache = listedReferenceEntries("cpp").filter((entry) => {
      if (!entry.path || entry.kind !== "page") return false;
      // Skip top-level directory overview pages in favor of concrete API/language pages
      if (!entry.path.includes("/")) return false;
      const top = entry.path.split("/")[0];
      if (SKIP_REF_SECTIONS.has(top)) return false;
      if (entry.summary.length < 24) return false;
      return true;
    });
  }
  return eligibleRefEntriesCache;
}

function tokenizeKeywords(text: string): string[] {
  const stop = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "that",
    "this",
    "what",
    "when",
    "which",
    "does",
    "into",
    "code",
    "type",
    "value",
    "cpp",
    "std",
  ]);
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !stop.has(t));
  return Array.from(new Set(tokens)).slice(0, 14);
}

function pickBestTopicForSignal(options: {
  topics: Topic[];
  preferredTrackIds: string[];
  keywords: string[];
  clause?: string;
  seen: Set<string>;
  preferAdvanced?: boolean;
  excludeSlug?: string;
}): Topic | null {
  const {
    topics,
    preferredTrackIds,
    keywords,
    clause,
    seen,
    preferAdvanced,
    excludeSlug,
  } = options;
  const trackOrder = new Map(preferredTrackIds.map((id, i) => [id, i]));
  const clauseNorm = clause?.toLowerCase().replace(/^\[|\]$/g, "").trim() ?? "";

  let bestUnseen: { topic: Topic; score: number } | null = null;
  let bestAny: { topic: Topic; score: number } | null = null;

  for (const topic of topics) {
    if (excludeSlug && topic.slug === excludeSlug) continue;

    let score = 10;
    const trackRank = trackOrder.get(topic.trackId);
    if (trackRank !== undefined) {
      score += Math.max(12, 42 - trackRank * 6);
    }

    if (clauseNorm) {
      const hasClause = topic.standard.some((s) =>
        s.toLowerCase().includes(clauseNorm)
      );
      if (hasClause) score += 60;
    }

    if (keywords.length > 0) {
      const hay =
        `${topic.slug} ${topic.title} ${topic.summary} ${topic.standard.join(" ")}`.toLowerCase();
      for (const kw of keywords) {
        if (hay.includes(kw)) score += 9;
      }
    }

    if (preferAdvanced) {
      score += Math.min(20, topic.minutes);
      score += Math.min(18, topic.prerequisites.length * 6);
      if (
        topic.trackId === "memory-model" ||
        topic.trackId === "templates" ||
        topic.trackId === "concurrency" ||
        topic.trackId === "cpp26"
      ) {
        score += 12;
      }
    }

    if (!bestAny || score > bestAny.score) {
      bestAny = { topic, score };
    }
    if (!isSourceSeen(`topic/${topic.slug}`, seen)) {
      if (!bestUnseen || score > bestUnseen.score) {
        bestUnseen = { topic, score };
      }
    }
  }

  return bestUnseen?.topic ?? bestAny?.topic ?? null;
}

function pickBestReferenceForSignal(options: {
  preferredTrackIds: string[];
  linkedTopic?: Topic | null;
  keywords: string[];
  seen: Set<string>;
  excludePath?: string;
  preferSiblingOf?: string;
}): GroundedScrollSource | null {
  const {
    preferredTrackIds,
    linkedTopic,
    keywords,
    seen,
    excludePath,
    preferSiblingOf,
  } = options;

  const normalizedExclude = excludePath
    ? excludePath.replace(/^\/+/, "").replace(/^cpp\//, "")
    : "";

  // 1. Prefer local cppreference links declared directly on the grounded topic
  if (linkedTopic && linkedTopic.cppreference.length > 0) {
    for (const ref of linkedTopic.cppreference) {
      if (!ref.local || !ref.path) continue;
      const cleanPath = ref.path.replace(/^\/+/, "");
      if (!cleanPath.includes("/")) continue;
      if (cleanPath === normalizedExclude) continue;
      if (isSourceSeen(`cpp/${cleanPath}`, seen)) continue;
      const entry = getReferenceEntry("cpp", cleanPath);
      if (!entry || entry.kind === "redirect") continue;
      const built = buildReferenceSource(
        entry,
        linkedTopic.trackId,
        linkedTopic.slug
      );
      if (built) return built;
    }
  }

  const allEntries = getEligibleReferenceEntries();

  // 2. If user liked a specific reference page, look for unseen sibling pages first
  if (preferSiblingOf) {
    const cleanRef = preferSiblingOf.replace(/^\/+/, "").replace(/^cpp\//, "");
    const baseEntry = getReferenceEntry("cpp", cleanRef);
    if (baseEntry && baseEntry.parent !== null) {
      for (const candidate of allEntries) {
        if (candidate.parent !== baseEntry.parent) continue;
        if (candidate.path === cleanRef || candidate.path === normalizedExclude) {
          continue;
        }
        if (isSourceSeen(`cpp/${candidate.path}`, seen)) continue;
        const built = buildReferenceSource(
          candidate,
          preferredTrackIds[0],
          linkedTopic?.slug
        );
        if (built) return built;
      }
    }
  }

  // 3. Score eligible cppreference pages against preferred track prefixes & keywords
  const prefixes: string[] = [];
  for (const trackId of preferredTrackIds) {
    const trackPrefixes = TRACK_REFERENCE_PREFIXES[trackId];
    if (trackPrefixes) prefixes.push(...trackPrefixes);
  }

  const scored: { entry: ReferenceIndexEntry; score: number }[] = [];
  for (const entry of allEntries) {
    if (entry.path === normalizedExclude) continue;
    const isSeen = isSourceSeen(`cpp/${entry.path}`, seen);

    let score = 0;
    for (let i = 0; i < prefixes.length; i++) {
      const p = prefixes[i];
      if (entry.path === p || entry.path.startsWith(p)) {
        score += Math.max(15, 48 - Math.min(30, i * 2));
        break;
      }
    }

    if (keywords.length > 0) {
      const hay = `${entry.path} ${entry.title} ${entry.summary}`.toLowerCase();
      for (const kw of keywords) {
        if (hay.includes(kw)) score += 12;
      }
    }

    if (score === 0) continue;
    if (!isSeen) score += 35;
    // Slight preference for rich, concise-depth pages (e.g. language/X or utility/X)
    const depth = entry.path.split("/").length;
    if (depth === 2 || depth === 3) score += 6;
    if (entry.summary.length >= 60) score += 4;

    scored.push({ entry, score });
  }

  scored.sort((a, b) => b.score - a.score || a.entry.path.localeCompare(b.entry.path));

  for (const { entry } of scored.slice(0, 24)) {
    const built = buildReferenceSource(
      entry,
      preferredTrackIds[0],
      linkedTopic?.slug
    );
    if (built) return built;
  }

  // 4. Fallback: allow even a previously seen linked reference page from the topic
  if (linkedTopic) {
    for (const ref of linkedTopic.cppreference) {
      if (!ref.local || !ref.path) continue;
      const entry = getReferenceEntry("cpp", ref.path);
      if (!entry || entry.kind === "redirect") continue;
      const built = buildReferenceSource(
        entry,
        linkedTopic.trackId,
        linkedTopic.slug
      );
      if (built) return built;
    }
  }

  return null;
}

/**
 * Selects 1–2 real local grounded documents (from `content/topics/` and/or
 * `data/reference/md/`) for the given adaptive request.
 */
export function selectGroundedSources(
  request: ScrollGenerateRequest
): GroundedScrollSource[] {
  const allTopics = getAllTopics();
  const seen = normalizeSeenSourceSet(request.seenSourcePaths);
  const validTrackMap = getTrackTitleMap();
  const cleanTopTracks = (request.topTracks ?? []).filter((t) =>
    validTrackMap.has(t)
  );

  const sources: GroundedScrollSource[] = [];
  const addedPaths = new Set<string>();
  const pushUnique = (src: GroundedScrollSource | null) => {
    if (!src || addedPaths.has(src.sourcePath)) return;
    addedPaths.add(src.sourcePath);
    sources.push(src);
  };

  if (request.trigger === "remediate") {
    const missed = request.missedTrap;
    const keywords = tokenizeKeywords(
      `${missed?.question ?? ""} ${missed?.explanation ?? ""} ${missed?.clause ?? ""}`
    );
    const preferredTracks = [
      ...(missed?.trackId && validTrackMap.has(missed.trackId)
        ? [missed.trackId]
        : []),
      ...cleanTopTracks,
      ...DEFAULT_EXPLORE_TRACKS,
    ];

    let topic: Topic | null = missed?.topicSlug
      ? getTopic(missed.topicSlug)
      : null;

    if (!topic) {
      topic = pickBestTopicForSignal({
        topics: allTopics,
        preferredTrackIds: preferredTracks,
        keywords,
        clause: missed?.clause,
        seen: new Set(), // Always ground remediation on the exact matching topic
      });
    }

    if (topic) {
      pushUnique(buildTopicSource(topic));
    }

    const refSource = pickBestReferenceForSignal({
      preferredTrackIds: preferredTracks,
      linkedTopic: topic,
      keywords,
      seen: new Set(), // Prefer exact linked cppreference for remediation
    });
    pushUnique(refSource);

    return sources.slice(0, 2);
  }

  if (request.trigger === "deep-dive") {
    const liked = request.likedCard;
    const keywords = tokenizeKeywords(
      `${liked?.title ?? ""} ${(liked?.tags ?? []).join(" ")}`
    );
    const preferredTracks = [
      ...(liked?.trackId && validTrackMap.has(liked.trackId)
        ? [liked.trackId]
        : []),
      ...cleanTopTracks,
      ...DEFAULT_EXPLORE_TRACKS,
    ];

    const likedTopic = liked?.topicSlug ? getTopic(liked.topicSlug) : null;
    const likedRefPath =
      liked?.sourcePath &&
      (liked.sourcePath.startsWith("cpp/") ||
        liked.sourcePath.startsWith("/w/cpp/"))
        ? liked.sourcePath.replace(/^\/w\//, "")
        : undefined;

    // Prioritize an unseen related cppreference page first
    const refSource = pickBestReferenceForSignal({
      preferredTrackIds: preferredTracks,
      linkedTopic: likedTopic,
      keywords,
      seen,
      excludePath: likedRefPath,
      preferSiblingOf: likedRefPath,
    });
    pushUnique(refSource);

    // Pair with a deeper dependent/related topic
    let deepTopic: Topic | null = null;
    if (likedTopic) {
      const dependents = getDependents(likedTopic.slug);
      for (const dep of dependents) {
        if (!isSourceSeen(`topic/${dep.slug}`, seen)) {
          deepTopic = getTopic(dep.slug);
          if (deepTopic) break;
        }
      }
      if (!deepTopic) {
        deepTopic = pickBestTopicForSignal({
          topics: allTopics,
          preferredTrackIds: preferredTracks,
          keywords,
          seen,
          excludeSlug: likedTopic.slug,
        });
      }
    } else if (likedRefPath) {
      const cleanCpp = likedRefPath.replace(/^cpp\//, "");
      const matching = topicsForCppPath(cleanCpp);
      for (const summary of matching) {
        if (!isSourceSeen(`topic/${summary.slug}`, seen)) {
          deepTopic = getTopic(summary.slug);
          if (deepTopic) break;
        }
      }
    }

    if (!deepTopic) {
      deepTopic = pickBestTopicForSignal({
        topics: allTopics,
        preferredTrackIds: preferredTracks,
        keywords,
        seen,
      });
    }

    if (deepTopic) {
      pushUnique(buildTopicSource(deepTopic));
    } else if (likedTopic) {
      pushUnique(buildTopicSource(likedTopic));
    }

    return sources.slice(0, 2);
  }

  if (request.trigger === "escalate") {
    const preferredTracks =
      cleanTopTracks.length > 0
        ? cleanTopTracks
        : [...DEFAULT_ESCALATE_TRACKS];

    const topic = pickBestTopicForSignal({
      topics: allTopics,
      preferredTrackIds: preferredTracks,
      keywords: ["undefined", "lifetime", "aliasing", "atomic", "deduction", "overload"],
      seen,
      preferAdvanced: true,
    });

    if (topic) {
      pushUnique(buildTopicSource(topic));
    }

    const refSource = pickBestReferenceForSignal({
      preferredTrackIds: preferredTracks,
      linkedTopic: topic,
      keywords: topic ? tokenizeKeywords(`${topic.title} ${topic.summary}`) : [],
      seen,
    });
    pushUnique(refSource);

    return sources.slice(0, 2);
  }

  // Default: "explore"
  const preferredTracks =
    cleanTopTracks.length > 0 ? cleanTopTracks : [...DEFAULT_EXPLORE_TRACKS];

  const topic = pickBestTopicForSignal({
    topics: allTopics,
    preferredTrackIds: preferredTracks,
    keywords: [],
    seen,
  });

  if (topic) {
    pushUnique(buildTopicSource(topic));
  }

  const secondaryTracks =
    preferredTracks.length > 1
      ? [preferredTracks[1], ...preferredTracks.slice(2), preferredTracks[0]]
      : preferredTracks;

  const refSource = pickBestReferenceForSignal({
    preferredTrackIds: secondaryTracks,
    linkedTopic: preferredTracks.length > 1 ? null : topic,
    keywords: [],
    seen,
  });
  pushUnique(refSource);

  return sources.slice(0, 2);
}

// ---------------------------------------------------------------------------
// Desired card kinds, cache key, and structured JSON schema
// ---------------------------------------------------------------------------

function resolveDesiredCardKinds(
  trigger: ScrollGenerateTrigger,
  primarySourceKey: string,
  requestedCount?: number
): ScrollCardKind[] {
  const hashByte = Number.parseInt(shortHash(primarySourceKey).slice(0, 2), 16);

  if (trigger === "remediate") {
    const firstKind: ScrollCardKind = hashByte % 2 === 0 ? "code" : "concept";
    const base: ScrollCardKind[] = [firstKind, "trap"];
    return requestedCount && requestedCount === 1 ? [base[0]] : base;
  }

  if (trigger === "deep-dive") {
    const combos: readonly [ScrollCardKind, ScrollCardKind][] = [
      ["code", "concept"],
      ["concept", "evolution"],
      ["code", "evolution"],
    ];
    const base = [...combos[hashByte % combos.length]];
    return requestedCount && requestedCount === 1 ? [base[0]] : base;
  }

  if (trigger === "escalate") {
    const base: ScrollCardKind[] =
      hashByte % 2 === 0 ? ["code", "trap"] : ["concept", "trap"];
    return requestedCount && requestedCount === 1 ? [base[0]] : base;
  }

  // explore: default 3 varied cards mixing code / concept / evolution / trap
  const exploreCombos: readonly [ScrollCardKind, ScrollCardKind, ScrollCardKind][] = [
    ["code", "concept", "trap"],
    ["concept", "evolution", "trap"],
    ["code", "evolution", "trap"],
  ];
  const base = [...exploreCombos[hashByte % exploreCombos.length]];
  const clampedCount =
    requestedCount && requestedCount >= 1 && requestedCount <= 3
      ? Math.floor(requestedCount)
      : 3;
  return base.slice(0, clampedCount);
}

export function buildScrollCacheKey(options: {
  trigger: ScrollGenerateTrigger;
  sources: GroundedScrollSource[];
  difficultyTarget: ScrollCardDifficulty;
  desiredKinds: ScrollCardKind[];
  missedTrapId?: string;
}): string {
  const { trigger, sources, difficultyTarget, desiredKinds, missedTrapId } = options;
  const primaryKey = sources[0]?.sourcePath ?? "none";
  const secondaryKey = sources[1]?.sourcePath ?? "-";
  const kindsKey = desiredKinds.join("+");

  if (trigger === "remediate" && missedTrapId) {
    return `remediate|${missedTrapId}|${primaryKey}|d${difficultyTarget}|${kindsKey}`;
  }
  return `${trigger}|${primaryKey}|${secondaryKey}|d${difficultyTarget}|${kindsKey}`;
}

/**
 * Clean JSON Schema compatible with Gemini Interactions API `response_format`
 * (avoids nested oneOf/anyOf and deep maxItems that can trigger 400 errors).
 */
const SCROLL_GENERATION_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    cards: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: ["concept", "code", "evolution", "trap"],
          },
          sourceIndex: {
            type: "integer",
            enum: [0, 1],
          },
          title: { type: "string" },
          summary: { type: "string" },
          standard: { type: "string" },
          tags: {
            type: "array",
            items: { type: "string" },
          },
          difficulty: {
            type: "integer",
            enum: [1, 2, 3],
          },
          durationSec: { type: "number" },
          captions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                startSec: { type: "number" },
                endSec: { type: "number" },
                text: { type: "string" },
              },
              required: ["startSec", "endSec", "text"],
            },
          },
          conceptStage: {
            type: "object",
            properties: {
              nodes: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    label: { type: "string" },
                    sub: { type: "string" },
                    group: { type: "string" },
                  },
                  required: ["id", "label"],
                },
              },
              edges: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    from: { type: "string" },
                    to: { type: "string" },
                    label: { type: "string" },
                  },
                  required: ["from", "to"],
                },
              },
              beats: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    caption: { type: "string" },
                    activeNodeIds: {
                      type: "array",
                      items: { type: "string" },
                    },
                    highlightEdgeIndices: {
                      type: "array",
                      items: { type: "integer" },
                    },
                    callout: { type: "string" },
                  },
                  required: ["title", "caption", "activeNodeIds"],
                },
              },
            },
            required: ["nodes", "edges", "beats"],
          },
          codeStage: {
            type: "object",
            properties: {
              filename: { type: "string" },
              code: { type: "string" },
              beats: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    caption: { type: "string" },
                    highlightLines: {
                      type: "array",
                      items: { type: "integer" },
                    },
                    badge: { type: "string" },
                    annotation: { type: "string" },
                  },
                  required: ["title", "caption", "highlightLines", "annotation"],
                },
              },
            },
            required: ["code", "beats"],
          },
          evolutionStage: {
            type: "object",
            properties: {
              era: { type: "string" },
              feature: { type: "string" },
              beforeLabel: { type: "string" },
              beforeCode: { type: "string" },
              afterLabel: { type: "string" },
              afterCode: { type: "string" },
              beats: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    phase: {
                      type: "string",
                      enum: ["problem", "shift", "modern", "payoff"],
                    },
                    title: { type: "string" },
                    caption: { type: "string" },
                    highlight: { type: "string" },
                  },
                  required: ["phase", "title", "caption", "highlight"],
                },
              },
            },
            required: [
              "era",
              "feature",
              "beforeLabel",
              "beforeCode",
              "afterLabel",
              "afterCode",
              "beats",
            ],
          },
          trapStage: {
            type: "object",
            properties: {
              question: { type: "string" },
              code: { type: "string" },
              options: {
                type: "array",
                items: { type: "string" },
              },
              correctIndex: { type: "integer" },
              explanation: { type: "string" },
              clause: { type: "string" },
            },
            required: ["question", "options", "correctIndex", "explanation"],
          },
        },
        required: [
          "kind",
          "sourceIndex",
          "title",
          "summary",
          "tags",
          "difficulty",
          "durationSec",
          "captions",
        ],
      },
    },
  },
  required: ["cards"],
};

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildSystemInstruction(sources: GroundedScrollSource[]): string {
  const sourcesBlock = sources
    .map(
      (src, index) =>
        `=== SOURCE [${index}] (${src.kind.toUpperCase()}): ${src.title} | track=${src.trackId} ===\n${src.markdown}`
    )
    .join("\n\n---\n\n");

  return [
    "You are the C++ Atlas Scroll generator producing crisp, white-on-black alphaXiv-style visual micro-explainers grounded STRICTLY in the provided local C++ Atlas sources.",
    "",
    "HARD GROUNDING & ACCURACY RULES:",
    "1. Every C++ rule, semantic detail, API signature, and ISO C++ clause citation (e.g. [basic.lval], [dcl.init]) MUST be directly backed by SOURCE [0] or SOURCE [1]. Never invent APIs, compiler guarantees, or clauses absent from the sources.",
    "2. Never emit URLs or markdown links anywhere in your JSON output; the server assigns verified routes.",
    "3. Write crisp, punchy plain text in titles, summaries, annotations, and captions (no markdown headers, no bullet lists, no code fences inside prose).",
    "4. Set `sourceIndex` to 0 or 1 indicating which source the card primarily draws from.",
    "",
    "STAGE-SPECIFIC CONSTRAINTS (CRITICAL FOR 16:9 MOBILE/DESKTOP RENDERING):",
    "- For `kind: \"concept\"`, populate `conceptStage` ONLY:",
    "  * 4 to 5 nodes with short IDs (`n1`, `n2`, ...), compact `label` (<= 26 chars), optional `sub` (<= 24 chars), optional `group` (`root`, `leaf`, `trap`, `lifetime`, `core`).",
    "  * Directed edges referencing ONLY declared node IDs (`from !== to`), optional short edge `label` (<= 16 chars).",
    "  * 3 to 4 progressive beats, each with non-empty `activeNodeIds` (valid node IDs), optional `highlightEdgeIndices` (0-based indices into `edges`), crisp `title` (<= 44 chars), `caption` (<= 120 chars), and `callout` (<= 96 chars).",
    "- For `kind: \"code\"`, populate `codeStage` ONLY:",
    "  * Valid, clean modern C++20/23/26 snippet (`code`), 5 to 14 lines max, <= 56 chars per line, NO markdown fences.",
    "  * Short `filename` (e.g. `lifetime.cpp`, `ranges.cpp`).",
    "  * 3 to 4 beats with 1-indexed `highlightLines` strictly within `1..lineCount`, 1–2 word `badge` (e.g. `C++20`, `UB`, `Safe`, `Rule`, `Move`), concise `annotation` (<= 110 chars), and `caption` (<= 120 chars).",
    "- For `kind: \"evolution\"`, populate `evolutionStage` ONLY:",
    "  * Concise `beforeCode` (<= 9 lines) and `afterCode` (<= 9 lines), <= 52 chars per line, NO markdown fences.",
    "  * Short `era` (e.g. `C++20`, `C++23`, `C++26`), `feature`, `beforeLabel` (e.g. `C++11`), `afterLabel` (e.g. `C++20`).",
    "  * Exactly 4 beats in order with `phase`: `problem`, `shift`, `modern`, `payoff`, each with crisp `title`, `caption`, and `highlight` (<= 96 chars).",
    "- For `kind: \"trap\"`, populate `trapStage` ONLY:",
    "  * Crisp scannable `question` (<= 150 chars), optional concise `code` (<= 8 lines, <= 52 chars per line, NO markdown fences).",
    "  * Exactly 4 distinct concise `options` (<= 75 chars each), valid 0-based `correctIndex` (0..3), sharp `explanation` (<= 220 chars) stating WHY according to ISO C++, and `clause` from the source (e.g. `[basic.lval]`).",
    "- For every card: `durationSec` between 12 and 18, and 3–4 strictly monotonic `captions` spanning `0` to `durationSec`.",
    "",
    "=== GROUNDED LOCAL C++ ATLAS SOURCES ===",
    sourcesBlock,
  ].join("\n");
}

function buildUserPrompt(options: {
  request: ScrollGenerateRequest;
  sources: GroundedScrollSource[];
  desiredKinds: ScrollCardKind[];
  difficultyTarget: ScrollCardDifficulty;
}): string {
  const { request, sources, desiredKinds, difficultyTarget } = options;
  const kindPlan = desiredKinds
    .map((k, idx) => `Card ${idx + 1}: kind="${k}"`)
    .join("; ");

  if (request.trigger === "remediate" && request.missedTrap) {
    const m = request.missedTrap;
    return [
      `ADAPTIVE TRIGGER: REMEDIATE A MISSED TRAP.`,
      `The learner just missed this ISO C++ trap:`,
      `- Question: ${m.question}`,
      m.clause ? `- ISO Clause: ${m.clause}` : "",
      `- Original Explanation: ${m.explanation}`,
      "",
      `Generate exactly ${desiredKinds.length} cards (${kindPlan}) at difficulty ${difficultyTarget}:`,
      desiredKinds.length >= 1
        ? `1. Card 1 (${desiredKinds[0]}): A razor-sharp 4-beat visual walkthrough clearing up the exact misconception behind that missed trap, grounded in SOURCE [0]${sources[1] ? " and SOURCE [1]" : ""}.`
        : "",
      desiredKinds.length >= 2
        ? `2. Card 2 (trap): A FRESH rephrased twin trap testing the SAME underlying ISO rule from a new code/scenario angle (do NOT reuse the original question text or identical options!).`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (request.trigger === "deep-dive") {
    const liked = request.likedCard;
    return [
      `ADAPTIVE TRIGGER: DEEP DIVE FROM LIKED CONTENT.`,
      liked
        ? `The learner just liked "${liked.title}" (track: ${liked.trackId}; tags: ${liked.tags.join(", ") || "C++"}).`
        : `The learner showed strong engagement on track ${sources[0]?.trackId ?? "value-semantics"}.`,
      `Generate exactly ${desiredKinds.length} deeper cards (${kindPlan}) at difficulty ${difficultyTarget}.`,
      `Go one layer deeper into semantics, lifetime, library contracts, or standard evolution grounded in SOURCE [0]${sources[1] ? " and SOURCE [1]" : ""}—do NOT merely repeat the liked card's title.`,
    ].join("\n");
  }

  if (request.trigger === "escalate") {
    return [
      `ADAPTIVE TRIGGER: ESCALATE TO LEVEL 3 CORNER CASES.`,
      `The learner has high accuracy on mastered tracks (${(request.topTracks ?? []).join(", ") || sources[0]?.trackId}).`,
      `Generate exactly ${desiredKinds.length} cards (${kindPlan}) ALL at difficulty=3.`,
      `Focus on subtle ISO C++ standard-lawyer corner cases (UB traps, value-category interactions, overload/deduction nuances, lifetime/aliasing rules, or concurrency ordering) strictly backed by SOURCE [0]${sources[1] ? " and SOURCE [1]" : ""}.`,
    ].join("\n");
  }

  // explore
  return [
    `ADAPTIVE TRIGGER: PERSONALIZED FEED EXPLORATION.`,
    `Tailor to the learner's active tracks (${(request.topTracks ?? []).join(", ") || sources[0]?.trackId}) at difficulty ${difficultyTarget}.`,
    `Generate exactly ${desiredKinds.length} varied cards (${kindPlan}) grounded in SOURCE [0]${sources[1] ? " and SOURCE [1]" : ""}.`,
    sources.length > 1
      ? `Draw at least one card from SOURCE [0] (sourceIndex=0) and at least one card from SOURCE [1] (sourceIndex=1) for rich variety.`
      : `Cover distinct high-signal angles of SOURCE [0] without repeating the same snippet.`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// JSON parsing & strict post-validation / normalization
// ---------------------------------------------------------------------------

export function parseGeneratedPayload(rawText: string): unknown[] {
  const trimmed = rawText.trim();
  if (!trimmed) return [];

  const unwrapped = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const tryExtractCards = (parsed: unknown): unknown[] | null => {
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") {
      const rec = parsed as Record<string, unknown>;
      if (Array.isArray(rec.cards)) return rec.cards;
    }
    return null;
  };

  try {
    const parsed = JSON.parse(unwrapped) as unknown;
    const cards = tryExtractCards(parsed);
    if (cards) return cards;
  } catch {
    // Attempt balanced outer JSON recovery if model emitted leading/trailing prose
  }

  const firstObj = unwrapped.indexOf("{");
  const lastObj = unwrapped.lastIndexOf("}");
  if (firstObj >= 0 && lastObj > firstObj) {
    try {
      const parsed = JSON.parse(unwrapped.slice(firstObj, lastObj + 1)) as unknown;
      const cards = tryExtractCards(parsed);
      if (cards) return cards;
    } catch {
      // Fall through to array extraction
    }
  }

  const firstArr = unwrapped.indexOf("[");
  const lastArr = unwrapped.lastIndexOf("]");
  if (firstArr >= 0 && lastArr > firstArr) {
    try {
      const parsed = JSON.parse(unwrapped.slice(firstArr, lastArr + 1)) as unknown;
      const cards = tryExtractCards(parsed);
      if (cards) return cards;
    } catch {
      return [];
    }
  }

  return [];
}

function buildEvenCaptions(texts: string[], durationSec: number): ScrollCaptionCue[] {
  const cleaned = texts
    .map((t) => clampText(t, 130))
    .filter((t) => t.length > 0);
  if (cleaned.length === 0) return [];
  const step = durationSec / cleaned.length;
  return cleaned.map((text, index) => {
    const startSec = Number((index * step).toFixed(2));
    const endSec =
      index === cleaned.length - 1
        ? durationSec
        : Number(((index + 1) * step).toFixed(2));
    return { startSec, endSec, text };
  });
}

function sanitizeCaptions(
  rawCaptions: unknown,
  fallbackTexts: string[],
  durationSec: number
): ScrollCaptionCue[] {
  if (Array.isArray(rawCaptions) && rawCaptions.length >= 2) {
    const parsed: ScrollCaptionCue[] = [];
    let validTimings = true;
    let prevEnd = 0;

    for (const item of rawCaptions.slice(0, 6)) {
      if (!item || typeof item !== "object") {
        validTimings = false;
        break;
      }
      const rec = item as Record<string, unknown>;
      const text = typeof rec.text === "string" ? clampText(rec.text, 135) : "";
      const startSec = Number(rec.startSec);
      const endSec = Number(rec.endSec);

      if (
        !text ||
        !Number.isFinite(startSec) ||
        !Number.isFinite(endSec) ||
        startSec < 0 ||
        endSec <= startSec
      ) {
        validTimings = false;
        break;
      }

      if (parsed.length > 0 && startSec < prevEnd - 0.25) {
        validTimings = false;
        break;
      }

      parsed.push({
        startSec: Number(startSec.toFixed(2)),
        endSec: Number(endSec.toFixed(2)),
        text,
      });
      prevEnd = endSec;
    }

    if (validTimings && parsed.length >= 2) {
      // Scale or normalize cleanly onto [0, durationSec] with strict continuity
      const totalSpan = parsed[parsed.length - 1].endSec - parsed[0].startSec;
      if (totalSpan > 0.5) {
        const origin = parsed[0].startSec;
        const scale = durationSec / totalSpan;
        const normalized: ScrollCaptionCue[] = [];
        for (let i = 0; i < parsed.length; i++) {
          const startSec =
            i === 0
              ? 0
              : normalized[i - 1].endSec;
          const rawScaledEnd = Number(
            ((parsed[i].endSec - origin) * scale).toFixed(2)
          );
          const endSec =
            i === parsed.length - 1
              ? durationSec
              : Math.min(
                  Number((durationSec - 0.4 * (parsed.length - 1 - i)).toFixed(2)),
                  Math.max(Number((startSec + 0.5).toFixed(2)), rawScaledEnd)
                );
          if (endSec <= startSec) {
            return buildEvenCaptions(
              parsed.map((p) => p.text),
              durationSec
            );
          }
          normalized.push({ startSec, endSec, text: parsed[i].text });
        }
        return normalized;
      }
    }
  }

  return buildEvenCaptions(fallbackTexts, durationSec);
}

function validateConceptStage(raw: unknown): ConceptStageData | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (!Array.isArray(rec.nodes) || !Array.isArray(rec.beats)) return null;

  const nodes: ConceptStageNode[] = [];
  const seenIds = new Set<string>();
  for (const item of rec.nodes) {
    if (!item || typeof item !== "object") continue;
    const n = item as Record<string, unknown>;
    const id = typeof n.id === "string" ? n.id.trim().slice(0, 32) : "";
    const label = typeof n.label === "string" ? clampText(n.label, 28) : "";
    if (!id || !label || seenIds.has(id)) continue;
    seenIds.add(id);

    const sub =
      typeof n.sub === "string" && n.sub.trim()
        ? clampText(n.sub, 30)
        : undefined;
    const group =
      typeof n.group === "string" && n.group.trim()
        ? clampText(n.group, 20)
        : undefined;

    nodes.push({ id, label, ...(sub ? { sub } : {}), ...(group ? { group } : {}) });
    if (nodes.length >= 6) break;
  }

  if (nodes.length < 3) return null;

  const edges: ConceptStageEdge[] = [];
  const seenEdges = new Set<string>();
  if (Array.isArray(rec.edges)) {
    for (const item of rec.edges) {
      if (!item || typeof item !== "object") continue;
      const e = item as Record<string, unknown>;
      const from = typeof e.from === "string" ? e.from.trim() : "";
      const to = typeof e.to === "string" ? e.to.trim() : "";
      if (!from || !to || from === to || !seenIds.has(from) || !seenIds.has(to)) {
        continue;
      }
      const edgeKey = `${from}->${to}`;
      if (seenEdges.has(edgeKey)) continue;
      seenEdges.add(edgeKey);
      const label =
        typeof e.label === "string" && e.label.trim()
          ? clampText(e.label, 18)
          : undefined;
      edges.push({ from, to, ...(label ? { label } : {}) });
      if (edges.length >= 10) break;
    }
  }

  const beats: ConceptStageBeat[] = [];
  for (const item of rec.beats) {
    if (!item || typeof item !== "object") continue;
    const b = item as Record<string, unknown>;
    const title = typeof b.title === "string" ? clampText(b.title, 48) : "";
    const caption =
      typeof b.caption === "string" ? clampText(b.caption, 140) : "";
    if (!title || !caption) continue;

    const rawActive = Array.isArray(b.activeNodeIds) ? b.activeNodeIds : [];
    const activeNodeIds: string[] = [];
    const seenActive = new Set<string>();
    for (const id of rawActive) {
      if (typeof id !== "string") continue;
      const cleanId = id.trim();
      if (seenIds.has(cleanId) && !seenActive.has(cleanId)) {
        seenActive.add(cleanId);
        activeNodeIds.push(cleanId);
      }
    }
    if (activeNodeIds.length === 0) continue;

    let highlightEdgeIndices: number[] | undefined;
    if (Array.isArray(b.highlightEdgeIndices) && edges.length > 0) {
      const validIndices = Array.from(
        new Set(
          b.highlightEdgeIndices
            .map((v) => Number(v))
            .filter(
              (idx) => Number.isInteger(idx) && idx >= 0 && idx < edges.length
            )
        )
      );
      if (validIndices.length > 0) {
        highlightEdgeIndices = validIndices;
      }
    }

    const callout =
      typeof b.callout === "string" && b.callout.trim()
        ? clampText(b.callout, 110)
        : undefined;

    beats.push({
      title,
      caption,
      activeNodeIds,
      ...(highlightEdgeIndices ? { highlightEdgeIndices } : {}),
      ...(callout ? { callout } : {}),
    });
    if (beats.length >= 5) break;
  }

  if (beats.length < 2) return null;

  return {
    type: "concept",
    nodes,
    edges,
    beats,
  };
}

function validateCodeStage(raw: unknown): CodeStageData | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.code !== "string" || !Array.isArray(rec.beats)) return null;

  const code = stripCodeFences(rec.code);
  if (!code) return null;

  const lines = code.split("\n");
  const lineCount = lines.length;
  if (lineCount < 2 || lineCount > 18) return null;

  const filenameRaw =
    typeof rec.filename === "string" ? rec.filename.trim() : "";
  const filename =
    filenameRaw && /^[a-zA-Z0-9._-]{1,36}$/.test(filenameRaw)
      ? filenameRaw
      : "snippet.cpp";

  const beats: CodeStageBeat[] = [];
  for (const item of rec.beats) {
    if (!item || typeof item !== "object") continue;
    const b = item as Record<string, unknown>;
    const title = typeof b.title === "string" ? clampText(b.title, 48) : "";
    const annotation =
      typeof b.annotation === "string" ? clampText(b.annotation, 130) : "";
    const caption =
      typeof b.caption === "string" && b.caption.trim()
        ? clampText(b.caption, 140)
        : annotation;
    if (!title || !annotation) continue;

    const rawHighlights = Array.isArray(b.highlightLines)
      ? b.highlightLines
      : [];
    const clampedLines = Array.from(
      new Set(
        rawHighlights
          .map((n) => Math.round(Number(n)))
          .filter((n) => Number.isFinite(n))
          .map((n) => Math.min(lineCount, Math.max(1, n)))
      )
    ).sort((a, bVal) => a - bVal);

    // Drop beats without valid highlighted lines
    if (clampedLines.length === 0) continue;

    const badge =
      typeof b.badge === "string" && b.badge.trim()
        ? clampText(b.badge, 18)
        : undefined;

    beats.push({
      title,
      caption,
      highlightLines: clampedLines,
      ...(badge ? { badge } : {}),
      annotation,
    });
    if (beats.length >= 5) break;
  }

  if (beats.length < 2) return null;

  return {
    type: "code",
    filename,
    language: "cpp",
    code,
    beats,
  };
}

function validateEvolutionStage(raw: unknown): EvolutionStageData | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;

  const beforeCode =
    typeof rec.beforeCode === "string" ? stripCodeFences(rec.beforeCode) : "";
  const afterCode =
    typeof rec.afterCode === "string" ? stripCodeFences(rec.afterCode) : "";
  if (!beforeCode || !afterCode || beforeCode === afterCode) return null;
  if (beforeCode.split("\n").length > 16 || afterCode.split("\n").length > 16) {
    return null;
  }

  const era =
    typeof rec.era === "string" && rec.era.trim()
      ? clampText(rec.era, 16)
      : "C++20";
  const feature =
    typeof rec.feature === "string" ? clampText(rec.feature, 56) : "";
  const beforeLabel =
    typeof rec.beforeLabel === "string" && rec.beforeLabel.trim()
      ? clampText(rec.beforeLabel, 24)
      : "Before";
  const afterLabel =
    typeof rec.afterLabel === "string" && rec.afterLabel.trim()
      ? clampText(rec.afterLabel, 24)
      : era;
  if (!feature || !Array.isArray(rec.beats)) return null;

  const validPhaseSet = new Set<string>(VALID_EVOLUTION_PHASES);
  const beats: EvolutionStageBeat[] = [];
  for (let i = 0; i < rec.beats.length; i++) {
    const item = rec.beats[i];
    if (!item || typeof item !== "object") continue;
    const b = item as Record<string, unknown>;
    const rawPhase = typeof b.phase === "string" ? b.phase.trim().toLowerCase() : "";
    const phase: EvolutionBeatPhase = validPhaseSet.has(rawPhase)
      ? (rawPhase as EvolutionBeatPhase)
      : VALID_EVOLUTION_PHASES[Math.min(i, VALID_EVOLUTION_PHASES.length - 1)];
    const title = typeof b.title === "string" ? clampText(b.title, 48) : "";
    const highlight =
      typeof b.highlight === "string" ? clampText(b.highlight, 120) : "";
    const caption =
      typeof b.caption === "string" && b.caption.trim()
        ? clampText(b.caption, 140)
        : highlight;
    if (!title || !highlight) continue;

    beats.push({ phase, title, caption, highlight });
    if (beats.length >= 4) break;
  }

  if (beats.length < 2) return null;

  return {
    type: "evolution",
    era,
    feature,
    beforeLabel,
    beforeCode,
    afterLabel,
    afterCode,
    beats,
  };
}

function validateTrapStage(
  raw: unknown,
  fallbackClause: string | undefined,
  stableTrapId: string
): TrapStageData | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;

  const question =
    typeof rec.question === "string" ? clampText(rec.question, 190) : "";
  const explanation =
    typeof rec.explanation === "string" ? clampText(rec.explanation, 280) : "";
  if (question.length < 12 || explanation.length < 20) return null;

  let code: string | undefined;
  if (typeof rec.code === "string" && rec.code.trim()) {
    const stripped = stripCodeFences(rec.code);
    if (stripped.split("\n").length > 14) return null;
    code = stripped;
  }

  if (!Array.isArray(rec.options)) return null;
  const rawCorrect = Number(rec.correctIndex);
  if (
    !Number.isInteger(rawCorrect) ||
    rawCorrect < 0 ||
    rawCorrect >= rec.options.length
  ) {
    return null;
  }

  // Deduplicate options while tracking the exact remapped correctIndex
  const options: string[] = [];
  const seenOpts = new Set<string>();
  let remappedCorrect = -1;

  for (let i = 0; i < rec.options.length; i++) {
    const rawOpt = rec.options[i];
    if (typeof rawOpt !== "string") continue;
    const cleaned = clampText(rawOpt, 110);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seenOpts.has(key)) {
      if (i === rawCorrect) return null; // Ambiguous duplicate answer
      continue;
    }
    seenOpts.add(key);
    if (i === rawCorrect) {
      remappedCorrect = options.length;
    }
    options.push(cleaned);
    if (options.length >= 4) break;
  }

  if (options.length < 3 || options.length > 4) return null;
  if (remappedCorrect < 0 || remappedCorrect >= options.length) return null;

  const rawClause =
    typeof rec.clause === "string" && rec.clause.trim()
      ? clampText(rec.clause, 48)
      : fallbackClause;

  return {
    type: "trap",
    trapId: stableTrapId,
    question,
    ...(code ? { code } : {}),
    options,
    correctIndex: remappedCorrect,
    explanation,
    ...(rawClause ? { clause: rawClause } : {}),
  };
}

function resolveAiReason(
  trigger: ScrollGenerateTrigger,
  kind: ScrollCardKind
): string {
  switch (trigger) {
    case "remediate":
      return kind === "trap"
        ? "Twin trap check"
        : "Targeted fix for missed trap";
    case "deep-dive":
      return "Deep dive from your likes";
    case "escalate":
      return "Leveled-up C++ corner case";
    case "explore":
    default:
      return "Tailored for your feed";
  }
}

function resolveBadgeLabel(kind: ScrollCardKind, era?: string): string {
  switch (kind) {
    case "concept":
      return "Visual Explainer";
    case "code":
      return "Code Walkthrough";
    case "evolution":
      return era ? `${era} Shift` : "C++ Shift";
    case "trap":
      return "Trap Check";
  }
}

function normalizeStandardTag(raw: unknown, fallback?: string): string | undefined {
  if (typeof raw === "string") {
    const m = raw.match(/\bC\+\+(?:98|03|11|14|17|20|23|26)\b/i);
    if (m) return m[0].replace(/^c\+\+/i, "C++");
  }
  return fallback;
}

function extractStageRaw(
  rec: Record<string, unknown>,
  kind: ScrollCardKind
): unknown {
  // Primary schema fields: conceptStage / codeStage / evolutionStage / trapStage
  const byKindKey: Record<ScrollCardKind, string> = {
    concept: "conceptStage",
    code: "codeStage",
    evolution: "evolutionStage",
    trap: "trapStage",
  };
  const direct = rec[byKindKey[kind]];
  if (direct && typeof direct === "object") return direct;

  // Defensive fallback if model returned a unified `stage` object
  if (rec.stage && typeof rec.stage === "object") {
    const stageRec = rec.stage as Record<string, unknown>;
    if (!stageRec.type || stageRec.type === kind) {
      return stageRec;
    }
  }
  return null;
}

/**
 * Strictly validates and normalizes a single raw Gemini card object into a
 * trusted `ScrollCard`, assigning server-verified routing and provenance.
 * Returns `null` if any critical invariant fails so broken UI data is never emitted.
 */
export function validateAndNormalizeGeneratedCard(
  rawCard: unknown,
  options: {
    trigger: ScrollGenerateTrigger;
    sources: GroundedScrollSource[];
    difficultyTarget: ScrollCardDifficulty;
  }
): ScrollCard | null {
  if (!rawCard || typeof rawCard !== "object") return null;
  if (options.sources.length === 0) return null;

  const rec = rawCard as Record<string, unknown>;
  const rawKind = typeof rec.kind === "string" ? rec.kind.trim().toLowerCase() : "";
  if (!VALID_KINDS.has(rawKind)) return null;
  const kind = rawKind as ScrollCardKind;

  const rawSourceIndex = Number(rec.sourceIndex);
  const sourceIndex =
    Number.isInteger(rawSourceIndex) &&
    rawSourceIndex >= 0 &&
    rawSourceIndex < options.sources.length
      ? rawSourceIndex
      : 0;
  const source = options.sources[sourceIndex];

  const title = typeof rec.title === "string" ? clampText(rec.title, 88) : "";
  const summary =
    typeof rec.summary === "string" ? clampText(rec.summary, 220) : "";
  if (title.length < 4 || summary.length < 14) return null;

  const rawDuration = Number(rec.durationSec);
  const defaultDuration = kind === "trap" ? 14 : 15;
  const durationSec = Number.isFinite(rawDuration)
    ? Math.min(22, Math.max(10, Math.round(rawDuration)))
    : defaultDuration;

  const rawDifficulty = Number(rec.difficulty);
  const difficulty: ScrollCardDifficulty =
    options.trigger === "escalate"
      ? 3
      : rawDifficulty === 1 || rawDifficulty === 2 || rawDifficulty === 3
        ? rawDifficulty
        : options.difficultyTarget;

  const stageRaw = extractStageRaw(rec, kind);
  const seedKey = `${options.trigger}|${source.sourcePath}|${kind}|${title.toLowerCase()}`;
  const cardHash = shortHash(seedKey);

  let stage:
    | ConceptStageData
    | CodeStageData
    | EvolutionStageData
    | TrapStageData
    | null = null;
  let fallbackCaptionTexts: string[] = [];

  if (kind === "concept") {
    stage = validateConceptStage(stageRaw);
    if (stage) {
      fallbackCaptionTexts = stage.beats.map((b) => b.caption);
    }
  } else if (kind === "code") {
    stage = validateCodeStage(stageRaw);
    if (stage) {
      fallbackCaptionTexts = stage.beats.map((b) => b.caption);
    }
  } else if (kind === "evolution") {
    stage = validateEvolutionStage(stageRaw);
    if (stage) {
      fallbackCaptionTexts = stage.beats.map((b) => b.caption);
    }
  } else if (kind === "trap") {
    stage = validateTrapStage(stageRaw, source.clauses[0], `ai-trap-${cardHash}`);
    if (stage) {
      fallbackCaptionTexts = [
        stage.question,
        stage.clause ? `Check ${stage.clause} carefully.` : "Trace the ISO C++ rule.",
        summary,
      ];
    }
  }

  if (!stage) return null;

  const captions = sanitizeCaptions(
    rec.captions,
    fallbackCaptionTexts.length > 0 ? fallbackCaptionTexts : [title, summary],
    durationSec
  );

  // Deduplicate & sanitize tags
  const rawTags = Array.isArray(rec.tags) ? rec.tags : [];
  const tags: string[] = [];
  const seenTagKeys = new Set<string>();
  for (const candidate of [...rawTags, ...source.tags]) {
    if (typeof candidate !== "string") continue;
    const cleaned = clampText(candidate, 32);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seenTagKeys.has(key)) continue;
    seenTagKeys.add(key);
    tags.push(cleaned);
    if (tags.length >= 5) break;
  }

  const standard = normalizeStandardTag(
    rec.standard,
    stage.type === "evolution" ? normalizeStandardTag(stage.era) : undefined
  );

  const readLabel =
    kind === "trap" && source.kind === "topic" ? "Study topic" : source.readLabel;

  const baseScore =
    options.trigger === "remediate"
      ? 88
      : options.trigger === "escalate" || options.trigger === "deep-dive"
        ? 85
        : 82;

  return {
    id: `ai:${options.trigger}:${cardHash}`,
    kind,
    title,
    summary,
    badgeLabel: resolveBadgeLabel(
      kind,
      stage.type === "evolution" ? stage.era : undefined
    ),
    trackId: source.trackId,
    trackTitle: source.trackTitle,
    continentId: source.continentId,
    continentLabel: source.continentLabel,
    accentHex: getAccentHex(source.continentId, kind),
    ...(standard ? { standard } : {}),
    tags,
    prerequisites: source.prerequisites,
    ...(source.topicSlug ? { topicSlug: source.topicSlug } : {}),
    readHref: source.readHref,
    readLabel,
    durationSec,
    difficulty,
    baseScore,
    captions,
    stage,
    origin: "ai",
    aiReason: resolveAiReason(options.trigger, kind),
    sourcePath: source.sourcePath,
  };
}

// ---------------------------------------------------------------------------
// Main generation entry point
// ---------------------------------------------------------------------------

export interface GenerateAdaptiveOptions {
  apiKey: string;
  signal?: AbortSignal;
  bypassCache?: boolean;
}

export async function generateAdaptiveScrollCards(
  request: ScrollGenerateRequest,
  options: GenerateAdaptiveOptions
): Promise<ScrollGenerateResponse> {
  const sources = selectGroundedSources(request);
  if (sources.length === 0) {
    return {
      cards: [],
      cached: false,
      sourceTitles: [],
      model: GEMINI_STUDIO_MODEL,
    };
  }

  const difficultyTarget: ScrollCardDifficulty =
    request.trigger === "escalate"
      ? 3
      : request.difficultyTarget === 1 ||
          request.difficultyTarget === 2 ||
          request.difficultyTarget === 3
        ? request.difficultyTarget
        : 2;

  const desiredKinds = resolveDesiredCardKinds(
    request.trigger,
    sources[0].sourcePath,
    request.count
  );

  const cacheKey = buildScrollCacheKey({
    trigger: request.trigger,
    sources,
    difficultyTarget,
    desiredKinds,
    missedTrapId: request.missedTrap?.trapId || request.missedTrap?.cardId,
  });

  const cache = getGeneratorCache();
  if (!options.bypassCache) {
    const hit = cache.get(cacheKey);
    if (hit && hit.cards.length > 0) {
      return {
        cards: hit.cards,
        cached: true,
        sourceTitles: hit.sourceTitles,
        model: hit.model,
      };
    }
  }

  const ai = createGeminiClient(options.apiKey);
  const systemInstruction = buildSystemInstruction(sources);
  const userPrompt = buildUserPrompt({
    request,
    sources,
    desiredKinds,
    difficultyTarget,
  });

  const interaction = await ai.interactions.create(
    {
      model: GEMINI_STUDIO_MODEL,
      store: false,
      system_instruction: systemInstruction,
      input: userPrompt,
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: SCROLL_GENERATION_JSON_SCHEMA,
      },
    },
    { signal: options.signal }
  );

  const rawItems = parseGeneratedPayload(interaction.output_text ?? "");
  const seenCardIds = new Set(request.seenCardIds ?? []);
  const cards: ScrollCard[] = [];
  const emittedIds = new Set<string>();

  for (const rawItem of rawItems) {
    const validated = validateAndNormalizeGeneratedCard(rawItem, {
      trigger: request.trigger,
      sources,
      difficultyTarget,
    });
    if (!validated) continue;
    if (emittedIds.has(validated.id) || seenCardIds.has(validated.id)) {
      continue;
    }
    emittedIds.add(validated.id);
    cards.push(validated);
    if (cards.length >= desiredKinds.length) break;
  }

  const sourceTitles = sources.map((s) => s.title);

  if (cards.length > 0) {
    cache.set(cacheKey, {
      createdAt: Date.now(),
      cards,
      sourceTitles,
      model: GEMINI_STUDIO_MODEL,
    });
  }

  return {
    cards,
    cached: false,
    sourceTitles,
    model: GEMINI_STUDIO_MODEL,
  };
}
