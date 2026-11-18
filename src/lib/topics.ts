import fs from "node:fs";
import path from "node:path";
import {
  createHeadingSlugger,
  extractHeadingsFromMarkdown,
  getSimulatorForTopic,
  SIMULATOR_BY_TOPIC,
  slugifyHeading,
  standardRefToUrl,
  type CppRefLink,
  type SimulatorKind,
  type Topic,
  type TopicMap,
  type TopicMapNode,
  type TopicNeighbours,
  type TopicQuizKind,
  type TopicQuizQuestion,
  type TopicSummary,
  type TrackDefinition,
  type TrackWithTopics,
} from "@/types/topics";
import {
  getReferenceEntry,
  getReferenceIndex,
  referenceHref,
  referenceLiveUrl,
} from "@/lib/reference";

export {
  createHeadingSlugger,
  extractHeadingsFromMarkdown,
  getSimulatorForTopic,
  SIMULATOR_BY_TOPIC,
  slugifyHeading,
  standardRefToUrl,
};
export type {
  CppRefLink,
  SimulatorKind,
  Topic,
  TopicMap,
  TopicMapNode,
  TopicNeighbours,
  TopicQuizKind,
  TopicQuizQuestion,
  TopicSummary,
  TrackDefinition,
  TrackWithTopics,
};

const CONTENT_ROOT = path.join(process.cwd(), "content");
const TRACKS_FILE = path.join(CONTENT_ROOT, "tracks.json");
const TOPICS_DIR = path.join(CONTENT_ROOT, "topics");

function isSafeSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(slug);
}

// ---------------------------------------------------------------------------
// Zero-dependency YAML frontmatter parser
// ---------------------------------------------------------------------------

function stripYamlComment(raw: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "'" && !inDouble) {
      if (inSingle && raw[i + 1] === "'") {
        i++;
        continue;
      }
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      if (inDouble && raw[i - 1] === "\\") continue;
      inDouble = !inDouble;
    } else if (
      ch === "#" &&
      !inSingle &&
      !inDouble &&
      (i === 0 || /\s/.test(raw[i - 1]))
    ) {
      return raw.slice(0, i).trimEnd();
    }
  }
  return raw;
}

function unquoteYamlString(raw: string): string {
  const s = raw.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s
      .slice(1, -1)
      .replace(/\\(["\\/bfnrt])/g, (_m, esc: string) => {
        switch (esc) {
          case '"':
            return '"';
          case "\\":
            return "\\";
          case "/":
            return "/";
          case "b":
            return "\b";
          case "f":
            return "\f";
          case "n":
            return "\n";
          case "r":
            return "\r";
          case "t":
            return "\t";
          default:
            return esc;
        }
      });
  }
  if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) {
    return s.slice(1, -1).replace(/''/g, "'");
  }
  return s;
}

function splitTopLevelCommas(inner: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let bracketDepth = 0;
  let braceDepth = 0;

  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "'" && !inDouble) {
      if (inSingle && inner[i + 1] === "'") {
        current += "''";
        i++;
        continue;
      }
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      if (!(inDouble && inner[i - 1] === "\\")) {
        inDouble = !inDouble;
      }
    } else if (!inSingle && !inDouble) {
      if (ch === "[") bracketDepth++;
      else if (ch === "]") bracketDepth = Math.max(0, bracketDepth - 1);
      else if (ch === "{") braceDepth++;
      else if (ch === "}") braceDepth = Math.max(0, braceDepth - 1);
      else if (ch === "," && bracketDepth === 0 && braceDepth === 0) {
        if (current.trim()) parts.push(current.trim());
        current = "";
        continue;
      }
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function findUnquotedColon(text: string): number {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "'" && !inDouble) {
      if (inSingle && text[i + 1] === "'") {
        i++;
        continue;
      }
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      if (!(inDouble && text[i - 1] === "\\")) {
        inDouble = !inDouble;
      }
    } else if (ch === ":" && !inSingle && !inDouble) {
      if (i + 1 === text.length || /\s/.test(text[i + 1])) {
        return i;
      }
    }
  }
  return -1;
}

