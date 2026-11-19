"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { highlightCppCode } from "@/lib/cpp-highlight";
import { cn } from "@/lib/utils";

type Block =
  | { type: "heading"; level: 2 | 3 | 4; text: string }
  | { type: "code"; lang: string; code: string }
  | { type: "blockquote"; lines: string[] }
  | {
      type: "table";
      headers: string[];
      alignments: ("left" | "center" | "right")[];
      rows: string[][];
    }
  | { type: "list"; ordered: boolean; items: ListItem[] }
  | { type: "hr" }
  | { type: "paragraph"; text: string };

interface ListItem {
  text: string;
  children?: { ordered: boolean; items: ListItem[] };
}

const CPP_LANGS = new Set(["cpp", "c++", "cc", "cxx", "c", "h", "hpp"]);

function isSafeHref(url: string): boolean {
  if (url.startsWith("/") || url.startsWith("#")) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function isFenceStart(
  line: string
): { char: "`" | "~"; len: number; lang: string } | null {
  const m = line.trim().match(/^(`{3,}|~{3,})(.*)$/);
  if (!m) return null;
  const info = (m[2] ?? "").trim().split(/\s+/)[0]?.toLowerCase() || "text";
  return { char: m[1][0] as "`" | "~", len: m[1].length, lang: info };
}

function isListLine(
  line: string
): { indent: number; ordered: boolean; content: string } | null {
  const m = line.match(/^([ ]*)([-*+]|\d+[.)])\s+(.*)$/);
  if (!m) return null;
  return { indent: m[1].length, ordered: /^\d/.test(m[2]), content: m[3] };
}

function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);

  const cells: string[] = [];
  let cur = "";
  let inCode = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\" && s[i + 1] === "|") {
      cur += "|";
      i++;
      continue;
    }
    if (ch === "`") inCode = !inCode;
    if (ch === "|" && !inCode) {
      cells.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function isTableSeparator(line: string): boolean {
  if (!line.includes("-")) return false;
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

function parseAlignments(line: string): ("left" | "center" | "right")[] {
  return splitTableRow(line).map((cell) => {
    const l = cell.startsWith(":");
    const r = cell.endsWith(":");
    if (l && r) return "center";
    if (r) return "right";
    return "left";
  });
}

function parseListBlock(
  lines: string[],
  startIdx: number,
  baseIndent: number
): { ordered: boolean; items: ListItem[]; nextIdx: number } {
  const first = isListLine(lines[startIdx])!;
  const ordered = first.ordered;
  const items: ListItem[] = [];
  let i = startIdx;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      const next = lines[i + 1];
      const nextList = next ? isListLine(next) : null;
      if (
        nextList &&
        nextList.indent >= baseIndent &&
        nextList.ordered === ordered
      ) {
        i++;
        continue;
      }
      break;
    }

    const parsed = isListLine(line);
    if (!parsed) {
      const indent = line.match(/^([ ]*)/)?.[1].length ?? 0;
      if (indent > baseIndent && items.length > 0 && !isFenceStart(line)) {
        items[items.length - 1].text += " " + line.trim();
        i++;
        continue;
      }
      break;
    }

    if (parsed.indent < baseIndent) break;
    if (parsed.indent > baseIndent && items.length > 0) {
      const sub = parseListBlock(lines, i, parsed.indent);
      items[items.length - 1].children = {
        ordered: sub.ordered,
        items: sub.items,
      };
      i = sub.nextIdx;
      continue;
    }
    if (parsed.ordered !== ordered && parsed.indent === baseIndent) break;

    items.push({ text: parsed.content.trim() });
    i++;
  }

  return { ordered, items, nextIdx: i };
}

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      i++;
      continue;
    }

    const fence = isFenceStart(line);
    if (fence) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length) {
        const closeMatch = lines[i].trim().match(/^(`{3,}|~{3,})\s*$/);
        if (
          closeMatch &&
          closeMatch[1][0] === fence.char &&
          closeMatch[1].length >= fence.len
        ) {
          i++;
          break;
        }
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: "code", lang: fence.lang, code: codeLines.join("\n") });
      continue;
    }

    if (/^(?:---+|===+|\*\*\*+)\s*$/.test(trimmed) && !trimmed.startsWith("|")) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const level = heading[1].length <= 2 ? 2 : heading[1].length === 3 ? 3 : 4;
      blocks.push({ type: "heading", level, text: heading[2] });
      i++;
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ type: "blockquote", lines: quoteLines });
      continue;
    }

    if (
      trimmed.includes("|") &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      const headers = splitTableRow(trimmed);
      const alignments = parseAlignments(lines[i + 1]);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length) {
        const rTrim = lines[i].trim();
        if (!rTrim || !rTrim.includes("|") || isFenceStart(lines[i])) break;
        rows.push(splitTableRow(rTrim));
        i++;
      }
      blocks.push({ type: "table", headers, alignments, rows });
      continue;
    }

    const listStart = isListLine(line);
    if (listStart) {
      const parsed = parseListBlock(lines, i, listStart.indent);
      blocks.push({
        type: "list",
        ordered: parsed.ordered,
        items: parsed.items,
      });
      i = parsed.nextIdx;
      continue;
    }

    const para: string[] = [];
    while (i < lines.length) {
      const pLine = lines[i];
      const pTrim = pLine.trim();
      if (
        !pTrim ||
        isFenceStart(pLine) ||
        /^(#{1,4})\s+/.test(pLine) ||
        pTrim.startsWith(">") ||
        /^(?:---+|===+|\*\*\*+)\s*$/.test(pTrim) ||
        isListLine(pLine) ||
        (pTrim.includes("|") &&
          i + 1 < lines.length &&
          isTableSeparator(lines[i + 1]))
      ) {
        break;
      }
      para.push(pTrim);
      i++;
    }
    if (para.length > 0) {
      blocks.push({ type: "paragraph", text: para.join(" ") });
    } else {
      i++;
    }
  }

  return blocks;
}

function findInlineClose(text: string, from: number, delim: string): number {
  let i = from;
  while (i < text.length) {
    if (text[i] === "\\" && i + 1 < text.length) {
      i += 2;
      continue;
    }
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end !== -1) {
        i = end + 1;
        continue;
      }
    }
    if (text.startsWith(delim, i)) {
      if (delim.length === 1) {
        const prev = text[i - 1];
        const next = text[i + 1];
        if (
          prev &&
          !/\s/.test(prev) &&
          (delim === "*" || !next || !/[A-Za-z0-9_]/.test(next))
        ) {
          return i;
        }
      } else {
        return i;
      }
    }
    i++;
  }
  return -1;
}

function renderInline(text: string, prefix = "ai"): ReactNode[] {
  const nodes: ReactNode[] = [];
  let buf = "";
  let i = 0;
  let k = 0;

  const flush = () => {
    if (buf) {
      nodes.push(buf);
      buf = "";
    }
  };

  while (i < text.length) {
    const ch = text[i];

    if (
      ch === "\\" &&
      i + 1 < text.length &&
      /[\\`*_{}[\]()#+\-.!|>~]/.test(text[i + 1])
    ) {
      buf += text[i + 1];
      i += 2;
      continue;
    }

    if (ch === "`") {
      let ticks = 1;
      while (text[i + ticks] === "`") ticks++;
      const closeStr = "`".repeat(ticks);
      const end = text.indexOf(closeStr, i + ticks);
      if (end !== -1) {
        flush();
        nodes.push(
          <code
            key={`${prefix}-c-${k++}`}
            className="rounded border border-line bg-paper-sunk px-1 py-0.5 font-mono text-[0.84em] text-ink [overflow-wrap:anywhere]"
          >
            {text.slice(i + ticks, end).trim()}
          </code>
        );
        i = end + ticks;
        continue;
      }
    }

    if (ch === "[") {
      const closeBracket = text.indexOf("]", i + 1);
      if (closeBracket !== -1 && text[closeBracket + 1] === "(") {
        let depth = 1;
        let p = closeBracket + 2;
        while (p < text.length && depth > 0) {
          if (text[p] === "(") depth++;
          else if (text[p] === ")") depth--;
          p++;
        }
        if (depth === 0) {
          const label = text.slice(i + 1, closeBracket);
          const url = text
            .slice(closeBracket + 2, p - 1)
            .trim()
            .split(/\s+"/)[0];
          flush();
          if (isSafeHref(url)) {
            if (url.startsWith("/") || url.startsWith("#")) {
              nodes.push(
                <Link
                  key={`${prefix}-l-${k++}`}
                  href={url}
                  className="text-ink underline decoration-line-strong underline-offset-3 hover:decoration-ink"
                >
                  {renderInline(label, `${prefix}-li-${k}`)}
                </Link>
              );
            } else {
              nodes.push(
                <a
                  key={`${prefix}-a-${k++}`}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ink underline decoration-line-strong underline-offset-3 hover:decoration-ink"
                >
                  {renderInline(label, `${prefix}-ai-${k}`)}
                </a>
              );
            }
          } else {
            nodes.push(label);
          }
          i = p;
          continue;
        }
      }

      const citeMatch = text.slice(i).match(/^\[(\d{1,2})\](?!\()/);
      if (citeMatch) {
        flush();
        nodes.push(
          <span
            key={`${prefix}-cite-${k++}`}
            className="mx-0.5 inline-flex items-center rounded bg-sun-wash px-1 py-0.5 font-mono text-[10px] font-medium text-ink align-baseline"
          >
            [{citeMatch[1]}]
          </span>
        );
        i += citeMatch[0].length;
        continue;
      }
    }

    if (
      (ch === "*" && text[i + 1] === "*") ||
      (ch === "_" && text[i + 1] === "_")
    ) {
      const close = findInlineClose(text, i + 2, ch + ch);
      if (close > i + 2) {
        flush();
        nodes.push(
          <strong key={`${prefix}-b-${k++}`} className="font-semibold text-ink">
            {renderInline(text.slice(i + 2, close), `${prefix}-bi-${k}`)}
          </strong>
        );
        i = close + 2;
        continue;
      }
    }

    if (ch === "*" || ch === "_") {
      const prev = i > 0 ? text[i - 1] : undefined;
      const next = text[i + 1];
      const canOpen =
        next && !/\s/.test(next) && (ch === "*" || !prev || !/[A-Za-z0-9_]/.test(prev));
      if (canOpen) {
        const close = findInlineClose(text, i + 1, ch);
        if (close > i + 1) {
          flush();
          nodes.push(
            <em key={`${prefix}-e-${k++}`}>
              {renderInline(text.slice(i + 1, close), `${prefix}-ei-${k}`)}
            </em>
          );
          i = close + 1;
          continue;
        }
      }
    }

    buf += ch;
    i++;
  }

  flush();
  return nodes;
}

function AiCodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const isCpp = CPP_LANGS.has(lang);
  const highlighted = isCpp ? highlightCppCode(code) : null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Ignore clipboard rejection
    }
  };

  return (
    <div className="my-2.5 overflow-hidden rounded-[var(--radius-panel)] border border-line bg-paper">
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <span className="font-mono text-[11px] text-ink-faint">{lang}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-ink-soft hover:bg-ink/5 hover:text-ink cursor-pointer"
        >
          {copied ? (
            <Check className="size-3 text-[color:var(--right)]" aria-hidden />
          ) : (
            <Copy className="size-3" aria-hidden />
          )}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="m-0 overflow-x-auto px-3.5 py-2.5 font-mono text-[0.78rem] leading-[1.6] text-[var(--code-ink)]">
        {highlighted ? (
          <code dangerouslySetInnerHTML={{ __html: highlighted }} />
        ) : (
          <code>{code}</code>
        )}
      </pre>
    </div>
  );
}

