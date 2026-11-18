#!/usr/bin/env node
/**
 * Re-run the integrity checks over data/reference (C++) and data/reference-c (C),
 * the output of import-cppreference.mjs: counts, link resolution (including links
 * between the C and C++ sets), fragments, safety scan and sizes.
 *
 *   node scripts/check-reference.mjs [--archive <dir>] [--route-prefix </w>] [--verbose]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LANGS = { cpp: path.join(ROOT, "data", "reference"), c: path.join(ROOT, "data", "reference-c") };
const PUBLIC_DIR = path.join(ROOT, "public", "cppreference");
const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const archiveArg = args.indexOf("--archive");
const ARCHIVE =
  archiveArg >= 0
    ? path.resolve(args[archiveArg + 1])
    : process.env.CPPREFERENCE_ARCHIVE
      ? path.resolve(process.env.CPPREFERENCE_ARCHIVE)
      : path.join(ROOT, ".archive", "book", "reference");
const prefixArg = args.indexOf("--route-prefix");
const ROUTE_PREFIX = prefixArg >= 0 ? ("/" + args[prefixArg + 1].replace(/^\/+|\/+$/g, "")).replace(/^\/$/, "") : "/w";

const failures = [];
const fail = (msg) => failures.push(msg);

const fileKey = (e) => e.file ?? (e.path === "" ? "_root" : e.path.replace(/\*/g, "_star_").replace(/"/g, "_q_"));

function decodeAttr(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function countArchive(dir, lang) {
  const en = path.join(dir, "en");
  if (!fs.existsSync(path.join(en, `${lang}.html`))) return null;
  let n = 1;
  const stack = [path.join(en, lang)];
  while (stack.length) {
    const d = stack.pop();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) stack.push(path.join(d, e.name));
      else if (e.name.endsWith(".html")) n++;
    }
  }
  return n;
}

function dirSize(dir) {
  let total = 0;
  let files = 0;
  if (!fs.existsSync(dir)) return { total, files };
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else {
        total += fs.statSync(p).size;
        files++;
      }
    }
  }
  return { total, files };
}

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;

