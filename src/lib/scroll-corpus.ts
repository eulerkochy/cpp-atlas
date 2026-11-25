import {
  buildContainerScenarios,
  type VecHistoryEntry,
} from "@/components/memory-maps/scenarios/container-invalidation";
import { COROUTINE_FRAME_SCENARIOS } from "@/components/memory-maps/scenarios/coroutine-frame";
import { buildCpp26Scenarios } from "@/components/memory-maps/scenarios/cpp26-preview";
import { buildLambdaClosureScenarios } from "@/components/memory-maps/scenarios/lambda-closures";
import { buildMemoryModelScenarios } from "@/components/memory-maps/scenarios/memory-model";
import { buildMoveForwardingScenarios } from "@/components/memory-maps/scenarios/move-forwarding";
import { OBJECT_LIFETIME_SCENARIOS } from "@/components/memory-maps/scenarios/object-lifetime";
import { buildOverloadLookupScenarios } from "@/components/memory-maps/scenarios/overload-lookup";
import {
  buildSmartPointerScenarios,
  type SharedHistoryEntry,
} from "@/components/memory-maps/scenarios/smart-pointers";
import { TEMPLATES_CONCEPTS_SCENARIOS } from "@/components/memory-maps/scenarios/templates-concepts";
import { VALUE_CATEGORY_SCENARIOS } from "@/components/memory-maps/scenarios/value-categories";
import { VTABLE_LAYOUT_SCENARIOS } from "@/components/memory-maps/scenarios/vtable-layout";
import type { RadScenario } from "@/components/rad-debugger/types";
import { STANDARDS_MILESTONES, type StandardMilestone } from "@/data/standards-evolution";
import { getAllQuizQuestions } from "@/lib/quiz-bank";
import { getProceduralScrollCards } from "@/lib/scroll-procedural";
import {
  getReferencePoolCount,
  getReferenceScrollCardById,
} from "@/lib/scroll-reference-cards";
import { getAllTopics, getTracks } from "@/lib/topics";
import { TRACK_GROUPS } from "@/lib/track-groups";
import type {
  CodeStageBeat,
  ConceptStageBeat,
  ConceptStageEdge,
  ConceptStageNode,
  EvolutionStageBeat,
  ScrollCaptionCue,
  ScrollCard,
  ScrollCardDifficulty,
  ScrollCardKind,
  ScrollFeedMeta,
  ScrollFeedTrackMeta,
} from "@/lib/scroll-types";
import type { MemoryMapKind, QuizQuestion } from "@/types/cpp";
import {
  SIMULATOR_BY_TOPIC,
  slugifyHeading,
  type Topic,
  type TopicMapNode,
} from "@/types/topics";

// ---------------------------------------------------------------------------
// Visual & domain metadata
// ---------------------------------------------------------------------------

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

const FLAGSHIP_SLUGS = new Set([
  "value-categories",
  "copy-elision",
  "copy-and-move",
  "reference-binding-and-temporaries",
  "object-lifetime-and-storage",
  "strict-aliasing-and-undefined-behavior",
  "atomics-and-memory-ordering",
  "smart-pointers",
  "sfinae-and-concepts",
  "forwarding-references-and-perfect-forwarding",
  "coroutines",
  "lambdas",
  "overload-resolution",
  "raii-and-resource-management",
  "ranges-and-views",
  "contracts",
  "reflection",
  "senders-and-receivers",
  "crtp-and-deducing-this",
  "containers-and-iterator-invalidation",
]);

const COMPANION_PRIMARY_SLUG: Record<MemoryMapKind, string> = {
  "value-categories": "value-categories",
  "memory-model": "atomics-and-memory-ordering",
  "object-lifetime": "object-lifetime-and-storage",
  "move-and-forwarding": "forwarding-references-and-perfect-forwarding",
  "templates-and-concepts": "sfinae-and-concepts",
  "coroutine-frame": "coroutines",
  "vtable-layout": "inheritance-and-virtual-functions",
  "container-invalidation": "containers-and-iterator-invalidation",
  "smart-pointers": "smart-pointers",
  "overload-lookup": "overload-resolution",
  "cpp26-preview": "cpp26-contracts-reflection-execution",
  "lambda-closures": "lambdas",
};

// ---------------------------------------------------------------------------
// Text sanitization & timing helpers
// ---------------------------------------------------------------------------

