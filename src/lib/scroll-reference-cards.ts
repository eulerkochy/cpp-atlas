import {
  getReferenceEntry,
  getReferenceIndex,
  getReferenceMarkdown,
  referenceHref,
  type ReferenceIndexEntry,
} from "@/lib/reference";
import type {
  CodeStageBeat,
  ConceptStageBeat,
  ConceptStageEdge,
  ConceptStageNode,
  ScrollCaptionCue,
  ScrollCard,
  ScrollCardDifficulty,
  ScrollCardKind,
} from "@/lib/scroll-types";
import { TRACK_GROUPS } from "@/lib/track-groups";
import type { ReferenceLang } from "@/types/cpp";

// ---------------------------------------------------------------------------
// C++-safe markdown sanitization (matches scroll-corpus.ts, preserves snake_case & pointers)
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

function cleanText(raw: string): string {
  return stripMarkdownCppSafe(
    raw
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/^\s*>\s?/gm, "")
  )
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

function clampText(raw: string, maxLen: number): string {
  const text = cleanText(raw);
  if (text.length <= maxLen) return text;
  const slice = text.slice(0, maxLen - 1);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > maxLen * 0.55 ? slice.slice(0, lastSpace) : slice;
  return `${cut.replace(/[,;:\-–—\s]+$/, "")}…`;
}

function firstSentence(raw: string, maxLen = 140): string {
  const text = cleanText(raw);
  if (!text) return "";
  const m = text.match(/^.+?[.!?](?=\s|$)/);
  return clampText(m ? m[0] : text, maxLen);
}

function buildCaptions(texts: string[], durationSec: number): ScrollCaptionCue[] {
  const cleaned = texts.map((t) => cleanText(t)).filter(Boolean);
  if (cleaned.length === 0) return [];
  const step = durationSec / cleaned.length;
  return cleaned.map((text, idx) => ({
    startSec: Number((idx * step).toFixed(2)),
    endSec:
      idx === cleaned.length - 1
        ? durationSec
        : Number(((idx + 1) * step).toFixed(2)),
    text,
  }));
}

// ---------------------------------------------------------------------------
// Path-prefix -> C++ Atlas track & continent mapping
// ---------------------------------------------------------------------------

interface TrackMapping {
  trackId: string;
  trackTitle: string;
  continentId: string;
  continentLabel: string;
  accentHex: string;
}

const TRACK_TITLES: Record<string, string> = {
  "program-structure": "Program structure",
  "types-and-initialization": "Types and initialization",
  "value-semantics": "Value semantics",
  "expressions-and-functions": "Expressions and functions",
  classes: "Classes",
  templates: "Templates",
  errors: "Exceptions and error handling",
  "memory-model": "Memory model",
  concurrency: "Concurrency",
  containers: "Containers and strings",
  "algorithms-and-ranges": "Iterators, algorithms and ranges",
  utilities: "Library utilities",
  cpp26: "C++26",
};

const CONTINENT_ACCENT: Record<string, Record<"code" | "concept", string>> = {
  "language-basics": { concept: "#3b82f6", code: "#0ea5e9" },
  "building-abstractions": { concept: "#8b5cf6", code: "#a855f7" },
  "the-machine": { concept: "#f97316", code: "#ef4444" },
  "library-and-cpp26": { concept: "#10b981", code: "#14b8a6" },
};

function continentForTrack(trackId: string): { id: string; label: string } {
  for (const g of TRACK_GROUPS) {
    if (g.trackIds.includes(trackId)) return { id: g.id, label: g.label };
  }
  const last = TRACK_GROUPS[TRACK_GROUPS.length - 1];
  return { id: last.id, label: last.label };
}