type YamlPrimitive = string | number | boolean | null;
type YamlValue = YamlPrimitive | YamlObject | YamlValue[];
interface YamlObject {
  [key: string]: YamlValue;
}

function parseFlowObject(raw: string): YamlObject {
  const inner = raw.trim().slice(1, -1).trim();
  const obj: YamlObject = {};
  if (!inner) return obj;
  for (const part of splitTopLevelCommas(inner)) {
    const colon = findUnquotedColon(part);
    if (colon <= 0) continue;
    const key = unquoteYamlString(part.slice(0, colon).trim());
    const valRaw = part.slice(colon + 1).trim();
    obj[key] = parseYamlScalarOrFlow(valRaw);
  }
  return obj;
}

function parseYamlScalarOrFlow(raw: string, asScalarOnly = false): YamlValue {
  const cleaned = stripYamlComment(raw).trim();
  if (!cleaned) return "";

  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    return unquoteYamlString(cleaned);
  }

  if (!asScalarOnly) {
    if (cleaned.startsWith("[") && cleaned.endsWith("]")) {
      const inner = cleaned.slice(1, -1).trim();
      if (!inner) return [];
      const items = splitTopLevelCommas(inner);
      return items.map((item) => parseYamlScalarOrFlow(item));
    }
    if (cleaned.startsWith("{") && cleaned.endsWith("}")) {
      return parseFlowObject(cleaned);
    }
  }

  if (/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return Number(cleaned);
  }
  if (cleaned === "true") return true;
  if (cleaned === "false") return false;
  if (cleaned === "null" || cleaned === "~") return null;
  return cleaned;
}

function countIndent(line: string): number {
  let i = 0;
  while (i < line.length && line[i] === " ") i++;
  return i;
}

function parseBlockScalar(
  lines: string[],
  startIdx: number,
  indicator: string,
  parentIndent: number
): { value: string; nextIdx: number } {
  const folded = indicator.startsWith(">");
  const chompStrip = indicator.endsWith("-");
  const contentLines: string[] = [];
  let blockIndent: number | null = null;
  let i = startIdx;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      contentLines.push("");
      i++;
      continue;
    }
    const indent = countIndent(line);
    if (indent <= parentIndent) break;
    if (blockIndent === null) blockIndent = indent;
    contentLines.push(line.slice(Math.min(blockIndent, line.length)));
    i++;
  }

  while (contentLines.length > 0 && contentLines[contentLines.length - 1] === "") {
    contentLines.pop();
  }

  let text = folded
    ? contentLines
        .join("\n")
        .replace(/([^\n])\n([^\n])/g, "$1 $2")
    : contentLines.join("\n");

  if (!chompStrip && text) {
    text = text.trimEnd();
  }
  return { value: text, nextIdx: i };
}

