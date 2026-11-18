#!/usr/bin/env node
// Validates the /content tree independently of the app (see content/AUTHORING.md).
// Usage: node scripts/check-content.mjs [--allow-missing] [--strict]
//   --allow-missing: topics listed in tracks.json but not yet written are warnings.
//   --strict:        style warnings (heading count, option count, links missing
//                    from the offline snapshot) become errors.
//
// Errors are problems the app would mis-render or that break invariants (bad
// JSON, unknown tracks or prerequisites, duplicate quiz ids, answer indexes out
// of range). Warnings are house-style deviations.
import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter } from "./lib/frontmatter.mjs";

const ROOT = path.join(process.cwd(), "content");
const REFERENCE_INDEX = path.join(process.cwd(), "data", "reference", "index.json");
const allowMissing = process.argv.includes("--allow-missing");
const strict = process.argv.includes("--strict");
const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => (strict ? errors : warnings).push(`${where}: ${msg}`);

const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const QUESTION_ID = /^[a-z0-9][a-z0-9-]*$/;
const KINDS = new Set(["warmup", "tricky", "standardese"]);
const isStr = (v) => typeof v === "string";
const isNonEmptyStr = (v) => isStr(v) && v.trim().length > 0;
const isStrArray = (v) => Array.isArray(v) && v.every(isStr);

const read = (f) => fs.readFileSync(f, "utf8");
function readJson(f, where) {
  try {
    return JSON.parse(read(f));
  } catch (e) {
    err(where, `invalid JSON (${e.message})`);
    return undefined;
  }
}

// ---- reference index (for cppreference links)
let referencePaths = null;
if (fs.existsSync(REFERENCE_INDEX)) {
  const entries = JSON.parse(read(REFERENCE_INDEX));
  referencePaths = new Map(entries.map((e) => [e.path, e]));
} else {
  warnings.push("data/reference/index.json not found: cppreference links not checked against the snapshot (run pnpm import:cppreference)");
}
const lowerPaths = new Map();
for (const p of referencePaths?.keys() ?? []) {
  const k = p.toLowerCase();
  lowerPaths.set(k, [...(lowerPaths.get(k) ?? []), p]);
}
/** Same resolution as src/lib/topics.ts: exact, then unique case-insensitive, then follow a redirect. */
function resolveReference(p) {
  let e = referencePaths.get(p);
  if (!e) {
    const c = lowerPaths.get(p.toLowerCase()) ?? [];
    if (c.length === 1) e = referencePaths.get(c[0]);
  }
  if (e?.kind === "redirect" && e.redirectTo !== undefined) e = referencePaths.get(e.redirectTo);
  return e && e.kind !== "redirect" ? e : undefined;
}

// ---- tracks
const tracksFile = path.join(ROOT, "tracks.json");
if (!fs.existsSync(tracksFile)) {
  console.error("content/tracks.json not found");
  process.exit(1);
}
const tracksRaw = readJson(tracksFile, "tracks.json");
const trackList = Array.isArray(tracksRaw) ? tracksRaw : tracksRaw?.tracks;
const tracks = [];
if (!Array.isArray(trackList)) err("tracks.json", 'expected { "tracks": [...] }');
else {
  trackList.forEach((t, i) => {
    const where = `tracks.json #${i + 1}`;
    if (!t || typeof t !== "object") return err(where, "not an object");
    if (!isStr(t.id) || !SLUG.test(t.id)) err(where, `id must be a slug, got ${JSON.stringify(t.id)}`);
    if (!isNonEmptyStr(t.title)) err(where, "missing title");
    if (!isNonEmptyStr(t.description)) err(where, "missing description");
    if (!isStrArray(t.topics)) err(where, "topics must be an array of slugs");
    else tracks.push(t);
  });
}

const slugToTrack = new Map();
for (const t of tracks) {
  for (const s of t.topics) {
    if (!SLUG.test(s)) err("tracks.json", `topic slug "${s}" is not a valid slug`);
    if (slugToTrack.has(s)) err("tracks.json", `topic "${s}" listed in both "${slugToTrack.get(s)}" and "${t.id}"`);
    slugToTrack.set(s, t.id);
  }
}
const trackIds = new Set(tracks.map((t) => t.id));