function mapReferencePathToTrack(
  lang: ReferenceLang,
  entryPath: string,
  kind: "code" | "concept"
): TrackMapping {
  const lower = entryPath.toLowerCase();
  const top = lower.split("/")[0] ?? "";
  let trackId = "utilities";

  if (top === "memory" || top === "atomic" || top === "new") {
    trackId = "memory-model";
  } else if (top === "thread" || top === "coroutine") {
    trackId = "concurrency";
  } else if (top === "execution" || lower.includes("inplace_vector") || lower.includes("contracts") || lower.includes("hazard_pointer") || lower.includes("rcu")) {
    trackId = "cpp26";
  } else if (top === "container" || top === "string") {
    trackId = "containers";
  } else if (top === "ranges" || top === "algorithm" || top === "iterator") {
    trackId = "algorithms-and-ranges";
  } else if (top === "concepts") {
    trackId = "templates";
  } else if (top === "error") {
    trackId = "errors";
  } else if (top === "preprocessor" || top === "program" || top === "header") {
    trackId = "program-structure";
  } else if (top === "types") {
    trackId = lower.includes("numeric_limits") ? "utilities" : "templates";
  } else if (top === "language") {
    if (/move|copy|value_category|elision|reference/.test(lower)) {
      trackId = "value-semantics";
    } else if (/template|concept|sfinae|parameter_pack|fold|deduction|constraints/.test(lower)) {
      trackId = "templates";
    } else if (/class|virtual|inherit|constructor|destructor|member|override|final|friend|this|access/.test(lower)) {
      trackId = "classes";
    } else if (/lambda|overload|operator|eval_order|constexpr|consteval|function|adl/.test(lower)) {
      trackId = "expressions-and-functions";
    } else if (/exception|throw|try|noexcept/.test(lower)) {
      trackId = "errors";
    } else if (/lifetime|storage|align|memory_model|new|delete|ub|object/.test(lower)) {
      trackId = "memory-model";
    } else if (/coroutine/.test(lower)) {
      trackId = "concurrency";
    } else if (/module|namespace|linkage|lookup|translation|odr|attribute|inline/.test(lower)) {
      trackId = "program-structure";
    } else if (/contract|reflect|pack_index/.test(lower)) {
      trackId = "cpp26";
    } else {
      trackId = "types-and-initialization";
    }
  } else if (top === "utility") {
    if (/forward|move|exchange|swap/.test(lower)) trackId = "value-semantics";
    else if (/expected|optional|variant|any|tuple|pair|functional|format|bitset/.test(lower)) trackId = "utilities";
    else trackId = "utilities";
  } else if (top === "chrono" || top === "io" || top === "filesystem" || top === "numeric" || top === "regex" || top === "locale" || top === "text") {
    trackId = "utilities";
  } else if (lang === "c" && top === "variadic") {
    trackId = "expressions-and-functions";
  }

  const continent = continentForTrack(trackId);
  const accentHex =
    CONTINENT_ACCENT[continent.id]?.[kind] ??
    (kind === "code" ? "#0ea5e9" : "#3b82f6");

  return {
    trackId,
    trackTitle: TRACK_TITLES[trackId] ?? "Library utilities",
    continentId: continent.id,
    continentLabel: continent.label,
    accentHex,
  };
}

// ---------------------------------------------------------------------------
// Lazy index over all eligible C++ and C offline reference pages
// ---------------------------------------------------------------------------

interface IndexedRefEntry {
  lang: ReferenceLang;
  entry: ReferenceIndexEntry;
  id: string;
  sourcePath: string;
  trackId: string;
  continentId: string;
  priority: number;
}

const DOMAIN_PRIORITY: Record<string, number> = {
  language: 10,
  memory: 9,
  thread: 9,
  atomic: 9,
  ranges: 9,
  concepts: 9,
  coroutine: 9,
  execution: 9,
  container: 8,
  algorithm: 8,
  utility: 8,
  string: 8,
  iterator: 7,
  error: 7,
  chrono: 7,
  types: 7,
  numeric: 6,
  filesystem: 6,
  io: 6,
  preprocessor: 5,
  regex: 5,
  locale: 4,
  experimental: 2,
};

