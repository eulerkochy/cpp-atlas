import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { CppCodeBlock } from "@/components/CppCodeBlock";
import { createHeadingSlugger, stripMarkdownInline } from "@/types/topics";
import { cn } from "@/lib/utils";

type Block =
  | { type: "heading"; level: 2 | 3 | 4; text: string }
  | {
      type: "code";
      lang: string;
      caption?: string;
      code: string;
    }
  | { type: "blockquote"; lines: string[] }
  | { type: "table"; headers: string[]; alignments: ("left" | "center" | "right")[]; rows: string[][] }
  | { type: "list"; ordered: boolean; items: ListItem[] }
  | { type: "hr" }
  | { type: "paragraph"; text: string };

interface ListItem {
  text: string;
  children?: { ordered: boolean; items: ListItem[] };
}

function parseCodeInfo(info: string): { lang: string; caption?: string } {
  const trimmed = info.trim();
  if (!trimmed) return { lang: "text" };
  const spaceIdx = trimmed.search(/\s/);
  if (spaceIdx < 0) return { lang: trimmed.toLowerCase() };

  const lang = trimmed.slice(0, spaceIdx).toLowerCase();
  const rest = trimmed.slice(spaceIdx + 1).trim();
  const titleMatch = rest.match(/^(?:title|caption)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))$/i);
  const caption = titleMatch
    ? (titleMatch[1] ?? titleMatch[2] ?? titleMatch[3] ?? "").trim()
    : rest.replace(/^["']|["']$/g, "");
  return { lang, caption: caption || undefined };
}

function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);

  const cells: string[] = [];
  let current = "";
  let inBackticks = false;
  let backtickLen = 0;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\" && s[i + 1] === "|") {
      current += "|";
      i++;
      continue;
    }
    if (ch === "`") {
      let run = 1;
      while (s[i + run] === "`") run++;
      if (!inBackticks) {
        inBackticks = true;
        backtickLen = run;
      } else if (run === backtickLen) {
        inBackticks = false;
        backtickLen = 0;
      }
      current += "`".repeat(run);
      i += run - 1;
      continue;
    }
    if (ch === "|" && !inBackticks) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function isTableSeparatorLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("-")) return false;
  const cells = splitTableRow(trimmed);
  if (cells.length === 0) return false;
  return cells.every((cell) => /^:?-{2,}:?$/.test(cell));
}

function parseTableAlignments(
  line: string
): ("left" | "center" | "right")[] {
  return splitTableRow(line).map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    return "left";
  });
}