function parseFrontmatterYaml(yamlText: string): YamlObject {
  const lines = yamlText.replace(/\r\n?/g, "\n").split("\n");
  const root: YamlObject = {};
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      i++;
      continue;
    }

    const baseIndent = countIndent(line);
    const colonIdx = findUnquotedColon(trimmed);
    if (colonIdx <= 0) {
      i++;
      continue;
    }

    const key = unquoteYamlString(trimmed.slice(0, colonIdx).trim());
    const afterColon = stripYamlComment(trimmed.slice(colonIdx + 1)).trim();

    if (
      afterColon === "|" ||
      afterColon === "|-" ||
      afterColon === ">" ||
      afterColon === ">-"
    ) {
      const { value, nextIdx } = parseBlockScalar(
        lines,
        i + 1,
        afterColon,
        baseIndent
      );
      root[key] = value;
      i = nextIdx;
      continue;
    }

    if (afterColon !== "") {
      root[key] = parseYamlScalarOrFlow(afterColon);
      i++;
      continue;
    }

    // Block list or nested object following `key:`
    const items: YamlValue[] = [];
    let j = i + 1;

    while (j < lines.length) {
      const sub = lines[j];
      const subTrim = sub.trim();
      if (!subTrim || subTrim.startsWith("#")) {
        j++;
        continue;
      }

      const subIndent = countIndent(sub);
      if (subIndent < baseIndent) break;
      if (subIndent === baseIndent && !subTrim.startsWith("-")) break;

      if (subTrim === "-" || subTrim.startsWith("- ")) {
        const afterDash =
          subTrim === "-" ? "" : stripYamlComment(subTrim.slice(2)).trim();
        const dashCol = subIndent;

        // Flow object on list line: `- { title: ..., path: ... }`
        if (afterDash.startsWith("{") && afterDash.endsWith("}")) {
          items.push(parseFlowObject(afterDash));
          j++;
          continue;
        }

        // Object list item starting on the `- ` line (e.g., `- title: Foo`) or on next indented lines
        const dashColon = afterDash ? findUnquotedColon(afterDash) : -1;
        if (dashColon > 0 || afterDash === "") {
          const obj: YamlObject = {};
          if (dashColon > 0) {
            const firstKey = unquoteYamlString(
              afterDash.slice(0, dashColon).trim()
            );
            const firstVal = afterDash.slice(dashColon + 1).trim();
            obj[firstKey] = parseYamlScalarOrFlow(firstVal, true);
          }

          let k = j + 1;
          while (k < lines.length) {
            const propLine = lines[k];
            const propTrim = propLine.trim();
            if (!propTrim || propTrim.startsWith("#")) {
              k++;
              continue;
            }
            const propIndent = countIndent(propLine);
            if (propIndent <= dashCol) break;
            if (propTrim.startsWith("- ") || propTrim === "-") break;

            const propColon = findUnquotedColon(propTrim);
            if (propColon > 0) {
              const pKey = unquoteYamlString(
                propTrim.slice(0, propColon).trim()
              );
              const pVal = stripYamlComment(
                propTrim.slice(propColon + 1)
              ).trim();
              obj[pKey] = parseYamlScalarOrFlow(pVal, true);
            }
            k++;
          }
          items.push(obj);
          j = k;
          continue;
        }

        // Scalar list item: e.g. `- "[basic.lval]"` or unquoted `- [basic.lval]`
        items.push(parseYamlScalarOrFlow(afterDash, true));
        j++;
      } else {
        break;
      }
    }

    root[key] = items;
    i = j;
  }

  return root;
}

