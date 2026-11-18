import { cache } from "react";
import { getCompanionForPath } from "@/data/companions";
import { getIndexEntry } from "@/lib/cppref-index";
import {
  getReferenceEntry,
  getReferenceMarkdown,
  getReferencePageData,
  referenceHref,
  type ReferenceIndexEntry,
} from "@/lib/reference";
import {
  CompanionOverlay,
  CppRefHeading,
  CppRefPageData,
  PageInsights,
  PageSignatureInsight,
  ReferenceLang,
} from "@/types/cpp";

/*
 * Reference pages are read from the imported offline data (src/lib/reference.ts);
 * nothing here touches the network. This module adapts an imported page to the
 * views: code windows with Copy / Compiler Explorer buttons, labelled output
 * panels, the defect-reports wrapper Focus mode dims, the attribution block,
 * declaration insights for the Map view, and the notebook markdown export.
 */

/** Date of the cppreference archive the data was imported from. */
export const REFERENCE_SNAPSHOT = "2025-02-09";

export const REFERENCE_LICENSE = {
  ccBySa: "https://creativecommons.org/licenses/by-sa/3.0/",
  gfdl: "https://www.gnu.org/licenses/fdl-1.3.html",
} as const;

const NAMED_ENTITIES: Record<string, string> = {
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  copy: "©",
  reg: "®",
  trade: "™",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rarr: "→",
  larr: "←",
  harr: "↔",
  rArr: "⇒",
  lArr: "⇐",
  hArr: "⇔",
  le: "≤",
  ge: "≥",
  ne: "≠",
  approx: "≈",
  equiv: "≡",
  minus: "−",
  times: "×",
  plusmn: "±",
  middot: "·",
  bull: "•",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  deg: "°",
  prime: "′",
  Prime: "″",
  infin: "∞",
  sect: "§",
  para: "¶",
};