let indexedPoolCache: {
  ordered: IndexedRefEntry[];
  byTrack: Map<string, IndexedRefEntry[]>;
  byContinent: Map<string, IndexedRefEntry[]>;
} | null = null;

function buildReferenceIndex() {
  if (indexedPoolCache) return indexedPoolCache;

  const rawList: IndexedRefEntry[] = [];
  const langs: ReferenceLang[] = ["cpp", "c"];

  for (const lang of langs) {
    let entries: ReferenceIndexEntry[];
    try {
      entries = getReferenceIndex(lang);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.kind !== "page") continue;
      if (!entry.path || !entry.title) continue;
      if (entry.path.startsWith("compiler_support")) continue;
      // Skip sparse stubs lacking a meaningful summary
      if (!entry.summary || entry.summary.trim().length < 24) continue;

      const top = entry.path.split("/")[0]?.toLowerCase() ?? "";
      const mapping = mapReferencePathToTrack(lang, entry.path, "code");
      const basePriority =
        (DOMAIN_PRIORITY[top] ?? 5) + (lang === "cpp" ? 2 : 0);

      rawList.push({
        lang,
        entry,
        id: `ref:${lang}/${entry.path}`,
        sourcePath: `${lang}/${entry.path}`,
        trackId: mapping.trackId,
        continentId: mapping.continentId,
        priority: basePriority,
      });
    }
  }

  // Round-robin interleave across domains within high-priority C++ vs secondary C++/C tiers
  // so streaming batches naturally lead with iconic C++ domains (language, memory, ranges, thread...)
  const buckets = new Map<string, IndexedRefEntry[]>();
  for (const item of rawList) {
    const top = item.entry.path.split("/")[0] ?? "other";
    const tier =
      item.lang === "cpp" && item.priority >= 10
        ? "A"
        : item.lang === "cpp" && item.priority >= 8
          ? "B"
          : item.lang === "cpp"
            ? "C"
            : "D";
    const bucketKey = `${tier}:${item.lang}:${top}`;
    const list = buckets.get(bucketKey);
    if (list) list.push(item);
    else buckets.set(bucketKey, [item]);
  }

  const ordered: IndexedRefEntry[] = [];
  for (const tier of ["A", "B", "C", "D"]) {
    const tierKeys = Array.from(buckets.keys())
      .filter((k) => k.startsWith(`${tier}:`))
      .sort();
    const cursors = new Map<string, number>(tierKeys.map((k) => [k, 0]));
    let remaining = true;
    while (remaining) {
      remaining = false;
      for (const key of tierKeys) {
        const list = buckets.get(key)!;
        const pos = cursors.get(key)!;
        if (pos < list.length) {
          ordered.push(list[pos]);
          cursors.set(key, pos + 1);
          remaining = true;
        }
      }
    }
  }

  const byTrack = new Map<string, IndexedRefEntry[]>();
  const byContinent = new Map<string, IndexedRefEntry[]>();
  for (const item of ordered) {
    const tList = byTrack.get(item.trackId);
    if (tList) tList.push(item);
    else byTrack.set(item.trackId, [item]);

    const cList = byContinent.get(item.continentId);
    if (cList) cList.push(item);
    else byContinent.set(item.continentId, [item]);
  }

  indexedPoolCache = { ordered, byTrack, byContinent };
  return indexedPoolCache;
}

// ---------------------------------------------------------------------------
// On-demand markdown -> ScrollCard parser (memoized per page)
// ---------------------------------------------------------------------------

interface ParsedRefMarkdown {
  headerName?: string;
  standard?: string;
  declarationBlock?: string;
  exampleBlock?: string;
  leadParagraphs: string[];
  sections: Map<string, string>;
}