export function parseMarkdownWithFrontmatter(raw: string): {
  data: YamlObject;
  body: string;
} {
  const normalized = raw.replace(/\r\n?/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { data: {}, body: normalized.trim() };
  }
  return {
    data: parseFrontmatterYaml(match[1]),
    body: match[2].trim(),
  };
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

function normalizeStringList(val: YamlValue | undefined): string[] {
  if (!val) return [];
  if (typeof val === "string") {
    return val.trim() ? [val.trim()] : [];
  }
  if (!Array.isArray(val)) return [];
  const out: string[] = [];
  for (const item of val) {
    if (typeof item === "string") {
      const s = item.trim();
      if (s) out.push(s);
    } else if (Array.isArray(item) && item.length === 1 && typeof item[0] === "string") {
      // Unquoted YAML `- [basic.lval]` parsed in flow context
      const s = item[0].trim();
      if (s) out.push(s.startsWith("[") ? s : `[${s}]`);
    } else if (item !== null && typeof item !== "object") {
      out.push(String(item));
    }
  }
  return out;
}

function normalizeCppPath(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\/en\.cppreference\.com\/w\/cpp\//i, "")
    .replace(/^\/?w\/cpp\//i, "")
    .split("#")[0]
    .replace(/^\/+|\/+$/g, "");
}

let lowerCasePaths: Map<string, string[]> | undefined;

/** The imported page a topic link points at, if the snapshot has it. */
function resolveLocalReferencePath(cleanPath: string): string | undefined {
  let entry = getReferenceEntry("cpp", cleanPath);
  if (!entry) {
    if (!lowerCasePaths) {
      lowerCasePaths = new Map();
      for (const e of getReferenceIndex("cpp")) {
        const key = e.path.toLowerCase();
        lowerCasePaths.set(key, [...(lowerCasePaths.get(key) ?? []), e.path]);
      }
    }
    const candidates = lowerCasePaths.get(cleanPath.toLowerCase()) ?? [];
    if (candidates.length === 1) entry = getReferenceEntry("cpp", candidates[0]);
  }
  if (entry?.kind === "redirect" && entry.redirectTo !== undefined) {
    entry = getReferenceEntry("cpp", entry.redirectTo);
  }
  return entry && entry.kind !== "redirect" ? entry.path : undefined;
}

function normalizeCppRefList(val: YamlValue | undefined): CppRefLink[] {
  if (!Array.isArray(val)) return [];
  const out: CppRefLink[] = [];
  const seen = new Set<string>();

  for (const item of val) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const obj = item as YamlObject;
    const rawTarget =
      typeof obj.path === "string"
        ? obj.path
        : typeof obj.url === "string"
          ? obj.url
          : "";
    const cleanPath = normalizeCppPath(rawTarget);
    if (!cleanPath || seen.has(cleanPath)) continue;
    seen.add(cleanPath);

    const title =
      typeof obj.title === "string" && obj.title.trim()
        ? obj.title.trim()
        : cleanPath;

    // Link the offline copy when the snapshot has the page (following
    // cppreference redirects and case differences), cppreference.com otherwise.
    const local = resolveLocalReferencePath(cleanPath);
    out.push({
      title,
      path: local ?? cleanPath,
      href: local !== undefined ? referenceHref("cpp", local) : referenceLiveUrl("cpp", cleanPath),
      externalUrl: referenceLiveUrl("cpp", local ?? cleanPath),
      local: local !== undefined,
    });
  }

  return out;
}

function normalizeQuizKind(raw: unknown): TopicQuizKind {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "warmup" || s === "warm-up" || s === "subtle") return "warmup";
  if (s === "standardese" || s === "cppcon-stage") return "standardese";
  return "tricky";
}

function readTrackDefinitions(): TrackDefinition[] {
  try {
    if (!fs.existsSync(TRACKS_FILE)) return [];
    const raw = JSON.parse(fs.readFileSync(TRACKS_FILE, "utf8")) as
      | TrackDefinition[]
      | { tracks?: TrackDefinition[] };
    const list = Array.isArray(raw) ? raw : raw.tracks ?? [];
    return list.filter(
      (t) =>
        t &&
        typeof t.id === "string" &&
        typeof t.title === "string" &&
        Array.isArray(t.topics)
    );
  } catch {
    return [];
  }
}

function readTopicMap(slug: string): TopicMap | null {
  const mapFile = path.join(TOPICS_DIR, slug, "map.json");
  if (!fs.existsSync(mapFile)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(mapFile, "utf8")) as {
      root?: TopicMapNode;
    };
    if (!parsed?.root || typeof parsed.root.label !== "string") return null;
    return { root: parsed.root };
  } catch {
    return null;
  }
}

