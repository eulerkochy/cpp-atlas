#!/usr/bin/env node
/**
 * Import the cppreference offline archive (html-book) into clean per-page data.
 *
 *   node scripts/import-cppreference.mjs [--archive <dir>] [--lang cpp|c|all]
 *                                        [--route-prefix </w>] [--only <path-prefix>] [--jobs <n>]
 *
 * Input:  <archive> (default .archive/book/reference, or $CPPREFERENCE_ARCHIVE):
 *         en/cpp.html + en/cpp/**.html, en/c.html + en/c/**.html, common/
 *         (extracted from .archive/html-book-20250209.tar.xz when missing)
 * Output: data/reference/{index.json,tree.json,paths.json,pages/**.json,md/**.md}     C++ (en/cpp)
 *         data/reference-c/{index.json,tree.json,paths.json,pages/**.json,md/**.md}   C   (en/c)
 *         public/cppreference/images/** (images referenced by the pages)
 *
 * Both page sets are always discovered, so links between C and C++ pages resolve to
 * internal routes (<route-prefix>/cpp/... and <route-prefix>/c/...) even when only
 * one language is converted.
 *
 * Content: cppreference.com, CC-BY-SA 3.0 / GFDL.
 *
 * Name mapping (archive file <-> page path <-> live URL), per language <lang>:
 *   - path = archive file name below en/<lang>/ without ".html"; en/<lang>.html is the root "".
 *   - the archive encodes "*" as "_star_" and '"' as "_q_" (operator*, operator""s);
 *     every other character ("=", "()", "~", "!", "+", "-") is stored literally.
 *   - the archive resolves the single case-insensitive clash (numeric/math/NAN vs nan)
 *     by renaming one file "nan.2.html"; the suffix is dropped again here.
 *   - originalUrl = https://en.cppreference.com/w/<lang>/<path, percent-encoded per segment>.
 *   - route       = <route-prefix>/<lang>/<same encoding> (default prefix "/w").
 *   - on disk a page lives at pages/<fileKey>.json, where fileKey re-applies the archive
 *     encoding ("*" -> "_star_", '"' -> "_q_"), "_root" is the root page, and case
 *     clashes keep the archive's ".2" suffix (recorded as `file` in index.json).
 *   - redirect sources (the archive stores a full copy of the target) are detected
 *     through `wgPageName` and become {kind: "redirect", redirectTo}.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { execFileSync } from "node:child_process";
import * as cheerio from "cheerio";

const SCRIPT = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT), "..");
const PUBLIC_DIR = path.join(ROOT, "public", "cppreference");
const PUBLIC_URL = "/cppreference";
const LIVE = "https://en.cppreference.com/w/";
const DEFAULT_ARCHIVE = process.env.CPPREFERENCE_ARCHIVE
  ? path.resolve(process.env.CPPREFERENCE_ARCHIVE)
  : path.join(ROOT, ".archive", "book", "reference");
const DEFAULT_TARBALL = path.join(ROOT, ".archive", "html-book-20250209.tar.xz");

/** Page sets: archive directory below en/, output root and display name. */
const LANGS = {
  cpp: { out: path.join(ROOT, "data", "reference"), name: "C++" },
  c: { out: path.join(ROOT, "data", "reference-c"), name: "C" },
};

/** Site route prefix; set from --route-prefix (main) or workerData (workers). */
let ROUTE_PREFIX = "/w";

/* ------------------------------------------------------------------------ */
/* Names and URLs                                                            */
/* ------------------------------------------------------------------------ */

function decodeSegment(seg) {
  return seg.replace(/_star_/g, "*").replace(/_q_/g, '"');
}

function fileKeyFor(p) {
  return p === "" ? "_root" : p.replace(/\*/g, "_star_").replace(/"/g, "_q_");
}

function encodePath(p) {
  return p
    .split("/")
    .map((s) =>
      encodeURIComponent(s)
        .replace(/%3D/g, "=")
        .replace(/%2B/g, "+")
        .replace(/%2C/g, ",")
        .replace(/%40/g, "@")
        .replace(/%3A/g, ":"),
    )
    .join("/");
}

const liveUrl = (lang, p) => (p === "" ? `${LIVE}${lang}` : `${LIVE}${lang}/${encodePath(p)}`);
const routeBase = (lang) => `${ROUTE_PREFIX}/${lang}`;
const routeHref = (lang, p) => (p === "" ? routeBase(lang) : `${routeBase(lang)}/${encodePath(p)}`);

/** Split an internal route href into {lang, path, frag}; null for anything else. */
function parseRouteHref(h) {
  for (const lang of Object.keys(LANGS)) {
    const base = routeBase(lang);
    if (h !== base && !h.startsWith(base + "/") && !h.startsWith(base + "#")) continue;
    const at = h.indexOf("#");
    const pathPart = at < 0 ? h : h.slice(0, at);
    const p = pathPart.slice(base.length + 1).split("/").map((x) => decodeURIComponentSafe(x)).join("/");
    return { lang, path: p, frag: at < 0 ? null : h.slice(at + 1) };
  }
  return null;
}

function sectionOf(p) {
  return p.includes("/") ? p.split("/")[0] : "";
}

/** Live URL for an arbitrary wiki title such as "c/language/ Alignas". */
function liveUrlForTitle(title) {
  const t = title.replace(/ \(page does not exist\)$/, "").replace(/ /g, "_");
  return LIVE + t.split("/").map((s) => encodePath(s)).join("/");
}

/* ------------------------------------------------------------------------ */
/* Small helpers                                                             */
/* ------------------------------------------------------------------------ */

const isTag = (n) => n && (n.type === "tag" || n.type === "script" || n.type === "style");
const hasClass = (n, c) => isTag(n) && (" " + (n.attribs.class || "") + " ").includes(" " + c + " ");
const classList = (n) => (isTag(n) ? (n.attribs.class || "").split(/\s+/).filter(Boolean) : []);
const collapse = (s) => s.replace(/[\s ﻿​]+/g, " ").trim();

function textOf(n) {
  if (!n) return "";
  if (n.type === "text") return n.data;
  if (!n.children) return "";
  let s = "";
  for (const c of n.children) s += textOf(c);
  return s;
}

function* descendants(n) {
  for (const c of n.children || []) {
    yield c;
    yield* descendants(c);
  }
}

function findAll(n, pred) {
  const out = [];
  for (const d of descendants(n)) if (isTag(d) && pred(d)) out.push(d);
  return out;
}

function closest(n, pred) {
  for (let p = n.parent; p; p = p.parent) if (isTag(p) && pred(p)) return p;
  return null;
}

function elementChildren(n) {
  return (n.children || []).filter(isTag);
}

function wordCount(s) {
  const m = s.match(/[^\s]+/g);
  return m ? m.length : 0;
}

function truncate(s, max) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.]+$/, "") + "…";
}

