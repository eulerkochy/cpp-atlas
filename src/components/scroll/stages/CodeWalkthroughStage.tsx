"use client";

import { useEffect, useMemo, useRef } from "react";
import { highlightCppCode } from "@/lib/cpp-highlight";
import type { CodeStageBeat, CodeStageData } from "@/lib/scroll-types";

export interface CodeWalkthroughStageProps {
  stage: CodeStageData;
  progress: number;
  isActive: boolean;
  isPaused: boolean;
  isRotated: boolean;
  captionsEnabled: boolean;
}

/**
 * Strips common leading spaces across non-empty lines so snippets pulled from
 * indented markdown blocks maximize horizontal breathing room on 390px mobile.
 */
export function dedentCode(rawCode: string): string {
  const normalized = rawCode.replace(/\r\n?/g, "\n").replace(/^\n+|\n+$/g, "");
  const lines = normalized.split("\n");
  let minIndent = Infinity;
  for (const line of lines) {
    if (!line.trim()) continue;
    const match = line.match(/^[ \t]+/);
    const indent = match ? match[0].replace(/\t/g, "  ").length : 0;
    if (indent < minIndent) minIndent = indent;
  }
  if (!Number.isFinite(minIndent) || minIndent === 0) {
    return normalized.replace(/\t/g, "  ");
  }
  return lines
    .map((line) => {
      const expanded = line.replace(/\t/g, "  ");
      return expanded.length >= minIndent ? expanded.slice(minIndent) : expanded.trimStart();
    })
    .join("\n");
}

/**
 * Highlights C++ source with C++ Atlas's single-pass tokenizer and splits it
 * safely into per-line HTML strings without breaking multi-line token spans.
 */
export function highlightCppLines(rawCode: string): string[] {
  const clean = dedentCode(rawCode);
  if (!clean) return [];
  const html = highlightCppCode(clean);
  const rawLines = html.split("\n");
  let openSpanTag: string | null = null;

  return rawLines.map((line) => {
    let out = openSpanTag ? openSpanTag + line : line;
    const opens = out.match(/<span class="[^"]+">/g);
    const closes = out.match(/<\/span>/g);
    const openCount = opens ? opens.length : 0;
    const closeCount = closes ? closes.length : 0;

    if (openCount > closeCount && opens) {
      openSpanTag = opens[opens.length - 1];
      out += "</span>";
    } else {
      openSpanTag = null;
    }

    return out || "&#8203;";
  });
}

function badgeTone(badge?: string): "coral" | "emerald" | "amber" | "neutral" {
  if (!badge) return "neutral";
  const b = badge.toLowerCase();
  if (
    b.includes("ub") ||
    b.includes("trap") ||
    b.includes("bug") ||
    b.includes("warn") ||
    b.includes("danger") ||
    b.includes("dangling") ||
    b.includes("race") ||
    b.includes("fail") ||
    b.includes("error")
  ) {
    return "coral";
  }
  if (
    b.includes("safe") ||
    b.includes("fix") ||
    b.includes("modern") ||
    b.includes("zero") ||
    b.includes("ok") ||
    b.includes("c++2") ||
    b.includes("guarantee") ||
    b.includes("elision") ||
    b.includes("verified") ||
    b.includes("compile") ||
    b.includes("result")
  ) {
    return "emerald";
  }
  if (
    b.includes("note") ||
    b.includes("ptr") ||
    b.includes("move") ||
    b.includes("rule") ||
    b.includes("memory") ||
    b.includes("lifetime") ||
    b.includes("constraint") ||
    b.includes("value") ||
    b.includes("coroutine") ||
    b.includes("hint")
  ) {
    return "amber";
  }
  return "neutral";
}