const topicsDir = path.join(ROOT, "topics");
const dirs = fs.existsSync(topicsDir)
  ? fs.readdirSync(topicsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  : [];
for (const d of dirs) {
  if (!slugToTrack.has(d)) err(`topics/${d}`, "directory is not listed in tracks.json (the app would not show it)");
}

const existing = new Set(
  [...slugToTrack.keys()].filter((s) => fs.existsSync(path.join(topicsDir, s, "article.md"))),
);

// ---- per topic
const rows = [];
const questionIds = new Map();
const prerequisiteEdges = new Map();

function checkMapNode(node, where, depth, stats) {
  if (!node || typeof node !== "object") return err(where, "map node is not an object");
  if (!isNonEmptyStr(node.label)) err(where, "map node without a label");
  if (node.note !== undefined && !isStr(node.note)) err(where, `"${node.label}": note must be a string`);
  stats.nodes++;
  stats.depth = Math.max(stats.depth, depth);
  if (node.children !== undefined) {
    if (!Array.isArray(node.children)) return err(where, `"${node.label}": children must be an array`);
    for (const c of node.children) checkMapNode(c, where, depth + 1, stats);
  }
}

for (const [slug, trackId] of slugToTrack) {
  const where = `topics/${slug}`;
  const dir = path.join(topicsDir, slug);
  const files = ["article.md", "quiz.json", "map.json"];
  const missing = files.filter((f) => !fs.existsSync(path.join(dir, f)));
  if (missing.length) {
    if (missing.includes("article.md")) (allowMissing ? warn : err)(where, `missing ${missing.join(", ")}`);
    else warn(where, `missing ${missing.join(", ")}`);
  }
  const row = { slug, words: "-", warmup: 0, tricky: 0, standardese: 0, qs: 0, nodes: "-", local: "-" };

  // article
  if (!missing.includes("article.md")) {
    const af = `${where}/article.md`;
    let fm, body;
    try {
      ({ data: fm, body } = parseFrontmatter(read(path.join(dir, "article.md"))));
    } catch (e) {
      err(af, `frontmatter parse failed (${e.message})`);
    }
    if (fm) {
      if (!isNonEmptyStr(fm.title)) err(af, "frontmatter: title is required");
      if (!isNonEmptyStr(fm.summary)) err(af, "frontmatter: summary is required");
      if (!isNonEmptyStr(fm.track)) err(af, "frontmatter: track is required");
      else {
        if (!trackIds.has(fm.track)) err(af, `unknown track "${fm.track}"`);
        else if (fm.track !== trackId) err(af, `frontmatter track "${fm.track}" but tracks.json lists it under "${trackId}"`);
      }
      if (fm.minutes !== undefined && !(Number.isInteger(fm.minutes) && fm.minutes > 0)) err(af, "minutes must be a positive integer");
      if (fm.minutes === undefined) warn(af, "no minutes (reading time defaults to 8)");
      const standard = fm.standard ?? [];
      if (!isStrArray(standard)) err(af, "standard must be a list of section labels");
      else {
        for (const s of standard) if (!/^\[[a-z0-9_.:-]+\]$/i.test(s)) warn(af, `standard label "${s}" is not of the form [stable.name]`);
      }
      const prereqs = fm.prerequisites ?? [];
      if (!isStrArray(prereqs)) err(af, "prerequisites must be a list of topic slugs");
      else {
        prerequisiteEdges.set(slug, prereqs);
        for (const p of prereqs) {
          if (p === slug) err(af, "topic lists itself as a prerequisite");
          else if (!slugToTrack.has(p)) err(af, `prerequisite "${p}" is not a topic in tracks.json`);
          else if (!existing.has(p)) (allowMissing ? warn : err)(af, `prerequisite "${p}" has no article yet`);
        }
      }
      const links = fm.cppreference ?? [];
      if (!Array.isArray(links)) err(af, "cppreference must be a list of { title, path }");
      else {
        let local = 0;
        for (const l of links) {
          if (!l || typeof l !== "object" || !isNonEmptyStr(l.title)) {
            err(af, "cppreference entry without a title");
            continue;
          }
          const target = isStr(l.path) ? l.path : isStr(l.url) ? l.url : null;
          if (!target) {
            err(af, `cppreference "${l.title}": needs path (or url)`);
            continue;
          }
          if (isStr(l.url) && !/^https:\/\/en\.cppreference\.com\/w\/cpp\//.test(l.url)) {
            err(af, `cppreference URL not under https://en.cppreference.com/w/cpp/: ${l.url}`);
            continue;
          }
          const p = target
            .replace(/^https?:\/\/en\.cppreference\.com\/w\/cpp\//, "")
            .replace(/^\/?w\/cpp\//, "")
            .split("#")[0]
            .replace(/^\/+|\/+$/g, "");
          if (!p) err(af, `cppreference "${l.title}": empty path`);
          else if (referencePaths) {
            if (resolveReference(p)) local++;
            else warn(af, `cppreference "${p}" is not in the offline snapshot (links to cppreference.com instead)`);
          }
        }
        row.local = `${local}/${links.length}`;
        if (!links.length) warn(af, "no cppreference links");
      }
    }

    if (body !== undefined) {
      // body checks (fence-aware)
      let inFence = false;
      let fenceChar = "";
      let h2 = 0;
      body.split("\n").forEach((line, i) => {
        const t = line.trim();
        const m = /^(```+|~~~+)(.*)$/.exec(t);
        if (m) {
          if (!inFence) {
            inFence = true;
            fenceChar = m[1][0];
            if (!m[2].trim()) warn(af, `code fence without a language at body line ${i + 1}`);
          } else if (m[1][0] === fenceChar && !m[2].trim()) {
            inFence = false;
          }
          return;
        }
        if (inFence) return;
        if (/^#\s/.test(line)) err(af, `h1 in body at line ${i + 1} (the title is the only h1): ${line}`);
        if (/^##\s/.test(line)) h2++;
        for (const u of line.matchAll(/https?:\/\/[^\s)>\]"']*cppreference[^\s)>\]"']*/g)) {
          let host;
          try { host = new URL(u[0]).hostname; } catch { continue; }
          if (host !== "en.cppreference.com") err(af, `cppreference URL not on en.cppreference.com: ${u[0]}`);
        }
      });
      if (inFence) err(af, "unterminated code fence");
      if (h2 < 4) warn(af, `only ${h2} "##" headings (house style: at least 4)`);
      row.words = body.replace(/```[\s\S]*?```/g, " ").split(/\s+/).filter(Boolean).length;
    }
  }

  // quiz
  if (!missing.includes("quiz.json")) {
    const qf = `${where}/quiz.json`;
    const raw = readJson(path.join(dir, "quiz.json"), qf);
    if (raw) {
      if (!Array.isArray(raw.questions)) err(qf, 'expected { "questions": [...] }');
      else {
        raw.questions.forEach((q, i) => {
          const label = `${qf} #${i + 1}${q?.id ? ` (${q.id})` : ""}`;
          if (!q || typeof q !== "object") return err(label, "not an object");
          if (!isStr(q.id) || !QUESTION_ID.test(q.id)) return err(label, "id must match [a-z0-9-]+");
          if (questionIds.has(q.id)) err(label, `duplicate question id (also in ${questionIds.get(q.id)})`);
          else questionIds.set(q.id, qf);
          if (!KINDS.has(q.kind)) err(label, `kind must be warmup, tricky or standardese (got ${JSON.stringify(q.kind)})`);
          else row[q.kind]++;
          row.qs++;
          if (!isNonEmptyStr(q.prompt)) err(label, "empty prompt");
          if (q.code !== undefined && !isStr(q.code)) err(label, "code must be a string");
          if (!isStrArray(q.options)) return err(label, "options must be an array of strings");
          if (q.options.length < 2) err(label, `${q.options.length} options (need at least 2)`);
          else if (q.options.length < 3 || q.options.length > 5) warn(label, `${q.options.length} options (house style: 3-5)`);
          if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) err(label, `answer index ${q.answer} out of range`);
          const norm = q.options.map((o) => o.trim().toLowerCase());
          if (new Set(norm).size !== norm.length) err(label, "duplicate options");
          if (q.options.some((o) => !o.trim())) err(label, "empty option");
          if (!isNonEmptyStr(q.explanation)) err(label, "empty explanation");
          if (q.refs !== undefined && !isStrArray(q.refs)) err(label, "refs must be an array of strings");
        });
        if (raw.questions.length === 0) warn(qf, "no questions");
      }
    }
  }

  // map
  if (!missing.includes("map.json")) {
    const mf = `${where}/map.json`;
    const raw = readJson(path.join(dir, "map.json"), mf);
    if (raw) {
      if (!raw.root) err(mf, 'expected { "root": { label, note, children } }');
      else {
        const stats = { nodes: 0, depth: 0 };
        checkMapNode(raw.root, mf, 1, stats);
        row.nodes = stats.nodes;
        if (stats.depth > 4) warn(mf, `depth ${stats.depth} exceeds 4 levels`);
      }
    }
  }
  rows.push(row);
}

// ---- prerequisite cycles
const state = new Map();
function visit(s, stack) {
  if (state.get(s) === "done") return;
  if (state.get(s) === "active") {
    err("prerequisites", `cycle: ${[...stack.slice(stack.indexOf(s)), s].join(" -> ")}`);
    return;
  }
  state.set(s, "active");
  for (const p of prerequisiteEdges.get(s) ?? []) visit(p, [...stack, s]);
  state.set(s, "done");
}
for (const s of prerequisiteEdges.keys()) visit(s, []);

// ---- report
const pad = (v, n) => String(v).padEnd(n);
const w = Math.max(5, ...rows.map((r) => r.slug.length));
console.log(`${pad("topic", w)}  ${pad("words", 6)} ${pad("warm", 5)} ${pad("tricky", 6)} ${pad("std", 4)} ${pad("total", 5)} ${pad("nodes", 5)} local refs`);
for (const r of rows) {
  console.log(`${pad(r.slug, w)}  ${pad(r.words, 6)} ${pad(r.warmup, 5)} ${pad(r.tricky, 6)} ${pad(r.standardese, 4)} ${pad(r.qs, 5)} ${pad(r.nodes, 5)} ${r.local}`);
}
console.log(`\n${tracks.length} track(s), ${rows.length} topic(s), ${existing.size} with articles, ${questionIds.size} question(s)`);
if (warnings.length) {
  console.log(`\nWarnings (${warnings.length}):`);
  for (const m of warnings) console.log(`  warn  ${m}`);
}
if (errors.length) {
  console.log(`\nErrors (${errors.length}):`);
  for (const m of errors) console.log(`  ERROR ${m}`);
  process.exit(1);
}
console.log("\nOK");