const sets = {};
for (const [lang, DATA] of Object.entries(LANGS)) {
const index = JSON.parse(fs.readFileSync(path.join(DATA, "index.json"), "utf8"));
const tree = JSON.parse(fs.readFileSync(path.join(DATA, "tree.json"), "utf8"));
const byPath = new Map(index.map((e) => [e.path, e]));
if (byPath.size !== index.length) fail(`${lang}: duplicate paths in index.json`);
console.log(`\n== ${lang} (${path.relative(ROOT, DATA)}) ==`);

// ---- counts ----------------------------------------------------------------
const archiveCount = countArchive(ARCHIVE, lang);
console.log(`archive ${lang} html files: ${archiveCount ?? "(archive not present)"}; index entries: ${index.length}`);
if (archiveCount !== null && archiveCount !== index.length) fail(`count mismatch: archive ${archiveCount} vs index ${index.length}`);
const kinds = {};
const sections = {};
const indexBySection = {};
for (const e of index) {
  kinds[e.kind] = (kinds[e.kind] || 0) + 1;
  const s = e.section || "(root)";
  sections[s] = (sections[s] || 0) + 1;
  if (e.kind === "index") indexBySection[s] = (indexBySection[s] || 0) + 1;
}
console.log(`by kind: ${JSON.stringify(kinds)}`);
console.log(`by section: ${JSON.stringify(sections)}`);
console.log(`kind:index by section: ${JSON.stringify(indexBySection)}`);

const lower = new Map();
for (const e of index) {
  const l = e.path.toLowerCase();
  lower.set(l, [...(lower.get(l) || []), e.path]);
}
const collisions = [...lower.values()].filter((g) => g.length > 1);
console.log(`case-insensitive path collisions: ${JSON.stringify(collisions)} (resolved via index "file": ${index.filter((e) => e.file).map((e) => `${e.path} -> ${e.file}`).join(", ") || "none"})`);
const fileLower = new Map();
for (const e of index) {
  const k = fileKey(e).toLowerCase();
  if (fileLower.has(k)) fail(`file key collision ${fileLower.get(k)} / ${e.path}`);
  fileLower.set(k, e.path);
}

// ---- tree ------------------------------------------------------------------
const inTree = new Set();
const walkTree = (n, depth) => {
  if (inTree.has(n.path)) fail(`tree: duplicate ${n.path}`);
  inTree.add(n.path);
  if (!byPath.has(n.path)) fail(`tree: unknown path ${n.path}`);
  for (const c of n.children) walkTree(c, depth + 1);
};
walkTree(tree, 0);
for (const e of index) if (e.kind !== "redirect" && !inTree.has(e.path)) fail(`tree: page missing ${e.path}`);
for (const e of index) if (e.parent !== null && !byPath.has(e.parent)) fail(`parent missing for ${e.path}`);

// ---- pages -----------------------------------------------------------------
const pages = new Map();
const sizes = [];
for (const e of index) {
  const f = path.join(DATA, "pages", fileKey(e) + ".json");
  const m = path.join(DATA, "md", fileKey(e) + ".md");
  if (!fs.existsSync(f)) {
    fail(`missing page file for ${e.path}`);
    continue;
  }
  if (!fs.existsSync(m)) fail(`missing md file for ${e.path}`);
  const raw = fs.readFileSync(f, "utf8");
  const page = JSON.parse(raw);
  if (page.path !== e.path) fail(`path mismatch in ${f}`);
  if (page.kind === "redirect" && !byPath.has(page.redirectTo)) fail(`redirect target missing: ${e.path} -> ${page.redirectTo}`);
  const ids = new Set([...page.html.matchAll(/\sid="([^"]*)"/g)].map((x) => decodeAttr(x[1])));
  const names = new Set([...page.html.matchAll(/<(?:a|map)\s[^>]*name="([^"]*)"/g)].map((x) => decodeAttr(x[1])));
  for (const n of names) ids.add(n);
  for (const h of page.headings) if (!ids.has(h.id)) fail(`heading id not in html: ${e.path}#${h.id}`);
  pages.set(e.path, { page, ids });
  sizes.push([raw.length, e.path]);
}

sets[lang] = { index, byPath, pages, sizes, DATA };
}

// ---- links -----------------------------------------------------------------
let internal = 0;
let crossLang = 0;
let external = 0;
let inPage = 0;
const broken = [];
const badFragments = [];
const badInPage = [];
const allPages = Object.entries(sets).flatMap(([lang, s]) => [...s.pages].map(([p, v]) => [lang, p, v]));
for (const [lang, p0, { page, ids }] of allPages) {
  const p = `${lang}:${p0 || "(root)"}`;
  for (const m of page.html.matchAll(/<(?:a|area)\s[^>]*?href="([^"]*)"/g)) {
    const href = decodeAttr(m[1]);
    if (href.startsWith("#")) {
      inPage++;
      const frag = href.slice(1);
      if (frag && !ids.has(frag) && !ids.has(decodeURIComponentSafe(frag))) badInPage.push(`${p} ${href}`);
      continue;
    }
    const route = Object.keys(LANGS).find((l) => {
      const base = `${ROUTE_PREFIX}/${l}`;
      return href === base || href.startsWith(base + "/") || href.startsWith(base + "#");
    });
    if (route) {
      internal++;
      if (route !== lang) crossLang++;
      const base = `${ROUTE_PREFIX}/${route}`;
      const [pathPart, ...rest] = href.split("#");
      const frag = rest.join("#");
      const target = pathPart === base ? "" : pathPart.slice(base.length + 1).split("/").map(decodeURIComponentSafe).join("/");
      if (!sets[route].byPath.has(target)) {
        broken.push(`${p} -> ${href}`);
        continue;
      }
      if (frag) {
        const t = sets[route].pages.get(target);
        if (t && !t.ids.has(frag) && !t.ids.has(decodeURIComponentSafe(frag))) badFragments.push(`${p} -> ${href}`);
      }
      continue;
    }
    if (/^https?:\/\//.test(href) || href.startsWith("mailto:")) {
      external++;
      if (!/data-external="1"/.test(m[0]) && !/data-external="1"/.test(page.html.slice(m.index, page.html.indexOf(">", m.index)))) {
        fail(`external link without data-external: ${p} ${href}`);
      }
      continue;
    }
    if (href.startsWith("/cppreference/")) continue;
    fail(`unexpected href ${p}: ${href}`);
  }
  for (const m of page.html.matchAll(/<img\s[^>]*src="([^"]*)"/g)) {
    const src = decodeAttr(m[1]);
    if (!src.startsWith("/cppreference/")) fail(`image src not local: ${p} ${src}`);
    else if (!fs.existsSync(path.join(ROOT, "public", decodeURIComponentSafe(src)))) fail(`image file missing: ${p} ${src}`);
  }
}
function decodeURIComponentSafe(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
console.log(`\nlinks (both sets): internal ${internal} (broken ${broken.length}; C<->C++ ${crossLang}), external ${external}, in-page ${inPage}`);
console.log(`unresolved fragments: cross-page ${badFragments.length}, in-page ${badInPage.length}`);
if (broken.length) fail(`${broken.length} broken internal links, e.g. ${broken.slice(0, 5).join("; ")}`);
if (verbose) {
  for (const b of badFragments) console.log(`  fragment: ${b}`);
  for (const b of badInPage) console.log(`  in-page: ${b}`);
} else {
  if (badFragments.length) console.log(`  e.g. ${badFragments.slice(0, 8).join("\n       ")}`);
  if (badInPage.length) console.log(`  e.g. ${badInPage.slice(0, 8).join("\n       ")}`);
}

// ---- safety ----------------------------------------------------------------
const patterns = {
  "<script": /<script/gi,
  " on\\w+=": / on\w+=/gi,
  "javascript:": /javascript:/gi,
  "<iframe": /<iframe/gi,
  "style=": /style=/gi,
};
const attrPatterns = {
  "event-handler attribute": /<[a-z][^>]*\son\w+\s*=/gi,
  "style attribute": /<[a-z][^>]*\sstyle\s*=/gi,
  "javascript: URL": /(?:href|src)\s*=\s*"\s*javascript:/gi,
  "forbidden tag": /<(?:script|iframe|object|embed|form|input|button|textarea|select|style|link|meta|base|svg|math)\b/gi,
};
const rawHits = Object.fromEntries(Object.keys(patterns).map((k) => [k, 0]));
const attrHits = Object.fromEntries(Object.keys(attrPatterns).map((k) => [k, 0]));
const rawExamples = [];
for (const [lang, p0, { page }] of allPages) {
  const p = `${lang}:${p0 || "(root)"}`;
  const html = page.html + page.titleHtml;
  for (const [k, re] of Object.entries(patterns)) {
    for (const m of html.matchAll(re)) {
      rawHits[k]++;
      if (rawExamples.length < 10) rawExamples.push(`${p}: …${html.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\n/g, " ")}…`);
    }
  }
  for (const [k, re] of Object.entries(attrPatterns)) {
    const n = [...html.matchAll(re)].length;
    if (n) {
      attrHits[k] += n;
      fail(`unsafe markup (${k}) in ${p}`);
    }
  }
}
console.log(`safety (raw text scan): ${JSON.stringify(rawHits)}`);
if (rawExamples.length) console.log(`  raw hits are inside text/code, e.g.\n  ${rawExamples.join("\n  ")}`);
console.log(`safety (markup scan): ${JSON.stringify(attrHits)}`);

// ---- sizes -----------------------------------------------------------------
const sz = { "public/cppreference": dirSize(PUBLIC_DIR) };
for (const [lang, { DATA }] of Object.entries(sets)) {
  sz[`${lang} pages`] = dirSize(path.join(DATA, "pages"));
  sz[`${lang} md`] = dirSize(path.join(DATA, "md"));
}
const sizes = Object.entries(sets).flatMap(([lang, s]) => s.sizes.map(([n, p]) => [n, `${lang}:${p}`]));
console.log(`sizes: ${Object.entries(sz).map(([k, v]) => `${k} ${mb(v.total)} (${v.files} files)`).join(", ")}`);
sizes.sort((a, b) => b[0] - a[0]);
console.log(`largest pages: ${sizes.slice(0, 10).map(([n, p]) => `${p} ${(n / 1024).toFixed(0)} KB`).join(", ")}`);

if (failures.length) {
  console.log(`\nFAILED (${failures.length}):`);
  for (const f of failures.slice(0, 50)) console.log(`  ${f}`);
  process.exit(1);
}
console.log("\nOK");
