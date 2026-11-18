import { cacheLife } from "next/cache";
import { getCompanionForPath } from "@/data/companions";
import { highlightCppCode } from "@/lib/cpp-highlight";
import {
  getChildrenUnderPrefix,
  getPrimaryEntryForLangPath,
} from "@/lib/cppref-index";
import {
  CompanionOverlay,
  CppRefHeading,
  CppRefPageData,
  PageInsights,
  PageSignatureInsight,
  ReferenceLang,
} from "@/types/cpp";

const DEVDOCS_BASE = "https://documents.devdocs.io";
const UPSTREAM_BASE = "https://en.cppreference.com";
const ENGINE_SCHEMA_V = 7;

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

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

function escapeHtmlText(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttr(raw: string): string {
  return escapeHtmlText(raw)
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function safeDecodeURIComponent(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function sanitizeSlugParts(slugParts: string[]): string[] | null {
  const out: string[] = [];
  for (const raw of slugParts) {
    const decoded = safeDecodeURIComponent(raw).trim();
    if (!decoded) continue;
    if (
      decoded === "." ||
      decoded === ".." ||
      decoded.includes("/") ||
      decoded.includes("\\") ||
      decoded.includes("\0") ||
      decoded.includes("?") ||
      decoded.includes("#")
    ) {
      return null;
    }
    out.push(decoded);
  }
  return out;
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

function slugifyId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
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

/**
 * Strips balanced elements (e.g. `.t-navbar`, `#toc`, nested-span `.mw-editsection`,
 * `.t-example-live-link`, `.cppref-code-bar`) matching `startRegex`.
 */
function stripBalancedTagsByMarker(
  html: string,
  tagName: string,
  startRegex: RegExp
): string {
  const flags = startRegex.flags.replace(/g/g, "");
  const searchRe = new RegExp(startRegex.source, flags + "g");
  let out = "";
  let cursor = 0;

  while (cursor < html.length) {
    searchRe.lastIndex = cursor;
    const match = searchRe.exec(html);
    if (!match) {
      out += html.slice(cursor);
      break;
    }

    const bounds = findBalancedTagBounds(html, tagName, match.index);
    if (!bounds) {
      out += html.slice(cursor, match.index + 1);
      cursor = match.index + 1;
      continue;
    }

    out += html.slice(cursor, match.index);
    cursor = bounds.closeEnd;
  }

  return out;
}

/**
 * Replaces balanced `<tagName ...>...</tagName>` elements where `predicate(openTag)` holds.
 */
function replaceBalancedElements(
  html: string,
  tagName: string,
  predicate: (openTag: string) => boolean,
  replacer: (openTag: string, inner: string, full: string) => string
): string {
  const openRe = new RegExp(
    `<${tagName}(?=[\\s>/])(?:[^>"']|"[^"]*"|'[^']*')*>`,
    "gi"
  );
  let out = "";
  let cursor = 0;

  while (cursor < html.length) {
    openRe.lastIndex = cursor;
    const match = openRe.exec(html);
    if (!match) {
      out += html.slice(cursor);
      break;
    }

    if (!predicate(match[0])) {
      out += html.slice(cursor, match.index + match[0].length);
      cursor = match.index + match[0].length;
      continue;
    }

    const bounds = findBalancedTagBounds(html, tagName, match.index);
    if (!bounds) {
      out += html.slice(cursor, match.index + match[0].length);
      cursor = match.index + match[0].length;
      continue;
    }

    out += html.slice(cursor, match.index);
    const inner = html.slice(bounds.openEnd, bounds.innerEnd);
    const full = html.slice(match.index, bounds.closeEnd);
    out += replacer(match[0], inner, full);
    cursor = bounds.closeEnd;
  }

  return out;
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

async function fetchWithRetry(
  url: string,
  attempts = 2
): Promise<{ status: number; html: string } | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": BROWSER_UA,
          Accept: "text/html,application/xhtml+xml,*/*",
        },
        signal: AbortSignal.timeout(10000),
      });
      if ((res.status >= 500 || res.status === 429) && i < attempts - 1) {
        continue;
      }
      if (!res.ok) {
        return { status: res.status, html: "" };
      }
      return { status: res.status, html: await res.text() };
    } catch {
      if (i === attempts - 1) return null;
    }
  }
  return null;
}