function isFenceStart(line: string): { char: "`" | "~"; len: number; info: string } | null {
  const m = line.trim().match(/^(`{3,}|~{3,})(.*)$/);
  if (!m) return null;
  return {
    char: m[1][0] as "`" | "~",
    len: m[1].length,
    info: m[2] ?? "",
  };
}

function isListLine(line: string): { indent: number; ordered: boolean; content: string } | null {
  const m = line.match(/^([ ]*)([-*+]|\d+[.)])\s+(.*)$/);
  if (!m) return null;
  return {
    indent: m[1].length,
    ordered: /^\d/.test(m[2]),
    content: m[3],
  };
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
      // Blank line ends list unless followed by an indented continuation or same-level list item
      const next = lines[i + 1];
      const nextList = next ? isListLine(next) : null;
      if (nextList && nextList.indent >= baseIndent && nextList.ordered === ordered) {
        i++;
        continue;
      }
      break;
    }

    const parsed = isListLine(line);
    if (!parsed) {
      // Continuation line of the previous item if indented
      const indent = line.match(/^([ ]*)/)?.[1].length ?? 0;
      if (indent > baseIndent && items.length > 0 && !isFenceStart(line)) {
        items[items.length - 1].text += " " + line.trim();
        i++;
        continue;
      }
      break;
    }

    if (parsed.indent < baseIndent) break;

    if (parsed.indent > baseIndent) {
      if (items.length > 0) {
        const sub = parseListBlock(lines, i, parsed.indent);
        items[items.length - 1].children = {
          ordered: sub.ordered,
          items: sub.items,
        };
        i = sub.nextIdx;
        continue;
      }
    }

    if (parsed.ordered !== ordered && parsed.indent === baseIndent) {
      break;
    }

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

    // Fenced code block
    const fence = isFenceStart(line);
    if (fence) {
      const { lang, caption } = parseCodeInfo(fence.info);
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
      blocks.push({
        type: "code",
        lang,
        caption,
        code: codeLines.join("\n"),
      });
      continue;
    }

    // Horizontal rule
    if (/^(?:---+|===+|\*\*\*+)\s*$/.test(trimmed) && !trimmed.startsWith("|")) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // Headings (# treated as h2 fallback, ## -> h2, ### -> h3, #### -> h4)
    const headingMatch = line.match(/^(#{1,4})\s+(.+?)\s*#*\s*$/);
    if (headingMatch) {
      const rawLevel = headingMatch[1].length;
      const level: 2 | 3 | 4 = rawLevel <= 2 ? 2 : rawLevel === 3 ? 3 : 4;
      blocks.push({
        type: "heading",
        level,
        text: headingMatch[2],
      });
      i++;
      continue;
    }

    // Blockquote / Callout
    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length) {
        const qTrim = lines[i].trim();
        if (!qTrim.startsWith(">")) break;
        quoteLines.push(qTrim.replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ type: "blockquote", lines: quoteLines });
      continue;
    }

    // GFM Table
    if (
      trimmed.includes("|") &&
      i + 1 < lines.length &&
      isTableSeparatorLine(lines[i + 1])
    ) {
      const headers = splitTableRow(trimmed);
      const alignments = parseTableAlignments(lines[i + 1]);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length) {
        const rowTrim = lines[i].trim();
        if (!rowTrim || !rowTrim.includes("|")) break;
        if (isFenceStart(lines[i]) || rowTrim.startsWith(">")) break;
        rows.push(splitTableRow(rowTrim));
        i++;
      }
      blocks.push({ type: "table", headers, alignments, rows });
      continue;
    }

    // Lists
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

    // Paragraph
    const paraLines: string[] = [];
    while (i < lines.length) {
      const pLine = lines[i];
      const pTrim = pLine.trim();
      if (!pTrim) break;
      if (
        isFenceStart(pLine) ||
        /^(#{1,4})\s+/.test(pLine) ||
        pTrim.startsWith(">") ||
        /^(?:---+|===+|\*\*\*+)\s*$/.test(pTrim) ||
        isListLine(pLine) ||
        (pTrim.includes("|") &&
          i + 1 < lines.length &&
          isTableSeparatorLine(lines[i + 1]))
      ) {
        break;
      }
      paraLines.push(pTrim);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: "paragraph", text: paraLines.join(" ") });
    } else {
      i++;
    }
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Inline Markdown Renderer
// ---------------------------------------------------------------------------

function isWordChar(ch: string | undefined): boolean {
  return Boolean(ch && /[A-Za-z0-9_]/.test(ch));
}