function readTopicQuiz(
  slug: string,
  topicTitle: string,
  trackId: string
): TopicQuizQuestion[] {
  const quizFile = path.join(TOPICS_DIR, slug, "quiz.json");
  if (!fs.existsSync(quizFile)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(quizFile, "utf8")) as
      | { questions?: Record<string, unknown>[] }
      | Record<string, unknown>[];
    const list = Array.isArray(parsed) ? parsed : parsed.questions ?? [];
    return list.map((q, idx) => {
      const options = Array.isArray(q.options) ? q.options.map(String) : [];
      const rawAns =
        typeof q.answer === "number"
          ? q.answer
          : typeof q.correctIndex === "number"
            ? q.correctIndex
            : 0;
      const answer =
        rawAns >= 0 && rawAns < options.length ? rawAns : 0;

      const refs = Array.isArray(q.refs)
        ? q.refs.map(String)
        : typeof q.refs === "string"
          ? [q.refs]
          : typeof q.standardClause === "string"
            ? [q.standardClause]
            : [];

      const code =
        typeof q.code === "string" && q.code.trim().length > 0
          ? q.code
          : undefined;

      return {
        id:
          typeof q.id === "string" && q.id.trim()
            ? q.id.trim()
            : `${slug}-q${idx + 1}`,
        kind: normalizeQuizKind(q.kind ?? q.difficulty ?? q.level),
        prompt: String(q.prompt ?? q.question ?? ""),
        code,
        options,
        answer,
        explanation: String(q.explanation ?? ""),
        refs,
        topicSlug: slug,
        topicTitle,
        trackId,
      };
    });
  } catch {
    return [];
  }
}

type TrackLookup = {
  defs: TrackDefinition[];
  trackById: Map<string, TrackDefinition>;
  trackBySlug: Map<string, TrackDefinition>;
  slugOrder: string[];
};

let trackLookupCache: TrackLookup | undefined;

function buildTrackLookup(): TrackLookup {
  if (process.env.NODE_ENV === "production") {
    trackLookupCache ??= readTrackLookup();
    return trackLookupCache;
  }
  return readTrackLookup();
}

function readTrackLookup(): TrackLookup {
  const defs = readTrackDefinitions();
  const trackById = new Map<string, TrackDefinition>();
  const trackBySlug = new Map<string, TrackDefinition>();
  const slugOrder: string[] = [];

  for (const def of defs) {
    trackById.set(def.id, def);
    for (const slug of def.topics) {
      if (!trackBySlug.has(slug)) {
        trackBySlug.set(slug, def);
        slugOrder.push(slug);
      }
    }
  }

  return { defs, trackById, trackBySlug, slugOrder };
}

function toTopicSummary(topic: Topic): TopicSummary {
  return {
    slug: topic.slug,
    title: topic.title,
    summary: topic.summary,
    trackId: topic.trackId,
    trackTitle: topic.trackTitle,
    minutes: topic.minutes,
    standard: topic.standard,
    cppreference: topic.cppreference,
    prerequisites: topic.prerequisites,
    simulator: topic.simulator,
    questionCount: topic.questions.length,
    questionIds: topic.questions.map((q) => q.id),
    map: topic.map,
  };
}

// ---------------------------------------------------------------------------
// Public Server API
// ---------------------------------------------------------------------------

// Topics are parsed once per production server/build process (every
// reference page asks which topics cover it); development re-reads files.
const topicCache = new Map<string, Topic | null>();
const MEMOIZE_TOPICS = process.env.NODE_ENV === "production";

export function getTopic(slug: string): Topic | null {
  if (!MEMOIZE_TOPICS) return readTopic(slug);
  if (!topicCache.has(slug)) topicCache.set(slug, readTopic(slug));
  return topicCache.get(slug) ?? null;
}

function readTopic(slug: string): Topic | null {
  if (!isSafeSlug(slug)) return null;
  const articleFile = path.join(TOPICS_DIR, slug, "article.md");
  if (!fs.existsSync(articleFile)) return null;

  let rawMd: string;
  try {
    rawMd = fs.readFileSync(articleFile, "utf8");
  } catch {
    return null;
  }

  const { data, body } = parseMarkdownWithFrontmatter(rawMd);
  const { trackById, trackBySlug } = buildTrackLookup();

  const fmTrackId =
    typeof data.track === "string" ? data.track.trim() : "";
  const resolvedTrack =
    trackById.get(fmTrackId) ?? trackBySlug.get(slug);
  const trackId = resolvedTrack?.id ?? (fmTrackId || "general");
  const trackTitle = resolvedTrack?.title ?? trackId;

  const title =
    typeof data.title === "string" && data.title.trim()
      ? data.title.trim()
      : slug.replace(/-/g, " ");
  const summary =
    typeof data.summary === "string" ? data.summary.trim() : "";
  const rawMinutes = Number(data.minutes);
  const minutes =
    Number.isFinite(rawMinutes) && rawMinutes > 0 ? Math.round(rawMinutes) : 8;

  const standard = normalizeStringList(data.standard);
  const cppreference = normalizeCppRefList(data.cppreference);
  const prerequisites = normalizeStringList(data.prerequisites);
  const simulator = getSimulatorForTopic(slug);
  const headings = extractHeadingsFromMarkdown(body);
  const map = readTopicMap(slug);
  const questions = readTopicQuiz(slug, title, trackId);

  return {
    slug,
    title,
    summary,
    trackId,
    trackTitle,
    minutes,
    standard,
    cppreference,
    prerequisites,
    simulator,
    body,
    headings,
    map,
    questions,
  };
}