export function CodeWalkthroughStage({
  stage,
  progress,
  isRotated,
  captionsEnabled,
}: CodeWalkthroughStageProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const lines = useMemo(() => highlightCppLines(stage.code), [stage.code]);
  const beats = stage.beats;
  const beatCount = Math.max(1, beats.length);
  const clampedProgress = Number.isFinite(progress)
    ? Math.min(1, Math.max(0, progress))
    : 0;
  const beatIndex = Math.min(beatCount - 1, Math.floor(clampedProgress * beatCount));
  const beatLocalProgress = Math.min(
    1,
    Math.max(0, clampedProgress * beatCount - beatIndex)
  );
  const activeBeat: CodeStageBeat | undefined = beats[beatIndex];

  const highlightedLineSet = useMemo(() => {
    const raw = activeBeat?.highlightLines ?? [];
    if (raw.length === 0) return new Set<number>();
    const isZeroIndexed = raw.some((n) => n === 0);
    return new Set<number>(raw.map((n) => (isZeroIndexed ? n + 1 : n)));
  }, [activeBeat]);

  const hasHighlights = highlightedLineSet.size > 0;
  const tone = badgeTone(activeBeat?.badge);

  const accentBarClass =
    tone === "emerald"
      ? "bg-[#34d399] shadow-[0_0_10px_rgba(52,211,153,0.6)]"
      : tone === "amber"
        ? "bg-[#fbbf24] shadow-[0_0_10px_rgba(251,191,36,0.55)]"
        : "bg-[#ff4d5a] shadow-[0_0_10px_rgba(255,77,90,0.65)]";

  const accentLineNumClass =
    tone === "emerald"
      ? "text-[#34d399]"
      : tone === "amber"
        ? "text-[#fbbf24]"
        : "text-[#ff4d5a]";

  const badgePillClass =
    tone === "emerald"
      ? "border-[#34d399]/35 bg-[#34d399]/15 text-[#34d399]"
      : tone === "amber"
        ? "border-[#fbbf24]/35 bg-[#fbbf24]/15 text-[#fbbf24]"
        : tone === "coral"
          ? "border-[#ff4d5a]/40 bg-[#ff4d5a]/15 text-[#ff4d5a]"
          : "border-white/20 bg-white/10 text-white";

  // Smoothly pan highlighted block into center of the code frame on tall snippets
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    if (viewport.scrollHeight <= viewport.clientHeight + 2 || !hasHighlights) {
      viewport.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const sorted = Array.from(highlightedLineSet).sort((a, b) => a - b);
    const firstEl = viewport.querySelector<HTMLElement>(
      `[data-code-line="${sorted[0]}"]`
    );
    const lastEl = viewport.querySelector<HTMLElement>(
      `[data-code-line="${sorted[sorted.length - 1]}"]`
    );
    if (!firstEl || !lastEl) return;

    const spanCenter =
      (firstEl.offsetTop + (lastEl.offsetTop + lastEl.offsetHeight)) / 2;
    const targetTop = Math.max(0, spanCenter - viewport.clientHeight * 0.45);
    viewport.scrollTo({ top: targetTop, behavior: "smooth" });
  }, [beatIndex, hasHighlights, highlightedLineSet, isRotated]);

  // Adaptive font sizing so snippets look bold when short and never crowd when tall
  const lineCount = lines.length;
  const codeTextClass = isRotated
    ? lineCount <= 8
      ? "text-[13.5px] sm:text-[15px] leading-[1.52]"
      : lineCount <= 14
        ? "text-[12px] sm:text-[13.5px] leading-[1.42]"
        : "text-[11px] sm:text-[12.5px] leading-[1.35]"
    : lineCount <= 6
      ? "text-[11px] sm:text-[12.5px] leading-[1.5]"
      : lineCount <= 10
        ? "text-[10.2px] sm:text-[11.5px] leading-[1.42]"
        : lineCount <= 14
          ? "text-[9.5px] sm:text-[10.8px] leading-[1.34]"
          : "text-[9.2px] sm:text-[10.2px] leading-[1.3]";

  const beatCounterText = `${String(beatIndex + 1).padStart(2, "0")} / ${String(beatCount).padStart(2, "0")}`;

  return (
    <div className="scroll-stage-grid relative flex h-full w-full flex-col gap-1.5 p-2.5 sm:gap-2 sm:p-3.5">
      {/* Top Manim / Terminal Header */}
      <div className="flex shrink-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className="inline-flex shrink-0 items-center gap-1.5 rounded border border-white/12 bg-white/[0.05] px-1.5 py-0.5 font-mono text-[9.5px] text-white/70 sm:text-[10.5px]"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#ff4d5a]" aria-hidden="true" />
            <span className="max-w-[115px] truncate sm:max-w-[160px]">
              {stage.filename ?? "example.cpp"}
            </span>
          </span>
          {activeBeat?.title ? (
            <span
              key={`code-title-${beatIndex}`}
              className="stage-beat-enter truncate text-[10.5px] font-medium tracking-tight text-white/95 sm:text-[11.5px]"
            >
              {activeBeat.title}
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden items-center gap-1 sm:flex" aria-hidden="true">
            {beats.map((_, i) => {
              const fill =
                i < beatIndex ? 1 : i === beatIndex ? Math.max(0.15, beatLocalProgress) : 0;
              return (
                <div
                  key={i}
                  className="h-1 w-3.5 overflow-hidden rounded-full bg-white/15"
                >
                  <div
                    className="h-full origin-left rounded-full bg-white transition-transform duration-150 ease-linear"
                    style={{ transform: `scaleX(${fill})` }}
                  />
                </div>
              );
            })}
          </div>
          <span className="font-mono text-[9.5px] tabular-nums tracking-wider text-white/55 sm:text-[10.5px]">
            {beatCounterText}
          </span>
        </div>
      </div>

      {/* Crisp Dark C++ Code Frame */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-white/10 bg-[#080a0f]/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div
          ref={viewportRef}
          className="scroll-stage-code flex min-h-0 flex-1 flex-col overflow-hidden py-1.5 sm:py-2"
        >
          <div className={`my-auto w-full ${codeTextClass}`}>
            {lines.map((lineHtml, idx) => {
              const lineNo = idx + 1;
              const isLineHighlighted = highlightedLineSet.has(lineNo);
              const dimLine = hasHighlights && !isLineHighlighted;

              return (
                <div
                  key={lineNo}
                  data-code-line={lineNo}
                  className={`relative flex items-baseline pr-2.5 transition-all duration-400 ease-out sm:pr-3 ${
                    isLineHighlighted
                      ? "bg-white/[0.08] pl-2.5 opacity-100 sm:pl-3"
                      : dimLine
                        ? "pl-2 opacity-35 sm:pl-2.5"
                        : "pl-2 opacity-90 sm:pl-2.5"
                  }`}
                >
                  {/* Luminous active left accent bar */}
                  <span
                    aria-hidden="true"
                    className={`absolute inset-y-0 left-0 w-[2.5px] transition-opacity duration-300 ${accentBarClass} ${
                      isLineHighlighted ? "opacity-100" : "opacity-0"
                    }`}
                  />

                  {/* Line number gutter */}
                  <span
                    className={`mr-2.5 w-4 shrink-0 select-none text-right font-mono text-[0.84em] tabular-nums transition-colors duration-300 sm:mr-3 ${
                      isLineHighlighted ? accentLineNumClass : "text-white/25"
                    }`}
                  >
                    {lineNo}
                  </span>

                  {/* Syntax-highlighted C++ code line */}
                  <code
                    className="min-w-0 flex-1 overflow-hidden whitespace-pre text-ellipsis"
                    dangerouslySetInnerHTML={{ __html: lineHtml }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Animated Beat Annotation Chip (leaves clean room for CC overlay when enabled) */}
      {activeBeat?.annotation ? (
        <div
          key={`annot-${beatIndex}`}
          className={`stage-beat-enter shrink-0 transition-all duration-300 ${
            captionsEnabled ? (isRotated ? "mb-9" : "mb-7") : ""
          }`}
        >
          <div className="flex items-start gap-2 rounded-md border border-white/12 bg-black/80 px-2.5 py-1.5 backdrop-blur-md">
            {activeBeat.badge ? (
              <span
                className={`mt-0.5 shrink-0 rounded border px-1.5 py-0.5 font-mono text-[8.5px] font-semibold uppercase tracking-wider sm:text-[9.5px] ${badgePillClass}`}
              >
                {activeBeat.badge}
              </span>
            ) : (
              <span
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#ff4d5a]"
                aria-hidden="true"
              />
            )}
            <p className="line-clamp-2 text-[10.5px] leading-snug text-white/90 sm:text-[11.5px]">
              {activeBeat.annotation}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