function findInlineClose(
  text: string,
  from: number,
  delim: string,
  isSingleEmphasis = false
): number {
  let i = from;
  while (i < text.length) {
    if (text[i] === "\\" && i + 1 < text.length) {
      i += 2;
      continue;
    }
    if (text[i] === "`") {
      let ticks = 1;
      while (text[i + ticks] === "`") ticks++;
      const closeStr = "`".repeat(ticks);
      let end = text.indexOf(closeStr, i + ticks);
      while (end !== -1 && text[end + ticks] === "`") {
        const skip = text.slice(end).match(/^`+/)?.[0].length ?? ticks;
        end = text.indexOf(closeStr, end + skip);
      }
      if (end !== -1) {
        i = end + ticks;
        continue;
      }
    }
    if (text.startsWith(delim, i)) {
      if (isSingleEmphasis) {
        const prevCh = text[i - 1];
        const nextCh = text[i + 1];
        if (
          prevCh &&
          !/\s/.test(prevCh) &&
          (delim === "*" || !isWordChar(nextCh))
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

function renderInline(text: string, keyPrefix = "in"): ReactNode[] {
  const nodes: ReactNode[] = [];
  let buf = "";
  let i = 0;
  let k = 0;

  const flushText = () => {
    if (buf) {
      nodes.push(buf);
      buf = "";
    }
  };

  while (i < text.length) {
    const ch = text[i];

    // Escaped punctuation
    if (ch === "\\" && i + 1 < text.length && /[\\`*_{}[\]()#+\-.!|>~]/.test(text[i + 1])) {
      buf += text[i + 1];
      i += 2;
      continue;
    }

    // Inline code span (`...` or ``...``)
    if (ch === "`") {
      let ticks = 1;
      while (text[i + ticks] === "`") ticks++;
      const closeStr = "`".repeat(ticks);
      const closeIdx = text.indexOf(closeStr, i + ticks);
      if (closeIdx !== -1) {
        // Make sure closing backtick run is exact length
        let end = closeIdx;
        while (end !== -1 && text[end + ticks] === "`") {
          const skip = text.slice(end).match(/^`+/)?.[0].length ?? ticks;
          end = text.indexOf(closeStr, end + skip);
        }
        if (end !== -1) {
          flushText();
          let codeContent = text.slice(i + ticks, end);
          if (
            codeContent.length >= 2 &&
            codeContent.startsWith(" ") &&
            codeContent.endsWith(" ") &&
            codeContent.trim().length > 0
          ) {
            codeContent = codeContent.slice(1, -1);
          }
          nodes.push(
            <code key={`${keyPrefix}-${k++}`} className="not-italic">
              {codeContent}
            </code>
          );
          i = end + ticks;
          continue;
        }
      }
    }

    // Markdown link [label](url)
    if (ch === "[") {
      const closeBracket = text.indexOf("]", i + 1);
      if (closeBracket !== -1 && text[closeBracket + 1] === "(") {
        // Find matching closing paren (allowing balanced parens in URLs like C++ operator())
        let depth = 1;
        let p = closeBracket + 2;
        while (p < text.length && depth > 0) {
          if (text[p] === "(") depth++;
          else if (text[p] === ")") depth--;
          p++;
        }
        if (depth === 0) {
          const label = text.slice(i + 1, closeBracket);
          const rawUrl = text.slice(closeBracket + 2, p - 1).trim();
          const url = rawUrl.split(/\s+"/)[0];
          flushText();
          const isInternal = url.startsWith("/") || url.startsWith("#");
          if (isInternal) {
            nodes.push(
              <Link key={`${keyPrefix}-${k++}`} href={url}>
                {renderInline(label, `${keyPrefix}-l${k}`)}
              </Link>
            );
          } else {
            nodes.push(
              <a
                key={`${keyPrefix}-${k++}`}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {renderInline(label, `${keyPrefix}-a${k}`)}
              </a>
            );
          }
          i = p;
          continue;
        }
      }
    }

    // Bold **...** or __...__
    if (
      (ch === "*" && text[i + 1] === "*") ||
      (ch === "_" && text[i + 1] === "_")
    ) {
      const delim = ch + ch;
      const closeIdx = findInlineClose(text, i + 2, delim);
      if (closeIdx > i + 2) {
        flushText();
        const inner = text.slice(i + 2, closeIdx);
        nodes.push(
          <strong key={`${keyPrefix}-${k++}`}>
            {renderInline(inner, `${keyPrefix}-b${k}`)}
          </strong>
        );
        i = closeIdx + 2;
        continue;
      }
    }

    // Strikethrough ~~...~~
    if (ch === "~" && text[i + 1] === "~") {
      const closeIdx = findInlineClose(text, i + 2, "~~");
      if (closeIdx > i + 2) {
        flushText();
        nodes.push(
          <del key={`${keyPrefix}-${k++}`}>
            {renderInline(text.slice(i + 2, closeIdx), `${keyPrefix}-s${k}`)}
          </del>
        );
        i = closeIdx + 2;
        continue;
      }
    }

    // Italic *...* or _..._ (never break intraword snake_case identifiers)
    if (ch === "*" || ch === "_") {
      const prevChar = i > 0 ? text[i - 1] : undefined;
      const nextChar = text[i + 1];
      const canOpen =
        nextChar &&
        !/\s/.test(nextChar) &&
        (ch === "*" || !isWordChar(prevChar));

      if (canOpen) {
        const matchedEnd = findInlineClose(text, i + 1, ch, true);
        if (matchedEnd > i + 1) {
          flushText();
          const inner = text.slice(i + 1, matchedEnd);
          nodes.push(
            <em key={`${keyPrefix}-${k++}`}>
              {renderInline(inner, `${keyPrefix}-i${k}`)}
            </em>
          );
          i = matchedEnd + 1;
          continue;
        }
      }
    }

    buf += ch;
    i++;
  }

  flushText();
  return nodes;
}

function renderListNode(
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
        nested ? "mt-2 space-y-1.5 pl-5" : "my-4 max-w-[var(--measure)] space-y-2 pl-6",
        ordered ? "list-decimal" : "list-disc marker:text-ink-faint"
      )}
    >
      {items.map((item, idx) => (
        <li key={`${key}-${idx}`} className="leading-relaxed">
          {renderInline(item.text, `${key}-${idx}`)}
          {item.children
            ? renderListNode(
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

type CalloutKind = "mental-model" | "pitfall" | "standardese";

function detectCallout(lines: string[]): {
  kind: CalloutKind | null;
  label: string;
  bodyText: string;
} {
  const nonEmptyIdx = lines.findIndex((l) => l.trim().length > 0);
  if (nonEmptyIdx < 0) return { kind: null, label: "", bodyText: "" };

  const first = lines[nonEmptyIdx].trim();
  const restLines = lines.slice(nonEmptyIdx + 1);

  const matchers: { kind: CalloutKind; label: string; re: RegExp }[] = [
    {
      kind: "mental-model",
      label: "Mental model.",
      re: /^\*\*Mental model\.?\*\*:?\s*(.*)$/i,
    },
    {
      kind: "pitfall",
      label: "Pitfall.",
      re: /^\*\*Pitfall\.?\*\*:?\s*(.*)$/i,
    },
    {
      kind: "standardese",
      label: "Standardese.",
      re: /^\*\*Standardese\.?\*\*:?\s*(.*)$/i,
    },
  ];

  for (const m of matchers) {
    const res = first.match(m.re);
    if (res) {
      const tail = [res[1]?.trim() ?? "", ...restLines].join("\n").trim();
      return { kind: m.kind, label: m.label, bodyText: tail };
    }
  }

  return { kind: null, label: "", bodyText: lines.join("\n") };
}

function renderBlockquote(lines: string[], key: string): ReactNode {
  const { kind, label, bodyText } = detectCallout(lines);
  const innerParagraphs = bodyText
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, " ").trim())
    .filter(Boolean);

  if (kind === "mental-model") {
    return (
      <aside
        key={key}
        className="my-6 max-w-[var(--measure)] rounded-2xl bg-sun-wash px-5 py-4 text-[0.98rem] leading-relaxed text-ink-body space-y-2.5"
      >
        {innerParagraphs.length > 0 ? (
          innerParagraphs.map((para, idx) => (
            <p key={idx}>
              {idx === 0 ? (
                <strong className="mr-1.5 font-semibold text-ink">
                  {label}
                </strong>
              ) : null}
              {renderInline(para, `${key}-mm-${idx}`)}
            </p>
          ))
        ) : (
          <p>
            <strong className="font-semibold text-ink">{label}</strong>
          </p>
        )}
      </aside>
    );
  }

  if (kind === "pitfall") {
    return (
      <aside
        key={key}
        className="my-6 max-w-[var(--measure)] rounded-r-2xl border-l-[5px] border-ink bg-paper-sunk/65 px-5 py-4 text-[0.98rem] leading-relaxed text-ink-body space-y-2.5"
      >
        {innerParagraphs.length > 0 ? (
          innerParagraphs.map((para, idx) => (
            <p key={idx}>
              {idx === 0 ? (
                <strong className="mr-1.5 font-semibold text-ink">
                  {label}
                </strong>
              ) : null}
              {renderInline(para, `${key}-pf-${idx}`)}
            </p>
          ))
        ) : (
          <p>
            <strong className="font-semibold text-ink">{label}</strong>
          </p>
        )}
      </aside>
    );
  }

  if (kind === "standardese") {
    return (
      <aside
        key={key}
        className="my-6 max-w-[var(--measure)] rounded-2xl border border-line bg-paper-sunk px-5 py-4 font-display italic text-[1.03rem] leading-relaxed text-ink-body space-y-2.5"
      >
        {innerParagraphs.length > 0 ? (
          innerParagraphs.map((para, idx) => (
            <p key={idx}>
              {idx === 0 ? (
                <strong className="mr-2 font-sans text-xs font-semibold uppercase tracking-wider not-italic text-ink">
                  {label}
                </strong>
              ) : null}
              {renderInline(para, `${key}-std-${idx}`)}
            </p>
          ))
        ) : (
          <p>
            <strong className="font-sans text-xs font-semibold uppercase tracking-wider not-italic text-ink">
              {label}
            </strong>
          </p>
        )}
      </aside>
    );
  }

  return (
    <blockquote
      key={key}
      className="my-6 max-w-[var(--measure)] border-l-2 border-line-strong pl-4 text-ink-soft space-y-2"
    >
      {innerParagraphs.map((para, idx) => (
        <p key={idx}>{renderInline(para, `${key}-bq-${idx}`)}</p>
      ))}
    </blockquote>
  );
}

const CPP_FENCE_LANGS = new Set(["cpp", "c++", "cc", "cxx", "c", "h", "hpp"]);

export function TopicMarkdown({ content }: { content: string }) {
  const blocks = parseBlocks(content);
  const nextSlug = createHeadingSlugger();

  return (
    <article className="prose-atlas min-w-0">
      {blocks.map((block, idx) => {
        const key = `blk-${idx}`;

        switch (block.type) {
          case "heading": {
            const plain = stripMarkdownInline(block.text);
            const id = block.level <= 3 ? nextSlug(plain) : undefined;
            const HeadingTag =
              block.level === 2 ? "h2" : block.level === 3 ? "h3" : "h4";
            return (
              <HeadingTag
                key={key}
                id={id}
                className="scroll-mt-28 max-w-[var(--measure)]"
              >
                {renderInline(block.text, key)}
              </HeadingTag>
            );
          }

          case "code": {
            if (CPP_FENCE_LANGS.has(block.lang)) {
              const fallbackCaption =
                block.lang === "c" ? "snippet.c" : "snippet.cpp";
              return (
                <CppCodeBlock
                  key={key}
                  code={block.code}
                  caption={block.caption ?? fallbackCaption}
                  lang={block.lang === "c" ? "c" : "cpp"}
                  className="my-6"
                />
              );
            }
            return (
              <pre
                key={key}
                className="my-6 max-w-[var(--measure)] overflow-x-auto rounded-[var(--radius-panel)] border border-line bg-paper-sunk px-5 py-4 font-mono text-[0.82rem] leading-[1.6] text-ink-body"
              >
                <code>{block.code}</code>
              </pre>
            );
          }

          case "blockquote":
            return renderBlockquote(block.lines, key);

          case "table":
            return (
              <div
                key={key}
                className="my-6 overflow-x-auto rounded-[var(--radius-panel)] border border-line bg-paper-raised"
              >
                <table className="w-full border-collapse text-left text-[0.92rem] leading-snug">
                  <thead>
                    <tr className="border-b border-line bg-paper-sunk/65">
                      {block.headers.map((header, hi) => (
                        <th
                          key={`${key}-h-${hi}`}
                          style={{ textAlign: block.alignments[hi] ?? "left" }}
                          className="px-4 py-2.5 font-semibold text-ink"
                        >
                          {renderInline(header, `${key}-h-${hi}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {block.rows.map((row, ri) => (
                      <tr key={`${key}-r-${ri}`}>
                        {block.headers.map((_h, ci) => (
                          <td
                            key={`${key}-r-${ri}-c-${ci}`}
                            style={{ textAlign: block.alignments[ci] ?? "left" }}
                            className="px-4 py-2.5 align-top text-ink-body"
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
            return renderListNode(block.ordered, block.items, key);

          case "hr":
            return (
              <hr
                key={key}
                className="my-8 max-w-[var(--measure)] border-0 border-t border-line"
              />
            );

          case "paragraph":
            return (
              <p key={key} className="max-w-[var(--measure)]">
                {renderInline(block.text, key)}
              </p>
            );

          default:
            return <Fragment key={key} />;
        }
      })}
    </article>
  );
}