function stripMarkdownCppSafe(raw: string): string {
  // 1. Protect inline backticked code spans so C++ underscores (unique_ptr,
  //    uint32_t, reinterpret_cast) and pointer asterisks (int*, const char*)
  //    inside code are never touched by emphasis stripping.
  const codeSpans: string[] = [];
  const protectedCode = raw.replace(/(`+)([^`]*?)\1/g, (_m, _ticks: string, inner: string) => {
    const idx = codeSpans.push(inner) - 1;
    return `\u0000CODE${idx}\u0000`;
  });

  // 2. Strip markdown links, emphasis (word-boundary safe for snake_case & pointers), and escapes
  const stripped = protectedCode
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/~~([^~\n]+?)~~/g, "$1")
    .replace(/\*\*(?!\s)([^*\n]+?)(?<!\s)\*\*/g, "$1")
    .replace(/(?<![\w])__(?!\s)([^_\n]+?)(?<!\s)__(?![\w])/g, "$1")
    .replace(/(?<![\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])/g, "$1")
    .replace(/(?<![\w])_(?!\s)([^_\n]+?)(?<!\s)_(?![\w])/g, "$1")
    .replace(/\\([\\`*_{}[\]()#+\-.!|>])/g, "$1");

  // 3. Restore code spans verbatim without their surrounding backticks
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
  const slice = text.slice(0, maxLen - 1);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > maxLen * 0.55 ? slice.slice(0, lastSpace) : slice;
  return `${cut.replace(/[,;:\-–—\s]+$/, "")}…`;
}

function firstSentence(raw: string, maxLen = 150): string {
  const cleaned = cleanPlainText(raw);
  if (!cleaned) return "";
  const match = cleaned.match(/^.+?[.!?](?=\s|$)/);
  const candidate = match ? match[0] : cleaned;
  return clampText(candidate, maxLen);
}

function buildEvenCaptions(texts: string[], durationSec: number): ScrollCaptionCue[] {
  const cleaned = texts.map((t) => cleanPlainText(t)).filter(Boolean);
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

function detectStandardEra(
  text: string,
  trackId: string,
  fallback?: string
): string | undefined {
  if (fallback) return fallback;
  if (trackId === "cpp26" || /\bC\+\+26\b|P2900|P2996|P2300|\^\^|contract_assert|\[\[indeterminate\]\]|inplace_vector|function_ref/.test(text)) {
    return "C++26";
  }
  if (/\bC\+\+23\b|std::expected|std::print|std::println|this\s+Self|start_lifetime_as|P2266|P0847/.test(text)) {
    return "C++23";
  }
  if (/\bC\+\+20\b|co_await|co_yield|co_return|\bconcept\b|std::ranges|std::views|std::jthread|std::span|operator<=>|consteval|constinit/.test(text)) {
    return "C++20";
  }
  if (/\bC\+\+17\b|if constexpr|std::string_view|std::optional|std::variant|std::launder|guaranteed copy elision|structured binding/i.test(text)) {
    return "C++17";
  }
  if (/\bC\+\+14\b|std::make_unique|decltype\(auto\)|is_transparent|shared_timed_mutex/.test(text)) {
    return "C++14";
  }
  if (/\bC\+\+11\b|std::unique_ptr|std::shared_ptr|std::atomic|std::move|std::forward|constexpr|noexcept|rvalue reference/i.test(text)) {
    return "C++11";
  }
  return undefined;
}

function inferTopicDifficulty(topic: Topic): ScrollCardDifficulty {
  if (
    topic.minutes >= 12 ||
    topic.trackId === "memory-model" ||
    topic.trackId === "concurrency" ||
    topic.trackId === "cpp26" ||
    topic.prerequisites.length >= 3
  ) {
    return 3;
  }
  if (topic.prerequisites.length === 0 && topic.minutes <= 9) {
    return 1;
  }
  return 2;
}

function dedupeTags(items: (string | undefined)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    if (!raw) continue;
    const cleaned = cleanPlainText(raw);
    if (!cleaned || cleaned.length > 34) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= 6) break;
  }
  return out;
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

// ---------------------------------------------------------------------------
// Markdown article parsing (sections, pitfalls, and code blocks)
// ---------------------------------------------------------------------------

interface ExtractedCodeBlock {
  sectionTitle: string;
  sectionSlug: string;
  code: string;
  lineCount: number;
  maxLineWidth: number;
  commentLines: number[];
  prevParagraph: string;
  nextParagraph: string;
  pitfall: string;
  score: number;
}

function extractPitfallsFromBody(body: string): string[] {
  const pitfalls: string[] = [];
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  let current: string[] = [];

  const flush = () => {
    if (current.length === 0) return;
    const text = cleanPlainText(current.join(" "));
    if (/^(Pitfall|Gotcha|Warning|Trap|Key rule|Important|Remember)\b/i.test(text)) {
      pitfalls.push(text.replace(/^(Pitfall|Gotcha|Warning|Trap|Key rule|Important|Remember)[.:]?\s*/i, ""));
    }
    current = [];
  };

  for (const line of lines) {
    if (line.trim().startsWith(">")) {
      current.push(line.trim().replace(/^>\s?/, ""));
    } else {
      flush();
    }
  }
  flush();
  return pitfalls;
}

function normalizeCodeSnippet(raw: string): string {
  const lines = raw
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, "  ")
    .split("\n")
    .map((line) => line.trimEnd());

  while (lines.length > 0 && lines[0].trim() === "") lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();

  // Strip common leading indentation if every non-empty line is indented.
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  if (nonEmpty.length === 0) return "";
  const minIndent = Math.min(
    ...nonEmpty.map((l) => {
      const m = l.match(/^ */);
      return m ? m[0].length : 0;
    })
  );
  if (minIndent > 0) {
    return lines.map((l) => l.slice(Math.min(minIndent, l.length))).join("\n");
  }
  return lines.join("\n");
}

function stripBoilerplateIncludes(code: string, maxLines: number): string {
  const lines = code.split("\n");
  if (lines.length <= maxLines) return code;

  // Drop leading #include lines and their immediately following blank line.
  let idx = 0;
  while (
    idx < lines.length &&
    (lines[idx].trim().startsWith("#include") ||
      lines[idx].trim().startsWith("// C++26"))
  ) {
    idx++;
  }
  while (idx < lines.length && lines[idx].trim() === "") {
    idx++;
  }
  const trimmed = lines.slice(idx);
  if (trimmed.length >= 4 && trimmed.length <= maxLines) {
    return trimmed.join("\n");
  }
  return trimmed.length >= 4 ? trimmed.join("\n") : code;
}

function extractArticleCodeBlocks(topic: Topic): ExtractedCodeBlock[] {
  const lines = topic.body.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ExtractedCodeBlock[] = [];

  let currentHeading = topic.title;
  let currentSlug = "";
  let prevParaLines: string[] = [];
  let sectionPitfall = "";

  const headingCounts = new Map<string, number>();
  const nextHeadingSlug = (text: string): string => {
    const base = slugifyHeading(text);
    const prev = headingCounts.get(base) ?? 0;
    headingCounts.set(base, prev + 1);
    return prev === 0 ? base : `${base}-${prev + 1}`;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    const hMatch = line.match(/^(#{2,3})\s+(.+?)\s*#*\s*$/);
    if (hMatch) {
      currentHeading = cleanPlainText(hMatch[2]);
      currentSlug = nextHeadingSlug(currentHeading);
      prevParaLines = [];
      sectionPitfall = "";
      i++;
      continue;
    }

    if (trimmed.startsWith(">")) {
      const bqLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        bqLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      const bqText = cleanPlainText(bqLines.join(" "));
      if (/^(Pitfall|Warning|Trap|Gotcha)/i.test(bqText)) {
        sectionPitfall = bqText.replace(/^(Pitfall|Warning|Trap|Gotcha)[.:]?\s*/i, "");
      }
      continue;
    }

    const fenceMatch = trimmed.match(/^```(cpp|c\+\+)\s*$/i);
    if (fenceMatch) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence

      // Peek immediately following prose paragraph
      const nextParaLines: string[] = [];
      let j = i;
      while (j < lines.length && lines[j].trim() === "") j++;
      while (
        j < lines.length &&
        lines[j].trim() !== "" &&
        !lines[j].trim().startsWith("#") &&
        !lines[j].trim().startsWith("```") &&
        !lines[j].trim().startsWith("|") &&
        !lines[j].trim().startsWith(">")
      ) {
        nextParaLines.push(lines[j].trim());
        j++;
      }

      const rawCode = normalizeCodeSnippet(codeLines.join("\n"));
      const code = stripBoilerplateIncludes(rawCode, 16);
      const splitLines = code.split("\n");
      const lineCount = splitLines.length;
      const maxLineWidth = Math.max(0, ...splitLines.map((l) => l.length));

      const looksLikeCpp =
        /[;{}]/.test(code) &&
        /\b(struct|class|template|auto|int|void|return|static_assert|std::|constexpr|concept|co_|const|using|enum|namespace)\b/.test(
          code
        );

      if (looksLikeCpp && lineCount >= 4 && lineCount <= 18 && maxLineWidth <= 104) {
        const commentLines: number[] = [];
        splitLines.forEach((l, idx) => {
          if (/\/\/\s*\S+/.test(l)) {
            commentLines.push(idx + 1);
          }
        });

        let score = 5.0;
        if (lineCount >= 5 && lineCount <= 13) score += 2.2;
        else if (lineCount <= 16) score += 1.2;
        if (maxLineWidth <= 76) score += 1.2;
        else if (maxLineWidth <= 88) score += 0.5;
        score += Math.min(commentLines.length, 4) * 0.9;
        if (/static_assert|std::move|std::forward|std::launder|co_await|concept |requires |pre\(|post\(|\^\^/.test(code)) {
          score += 1.1;
        }
        if (nextParaLines.length > 0) score += 0.5;
        if (prevParaLines.length > 0) score += 0.4;

        blocks.push({
          sectionTitle: currentHeading,
          sectionSlug: currentSlug,
          code,
          lineCount,
          maxLineWidth,
          commentLines,
          prevParagraph: cleanPlainText(prevParaLines.join(" ")),
          nextParagraph: cleanPlainText(nextParaLines.join(" ")),
          pitfall: sectionPitfall,
          score,
        });
      }

      prevParaLines = [];
      continue;
    }

    if (trimmed === "" || trimmed.startsWith("|") || trimmed.startsWith("```")) {
      if (trimmed.startsWith("```")) {
        // Skip non-cpp code block cleanly
        i++;
        while (i < lines.length && !lines[i].trim().startsWith("```")) i++;
      } else if (trimmed === "" && prevParaLines.length > 0) {
        // Keep last non-empty paragraph before a fence if separated by 1 blank line
      }
      i++;
      continue;
    }

    if (!trimmed.startsWith("-") && !trimmed.startsWith("*")) {
      prevParaLines.push(trimmed);
      if (prevParaLines.length > 6) prevParaLines.shift();
    }
    i++;
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// 1. Concept Diagram Explainers (115 topics)
// ---------------------------------------------------------------------------

function inferEdgeLabel(label: string, idx: number): string {
  const lower = label.toLowerCase();
  if (/pitfall|trap|ub|danger|hazard|bug|error|dangling|invalid/.test(lower)) return "watch";
  if (/c\+\+2[036]|evolution|modern|new/.test(lower)) return "modern";
  if (/rule|order|guarantee|contract|invariant|constraint/.test(lower)) return "rule";
  if (/lifetime|storage|layout|memory|alloc/.test(lower)) return "memory";
  if (/vs\b|versus|axis|axes|category|kind|form/.test(lower)) return "split";
  const defaults = ["pillar", "mechanism", "rule", "edge case"];
  return defaults[idx % defaults.length];
}

function buildConceptCard(
  topic: Topic,
  continent: { id: string; label: string }
): ScrollCard {
  const pitfalls = extractPitfallsFromBody(topic.body);
  const nodes: ConceptStageNode[] = [];
  const edges: ConceptStageEdge[] = [];
  const beats: ConceptStageBeat[] = [];

  const root: TopicMapNode = topic.map?.root ?? {
    label: topic.title,
    note: topic.summary || `Mental model for ${topic.title}.`,
    children: topic.headings.slice(0, 4).map((h) => ({
      label: h.text,
      note: `Core rule covered under ${h.text}.`,
    })),
  };

  nodes.push({
    id: "n0",
    label: clampText(root.label, 30),
    sub: clampText(root.note, 46),
    group: "root",
  });

  const primaryBranches = (root.children ?? []).slice(0, 4);
  const branchIds: string[] = [];
  const rootEdgeIndices: number[] = [];
  const branchLeafMap = new Map<string, { leafId: string; edgeIdx: number; leaf: TopicMapNode }>();

  primaryBranches.forEach((branch, idx) => {
    const branchId = `b${idx}`;
    branchIds.push(branchId);
    nodes.push({
      id: branchId,
      label: clampText(branch.label, 28),
      sub: clampText(branch.note, 44),
      group: "branch",
    });
    const edgeIdx = edges.length;
    edges.push({
      from: "n0",
      to: branchId,
      label: inferEdgeLabel(branch.label, idx),
    });
    rootEdgeIndices.push(edgeIdx);

    const leadChild = branch.children?.[0];
    if (leadChild && idx < 4) {
      const leafId = `l${idx}`;
      nodes.push({
        id: leafId,
        label: clampText(leadChild.label, 26),
        sub: clampText(leadChild.note, 42),
        group: "leaf",
      });
      const leafEdgeIdx = edges.length;
      edges.push({
        from: branchId,
        to: leafId,
      });
      branchLeafMap.set(branchId, { leafId, edgeIdx: leafEdgeIdx, leaf: leadChild });
    }
  });

  // Beat 1: Big-picture mental model
  const overviewCaption = cleanPlainText(root.note || topic.summary);
  beats.push({
    title: clampText(root.label, 36),
    caption: clampText(overviewCaption, 138),
    activeNodeIds: ["n0", ...branchIds],
    highlightEdgeIndices: rootEdgeIndices,
    callout: topic.standard[0]
      ? `ISO ${topic.standard[0]} · ${topic.trackTitle}`
      : `${topic.trackTitle} · ${primaryBranches.length} core pillars`,
  });

  // Beats 2..4 (or 2..5): Walk each primary branch and illuminate its leaf
  primaryBranches.forEach((branch, idx) => {
    const branchId = `b${idx}`;
    const leafInfo = branchLeafMap.get(branchId);
    const activeNodeIds = leafInfo
      ? ["n0", branchId, leafInfo.leafId]
      : ["n0", branchId];
    const highlightEdgeIndices = leafInfo
      ? [rootEdgeIndices[idx], leafInfo.edgeIdx]
      : [rootEdgeIndices[idx]];

    const extraSibling = branch.children?.[1];
    const callout = leafInfo
      ? clampText(`${leafInfo.leaf.label}: ${leafInfo.leaf.note}`, 88)
      : extraSibling
        ? clampText(`${extraSibling.label}: ${extraSibling.note}`, 88)
        : clampText(branch.note, 88);

    beats.push({
      title: clampText(branch.label, 38),
      caption: clampText(branch.note, 138),
      activeNodeIds,
      highlightEdgeIndices,
      callout,
    });
  });

  // Ensure 4-5 crisp beats: if fewer than 4, add synthesis beat; if 5 already, keep 5.
  if (beats.length < 4) {
    const takeaway = pitfalls[0] ?? topic.summary;
    beats.push({
      title: "Key Invariant",
      caption: clampText(takeaway, 138),
      activeNodeIds: nodes.map((n) => n.id),
      highlightEdgeIndices: edges.map((_, i) => i),
      callout: clampText(takeaway, 88),
    });
  } else if (pitfalls[0] && beats.length === 5) {
    // Enrich final beat's callout with a real pitfall warning if concise
    beats[beats.length - 1] = {
      ...beats[beats.length - 1],
      callout: clampText(`Watch out: ${pitfalls[0]}`, 92),
    };
  }

  const durationSec = beats.length >= 5 ? 16 : 14;
  const captions = buildEvenCaptions(
    beats.map((b) => b.caption),
    durationSec
  );

  const standard = detectStandardEra(
    `${topic.title} ${topic.summary} ${topic.standard.join(" ")}`,
    topic.trackId
  );

  const baseScore =
    (FLAGSHIP_SLUGS.has(topic.slug) ? 9.1 : 7.8) +
    (topic.simulator ? 0.45 : 0) +
    Math.min(topic.standard.length, 3) * 0.1;

  return {
    id: `concept:${topic.slug}`,
    kind: "concept",
    origin: "core",
    sourcePath: `topics/${topic.slug}`,
    title: topic.title,
    summary: clampText(topic.summary || overviewCaption, 220),
    badgeLabel: "Visual Explainer",
    trackId: topic.trackId,
    trackTitle: topic.trackTitle,
    continentId: continent.id,
    continentLabel: continent.label,
    accentHex: getAccentHex(continent.id, "concept"),
    standard,
    tags: dedupeTags([
      standard,
      topic.trackTitle,
      topic.standard[0],
      primaryBranches[0]?.label,
      primaryBranches[1]?.label,
    ]),
    prerequisites: [...topic.prerequisites],
    topicSlug: topic.slug,
    readHref: `/topics/${topic.slug}`,
    readLabel: "Read guide",
    durationSec,
    difficulty: inferTopicDifficulty(topic),
    baseScore: Number(baseScore.toFixed(2)),
    captions,
    stage: {
      type: "concept",
      nodes,
      edges,
      beats,
    },
  };
}

// ---------------------------------------------------------------------------
// 2. Stepped Code Walkthroughs (extracted from real topic articles)
// ---------------------------------------------------------------------------

function capitalizeAnnotation(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  // Preserve lowercase C++ identifiers/keywords at the start of an annotation
  if (
    /^(std::|decltype|constexpr|consteval|constinit|noexcept|co_|operator|pre\(|post\(|int\b|void\b|auto\b|const\b|struct\b|class\b|template\b|return\b|[a-z_][a-zA-Z0-9_]*(\.|->|\(|::))/.test(
      s
    )
  ) {
    return s;
  }
  return s[0].toUpperCase() + s.slice(1);
}

function extractInlineComment(line: string): string | null {
  const lastIdx = line.lastIndexOf("//");
  if (lastIdx < 0) return null;
  const text = line.slice(lastIdx + 2).trim();
  if (text.length < 4 || /^[-=]+$/.test(text)) return null;
  return capitalizeAnnotation(text);
}

function shortenTopicPrefix(title: string): string {
  const beforeColon = title.split(":")[0].trim();
  if (beforeColon.length <= 26) return beforeColon;
  const beforeComma = beforeColon.split(",")[0].trim();
  if (beforeComma.length <= 26) return beforeComma;
  return clampText(beforeComma, 24);
}

function classifyCodeLineBadge(line: string, comment: string | null): string {
  const combined = `${line} ${comment ?? ""}`.toLowerCase();
  if (/\bub\b|undefined|dangle|dangling|trap|error|ill-formed|fail|race|leak|bug|deleted/.test(combined)) {
    return "Trap";
  }
  if (/static_assert|constexpr|consteval|compile[- ]time/.test(combined)) {
    return "Compile-Time";
  }
  if (/std::move|std::forward|xvalue|lvalue|prvalue|rvalue|elision|zero/.test(combined)) {
    return "Value Cat";
  }
  if (/acquire|release|relaxed|seq_cst|atomic|memory_order|fence/.test(combined)) {
    return "Memory Order";
  }
  if (/co_await|co_yield|co_return|suspend|promise/.test(combined)) {
    return "Coroutine";
  }
  if (/concept\b|requires\b|subsum|enable_if|template\b/.test(combined)) {
    return "Constraint";
  }
  if (/pre\(|post\(|contract_assert|\^\^|std::meta/.test(combined)) {
    return "C++26";
  }
  if (/std::launder|start_lifetime_as|new\s*\(|alignas|placement/.test(combined)) {
    return "Lifetime";
  }
  if (/return\b/.test(combined)) {
    return "Result";
  }
  return "Key Line";
}

function buildCodeBeats(
  block: ExtractedCodeBlock,
  topic: Topic
): CodeStageBeat[] {
  const lines = block.code.split("\n");
  const totalLines = lines.length;
  const nonEmptyLines: number[] = [];
  lines.forEach((l, idx) => {
    if (l.trim() && l.trim() !== "{" && l.trim() !== "}" && l.trim() !== "};") {
      nonEmptyLines.push(idx + 1);
    }
  });

  if (nonEmptyLines.length === 0) return [];

  const beats: CodeStageBeat[] = [];
  const usedLineSets = new Set<string>();
  const usedAnnotations = new Set<string>();
  const highlightedSoFar = new Set<number>();

  const pushBeat = (beat: CodeStageBeat) => {
    const valid = Array.from(
      new Set(beat.highlightLines.filter((n) => n >= 1 && n <= totalLines))
    ).sort((a, b) => a - b);
    if (valid.length === 0) return;
    const key = valid.join(",");
    if (usedLineSets.has(key)) return;
    const cleanAnn = clampText(beat.annotation, 108);
    const annKey = cleanAnn.toLowerCase();
    if (usedAnnotations.has(annKey)) return;
    usedLineSets.add(key);
    usedAnnotations.add(annKey);
    for (const ln of valid) highlightedSoFar.add(ln);
    beats.push({
      ...beat,
      highlightLines: valid,
      title: clampText(beat.title, 34),
      annotation: cleanAnn,
      caption: clampText(beat.caption, 136),
    });
  };

  // Beat 1: Setup / opening declaration lines
  const setupEnd = Math.min(
    nonEmptyLines[Math.min(2, nonEmptyLines.length - 1)],
    Math.max(2, Math.ceil(totalLines * 0.35))
  );
  const setupLines = nonEmptyLines.filter((n) => n <= setupEnd).slice(0, 4);
  const setupComment = setupLines
    .map((n) => extractInlineComment(lines[n - 1]))
    .find((c) => Boolean(c && c.length >= 18));
  const setupInsight =
    setupComment ||
    firstSentence(block.prevParagraph, 110) ||
    `Set up the types and signatures for ${block.sectionTitle}.`;

  pushBeat({
    title: "Setup & Signatures",
    badge: "Setup",
    highlightLines: setupLines.length > 0 ? setupLines : [nonEmptyLines[0]],
    annotation: setupInsight,
    caption: setupInsight,
  });

  // Middle beats: prefer lines with author-written // comments (goldmine of crisp C++ semantics!)
  const commentedAfterSetup = block.commentLines.filter(
    (n) => !setupLines.includes(n)
  );

  // Pick up to 2 distinct commented lines (avoiding overlapping comment+next-line pairs)
  const pickedCommentLines: number[] = [];
  for (const lineNo of commentedAfterSetup) {
    if (pickedCommentLines.length >= 2) break;
    if (highlightedSoFar.has(lineNo)) continue;
    pickedCommentLines.push(lineNo);
    const lineText = lines[lineNo - 1];
    const comment = extractInlineComment(lineText);
    const badge = classifyCodeLineBadge(lineText, comment);
    const insight =
      comment ||
      firstSentence(block.nextParagraph, 108) ||
      `Line ${lineNo} triggers the core ${topic.title.toLowerCase()} rule.`;

    const isCommentOnly = lineText.trim().startsWith("//");
    const highlightLines =
      isCommentOnly && lineNo < totalLines && lines[lineNo].trim()
        ? [lineNo, lineNo + 1]
        : [lineNo];

    pushBeat({
      title: badge === "Trap" ? "Watch the Trap" : pickedCommentLines.length === 1 ? "Core Mechanism" : "Under the Hood",
      badge,
      highlightLines,
      annotation: insight,
      caption: insight,
    });
  }

  // If we still need middle beats (e.g. fewer than 2 comments), highlight key semantic lines
  if (beats.length < 3) {
    const semanticLineNos = nonEmptyLines.filter((n) => {
      if (highlightedSoFar.has(n)) return false;
      const t = lines[n - 1];
      return /\b(return|static_assert|co_await|co_yield|requires|concept|std::|pre\(|post\(|contract_assert|noexcept|constexpr|delete|operator)\b/.test(
        t
      );
    });

    const fallbackPool =
      semanticLineNos.length > 0
        ? semanticLineNos
        : nonEmptyLines.filter((n) => !highlightedSoFar.has(n));

    if (fallbackPool.length > 0) {
      const midIdx = Math.floor(fallbackPool.length / 2);
      const midLine = fallbackPool[midIdx];
      const range = fallbackPool.filter(
        (n) => n >= midLine && n <= midLine + 2
      ).slice(0, 3);
      const comment = range.map((n) => extractInlineComment(lines[n - 1])).find(Boolean);
      const insight =
        comment ||
        firstSentence(block.nextParagraph, 108) ||
        firstSentence(block.prevParagraph, 108) ||
        `Observe how ${block.sectionTitle} governs this operation.`;
      pushBeat({
        title: "Core Operation",
        badge: classifyCodeLineBadge(lines[midLine - 1], comment ?? null),
        highlightLines: range,
        annotation: insight,
        caption: insight,
      });
    }
  }

  // Final beat: payoff / verification / pitfall takeaway on unhighlighted concluding lines
  const remainingComment = commentedAfterSetup.find(
    (n) => !highlightedSoFar.has(n)
  );
  const unhighlightedTail = nonEmptyLines
    .filter((n) => !highlightedSoFar.has(n))
    .slice(-2);
  const tailLines = remainingComment
    ? [remainingComment]
    : unhighlightedTail.length > 0
      ? unhighlightedTail
      : nonEmptyLines.slice(-Math.min(2, nonEmptyLines.length));

  const tailComment = tailLines
    .map((n) => extractInlineComment(lines[n - 1]))
    .find((c) => Boolean(c && !usedAnnotations.has(clampText(c, 108).toLowerCase())));
  const finalInsight =
    tailComment ||
    (block.pitfall ? `Pitfall: ${block.pitfall}` : "") ||
    firstSentence(block.nextParagraph, 115) ||
    firstSentence(topic.summary, 115) ||
    `Verify the guarantee in ${topic.title}.`;

  pushBeat({
    title: tailLines.some((n) => /static_assert/.test(lines[n - 1]))
      ? "Compile-Time Proof"
      : block.pitfall
        ? "Mental Model"
        : "Takeaway",
    badge: tailLines.some((n) => /static_assert/.test(lines[n - 1]))
      ? "Verified"
      : classifyCodeLineBadge(lines[tailLines[0] - 1], tailComment ?? null),
    highlightLines: tailLines,
    annotation: finalInsight,
    caption: finalInsight,
  });

  // Guarantee at least 3 beats by splitting non-empty lines if a snippet had very few lines
  if (beats.length < 3 && nonEmptyLines.length >= 3) {
    const midLine = nonEmptyLines[Math.floor(nonEmptyLines.length / 2)];
    pushBeat({
      title: "Key Step",
      badge: "Step",
      highlightLines: [midLine],
      annotation:
        firstSentence(block.nextParagraph || block.prevParagraph || topic.summary, 105) ||
        `Trace line ${midLine} in ${topic.title}.`,
      caption:
        firstSentence(block.nextParagraph || block.prevParagraph || topic.summary, 105) ||
        `Trace line ${midLine} in ${topic.title}.`,
    });
  }

  return beats.slice(0, 4);
}

function buildCodeCardsForTopic(
  topic: Topic,
  continent: { id: string; label: string }
): ScrollCard[] {
  const candidates = extractArticleCodeBlocks(topic);
  if (candidates.length === 0) return [];

  // Sort deterministically by score descending, preferring distinct sections
  const sorted = [...candidates].sort(
    (a, b) => b.score - a.score || a.lineCount - b.lineCount
  );

  const selected: ExtractedCodeBlock[] = [];
  const usedSections = new Set<string>();

  for (const cand of sorted) {
    if (selected.length >= 2) break;
    if (selected.length === 1 && usedSections.has(cand.sectionTitle) && sorted.length > 2) {
      continue;
    }
    selected.push(cand);
    usedSections.add(cand.sectionTitle);
  }

  // Fill second slot if topic has >= 2 distinct blocks and we skipped same-section
  if (selected.length < 2 && sorted.length >= 2) {
    const second = sorted.find((c) => c !== selected[0]);
    if (second && second.score >= 7.2) {
      selected.push(second);
    }
  }

  const cards: ScrollCard[] = [];
  selected.forEach((block, idx) => {
    const beats = buildCodeBeats(block, topic);
    if (beats.length < 2) return;

    const durationSec = Math.max(12, beats.length * 4);
    const captions = buildEvenCaptions(
      beats.map((b) => b.caption),
      durationSec
    );

    const shortPrefix = shortenTopicPrefix(topic.title);
    const sameTitle =
      block.sectionTitle.toLowerCase() === topic.title.toLowerCase() ||
      block.sectionTitle.toLowerCase().includes(shortPrefix.toLowerCase());
    const isSelfDescriptiveSection =
      block.sectionTitle.length >= 20 &&
      !/^(example|overview|summary|pitfall|usage|syntax|details|notes?)\b/i.test(
        block.sectionTitle
      );
    const cardTitle =
      sameTitle || isSelfDescriptiveSection
        ? clampText(block.sectionTitle, 68)
        : clampText(`${shortPrefix}: ${block.sectionTitle}`, 68);

    const summary = clampText(
      block.nextParagraph || block.prevParagraph || topic.summary,
      210
    );

    const standard = detectStandardEra(
      `${block.code} ${block.sectionTitle} ${topic.summary}`,
      topic.trackId
    );

    const shortFileBase = topic.slug
      .split("-")
      .slice(0, 3)
      .join("_")
      .slice(0, 22);
    const filename =
      idx === 0 ? `${shortFileBase}.cpp` : `${shortFileBase}_${idx + 1}.cpp`;

    const baseScore =
      (FLAGSHIP_SLUGS.has(topic.slug) ? 8.9 : 7.7) +
      Math.min(block.commentLines.length, 3) * 0.18 -
      idx * 0.35;

    const readHref = block.sectionSlug
      ? `/topics/${topic.slug}#${block.sectionSlug}`
      : `/topics/${topic.slug}`;

    cards.push({
      id: `code:${topic.slug}:${idx + 1}`,
      kind: "code",
      origin: "core",
      sourcePath: `topics/${topic.slug}`,
      title: cardTitle,
      summary,
      badgeLabel: "Code Walkthrough",
      trackId: topic.trackId,
      trackTitle: topic.trackTitle,
      continentId: continent.id,
      continentLabel: continent.label,
      accentHex: getAccentHex(continent.id, "code"),
      standard,
      tags: dedupeTags([
        standard,
        topic.trackTitle,
        topic.standard[0],
        beats[1]?.badge,
        "C++ Code",
      ]),
      prerequisites: [...topic.prerequisites],
      topicSlug: topic.slug,
      readHref,
      readLabel: "Read section",
      durationSec,
      difficulty: inferTopicDifficulty(topic),
      baseScore: Number(baseScore.toFixed(2)),
      captions,
      stage: {
        type: "code",
        filename,
        language: "cpp",
        code: block.code,
        beats,
      },
    });
  });

  return cards;
}

// ---------------------------------------------------------------------------
// 3. C++11–C++26 Evolution Diffs (all 36 milestones with authentic before/after)
// ---------------------------------------------------------------------------

interface EvolutionPairMeta {
  beforeLabel: string;
  beforeCode: string;
  problem: string;
  payoff: string;
}

const EVOLUTION_BEFORE_MAP: Record<string, EvolutionPairMeta> = {
  "cpp11-value-categories": {
    beforeLabel: "C++98 · Deep Copy Only",
    beforeCode: `struct Buffer {
  int* ptr;
  Buffer(const Buffer& other); // deep-copies heap array
};

Buffer named;
consume(named); // copies entire heap buffer unnecessarily`,
    problem:
      "C++98 only distinguished lvalues from rvalues, forcing expensive deep copies even when a source object was about to expire.",
    payoff:
      "Pointer ownership transfers in O(1) with zero heap allocations while leaving the moved-from Buffer safe to destroy.",
  },
  "cpp11-constexpr": {
    beforeLabel: "C++98 · Template Meta-Hack",
    beforeCode: `template <int N>
struct Fact {
  enum { value = N * Fact<N - 1>::value };
};
template <> struct Fact<1> { enum { value = 1 }; };

int arr[Fact<5>::value]; // opaque TMP boilerplate`,
    problem:
      "C++98 required recursive class-template specializations and enum hacks just to compute simple constants at compile time.",
    payoff:
      "Normal typed C++ functions execute directly inside constant expressions and static_assert checks with clear diagnostics.",
  },
  "cpp11-lambdas": {
    beforeLabel: "C++98 · Manual Functor",
    beforeCode: `struct Above {
  int threshold;
  explicit Above(int t) : threshold(t) {}
  bool operator()(int v) const { return v > threshold; }
};

std::count_if(xs.begin(), xs.end(), Above(threshold));`,
    problem:
      "Passing stateful predicates to STL algorithms forced out-of-line functor structs far away from the call site.",
    payoff:
      "Lexical closures generate the exact same zero-overhead functor inline right where the algorithm runs.",
  },
  "cpp11-memory-model": {
    beforeLabel: "C++98 · Broken volatile / OS Locks",
    beforeCode: `struct Channel {
  int payload = 0;
  volatile bool ready = false; // NOT atomic! Data race UB

  void publish(int v) { payload = v; ready = true; }
  bool try_consume(int& out) {
    if (!ready) return false; // CPU/compiler may reorder
    out = payload; return true;
  }
};`,
    problem:
      "C++98 had no standard memory model; volatile neither prevented data races nor established cross-thread happens-before ordering.",
    payoff:
      "Release/acquire atomics prove payload writes happen-before reader loads portably across x86 and ARM.",
  },
  "cpp11-unique-ptr": {
    beforeLabel: "C++98 · auto_ptr Footgun",
    beforeCode: `std::auto_ptr<Handle> owner(new Handle{3});
// Looks like a copy, silently nulls out 'owner'!
std::auto_ptr<Handle> next = owner;
// Storing auto_ptr in std::vector caused silent UB`,
    problem:
      "std::auto_ptr transferred ownership inside its copy constructor, causing silent nulling and breaking STL containers.",
    payoff:
      "std::unique_ptr forbids copying at compile time, requiring explicit std::move with zero size overhead over a raw pointer.",
  },
  "cpp11-perfect-forwarding": {
    beforeLabel: "C++98 · 2^N Overload Explosion",
    beforeCode: `template <class T> void relay(T& arg)       { sink(arg); }
template <class T> void relay(const T& arg) { sink(arg); }
// 2^N overloads needed for N arguments, still drops rvalueness!`,
    problem:
      "Generic wrappers needed exponential const/non-const overload sets and still could not forward rvalue arguments.",
    payoff:
      "One T&& forwarding reference plus std::forward<T> preserves exact lvalue/rvalue category across arbitrary arities.",
  },
  "cpp14-return-deduction": {
    beforeLabel: "C++11 · Trailing decltype Duplication",
    beforeCode: `template <class Container>
auto first_element(Container&& c)
  -> decltype(std::forward<Container>(c)[0])
{
  return std::forward<Container>(c)[0]; // repeated verbatim
}`,
    problem:
      "C++11 forced generic wrappers to repeat their return expression twice—once in trailing decltype and again in return.",
    payoff:
      "decltype(auto) deduces the exact reference and cv-qualification from the return expression with zero duplication.",
  },
  "cpp14-generic-lambdas": {
    beforeLabel: "C++11 · Fixed-Type Lambda",
    beforeCode: `struct Adder {
  template <class A, class B>
  auto operator()(const A& a, const B& b) const {
    return a + b;
  }
};
Adder add; // couldn't write a polymorphic lambda in C++11`,
    problem:
      "C++11 lambdas required concrete parameter types, forcing you back to named structs with templated operator() for generic callbacks.",
    payoff:
      "auto parameters turn the closure's operator() into a member function template automatically.",
  },
  "cpp14-relaxed-constexpr": {
    beforeLabel: "C++11 · Single-Return Recursion",
    beforeCode: `constexpr int sum_up_to(int n) {
  // C++11 forbade loops, local vars, and multiple statements!
  return n <= 0 ? 0 : n + sum_up_to(n - 1);
}`,
    problem:
      "C++11 restricted constexpr functions to a single return statement, forcing awkward tail-recursive ternary gymnastics.",
    payoff:
      "Normal mutable locals and for-loops run cleanly at compile time with zero recursion depth headaches.",
  },
  "cpp14-make-unique": {
    beforeLabel: "C++11 · Raw new Leak Hazard",
    beforeCode: `// Prior to C++17, interleaved evaluation could leak 'new A'
// if 'new B' threw before unique_ptr<A> was constructed:
sink(std::unique_ptr<Node>(new Node(1)),
     std::unique_ptr<Node>(new Node(2)));`,
    problem:
      "Pairing raw new with std::unique_ptr repeated the type name and risked leaks if a sibling argument threw.",
    payoff:
      "std::make_unique fuses allocation and ownership into one exception-safe expression with no raw new in user code.",
  },
  "cpp14-transparent-lookup": {
    beforeLabel: "C++11 · Hidden Heap Allocation",
    beforeCode: `bool has_key(const std::map<std::string, int>& m,
             const char* key) {
  // Constructs a temporary std::string on the heap just to search!
  return m.find(key) != m.end();
}`,
    problem:
      "std::map<std::string, int> forced find(const char*) to allocate a temporary std::string just to perform a read-only lookup.",
    payoff:
      "Using std::less<> enables transparent lookup directly against const char* or std::string_view with zero allocations.",
  },
  "cpp14-shared-locking": {
    beforeLabel: "C++11 · Readers Blocked by Readers",
    beforeCode: `struct ConfigCache {
  mutable std::mutex mtx; // exclusive only!
  int revision = 0;
  int read() const {
    std::lock_guard<std::mutex> lock(mtx); // serializes readers
    return revision;
  }
};`,
    problem:
      "C++11 only shipped exclusive std::mutex, serializing concurrent read-only threads under heavy read contention.",
    payoff:
      "shared_lock lets multiple readers execute concurrently while unique_lock keeps writers mutually exclusive.",
  },
  "cpp17-guaranteed-elision": {
    beforeLabel: "C++14 · Fails Without Move Ctor",
    beforeCode: `struct Immovable {
  Immovable(int);
  Immovable(const Immovable&) = delete;
  Immovable(Immovable&&) = delete;
};
Immovable make() { return Immovable(99); } // ERROR in C++14!`,
    problem:
      "Even when compilers elided the move, C++14 still required an accessible copy or move constructor to compile.",
    payoff:
      "C++17 treats prvalues as unmaterialized initializers, guaranteeing zero-copy direct construction for immovable types like std::mutex.",
  },
  "cpp17-structured-bindings": {
    beforeLabel: "C++14 · Cryptic .first / .second",
    beforeCode: `auto res = counts.emplace(k, 1);
if (!res.second) {
  ++(res.first->second); // what is .first->second?!
}
return res.second;`,
    problem:
      "Unpacking pairs and tuples forced noisy .first/.second chains or pre-declared variables with std::tie.",
    payoff:
      "auto [it, inserted] names every decomposed element at declaration time with zero copies.",
  },
  "cpp17-eval-order": {
    beforeLabel: "C++14 · Unspecified Order Bug",
    beforeCode: `int update_entry(std::map<int, int>& table, int key) {
  // C++14: table[key] may insert BEFORE table.size() runs!
  // Off-by-one value depended on compiler optimization level.
  return table[key] = static_cast<int>(table.size());
}`,
    problem:
      "Before C++17, LHS and RHS of assignment were unsequenced, making table[key] = table.size() produce different results across compilers.",
    payoff:
      "C++17 mandates RHS evaluates completely before LHS in assignments and chains, eliminating silent compiler divergence.",
  },
  "cpp17-launder": {
    beforeLabel: "C++14 · Stale Pointer Provenance UB",
    beforeCode: `alignas(ConstBox) unsigned char buf[sizeof(ConstBox)];
ConstBox* p = new (buf) ConstBox{1};
p->~ConstBox();
new (buf) ConstBox{2};
return p->id; // UB! Optimizer may still fold p->id to 1`,
    problem:
      "Reusing storage for an object with const or reference members left old pointers pointing at the dead object's identity.",
    payoff:
      "std::launder hands back a provenance-clean pointer to the newly constructed object at zero runtime cost.",
  },
  "cpp17-variant": {
    beforeLabel: "C++14 · Unsafe Tagged Union",
    beforeCode: `struct Result {
  enum { INT, STR } tag;
  union { int i; std::string s; }; // manual ctor/dtor!
  // Reading wrong union member compiles silently -> UB
};`,
    problem:
      "Raw C unions with non-trivial members required manual placement-new, explicit destructors, and error-prone tag checks.",
    payoff:
      "std::variant manages lifetimes automatically on the stack and enforces exhaustive type-safe visitation.",
  },
  "cpp17-string-view": {
    beforeLabel: "C++14 · Hidden String Allocations",
    beforeCode: `bool trim_prefix(const std::string& s, const std::string& pfx,
                 std::string& out) {
  // Calling with string literal allocates heap std::string!
  if (s.rfind(pfx, 0) != 0) return false;
  out = s.substr(pfx.size()); // another heap allocation!
  return true;
}`,
    problem:
      "Accepting const std::string& forced heap copies for literals and slicing via substr allocated new strings on every call.",
    payoff:
      "string_view slices in O(1) pointer arithmetic with zero allocations, paired cleanly with std::optional for absent results.",
  },
  "cpp20-concepts": {
    beforeLabel: "C++17 · Brittle SFINAE enable_if",
    beforeCode: `template <class T, std::enable_if_t<
  std::is_integral_v<T> && !std::is_signed_v<T>, int> = 0>
constexpr int classify(T) { return 1; }

template <class T, std::enable_if_t<
  std::is_integral_v<T> && std::is_signed_v<T>, int> = 0>
constexpr int classify(T) { return 2; } // must manually exclude!`,
    problem:
      "SFINAE overloads had to mutually negate every condition by hand and spewed pages of template errors on failure.",
    payoff:
      "Concepts declare intent cleanly and let subsumption pick the most constrained overload automatically.",
  },
  "cpp20-coroutines": {
    beforeLabel: "C++17 · Manual State Machine",
    beforeCode: `struct PingStateMachine {
  int step = 0;
  void resume() {
    switch (step) {
      case 0: step = 1; schedule_resume(this); return;
      case 1: done = true; return;
    }
  }
  bool done = false;
};`,
    problem:
      "Asynchronous code without OS threads meant hand-rolling inverted callback pyramids or fragile switch-based state machines.",
    payoff:
      "The compiler synthesizes the resumable coroutine frame automatically while your code reads linearly top-to-bottom.",
  },
  "cpp20-spaceship": {
    beforeLabel: "C++17 · 6× Comparison Boilerplate",
    beforeCode: `struct SemVer {
  int major, minor;
  bool operator==(const SemVer& o) const { /*...*/ }
  bool operator!=(const SemVer& o) const { return !(*this == o); }
  bool operator< (const SemVer& o) const { /*...*/ }
  bool operator<=(const SemVer& o) const { return !(o < *this); }
  bool operator> (const SemVer& o) const { return o < *this; }
  bool operator>=(const SemVer& o) const { return !(*this < o); }
};`,
    problem:
      "Defining value comparisons meant writing six repetitive operators and keeping every strict-weak-ordering invariant in sync.",
    payoff:
      "One defaulted operator<=> synthesizes all six relational and equality comparisons with zero drift.",
  },
  "cpp20-ranges": {
    beforeLabel: "C++17 · Eager Intermediate Vectors",
    beforeCode: `std::vector<int> evens;
std::copy_if(nums.begin(), nums.end(),
             std::back_inserter(evens), is_even);
std::vector<int> squares;
std::transform(evens.begin(), evens.end(),
               std::back_inserter(squares), square);
int total = std::accumulate(squares.begin(), squares.end(), 0);`,
    problem:
      "Chaining STL algorithms required repeated begin/end pairs and allocated temporary vectors between each step.",
    payoff:
      "Range view pipelines compose lazily with operator|—zero intermediate heap allocations and single-pass execution.",
  },
  "cpp20-span": {
    beforeLabel: "C++17 · Pointer + Size Decay",
    beforeCode: `// Easy to pass mismatched ptr & len, or overload 3×
// for std::vector, std::array, and C arrays:
int sum_bytes(const int* data, std::size_t count) {
  int acc = 0;
  for (std::size_t i = 0; i < count; ++i) acc += data[i];
  return acc;
}`,
    problem:
      "Passing contiguous buffers forced error-prone (pointer, length) pairs or container-specific overloads.",
    payoff:
      "std::span<const int> accepts vector, array, and C arrays seamlessly in one bounds-aware non-owning view.",
  },
  "cpp20-jthread": {
    beforeLabel: "C++17 · std::terminate() Trap",
    beforeCode: `void run_worker() {
  std::atomic<bool> stop{false};
  std::thread t([&] { while (!stop) break; });
  // If an exception throws before t.join():
  // ~thread() calls std::terminate() and crashes!
  stop = true;
  t.join();
}`,
    problem:
      "Destroying a joinable std::thread calls std::terminate(), and cooperative cancellation required manual atomic flags.",
    payoff:
      "std::jthread requests stop and joins automatically in its destructor—exception-safe RAII threads by default.",
  },
  "cpp23-deducing-this": {
    beforeLabel: "C++20 · 4× cv-ref Overload Copy-Paste",
    beforeCode: `struct Cell {
  int data = 0;
  int&        get() &        { return data; }
  const int&  get() const&   { return data; }
  int&&       get() &&       { return std::move(data); }
  const int&& get() const&&  { return std::move(data); }
};`,
    problem:
      "Preserving const and value-category qualifiers on accessors required writing four nearly identical member overloads.",
    payoff:
      "One explicit this Self&& parameter deduces constness and lvalue/rvalue category automatically—and eliminates CRTP casts.",
  },
  "cpp23-implicit-move": {
    beforeLabel: "C++20 · Surprised by Deleted Copy",
    beforeCode: `struct Source {
  operator Sink() const& = delete;
  operator Sink() && { return {}; }
};
Sink convert(Source s) {
  // C++20: implicit move didn't cover all move-eligible cases
  return std::move(s); // forced manual std::move!
}`,
    problem:
      "C++20's two-pass implicit-move rules missed conversion operators and rvalue-reference returns, pushing users toward harmful std::move(local).",
    payoff:
      "P2266 treats any move-eligible return expression directly as an xvalue—simpler rules and fewer unnecessary copies.",
  },
  "cpp23-range-for-lifetime": {
    beforeLabel: "C++20 · Silent Dangling Reference UB",
    beforeCode: `// C++20: Holder{} temporary is DESTROYED at the semicolon
// before the loop body even begins!
for (int x : Holder{}.get()) {
  total += x; // Use-after-free UB!
}`,
    problem:
      "Before C++23, range-for only extended the final returned reference—not intermediate temporaries created in the initializer expression.",
    payoff:
      "P2718 keeps every temporary in the range-for initializer alive for the entire loop, killing a notorious C++ UB trap.",
  },
  "cpp23-expected": {
    beforeLabel: "C++20 · Out-Param + Error Code",
    beforeCode: `ParseErr parse_port(bool ok, int& out_port) {
  if (!ok) return ParseErr::empty;
  out_port = 8080;
  return ParseErr::none;
}
int port = 80;
if (parse_port(ok, port) == ParseErr::none) port += 1;`,
    problem:
      "Exception-free error handling forced awkward output parameters or ambiguous std::optional that discarded why an operation failed.",
    payoff:
      "std::expected<T, E> carries the typed error alongside monadic .transform() / .and_then() chaining with zero exception overhead.",
  },
  "cpp23-print": {
    beforeLabel: "C++20 · Sticky iostream State",
    beforeCode: `std::cout << "Processed " << count << " items in "
          << std::fixed << std::setprecision(2) << ms
          << " ms\\n"; // mutates global cout flags!`,
    problem:
      "iostreams were verbose, slow, and leaked sticky formatting state, while printf risked runtime UB on mismatched format specifiers.",
    payoff:
      "std::println validates format strings at compile time, writes Unicode cleanly, and outperforms iostreams.",
  },
  "cpp23-start-lifetime-as": {
    beforeLabel: "C++20 · Strict Aliasing UB Cast",
    beforeCode: `unsigned int read_magic(const void* wire_bytes) {
  // UB if no PacketHeader object's lifetime ever began here!
  const auto* hdr =
    reinterpret_cast<const PacketHeader*>(wire_bytes);
  return hdr->magic;
}`,
    problem:
      "Casting raw network or mmap bytes with reinterpret_cast violated object-lifetime rules unless you memcpy'd into a local struct.",
    payoff:
      "std::start_lifetime_as tells the abstract machine an implicit-lifetime object exists in place—zero copies, zero UB.",
  },
  "cpp26-contracts": {
    beforeLabel: "C++23 · Macro assert() Blindness",
    beforeCode: `int clamp_nonneg(int value, int limit) {
  assert(limit >= 0); // hidden inside body, stripped in -DNDEBUG
  int r = value < 0 ? 0 : (value > limit ? limit : value);
  assert(r >= 0 && r <= limit); // no caller-visible contract
  return r;
}`,
    problem:
      "Preprocessor assert() hides invariants from declarations, cannot specify return postconditions cleanly, and vanishes under NDEBUG.",
    payoff:
      "Language-level pre/post/contract_assert encode checked interface contracts directly on declarations with configurable enforcement.",
  },
  "cpp26-static-reflection": {
    beforeLabel: "C++23 · Macro Boilerplate",
    beforeCode: `struct Metric { int count; double latency; };
// Hand-maintained macro list drifts whenever a field changes:
REFLECT_STRUCT(Metric, count, latency);
// No standard way to query member count at compile time!`,
    problem:
      "Serializers, ORMs, and debuggers relied on fragile preprocessor macros or external code generators because C++ could not inspect types.",
    payoff:
      "^^Metric produces a compile-time std::meta::info value queried with ordinary consteval C++—zero macros, zero runtime cost.",
  },
  "cpp26-erroneous-behavior": {
    beforeLabel: "C++23 · Uninitialized UB Time-Travel",
    beforeCode: `int bad_read() {
  int uninit;     // Indeterminate value -> Undefined Behavior!
  return uninit;  // Optimizer may delete branches or corrupt state
}`,
    problem:
      "Reading an uninitialized automatic local triggered full undefined behavior, allowing compilers to optimize away safety checks.",
    payoff:
      "C++26 makes default uninitialized reads bounded erroneous behavior while [[indeterminate]] lets hot scratch buffers opt out explicitly.",
  },
  "cpp26-execution": {
    beforeLabel: "C++23 · Eager Heap std::async",
    beforeCode: `auto f1 = std::async(std::launch::async, [] { return 21; });
// Allocates shared state + thread overhead; no composable .then()
int v = f1.get();
int res = v * 2; // blocks OS thread between stages`,
    problem:
      "std::future forced heap-allocated shared state, lacked standard continuation composition, and coupled logic to concrete threads.",
    payoff:
      "std::execution senders build zero-allocation lazy task graphs with structured cancellation and pluggable schedulers.",
  },
  "cpp26-inplace-vector": {
    beforeLabel: "C++23 · Heap Vector or Raw Array+Len",
    beforeCode: `// Either pay for a heap allocation for 4 ints:
std::vector<int> batch; batch.reserve(4);
// Or hand-manage uninitialized storage + manual size counter:
std::array<int, 4> buf{}; std::size_t len = 0;`,
    problem:
      "Dynamic-length small buffers forced either std::vector heap allocations or awkward default-constructed std::array plus length tracking.",
    payoff:
      "std::inplace_vector<T, N> gives full std::vector ergonomics inside fixed inline stack storage with zero pointer chasing.",
  },
  "cpp26-function-ref": {
    beforeLabel: "C++23 · Owning std::function Overhead",
    beforeCode: `// std::function may heap-allocate large captures and copies state
// even when apply_twice only borrows the callback synchronously:
int apply_twice(std::function<int(int)> fn, int x) {
  return fn(fn(x));
}`,
    problem:
      "std::function copies and owns its target callable (risking heap allocations), while templates duplicate code for every lambda type.",
    payoff:
      "std::function_ref is a trivial two-pointer non-owning view—zero heap allocations, zero template bloat, ABI-stable callbacks.",
  },
};

function buildEvolutionCard(
  milestone: StandardMilestone,
  topicBySlug: Map<string, Topic>
): ScrollCard {
  const linkedTopic = topicBySlug.get(milestone.topicSlug);
  const trackId = linkedTopic?.trackId ?? (milestone.era === "C++26" ? "cpp26" : "expressions-and-functions");
  const trackTitle = linkedTopic?.trackTitle ?? (milestone.era === "C++26" ? "C++26" : "C++ Evolution");
  const continent = lookupContinent(trackId);

  const pairMeta = EVOLUTION_BEFORE_MAP[milestone.id] ?? {
    beforeLabel: `Pre-${milestone.era}`,
    beforeCode: `// Before ${milestone.era} (${milestone.paper})\n// Required manual boilerplate or fragile workarounds.`,
    problem: `Before ${milestone.era}, developers lacked ${milestone.title.toLowerCase()} in standard C++.`,
    payoff: `${milestone.era} standardized this cleanly under ${milestone.clause} (${milestone.paper}).`,
  };

  const afterCode = stripBoilerplateIncludes(
    normalizeCodeSnippet(milestone.code),
    12
  );
  const beforeCode = normalizeCodeSnippet(pairMeta.beforeCode);

  const beats: EvolutionStageBeat[] = [
    {
      phase: "problem",
      title: `Before ${milestone.era}`,
      caption: clampText(pairMeta.problem, 136),
      highlight: clampText(pairMeta.beforeLabel, 48),
    },
    {
      phase: "shift",
      title: `${milestone.era} · ${milestone.paper}`,
      caption: clampText(milestone.shift, 138),
      highlight: `${milestone.era} ${milestone.clause}`,
    },
    {
      phase: "modern",
      title: "Modern Idiom",
      caption: clampText(`In ${milestone.era}: ${milestone.title} (${milestone.clause}).`, 132),
      highlight: clampText(milestone.title, 54),
    },
    {
      phase: "payoff",
      title: "Why It Wins",
      caption: clampText(pairMeta.payoff, 136),
      highlight: clampText(pairMeta.payoff, 86),
    },
  ];

  const durationSec = 16;
  const captions = buildEvenCaptions(
    beats.map((b) => b.caption),
    durationSec
  );

  const difficulty: ScrollCardDifficulty =
    milestone.era === "C++26" || milestone.era === "C++23"
      ? 3
      : milestone.era === "C++20" || milestone.era === "C++17"
        ? 2
        : 1;

  const eraBoost =
    milestone.era === "C++26"
      ? 0.55
      : milestone.era === "C++23"
        ? 0.45
        : milestone.era === "C++20"
          ? 0.4
          : 0.25;

  return {
    id: `evolution:${milestone.id}`,
    kind: "evolution",
    origin: "core",
    sourcePath: `standards/${milestone.id}`,
    title: `${milestone.era}: ${milestone.title}`,
    summary: clampText(milestone.shift, 220),
    badgeLabel: `${milestone.era} Shift`,
    trackId,
    trackTitle,
    continentId: continent.id,
    continentLabel: continent.label,
    accentHex: getAccentHex(continent.id, "evolution"),
    standard: milestone.era,
    tags: dedupeTags([
      milestone.era,
      milestone.paper,
      milestone.clause,
      trackTitle,
      milestone.category === "language" ? "Core Language" : "Std Library",
    ]),
    prerequisites: linkedTopic ? [...linkedTopic.prerequisites] : [],
    topicSlug: linkedTopic?.slug ?? milestone.topicSlug,
    readHref: `/standards#${milestone.id}`,
    readLabel: "View milestone",
    durationSec,
    difficulty,
    baseScore: Number((8.5 + eraBoost).toFixed(2)),
    captions,
    stage: {
      type: "evolution",
      era: milestone.era,
      feature: milestone.title,
      beforeLabel: pairMeta.beforeLabel,
      beforeCode,
      afterLabel: `${milestone.era} · ${milestone.paper}`,
      afterCode,
      beats,
    },
  };
}

// ---------------------------------------------------------------------------
// 4. Interactive 1-Tap Standardese Traps (curated crisp traps across all tracks)
// ---------------------------------------------------------------------------

interface ScoredTrapCandidate {
  question: QuizQuestion;
  topic: Topic | undefined;
  isCompanion: boolean;
  trackId: string;
  trackTitle: string;
  cleanPrompt: string;
  cleanOptions: string[];
  cleanExplanation: string;
  cleanCode?: string;
  clause?: string;
  qualityScore: number;
}

function buildTrapCards(
  topics: Topic[],
  topicBySlug: Map<string, Topic>,
  trackTitleById: Map<string, string>
): ScrollCard[] {
  const allQuestions = getAllQuizQuestions();
  const topicByQuizId = new Map<string, Topic>();

  for (const topic of topics) {
    for (const q of topic.questions) {
      if (!topicByQuizId.has(q.id)) {
        topicByQuizId.set(q.id, topic);
      }
    }
  }

  const candidates: ScoredTrapCandidate[] = [];

  for (const q of allQuestions) {
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6) {
      continue;
    }
    if (q.correctIndex < 0 || q.correctIndex >= q.options.length) continue;

    const cleanPrompt = cleanPlainText(q.prompt);
    const cleanOptions = q.options.map((o) => cleanPlainText(o));
    const cleanExplanation = cleanPlainText(q.explanation);
    if (!cleanPrompt || !cleanExplanation) continue;

    const maxOptLen = Math.max(...cleanOptions.map((o) => o.length));
    const cleanCode = q.code ? normalizeCodeSnippet(q.code) : undefined;
    const codeLines = cleanCode ? cleanCode.split("\n") : [];

    const directTopic = topicByQuizId.get(q.id);
    const mappedSlug =
      directTopic?.slug ??
      COMPANION_PRIMARY_SLUG[q.companionId] ??
      Object.entries(SIMULATOR_BY_TOPIC).find(([, sim]) => sim === q.companionId)?.[0];
    const resolvedTopic = directTopic ?? (mappedSlug ? topicBySlug.get(mappedSlug) : undefined);

    const rawTrackId = q.filterGroupId?.startsWith("track:")
      ? q.filterGroupId.slice("track:".length)
      : resolvedTopic?.trackId ?? "value-semantics";
    const trackTitle =
      trackTitleById.get(rawTrackId) ?? resolvedTopic?.trackTitle ?? "Core C++";

    const rawClause = cleanPlainText(q.standardClause ?? "");
    const clause =
      rawClause && rawClause !== "ISO C++" ? clampText(rawClause, 44) : undefined;

    // Score punchier, shorter-stemmed traps higher so they lead the feed while unlocking ALL 876 traps
    let qualityScore = 6.5;
    if (cleanCode && codeLines.length >= 2 && codeLines.length <= 7) {
      qualityScore += 2.2;
    } else if (cleanCode && codeLines.length <= 12) {
      qualityScore += 1.4;
    } else if (cleanCode) {
      qualityScore += 0.6;
    }
    if (q.trapLevel === "cppcon-stage") qualityScore += 1.6;
    else if (q.trapLevel === "standard-lawyer") qualityScore += 1.2;
    else qualityScore += 0.6;
    if (maxOptLen <= 56) qualityScore += 1.2;
    else if (maxOptLen <= 84) qualityScore += 0.6;
    else if (maxOptLen > 120) qualityScore -= 0.6;
    if (cleanPrompt.length <= 105) qualityScore += 0.8;
    else if (cleanPrompt.length > 180) qualityScore -= 0.4;
    if (clause) qualityScore += 0.7;
    if (!directTopic) qualityScore += 0.6; // companion hand-crafted CppCon traps

    candidates.push({
      question: q,
      topic: resolvedTopic,
      isCompanion: !directTopic,
      trackId: rawTrackId,
      trackTitle,
      cleanPrompt,
      cleanOptions,
      cleanExplanation,
      cleanCode,
      clause,
      qualityScore,
    });
  }

  // Unlock ALL valid traps, ordered deterministically by punchiness score
  candidates.sort(
    (a, b) =>
      b.qualityScore - a.qualityScore ||
      a.question.id.localeCompare(b.question.id)
  );

  const selected: ScoredTrapCandidate[] = [];
  const seenIds = new Set<string>();
  for (const cand of candidates) {
    if (seenIds.has(cand.question.id)) continue;
    seenIds.add(cand.question.id);
    selected.push(cand);
  }

  return selected.map((cand): ScrollCard => {
    const q = cand.question;
    const continent = lookupContinent(cand.trackId);
    const difficulty: ScrollCardDifficulty =
      q.trapLevel === "cppcon-stage"
        ? 3
        : q.trapLevel === "standard-lawyer"
          ? 2
          : 1;

    const standard = detectStandardEra(
      `${cand.cleanPrompt} ${cand.cleanExplanation} ${cand.cleanCode ?? ""}`,
      cand.trackId
    );

    const hasTopicLink = Boolean(cand.topic && q.href?.startsWith("/topics/"));
    const readHref = hasTopicLink
      ? `/topics/${cand.topic!.slug}?view=quiz#trap-${encodeURIComponent(q.id)}`
      : `/quiz#trap-${encodeURIComponent(q.id)}`;

    const durationSec = 18;
    const captions = buildEvenCaptions(
      [
        clampText(cand.cleanPrompt, 138),
        cand.clause
          ? `Check ISO rule ${cand.clause} — tap an option to reveal the verdict.`
          : "Tap an option to test your C++ abstract-machine intuition.",
      ],
      durationSec
    );

    const titleTopic = shortenTopicPrefix(cand.topic?.title ?? q.topicTitle);
    const levelTag =
      q.difficultyLabel ??
      (q.trapLevel === "cppcon-stage"
        ? "Standardese"
        : q.trapLevel === "standard-lawyer"
          ? "Tricky"
          : "Warm-up");

    const shortTitle =
      cand.cleanPrompt.length <= 68
        ? cand.cleanPrompt
        : cand.clause
          ? `${titleTopic} · ${cand.clause}`
          : `${titleTopic}: ${levelTag} Check`;

    // Non-spoiling summary for the slide footer (full explanation reveals inside TrapQuizStage after tapping)
    const topicHint = cand.topic?.summary
      ? firstSentence(cand.topic.summary, 130)
      : "Spot the abstract-machine rule before tapping an option.";
    const trapSummary = clampText(
      cand.clause
        ? `ISO ${cand.clause} check in ${titleTopic}. ${topicHint}`
        : `${levelTag} check in ${titleTopic}. ${topicHint}`,
      210
    );

    const baseScore =
      (FLAGSHIP_SLUGS.has(cand.topic?.slug ?? "") ? 8.8 : 7.8) +
      Math.max(-0.5, Math.min(cand.qualityScore - 6.5, 4)) * 0.16;

    return {
      id: `trap:${q.id}`,
      kind: "trap",
      origin: "core",
      sourcePath: cand.topic ? `topics/${cand.topic.slug}` : `quiz/${q.id}`,
      title: clampText(shortTitle, 72),
      summary: trapSummary,
      badgeLabel: "Trap Check",
      trackId: cand.trackId,
      trackTitle: cand.trackTitle,
      continentId: continent.id,
      continentLabel: continent.label,
      accentHex: getAccentHex(continent.id, "trap"),
      standard,
      tags: dedupeTags([
        standard,
        levelTag,
        cand.clause,
        cand.trackTitle,
        cand.topic?.title,
      ]),
      prerequisites: cand.topic ? [...cand.topic.prerequisites] : [],
      topicSlug: cand.topic?.slug,
      readHref,
      readLabel: hasTopicLink ? "Study topic" : "Open quiz",
      durationSec,
      difficulty,
      baseScore: Number(baseScore.toFixed(2)),
      captions,
      stage: {
        type: "trap",
        trapId: q.id,
        question: cand.cleanPrompt,
        code: cand.cleanCode,
        options: cand.cleanOptions,
        correctIndex: q.correctIndex,
        explanation: cand.cleanExplanation,
        clause: cand.clause,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// 5. Machine-Model Simulator Scenarios (12 interactive memory-map suites)
// ---------------------------------------------------------------------------

const SIM_DEFAULT_VEC_HISTORY: VecHistoryEntry[] = [
  {
    id: "vec-init",
    label: "Init vec{Widget{1}} (cap=1)",
    line: 2,
    size: 1,
    cap: 1,
    allocGen: 1,
    pinnedGen: 1,
    moveCount: 0,
    copyCount: 0,
    reallocated: false,
    eventNote:
      "Initialized vec with 1 Widget at 0x600002100000 (capacity 1) and pinned iterator, pointer, and span.",
    clause: "[vector.capacity]",
  },
  {
    id: "vec-realloc-1",
    label: "push_back(2) reallocates 1 -> 2",
    line: 4,
    size: 2,
    cap: 2,
    allocGen: 2,
    pinnedGen: 1,
    moveCount: 1,
    copyCount: 0,
    reallocated: true,
    oldFreedAddr: "0x600002100000",
    eventNote:
      "Capacity exhausted: vector allocated a new buffer, moved element #0, and freed the old buffer—invalidating captured iterators and spans.",
    clause: "[vector.modifiers]",
  },
];

const SIM_DEFAULT_SP_HISTORY: SharedHistoryEntry[] = [
  {
    id: "sp-init",
    label: "Init sp1 (strong=1) + wp1 (weak=1)",
    line: 2,
    strong: 1,
    weak: 1,
    dtorRan: false,
    controlFreed: false,
    lockResult: "none",
    eventNote:
      "Constructed sp1 (strong = 1) and observing wp1 (weak = 1) sharing one contiguous control block.",
    clause: "[util.smartptr.shared]",
  },
  {
    id: "sp-copy",
    label: "sp2 = sp1 (strong -> 2)",
    line: 3,
    strong: 2,
    weak: 1,
    dtorRan: false,
    controlFreed: false,
    lockResult: "none",
    eventNote:
      "Copying shared_ptr atomically increments strong to 2 while weak count keeps the control block pinned.",
    clause: "[util.smartptr.shared.const]",
  },
];

function collectAllSimulatorScenarios(): RadScenario[] {
  const all: RadScenario[] = [
    ...VALUE_CATEGORY_SCENARIOS,
    ...OBJECT_LIFETIME_SCENARIOS,
    ...COROUTINE_FRAME_SCENARIOS,
    ...TEMPLATES_CONCEPTS_SCENARIOS,
    ...VTABLE_LAYOUT_SCENARIOS,
    ...buildMemoryModelScenarios("acq_rel"),
    ...buildMoveForwardingScenarios(true),
    ...buildOverloadLookupScenarios("two-step"),
    ...buildLambdaClosureScenarios("ptr"),
    ...buildCpp26Scenarios({ semantic: "enforce", input: "oob" }),
    ...buildContainerScenarios({
      vecHistory: SIM_DEFAULT_VEC_HISTORY,
      isNoexcept: true,
      strValue: "twenty_three_chars_heap",
      strHeapGen: 1,
      strHeapCap: 31,
      svSnap: {
        addr: "0x7ffee4b2a881",
        len: 5,
        preview: "cpp23",
      },
      strNote:
        "Growing past 22 bytes flips libc++ std::string from inline SSO bytes to a heap buffer, dangling prior string_view snapshots.",
    }),
    ...buildSmartPointerScenarios({
      strategy: "make_shared",
      spHistory: SIM_DEFAULT_SP_HISTORY,
    }),
  ];

  // Deduplicate by scenario id deterministically
  const seen = new Set<string>();
  return all.filter((sc) => {
    if (!sc.id || seen.has(sc.id)) return false;
    seen.add(sc.id);
    return sc.source.length >= 3 && sc.steps.length >= 2;
  });
}

function buildSimulatorCards(topicBySlug: Map<string, Topic>): ScrollCard[] {
  const scenarios = collectAllSimulatorScenarios();
  const cards: ScrollCard[] = [];

  for (const sc of scenarios) {
    const rawLines = sc.source.map((l) => l.replace(/\t/g, "  ").trimEnd());
    const maxLines = 18;
    const clippedLines = rawLines.slice(0, maxLines);
    const code = clippedLines.join("\n");
    const lineCount = clippedLines.length;
    if (lineCount < 3) continue;

    // Pick up to 4 evenly spaced representative simulator steps
    const stepList = sc.steps;
    const pickedSteps =
      stepList.length <= 4
        ? stepList
        : [
            stepList[0],
            stepList[Math.floor(stepList.length / 3)],
            stepList[Math.floor((2 * stepList.length) / 3)],
            stepList[stepList.length - 1],
          ];

    const beats: CodeStageBeat[] = [];
    const seenBeatKeys = new Set<string>();

    for (const step of pickedSteps) {
      const clampedLine = Math.max(1, Math.min(step.line, lineCount));
      const badge =
        step.verdict.tone === "danger"
          ? "UB / Trap"
          : step.verdict.tone === "warn"
            ? "Watch"
            : step.verdict.tone === "safe"
              ? "Verified"
              : "Machine";
      const ann = clampText(
        step.summary || step.verdict.label || step.label,
        112
      );
      const key = `${clampedLine}:${ann.toLowerCase()}`;
      if (seenBeatKeys.has(key)) continue;
      seenBeatKeys.add(key);

      beats.push({
        title: clampText(step.label.replace(/^\d+\.\s*/, ""), 34),
        badge,
        highlightLines: [clampedLine],
        annotation: ann,
        caption: clampText(step.summary || step.verdict.label, 138),
      });
    }

    if (beats.length < 2) continue;

    const primarySlug = sc.topicSlugs?.find((s) => topicBySlug.has(s));
    const linkedTopic = primarySlug ? topicBySlug.get(primarySlug) : undefined;
    const trackId = linkedTopic?.trackId ?? "memory-model";
    const trackTitle = linkedTopic?.trackTitle ?? "Memory model";
    const continent = lookupContinent(trackId);

    const cleanLabel = cleanPlainText(sc.label.replace(/^\d+\.\s*/, ""));
    const cleanSubtitle = cleanPlainText(sc.subtitle);
    const clauses = Array.from(
      new Set(
        sc.steps
          .map((st) => cleanPlainText(st.clause ?? ""))
          .filter(Boolean)
      )
    );
    const standard = detectStandardEra(
      `${sc.standard} ${cleanLabel} ${cleanSubtitle}`,
      trackId,
      sc.standard
    );

    const durationSec = Math.max(12, beats.length * 4);

    cards.push({
      id: `sim:${sc.id}`,
      kind: "code",
      origin: "simulator",
      sourcePath: `simulator/${sc.id}`,
      title: clampText(cleanLabel, 68),
      summary: clampText(
        `${cleanSubtitle}. ${firstSentence(sc.steps[sc.steps.length - 1]?.summary ?? "", 135)}`,
        215
      ),
      badgeLabel: "Machine Model",
      trackId,
      trackTitle,
      continentId: continent.id,
      continentLabel: continent.label,
      accentHex: getAccentHex(continent.id, "code"),
      standard,
      tags: dedupeTags([
        standard,
        "Machine Model",
        clauses[0],
        trackTitle,
        sc.target,
      ]),
      prerequisites: linkedTopic ? [...linkedTopic.prerequisites] : [],
      topicSlug: linkedTopic?.slug,
      readHref: linkedTopic ? `/topics/${linkedTopic.slug}#simulator` : "/topics",
      readLabel: "Open simulator",
      durationSec,
      difficulty: trackId === "memory-model" || trackId === "concurrency" || trackId === "cpp26" ? 3 : 2,
      baseScore: 9.15,
      captions: buildEvenCaptions(
        beats.map((b) => b.caption),
        durationSec
      ),
      stage: {
        type: "code",
        filename: sc.filename,
        language: "cpp",
        code,
        beats,
      },
    });
  }

  return cards;
}

// ---------------------------------------------------------------------------
// Deterministic interleaving & memoized public corpus API
// ---------------------------------------------------------------------------

/**
 * Interleaves cards into an engaging default feed cadence:
 * concept -> code -> trap -> evolution/concept -> code -> trap ...
 * while rotating tracks so adjacent cards never clump on the same topic.
 */
function interleaveCorpus(
  concepts: ScrollCard[],
  codes: ScrollCard[],
  evolutions: ScrollCard[],
  traps: ScrollCard[]
): ScrollCard[] {
  const sortByScore = (list: ScrollCard[]) =>
    [...list].sort((a, b) => b.baseScore - a.baseScore || a.id.localeCompare(b.id));

  const queues: Record<ScrollCardKind, ScrollCard[]> = {
    concept: sortByScore(concepts),
    code: sortByScore(codes),
    evolution: sortByScore(evolutions),
    trap: sortByScore(traps),
  };

  const pattern: ScrollCardKind[] = [
    "concept",
    "code",
    "trap",
    "evolution",
    "concept",
    "trap",
    "code",
    "trap",
  ];

  const total =
    queues.concept.length +
    queues.code.length +
    queues.evolution.length +
    queues.trap.length;

  const result: ScrollCard[] = [];
  let lastTrackId = "";
  let step = 0;

  const popBestForKind = (kind: ScrollCardKind): ScrollCard | undefined => {
    const q = queues[kind];
    if (q.length === 0) return undefined;
    const altIdx = q.findIndex((c) => c.trackId !== lastTrackId);
    const pickIdx = altIdx >= 0 && altIdx <= 8 ? altIdx : 0;
    return q.splice(pickIdx, 1)[0];
  };

  while (result.length < total) {
    const preferred = pattern[step % pattern.length];
    step++;

    let picked = popBestForKind(preferred);
    if (!picked) {
      const fallbackOrder = (["concept", "code", "trap", "evolution"] as const)
        .filter((k) => queues[k].length > 0)
        .sort((a, b) => queues[b].length - queues[a].length);
      if (fallbackOrder.length === 0) break;
      picked = popBestForKind(fallbackOrder[0]);
    }

    if (picked) {
      result.push(picked);
      lastTrackId = picked.trackId;
    }
  }

  return result;
}

interface CorpusCache {
  cards: ScrollCard[];
  coreCards: ScrollCard[];
  simulatorCards: ScrollCard[];
  proceduralCards: ScrollCard[];
  byId: Map<string, ScrollCard>;
  meta: ScrollFeedMeta;
}

let cachedCorpus: CorpusCache | null = null;

function buildCorpusCache(): CorpusCache {
  const topics = getAllTopics();
  const tracks = getTracks();

  const topicBySlug = new Map<string, Topic>();
  for (const topic of topics) {
    topicBySlug.set(topic.slug, topic);
  }

  const trackTitleById = new Map<string, string>();
  for (const track of tracks) {
    trackTitleById.set(track.id, track.title);
  }

  const concepts: ScrollCard[] = [];
  const coreCodes: ScrollCard[] = [];

  for (const topic of topics) {
    const continent = lookupContinent(topic.trackId);
    concepts.push(buildConceptCard(topic, continent));
    coreCodes.push(...buildCodeCardsForTopic(topic, continent));
  }

  const evolutions: ScrollCard[] = STANDARDS_MILESTONES.map((milestone) =>
    buildEvolutionCard(milestone, topicBySlug)
  );

  const coreTraps: ScrollCard[] = buildTrapCards(
    topics,
    topicBySlug,
    trackTitleById
  );

  const simulatorCards = buildSimulatorCards(topicBySlug);
  const proceduralCards = getProceduralScrollCards();

  const coreCards = interleaveCorpus(concepts, coreCodes, evolutions, coreTraps);

  // Full offline eager pool combines core + simulator + procedural
  const allCodes = [
    ...coreCodes,
    ...simulatorCards,
    ...proceduralCards.filter((c) => c.kind === "code"),
  ];
  const allTraps = [
    ...coreTraps,
    ...proceduralCards.filter((c) => c.kind === "trap"),
  ];
  const cards = interleaveCorpus(concepts, allCodes, evolutions, allTraps);

  const byId = new Map<string, ScrollCard>();
  const trackCounts = new Map<string, ScrollFeedTrackMeta>();
  const countsByKind: Record<ScrollCardKind, number> = {
    concept: 0,
    code: 0,
    evolution: 0,
    trap: 0,
  };

  for (const card of cards) {
    byId.set(card.id, card);
    countsByKind[card.kind] += 1;

    const existing = trackCounts.get(card.trackId);
    if (existing) {
      existing.count += 1;
    } else {
      trackCounts.set(card.trackId, {
        id: card.trackId,
        title: card.trackTitle,
        continentId: card.continentId,
        continentLabel: card.continentLabel,
        count: 1,
      });
    }
  }

  const canonicalOrder = tracks.map((t) => t.id);
  const trackMetas = Array.from(trackCounts.values()).sort((a, b) => {
    const ai = canonicalOrder.indexOf(a.id);
    const bi = canonicalOrder.indexOf(b.id);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return a.title.localeCompare(b.title);
  });

  const referenceCount = getReferencePoolCount();
  const poolCounts = {
    core: coreCards.length,
    simulator: simulatorCards.length,
    procedural: proceduralCards.length,
    reference: referenceCount,
  };

  return {
    cards,
    coreCards,
    simulatorCards,
    proceduralCards,
    byId,
    meta: {
      tracks: trackMetas,
      countsByKind,
      poolCounts,
      totalAvailable: cards.length + referenceCount,
    },
  };
}

function getCache(): CorpusCache {
  cachedCorpus ??= buildCorpusCache();
  return cachedCorpus;
}

export function getScrollCorpus(): ScrollCard[] {
  return getCache().cards;
}

export function getCoreScrollCorpus(): ScrollCard[] {
  return getCache().coreCards;
}

export function getSimulatorScrollCorpus(): ScrollCard[] {
  return getCache().simulatorCards;
}

export function getProceduralScrollCorpus(): ScrollCard[] {
  return getCache().proceduralCards;
}

export function getScrollCardById(id: string): ScrollCard | undefined {
  return getCache().byId.get(id) ?? getReferenceScrollCardById(id);
}

export function getScrollFeedMeta(): ScrollFeedMeta {
  return getCache().meta;
}

/**
 * Lean balanced seed batch for instant SSR hydration of `/scroll`.
 * Keeps HTML payload small while surfacing flagship concept, simulator/code,
 * evolution, and crisp trap cards across tracks + full multi-pool metadata.
 */
export function getScrollSeedBatch(
  limit = 48,
  pinnedCardId?: string
): { cards: ScrollCard[]; meta: ScrollFeedMeta; total: number } {
  const cache = getCache();
  const safeLimit = Math.max(8, Math.min(limit, 120));

  const kindQuotas: Record<ScrollCardKind, number> = {
    concept: Math.round(safeLimit * 0.28),
    code: Math.round(safeLimit * 0.26),
    evolution: Math.round(safeLimit * 0.18),
    trap: Math.round(safeLimit * 0.28),
  };

  const counts: Record<ScrollCardKind, number> = {
    concept: 0,
    code: 0,
    evolution: 0,
    trap: 0,
  };

  const seed: ScrollCard[] = [];
  const seenIds = new Set<string>();

  if (pinnedCardId) {
    const pinned = getScrollCardById(pinnedCardId);
    if (pinned) {
      seed.push(pinned);
      seenIds.add(pinned.id);
      counts[pinned.kind] += 1;
    }
  }

  // First pass: satisfy balanced kind quotas across high-scoring flagship cards
  for (const card of cache.cards) {
    if (seed.length >= safeLimit) break;
    if (seenIds.has(card.id)) continue;
    if (counts[card.kind] >= kindQuotas[card.kind]) continue;
    seenIds.add(card.id);
    counts[card.kind] += 1;
    seed.push(card);
  }

  // Second pass: fill any remaining slots cleanly
  for (const card of cache.cards) {
    if (seed.length >= safeLimit) break;
    if (seenIds.has(card.id)) continue;
    seenIds.add(card.id);
    seed.push(card);
  }

  return {
    cards: seed,
    meta: cache.meta,
    total: cache.meta.totalAvailable ?? cache.cards.length,
  };
}