/** First sentence(s) of a piece of prose, up to max characters. */
function firstSentences(text, max) {
  const t = collapse(text);
  if (!t) return "";
  const parts = t.split(/(?<=[.!?])\s+(?=[A-Z(`"'\[]|std::)/);
  let out = "";
  for (const p of parts) {
    const next = out ? out + " " + p : p;
    if (next.length > max) break;
    out = next;
    if (out.length > max * 0.5) break;
  }
  return out || truncate(t, max);
}

const STD_ORDER = (v) => {
  const n = Number(v);
  return n >= 89 ? 1900 + n : 2000 + n;
};

/* ------------------------------------------------------------------------ */
/* Main thread                                                               */
/* ------------------------------------------------------------------------ */

function parseArgs(argv) {
  const args = {
    archive: DEFAULT_ARCHIVE,
    langs: Object.keys(LANGS),
    routePrefix: "/w",
    only: null,
    jobs: Math.max(1, Math.min(os.cpus().length - 1, 10)),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--archive") args.archive = path.resolve(argv[++i]);
    else if (a === "--lang") {
      const v = argv[++i];
      if (v !== "all" && !LANGS[v]) throw new Error(`--lang must be cpp, c or all (got ${v})`);
      args.langs = v === "all" ? Object.keys(LANGS) : [v];
    } else if (a === "--route-prefix") args.routePrefix = ("/" + argv[++i].replace(/^\/+|\/+$/g, "")).replace(/^\/$/, "");
    else if (a === "--only") args.only = argv[++i].replace(/^\/+|\/+$/g, "");
    else if (a === "--jobs") args.jobs = Number(argv[++i]) || 1;
    else if (a === "--help" || a === "-h") {
      console.log(
        "usage: node scripts/import-cppreference.mjs [--archive <dir>] [--lang cpp|c|all] [--route-prefix </w>] [--only <path-prefix>] [--jobs <n>]",
      );
      process.exit(0);
    } else throw new Error(`unknown argument ${a}`);
  }
  if (args.only !== null && args.langs.length !== 1) throw new Error("--only needs --lang cpp or --lang c");
  return args;
}

function ensureArchive(archive) {
  const ok = () => Object.keys(LANGS).every((l) => fs.existsSync(path.join(archive, "en", `${l}.html`)));
  if (ok()) return;
  if (archive === DEFAULT_ARCHIVE && fs.existsSync(DEFAULT_TARBALL)) {
    const dest = path.dirname(archive);
    console.log(`extracting ${path.relative(ROOT, DEFAULT_TARBALL)} -> ${path.relative(ROOT, dest)}`);
    fs.mkdirSync(dest, { recursive: true });
    execFileSync("tar", ["-xJf", DEFAULT_TARBALL, "-C", dest], { stdio: "inherit" });
  }
  if (!ok()) {
    throw new Error(
      `archive not found at ${archive} (expected en/cpp.html and en/c.html); pass --archive <dir> or set CPPREFERENCE_ARCHIVE`,
    );
  }
}

function walkHtml(dir, rel, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of entries) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walkHtml(path.join(dir, e.name), r, out);
    else if (e.name.endsWith(".html")) out.push(r);
  }
  return out;
}

function discover(archive, lang) {
  const en = path.join(archive, "en");
  const rootRel = `${lang}.html`;
  const rels = [rootRel, ...walkHtml(path.join(en, lang), lang, [])];
  const relSet = new Set(rels);

  const pages = [];
  const warnings = [];
  for (const rel of rels) {
    const key = rel === rootRel ? "" : rel.slice(lang.length + 1, -5);
    const segs = key === "" ? [] : key.split("/");
    if (segs.length) {
      const m = /^(.*)\.(\d+)$/.exec(segs[segs.length - 1]);
      if (m) {
        const base = rel.slice(0, rel.lastIndexOf("/") + 1) + m[1] + ".html";
        const clash = rels.some((r) => r !== rel && r.toLowerCase() === base.toLowerCase());
        if (clash) segs[segs.length - 1] = m[1];
      }
    }
    const p = segs.map(decodeSegment).join("/");
    const src = fs.readFileSync(path.join(en, rel), "utf8");
    const wg = /"wgPageName":("(?:[^"\\]|\\.)*")/.exec(src);
    const wgPage = wg ? JSON.parse(wg[1]) : null;
    const h1 = /<h1 id="firstHeading" class="firstHeading">([\s\S]*?)<\/h1>/.exec(src);
    const h1Html = h1 ? h1[1] : "";
    const title = collapse(cheerio.load(h1Html, null, false).root().text()) || p.split("/").pop() || `${LANGS[lang].name} reference`;
    let target = null;
    if (wgPage === lang) target = "";
    else if (wgPage && wgPage.startsWith(`${lang}/`)) target = wgPage.slice(lang.length + 1);
    else warnings.push(`${rel}: unexpected wgPageName ${wgPage}`);
    const isRedirect = target !== null && target !== p;
    pages.push({ lang, rel, key, path: p, title, h1Html, redirectTo: isRedirect ? target : null });
  }

  // Collisions
  const byPath = new Map();
  for (const pg of pages) {
    if (byPath.has(pg.path)) throw new Error(`duplicate path ${pg.path}: ${byPath.get(pg.path).rel} and ${pg.rel}`);
    byPath.set(pg.path, pg);
  }
  const lowerGroups = new Map();
  for (const pg of pages) {
    const l = pg.path.toLowerCase();
    if (!lowerGroups.has(l)) lowerGroups.set(l, []);
    lowerGroups.get(l).push(pg);
  }
  const collisions = [...lowerGroups.values()].filter((g) => g.length > 1).map((g) => g.map((x) => x.path));

  for (const pg of pages) {
    const natural = fileKeyFor(pg.path);
    pg.fileKey = pg.path === "" ? "_root" : pg.key; // archive key is case-clash free
    pg.fileOverride = pg.fileKey !== natural ? pg.fileKey : null;
  }
  // fileKey (and the directories implied by it) must be unique case-insensitively.
  const seen = new Map();
  const fileCollisions = [];
  for (const pg of pages) {
    const parts = pg.fileKey.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const k = parts.slice(0, i).join("/") + (i === parts.length ? ".json" : "/");
      const l = k.toLowerCase();
      if (seen.has(l) && seen.get(l) !== k) fileCollisions.push([seen.get(l), k]);
      else seen.set(l, k);
    }
  }
  if (fileCollisions.length) throw new Error(`case-insensitive output collisions: ${JSON.stringify(fileCollisions)}`);

  // Redirect targets. The archive sometimes stores a page only under a name that
  // redirects to it (language/as_operator holds language/copy_assignment). Such a file
  // is the only copy of the content, so it stays a full page and records its canonical name.
  const aliases = [];
  for (const pg of pages) {
    pg.canonicalPath = null;
    if (pg.redirectTo !== null && !byPath.has(pg.redirectTo)) {
      aliases.push(`${pg.path} -> ${pg.redirectTo}`);
      pg.canonicalPath = pg.redirectTo;
      pg.redirectTo = null;
    }
  }
  return { lang, pages, byPath, relSet, collisions, warnings, aliases };
}

function compareNames(a, b) {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la !== lb) return la < lb ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function buildTree(pages, byPath) {
  const parentOf = new Map();
  for (const pg of pages) {
    if (pg.path === "") {
      parentOf.set("", null);
      continue;
    }
    const segs = pg.path.split("/");
    let parent = "";
    for (let i = segs.length - 1; i >= 1; i--) {
      const cand = segs.slice(0, i).join("/");
      if (byPath.has(cand)) {
        parent = cand;
        break;
      }
    }
    parentOf.set(pg.path, parent);
  }
  const kids = new Map(pages.map((p) => [p.path, []]));
  for (const pg of pages) if (pg.path !== "") kids.get(parentOf.get(pg.path)).push(pg.path);
  for (const list of kids.values()) list.sort((a, b) => compareNames(a.split("/").pop(), b.split("/").pop()));

  // A redirect stays in the tree only if real pages live below it (e.g. atomic/*).
  const keep = new Map();
  const visit = (p) => {
    let k = byPath.get(p).redirectTo === null;
    for (const c of kids.get(p)) if (visit(c)) k = true;
    keep.set(p, k);
    return k;
  };
  visit("");
  const treeKids = new Map();
  for (const [p, list] of kids) treeKids.set(p, list.filter((c) => keep.get(c)));

  const order = [];
  const dfs = (p) => {
    order.push(p);
    for (const c of kids.get(p)) dfs(c);
  };
  dfs("");
  const toNode = (p) => ({ path: p, title: byPath.get(p).title, children: treeKids.get(p).map(toNode) });
  return { parentOf, treeKids, order, tree: toNode(""), inTree: keep };
}

function decodeAttr(s) {
  return s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

const pageFile = (pg) => path.join(LANGS[pg.lang].out, "pages", pg.fileKey + ".json");

/**
 * Second pass over the written pages: repair #fragments that do not exist on the target
 * page (stale wiki anchors such as "#top", "..._202403" vs "..._202403L", case drift,
 * a dropped "(since C++NN)" suffix). Unrepairable ones are left as they are.
 * `pages` holds every converted page of every language; links across languages are
 * repaired when the target language was converted too.
 */
function fixFragments(pages) {
  const k = (lang, p) => `${lang}:${p}`;
  const data = new Map();
  const ids = new Map();
  for (const p of pages) {
    const j = JSON.parse(fs.readFileSync(pageFile(p), "utf8"));
    data.set(k(p.lang, p.path), j);
    const set = new Set([...j.html.matchAll(/\s(?:id|name)="([^"]*)"/g)].map((m) => decodeAttr(m[1])));
    ids.set(k(p.lang, p.path), set);
  }
  const stats = { checked: 0, ok: 0, repaired: 0, dropped: 0, unresolved: 0 };
  const repair = (target, frag) => {
    const set = ids.get(target);
    if (!set) return frag;
    stats.checked++;
    if (set.has(frag)) {
      stats.ok++;
      return frag;
    }
    if (/^top$/i.test(frag)) {
      stats.dropped++;
      return null;
    }
    const cands = [frag + "L", frag.replace(/_\.28(?:since|until)_C\.2B\.2B\d+\.29$/, "")];
    for (const c of cands) if (c !== frag && set.has(c)) return stats.repaired++, c;
    const lower = [...set].filter((x) => x.toLowerCase() === frag.toLowerCase());
    if (lower.length === 1) return stats.repaired++, lower[0];
    const pref = [...set].filter((x) => x.startsWith(frag + "_.28"));
    if (pref.length === 1) return stats.repaired++, pref[0];
    stats.unresolved++;
    return frag;
  };
  for (const p of pages) {
    const j = data.get(k(p.lang, p.path));
    if (j.kind === "redirect") continue;
    let changed = false;
    j.html = j.html.replace(/(<(?:a|area)\s[^>]*?href=")([^"]*)(")/g, (all, a, href, b) => {
      const h = decodeAttr(href);
      let target;
      let frag;
      if (h.startsWith("#")) {
        target = k(p.lang, p.path);
        frag = h.slice(1);
      } else {
        const r = parseRouteHref(h);
        if (!r || r.frag === null) return all;
        target = k(r.lang, r.path);
        frag = r.frag;
      }
      if (!frag) return all;
      const fixed = repair(target, frag);
      if (fixed === frag) return all;
      changed = true;
      const base = h.startsWith("#") ? "" : h.slice(0, h.indexOf("#"));
      const nh = fixed === null ? base || "#" : `${base}#${fixed}`;
      return a + escapeHtml(nh) + b;
    });
    if (changed) fs.writeFileSync(pageFile(p), JSON.stringify(j) + "\n");
  }
  return stats;
}

function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function writeFileEnsured(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ROUTE_PREFIX = args.routePrefix;
  const t0 = Date.now();
  ensureArchive(args.archive);

  // Discover every language (cross-links need both page sets), convert the selected ones.
  const sets = {};
  for (const lang of Object.keys(LANGS)) {
    const d = discover(args.archive, lang);
    sets[lang] = { ...d, ...buildTree(d.pages, d.byPath) };
  }

  const selected = [];
  for (const lang of args.langs) {
    for (const pg of sets[lang].pages) {
      if (args.only === null || args.only === "" || pg.path === args.only || pg.path.startsWith(args.only + "/")) selected.push(pg);
    }
  }
  if (args.only === null) {
    for (const lang of args.langs) rmrf(LANGS[lang].out);
    if (args.langs.length === Object.keys(LANGS).length) rmrf(PUBLIC_DIR);
  }
  for (const lang of args.langs) fs.mkdirSync(LANGS[lang].out, { recursive: true });

  // Shared, read-only context for workers.
  const shared = {
    archive: args.archive,
    routePrefix: ROUTE_PREFIX,
    outDirs: Object.fromEntries(Object.entries(LANGS).map(([l, v]) => [l, v.out])),
    sets: Object.fromEntries(
      Object.entries(sets).map(([lang, s]) => [
        lang,
        {
          pages: s.pages.map((p) => ({
            lang,
            rel: p.rel,
            path: p.path,
            title: p.title,
            redirectTo: p.redirectTo,
            canonicalPath: p.canonicalPath,
            fileKey: p.fileKey,
          })),
          parent: Object.fromEntries(s.pages.map((p) => [p.path, s.parentOf.get(p.path)])),
          children: Object.fromEntries(s.pages.map((p) => [p.path, s.treeKids.get(p.path)])),
        },
      ]),
    ),
  };

  const jobs = Math.min(args.jobs, selected.length) || 1;
  const buckets = Array.from({ length: jobs }, () => []);
  selected.forEach((pg, i) => buckets[i % jobs].push({ lang: pg.lang, path: pg.path }));

  const results = [];
  await Promise.all(
    buckets.map(
      (bucket) =>
        new Promise((resolve, reject) => {
          const w = new Worker(SCRIPT, { workerData: { shared, items: bucket } });
          w.on("message", (m) => {
            if (m.type === "done") results.push(...m.results);
            else if (m.type === "progress") process.stdout.write(".");
          });
          w.on("error", reject);
          w.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`worker exited with ${code}`))));
        }),
    ),
  );
  process.stdout.write("\n");

  // Images
  const images = new Set();
  for (const r of results) for (const img of r.images) images.add(img);
  let imageBytes = 0;
  for (const img of [...images].sort()) {
    const src = path.join(args.archive, img);
    const dest = path.join(PUBLIC_DIR, img.replace(/^common\//, ""));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    imageBytes += fs.statSync(src).size;
  }

  if (args.only === null) {
    for (const lang of args.langs) {
      const s = sets[lang];
      const info = new Map(results.filter((r) => r.lang === lang).map((r) => [r.path, r]));
      const index = s.order.map((p) => {
        const pg = s.byPath.get(p);
        const r = info.get(p);
        const entry = {
          path: p,
          title: pg.title,
          section: sectionOf(p),
          summary: r.summary,
          parent: s.parentOf.get(p),
          hasChildren: s.treeKids.get(p).length > 0,
          kind: r.kind,
        };
        if (pg.redirectTo !== null) entry.redirectTo = pg.redirectTo;
        if (pg.fileOverride) entry.file = pg.fileOverride;
        return entry;
      });
      const out = LANGS[lang].out;
      fs.writeFileSync(path.join(out, "index.json"), "[\n" + index.map((e) => JSON.stringify(e)).join(",\n") + "\n]\n");
      fs.writeFileSync(path.join(out, "tree.json"), JSON.stringify(s.tree, null, 1) + "\n");
      // Every known path (pages and redirect sources), small enough for src/proxy.ts to bundle.
      fs.writeFileSync(path.join(out, "paths.json"), JSON.stringify(index.map((e) => e.path)) + "\n");
    }
  }

  const fragStats = args.only === null ? fixFragments(selected) : null;

  // Report
  for (const lang of args.langs) {
    const s = sets[lang];
    const rs = results.filter((r) => r.lang === lang);
    const kinds = {};
    const bySection = {};
    const indexBySection = {};
    let ext = 0;
    let internal = 0;
    let unresolved = 0;
    let redLinks = 0;
    let navboxes = 0;
    let repaired = 0;
    const pageWarnings = [];
    for (const r of rs) {
      kinds[r.kind] = (kinds[r.kind] || 0) + 1;
      const sec = sectionOf(r.path) || "(root)";
      bySection[sec] = (bySection[sec] || 0) + 1;
      if (r.kind === "index") indexBySection[sec] = (indexBySection[sec] || 0) + 1;
      ext += r.stats.external;
      internal += r.stats.internal;
      unresolved += r.stats.unresolved;
      redLinks += r.stats.red;
      navboxes += r.stats.navboxes;
      repaired += r.stats.repaired;
      for (const w of r.warnings) pageWarnings.push(`${r.path}: ${w}`);
    }
    console.log(`\n== ${lang} (${path.relative(ROOT, LANGS[lang].out)}, routes ${routeBase(lang)}/...) ==`);
    console.log(`archive html files: ${s.pages.length}; pages written: ${rs.length}`);
    console.log(`kinds: ${JSON.stringify(kinds)}`);
    console.log(`by section: ${JSON.stringify(bySection)}`);
    console.log(`index pages by section: ${JSON.stringify(indexBySection)}`);
    console.log(`redirects: ${s.pages.filter((p) => p.redirectTo !== null).length} (kept in tree: ${s.pages.filter((p) => p.redirectTo !== null && s.inTree.get(p.path)).length})`);
    console.log(`pages stored only under a redirecting alias (kept as pages, canonicalPath set): ${s.aliases.length}${s.aliases.length ? "\n  " + s.aliases.join("\n  ") : ""}`);
    console.log(`case-insensitive path collisions: ${JSON.stringify(s.collisions)}`);
    console.log(`links: internal ${internal}, external ${ext} (of which internal-looking but missing ${unresolved}), repaired broken archive links ${repaired}, red links dropped ${redLinks}, navboxes marked ${navboxes}`);
    const warnings = [...s.warnings, ...pageWarnings];
    for (const w of warnings.slice(0, 40)) console.log(`warn: ${w}`);
    if (warnings.length > 40) console.log(`... ${warnings.length - 40} more warnings`);
    const sizes = ["pages", "md"].map((d) => [d, dirSize(path.join(LANGS[lang].out, d))]);
    for (const [d, sz] of sizes) console.log(`${d}/: ${sz.files} files, ${mb(sz.total)}`);
  }
  console.log(`\nimages: ${images.size} files, ${mb(imageBytes)}`);
  if (fragStats) console.log(`fragments: ${JSON.stringify(fragStats)}`);
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

/* ------------------------------------------------------------------------ */
/* Worker: page conversion                                                   */
/* ------------------------------------------------------------------------ */

const DROP_TAGS = new Set([
  "script", "style", "noscript", "iframe", "frame", "frameset", "object", "embed", "applet", "form", "input",
  "button", "select", "option", "textarea", "link", "meta", "base", "svg", "math", "canvas", "audio", "video",
  "source", "track", "template", "head", "title",
]);
const ALLOWED_TAGS = new Set([
  "a", "abbr", "b", "big", "blockquote", "br", "caption", "center", "cite", "code", "col", "colgroup", "dd", "del",
  "dfn", "div", "dl", "dt", "em", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "ins", "kbd", "li", "map",
  "area", "ol", "p", "pre", "q", "s", "samp", "small", "span", "strike", "strong", "sub", "sup", "table", "tbody",
  "td", "tfoot", "th", "thead", "tr", "u", "ul", "var", "wbr", "details", "summary",
]);
const GLOBAL_ATTRS = new Set(["class", "id", "data-lang", "data-output", "data-external", "data-nav", "data-bg", "data-tex", "data-redirect"]);
const TAG_ATTRS = {
  a: new Set(["href", "name"]),
  area: new Set(["href", "shape", "coords", "alt"]),
  img: new Set(["src", "width", "height", "alt", "usemap"]),
  map: new Set(["name"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan"]),
  col: new Set(["span"]),
  colgroup: new Set(["span"]),
  ol: new Set(["start", "type", "reversed"]),
  li: new Set(["value"]),
};

const SKIP_MAP_SECTIONS = /^(references|external links|defect reports)$/i;

function workerMain() {
  const { shared, items } = workerData;
  ROUTE_PREFIX = shared.routePrefix;
  // Per language: byPath, parent, children; byRel spans every language (rel starts with "<lang>/").
  const sets = {};
  const byRel = new Map();
  for (const [lang, s] of Object.entries(shared.sets)) {
    sets[lang] = { pages: s.pages, parent: s.parent, children: s.children, byPath: new Map(s.pages.map((p) => [p.path, p])) };
    for (const p of s.pages) byRel.set(p.rel, p);
  }
  const ctx = { shared, sets, byRel };
  const results = [];
  let n = 0;
  for (const it of items) {
    const pg = sets[it.lang].byPath.get(it.path);
    let r;
    try {
      r = pg.redirectTo !== null ? convertRedirect(pg, ctx) : convertPage(pg, ctx);
    } catch (e) {
      throw new Error(`while converting ${pg.rel}: ${e.stack || e}`);
    }
    results.push(r);
    if (++n % 200 === 0) parentPort.postMessage({ type: "progress" });
  }
  parentPort.postMessage({ type: "done", results });
}

function commonFields(pg, ctx) {
  const set = ctx.sets[pg.lang];
  const crumbs = [];
  let cur = set.parent[pg.path];
  while (cur !== null && cur !== undefined) {
    crumbs.unshift({ path: cur, title: set.byPath.get(cur).title });
    cur = set.parent[cur];
  }
  const children = set.children[pg.path].map((c) => ({ path: c, title: set.byPath.get(c).title }));
  return { breadcrumbs: crumbs, children };
}

function writePage(pg, ctx, json, md) {
  const outDir = ctx.shared.outDirs[pg.lang];
  writeFileEnsured(path.join(outDir, "pages", pg.fileKey + ".json"), JSON.stringify(json) + "\n");
  writeFileEnsured(path.join(outDir, "md", pg.fileKey + ".md"), md);
}

function convertRedirect(pg, ctx) {
  const target = ctx.sets[pg.lang].byPath.get(pg.redirectTo);
  const { breadcrumbs, children } = commonFields(pg, ctx);
  const json = {
    path: pg.path,
    title: pg.title,
    titleHtml: escapeHtml(pg.title),
    originalUrl: liveUrl(pg.lang, pg.path),
    section: sectionOf(pg.path),
    kind: "redirect",
    redirectTo: pg.redirectTo,
    summary: "",
    html: "",
    headings: [],
    breadcrumbs,
    children,
    map: { label: pg.title },
    standards: [],
    wordCount: 0,
    codeBlockCount: 0,
  };
  const md =
    `# ${pg.title}\n\nSource: ${liveUrl(pg.lang, pg.path)}\n\n` +
    `This page redirects to ${target ? target.title : pg.redirectTo}: ${liveUrl(pg.lang, pg.redirectTo)}\n`;
  writePage(pg, ctx, json, md);
  return { lang: pg.lang, path: pg.path, kind: "redirect", summary: "", images: [], warnings: [], stats: emptyStats() };
}

function emptyStats() {
  return { internal: 0, external: 0, unresolved: 0, red: 0, navboxes: 0, repaired: 0 };
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const LOAD_OPTS = { xml: { xmlMode: false, decodeEntities: true, encodeEntities: "utf8" } };

function convertPage(pg, ctx) {
  ctx.current = pg.path;
  ctx.currentLang = pg.lang;
  const file = path.join(ctx.shared.archive, "en", pg.rel);
  const $ = cheerio.load(fs.readFileSync(file, "utf8"), LOAD_OPTS);
  const warnings = [];
  const stats = emptyStats();
  const images = new Set();

  // ---- title --------------------------------------------------------------
  const h1 = $("#firstHeading").first();
  const titleHtml = h1.length ? cleanFragment($, h1.get(0), pg, ctx, stats, images, warnings, { title: true }) : escapeHtml(pg.title);

  // ---- content ------------------------------------------------------------
  const contentEl = $("#mw-content-text").get(0);
  if (!contentEl) throw new Error("no #mw-content-text");
  const html = cleanFragment($, contentEl, pg, ctx, stats, images, warnings, { title: false });
  const root = contentEl;

  // ---- metadata -----------------------------------------------------------
  const headings = [];
  for (const h of findAll(root, (e) => /^h[2-4]$/.test(e.name))) {
    if (inDataTable(h)) continue;
    headings.push({ depth: Number(h.name[1]), text: collapse(textOf(h)), id: h.attribs.id });
  }

  const standards = new Set();
  for (const e of descendants(root)) {
    if (!isTag(e)) continue;
    for (const c of classList(e)) {
      const m = pg.lang === "c" ? /^t-(?:since|until|deprecated|removed)-c(\d\d)$/.exec(c) : /^t-(?:since|until|deprecated|removed)-cxx(\d\d)$/.exec(c);
      if (m) standards.add(m[1]);
    }
    if (hasClass(e, "t-mark-rev")) for (const m of textOf(e).matchAll(pg.lang === "c" ? /\bC(\d\d)\b/g : /C\+\+(\d\d)\b/g)) standards.add(m[1]);
  }
  const stdName = pg.lang === "c" ? "C" : "C++";
  const standardList = [...standards].sort((a, b) => STD_ORDER(a) - STD_ORDER(b)).map((v) => `${stdName}${v}`);

  const plain = collapse(textOf(root));
  const codeBlockCount = findAll(root, (e) => e.name === "pre").length;
  const summary = extractSummary(root);
  const kind = classify(pg, root, plain);

  const sections = buildSections(root);
  const map = buildMap(pg, root, sections, kind, ctx);
  const md = toMarkdown(pg, root);

  const { breadcrumbs, children } = commonFields(pg, ctx);
  const json = {
    path: pg.path,
    title: pg.title,
    titleHtml,
    originalUrl: liveUrl(pg.lang, pg.path),
    ...(pg.canonicalPath !== null ? { canonicalPath: pg.canonicalPath } : {}),
    section: sectionOf(pg.path),
    kind,
    summary,
    html,
    headings,
    breadcrumbs,
    children,
    map,
    standards: standardList,
    wordCount: wordCount(plain),
    codeBlockCount,
  };
  writePage(pg, ctx, json, md);
  return { lang: pg.lang, path: pg.path, kind, summary, images: [...images], warnings, stats };
}

/* ---- cleaning ------------------------------------------------------------ */

function removeNode(n) {
  const p = n.parent;
  if (!p) return;
  const i = p.children.indexOf(n);
  if (i >= 0) p.children.splice(i, 1);
  if (n.prev) n.prev.next = n.next;
  if (n.next) n.next.prev = n.prev;
  n.parent = n.prev = n.next = null;
}

function unwrapNode(n) {
  const p = n.parent;
  if (!p) return;
  const i = p.children.indexOf(n);
  const kids = n.children || [];
  for (const k of kids) k.parent = p;
  p.children.splice(i, 1, ...kids);
  relink(p);
  n.children = [];
  n.parent = n.prev = n.next = null;
}

function relink(p) {
  const ch = p.children;
  for (let i = 0; i < ch.length; i++) {
    ch[i].prev = ch[i - 1] || null;
    ch[i].next = ch[i + 1] || null;
    ch[i].parent = p;
  }
}

function makeEl(name, attribs, children = []) {
  const el = { type: "tag", name, attribs, children, parent: null, prev: null, next: null };
  for (const c of children) c.parent = el;
  relinkChildren(el);
  return el;
}

function relinkChildren(el) {
  for (let i = 0; i < el.children.length; i++) {
    el.children[i].prev = el.children[i - 1] || null;
    el.children[i].next = el.children[i + 1] || null;
  }
}

function replaceNode(old, el) {
  const p = old.parent;
  const i = p.children.indexOf(old);
  p.children[i] = el;
  el.parent = p;
  relink(p);
  old.parent = null;
}

function addClass(el, c) {
  const list = classList(el);
  if (!list.includes(c)) list.push(c);
  el.attribs.class = list.join(" ");
}

function resolveArchiveHref(fromRel, href) {
  let target;
  try {
    target = decodeURIComponent(href);
  } catch {
    target = href;
  }
  return path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), target));
}

/**
 * Clean a subtree in place and return its inner HTML.
 * All structural rewriting happens here; metadata/markdown read the cleaned tree.
 */
function cleanFragment($, root, pg, ctx, stats, images, warnings, opts) {
  // 1. remove chrome, comments, scripts, hidden elements
  const removeSel = [
    ".t-navbar", "script", "style", "noscript", "link", "meta", ".printfooter", "#catlinks", ".catlinks",
    ".editsection", ".mw-editsection", "#toc", ".toc", ".t-template-editlink", ".t-example-live-link",
    ".coliru-btn", ".visualClear", "#siteSub", "#contentSub", "#jump-to-nav",
  ];
  $(root).find(removeSel.join(",")).remove();
  for (const n of [...descendants(root)]) if (n.type === "comment" || n.type === "directive" || n.type === "cdata") removeNode(n);

  // 2. math: keep the readable fallback, remember the TeX
  for (const m of findAll(root, (e) => hasClass(e, "mjax"))) {
    let tex = collapse(textOf(m));
    tex = tex.replace(/^\\\(|\\\)$/g, "").trim();
    let nx = m.next;
    while (nx && nx.type === "text" && !nx.data.trim()) nx = nx.next;
    if (nx && hasClass(nx, "mjax-fallback")) nx.attribs["data-tex"] = tex;
    removeNode(m);
  }
  for (const e of findAll(root, (x) => /display\s*:\s*none/i.test(x.attribs.style || ""))) if (e.parent) removeNode(e);

  // 3. ambox notices -> <div class="t-notice">
  for (const t of findAll(root, (e) => e.name === "table" && hasClass(e, "ambox"))) {
    const text = findAll(t, (e) => hasClass(e, "mbox-text"))[0];
    const div = makeEl("div", { class: "t-notice" }, text ? text.children.slice() : []);
    replaceNode(t, div);
  }

  // 3b. "Extended content" boxes (collapsed tables) -> <details>
  for (const t of findAll(root, (e) => e.name === "table" && hasClass(e, "mw-collapsible"))) {
    const rows = rowsOf(t);
    if (rows.length !== 2) continue;
    const [h, b] = rows.map(cellsOf);
    if (h.length !== 1 || b.length !== 1 || h[0].name !== "th" || b[0].name !== "td") continue;
    const summary = makeEl("summary", {}, h[0].children.slice());
    const details = makeEl("details", { class: "t-collapsible" }, [summary, ...b[0].children.slice()]);
    replaceNode(t, details);
  }

  // 4. wiki parser artefacts: <p> inside inline/code contexts
  for (const p of findAll(root, (e) => e.name === "p").reverse()) {
    if (closest(p, (e) => ["span", "code", "pre", "a", "tt", "b", "i", "strong", "em"].includes(e.name))) unwrapNode(p);
  }
  for (const d of findAll(root, (e) => hasClass(e, "t-page-template"))) unwrapNode(d);

  // 5. code blocks -> <pre data-lang><code>
  for (const g of findAll(root, (e) => e.name === "div" && hasClass(e, "mw-geshi"))) {
    if (!g.parent) continue;
    const pre = findAll(g, (e) => e.name === "pre")[0];
    if (!pre) {
      unwrapNode(g);
      continue;
    }
    const langDiv = findAll(g, (e) => /\bsource-[\w+-]+/.test(e.attribs.class || ""))[0];
    const lang = langDiv ? /\bsource-([\w+-]+)/.exec(langDiv.attribs.class)[1] : "text";
    const code = makeEl("code", {}, pre.children.slice());
    const npre = makeEl("pre", { "data-lang": lang }, [code]);
    replaceNode(g, npre);
  }
  for (const pre of findAll(root, (e) => e.name === "pre" && !e.attribs["data-lang"] && !e.attribs["data-output"])) {
    if (pre.children.length === 1 && pre.children[0].name === "code") {
      pre.attribs = { "data-lang": "text" };
      continue;
    }
    const code = makeEl("code", {}, pre.children.slice());
    replaceNode(pre, makeEl("pre", { "data-lang": "text" }, [code]));
  }
  for (const ex of findAll(root, (e) => hasClass(e, "t-example"))) {
    const pres = findAll(ex, (e) => e.name === "pre");
    pres.forEach((pre, i) => {
      let prev = pre.prev;
      while (prev && (prev.type === "text" ? !prev.data.trim() : false)) prev = prev.prev;
      const prevText = prev && isTag(prev) ? collapse(textOf(prev)) : "";
      const looksOutput = /output|result|prints|possible/i.test(prevText) && prevText.length < 120;
      if (i > 0 && (pre.attribs["data-lang"] === "text" || looksOutput)) {
        pre.attribs = { "data-output": "1" };
      }
    });
  }

  // 6. declaration code: keep line structure without relying on white-space:pre
  for (const tr of findAll(root, (e) => e.name === "tr" && hasClass(e, "t-dcl"))) {
    const td = cellsOf(tr)[0];
    if (!td) continue;
    let afterBr = false;
    const walk = (n) => {
      for (const c of [...(n.children || [])]) {
        if (c.type === "text") {
          let s = c.data.replace(/\n/g, "");
          if (afterBr) {
            s = s.replace(/^ +/, (m) => "\u00a0".repeat(m.length));
            if (s.length) afterBr = false;
          }
          c.data = s;
        } else if (isTag(c)) {
          if (c.name === "br") afterBr = true;
          else walk(c);
        }
      }
    };
    walk(td);
  }

  // 7. inline styles -> semantics
  for (const e of findAll(root, (x) => x.attribs.style !== undefined)) {
    const st = e.attribs.style.toLowerCase();
    delete e.attribs.style;
    if (/font-style\s*:\s*italic/.test(st) && /georgia/.test(st) && e.name === "span") {
      e.name = "em";
      addClass(e, "t-named-req");
    } else if (/font-size\s*:\s*0\.7em/.test(st) && closest(e, (x) => /^h[1-6]$/.test(x.name)) !== null) {
      addClass(e, "t-title-prefix");
    } else if (opts.title && /font-size\s*:\s*0\.7em/.test(st)) {
      addClass(e, "t-title-prefix");
    }
    const bg = /background(?:-color)?\s*:\s*(#[0-9a-f]{3,6})/.exec(st);
    if (bg && !classList(e).some((c) => /^table-(yes|no|na|maybe|partial)/.test(c))) e.attribs["data-bg"] = bg[1].slice(1);
  }

  // 8. headings: move the MediaWiki headline id onto the hN
  const ids = new Set();
  for (const e of descendants(root)) if (isTag(e) && e.attribs.id && !hasClass(e, "mw-headline")) ids.add(e.attribs.id);
  if (!opts.title) {
    for (const h of findAll(root, (e) => /^h[2-6]$/.test(e.name))) {
      const hl = findAll(h, (e) => hasClass(e, "mw-headline"))[0];
      let id = hl ? hl.attribs.id : h.attribs.id;
      if (hl) unwrapNode(hl);
      if (!id) id = slugId(collapse(textOf(h))) || "section";
      if (ids.has(id) && h.attribs.id !== id) {
        let k = 2;
        while (ids.has(`${id}_${k}`)) k++;
        id = `${id}_${k}`;
      }
      ids.add(id);
      h.attribs.id = id;
      // trim whitespace inside headings
      while (h.children.length && h.children[0].type === "text" && !h.children[0].data.trim()) removeNode(h.children[0]);
      if (h.children[0] && h.children[0].type === "text") h.children[0].data = h.children[0].data.replace(/^\s+/, "");
    }
  }
  for (const hl of findAll(root, (e) => hasClass(e, "mw-headline"))) unwrapNode(hl);
  // {{v|N}} links point at #Version_N: anchor the first declaration row numbered (N).
  if (!opts.title) {
    for (const tr of findAll(root, (e) => e.name === "tr" && (hasClass(e, "t-dcl") || hasClass(e, "t-dcl-rev-aux")))) {
      const td = cellsOf(tr)[1];
      const m = td ? /^\((\d+)\)$/.exec(collapse(textOf(td))) : null;
      if (!m || tr.attribs.id) continue;
      const id = `Version_${m[1]}`;
      if (ids.has(id)) continue;
      ids.add(id);
      tr.attribs.id = id;
    }
  }

  // 9. links
  for (const a of findAll(root, (e) => e.name === "a" || e.name === "area")) {
    const href = a.attribs.href;
    const title = a.attribs.title || "";
    if (hasClass(a, "new") || /[?&]redlink=1/.test(href || "")) {
      stats.red++;
      if (a.name === "area") removeNode(a);
      else unwrapNode(a);
      continue;
    }
    if (href === undefined) continue;
    const res = rewriteHref(href, title, pg, ctx);
    if (res === null) {
      if (a.name === "area") removeNode(a);
      else unwrapNode(a);
      continue;
    }
    a.attribs.href = res.href;
    if (res.external) {
      a.attribs["data-external"] = "1";
      stats.external++;
      if (res.missing) stats.unresolved++;
    } else if (res.internal) {
      stats.internal++;
      if (res.repaired) stats.repaired++;
    }
  }

  // 10. images
  for (const img of findAll(root, (e) => e.name === "img")) {
    const src = img.attribs.src || "";
    if (/^(https?:)?\/\//.test(src) || src.startsWith("data:")) {
      removeNode(img);
      continue;
    }
    const rel = path.posix.normalize(path.posix.join("en", path.posix.dirname(pg.rel), decodeURIComponentSafe(src)));
    if (!rel.startsWith("common/images/") || !fs.existsSync(path.join(ctx.shared.archive, rel))) {
      warnings.push(`image not found: ${src}`);
      removeNode(img);
      continue;
    }
    images.add(rel);
    img.attribs.src = `${PUBLIC_URL}/${encodePath(rel.replace(/^common\//, ""))}`;
    if (!img.attribs.alt) img.attribs.alt = "";
  }

  // 11. inline code markers
  for (const e of findAll(root, (x) => x.name === "span" && hasClass(x, "t-c"))) e.name = "code";
  for (const e of findAll(root, (x) => x.name === "tt")) e.name = "code";

  // 12. navboxes outside the top navbar (collapsible in the UI)
  for (const t of findAll(root, (e) => hasClass(e, "t-nv-begin") || hasClass(e, "navbox"))) {
    if (closest(t, (e) => e.attribs && e.attribs["data-nav"])) continue;
    t.attribs["data-nav"] = "1";
    stats.navboxes++;
  }

  // 13. empty paragraphs / wrappers
  for (const p of findAll(root, (e) => e.name === "p").reverse()) {
    const meaningful = (p.children || []).some((c) => (c.type === "text" ? collapse(c.data) !== "" : isTag(c) && c.name !== "br"));
    if (!meaningful) removeNode(p);
  }
  for (const d of findAll(root, (e) => e.name === "div" && !Object.keys(e.attribs).length).reverse()) {
    if (!(d.children || []).length) removeNode(d);
  }

  // 14. allowlist
  sanitize(root);

  // 15. serialize
  let out = $(root).html() || "";
  out = squeezeBlankLines(out).trim();
  if (opts.title) out = collapse(out.replace(/\n/g, " ")).replace(/> </g, "><");
  const bad = /<script|\son\w+\s*=|javascript:|<iframe|\sstyle=/i.exec(out.replace(/<pre[\s\S]*?<\/pre>/g, ""));
  if (bad) throw new Error(`unsafe output: ${bad[0]}`);
  return out;
}

function decodeURIComponentSafe(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function slugId(text) {
  return text.replace(/\s+/g, "_").replace(/[^\w.:-]/g, "");
}

function squeezeBlankLines(html) {
  const parts = html.split(/(<pre[\s\S]*?<\/pre>)/);
  return parts.map((p, i) => (i % 2 ? p : p.replace(/\n\s*\n+/g, "\n"))).join("");
}

function rewriteHref(href, title, pg, ctx) {
  href = href.trim();
  if (href.startsWith("#")) return { href, internal: false, external: false };
  const lower = href.toLowerCase();
  if (/^(javascript|data|vbscript|file):/.test(lower)) return null;
  let m;
  if ((m = /^(?:https?:)?\/\/en\.cppreference\.com\/w\/((cpp|c)(?:\/[^#?]*)?)(#.*)?$/.exec(href))) {
    const lang = m[2];
    const p = decodeURIComponentSafe(m[1]).slice(lang.length).replace(/^\//, "").replace(/ /g, "_");
    const frag = m[3] || "";
    const set = ctx.sets[lang];
    if (set && set.byPath.has(p)) return internalHref(set.byPath.get(p), frag, ctx);
    return { href: href.replace(/^\/\/|^http:\/\//, "https://"), external: true };
  }
  if (/^(https?:)?\/\//.test(lower)) return { href: href.replace(/^\/\//, "https://"), external: true };
  if (/^mailto:/.test(lower)) return { href, external: true };
  if (/^[a-z][a-z0-9+.-]*:/.test(lower)) return null;

  const hashAt = href.indexOf("#");
  const pathPart = hashAt >= 0 ? href.slice(0, hashAt) : href;
  const frag = hashAt >= 0 ? href.slice(hashAt) : "";
  if (pathPart === "") return { href: frag, internal: false, external: false };
  const rel = resolveArchiveHref(pg.rel, pathPart);
  const target = ctx.byRel.get(rel);
  if (target) return internalHref(target, frag, ctx);
  const inSet = /^(cpp|c)\/(.+)\.html$/.exec(rel);
  const repaired = inSet ? repairPath(inSet[1], inSet[2], ctx) : null;
  if (repaired) return { ...internalHref(repaired, frag, ctx), repaired: true };
  // Off both page sets: main page, missing files.
  let url;
  if (title) url = liveUrlForTitle(title);
  else if (rel.endsWith(".html")) {
    const key = rel.slice(0, -5).split("/").map(decodeSegment).join("/");
    url = LIVE + encodePath(key === "Main_Page" || key === "index" ? "Main_Page" : key);
  } else return null;
  return { href: url + frag, external: true, missing: inSet !== null || rel === "cpp.html" || rel === "c.html" };
}

/**
 * Auto-generated links inside code (GeSHi) sometimes point at a path that does not
 * exist (cpp/functional/ranges/less instead of cpp/utility/functional/ranges/less).
 * Resolve them to the unique page of that language that ends with the longest suffix of the path.
 */
function repairPath(lang, key, ctx) {
  if (!ctx.repairCache) ctx.repairCache = new Map();
  const cacheKey = `${lang}:${key}`;
  if (ctx.repairCache.has(cacheKey)) return ctx.repairCache.get(cacheKey);
  const segs = key.split("/").map(decodeSegment);
  const pages = ctx.sets[lang].pages;
  let found = null;
  for (let k = segs.length; k >= 2 && !found; k--) {
    const suffix = segs.slice(segs.length - k).join("/");
    const cands = pages.filter((p) => p.path === suffix || p.path.endsWith("/" + suffix));
    if (cands.length === 1) found = cands[0];
    else if (cands.length > 1) break;
  }
  ctx.repairCache.set(cacheKey, found);
  return found;
}

function internalHref(target, frag, ctx) {
  const set = ctx.sets[target.lang];
  let t = target;
  if (t.redirectTo !== null && set.byPath.has(t.redirectTo)) t = set.byPath.get(t.redirectTo);
  const self = ctx.current !== undefined && t.lang === ctx.currentLang && t.path === ctx.current;
  if (frag && frag !== "#" && self) return { href: frag, internal: false, external: false };
  return { href: routeHref(t.lang, t.path) + frag, internal: true, external: false };
}

function sanitize(root) {
  const walk = (n) => {
    for (const c of [...(n.children || [])]) {
      if (c.type === "text") continue;
      if (!isTag(c)) {
        removeNode(c);
        continue;
      }
      const name = c.name.toLowerCase();
      if (DROP_TAGS.has(name) || c.type !== "tag") {
        removeNode(c);
        continue;
      }
      walk(c);
      if (!ALLOWED_TAGS.has(name)) {
        unwrapNode(c);
        continue;
      }
      c.name = name;
      const allowed = TAG_ATTRS[name];
      for (const k of Object.keys(c.attribs)) {
        const lk = k.toLowerCase();
        if (!(GLOBAL_ATTRS.has(lk) || (allowed && allowed.has(lk)))) delete c.attribs[k];
      }
      for (const k of ["href", "src"]) {
        const v = c.attribs[k];
        if (v === undefined) continue;
        if (!/^(\/|#|https?:\/\/|mailto:)/i.test(v.trim())) delete c.attribs[k];
      }
      if (c.attribs.class !== undefined) {
        const cls = classList(c).filter((x) => !/^(mw-content-ltr|mw-redirect|selflink-x)$/.test(x));
        if (cls.length) c.attribs.class = cls.join(" ");
        else delete c.attribs.class;
      }
    }
  };
  walk(root);
}

/* ---- metadata ------------------------------------------------------------ */

function inDataTable(h) {
  return closest(h, (e) => e.name === "table" && !hasClass(e, "t-rev-begin")) !== null;
}

function topLevelBlocks(root, opts = {}) {
  // Flatten wrappers that contain section headings (t-member, plain divs, and for the
  // section model also revision boxes that wrap whole sections).
  const out = [];
  const visit = (n) => {
    for (const c of n.children || []) {
      if (opts.revs && isTag(c) && c.name === "table" && hasClass(c, "t-rev-begin") && findAll(c, (e) => /^h[2-4]$/.test(e.name)).length) {
        for (const tr of rowsOf(c)) {
          const td = cellsOf(tr)[0];
          if (td) visit(td);
        }
        continue;
      }
      if (isTag(c) && c.name === "div" && !hasClass(c, "t-example") && findAll(c, (e) => /^h[2-4]$/.test(e.name) && !inDataTable(e)).length) {
        visit(c);
      } else out.push(c);
    }
  };
  visit(root);
  return out;
}

function buildSections(root) {
  const blocks = topLevelBlocks(root, { revs: true });
  const pre = { depth: 1, title: "", id: "", nodes: [], children: [] };
  const stack = [pre];
  for (const b of blocks) {
    if (isTag(b) && /^h[2-4]$/.test(b.name)) {
      const depth = Number(b.name[1]);
      const sec = { depth, title: collapse(textOf(b)), id: b.attribs.id, heading: b, nodes: [], children: [] };
      while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop();
      stack[stack.length - 1].children.push(sec);
      stack.push(sec);
    } else stack[stack.length - 1].nodes.push(b);
  }
  return pre;
}

function firstProse(nodes, minWords = 3) {
  for (const n of nodes) {
    if (!isTag(n)) {
      if (n.type === "text" && wordCount(n.data) >= minWords) return collapse(n.data);
      continue;
    }
    if (n.name === "p" || hasClass(n, "t-li1")) {
      const t = collapse(textOf(n)).replace(/^\d+(?:[-,]\d+)*\)\s*/, "");
      if (wordCount(t) >= minWords) return t;
    }
  }
  return "";
}

function extractSummary(root) {
  const blocks = topLevelBlocks(root);
  // prefer prose before the first heading, then anywhere
  for (const n of blocks) {
    if (isTag(n) && /^h[2-4]$/.test(n.name)) break;
    if (isTag(n) && n.name === "p") {
      const t = collapse(textOf(n));
      if (wordCount(t) >= 4 && !/^(defined in header|this page|see also)/i.test(t)) return firstSentences(t, 240);
    }
  }
  for (const n of blocks) {
    if (isTag(n) && n.name === "p") {
      const t = collapse(textOf(n));
      if (wordCount(t) >= 4) return firstSentences(t, 240);
    }
  }
  return "";
}

/**
 * kind "index": pure navigation/listing pages. A page is an index when it has no code
 * (no declarations, code blocks or examples) and is dominated by links or by
 * description-list tables: link text >= 35% of all words, or t-dsc tables >= 60%.
 * symbol_index/*, "", header, index, links and links/libs are always indexes; keyword/*
 * pages without code are indexes too.
 */
function classify(pg, root, plain) {
  const p = pg.path;
  if (p === "symbol_index" || p.startsWith("symbol_index/")) return "index";
  if (["", "header", "index", "links", "links/libs"].includes(p)) return "index";
  const hasCode = findAll(root, (e) => e.name === "pre" || hasClass(e, "t-dcl-begin") || hasClass(e, "t-example")).length > 0;
  if (hasCode) return "page";
  // keyword pages are usage lists pointing at the language pages
  if (p.startsWith("keyword/")) return "index";
  const total = wordCount(plain) || 1;
  let linkWords = 0;
  for (const a of findAll(root, (e) => e.name === "a" && e.attribs.href && !e.attribs.href.startsWith("#"))) {
    if (closest(a, (x) => x.name === "a")) continue;
    linkWords += wordCount(collapse(textOf(a)));
  }
  let dscWords = 0;
  for (const t of findAll(root, (e) => e.name === "table" && hasClass(e, "t-dsc-begin"))) {
    if (closest(t, (x) => x.name === "table" && hasClass(x, "t-dsc-begin"))) continue;
    dscWords += wordCount(collapse(textOf(t)));
  }
  if (linkWords / total >= 0.35 || dscWords / total >= 0.6) return "index";
  return "page";
}

/* ---- map ----------------------------------------------------------------- */

function dscEntities(nodes) {
  const out = [];
  for (const n of nodes) {
    if (!isTag(n)) continue;
    const tables = n.name === "table" && hasClass(n, "t-dsc-begin") ? [n] : findAll(n, (e) => e.name === "table" && hasClass(e, "t-dsc-begin"));
    for (const t of tables) {
      for (const tr of findAll(t, (e) => e.name === "tr" && hasClass(e, "t-dsc"))) {
        const tds = elementChildren(tr).filter((e) => e.name === "td");
        if (tds.length < 2) continue;
        const names = dscNames(tds[0]).map((x) => x.name);
        const label = names.slice(0, 3).join(", ") + (names.length > 3 ? ", …" : "");
        if (!label) continue;
        const note = firstSentences(collapse(textOf(stripMarks(tds[1]))), 160);
        out.push({ label: truncate(label, 60), note: note || undefined });
      }
    }
  }
  return out;
}

/** dsc tables before the first heading, grouped by their in-table headings. */
function dscGroups(nodes) {
  const groups = [];
  for (const n of nodes) {
    if (!isTag(n) || n.name !== "table" || !hasClass(n, "t-dsc-begin")) continue;
    let cur = null;
    for (const tr of rowsOf(n)) {
      const h = findAll(tr, (e) => /^h[2-6]$/.test(e.name))[0];
      if (h) {
        cur = { label: truncate(collapse(textOf(h)), 60), items: [] };
        groups.push(cur);
        continue;
      }
      if (!hasClass(tr, "t-dsc")) continue;
      const ents = dscEntities([makeEl("table", { class: "t-dsc-begin" }, [cloneShallowRow(tr)])]);
      if (!ents.length) continue;
      if (!cur) {
        cur = { label: "Entries", items: [] };
        groups.push(cur);
      }
      cur.items.push(...ents);
    }
  }
  return groups.filter((g) => g.items.length);
}

function cloneShallowRow(tr) {
  // dscEntities only reads; wrap the row without re-parenting it
  return { type: "tag", name: "tr", attribs: tr.attribs, children: tr.children, parent: null, prev: null, next: null };
}

function stripMarks(td) {
  // a shallow copy of the text without the "(public member function)" kind mark
  const clone = { type: "tag", name: "td", attribs: {}, children: [] };
  const copy = (n) => {
    if (n.type === "text") return { type: "text", data: n.data };
    if (!isTag(n) || hasClass(n, "t-mark")) return null;
    return { type: "tag", name: n.name, attribs: n.attribs, children: (n.children || []).map(copy).filter(Boolean) };
  };
  clone.children = (td.children || []).map(copy).filter(Boolean);
  return clone;
}

function keyPhrases(nodes) {
  const out = [];
  const seen = new Set();
  for (const n of nodes) {
    if (!isTag(n)) continue;
    const cands = [];
    if (n.name === "dl") for (const dt of findAll(n, (e) => e.name === "dt")) cands.push(collapse(textOf(dt)));
    if (n.name === "p" || n.name === "ul" || n.name === "ol" || n.name === "dl") {
      for (const b of findAll(n, (e) => (e.name === "b" || e.name === "strong") && !closest(e, (x) => x.name === "code" || x.name === "pre"))) {
        cands.push(collapse(textOf(b)));
      }
    }
    for (const c of cands) {
      const k = c.toLowerCase();
      if (c.length < 3 || c.length > 48 || seen.has(k) || /^[\W\d]+$/.test(c)) continue;
      seen.add(k);
      out.push({ label: c });
      if (out.length >= 3) return out;
    }
  }
  return out;
}

function sectionNote(sec) {
  let t = firstProse(sec.nodes, 1) || (sec.children[0] ? firstProse(sec.children[0].nodes, 1) : "");
  if (!t) {
    const par = sec.nodes.find((n) => isTag(n) && n.name === "table" && hasClass(n, "t-par-begin"));
    if (par) {
      const names = findAll(par, (e) => e.name === "tr" && hasClass(e, "t-par")).map((tr) => collapse(textOf(cellsOf(tr)[0] || tr))).filter(Boolean);
      if (names.length) t = names.join(", ");
    }
  }
  if (!t) {
    const ex = sec.nodes.find((n) => isTag(n) && hasClass(n, "t-example"));
    if (ex) t = firstProse(ex.children, 3);
  }
  return t ? firstSentences(t, 160) : undefined;
}

function buildMap(pg, root, sections, kind, ctx) {
  const top = sections.children;
  const branchesFor = (cap, maxBranches) => {
    const branches = [];
    const pre = sections.nodes;
    const dclTables = pre.filter((n) => isTag(n) && hasClass(n, "t-dcl-begin"));
    if (dclTables.length) {
      let count = 0;
      const revs = new Set();
      for (const t of dclTables) {
        const rows = findAll(t, (e) => e.name === "tr" && hasClass(e, "t-dcl"));
        const nums = new Set();
        for (const tr of rows) {
          const tds = elementChildren(tr);
          const num = tds[1] ? collapse(textOf(tds[1])) : "";
          nums.add(num || `row${nums.size}`);
          for (const c of classList(tr)) {
            const m = /^t-(since|until)-cxx(\d\d)$/.exec(c);
            if (m) revs.add(`${m[1]} C++${m[2]}`);
          }
        }
        count += nums.size;
      }
      const note = `${count} declaration${count === 1 ? "" : "s"}` + (revs.size ? `; revisions: ${[...revs].sort((a, b) => STD_ORDER(a.slice(-2)) - STD_ORDER(b.slice(-2))).join(", ")}` : "");
      const lead = firstProse(pre);
      branches.push({ label: "Declarations", note: lead ? truncate(`${note}. ${firstSentences(lead, 120)}`, 160) : note });
    } else {
      for (const g of dscGroups(pre)) branches.push(capChildren({ label: g.label }, g.items, cap));
    }
    let secs = top.filter((s) => s.title);
    const skipped = secs.filter((s) => SKIP_MAP_SECTIONS.test(s.title));
    if (secs.length - skipped.length >= 3) secs = secs.filter((s) => !SKIP_MAP_SECTIONS.test(s.title));
    const seeAlso = secs.filter((s) => /^see also$/i.test(s.title));
    secs = secs.filter((s) => !/^see also$/i.test(s.title));
    // when the page has a single top section, use its subsections as branches
    if (secs.length === 1 && secs[0].children.length >= 2 && !seeAlso.length) secs = secs[0].children;
    const hidden = Math.max(0, secs.length - maxBranches);
    for (const s of [...secs.slice(0, maxBranches), ...seeAlso]) {
      const node = { label: truncate(s.title, 60) };
      const note = sectionNote(s);
      if (note) node.note = note;
      let kids = [];
      if (s.children.length) {
        kids = s.children.filter((c) => c.title).map((c) => {
          const k = { label: truncate(c.title, 60) };
          const n = sectionNote(c);
          if (n) k.note = n;
          return k;
        });
      } else {
        const ents = dscEntities(s.nodes);
        if (ents.length) kids = ents;
        else kids = keyPhrases(s.nodes);
      }
      branches.push(capChildren(node, kids, /^see also$/i.test(s.title) ? Math.min(cap, 6) : cap));
    }
    if (hidden) branches.splice(branches.length - seeAlso.length, 0, { label: `+${hidden} more sections` });
    return branches;
  };
  const count = (n) => 1 + (n.children || []).reduce((a, c) => a + count(c), 0);
  let rootNode;
  for (const [cap, maxB] of [[8, 12], [6, 12], [5, 10], [4, 10], [3, 9], [2, 8], [1, 8], [0, 8], [0, 6]]) {
    rootNode = { label: pg.title, children: branchesFor(cap, maxB) };
    if (count(rootNode) <= 40) break;
  }
  if (!rootNode.children.length && ctx) {
    // pages without sections (landing pages): branch on the tree children
    const set = ctx.sets[pg.lang];
    const kids = set.children[pg.path].map((c) => {
      const t = set.byPath.get(c);
      return { label: truncate(t.title, 60) };
    });
    capChildren(rootNode, kids, 39);
  }
  if (!rootNode.children || !rootNode.children.length) delete rootNode.children;
  return rootNode;
}

function capChildren(node, kids, cap) {
  if (!kids.length || cap <= 0) return node;
  if (kids.length > cap) {
    const shown = kids.slice(0, Math.max(1, cap - 1));
    node.children = [...shown, { label: `+${kids.length - shown.length} more` }];
  } else node.children = kids;
  return node;
}

/* ---- markdown ------------------------------------------------------------ */

function toMarkdown(pg, root) {
  let minDepth = 6;
  for (const h of findAll(root, (e) => /^h[2-6]$/.test(e.name) && !inDataTable(e))) minDepth = Math.min(minDepth, Number(h.name[1]));
  const shift = minDepth <= 6 ? minDepth - 2 : 0;
  const st = { shift, seeAlso: false, inTable: false };
  const blocks = [];
  let seeAlsoDepth = null;
  for (const b of topLevelBlocks(root)) {
    if (isTag(b) && /^h[2-6]$/.test(b.name)) {
      const d = Number(b.name[1]);
      if (seeAlsoDepth !== null && d <= seeAlsoDepth) {
        st.seeAlso = false;
        seeAlsoDepth = null;
      }
      if (/^see also$/i.test(collapse(textOf(b)))) {
        st.seeAlso = true;
        seeAlsoDepth = d;
      }
    }
    blocks.push(...mdBlocks([b], st));
  }
  const body = blocks.filter((b) => b.trim() !== "").join("\n\n");
  return `# ${pg.title}\n\nSource: ${liveUrl(pg.lang, pg.path)}\n\n${body}\n`.replace(/\n{3,}/g, "\n\n");
}

const BLOCK_TAGS = new Set(["details", "summary", "p", "div", "table", "ul", "ol", "dl", "pre", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "hr", "center", "tbody", "thead", "tr", "td", "th", "li", "dd", "dt", "map"]);

function isBlockNode(n) {
  return isTag(n) && BLOCK_TAGS.has(n.name);
}

/** Render a list of sibling nodes as markdown blocks. */
function mdBlocks(nodes, st) {
  const out = [];
  let run = [];
  const flush = () => {
    if (!run.length) return;
    const t = tidyInline(run.map((n) => mdInline(n, st)).join(""));
    if (t) out.push(t);
    run = [];
  };
  for (const n of nodes) {
    if (!isBlockNode(n)) {
      run.push(n);
      continue;
    }
    flush();
    out.push(...mdBlock(n, st));
  }
  flush();
  return out;
}

function tidyInline(s) {
  return s
    .replace(/(?<![`\s])``(?![`\s])/g, "")
    .replace(/[ \t\u00a0\ufeff]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .replace(/\( /g, "(")
    .replace(/ ([,.;:)])/g, "$1")
    .trim();
}

function headingMd(n, st) {
  const d = Math.min(6, Math.max(2, Number(n.name[1]) - st.shift));
  const t = tidyInline(mdInlineChildren(n, { ...st, seeAlso: false }));
  return t ? ["#".repeat(d) + " " + t.replace(/\n/g, " ").replace(/^(?:>\s*)+/, "")] : [];
}

function mdBlock(n, st) {
  const name = n.name;
  if (n.attribs && n.attribs["data-nav"]) return [];
  if (/^h[1-6]$/.test(name)) return headingMd(n, st);
  if (name === "p") {
    const t = tidyInline(mdInlineChildren(n, st));
    if (!t) return [];
    const lines = t.split("\n").map((l) => l.replace(/^([*+#] )/, "\\$1").replace(/^(\d+)\. /, "$1\\. "));
    // line-broken link lists (symbol indexes) read better as lists
    if (lines.length >= 3 && !st.inTable) return [lines.map((l) => (/^(- |\d+\. )/.test(l) ? l : "- " + l)).join("\n")];
    return [lines.join("\n")];
  }
  if (name === "pre") return [codeFence(n)];
  if (name === "hr") return ["---"];
  if (name === "ul" || name === "ol") return [listMd(n, st, 0)];
  if (name === "dl") return dlMd(n, st);
  if (name === "map") return [];
  if (name === "summary") {
    const t = tidyInline(mdInlineChildren(n, st));
    return t && !/^extended content$/i.test(t) ? [`**${t}**`] : [];
  }
  if (name === "table") return tableMd(n, st);
  if (name === "div" && hasClass(n, "t-notice")) {
    const t = tidyInline(mdInlineChildren(n, st));
    return t ? ["> Note: " + t.replace(/\n/g, " ")] : [];
  }
  if (name === "div" && /^t-li\d$/.test(classList(n).find((c) => /^t-li\d$/.test(c)) || "")) {
    const depth = Number(classList(n).find((c) => /^t-li\d$/.test(c)).slice(4)) - 1;
    const inner = mdBlocks(n.children, st);
    if (!inner.length) return [];
    const ind = "  ".repeat(depth);
    return [inner.map((b, i) => (i === 0 ? ind + b : indent(b, ind + "   "))).join("\n\n")];
  }
  if (name === "blockquote") return mdBlocks(n.children, st).map((b) => b.split("\n").map((l) => "> " + l).join("\n"));
  return mdBlocks(n.children, st);
}

function indent(s, pre) {
  return s
    .split("\n")
    .map((l) => (l ? pre + l : l))
    .join("\n");
}

function codeText(n, opts = {}) {
  let s = "";
  const walk = (x) => {
    for (const c of x.children || []) {
      if (c.type === "text") s += opts.block ? c.data : c.data.replace(/\n/g, "");
      else if (isTag(c)) {
        if (c.name === "br") s += "\n";
        else walk(c);
      }
    }
  };
  walk(n);
  s = s.replace(/\u00a0/g, " ").replace(/\ufeff/g, "");
  const lines = s.split("\n").map((l) => l.replace(/\s+$/, ""));
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (!opts.block && lines.length) lines[0] = lines[0].trimStart();
  return lines.join("\n");
}

function fence(body, lang) {
  const ticks = /```/.test(body) ? "````" : "```";
  return `${ticks}${lang}\n${body}\n${ticks}`;
}

function codeFence(pre) {
  const output = pre.attribs["data-output"];
  const lang = output ? "text" : pre.attribs["data-lang"] === "cpp" ? "cpp" : pre.attribs["data-lang"] || "text";
  return fence(codeText(pre, { block: true }), lang);
}

function listMd(list, st, depth) {
  const ordered = list.name === "ol";
  let i = Number(list.attribs.start || 1);
  const items = [];
  for (const li of elementChildren(list)) {
    if (li.name !== "li") continue;
    const marker = ordered ? `${i++}. ` : "- ";
    const blocks = [];
    let run = [];
    const flush = () => {
      const t = tidyInline(run.map((x) => mdInline(x, st)).join(""));
      if (t) blocks.push(t);
      run = [];
    };
    for (const c of li.children) {
      if (isTag(c) && (c.name === "ul" || c.name === "ol")) {
        flush();
        blocks.push(listMd(c, st, depth + 1));
      } else if (isBlockNode(c)) {
        flush();
        blocks.push(...mdBlock(c, st));
      } else run.push(c);
    }
    flush();
    if (!blocks.length) continue;
    const pad = " ".repeat(marker.length);
    items.push(marker + blocks.map((b, k) => (k === 0 ? b.replace(/\n/g, "\n" + pad) : indent(b, pad))).join("\n"));
  }
  return items.join("\n");
}

function dlMd(dl, st) {
  const out = [];
  for (const c of elementChildren(dl)) {
    if (c.name === "dt") {
      const t = tidyInline(mdInlineChildren(c, st));
      if (t) out.push(`**${t}**`);
    } else if (c.name === "dd") {
      const inner = mdBlocks(c.children, { ...st, dlDepth: (st.dlDepth || 0) + 1 });
      out.push(...(st.dlDepth ? inner : inner.map((b) => indent(b, "  "))));
    }
    else out.push(...mdBlock(c, st));
  }
  return out;
}

function rowsOf(table) {
  const rows = [];
  for (const c of elementChildren(table)) {
    if (c.name === "tr") rows.push(c);
    else if (["tbody", "thead", "tfoot"].includes(c.name)) for (const r of elementChildren(c)) if (r.name === "tr") rows.push(r);
  }
  return rows;
}

const cellsOf = (tr) => elementChildren(tr).filter((e) => e.name === "td" || e.name === "th");

function tableMd(t, st) {
  if (hasClass(t, "t-dcl-begin")) return dclMd(t);
  if (hasClass(t, "t-dsc-begin")) return dscMd(t, st);
  if (hasClass(t, "t-par-begin")) return parMd(t, st);
  if (hasClass(t, "t-rev-begin")) return revMd(t, st);
  if (hasClass(t, "t-sdsc-begin")) return sdscMd(t, st);
  const layout =
    hasClass(t, "mainpagetable") ||
    hasClass(t, "eq-fun-cpp-table") ||
    findAll(t, (e) => e.name === "pre" || e.name === "table" || hasClass(e, "t-example") || e.name === "h5" || e.name === "h4" || e.name === "h3").length > 0;
  if (layout) return layoutTableMd(t, st);
  return [gfmTable(t, st)];
}

/**
 * Tables that hold block content (code, nested tables): one group per row, each cell
 * labelled with its column header when the table has a header row.
 */
function layoutTableMd(t, st) {
  const rows = rowsOf(t);
  const out = [];
  let headers = null;
  const occupied = [];
  for (const tr of rows) {
    const cells = cellsOf(tr);
    if (!cells.length) continue;
    if (cells.every((c) => c.name === "th")) {
      const hs = [];
      for (const c of cells) {
        const txt = collapse(textOf(c));
        for (let k = 0; k < (Number(c.attribs.colspan) || 1); k++) hs.push(txt);
      }
      if (!headers) {
        headers = hs;
        continue;
      }
      const txt = collapse(textOf(tr));
      if (txt) out.push(`**${txt}**`);
      continue;
    }
    let col = 0;
    const groups = [];
    for (const c of cells) {
      while (occupied[col] > 0) {
        occupied[col]--;
        col++;
      }
      const cs = Number(c.attribs.colspan) || 1;
      const rs = Number(c.attribs.rowspan) || 1;
      const label = headers && headers.length > 1 && cs < headers.length ? headers[Math.min(col, headers.length - 1)] : "";
      for (let k = 0; k < cs; k++) if (rs > 1) occupied[col + k] = rs - 1;
      col += cs;
      const blocks = mdBlocks(c.children, st).filter((b) => b.trim());
      if (!blocks.length) continue;
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.blocks.push(...blocks);
      else groups.push({ label, blocks });
    }
    for (let k = col; k < occupied.length; k++) if (occupied[k] > 0) occupied[k]--;
    for (const g of groups) {
      const simple = g.blocks.every((b) => !b.includes("\n") && !/^(```|- |\d+\. |\|)/.test(b));
      if (simple) {
        const sep = g.blocks[0].startsWith("`") ? ", " : g.blocks[0].length < 40 ? ": " : " ";
        const text = g.blocks.join(sep);
        out.push(g.label ? `**${g.label}**: ${text}` : text);
      } else out.push(...(g.label ? [`**${g.label}**:`] : []), ...g.blocks);
    }
  }
  return out;
}

function cellInline(td, st) {
  const blocks = mdBlocks(td.children, { ...st, inTable: true });
  return blocks.join(" ").replace(/\n+/g, " ").replace(/\|/g, "\\|").trim();
}

function gfmTable(t, st) {
  const grid = [];
  const pending = []; // rowspan carry: col -> {text, left}
  const rows = rowsOf(t);
  let headerRows = 0;
  rows.forEach((tr, r) => {
    const row = [];
    const cells = cellsOf(tr);
    if (r === headerRows && cells.length && cells.every((c) => c.name === "th")) headerRows++;
    let col = 0;
    const take = () => {
      while (pending[col] && pending[col].left > 0) {
        row[col] = pending[col].text;
        pending[col].left--;
        col++;
      }
    };
    take();
    for (const c of cells) {
      take();
      const text = cellInline(c, st);
      const cs = Math.max(1, Math.min(20, Number(c.attribs.colspan) || 1));
      const rs = Math.max(1, Math.min(200, Number(c.attribs.rowspan) || 1));
      for (let k = 0; k < cs; k++) {
        row[col] = k === 0 ? text : "";
        if (rs > 1) pending[col] = { text: k === 0 ? text : "", left: rs - 1 };
        col++;
      }
    }
    take();
    grid.push(row);
  });
  const width = Math.max(1, ...grid.map((r) => r.length));
  const norm = grid.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? "")).filter((r) => r.some((c) => c !== ""));
  if (!norm.length) return "";
  if (norm.every((r) => r.filter((c) => c.trim()).length <= 1)) {
    return norm.map((r) => r.find((c) => c.trim()) || "").filter(Boolean).map((c) => c.replace(/\\\|/g, "|")).join("\n\n");
  }
  const hdr = headerRows > 0 ? norm.slice(0, 1) : [Array.from({ length: width }, () => " ")];
  const body = headerRows > 0 ? norm.slice(1) : norm;
  // extra header rows become body rows (bold)
  const line = (r) => "| " + r.map((c) => c || " ").join(" | ") + " |";
  return [line(hdr[0]), "|" + " --- |".repeat(width), ...body.map(line)].join("\n");
}

function marksText(td) {
  return td ? collapse(textOf(td)).replace(/\)\s*\(/g, ") (") : "";
}

function dclMd(t) {
  const entries = [];
  let revNum = "";
  for (const tr of rowsOf(t)) {
    const tds = cellsOf(tr);
    if (hasClass(tr, "t-dcl-sep")) continue;
    if (hasClass(tr, "t-dcl-rev-aux")) {
      revNum = tds[1] ? collapse(textOf(tds[1])) : "";
      continue;
    }
    if (hasClass(tr, "t-dcl")) {
      const code = tds[0] ? codeText(tds[0]) : "";
      const num = (tds[1] && collapse(textOf(tds[1]))) || (closest(tr, (e) => hasClass(e, "t-dcl-rev")) ? revNum : "");
      const marks = marksText(tds[2]);
      const comment = [num, marks].filter(Boolean).join(" ");
      entries.push(comment ? appendComment(code, comment) : code);
      continue;
    }
    // header rows ("Defined in header <vector>") and other notes
    const text = collapse(tds.map((td) => textOf(td)).join(" "));
    if (text) entries.push(`// ${text}`);
  }
  if (!entries.length) return [];
  const multi = entries.some((e) => e.includes("\n"));
  return [fence(entries.join(multi ? "\n\n" : "\n"), "cpp")];
}

function appendComment(code, comment) {
  const lines = code.split("\n");
  const last = lines[lines.length - 1];
  lines[lines.length - 1] = last.trim() ? `${last} // ${comment}` : `// ${comment}`;
  return lines.join("\n");
}

function dscNames(td) {
  const div = findAll(td, (e) => hasClass(e, "t-dsc-member-div"))[0];
  if (!div) {
    const t = collapse(textOf(td));
    const a = findAll(td, (e) => e.name === "a")[0];
    return t ? [{ name: t, mark: "", href: a ? a.attribs.href : null, plain: true }] : [];
  }
  const [nameDiv, markDiv] = elementChildren(div);
  const a = nameDiv ? findAll(nameDiv, (e) => e.name === "a")[0] : null;
  const lines = nameDiv ? findAll(nameDiv, (e) => hasClass(e, "t-lines"))[0] : null;
  const names = lines ? elementChildren(lines).map((s) => collapse(textOf(s))) : [collapse(textOf(nameDiv || div))];
  const markLines = markDiv ? findAll(markDiv, (e) => hasClass(e, "t-lines"))[0] : null;
  const marks = markLines ? elementChildren(markLines).map((s) => collapse(textOf(s))) : [];
  return names.filter(Boolean).map((name, i) => ({ name, mark: marks[i] || "", href: a ? a.attribs.href : null }));
}

function linkFor(href) {
  if (!href) return null;
  const r = parseRouteHref(href);
  if (r) return liveUrl(r.lang, r.path) + (r.frag ? "#" + r.frag : "");
  if (/^https?:\/\//.test(href)) return href;
  return null;
}

function dscMd(t, st) {
  const out = [];
  let items = [];
  const flush = () => {
    if (items.length) out.push(items.join("\n"));
    items = [];
  };
  for (const tr of rowsOf(t)) {
    const tds = cellsOf(tr);
    if (!tds.length) continue;
    if (hasClass(tr, "t-dsc-sep")) continue;
    if (hasClass(tr, "t-dsc")) {
      const names = dscNames(tds[0]);
      const nameMd = names
        .map((x) => {
          const label = x.plain ? tidyInline(mdInlineChildren(tds[0], { ...st, seeAlso: false })) : /^[(\[]/.test(x.name) ? x.name : inlineCode(x.name);
          const url = st.seeAlso ? linkFor(x.href) : null;
          const linked = url ? `[${label}](${url})` : label;
          return x.mark ? `${linked} ${x.mark}` : linked;
        })
        .join(", ");
      const desc = tds.slice(1).map((td) => tidyInline(mdBlocks(td.children, { ...st, inTable: true, seeAlso: false }).join(" "))).filter(Boolean).join(" ");
      items.push(`- ${nameMd.replace(/\s*\n\s*/g, " ")}${desc ? ": " + desc.replace(/\n+/g, " ") : ""}`);
      continue;
    }
    const heading = findAll(tr, (e) => /^h[2-6]$/.test(e.name))[0];
    if (heading) {
      flush();
      const txt = collapse(textOf(heading));
      if (txt) out.push(`**${txt}**`);
      continue;
    }
    const text = tidyInline(tds.map((td) => mdBlocks(td.children, { ...st, inTable: true }).join(" ")).filter(Boolean).join(hasClass(tr, "t-dsc-hitem") ? " — " : " "));
    if (!text) continue;
    flush();
    out.push(hasClass(tr, "t-dsc-hitem") ? `**${text.replace(/\n+/g, " ")}**` : text);
  }
  flush();
  return out;
}

function parMd(t, st) {
  const out = [];
  let items = [];
  const flush = () => {
    if (items.length) out.push(items.join("\n"));
    items = [];
  };
  for (const tr of rowsOf(t)) {
    const tds = cellsOf(tr);
    if (!tds.length) continue;
    if (hasClass(tr, "t-par")) {
      const name = collapse(textOf(tds[0]));
      const descTd = tds[tds.length - 1];
      const blocks = mdBlocks(descTd.children, st);
      const first = blocks.shift() || "";
      let item = `- ${name ? "`" + name + "`" : ""}${first ? " - " + first.replace(/\n/g, "\n  ") : ""}`;
      for (const b of blocks) item += "\n\n" + indent(b, "  ");
      items.push(item);
    } else if (hasClass(tr, "t-par-hitem")) {
      flush();
      const txt = collapse(textOf(tr));
      if (txt) out.push(`**${txt}**`);
    } else if (hasClass(tr, "t-par-req")) {
      const txt = tidyInline(mdBlocks(tds[0].children, { ...st, inTable: true }).join(" ")).replace(/^-\s*/, "");
      if (txt) items.push(`- ${txt.replace(/\n+/g, " ")}`);
    } else {
      const txt = tidyInline(tds.map((td) => mdBlocks(td.children, st).join(" ")).join(" "));
      if (txt) {
        flush();
        out.push(txt);
      }
    }
  }
  flush();
  return out;
}

function revMd(t, st) {
  const out = [];
  for (const tr of rowsOf(t)) {
    const tds = cellsOf(tr);
    if (!tds.length) continue;
    const blocks = mdBlocks(tds[0].children, st);
    const mark = tds.length > 1 ? marksText(tds[tds.length - 1]) : "";
    if (!blocks.length) continue;
    if (!mark) out.push(...blocks);
    else if (blocks.length === 1 && !blocks[0].startsWith("```") && !/^(- |\d+\. )/.test(blocks[0])) out.push(`${blocks[0]} ${mark}`);
    else out.push(`${mark}:`, ...blocks);
  }
  return out;
}

function sdscMd(t, st) {
  const lines = [];
  for (const tr of rowsOf(t)) {
    if (!hasClass(tr, "t-sdsc")) {
      const txt = tidyInline(cellsOf(tr).map((td) => mdBlocks(td.children, st).join(" ")).join(" "));
      if (txt) lines.push(txt);
      continue;
    }
    const tds = cellsOf(tr);
    const syntax = tidyInline(mdInlineChildren(tds[0], st)).replace(/\n+/g, " ");
    const extra = tds.slice(1).map((td) => collapse(textOf(td))).filter(Boolean).join(" ");
    lines.push(`- ${syntax}${extra ? "    " + extra : ""}`);
  }
  return lines.length ? [lines.join("\n")] : [];
}

function mdInlineChildren(n, st) {
  return (n.children || []).map((c) => (isBlockNode(c) ? " " + mdBlocks([c], st).join(" ") + " " : mdInline(c, st))).join("");
}

const SUP = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹", "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ" };
const SUB = { 0: "₀", 1: "₁", 2: "₂", 3: "₃", 4: "₄", 5: "₅", 6: "₆", 7: "₇", 8: "₈", 9: "₉", "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎" };

function scriptText(t, table, mark) {
  const s = collapse(t);
  if (!s) return "";
  if ([...s].every((ch) => table[ch])) return [...s].map((ch) => table[ch]).join("");
  return `${mark}(${s})`;
}

/** {{su}}: superscript / subscript pair separated by <br>. */
function suMd(n) {
  const parts = [""];
  const walk = (x) => {
    for (const c of x.children || []) {
      if (c.type === "text") parts[parts.length - 1] += c.data;
      else if (isTag(c) && c.name === "br") parts.push("");
      else if (isTag(c)) walk(c);
    }
  };
  walk(n);
  return scriptText(parts[0] || "", SUP, "^") + scriptText(parts[1] || "", SUB, "_");
}

function escapeMd(s) {
  return s
    .replace(/\u200b/g, "").replace(/</g, (m, i, str) => (/[A-Za-z\/!?]/.test(str[i + 1] || "") ? "\\<" : m)).replace(/\u00a0/g, " ").replace(/\ufeff/g, "");
}

function inlineCode(text) {
  const t = text.replace(/[\s\u00a0\ufeff]+/g, " ").trim();
  if (!t) return "";
  if (t.includes("`")) return "`` " + t + " ``";
  return "`" + t + "`";
}

const CODE_CLASSES = ["t-c", "t-lc", "mw-geshi", "t-dsc-see-tt"];

function mdInline(n, st) {
  if (n.type === "text") return escapeMd(n.data.replace(/\s+/g, " "));
  if (!isTag(n)) return "";
  const name = n.name;
  if (isBlockNode(n)) return " " + mdBlocks([n], st).join(" ") + " ";
  if (name === "br") return st.inTable ? " " : "\n";
  if (name === "span" && hasClass(n, "t-su")) return suMd(n);
  if (name === "sup" && /^[\s\d+\-n]+$/.test(textOf(n)) && !hasClass(n, "reference")) return scriptText(textOf(n), SUP, "^");
  if (name === "sub" && /^[\s\d+\-]+$/.test(textOf(n))) return scriptText(textOf(n), SUB, "_");
  if (name === "img") return "";
  if (name === "code" || name === "kbd" || name === "samp" || (name === "span" && CODE_CLASSES.some((c) => hasClass(n, c)))) {
    const raw = textOf(n);
    const lead = /^\s/.test(raw) ? " " : "";
    const trail = /\s$/.test(raw) ? " " : "";
    const code = inlineCode(raw);
    if (!code) return raw ? " " : "";
    if (st.seeAlso) {
      const a = n.name === "a" ? n : findAll(n, (e) => e.name === "a")[0];
      const url = a ? linkFor(a.attribs.href) : null;
      if (url) return `${lead}[${code}](${url})${trail}`;
    }
    return lead + code + trail;
  }
  const inner = mdInlineChildren(n, st);
  if (name === "span" && (hasClass(n, "t-mark-rev") || hasClass(n, "t-mark"))) return " " + inner + " ";
  if (name === "b" || name === "strong") return wrapEmph(inner, "**");
  if (name === "i" || name === "em" || name === "var" || (name === "span" && hasClass(n, "t-spar"))) return wrapEmph(inner, "*");
  if (name === "a" && st.seeAlso) {
    const url = linkFor(n.attribs.href);
    const t = inner.trim();
    if (url && t) return `[${t}](${url})`;
  }
  return inner;
}

function wrapEmph(inner, mark) {
  const t = inner.trim();
  if (!t) return inner;
  if (t.includes(mark[0]) || t.startsWith("`")) return inner;
  const lead = /^\s/.test(inner) ? " " : "";
  const trail = /\s$/.test(inner) ? " " : "";
  return `${lead}${mark}${t}${mark}${trail}`;
}

/* ------------------------------------------------------------------------ */

if (isMainThread) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
} else {
  workerMain();
}