export function decodeHtmlEntities(input: string): string {
  return input.replace(
    /&(?:#(\d+)|#x([0-9a-fA-F]+)|([a-zA-Z][a-zA-Z0-9]+));/g,
    (full, dec?: string, hex?: string, named?: string) => {
      if (dec !== undefined) {
        const cp = Number(dec);
        return Number.isInteger(cp) && cp >= 0 && cp <= 0x10ffff
          ? String.fromCodePoint(cp)
          : full;
      }
      if (hex !== undefined) {
        const cp = parseInt(hex, 16);
        return Number.isInteger(cp) && cp >= 0 && cp <= 0x10ffff
          ? String.fromCodePoint(cp)
          : full;
      }
      if (named !== undefined) {
        return NAMED_ENTITIES[named] ?? full;
      }
      return full;
    }
  );
}
function stripTags(html: string): string {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, "");
  const withoutTags = withoutComments.replace(
    /<(?:[^>"']|"[^"\n]*"|'[^'\n]*')+>/g,
    " "
  );
  return decodeHtmlEntities(withoutTags).replace(/\s+/g, " ").trim();
}

function extractPlainCodeFromHtml(fragment: string): string {
  const withNewlines = fragment.replace(/<br\s*\/?>/gi, "\n");
  const withoutTags = withNewlines.replace(
    /<(?:[^>"']|"[^"\n]*"|'[^'\n]*')+>/g,
    ""
  );
  return decodeHtmlEntities(withoutTags)
    .replace(/\r\n?/g, "\n")
    .replace(/\n+$/, "");
}
function hasCssClass(tagOrAttrs: string, className: string): boolean {
  const m = tagOrAttrs.match(/\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  if (!m) return false;
  const classes = (m[1] ?? m[2] ?? "").split(/\s+/);
  return classes.includes(className);
}

/**
 * Finds the matching closing tag for an opening `<tagName ...>` at `openTagStart`,
 * counting nested open/close tags of the same tag name while respecting quotes.
 */
function findBalancedTagBounds(
  html: string,
  tagName: string,
  openTagStart: number
): { openEnd: number; innerEnd: number; closeEnd: number } | null {
  const openTagMatch = html
    .slice(openTagStart)
    .match(
      new RegExp(`^<${tagName}(?=[\\s>/])(?:[^>"']|"[^"]*"|'[^']*')*>`, "i")
    );
  if (!openTagMatch) return null;

  const openEnd = openTagStart + openTagMatch[0].length;
  if (openTagMatch[0].endsWith("/>")) {
    return { openEnd, innerEnd: openEnd, closeEnd: openEnd };
  }

  const tagRegex = new RegExp(`<(/?)${tagName}(?=[\\s>/])`, "gi");
  tagRegex.lastIndex = openEnd;
  let depth = 1;
  let m: RegExpExecArray | null;

  while ((m = tagRegex.exec(html)) !== null) {
    const isClose = m[1] === "/";
    let gt = -1;
    let inQuote: string | null = null;
    for (let i = m.index + m[0].length; i < html.length; i++) {
      const ch = html[i];
      if (inQuote) {
        if (ch === inQuote) inQuote = null;
      } else if (ch === '"' || ch === "'") {
        inQuote = ch;
      } else if (ch === ">") {
        gt = i;
        break;
      }
    }
    if (gt === -1) return null;
    tagRegex.lastIndex = gt + 1;

    if (isClose) {
      depth--;
      if (depth === 0) {
        return { openEnd, innerEnd: m.index, closeEnd: gt + 1 };
      }
    } else if (html[gt - 1] !== "/") {
      depth++;
    }
  }
  return null;
}

function classAttrRegex(className: string): string {
  return `\\bclass\\s*=\\s*(?:"(?:[^"]*\\s)?${className}(?:\\s[^"]*)?"|'(?:[^']*\\s)?${className}(?:\\s[^']*)?')`;
}

function extractDirectTableCells(rowInner: string): string[] {
  const cells: string[] = [];
  const cellStartRe = /<(t[dh])(?=[\s>/])(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
  let cursor = 0;

  while (cursor < rowInner.length) {
    cellStartRe.lastIndex = cursor;
    const m = cellStartRe.exec(rowInner);
    if (!m) break;

    const tagName = m[1].toLowerCase();
    const bounds = findBalancedTagBounds(rowInner, tagName, m.index);
    if (!bounds) {
      cursor = m.index + m[0].length;
      continue;
    }

    cells.push(rowInner.slice(bounds.openEnd, bounds.innerEnd));
    cursor = bounds.closeEnd;
  }

  return cells;
}

function extractInsights(
  html: string,
  headings: CppRefHeading[]
): PageInsights {
  const headersSet = new Set<string>();
  const hdrRegex =
    /Defined in header[\s\S]{0,240}?(&lt;[a-zA-Z0-9_./]+&gt;)/gi;
  let hdrMatch: RegExpExecArray | null;
  while ((hdrMatch = hdrRegex.exec(html)) !== null) {
    const clean = decodeHtmlEntities(
      hdrMatch[1].replace(/<[^>]+>/g, "")
    ).trim();
    if (clean) headersSet.add(clean);
  }

  const signatures: PageSignatureInsight[] = [];
  let totalSignatures = 0;

  const trOpenRe = /<tr\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
  let trMatch: RegExpExecArray | null;
  let cursor = 0;

  while (cursor < html.length) {
    trOpenRe.lastIndex = cursor;
    trMatch = trOpenRe.exec(html);
    if (!trMatch) break;

    if (!hasCssClass(trMatch[0], "t-dcl")) {
      cursor = trMatch.index + trMatch[0].length;
      continue;
    }

    const bounds = findBalancedTagBounds(html, "tr", trMatch.index);
    if (!bounds) {
      cursor = trMatch.index + trMatch[0].length;
      continue;
    }
    cursor = bounds.closeEnd;

    const rowHtml = html.slice(bounds.openEnd, bounds.innerEnd);
    const preMatch = rowHtml.match(/<pre\b[^>]*>([\s\S]*?)<\/pre>/i);
    let rawCodeHtml = preMatch?.[1];
    if (rawCodeHtml === undefined) {
      const cells = extractDirectTableCells(rowHtml);
      if (cells.length > 0) {
        rawCodeHtml = cells[0];
      }
    }
    if (rawCodeHtml === undefined) continue;

    const code = extractPlainCodeFromHtml(rawCodeHtml)
      .replace(/[ \t]+\n/g, "\n")
      .trim();
    if (!code) continue;

    totalSignatures++;
    if (signatures.length < 6) {
      const badges: string[] = [];
      const revRegex = new RegExp(
        `<span\\b[^>]*${classAttrRegex("t-mark-rev")}[^>]*>([\\s\\S]*?)<\\/span>`,
        "gi"
      );
      let revMatch: RegExpExecArray | null;
      while ((revMatch = revRegex.exec(rowHtml)) !== null) {
        const txt = stripTags(revMatch[1]).replace(/^\(|\)$/g, "");
        if (txt) badges.push(txt);
      }

      signatures.push({
        code,
        badges,
        isNoexcept: /\bnoexcept\b/.test(code),
        isConstexpr:
          /\bconstexpr\b/.test(code) ||
          badges.some((b) => b.toLowerCase().includes("constexpr")),
      });
    }
  }

  const lowerHeadingTexts = headings.map((h) => h.text.toLowerCase());

  return {
    definedInHeaders: Array.from(headersSet),
    signatureCount: totalSignatures,
    signatures,
    hasComplexity: lowerHeadingTexts.some((t) => t.includes("complexity")),
    hasExceptions: lowerHeadingTexts.some((t) => t.includes("exception")),
    hasNotes: lowerHeadingTexts.some((t) => t.includes("note")),
    hasExample: lowerHeadingTexts.some((t) => t.includes("example")),
  };
}


function escapeHtmlText(raw: string): string {
  return raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeHtmlAttr(raw: string): string {
  return escapeHtmlText(raw).replace(/"/g, "&quot;");
}

function codeBar(name: string, godbolt: "cpp" | "c" | null): string {
  const godboltBtn = godbolt
    ? `<button type="button" class="cppref-copy" data-godbolt="${godbolt}" aria-label="Open in Compiler Explorer">Compiler Explorer</button>`
    : "";
  return `<div class="cppref-code-bar"><span class="cppref-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="cppref-code-name">${name}</span>${godboltBtn}<button type="button" class="cppref-copy" data-copy aria-label="Copy code">Copy</button></div>`;
}

/**
 * Wraps "Defect reports" sections (heading, intro paragraphs and the dsctable)
 * in <div data-section="defect-reports"> so Focus mode can dim them as a unit.
 */
function wrapDefectReportsSection(html: string): string {
  const headingRe = /<h([23])\b[^>]*\bid="Defect_reports"[^>]*>[\s\S]*?<\/h\1>/g;
  let out = "";
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(html)) !== null) {
    const headingEnd = m.index + m[0].length;
    const intro = html
      .slice(headingEnd)
      .match(/^((?:\s*<p\b[^>]*>[\s\S]*?<\/p>)*\s*)(?=<table\b)/);
    if (!intro) continue;
    const tableStart = headingEnd + intro[1].length;
    const table = findBalancedTagBounds(html, "table", tableStart);
    if (!table) continue;
    out += html.slice(cursor, m.index);
    out += `<div data-section="defect-reports">${html.slice(m.index, table.closeEnd)}</div>`;
    cursor = table.closeEnd;
    headingRe.lastIndex = cursor;
  }
  return out + html.slice(cursor);
}

/**
 * Render-time pass over the importer's sanitized html: code blocks get a
 * window bar (file name, Compiler Explorer for C/C++, Copy), example output
 * gets its own labelled panel, stray h1s are demoted (the title is the only
 * h1), and defect-report sections are wrapped for Focus mode.
 */
function prepareReferenceHtml(html: string): string {
  let out = html.replace(/<h1(\s|>)/g, "<h2$1").replace(/<\/h1>/g, "</h2>");

  out = out.replace(
    /(<div class="t-example[^"]*">\s*)?<pre data-lang="([\w+-]+)">([\s\S]*?)<\/pre>/g,
    (_m, example: string | undefined, codeLang: string, body: string) => {
      const compiles = codeLang === "cpp" || codeLang === "c";
      const ext = compiles ? codeLang : codeLang === "javascript" ? "js" : "txt";
      const name = example
        ? `example.${ext}`
        : codeLang === "text"
          ? "text"
          : `snippet.${ext}`;
      const godbolt = compiles ? (codeLang as "cpp" | "c") : null;
      return `${example ?? ""}<div class="cppref-code">${codeBar(name, godbolt)}<pre data-lang="${codeLang}">${body}</pre></div>`;
    }
  );

  out = out.replace(
    /(?:<p>\s*([^<]{0,60}?)\s*<\/p>\s*)?<pre data-output="1">([\s\S]*?)<\/pre>/g,
    (_m, label: string | undefined, body: string) => {
      const said = label?.trim().replace(/[:.]$/, "");
      const isLabel = !!said && /output|result|prints/i.test(said);
      const caption = isLabel ? said : "Output";
      const lead = label !== undefined && !isLabel ? `<p>${label}</p>` : "";
      return `${lead}<figure class="cppref-output"><figcaption class="cppref-output-bar">${caption}</figcaption><pre data-output="1">${body}</pre></figure>`;
    }
  );

  out = out.replace(/(<td colspan="\d+">)\s*-<div class="spacer"><\/div>/g, "$1");
  out = wrapDefectReportsSection(out);

  return out;
}

function attributionHtml(originalUrl: string): string {
  const url = escapeHtmlAttr(originalUrl);
  return `<div class="_attribution"><p class="_attribution-p">Content from <a href="${url}" class="_attribution-link" data-external="1" rel="noopener noreferrer">this page on cppreference.com</a>, licensed under <a href="${REFERENCE_LICENSE.ccBySa}" data-external="1" rel="license noopener noreferrer">CC-BY-SA 3.0</a> and <a href="${REFERENCE_LICENSE.gfdl}" data-external="1" rel="license noopener noreferrer">GFDL</a>. Modified: restyled, site navigation removed, code windows added. Offline snapshot of 9 February 2025.</p></div>`;
}

export type ReferenceResolution =
  | { kind: "page"; page: CppRefPageData }
  | { kind: "redirect"; to: string }
  | { kind: "missing" };

function buildPage(lang: ReferenceLang, entry: ReferenceIndexEntry): CppRefPageData {
  const data = getReferencePageData(lang, entry);
  const headings: CppRefHeading[] = data.headings.map((h) => ({
    id: h.id,
    text: h.text,
    level: h.depth,
  }));
  const prepared = prepareReferenceHtml(data.html);
  return {
    lang,
    pagePath: data.path,
    title: data.title,
    titleHtml: data.titleHtml,
    summary: data.summary,
    kind: data.kind === "index" ? "index" : "page",
    bodyHtml: prepared + attributionHtml(data.originalUrl),
    headings,
    cppStandards: data.standards,
    breadcrumbs: data.breadcrumbs,
    children: data.children,
    originalUrl: data.originalUrl,
    domain: getIndexEntry(lang, data.path)?.type ?? null,
    wordCount: data.wordCount,
    insights: extractInsights(data.html, headings),
  };
}

/**
 * Looks a route up in the imported index. Redirect entries resolve to the
 * site URL of their target; anything not in the index is "missing" (404).
 * Deduplicated per request with React cache().
 */
export const resolveReferencePage = cache(
  (lang: ReferenceLang, slug: string | string[] | undefined): ReferenceResolution => {
    const entry = getReferenceEntry(lang, slug);
    if (!entry) return { kind: "missing" };
    if (entry.kind === "redirect") {
      return entry.redirectTo !== undefined
        ? { kind: "redirect", to: referenceHref(lang, entry.redirectTo) }
        : { kind: "missing" };
    }
    return { kind: "page", page: buildPage(lang, entry) };
  }
);

/** The page itself, or undefined for redirects and unknown paths. */
export function getReferencePage(
  lang: ReferenceLang,
  slug: string | string[] | undefined
): CppRefPageData | undefined {
  const r = resolveReferencePage(lang, slug);
  return r.kind === "page" ? r.page : undefined;
}

/** Markdown export of a page: companion overlay (C++ only), the importer's markdown, attribution. */
export function referenceToMarkdown(
  page: CppRefPageData,
  options?: { includeQuizAnswers?: boolean }
): string {
  const includeAnswers = options?.includeQuizAnswers ?? true;
  const companion: CompanionOverlay | undefined =
    page.lang === "cpp" && page.pagePath
      ? getCompanionForPath(page.pagePath)
      : undefined;
  const entry = getReferenceEntry(page.lang, page.pagePath);
  const spec = entry ? getReferenceMarkdown(page.lang, entry) : "";

  const lines: string[] = [];
  lines.push(`# ${page.title}`);
  lines.push("");
  lines.push(
    `> Path: \`${referenceHref(page.lang, page.pagePath)}\` | Source: ${page.originalUrl}${page.domain ? ` | Domain: ${page.domain}` : ""}${page.cppStandards.length ? ` | Standards: ${page.cppStandards.join(", ")}` : ""}`
  );
  lines.push("");
  if (page.summary) {
    lines.push(page.summary);
    lines.push("");
  }

  if (companion) {
    lines.push("## Executive Mental Model (Study Companion)");
    lines.push("");
    lines.push(`**Core Intuition:** ${companion.mentalModelOneLiner}`);
    lines.push("");
    lines.push(`- **Standard Era:** ${companion.standardEra}`);
    lines.push(`- **Primary ISO Clauses:** ${companion.primaryClauses.join(", ")}`);
    lines.push(`- **CppCon Talk Angle:** ${companion.cppconFraming.talkAngle}`);
    lines.push(`- **Common Audience Trap:** ${companion.cppconFraming.audienceTrap}`);
    lines.push(`- **Stage Takeaway:** ${companion.cppconFraming.stageTakeaway}`);
    lines.push("");
    lines.push(`## Memory Map Walkthrough: ${companion.memoryMapTitle}`);
    lines.push("");
    lines.push(companion.memoryMapAudioSummary);
    lines.push("");
    for (const section of companion.sections) {
      lines.push(`### ${section.title} (${section.clause})`);
      lines.push("");
      for (const p of section.prose) {
        lines.push(p);
        lines.push("");
      }
      if (section.codeExample) {
        lines.push(`*${section.codeExample.caption}:*`);
        lines.push("```cpp");
        lines.push(section.codeExample.code);
        lines.push("```");
        lines.push("");
      }
      lines.push(`**Key takeaway:** ${section.keyTakeaway}`);
      lines.push("");
    }
  }

  lines.push("## Official Specification Summary (cppreference)");
  lines.push("");
  // Drop the importer's own "# title" and "Source:" lines; demote its headings one level.
  const body = spec
    .replace(/^# [^\n]*\n+(?:Source: [^\n]*\n+)?/, "")
    .replace(/^(#{2,5}) /gm, "#$1 ")
    .trim();
  lines.push(body);
  lines.push("");

  if (companion) {
    lines.push("## Podcast Host Debate & Socratic Standard Traps");
    lines.push("");
    lines.push(
      "Use the prompts and tricky ISO standard questions below to guide a Socratic audio discussion:"
    );
    lines.push("");
    for (const p of companion.podcastPrompts) lines.push(`- ${p}`);
    lines.push("");
    companion.quizzes.forEach((q, idx) => {
      lines.push(`### Trap ${idx + 1}: ${q.standardClause} (${q.trapLevel})`);
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
      if (includeAnswers) {
        lines.push(
          `**Standard Answer (${String.fromCharCode(65 + q.correctIndex)}):** ${q.options[q.correctIndex]}`
        );
        lines.push("");
        lines.push(`**Why:** ${q.explanation}`);
        if (q.cppconNote) {
          lines.push("");
          lines.push(`*CppCon speaker note:* ${q.cppconNote}`);
        }
        lines.push("");
      }
    });
  }

  lines.push("---");
  lines.push(
    `Attribution: content from ${page.originalUrl} (cppreference.com), licensed under CC-BY-SA 3.0 and GFDL. Modified: converted to markdown, study notes added. Offline snapshot of 9 February 2025.`
  );
  return lines.join("\n");
}