function extractUpstreamCppRefFragment(
  fullHtml: string,
  lang: ReferenceLang,
  pagePath: string
): string | null {
  const h1Match = fullHtml.match(
    /<h1\b[^>]*id="firstHeading"[^>]*>[\s\S]*?<\/h1>/i
  );
  const contentStart = fullHtml.search(
    /<div\b[^>]*id="mw-content-text"[^>]*>/i
  );
  if (contentStart < 0) return null;

  const afterContent = fullHtml.slice(contentStart);
  const stopMarkers = [
    afterContent.indexOf("<!-- catlinks -->"),
    afterContent.indexOf('<div id="catlinks"'),
    afterContent.indexOf("<!-- /bodyContent -->"),
    afterContent.indexOf('<div id="cpp-footer-base"'),
  ].filter((idx) => idx > 0);

  const cutAt =
    stopMarkers.length > 0 ? Math.min(...stopMarkers) : afterContent.length;
  let contentSlice = afterContent.slice(0, cutAt);

  // Strip MediaWiki navbar chrome, TOC boxes, and nested-span edit links
  contentSlice = stripBalancedTagsByMarker(
    contentSlice,
    "div",
    new RegExp(`<div\\b[^>]*${classAttrRegex("t-navbar")}[^>]*>`, "i")
  );
  contentSlice = stripBalancedTagsByMarker(
    contentSlice,
    "div",
    /<div\b[^>]*\bid\s*=\s*(?:"toc"|'toc')[^>]*>/i
  );
  contentSlice = stripBalancedTagsByMarker(
    contentSlice,
    "table",
    /<table\b[^>]*\bid\s*=\s*(?:"toc"|'toc')[^>]*>/i
  );
  contentSlice = stripBalancedTagsByMarker(
    contentSlice,
    "span",
    new RegExp(`<span\\b[^>]*${classAttrRegex("mw-editsection")}[^>]*>`, "i")
  );

  const canonicalUrl =
    pagePath === "index"
      ? `${UPSTREAM_BASE}/w/${lang}`
      : `${UPSTREAM_BASE}/w/${lang}/${pagePath}`;

  const safeUrlAttr = escapeHtmlAttr(canonicalUrl);
  const safeUrlText = escapeHtmlText(canonicalUrl);
  const attrBlock = `<div class="_attribution"><p class="_attribution-p">&copy; cppreference.com<br>Licensed under the Creative Commons Attribution-ShareAlike Unported License v3.0.<br><a href="${safeUrlAttr}" class="_attribution-link">${safeUrlText}</a></p></div>`;

  return `${h1Match?.[0] ?? ""}\n${contentSlice}\n${attrBlock}`;
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

function rewriteCppRefUrlPath(
  pathname: string,
  search: string,
  hash: string
): string | null {
  const langMatch = pathname.match(/^\/(?:w\/)?(cpp|c)(\/.*)?$/i);
  if (langMatch) {
    const targetLang = langMatch[1].toLowerCase();
    let rest = langMatch[2] ?? "";
    if (rest === "/" || rest === "/index") {
      rest = "";
    }
    return `/w/${targetLang}${rest}${search}${hash}`;
  }
  if (/^\/(?:w\/?)?$/i.test(pathname)) {
    return `/w${hash}`;
  }
  return null;
}

function rewriteHref(
  rawHref: string,
  lang: ReferenceLang,
  pagePath: string
): { href: string; external: boolean } {
  const href = decodeHtmlEntities(rawHref).trim();
  if (!href || href.startsWith("#")) {
    return { href, external: false };
  }

  if (/^(?:javascript|vbscript|data):/i.test(href)) {
    return { href: "#", external: false };
  }

  if (/^(?:mailto|tel):/i.test(href)) {
    return { href, external: false };
  }

  const normalizedSchemeUrl = href.startsWith("//") ? `https:${href}` : href;

  if (/^https?:\/\//i.test(normalizedSchemeUrl)) {
    try {
      const parsed = new URL(normalizedSchemeUrl);
      if (/^en\.cppreference\.com$/i.test(parsed.hostname)) {
        const local = rewriteCppRefUrlPath(
          parsed.pathname,
          parsed.search,
          parsed.hash
        );
        if (local) {
          return { href: local, external: false };
        }
      }
      return { href: normalizedSchemeUrl, external: true };
    } catch {
      return { href: normalizedSchemeUrl, external: true };
    }
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
    return { href, external: true };
  }

  if (href.startsWith("/")) {
    try {
      const parsed = new URL(href, UPSTREAM_BASE);
      const local = rewriteCppRefUrlPath(
        parsed.pathname,
        parsed.search,
        parsed.hash
      );
      if (local) {
        return { href: local, external: false };
      }
    } catch {
      // Fall through to upstream external URL
    }
    return { href: `${UPSTREAM_BASE}${href}`, external: true };
  }

  // Relative link resolution
  const baseUrl =
    pagePath === "index"
      ? `https://cppatlas.local/w/${lang}/index`
      : `https://cppatlas.local/w/${lang}/${pagePath}`;

  try {
    const resolved = new URL(href, baseUrl);
    let pathname = resolved.pathname;
    if (pathname === `/w/${lang}/index`) pathname = `/w/${lang}`;
    return {
      href: `${pathname}${resolved.search}${resolved.hash}`,
      external: false,
    };
  } catch {
    return { href, external: false };
  }
}

function rewriteAssetUrl(rawUrl: string): string {
  const url = decodeHtmlEntities(rawUrl).trim();
  if (!url) return url;
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `${UPSTREAM_BASE}${url}`;
  if (/^http:\/\/upload\.cppreference\.com\//i.test(url)) {
    return url.replace(/^http:\/\//i, "https://");
  }
  return url;
}

function unwrapCodeContainerDivs(html: string): string {
  return replaceBalancedElements(
    html,
    "div",
    (openTag) =>
      hasCssClass(openTag, "mw-highlight") || hasCssClass(openTag, "mw-geshi"),
    (openTag, inner, full) => {
      const trimmed = inner.trim();
      let preHtml: string | null = null;
      let innerAttrs = "";

      if (
        /^<pre\b[\s\S]*<\/pre>$/i.test(trimmed) &&
        !/<\/pre>[\s\S]*<pre\b/i.test(trimmed)
      ) {
        preHtml = trimmed;
      } else {
        const innerDivMatch = trimmed.match(
          /^<div\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*)<\/div>$/i
        );
        if (innerDivMatch) {
          const innerCandidate = innerDivMatch[2].trim();
          if (
            /^<pre\b[\s\S]*<\/pre>$/i.test(innerCandidate) &&
            !/<\/pre>[\s\S]*<pre\b/i.test(innerCandidate)
          ) {
            innerAttrs = innerDivMatch[1];
            preHtml = innerCandidate;
          }
        }
      }

      if (!preHtml) return full;

      const isPlainText =
        hasCssClass(openTag, "mw-highlight-lang-text") ||
        hasCssClass(innerAttrs, "source-text");

      if (isPlainText && !/\bdata-code-lang=/i.test(preHtml)) {
        return preHtml.replace(/^<pre\b/i, '<pre data-code-lang="text"');
      }
      return preHtml;
    }
  );
}

function wrapDefectReportsSection(html: string): string {
  const headingRe =
    /<h([23])\b([^>]*\sdata-section="defect-reports"[^>]*)>[\s\S]*?<\/h\1>/gi;
  let out = "";
  let cursor = 0;

  while (cursor < html.length) {
    headingRe.lastIndex = cursor;
    const match = headingRe.exec(html);
    if (!match) {
      out += html.slice(cursor);
      break;
    }

    const headingStart = match.index;
    const headingEnd = headingStart + match[0].length;
    const afterHeading = html.slice(headingEnd);
    const introMatch = afterHeading.match(
      /^((?:\s*<p\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/p>)*\s*)(?=<table\b)/i
    );

    if (!introMatch) {
      out += html.slice(cursor, headingEnd);
      cursor = headingEnd;
      continue;
    }

    const tableStart = headingEnd + introMatch[1].length;
    const tableBounds = findBalancedTagBounds(html, "table", tableStart);
    if (!tableBounds) {
      out += html.slice(cursor, headingEnd);
      cursor = headingEnd;
      continue;
    }

    out += html.slice(cursor, headingStart);
    const cleanHeading = match[0].replace(
      /\s+data-section="defect-reports"/i,
      ""
    );
    const middleAndTable = html.slice(headingEnd, tableBounds.closeEnd);
    out += `<div data-section="defect-reports">${cleanHeading}${middleAndTable}</div>`;
    cursor = tableBounds.closeEnd;
  }

  return out;
}

function isOutputCaption(text: string): boolean {
  return /^(?:(?:possible|expected|sample|example|typical|console|program|actual)\s+)?(?:output|result)(?:\s*\([^)]{1,40}\)|\s+on\s+[^:]{1,40})?\s*:?$/i.test(
    text
  );
}

