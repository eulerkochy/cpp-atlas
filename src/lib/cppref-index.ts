import fullCppIndexData from "@/data/cppref-full-index.json";
import fullCIndexData from "@/data/c-full-index.json";
import { getCompanionForPath } from "@/data/companions";
import { CppRefDomain, CppRefIndexEntry, ReferenceLang } from "@/types/cpp";

interface RawIndexPayload {
  entries: CppRefIndexEntry[];
  types: CppRefDomain[];
}

interface LangIndexStore {
  entries: CppRefIndexEntry[];
  domains: CppRefDomain[];
  uniquePaths: string[];
  entryByPathMap: Map<string, CppRefIndexEntry[]>;
  domainEntriesMap: Map<string, CppRefIndexEntry[]>;
}

function buildLangStore(raw: RawIndexPayload): LangIndexStore {
  const entryByPathMap = new Map<string, CppRefIndexEntry[]>();
  const domainEntriesMap = new Map<string, CppRefIndexEntry[]>();
  const uniquePathSet = new Set<string>();

  for (const entry of raw.entries) {
    const cleanPath = entry.path.split("#")[0];
    uniquePathSet.add(cleanPath);

    const existingForPath = entryByPathMap.get(cleanPath);
    if (existingForPath) {
      existingForPath.push(entry);
    } else {
      entryByPathMap.set(cleanPath, [entry]);
    }

    const existingForDomain = domainEntriesMap.get(entry.type);
    if (existingForDomain) {
      existingForDomain.push(entry);
    } else {
      domainEntriesMap.set(entry.type, [entry]);
    }
  }

  return {
    entries: raw.entries,
    domains: [...raw.types].sort((a, b) => a.name.localeCompare(b.name)),
    uniquePaths: Array.from(uniquePathSet).sort(),
    entryByPathMap,
    domainEntriesMap,
  };
}

const cppStore = buildLangStore(fullCppIndexData as RawIndexPayload);
const cStore = buildLangStore(fullCIndexData as RawIndexPayload);

function getStore(lang: ReferenceLang): LangIndexStore {
  return lang === "c" ? cStore : cppStore;
}

export const ALL_CPPREF_ENTRIES = cppStore.entries;
export const ALL_CPPREF_DOMAINS = cppStore.domains;
export const UNIQUE_CPPREF_PATHS = cppStore.uniquePaths;

export const ALL_CREF_ENTRIES = cStore.entries;
export const ALL_CREF_DOMAINS = cStore.domains;
export const UNIQUE_CREF_PATHS = cStore.uniquePaths;

export const INDEX_STATS = {
  totalEntries: cppStore.entries.length,
  uniquePages: cppStore.uniquePaths.length,
  domainCount: cppStore.domains.length,
};

export const C_INDEX_STATS = {
  totalEntries: cStore.entries.length,
  uniquePages: cStore.uniquePaths.length,
  domainCount: cStore.domains.length,
};

export const TOTAL_COMBINED_STATS = {
  totalEntries: cppStore.entries.length + cStore.entries.length,
  uniquePages: cppStore.uniquePaths.length + cStore.uniquePaths.length,
  domainCount: cppStore.domains.length + cStore.domains.length,
};

const PATH_ALIASES: Record<string, string> = {
  header: "headers",
  headers: "header",
};

function normalizeLookupPath(rawPath: string): string {
  return rawPath.split("#")[0].replace(/^\/+|\/+$/g, "");
}

function lookupEntriesByLangPath(
  store: LangIndexStore,
  rawPath: string
): CppRefIndexEntry[] {
  const cleanPath = normalizeLookupPath(rawPath);
  if (!cleanPath) return [];
  const direct = store.entryByPathMap.get(cleanPath);
  if (direct && direct.length > 0) return direct;
  const alias = PATH_ALIASES[cleanPath];
  return alias ? store.entryByPathMap.get(alias) ?? [] : [];
}

function collectDirectChildren(
  store: LangIndexStore,
  prefix: string
): CppRefIndexEntry[] {
  const childPrefix = `${prefix}/`;
  const seenPaths = new Set<string>();
  const matches: CppRefIndexEntry[] = [];

  for (const entry of store.entries) {
    const p = entry.path.split("#")[0];
    if (p.startsWith(childPrefix)) {
      const remainder = p.slice(childPrefix.length);
      if (remainder.length > 0 && !remainder.includes("/") && !seenPaths.has(p)) {
        seenPaths.add(p);
        matches.push(entry);
      }
    }
  }

  return matches.sort(
    (a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path)
  );
}

