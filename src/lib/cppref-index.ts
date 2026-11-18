import { getCompanionForPath } from "@/data/companions";
import {
  getReferenceChildren,
  getReferenceEntry,
  listedReferenceEntries,
  referenceHref,
} from "@/lib/reference";
import { CppRefDomain, CppRefIndexEntry, ReferenceLang } from "@/types/cpp";

/*
 * Directory, search and "in this section" views over the imported reference
 * index (data/reference/index.json, data/reference-c/index.json). Every listed
 * page belongs to exactly one domain, derived from its first path segment: the
 * title of that top-level page ("Containers library" -> "Containers"), with a
 * few groups for the small top-level pages (revisions, keywords, indexes).
 */

const DOMAIN_GROUPS: Record<ReferenceLang, Record<string, string>> = {
  cpp: {
    language: "Language",
    preprocessor: "Language",
    comment: "Language",
    identifier_with_special_meaning: "Language",
    keyword: "Keywords",
    keywords: "Keywords",
    "11": "Standards & support",
    "14": "Standards & support",
    "17": "Standards & support",
    "20": "Standards & support",
    "23": "Standards & support",
    "26": "Standards & support",
    current_status: "Standards & support",
    compiler_support: "Standards & support",
    feature_test: "Standards & support",
    freestanding: "Standards & support",
    standard_library: "Standard library",
    header: "Standard headers",
    symbol_index: "Indexes",
    index: "Indexes",
    links: "Resources",
    meta: "Type support",
    experimental: "Technical specifications",
  },
  c: {
    language: "Language",
    preprocessor: "Language",
    comment: "Language",
    keyword: "Keywords",
    "95": "Standards & support",
    "99": "Standards & support",
    "11": "Standards & support",
    "17": "Standards & support",
    "23": "Standards & support",
    current_status: "Standards & support",
    compiler_support: "Standards & support",
    header: "Standard headers",
    symbol_index: "Indexes",
    index: "Indexes",
    links: "Resources",
    experimental: "Technical specifications",
  },
};

function cleanDomainTitle(title: string): string {
  return title
    .replace(/\s*\((?:since )?C\+\+\d\d\)/g, "")
    .replace(/\s*\([^)]*\)$/, "")
    .replace(/\s+library$/i, "")
    .trim();
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "std::vector<T,Allocator>::push_back" -> "vector::push_back" (lower case). */
function normalizeName(s: string): string {
  let out = "";
  let depth = 0;
  const lower = s
    .toLowerCase()
    .replace(/\s*\((?:since|until|deprecated|removed|c\+\+)[^)]*\)/g, "");
  for (let i = 0; i < lower.length; i++) {
    const c = lower[i];
    if ((c === "<" || c === ">") && depth === 0) {
      // "operator<", "operator<=>", "operator->" are names, not template arguments.
      let j = i;
      while (j > 0 && "<>=-".includes(lower[j - 1])) j--;
      if (lower.slice(0, j).trimEnd().endsWith("operator")) {
        out += c;
        continue;
      }
    }
    if (c === "<") depth++;
    else if (c === ">" && depth > 0) depth--;
    else if (depth === 0) out += c;
  }
  return out.replace(/\bstd::/g, "").replace(/\s+/g, " ").trim();
}

interface IndexedEntry extends CppRefIndexEntry {
  section: string;
  search: { name: string; normalized: string; path: string };
}

interface LangIndexStore {
  entries: IndexedEntry[];
  domains: CppRefDomain[];
  domainEntriesMap: Map<string, IndexedEntry[]>;
  byPath: Map<string, IndexedEntry>;
}