export function getTracks(): TrackWithTopics[] {
  const { defs } = buildTrackLookup();
  const tracks: TrackWithTopics[] = [];

  for (const def of defs) {
    const topics: TopicSummary[] = [];
    for (const slug of def.topics) {
      const topic = getTopic(slug);
      if (topic) {
        topics.push(toTopicSummary(topic));
      }
    }
    tracks.push({
      id: def.id,
      title: def.title,
      description: def.description,
      topics,
    });
  }

  return tracks;
}

export function getAllTopics(): Topic[] {
  const { slugOrder } = buildTrackLookup();
  const seen = new Set<string>();
  const topics: Topic[] = [];

  for (const slug of slugOrder) {
    const topic = getTopic(slug);
    if (topic) {
      seen.add(slug);
      topics.push(topic);
    }
  }

  // Also include any valid topic folder on disk not listed in tracks.json
  if (fs.existsSync(TOPICS_DIR)) {
    try {
      const entries = fs.readdirSync(TOPICS_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (seen.has(entry.name)) continue;
        const topic = getTopic(entry.name);
        if (topic) topics.push(topic);
      }
    } catch {
      // Ignore directory read errors
    }
  }

  return topics;
}

export function getNeighbours(slug: string): TopicNeighbours {
  const all = getAllTopics();
  const idx = all.findIndex((t) => t.slug === slug);
  if (idx < 0) return { prev: null, next: null };

  return {
    prev: idx > 0 ? toTopicSummary(all[idx - 1]) : null,
    next: idx + 1 < all.length ? toTopicSummary(all[idx + 1]) : null,
  };
}

export function topicsForCppPath(pagePath: string): TopicSummary[] {
  const norm = normalizeCppPath(pagePath);
  if (!norm || norm === "index") return [];

  const all = getAllTopics();
  const matches: { summary: TopicSummary; rank: number }[] = [];

  for (const topic of all) {
    let bestRank = Infinity;
    for (const ref of topic.cppreference) {
      const refPath = normalizeCppPath(ref.path);
      if (!refPath) continue;
      if (refPath === norm) {
        bestRank = Math.min(bestRank, 0);
      } else if (norm.startsWith(`${refPath}/`)) {
        bestRank = Math.min(bestRank, 1);
      } else if (refPath.startsWith(`${norm}/`)) {
        bestRank = Math.min(bestRank, 2);
      }
    }
    if (bestRank < Infinity) {
      matches.push({ summary: toTopicSummary(topic), rank: bestRank });
    }
  }

  matches.sort((a, b) => a.rank - b.rank);
  return matches.map((m) => m.summary);
}

function appendMapOutlineLines(
  node: TopicMapNode,
  depth: number,
  lines: string[]
) {
  const indent = "  ".repeat(depth);
  lines.push(`${indent}- **${node.label}:** ${node.note}`);
  if (node.children) {
    for (const child of node.children) {
      appendMapOutlineLines(child, depth + 1, lines);
    }
  }
}