export function getDomainsForLang(lang: ReferenceLang): CppRefDomain[] {
  return getStore(lang).domains;
}

export function countUniquePagesUnderPrefix(
  lang: ReferenceLang,
  prefix: string
): number {
  const paths = getStore(lang).uniquePaths;
  const cleanPrefix = normalizeLookupPath(prefix);
  if (!cleanPrefix) {
    return paths.length;
  }
  let count = 0;
  for (const p of paths) {
    if (p === cleanPrefix || p.startsWith(`${cleanPrefix}/`)) {
      count++;
    }
  }
  return count;
}

export function getEntriesForLangDomain(
  lang: ReferenceLang,
  domainName: string
): CppRefIndexEntry[] {
  return getStore(lang).domainEntriesMap.get(domainName) ?? [];
}

export function getEntriesForDomain(domainName: string): CppRefIndexEntry[] {
  return cppStore.domainEntriesMap.get(domainName) ?? [];
}

export function getEntriesForPath(cleanPath: string): CppRefIndexEntry[] {
  return lookupEntriesByLangPath(cppStore, cleanPath);
}

export function getPrimaryEntryForPath(
  cleanPath: string
): CppRefIndexEntry | undefined {
  return lookupEntriesByLangPath(cppStore, cleanPath)[0];
}