function buildLangStore(lang: ReferenceLang): LangIndexStore {
  const listed = listedReferenceEntries(lang).filter((e) => e.path !== "");
  const topTitles = new Map(
    listed.filter((e) => !e.path.includes("/")).map((e) => [e.path, e.title])
  );
  const domainOf = (p: string) => {
    const seg = p.split("/")[0];
    return (
      DOMAIN_GROUPS[lang][seg] ?? cleanDomainTitle(topTitles.get(seg) ?? seg)
    );
  };

  const entries: IndexedEntry[] = listed.map((e) => ({
    name: e.title,
    path: e.path,
    type: domainOf(e.path),
    section: e.path.split("/")[0],
    search: {
      name: e.title.toLowerCase(),
      normalized: normalizeName(e.title),
      path: e.path.toLowerCase(),
    },
  }));

  const domainEntriesMap = new Map<string, IndexedEntry[]>();
  for (const e of entries) {
    const list = domainEntriesMap.get(e.type);
    if (list) list.push(e);
    else domainEntriesMap.set(e.type, [e]);
  }

  return {
    entries,
    domains: [...domainEntriesMap]
      .map(([name, list]) => ({ name, count: list.length, slug: slugify(name) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    domainEntriesMap,
    byPath: new Map(entries.map((e) => [e.path, e])),
  };
}

const stores = new Map<ReferenceLang, LangIndexStore>();

function getStore(lang: ReferenceLang): LangIndexStore {
  let store = stores.get(lang);
  if (!store) {
    store = buildLangStore(lang);
    stores.set(lang, store);
  }
  return store;
}

export interface IndexStats {
  /** Listed pages (excluding redirects and the root page). */
  pages: number;
  domainCount: number;
}

export function getIndexStats(lang: ReferenceLang | "all"): IndexStats {
  if (lang === "all") {
    const cpp = getIndexStats("cpp");
    const c = getIndexStats("c");
    return {
      pages: cpp.pages + c.pages,
      domainCount: cpp.domainCount + c.domainCount,
    };
  }
  const store = getStore(lang);
  return { pages: store.entries.length, domainCount: store.domains.length };
}

/** Listed pages at or below a path ("container" -> container and everything under it). */
export function countPagesUnderPrefix(lang: ReferenceLang, prefix: string): number {
  const p = prefix.replace(/\/+$/, "");
  return getStore(lang).entries.filter(
    (e) => e.path === p || e.path.startsWith(`${p}/`)
  ).length;
}

export function getDomainsForLang(lang: ReferenceLang): CppRefDomain[] {
  return getStore(lang).domains;
}

export function getEntriesForLangDomain(
  lang: ReferenceLang,
  domainName: string
): CppRefIndexEntry[] {
  return getStore(lang).domainEntriesMap.get(domainName) ?? [];
}

/** Directory entry for a page: its title and domain (undefined for the root). */
export function getIndexEntry(
  lang: ReferenceLang,
  cleanPath: string
): CppRefIndexEntry | undefined {
  return getStore(lang).byPath.get(cleanPath);
}

export interface SearchResultItem {
  lang: ReferenceLang;
  name: string;
  path: string;
  urlPath: string;
  type: string;
  hasCompanion: boolean;
  companionShortTitle?: string;
}

/** Sections that rarely hold the page someone is looking for. */
const SECTION_PENALTY: Record<string, number> = {
  experimental: 30,
  symbol_index: 35,
  compiler_support: 15,
  header: 6,
  keyword: 4,
};

function toResult(lang: ReferenceLang, entry: CppRefIndexEntry): SearchResultItem {
  const companion = lang === "cpp" ? getCompanionForPath(entry.path) : undefined;
  return {
    lang,
    name: entry.name,
    path: entry.path,
    urlPath: referenceHref(lang, entry.path),
    type: entry.type,
    hasCompanion: Boolean(companion),
    companionShortTitle: companion?.shortTitle,
  };
}

export function searchCppRefIndex(
  query: string,
  domain?: string,
  limit = 40,
  langFilter: "all" | ReferenceLang = "all"
): SearchResultItem[] {
  const trimmed = query.trim().toLowerCase();
  const normalizedQuery = normalizeName(trimmed);
  const hasDomainFilter = Boolean(domain && domain !== "all");

  const pools: { lang: ReferenceLang; entries: IndexedEntry[] }[] = [];
  for (const lang of ["cpp", "c"] as const) {
    if (langFilter !== "all" && langFilter !== lang) continue;
    const store = getStore(lang);
    pools.push({
      lang,
      entries: hasDomainFilter
        ? store.domainEntriesMap.get(domain!) ?? []
        : store.entries,
    });
  }

  if (!trimmed) {
    // Pages with a study companion first, then tree order.
    const out: SearchResultItem[] = [];
    for (const { lang, entries } of pools) {
      if (lang !== "cpp") continue;
      for (const e of entries) {
        if (getCompanionForPath(e.path)) out.push(toResult(lang, e));
      }
    }
    for (const { lang, entries } of pools) {
      for (const e of entries) {
        if (out.length >= limit) break;
        if (lang === "cpp" && getCompanionForPath(e.path)) continue;
        out.push(toResult(lang, e));
      }
    }
    return out.slice(0, limit);
  }

  const scored: { item: SearchResultItem; score: number }[] = [];

  for (const { lang, entries } of pools) {
    for (const entry of entries) {
      const { name, normalized, path } = entry.search;
      let score = 0;

      if (
        name === trimmed ||
        normalized === normalizedQuery ||
        path === trimmed
      ) {
        score = 100;
      } else if (
        name.startsWith(trimmed) ||
        normalized.startsWith(normalizedQuery)
      ) {
        score = 80;
      } else if (
        normalized.includes("::" + normalizedQuery) ||
        path.endsWith("/" + trimmed)
      ) {
        score = 70;
      } else if (
        name.includes(trimmed) ||
        normalized.includes(normalizedQuery)
      ) {
        score = 50;
      } else if (path.includes(trimmed)) {
        score = 35;
      }

      if (score > 0) {
        const item = toResult(lang, entry);
        if (item.hasCompanion) score += 8;
        if (lang === "cpp") score += 2;
        score -= SECTION_PENALTY[entry.section] ?? 0;
        scored.push({ score, item });
      }
    }
  }

  scored.sort(
    (a, b) => b.score - a.score || a.item.name.length - b.item.name.length
  );

  return scored.slice(0, limit).map((s) => s.item);
}

/** Other listed pages under the same parent, in tree order. */
export function getSiblingPages(
  lang: ReferenceLang,
  cleanPath: string
): CppRefIndexEntry[] {
  const entry = getReferenceEntry(lang, cleanPath);
  if (!entry || entry.parent === null) return [];
  return getReferenceChildren(lang, entry.parent)
    .filter((c) => c.kind !== "redirect" && c.path !== entry.path)
    .map((c) => getStore(lang).byPath.get(c.path) ?? { name: c.title, path: c.path, type: "" });
}