function normalizeCode(raw: string): string {
  const lines = raw
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, "  ")
    .split("\n")
    .map((l) => l.trimEnd());
  while (lines.length > 0 && !lines[0].trim()) lines.shift();
  while (lines.length > 0 && !lines[lines.length - 1].trim()) lines.pop();
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  if (nonEmpty.length === 0) return "";
  const minIndent = Math.min(
    ...nonEmpty.map((l) => {
      const m = l.match(/^ */);
      return m ? m[0].length : 0;
    })
  );
  return minIndent > 0
    ? lines.map((l) => l.slice(Math.min(minIndent, l.length))).join("\n")
    : lines.join("\n");
}

function compactCodeBlock(raw: string, maxLines = 15): string {
  const norm = normalizeCode(raw);
  const lines = norm.split("\n");
  if (lines.length <= maxLines) return norm;

  // Strip leading #include block if that makes the example fit cleanly
  let start = 0;
  while (start < lines.length && lines[start].trim().startsWith("#include")) {
    start++;
  }
  while (start < lines.length && lines[start].trim() === "") start++;
  const noInc = lines.slice(start);
  if (noInc.length >= 4 && noInc.length <= maxLines) {
    return noInc.join("\n");
  }

  // Otherwise take top maxLines cleanly, ending before a dangling partial comment
  return noInc.slice(0, maxLines).join("\n");
}

function detectRefStandard(md: string, lang: ReferenceLang): string | undefined {
  if (lang === "c") {
    if (/\(since C23\)|\(C23\)/.test(md)) return "C23";
    if (/\(since C17\)|\(C17\)/.test(md)) return "C17";
    if (/\(since C11\)|\(C11\)/.test(md)) return "C11";
    if (/\(since C99\)|\(C99\)/.test(md)) return "C99";
    return "ISO C";
  }
  if (/\(since C\+\+26\)|\(C\+\+26\)/.test(md)) return "C++26";
  if (/\(since C\+\+23\)|\(C\+\+23\)/.test(md)) return "C++23";
  if (/\(since C\+\+20\)|\(C\+\+20\)/.test(md)) return "C++20";
  if (/\(since C\+\+17\)|\(C\+\+17\)/.test(md)) return "C++17";
  if (/\(since C\+\+14\)|\(C\+\+14\)/.test(md)) return "C++14";
  if (/\(since C\+\+11\)|\(C\+\+11\)/.test(md)) return "C++11";
  return undefined;
}

