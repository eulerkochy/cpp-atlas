#!/usr/bin/env node
// Advisory syntax check of every ```cpp fence and quiz `code` snippet in content/topics.
// Usage: node scripts/check-snippets.mjs [--strict] [--verbose]
// Compiler: $CXX or g++-16, -fsyntax-only; tries -std=c++23, then -std=c++26 with contracts and reflection.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { parseFrontmatter } from "./lib/frontmatter.mjs";

const CXX = process.env.CXX || "g++-16";
const strict = process.argv.includes("--strict");
const verbose = process.argv.includes("--verbose");
const ROOT = path.join(process.cwd(), "content", "topics");

const PRELUDE = [
  "algorithm", "array", "atomic", "cassert", "cstddef", "cstdint", "cstdio", "cstdlib",
  "cstring", "functional", "iostream", "map", "memory", "mutex", "new", "optional",
  "string", "string_view", "thread", "tuple", "type_traits", "utility", "variant",
  "vector", "bit", "span", "ranges", "concepts", "initializer_list", "limits", "numeric",
].map((h) => `#include <${h}>`).join("\n") + "\nusing namespace std;\n";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cpp-snippets-"));
let counter = 0;

// Flag sets tried in order: C++23 first, then C++26 with the opt-in features.
const FLAG_SETS = [["-std=c++23"], ["-std=c++26", "-fcontracts", "-freflection"]];

function run(args) {
  return new Promise((resolve) => {
    execFile(CXX, args, { encoding: "utf8", maxBuffer: 16 << 20 }, (err, _out, stderr) => {
      if (err && err.code === "ENOENT") resolve({ ok: false, out: `cannot run ${CXX}`, fatal: true });
      else resolve({ ok: !err, out: stderr || "" });
    });
  });
}

async function compile(src) {
  const file = path.join(tmp, `s${counter++}.cpp`);
  fs.writeFileSync(file, src);
  let last;
  for (const flags of FLAG_SETS) {
    last = await run([...flags, "-fsyntax-only", "-w", file]);
    if (last.ok || last.fatal) return last;
  }
  return last;
}

function firstError(out) {
  const lines = out.split("\n");
  const e = lines.find((l) => /error:/.test(l)) ?? lines.find((l) => l.trim()) ?? "(no output)";
  return e.replace(/^.*?s\d+\.cpp:/, "").trim().slice(0, 200);
}

const selfContained = (s) => /\bmain\s*\(/.test(s);

// Module units span several files and need -fmodules; they cannot be checked one fence at a time.
const isModuleUnit = (s) => /^\s*(export\s+)?(module\b|import\s+[\w.:<"])/m.test(s);

async function check(src) {
  const a = await compile(src);
  if (a.ok || a.fatal) return a;
  const b = await compile(PRELUDE + "#line 1\n" + src);
  if (b.ok) return { ok: true, out: "", wrapped: true };
  // Fragment: statements outside a function. Try wrapping in a function body.
  if (!selfContained(src)) {
    const c = await compile(PRELUDE + "void __snippet_fn() {\n" + src + "\n}\n");
    if (c.ok) return { ok: true, out: "", wrapped: true };
  }
  return { ok: false, out: b.out || a.out };
}

// ---- collect
const snippets = [];
const fenceRe = /^(```+|~~~+)\s*([A-Za-z0-9_+-]*)[^\n]*\n([\s\S]*?)^\1\s*$/gm;
if (fs.existsSync(ROOT)) {
  for (const slug of fs.readdirSync(ROOT).sort()) {
    const dir = path.join(ROOT, slug);
    if (!fs.statSync(dir).isDirectory()) continue;
    const art = path.join(dir, "article.md");
    if (fs.existsSync(art)) {
      let content = "";
      try {
        ({ body: content } = parseFrontmatter(fs.readFileSync(art, "utf8")));
      } catch {
        /* check-content reports it */
      }
      let i = 0;
      for (const m of content.matchAll(fenceRe)) {
        if (!/^(cpp|c\+\+|cxx)$/i.test(m[2])) continue;
        i++;
        snippets.push({ file: `${slug}/article.md`, idx: `#${i}`, src: m[3], expected: false });
      }
    }
    const quiz = path.join(dir, "quiz.json");
    if (fs.existsSync(quiz)) {
      let qs = [];
      try { qs = JSON.parse(fs.readFileSync(quiz, "utf8")).questions ?? []; } catch { /* check-content reports it */ }
      for (const q of qs) {
        if (!q.code) continue;
        const text = `${q.options?.[q.answer] ?? ""} ${q.explanation ?? ""}`;
        snippets.push({
          file: `${slug}/quiz.json`,
          idx: q.id,
          src: q.code,
          expected: /ill-formed|does not compile|doesn't compile|not compile|fails to compile/i.test(text),
        });
      }
    }
  }
}

let ok = 0, wrapped = 0, skippedModules = 0;
const failures = [], expectedFailures = [], unexpectedPasses = [];
const queue = snippets.filter((s) => {
  if (isModuleUnit(s.src)) { skippedModules++; return false; }
  return true;
});
let next = 0, fatal = null;
async function worker() {
  while (next < queue.length && !fatal) {
    const s = queue[next++];
    const r = await check(s.src);
    if (r.fatal) { fatal = r.out; return; }
    if (r.ok) {
      ok++;
      if (r.wrapped) wrapped++;
      if (s.expected) unexpectedPasses.push(s);
    } else {
      const rec = { ...s, error: firstError(r.out) };
      (s.expected ? expectedFailures : failures).push(rec);
    }
  }
}
await Promise.all(Array.from({ length: Math.max(2, os.cpus().length - 2) }, worker));
if (fatal) {
  console.error(fatal);
  process.exit(strict ? 1 : 0);
}
const byName = (x, y) => (x.file + x.idx).localeCompare(y.file + y.idx);
failures.sort(byName); expectedFailures.sort(byName); unexpectedPasses.sort(byName);

console.log(`compiler: ${CXX} -fsyntax-only (C++23, then C++26 with contracts and reflection)`);
console.log(`${snippets.length} snippet(s): ${ok} ok (${wrapped} needed the prelude/wrapper), ${failures.length} failed, ${expectedFailures.length} expected failures, ${skippedModules} module unit(s) skipped`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  ${f.file} [${f.idx}]: ${f.error}`);
}
if (expectedFailures.length && verbose) {
  console.log("\nExpected failures (quiz says ill-formed):");
  for (const f of expectedFailures) console.log(`  ${f.file} [${f.idx}]: ${f.error}`);
}
if (unexpectedPasses.length) {
  console.log("\nNote: quiz mentions ill-formed but the snippet compiled (may be a semantic or UB point):");
  for (const f of unexpectedPasses) console.log(`  ${f.file} [${f.idx}]`);
}
fs.rmSync(tmp, { recursive: true, force: true });
if (strict && failures.length) process.exit(1);