export function getPrimaryEntryForLangPath(
  lang: ReferenceLang,
  cleanPath: string
): CppRefIndexEntry | undefined {
  return lookupEntriesByLangPath(getStore(lang), cleanPath)[0];
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

export function searchCppRefIndex(
  query: string,
  domain?: string,
  limit = 40,
  langFilter: "all" | ReferenceLang = "all"
): SearchResultItem[] {
  const trimmed = query.trim().toLowerCase();
  const hasDomainFilter = Boolean(domain && domain !== "all");

  const pools: { lang: ReferenceLang; entries: CppRefIndexEntry[] }[] = [];
  if (langFilter === "all" || langFilter === "cpp") {
    const entries = hasDomainFilter
      ? cppStore.domainEntriesMap.get(domain!) ?? []
      : cppStore.entries;
    pools.push({ lang: "cpp", entries });
  }
  if (langFilter === "all" || langFilter === "c") {
    const entries = hasDomainFilter
      ? cStore.domainEntriesMap.get(domain!) ?? []
      : cStore.entries;
    pools.push({ lang: "c", entries });
  }

  if (!trimmed) {
    const prioritized: SearchResultItem[] = [];
    const seen = new Set<string>();
    for (const { lang, entries } of pools) {
      if (lang !== "cpp") continue;
      for (const entry of entries) {
        const cleanPath = entry.path.split("#")[0];
        const companion = getCompanionForPath(cleanPath);
        const key = `${lang}:${entry.path}:${entry.name}`;
        if (companion && !seen.has(key)) {
          seen.add(key);
          prioritized.push({
            lang,
            name: entry.name,
            path: entry.path,
            urlPath: `/w/${lang}/${entry.path}`,
            type: entry.type,
            hasCompanion: true,
            companionShortTitle: companion.shortTitle,
          });
        }
      }
    }
    for (const { lang, entries } of pools) {
      for (const entry of entries) {
        if (prioritized.length >= limit) break;
        const key = `${lang}:${entry.path}:${entry.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        prioritized.push({
          lang,
          name: entry.name,
          path: entry.path,
          urlPath: `/w/${lang}/${entry.path}`,
          type: entry.type,
          hasCompanion: false,
        });
      }
    }
    return prioritized.slice(0, limit);
  }

  const scored: { item: SearchResultItem; score: number }[] = [];

  for (const { lang, entries } of pools) {
    for (const entry of entries) {
      const nameLower = entry.name.toLowerCase();
      const pathLower = entry.path.toLowerCase();
      let score = 0;

      if (nameLower === trimmed || pathLower === trimmed) {
        score = 100;
      } else if (nameLower.startsWith(trimmed)) {
        score = 80;
      } else if (
        nameLower.includes("::" + trimmed) ||
        pathLower.endsWith("/" + trimmed)
      ) {
        score = 70;
      } else if (nameLower.includes(trimmed)) {
        score = 50;
      } else if (pathLower.includes(trimmed)) {
        score = 35;
      }

      if (score > 0) {
        const cleanPath = entry.path.split("#")[0];
        const companion =
          lang === "cpp" ? getCompanionForPath(cleanPath) : undefined;
        if (companion) score += 8;
        if (lang === "cpp") score += 2;
        scored.push({
          score,
          item: {
            lang,
            name: entry.name,
            path: entry.path,
            urlPath: `/w/${lang}/${entry.path}`,
            type: entry.type,
            hasCompanion: Boolean(companion),
            companionShortTitle: companion?.shortTitle,
          },
        });
      }
    }
  }

  scored.sort(
    (a, b) => b.score - a.score || a.item.name.length - b.item.name.length
  );

  return scored.slice(0, limit).map((s) => s.item);
}

export interface RelatedPages {
  parent: CppRefIndexEntry | null;
  children: CppRefIndexEntry[];
  siblings: CppRefIndexEntry[];
  totalChildren: number;
  totalSiblings: number;
}

export function getRelatedPagesForLangPath(
  lang: ReferenceLang,
  cleanPath: string,
  limits?: { children?: number; siblings?: number }
): RelatedPages {
  const normalized = normalizeLookupPath(cleanPath);
  if (!normalized || normalized === "index") {
    return {
      parent: null,
      children: [],
      siblings: [],
      totalChildren: 0,
      totalSiblings: 0,
    };
  }

  const store = getStore(lang);
  const segments = normalized.split("/");
  const parentPath = segments.length > 1 ? segments.slice(0, -1).join("/") : null;
  const parent = parentPath
    ? lookupEntriesByLangPath(store, parentPath)[0] ?? null
    : null;

  let allChildren = collectDirectChildren(store, normalized);
  if (allChildren.length === 0 && PATH_ALIASES[normalized]) {
    allChildren = collectDirectChildren(store, PATH_ALIASES[normalized]);
  }

  let allSiblings: CppRefIndexEntry[] = [];
  if (parentPath) {
    allSiblings = collectDirectChildren(store, parentPath).filter(
      (entry) => entry.path.split("#")[0] !== normalized
    );
    if (allSiblings.length === 0 && PATH_ALIASES[parentPath]) {
      allSiblings = collectDirectChildren(store, PATH_ALIASES[parentPath]).filter(
        (entry) => entry.path.split("#")[0] !== normalized
      );
    }
  }

  const childLimit = limits?.children ?? 28;
  const siblingLimit = limits?.siblings ?? 20;

  return {
    parent,
    children: allChildren.slice(0, childLimit),
    siblings: allSiblings.slice(0, siblingLimit),
    totalChildren: allChildren.length,
    totalSiblings: allSiblings.length,
  };
}

export function getRelatedPagesForPath(
  cleanPath: string,
  limits?: { children?: number; siblings?: number }
): RelatedPages {
  return getRelatedPagesForLangPath("cpp", cleanPath, limits);
}

export function getChildrenUnderPrefix(
  lang: ReferenceLang,
  prefix: string
): CppRefIndexEntry[] {
  const store = getStore(lang);
  const cleanPrefix = normalizeLookupPath(prefix);
  if (!cleanPrefix) return [];

  const collectUnder = (pPrefix: string): CppRefIndexEntry[] => {
    const searchPrefix = `${pPrefix}/`;
    const seen = new Set<string>();
    const matches: CppRefIndexEntry[] = [];
    for (const entry of store.entries) {
      const p = entry.path.split("#")[0];
      if (p.startsWith(searchPrefix) && !seen.has(p)) {
        seen.add(p);
        matches.push(entry);
      }
    }
    return matches.sort((a, b) => a.path.localeCompare(b.path));
  };

  const direct = collectUnder(cleanPrefix);
  if (direct.length > 0) return direct;
  const alias = PATH_ALIASES[cleanPrefix];
  return alias ? collectUnder(alias) : [];
}