function parseReferenceMarkdown(
  md: string,
  lang: ReferenceLang
): ParsedRefMarkdown {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const leadParagraphs: string[] = [];
  const sections = new Map<string, string>();
  let headerName: string | undefined;
  let declarationBlock: string | undefined;
  let exampleBlock: string | undefined;

  let currentSection = "__lead__";
  const sectionBuf: string[] = [];

  const flushSection = () => {
    const joined = cleanText(sectionBuf.join(" "));
    if (joined) {
      if (currentSection === "__lead__") {
        leadParagraphs.push(joined);
      } else if (!sections.has(currentSection)) {
        sections.set(currentSection, joined);
      }
    }
    sectionBuf.length = 0;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (i < 5 && (trimmed.startsWith("# ") || trimmed.startsWith("Source:"))) {
      i++;
      continue;
    }

    const hMatch = line.match(/^##\s+(.+?)\s*$/);
    if (hMatch) {
      flushSection();
      currentSection = cleanText(hMatch[1]).toLowerCase();
      i++;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const fenceLang = trimmed.slice(3).trim().toLowerCase();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence

      const rawCode = codeLines.join("\n");
      const headerMatch = rawCode.match(/Defined in header\s+<([^>]+)>/i);
      if (headerMatch && !headerName) {
        headerName = `<${headerMatch[1]}>`;
      }

      if (
        !declarationBlock &&
        currentSection === "__lead__" &&
        (fenceLang === "cpp" || fenceLang === "c" || fenceLang === "")
      ) {
        declarationBlock = normalizeCode(rawCode);
      } else if (
        !exampleBlock &&
        (currentSection === "example" || currentSection === "explanation") &&
        (fenceLang === "cpp" || fenceLang === "c")
      ) {
        const cleanedEx = normalizeCode(rawCode);
        if (cleanedEx.split("\n").length >= 4) {
          exampleBlock = cleanedEx;
        }
      }
      continue;
    }

    // Stop collecting noise once we hit References / See also / Defect reports
    if (
      currentSection === "see also" ||
      currentSection === "references" ||
      currentSection === "defect reports" ||
      currentSection === "external links"
    ) {
      i++;
      continue;
    }

    if (
      trimmed &&
      !trimmed.startsWith("|") &&
      !trimmed.startsWith("###") &&
      !trimmed.startsWith("**") &&
      sectionBuf.length < 6
    ) {
      sectionBuf.push(trimmed.replace(/^-\s+/, ""));
    }
    i++;
  }
  flushSection();

  return {
    headerName,
    standard: detectRefStandard(md, lang),
    declarationBlock,
    exampleBlock,
    leadParagraphs,
    sections,
  };
}

function buildReferenceCard(
  lang: ReferenceLang,
  entry: ReferenceIndexEntry
): ScrollCard | null {
  let md: string;
  try {
    md = getReferenceMarkdown(lang, entry);
  } catch {
    return null;
  }

  if (!md || md.length < 180) return null;

  const parsed = parseReferenceMarkdown(md, lang);
  const summaryBase =
    firstSentence(entry.summary, 200) ||
    firstSentence(parsed.leadParagraphs[0] ?? "", 200);
  if (!summaryBase || summaryBase.length < 20) return null;

  const complexityNote = parsed.sections.get("complexity");
  const exceptionsNote = parsed.sections.get("exceptions");
  const returnNote = parsed.sections.get("return value");
  const notesNote = parsed.sections.get("notes");
  const paramsNote = parsed.sections.get("parameters");

  // Prefer a crisp code card when we have a compact runnable example or signature block
  const candidateExample = parsed.exampleBlock
    ? compactCodeBlock(parsed.exampleBlock, 15)
    : undefined;
  const candidateDecl = parsed.declarationBlock
    ? compactCodeBlock(parsed.declarationBlock, 14)
    : undefined;

  const exampleLines = candidateExample?.split("\n") ?? [];
  const declLines = candidateDecl?.split("\n") ?? [];
  const useExample =
    exampleLines.length >= 4 &&
    exampleLines.length <= 15 &&
    Math.max(0, ...exampleLines.map((l) => l.length)) <= 96;
  const useDecl =
    !useExample &&
    declLines.length >= 2 &&
    declLines.length <= 14 &&
    Math.max(0, ...declLines.map((l) => l.length)) <= 104;

  const isCodeCard = useExample || useDecl;
  const cardKind: "code" | "concept" = isCodeCard ? "code" : "concept";
  const mapping = mapReferencePathToTrack(lang, entry.path, cardKind);

  const cleanTitle = clampText(entry.title, 68);
  const readHref = referenceHref(lang, entry.path);
  const sourcePath = `${lang}/${entry.path}`;
  const difficulty: ScrollCardDifficulty =
    parsed.standard === "C++26" || parsed.standard === "C++23"
      ? 3
      : parsed.standard === "C++20" || entry.path.startsWith("memory/") || entry.path.startsWith("atomic/")
        ? 2
        : 1;

  const tags = Array.from(
    new Set(
      [
        parsed.standard,
        parsed.headerName,
        lang === "c" ? "ISO C" : "cppreference",
        mapping.trackTitle,
      ].filter((t): t is string => Boolean(t && t.length <= 30))
    )
  ).slice(0, 5);

  if (isCodeCard) {
    const code = (useExample ? candidateExample : candidateDecl)!;
    const lines = code.split("\n");
    const nonEmpty = lines
      .map((l, i) => (l.trim() && l.trim() !== "{" && l.trim() !== "}" ? i + 1 : 0))
      .filter((n) => n > 0);
    if (nonEmpty.length === 0) return null;

    const beats: CodeStageBeat[] = [];
    const firstChunk = nonEmpty.slice(0, Math.min(3, nonEmpty.length));
    const midIdx = Math.floor(nonEmpty.length / 2);
    const midChunk = nonEmpty.slice(midIdx, Math.min(nonEmpty.length, midIdx + 3));
    const tailChunk = nonEmpty.slice(-Math.min(3, nonEmpty.length));

    const beat1Text = clampText(
      parsed.headerName
        ? `${parsed.headerName} · ${summaryBase}`
        : summaryBase,
      115
    );
    beats.push({
      title: useExample ? "Reference Example" : "ISO Signature",
      badge: parsed.headerName ?? (parsed.standard ?? "Spec"),
      highlightLines: firstChunk,
      annotation: beat1Text,
      caption: beat1Text,
    });

    const midDetail =
      firstSentence(returnNote ?? paramsNote ?? parsed.leadParagraphs[0] ?? summaryBase, 115) ||
      summaryBase;
    if (midChunk.join(",") !== firstChunk.join(",")) {
      beats.push({
        title: returnNote ? "Return & Semantics" : "Core Behavior",
        badge: "Semantics",
        highlightLines: midChunk,
        annotation: clampText(midDetail, 110),
        caption: clampText(midDetail, 130),
      });
    }

    const guarantee =
      complexityNote
        ? `Complexity: ${firstSentence(complexityNote, 100)}`
        : exceptionsNote
          ? `Exceptions: ${firstSentence(exceptionsNote, 100)}`
          : notesNote
            ? firstSentence(notesNote, 110)
            : `Full specification on ${readHref}.`;
    if (tailChunk.join(",") !== midChunk.join(",") && tailChunk.join(",") !== firstChunk.join(",")) {
      beats.push({
        title: complexityNote
          ? "Complexity"
          : exceptionsNote
            ? "Exception Safety"
            : "Key Note",
        badge: complexityNote ? "Big-O" : exceptionsNote ? "Noexcept" : "Spec",
        highlightLines: tailChunk,
        annotation: clampText(guarantee, 110),
        caption: clampText(guarantee, 130),
      });
    }

    const durationSec = Math.max(12, beats.length * 4);
    const slugLeaf = entry.path.split("/").pop()?.replace(/[^a-zA-Z0-9_]/g, "_") || "ref";

    return {
      id: `ref:${lang}/${entry.path}`,
      kind: "code",
      origin: "reference",
      sourcePath,
      title: cleanTitle,
      summary: clampText(summaryBase, 210),
      badgeLabel: lang === "c" ? "C Reference" : "cppreference",
      trackId: mapping.trackId,
      trackTitle: mapping.trackTitle,
      continentId: mapping.continentId,
      continentLabel: mapping.continentLabel,
      accentHex: mapping.accentHex,
      standard: parsed.standard,
      tags,
      prerequisites: [],
      readHref,
      readLabel: "Open reference",
      durationSec,
      difficulty,
      baseScore: 7.45,
      captions: buildCaptions(
        beats.map((b) => b.caption),
        durationSec
      ),
      stage: {
        type: "code",
        filename: `${slugLeaf.slice(0, 22)}.${lang === "c" ? "c" : "cpp"}`,
        language: "cpp",
        code,
        beats,
      },
    };
  }

  // Fallback: crisp 4-beat Concept Diagram extracted from the reference specification
  const branches: { label: string; note: string; edge: string }[] = [];
  if (parsed.headerName) {
    branches.push({
      label: `Header ${parsed.headerName}`,
      note: clampText(summaryBase, 110),
      edge: "header",
    });
  }
  if (paramsNote) {
    branches.push({
      label: "Parameters",
      note: firstSentence(paramsNote, 110),
      edge: "inputs",
    });
  }
  if (returnNote) {
    branches.push({
      label: "Return Value",
      note: firstSentence(returnNote, 110),
      edge: "returns",
    });
  }
  if (complexityNote) {
    branches.push({
      label: "Complexity",
      note: firstSentence(complexityNote, 110),
      edge: "cost",
    });
  }
  if (exceptionsNote && branches.length < 4) {
    branches.push({
      label: "Exceptions",
      note: firstSentence(exceptionsNote, 110),
      edge: "safety",
    });
  }
  if (notesNote && branches.length < 4) {
    branches.push({
      label: "Spec Notes",
      note: firstSentence(notesNote, 110),
      edge: "rule",
    });
  }
  if (branches.length < 3) {
    for (const [secName, secText] of parsed.sections.entries()) {
      if (branches.length >= 4) break;
      if (secName === "example") continue;
      const cap = secName[0].toUpperCase() + secName.slice(1);
      if (branches.some((b) => b.label.toLowerCase() === secName)) continue;
      branches.push({
        label: clampText(cap, 24),
        note: firstSentence(secText, 110),
        edge: "detail",
      });
    }
  }
  if (branches.length < 2) return null;

  const picked = branches.slice(0, 4);
  const nodes: ConceptStageNode[] = [
    {
      id: "n0",
      label: clampText(cleanTitle, 28),
      sub: clampText(summaryBase, 44),
      group: "root",
    },
    ...picked.map((b, idx) => ({
      id: `b${idx}`,
      label: clampText(b.label, 26),
      sub: clampText(b.note, 42),
      group: "branch",
    })),
  ];

  const edges: ConceptStageEdge[] = picked.map((b, idx) => ({
    from: "n0",
    to: `b${idx}`,
    label: b.edge,
  }));

  const beats: ConceptStageBeat[] = [
    {
      title: clampText(cleanTitle, 34),
      caption: clampText(summaryBase, 136),
      activeNodeIds: nodes.map((n) => n.id),
      highlightEdgeIndices: edges.map((_, i) => i),
      callout: parsed.headerName
        ? `${parsed.headerName} · ${parsed.standard ?? "ISO C++"}`
        : `${mapping.trackTitle} · Reference`,
    },
    ...picked.slice(0, 3).map((b, idx) => ({
      title: clampText(b.label, 34),
      caption: clampText(b.note, 136),
      activeNodeIds: ["n0", `b${idx}`],
      highlightEdgeIndices: [idx],
      callout: clampText(b.note, 88),
    })),
  ];

  const durationSec = beats.length >= 4 ? 14 : 12;

  return {
    id: `ref:${lang}/${entry.path}`,
    kind: "concept",
    origin: "reference",
    sourcePath,
    title: cleanTitle,
    summary: clampText(summaryBase, 210),
    badgeLabel: lang === "c" ? "C Reference" : "cppreference",
    trackId: mapping.trackId,
    trackTitle: mapping.trackTitle,
    continentId: mapping.continentId,
    continentLabel: mapping.continentLabel,
    accentHex: mapping.accentHex,
    standard: parsed.standard,
    tags,
    prerequisites: [],
    readHref,
    readLabel: "Open reference",
    durationSec,
    difficulty,
    baseScore: 7.35,
    captions: buildCaptions(
      beats.map((b) => b.caption),
      durationSec
    ),
    stage: {
      type: "concept",
      nodes,
      edges,
      beats,
    },
  };
}

// Bounded in-memory cache of parsed reference cards (LRU eviction at 1,500 entries)
const MAX_REF_CACHE = 1500;
const parsedRefCache = new Map<string, ScrollCard | null>();

function getOrParseReferenceCard(
  lang: ReferenceLang,
  entry: ReferenceIndexEntry
): ScrollCard | null {
  const key = `${lang}/${entry.path}`;
  if (parsedRefCache.has(key)) {
    const val = parsedRefCache.get(key) ?? null;
    // Touch LRU order
    parsedRefCache.delete(key);
    parsedRefCache.set(key, val);
    return val;
  }

  const card = buildReferenceCard(lang, entry);
  if (parsedRefCache.size >= MAX_REF_CACHE) {
    const oldestKey = parsedRefCache.keys().next().value;
    if (oldestKey !== undefined) parsedRefCache.delete(oldestKey);
  }
  parsedRefCache.set(key, card);
  return card;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getReferencePoolCount(): number {
  return buildReferenceIndex().ordered.length;
}

export function getReferenceScrollCardById(id: string): ScrollCard | undefined {
  if (!id.startsWith("ref:")) return undefined;
  const rest = id.slice("ref:".length).replace(/^\/+/, "");
  if (!rest) return undefined;

  if (rest.startsWith("cpp/")) {
    const p = rest.slice("cpp/".length);
    const entry = getReferenceEntry("cpp", p);
    return entry && entry.kind !== "redirect"
      ? (getOrParseReferenceCard("cpp", entry) ?? undefined)
      : undefined;
  }

  if (rest.startsWith("c/")) {
    const p = rest.slice("c/".length);
    const entry = getReferenceEntry("c", p);
    return entry && entry.kind !== "redirect"
      ? (getOrParseReferenceCard("c", entry) ?? undefined)
      : undefined;
  }

  // Shorthand `ref:<path>` -> resolve against C++ reference first, then C reference
  const cppEntry = getReferenceEntry("cpp", rest);
  if (cppEntry && cppEntry.kind !== "redirect") {
    const card = getOrParseReferenceCard("cpp", cppEntry);
    if (card) return card;
  }
  const cEntry = getReferenceEntry("c", rest);
  if (cEntry && cEntry.kind !== "redirect") {
    const card = getOrParseReferenceCard("c", cEntry);
    if (card) return card;
  }
  return undefined;
}

export interface ReferenceBatchOptions {
  cursor?: number;
  limit?: number;
  trackId?: string;
  kind?: ScrollCardKind;
  excludeIds?: Set<string>;
  seed?: number;
}

export interface ReferenceBatchResult {
  cards: ScrollCard[];
  nextCursor: number | null;
  total: number;
}

export function getReferenceScrollBatch(
  options: ReferenceBatchOptions = {}
): ReferenceBatchResult {
  const { ordered, byTrack, byContinent } = buildReferenceIndex();
  const trackKey =
    options.trackId && options.trackId !== "all" ? options.trackId : undefined;
  const list = trackKey
    ? (byTrack.get(trackKey) ?? byContinent.get(trackKey) ?? [])
    : ordered;

  const total = list.length;
  if (total === 0) {
    return { cards: [], nextCursor: null, total: 0 };
  }

  const limit = Math.min(Math.max(options.limit ?? 24, 1), 100);
  const startCursor = Math.max(0, Math.min(options.cursor ?? 0, total));
  const seedOffset =
    options.seed && Number.isFinite(options.seed)
      ? Math.abs(Math.floor(options.seed)) % total
      : 0;

  const cards: ScrollCard[] = [];
  let scanned = 0;
  let pos = startCursor;
  // Cap per-request disk reads cleanly so one call never blocks the event loop
  const maxScans = Math.min(total - startCursor, Math.max(limit * 4, 80));

  while (pos < total && cards.length < limit && scanned < maxScans) {
    const idx = (pos + seedOffset) % total;
    const item = list[idx];
    pos++;
    scanned++;

    if (options.excludeIds?.has(item.id)) continue;
    const card = getOrParseReferenceCard(item.lang, item.entry);
    if (!card) continue;
    if (options.kind && card.kind !== options.kind) continue;

    cards.push(card);
  }

  const nextCursor = pos < total ? pos : null;
  return { cards, nextCursor, total };
}
