// Parser for the frontmatter subset content/topics/*/article.md uses (the same
// subset src/lib/topics.ts reads): scalar keys, lists of scalars, and lists of
// one-level objects. Scalars are JSON strings, numbers, `[]` or bare words.

function scalar(raw) {
  const v = raw.trim();
  if (v === "[]") return [];
  if (v.startsWith('"')) return JSON.parse(v);
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (v === "true" || v === "false") return v === "true";
  return v;
}

/** Splits "---\nyaml\n---\nbody" and parses the yaml. Throws on lines it does not understand. */
export function parseFrontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text.replace(/\r\n?/g, "\n"));
  if (!m) throw new Error("no frontmatter block");
  const data = {};
  let key = null;
  let obj = null;
  m[1].split("\n").forEach((line, i) => {
    if (!line.trim() || /^\s*#/.test(line)) return;
    let r;
    if ((r = /^([A-Za-z_][\w-]*):(?:\s+(.*))?$/.exec(line))) {
      key = r[1];
      obj = null;
      data[key] = r[2] === undefined || r[2].trim() === "" ? [] : scalar(r[2]);
    } else if ((r = /^\s+-\s+([A-Za-z_]\w*):\s+(.*)$/.exec(line)) && key && Array.isArray(data[key])) {
      obj = { [r[1]]: scalar(r[2]) };
      data[key].push(obj);
    } else if ((r = /^\s{3,}([A-Za-z_]\w*):\s+(.*)$/.exec(line)) && obj) {
      obj[r[1]] = scalar(r[2]);
    } else if ((r = /^\s+-\s+(.*)$/.exec(line)) && key && Array.isArray(data[key])) {
      obj = null;
      data[key].push(scalar(r[1]));
    } else {
      throw new Error(`frontmatter line ${i + 2} not understood: ${line}`);
    }
  });
  return { data, body: m[2] };
}