export function topicToMarkdown(
  topic: Topic,
  options?: { includeQuizAnswers?: boolean }
): string {
  const includeQuizAnswers = options?.includeQuizAnswers ?? true;
  const lines: string[] = [];

  lines.push(`# ${topic.title}`);
  lines.push("");
  if (topic.summary) {
    lines.push(`> ${topic.summary}`);
    lines.push("");
  }
  lines.push(`- **Track:** ${topic.trackTitle}`);
  lines.push(`- **Estimated reading time:** ${topic.minutes} minutes`);
  if (topic.standard.length > 0) {
    lines.push(
      `- **ISO C++ clauses:** ${topic.standard.map((s) => `${s} (${standardRefToUrl(s)})`).join(", ")}`
    );
  }
  if (topic.cppreference.length > 0) {
    lines.push(
      `- **cppreference links:** ${topic.cppreference.map((c) => `[${c.title}](${c.externalUrl})`).join(", ")}`
    );
  }
  if (topic.prerequisites.length > 0) {
    lines.push(`- **Prerequisites:** ${topic.prerequisites.join(", ")}`);
  }
  lines.push("");

  if (topic.body) {
    lines.push(topic.body);
    lines.push("");
  }

  if (topic.map) {
    lines.push("## Concept Map Outline");
    lines.push("");
    appendMapOutlineLines(topic.map.root, 0, lines);
    lines.push("");
  }

  if (topic.questions.length > 0) {
    lines.push("## Standardese Quiz Questions");
    lines.push("");
    topic.questions.forEach((q, idx) => {
      const refsLabel = q.refs.length > 0 ? ` (${q.refs.join(", ")})` : "";
      lines.push(`### Question ${idx + 1} [${q.kind}]${refsLabel}`);
      lines.push("");
      lines.push(q.prompt);
      if (q.code) {
        lines.push("");
        lines.push("```cpp");
        lines.push(q.code);
        lines.push("```");
      }
      lines.push("");
      q.options.forEach((opt, oi) => {
        lines.push(`${String.fromCharCode(65 + oi)}. ${opt}`);
      });
      lines.push("");
      if (includeQuizAnswers) {
        const letter = String.fromCharCode(65 + q.answer);
        lines.push(`**Answer (${letter}):** ${q.options[q.answer] ?? ""}`);
        if (q.explanation) {
          lines.push("");
          lines.push(`**Why:** ${q.explanation}`);
        }
        lines.push("");
      }
    });
  }

  return lines.join("\n").trimEnd() + "\n";
}

export function allTopicsToMarkdown(options?: {
  includeQuizAnswers?: boolean;
}): string {
  const tracks = getTracks().filter((t) => t.topics.length > 0);
  const all = getAllTopics();
  const topicBySlug = new Map(all.map((t) => [t.slug, t]));

  const lines: string[] = [
    "# C++ Atlas — Complete Study Guide",
    "",
    `> ${all.length} C++ deep-dive topics across ${tracks.length} tracks with concept maps and standard-lawyer quizzes.`,
    "",
    "## Contents",
    "",
  ];

  for (const track of tracks) {
    lines.push(`- **${track.title}**: ${track.topics.map((t) => t.title).join(", ")}`);
  }
  lines.push("");

  for (const track of tracks) {
    lines.push("---");
    lines.push("");
    lines.push(`# Track: ${track.title}`);
    lines.push("");
    lines.push(track.description);
    lines.push("");

    for (const summary of track.topics) {
      const full = topicBySlug.get(summary.slug);
      if (!full) continue;
      lines.push(topicToMarkdown(full, options).trimEnd());
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}

export function getDependents(slug: string): TopicSummary[] {
  if (!slug) return [];
  return getAllTopics()
    .filter((topic) => topic.prerequisites.includes(slug))
    .map(toTopicSummary);
}

export function getSimulatorForCppPath(
  pagePath: string
): SimulatorKind | undefined {
  const matches = topicsForCppPath(pagePath);
  for (const topic of matches) {
    if (topic.simulator) return topic.simulator;
  }
  return undefined;
}