function sanitizeAndRewriteHtml(
  rawHtml: string,
  lang: ReferenceLang,
  pagePath: string
): {
  title: string;
  bodyHtml: string;
  headings: CppRefHeading[];
  cppStandards: string[];
  originalUrl: string;
  insights: PageInsights;
} {
  let html = rawHtml
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");

  let title = "";
  const h1Match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    title = stripTags(h1Match[1]);
    html = html.replace(h1Match[0], "");
  }
  html = html.replace(/<h1(\s|>)/gi, "<h2$1").replace(/<\/h1>/gi, "</h2>");

  let originalUrl =
    pagePath === "index"
      ? `${UPSTREAM_BASE}/w/${lang}`
      : `${UPSTREAM_BASE}/w/${lang}/${pagePath}`;
  const attrMatch = html.match(
    /<div class="_attribution">[\s\S]*?<a[^>]*href="([^"]+)"[^>]*class="_attribution-link"/i
  );
  if (attrMatch?.[1]) {
    originalUrl = decodeHtmlEntities(attrMatch[1]);
  }

  const attrIndex = html.indexOf('<div class="_attribution">');
  const contentPart = attrIndex >= 0 ? html.slice(0, attrIndex) : html;
  const attributionPart = attrIndex >= 0 ? html.slice(attrIndex) : "";

  let rewritten = contentPart.replace(
    /<a\b((?:[^>"']|"[^"]*"|'[^']*')*?)\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')((?:[^>"']|"[^"]*"|'[^']*')*)>/gi,
    (
      _full,
      pre: string,
      dqHref: string | undefined,
      sqHref: string | undefined,
      post: string
    ) => {
      const rawHref = dqHref ?? sqHref ?? "";
      const { href, external } = rewriteHref(rawHref, lang, pagePath);
      const safeHref = escapeHtmlAttr(href);
      const lead = pre || " ";
      if (external) {
        const hasTarget = /\btarget\s*=/i.test(pre + post);
        const extra = hasTarget
          ? ' data-external="1"'
          : ' data-external="1" target="_blank" rel="noopener noreferrer"';
        return `<a${lead}href="${safeHref}"${post}${extra}>`;
      }
      return `<a${lead}href="${safeHref}"${post}>`;
    }
  );

  // Rewrite root-relative / protocol-relative <img> src and srcset attributes
  rewritten = rewritten.replace(
    /<img\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi,
    (_full, attrs: string) => {
      let updated = attrs.replace(
        /(^|\s)src\s*=\s*(?:"([^"]*)"|'([^']*)')/i,
        (_m, ws: string, dqSrc?: string, sqSrc?: string) => {
          const rewrittenSrc = rewriteAssetUrl(dqSrc ?? sqSrc ?? "");
          return `${ws}src="${escapeHtmlAttr(rewrittenSrc)}"`;
        }
      );
      updated = updated.replace(
        /(^|\s)srcset\s*=\s*(?:"([^"]*)"|'([^']*)')/i,
        (_m, ws: string, dqSet?: string, sqSet?: string) => {
          const rawSet = decodeHtmlEntities(dqSet ?? sqSet ?? "");
          const rewrittenSet = rawSet
            .split(",")
            .map((part) => {
              const trimmed = part.trim();
              if (!trimmed) return "";
              const spaceIdx = trimmed.search(/\s/);
              if (spaceIdx === -1) return rewriteAssetUrl(trimmed);
              const urlPart = trimmed.slice(0, spaceIdx);
              const descPart = trimmed.slice(spaceIdx);
              return `${rewriteAssetUrl(urlPart)}${descPart}`;
            })
            .filter(Boolean)
            .join(", ");
          return `${ws}srcset="${escapeHtmlAttr(rewrittenSet)}"`;
        }
      );
      return `<img${updated}>`;
    }
  );

  const headings: CppRefHeading[] = [];
  const seenIds = new Set<string>();

  rewritten = rewritten.replace(
    /<h([2-4])\b([^>]*)>([\s\S]*?)<\/h\1>/gi,
    (_full, lvlStr: string, attrs: string, inner: string) => {
      const level = Number(lvlStr) as 2 | 3 | 4;
      const text = stripTags(inner);
      if (!text) return _full;

      const idMatch = attrs.match(
        /(^|\s)id\s*=\s*(?:"([^"]*)"|'([^']*)')/i
      );
      const rawId = idMatch
        ? decodeHtmlEntities(idMatch[2] ?? idMatch[3] ?? "").trim()
        : "";
      const baseId = rawId || slugifyId(text) || `sec_${headings.length}`;
      let id = baseId;
      let suffix = headings.length;
      while (seenIds.has(id)) {
        id = `${baseId}_${suffix}`;
        suffix++;
      }
      seenIds.add(id);

      if (level <= 3) {
        headings.push({ id, text, level });
      }

      const safeId = escapeHtmlAttr(id);
      const cleanAttrs = idMatch
        ? attrs.replace(
            /(^|\s)id\s*=\s*(?:"[^"]*"|'[^']*')/i,
            (_m, ws: string) => `${ws}id="${safeId}"`
          )
        : `${attrs} id="${safeId}"`;

      const isDefectSection =
        level <= 3 &&
        (id.toLowerCase().includes("defect_reports") ||
          slugifyId(text).includes("defect_reports"));
      const defectAttr = isDefectSection
        ? ' data-section="defect-reports"'
        : "";

      return `<h${level}${cleanAttrs}${defectAttr}>${inner}</h${level}>`;
    }
  );

  rewritten = wrapDefectReportsSection(rewritten);

  // Strip Coliru "Run this code" live link widgets and unwrap .mw-highlight / .mw-geshi <pre> wrappers
  rewritten = stripBalancedTagsByMarker(
    rewritten,
    "div",
    new RegExp(`<div\\b[^>]*${classAttrRegex("t-example-live-link")}[^>]*>`, "i")
  );
  rewritten = unwrapCodeContainerDivs(rewritten);

  const insights = extractInsights(rewritten, headings);

  rewritten = rewritten.replace(
    /(<td colspan="\d+">)\s*-(?:<div class="spacer"><\/div>)?/gi,
    "$1"
  );

  // Declaration table rows: keep declarations inside `.t-dcl-begin` panel without nested `.cppref-code`
  rewritten = replaceBalancedElements(
    rewritten,
    "tr",
    (openTag) => hasCssClass(openTag, "t-dcl"),
    (openTag, rowInner) => {
      const updatedRow = rowInner.replace(
        /<pre\b[^>]*>([\s\S]*?)<\/pre>/gi,
        (_pm, preInner: string) => {
          const plain = extractPlainCodeFromHtml(preInner);
          return `<div class="mw-geshi">${highlightCppCode(plain)}</div>`;
        }
      );
      return `${openTag}${updatedRow}</tr>`;
    }
  );

  // Example output panels (e.g. <p>Possible output:</p><pre>...</pre> or <p><b>Output:</b></p><pre>...</pre>)
  rewritten = rewritten.replace(
    /<p\b[^>]*>([\s\S]{0,240}?)<\/p>\s*<pre\b([^>]*)>([\s\S]*?)<\/pre>/gi,
    (full, rawLabelHtml: string, _attrs: string, inner: string) => {
      const labelText = stripTags(rawLabelHtml);
      if (!isOutputCaption(labelText)) return full;
      const caption = labelText.replace(/[:.]+$/, "").trim() || "Output";
      const plainOutput = escapeHtmlText(extractPlainCodeFromHtml(inner));
      return `<figure class="cppref-output"><figcaption class="cppref-output-bar">${escapeHtmlText(caption)}</figcaption><pre data-output="1">${plainOutput}</pre></figure>`;
    }
  );

  const ext = lang === "c" ? "c" : "cpp";
  const examplePreRegex = new RegExp(
    `(<div\\b[^>]*${classAttrRegex("t-example")}[^>]*>\\s*)?<pre(?![^>]*data-output="1")([^>]*)>([\\s\\S]*?)<\\/pre>`,
    "gi"
  );
  rewritten = rewritten.replace(
    examplePreRegex,
    (_full, exampleLead: string | undefined, attrs: string, inner: string) => {
      const plainCode = extractPlainCodeFromHtml(inner);
      const isPlainText = /\bdata-code-lang="text"/i.test(attrs);
      const name = isPlainText
        ? "output.txt"
        : exampleLead
          ? `example.${ext}`
          : `snippet.${ext}`;
      const renderedCode = isPlainText
        ? escapeHtmlText(plainCode)
        : highlightCppCode(plainCode);
      const godboltBtn = !isPlainText
        ? `<button type="button" class="cppref-copy" data-godbolt="${ext}" aria-label="Open in Compiler Explorer">Compiler Explorer</button>`
        : "";
      return `${exampleLead ?? ""}<div class="cppref-code"><div class="cppref-code-bar"><span class="cppref-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="cppref-code-name">${name}</span>${godboltBtn}<button type="button" class="cppref-copy" data-copy aria-label="Copy code">Copy</button></div><pre${attrs}><code>${renderedCode}</code></pre></div>`;
    }
  );

  const stdMatches = new Set<string>();
  const stdRegex =
    /\b(?:C\+\+(?:98|03|11|14|17|20|23|26)|C(?:89|90|99|11|17|23))\b/g;
  let m: RegExpExecArray | null;
  while ((m = stdRegex.exec(rewritten)) !== null) {
    stdMatches.add(m[0]);
  }

  return {
    title,
    bodyHtml: rewritten + attributionPart,
    headings,
    cppStandards: Array.from(stdMatches),
    originalUrl,
    insights,
  };
}

function buildSyntheticDirectoryHtml(
  lang: ReferenceLang,
  pagePath: string
): string | null {
  const matches = getChildrenUnderPrefix(lang, pagePath);
  if (matches.length === 0) return null;

  const rows = matches
    .slice(0, 200)
    .map(
      (entry) =>
        `<tr class="t-dsc"><td><a href="/w/${lang}/${escapeHtmlAttr(entry.path)}"><code>${escapeHtmlText(entry.name)}</code></a></td><td>${escapeHtmlText(entry.type)} — <code>/w/${lang}/${escapeHtmlText(entry.path)}</code></td></tr>`
    )
    .join("\n");

  const safePathText = escapeHtmlText(pagePath);
  const safePathAttr = escapeHtmlAttr(pagePath);

  return `
    <p>Indexed reference entries under <code>/w/${lang}/${safePathText}</code> (${matches.length} total):</p>
    <table class="t-dsc-begin">
      <tbody>
        ${rows}
      </tbody>
    </table>
    <div class="_attribution">
      <p class="_attribution-p">Indexed from cppreference.com (${UPSTREAM_BASE}/w/${lang}/${safePathAttr}) under CC-BY-SA 3.0.</p>
    </div>
  `;
}

export async function getReferencePage(
  lang: ReferenceLang,
  slugParts: string[]
): Promise<CppRefPageData | null> {
  "use cache";
  void ENGINE_SCHEMA_V;

  const sanitizedParts = sanitizeSlugParts(slugParts);
  if (sanitizedParts === null) {
    cacheLife("days");
    return null;
  }

  const pagePath =
    sanitizedParts.length === 0 ? "index" : sanitizedParts.join("/");

  // DevDocs renamed `header` -> `headers` in its archive
  const devdocsPath = pagePath === "header" ? "headers" : pagePath;
  const devdocsUrl = `${DEVDOCS_BASE}/${lang}/${devdocsPath}.html`;

  const devdocsRes = await fetchWithRetry(devdocsUrl, 2);

  let rawHtml: string | null = null;
  let hadTransientError = false;

  if (devdocsRes && devdocsRes.status === 200) {
    rawHtml = devdocsRes.html;
  } else {
    // DevDocs returns 403 or 404 for aliases / unarchived / newer pages -> fall back upstream
    const upstreamUrl =
      pagePath === "index"
        ? `${UPSTREAM_BASE}/w/${lang}`
        : `${UPSTREAM_BASE}/w/${lang}/${pagePath}`;

    const upstreamRes = await fetchWithRetry(upstreamUrl, 2);
    if (upstreamRes && upstreamRes.status === 200) {
      rawHtml = extractUpstreamCppRefFragment(upstreamRes.html, lang, pagePath);
      if (!rawHtml) {
        hadTransientError = true;
      }
    } else {
      const devdocsTransient =
        !devdocsRes || devdocsRes.status >= 500 || devdocsRes.status === 429;
      const upstreamTransient =
        !upstreamRes ||
        upstreamRes.status >= 500 ||
        upstreamRes.status === 429 ||
        upstreamRes.status === 403;
      if (devdocsTransient || upstreamTransient) {
        hadTransientError = true;
      }
    }
  }

  if (!rawHtml && !hadTransientError) {
    rawHtml = buildSyntheticDirectoryHtml(lang, pagePath);
  }

  if (hadTransientError) {
    cacheLife("seconds");
    return null;
  }

  cacheLife("days");

  if (!rawHtml) {
    return null;
  }

  const parsed = sanitizeAndRewriteHtml(rawHtml, lang, pagePath);
  const entry = getPrimaryEntryForLangPath(lang, pagePath);
  const defaultTitle =
    lang === "c" ? "C Programming Language" : "C++ Programming Language";

  return {
    lang,
    pagePath,
    title:
      parsed.title ||
      entry?.name ||
      (pagePath === "index" ? defaultTitle : pagePath),
    bodyHtml: parsed.bodyHtml,
    headings: parsed.headings,
    cppStandards: parsed.cppStandards,
    originalUrl: parsed.originalUrl,
    domain: entry?.type ?? null,
    insights: parsed.insights,
  };
}

export async function getCppRefPage(
  slugParts: string[]
): Promise<CppRefPageData | null> {
  return getReferencePage("cpp", slugParts);
}

function stripNonCodeTagsPreserveNewlines(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(
      /<\/?(?:a|b|i|strong|em|u|s|sup|sub|small|abbr|cite)\b(?:[^>"']|"[^"\n]*"|'[^'\n]*')*>/gi,
      ""
    )
    .replace(/<(?:[^>"']|"[^"\n]*"|'[^'\n]*')+>/g, " ");
}

function stripInlineTagsKeepEntities(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<(?:[^>"']|"[^"\n]*"|'[^'\n]*')+>/g, "");
}

function collapseTextPreserveEntities(html: string): string {
  return stripNonCodeTagsPreserveNewlines(html)
    .replace(/[ \t]+/g, " ")
    .trim();
}

function formatCodeFence(code: string, fenceLang: string): string {
  const fence = code.includes("```") ? "````" : "```";
  return `${fence}${fenceLang}\n${code}\n${fence}`;
}

function formatBlockFragmentToMarkdown(
  html: string,
  listDepth: number
): string {
  const blockStartRe =
    /<(tr|li|p)\b(?:[^>"']|"[^"]*"|'[^']*')*>|<div\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
  let out = "";
  let cursor = 0;

  while (cursor < html.length) {
    blockStartRe.lastIndex = cursor;
    const match = blockStartRe.exec(html);
    if (!match) {
      out += html.slice(cursor);
      break;
    }

    const fullOpen = match[0];
    const isDiv = !match[1];
    let liDepth: number | null = null;
    if (isDiv) {
      if (hasCssClass(fullOpen, "t-li1")) liDepth = 0;
      else if (hasCssClass(fullOpen, "t-li2")) liDepth = 1;
      else if (hasCssClass(fullOpen, "t-li3")) liDepth = 2;
      else {
        out += html.slice(cursor, match.index + fullOpen.length);
        cursor = match.index + fullOpen.length;
        continue;
      }
    }

    const tagName = isDiv ? "div" : match[1].toLowerCase();
    const bounds = findBalancedTagBounds(html, tagName, match.index);
    if (!bounds) {
      out += html.slice(cursor, match.index + fullOpen.length);
      cursor = match.index + fullOpen.length;
      continue;
    }

    out += html.slice(cursor, match.index);
    const inner = html.slice(bounds.openEnd, bounds.innerEnd);
    cursor = bounds.closeEnd;

    if (tagName === "tr") {
      const rawCells = extractDirectTableCells(inner);
      const formattedCells: string[] = [];
      let hasMultiLineCell = false;

      for (const rawCell of rawCells) {
        const converted = stripNonCodeTagsPreserveNewlines(
          formatBlockFragmentToMarkdown(rawCell, listDepth + 1)
        )
          .replace(/[ \t]+\n/g, "\n")
          .trim();

        if (!converted) continue;
        if (converted.includes("\n") || /__CODE_BLOCK_\d+__/.test(converted)) {
          hasMultiLineCell = true;
          formattedCells.push(converted);
        } else {
          formattedCells.push(converted.replace(/[ \t]+/g, " ").trim());
        }
      }

      if (formattedCells.length > 0) {
        const indent = "  ".repeat(listDepth);
        if (hasMultiLineCell) {
          const [first, ...rest] = formattedCells;
          const body = rest.length > 0 ? `\n${rest.join("\n\n")}` : "";
          out += `\n${indent}- ${first}${body}\n`;
        } else {
          out += `\n${indent}- ${formattedCells.join(" — ")}\n`;
        }
      }
    } else if (tagName === "li") {
      const converted = formatBlockFragmentToMarkdown(inner, listDepth + 1);
      const cleaned = stripNonCodeTagsPreserveNewlines(converted).trim();

      if (cleaned) {
        const indent = "  ".repeat(listDepth);
        out += `\n${indent}- ${cleaned}\n`;
      }
    } else if (tagName === "div" && liDepth !== null) {
      const depth = Math.max(listDepth, liDepth);
      const converted = formatBlockFragmentToMarkdown(inner, depth + 1);
      const cleaned = stripNonCodeTagsPreserveNewlines(converted).trim();

      if (cleaned) {
        const indent = "  ".repeat(depth);
        out += `\n${indent}- ${cleaned}\n`;
      }
    } else if (tagName === "p") {
      const converted = collapseTextPreserveEntities(inner);
      if (converted) {
        out += `\n\n${converted}\n\n`;
      }
    }
  }

  return out;
}

export function htmlToCleanMarkdown(
  page: CppRefPageData,
  options?: { includeQuizAnswers?: boolean }
): string {
  const includeAnswers = options?.includeQuizAnswers ?? true;
  const companion: CompanionOverlay | undefined =
    page.lang === "cpp" && page.pagePath !== "index"
      ? getCompanionForPath(page.pagePath)
      : undefined;

  const lines: string[] = [];
  lines.push(`# ${page.title}`);
  lines.push("");
  lines.push(
    `> Source path: \`/w/${page.lang}/${page.pagePath === "index" ? "" : page.pagePath}\` | Canonical: ${page.originalUrl}${page.domain ? ` | Domain: ${page.domain}` : ""}`
  );
  lines.push("");

  if (companion) {
    lines.push("## Executive Mental Model (Study Companion)");
    lines.push("");
    lines.push(`**Core Intuition:** ${companion.mentalModelOneLiner}`);
    lines.push("");
    lines.push(`- **Standard Era:** ${companion.standardEra}`);
    lines.push(
      `- **Primary ISO Clauses:** ${companion.primaryClauses.join(", ")}`
    );
    lines.push(
      `- **CppCon Talk Angle:** ${companion.cppconFraming.talkAngle}`
    );
    lines.push(
      `- **Common Audience Trap:** ${companion.cppconFraming.audienceTrap}`
    );
    lines.push(
      `- **Stage Takeaway:** ${companion.cppconFraming.stageTakeaway}`
    );
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

  let md = page.bodyHtml;
  md = md.replace(/<div\b[^>]*class="_attribution"[^>]*>[\s\S]*$/i, "");
  md = stripBalancedTagsByMarker(
    md,
    "div",
    new RegExp(`<div\\b[^>]*${classAttrRegex("cppref-code-bar")}[^>]*>`, "i")
  );
  md = md.replace(
    /<figcaption\b[^>]*class="cppref-output-bar"[^>]*>([\s\S]*?)<\/figcaption>/gi,
    (_m, cap: string) => {
      const cleanCap = collapseTextPreserveEntities(cap).replace(/:+$/, "");
      return cleanCap ? `\n\n**${cleanCap}:**\n\n` : "\n\n";
    }
  );

  const codeBlocks: string[] = [];
  const defaultCodeLang = page.lang === "c" ? "c" : "cpp";

  // Extract <pre> blocks before any HTML stripping/decoding
  md = md.replace(
    /<pre\b([^>]*)>([\s\S]*?)<\/pre>/gi,
    (_m, attrs: string, inner: string) => {
      const cleanCode = extractPlainCodeFromHtml(inner).trim();
      const isOutput =
        /\bdata-output\s*=\s*"1"/i.test(attrs) ||
        /\bdata-code-lang\s*=\s*"text"/i.test(attrs);
      const fenceLang = isOutput ? "text" : defaultCodeLang;
      const token = `\n\n__CODE_BLOCK_${codeBlocks.length}__\n\n`;
      codeBlocks.push(formatCodeFence(cleanCode, fenceLang));
      return token;
    }
  );

  // Extract .t-dcl declaration rows into language-aware fenced code blocks so
  // multi-line signatures and template parameters (<T>, <class Alloc>) stay intact
  md = replaceBalancedElements(
    md,
    "tr",
    (openTag) => hasCssClass(openTag, "t-dcl"),
    (_openTag, rowInner) => {
      const cells = extractDirectTableCells(rowInner);
      if (cells.length === 0) return "";
      const declCode = extractPlainCodeFromHtml(cells[0])
        .replace(/[ \t]+\n/g, "\n")
        .trim();
      if (!declCode) return "";

      const overloadNum = cells[1]
        ? collapseTextPreserveEntities(cells[1])
        : "";
      const revBadges = cells[2]
        ? collapseTextPreserveEntities(cells[2])
        : "";
      const meta = [overloadNum, revBadges]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      const idx = codeBlocks.length;
      codeBlocks.push(formatCodeFence(declCode, defaultCodeLang));
      return meta
        ? `\n\n**${meta}**\n\n__CODE_BLOCK_${idx}__\n\n`
        : `\n\n__CODE_BLOCK_${idx}__\n\n`;
    }
  );

  // Convert headings and inline <code> WITHOUT decoding HTML entities yet
  md = md.replace(
    /<h([2-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi,
    (_m, lvl: string, t: string) =>
      `\n\n${"#".repeat(Number(lvl))} ${collapseTextPreserveEntities(t)}\n\n`
  );
  md = md.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_m, t: string) => {
    const codeText = stripInlineTagsKeepEntities(t).replace(/\s+/g, " ").trim();
    if (!codeText) return "";
    return codeText.includes("`") ? `\`\` ${codeText} \`\`` : `\`${codeText}\``;
  });

  // Convert nested <tr>, <li>, .t-li[123], and <p> blocks cleanly
  md = formatBlockFragmentToMarkdown(md, 0);

  // Strip ALL remaining HTML tags BEFORE decoding entities so `<vector>` etc. survive
  md = stripNonCodeTagsPreserveNewlines(md);

  // Decode HTML entities ONCE across prose and inline text
  md = decodeHtmlEntities(md);

  // Normalize horizontal whitespace per line while preserving nested bullet indentation
  md = md
    .split("\n")
    .map((line) => {
      const bulletMatch = line.match(/^([ ]*- )(.*)$/);
      if (bulletMatch) {
        const body = bulletMatch[2].replace(/[ \t]+/g, " ").trim();
        return body ? `${bulletMatch[1]}${body}` : "";
      }
      return line.replace(/[ \t]+/g, " ").trim();
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Restore fenced code blocks in a single pass with a callback (immune to `$&`/`$1`/`$$` and nested tokens)
  md = md.replace(/__CODE_BLOCK_(\d+)__/g, (full, idxStr: string) => {
    const idx = Number(idxStr);
    return idx >= 0 && idx < codeBlocks.length ? codeBlocks[idx] : full;
  });

  lines.push(md);
  lines.push("");

  if (companion) {
    lines.push("## Podcast Host Debate & Socratic Standard Traps");
    lines.push("");
    lines.push(
      "Use the prompts and tricky ISO standard questions below to guide a Socratic audio discussion:"
    );
    lines.push("");
    for (const p of companion.podcastPrompts) {
      lines.push(`- ${p}`);
    }
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
    `Attribution: Content adapted from cppreference.com (${page.originalUrl}) under CC-BY-SA 3.0.`
  );

  return lines.join("\n");
}