function renderList(
  ordered: boolean,
  items: ListItem[],
  key: string,
  nested = false
): ReactNode {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag
      key={key}
      className={cn(
        nested ? "mt-1 space-y-1 pl-4" : "my-2 space-y-1.5 pl-5",
        ordered ? "list-decimal" : "list-disc marker:text-ink-faint"
      )}
    >
      {items.map((item, idx) => (
        <li key={`${key}-${idx}`} className="leading-relaxed">
          {renderInline(item.text, `${key}-${idx}`)}
          {item.children
            ? renderList(
                item.children.ordered,
                item.children.items,
                `${key}-${idx}-sub`,
                true
              )
            : null}
        </li>
      ))}
    </Tag>
  );
}

export function AiMarkdown({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const blocks = parseBlocks(content);

  return (
    <div
      className={cn(
        "space-y-2.5 text-[0.9rem] leading-relaxed text-ink-body [overflow-wrap:anywhere]",
        className
      )}
    >
      {blocks.map((block, idx) => {
        const key = `aiblk-${idx}`;
        switch (block.type) {
          case "heading": {
            const Tag =
              block.level === 2 ? "h2" : block.level === 3 ? "h3" : "h4";
            return (
              <Tag
                key={key}
                className={cn(
                  "pt-1 text-ink",
                  block.level === 2
                    ? "font-display text-lg font-[450] tracking-[-0.015em]"
                    : "text-sm font-semibold"
                )}
              >
                {renderInline(block.text, key)}
              </Tag>
            );
          }
          case "code":
            return <AiCodeBlock key={key} lang={block.lang} code={block.code} />;
          case "blockquote":
            return (
              <blockquote
                key={key}
                className="border-l-2 border-line-strong pl-3 text-ink-soft space-y-1"
              >
                {block.lines.map((line, li) => (
                  <p key={li}>{renderInline(line, `${key}-q-${li}`)}</p>
                ))}
              </blockquote>
            );
          case "table":
            return (
              <div
                key={key}
                className="my-2 overflow-x-auto rounded-[var(--radius-panel)] border border-line bg-paper"
              >
                <table className="w-full border-collapse text-left text-xs leading-snug">
                  <thead>
                    <tr className="border-b border-line bg-paper-sunk/65">
                      {block.headers.map((h, hi) => (
                        <th
                          key={hi}
                          style={{ textAlign: block.alignments[hi] ?? "left" }}
                          className="px-3 py-2 font-semibold text-ink"
                        >
                          {renderInline(h, `${key}-h-${hi}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {block.rows.map((row, ri) => (
                      <tr key={ri}>
                        {block.headers.map((_h, ci) => (
                          <td
                            key={ci}
                            style={{ textAlign: block.alignments[ci] ?? "left" }}
                            className="px-3 py-2 align-top text-ink-body"
                          >
                            {renderInline(row[ci] ?? "", `${key}-r-${ri}-c-${ci}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "list":
            return renderList(block.ordered, block.items, key);
          case "hr":
            return <hr key={key} className="my-3 border-line" />;
          case "paragraph":
            return <p key={key}>{renderInline(block.text, key)}</p>;
        }
      })}
    </div>
  );
}
