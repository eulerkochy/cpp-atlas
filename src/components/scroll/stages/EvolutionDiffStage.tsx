"use client";

import { useMemo } from "react";
import { ArrowDown, ArrowRight, Sparkles } from "lucide-react";
import { dedentCode, highlightCppLines } from "./CodeWalkthroughStage";
import type {
  EvolutionBeatPhase,
  EvolutionStageBeat,
  EvolutionStageData,
} from "@/lib/scroll-types";

export interface EvolutionDiffStageProps {
  stage: EvolutionStageData;
  progress: number;
  isActive: boolean;
  isPaused: boolean;
  isRotated: boolean;
  captionsEnabled: boolean;
}

const PHASE_ORDER: readonly EvolutionBeatPhase[] = [
  "problem",
  "shift",
  "modern",
  "payoff",
] as const;

const PHASE_SHORT_LABEL: Record<EvolutionBeatPhase, string> = {
  problem: "Before",
  shift: "Shift",
  modern: "Modern",
  payoff: "Payoff",
};

function CodePane({
  label,
  lines,
  variant,
  compact,
  dimmed,
  isRotated,
}: {
  label: string;
  lines: string[];
  variant: "before" | "after";
  compact: boolean;
  dimmed?: boolean;
  isRotated: boolean;
}) {
  const isBefore = variant === "before";
  const maxLines = compact ? (isRotated ? 10 : 4) : isRotated ? 14 : 11;
  const visibleLines = lines.slice(0, maxLines);
  const hiddenCount = Math.max(0, lines.length - visibleLines.length);

  const fontSizeClass = isRotated
    ? compact
      ? "text-[11px] sm:text-[12.5px] leading-[1.36]"
      : "text-[12.5px] sm:text-[14px] leading-[1.45]"
    : compact
      ? "text-[8.8px] sm:text-[10px] leading-[1.28]"
      : lines.length <= 7
        ? "text-[10.5px] sm:text-[12px] leading-[1.46]"
        : "text-[9.5px] sm:text-[10.8px] leading-[1.34]";

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border transition-all duration-500 ease-out ${
        isBefore
          ? dimmed
            ? "border-[#ff4d5a]/20 bg-[#100709]/80 opacity-55"
            : "border-[#ff4d5a]/40 bg-[#120709]/95 shadow-[inset_0_1px_0_rgba(255,77,90,0.14)]"
          : dimmed
            ? "border-[#34d399]/20 bg-[#06100c]/80 opacity-45"
            : "border-[#34d399]/45 bg-[#06110d]/95 shadow-[0_0_28px_rgba(52,211,153,0.09),inset_0_1px_0_rgba(52,211,153,0.16)]"
      }`}
    >
      {/* Pane header */}
      <div
        className={`flex shrink-0 items-center justify-between gap-2 border-b px-2.5 py-1 ${
          isBefore
            ? "border-[#ff4d5a]/15 bg-[#ff4d5a]/[0.06]"
            : "border-[#34d399]/18 bg-[#34d399]/[0.07]"
        }`}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              isBefore ? "bg-[#ff4d5a]" : "bg-[#34d399]"
            }`}
            aria-hidden="true"
          />
          <span
            className={`truncate font-mono text-[9.5px] font-medium tracking-tight sm:text-[10.5px] ${
              isBefore ? "text-[#ff8a93]" : "text-[#6ee7b7]"
            }`}
          >
            {label}
          </span>
        </span>
        <span
          className={`shrink-0 rounded px-1 py-0.2 font-mono text-[8.5px] font-semibold uppercase tracking-wider ${
            isBefore
              ? "bg-[#ff4d5a]/15 text-[#ff4d5a]"
              : "bg-[#34d399]/15 text-[#34d399]"
          }`}
        >
          {isBefore ? "Legacy" : "Modern"}
        </span>
      </div>

      {/* Syntax-highlighted code body */}
      <div
        className={`scroll-stage-code flex min-h-0 flex-1 flex-col overflow-hidden px-2 sm:px-2.5 ${
          compact ? "justify-start py-1" : "justify-center py-1.5"
        }`}
      >
        <div className={fontSizeClass}>
          {visibleLines.map((lineHtml, idx) => (
            <div key={idx} className="flex items-baseline gap-1.5">
              <span
                aria-hidden="true"
                className={`w-2.5 shrink-0 select-none font-mono text-[0.85em] ${
                  isBefore ? "text-[#ff4d5a]/65" : "text-[#34d399]/80"
                }`}
              >
                {isBefore ? "−" : "+"}
              </span>
              <code
                className="min-w-0 flex-1 overflow-hidden whitespace-pre text-ellipsis"
                dangerouslySetInnerHTML={{ __html: lineHtml }}
              />
            </div>
          ))}
          {hiddenCount > 0 ? (
            <div className="pl-4 font-mono text-[8.5px] text-white/35">
              … +{hiddenCount} more {hiddenCount === 1 ? "line" : "lines"}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function EvolutionDiffStage({
  stage,
  progress,
  isRotated,
  captionsEnabled,
}: EvolutionDiffStageProps) {
  const beforeLines = useMemo(
    () => highlightCppLines(stage.beforeCode),
    [stage.beforeCode]
  );
  const afterLines = useMemo(
    () => highlightCppLines(stage.afterCode),
    [stage.afterCode]
  );

  const maxLineLen = useMemo(() => {
    const all = [
      ...dedentCode(stage.beforeCode).split("\n"),
      ...dedentCode(stage.afterCode).split("\n"),
    ];
    return all.reduce((max, l) => Math.max(max, l.length), 0);
  }, [stage.beforeCode, stage.afterCode]);

  const beats = stage.beats;
  const beatCount = Math.max(1, beats.length);
  const clampedProgress = Number.isFinite(progress)
    ? Math.min(1, Math.max(0, progress))
    : 0;
  const beatIndex = Math.min(beatCount - 1, Math.floor(clampedProgress * beatCount));
  const activeBeat: EvolutionStageBeat | undefined = beats[beatIndex];
  const phase: EvolutionBeatPhase =
    activeBeat?.phase ?? PHASE_ORDER[Math.min(beatIndex, PHASE_ORDER.length - 1)];

  const useSideBySide = isRotated || maxLineLen <= 32;

  return (
    <div className="scroll-stage-grid relative flex h-full w-full flex-col gap-1.5 p-2.5 sm:gap-2 sm:p-3.5">
      {/* Top HUD: Era pill + Feature title + 4-phase stepper */}
      <div className="flex shrink-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 rounded border border-[#34d399]/35 bg-[#34d399]/15 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold tracking-wide text-[#34d399] sm:text-[10.5px]">
            {stage.era}
          </span>
          <span className="truncate text-[10.5px] font-medium tracking-tight text-white/95 sm:text-[11.5px]">
            {stage.feature}
          </span>
        </div>

        {/* 4-phase pills */}
        <div className="flex shrink-0 items-center gap-1" aria-label={`Phase: ${PHASE_SHORT_LABEL[phase]}`}>
          {PHASE_ORDER.map((p, idx) => {
            const isCurrent = p === phase;
            const currentIdx = PHASE_ORDER.indexOf(phase);
            const isPast = idx < currentIdx;
            const activePillColor =
              p === "problem"
                ? "border-[#ff4d5a]/45 bg-[#ff4d5a]/20 text-[#ff8a93]"
                : p === "shift"
                  ? "border-[#fbbf24]/45 bg-[#fbbf24]/20 text-[#fde68a]"
                  : "border-[#34d399]/45 bg-[#34d399]/20 text-[#6ee7b7]";

            return (
              <span
                key={p}
                className={`rounded px-1.5 py-0.5 font-mono text-[8.5px] font-medium transition-all duration-300 sm:text-[9.5px] ${
                  isCurrent
                    ? `border ${activePillColor}`
                    : isPast
                      ? "text-white/55"
                      : "text-white/25"
                }`}
              >
                <span className="hidden sm:inline">{PHASE_SHORT_LABEL[p]}</span>
                <span className="sm:hidden">{idx + 1}</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Main Animated Storytelling Body */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {phase === "problem" ? (
          <div key="phase-problem" className="stage-beat-enter flex min-h-0 flex-1 flex-col">
            <CodePane
              label={stage.beforeLabel}
              lines={beforeLines}
              variant="before"
              compact={false}
              isRotated={isRotated}
            />
          </div>
        ) : null}

        {phase === "shift" ? (
          <div
            key="phase-shift"
            className={`stage-beat-enter flex min-h-0 flex-1 gap-1.5 ${
              useSideBySide ? "flex-row items-stretch" : "flex-col"
            }`}
          >
            <CodePane
              label={stage.beforeLabel}
              lines={beforeLines}
              variant="before"
              compact={true}
              dimmed={true}
              isRotated={isRotated}
            />

            {/* Sleek luminous transformation divider */}
            <div
              className={`relative flex shrink-0 items-center justify-center ${
                useSideBySide ? "flex-col px-0.5" : "flex-row py-0.5"
              }`}
            >
              <div
                aria-hidden="true"
                className={`bg-gradient-to-r from-[#ff4d5a]/40 via-[#fbbf24]/60 to-[#34d399]/60 ${
                  useSideBySide ? "h-full w-px" : "h-px w-full"
                }`}
              />
              <div className="absolute flex items-center gap-1 overflow-hidden rounded-full border border-white/20 bg-[#080b0f] px-2 py-0.5 shadow-[0_0_18px_rgba(52,211,153,0.22)]">
                <span
                  aria-hidden="true"
                  className="stage-sheen-sweep pointer-events-none absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/25 to-transparent"
                />
                {useSideBySide ? (
                  <ArrowRight className="h-2.5 w-2.5 text-[#34d399]" />
                ) : (
                  <ArrowDown className="h-2.5 w-2.5 text-[#34d399]" />
                )}
                <span className="relative font-mono text-[9px] font-semibold tracking-wide text-white">
                  {stage.era}
                </span>
              </div>
            </div>

            <CodePane
              label={stage.afterLabel}
              lines={afterLines}
              variant="after"
              compact={true}
              isRotated={isRotated}
            />
          </div>
        ) : null}

        {phase === "modern" ? (
          <div key="phase-modern" className="stage-beat-enter flex min-h-0 flex-1 flex-col">
            <CodePane
              label={stage.afterLabel}
              lines={afterLines}
              variant="after"
              compact={false}
              isRotated={isRotated}
            />
          </div>
        ) : null}

        {phase === "payoff" ? (
          <div key="phase-payoff" className="relative flex min-h-0 flex-1 flex-col">
            {/* Softly dimmed modern code backdrop */}
            <div className="flex min-h-0 flex-1 scale-[0.985] opacity-40 transition-all duration-500">
              <CodePane
                label={stage.afterLabel}
                lines={afterLines}
                variant="after"
                compact={false}
                dimmed={true}
                isRotated={isRotated}
              />
            </div>

            {/* Illuminated Mental-Model Payoff Overlay */}
            <div
              className={`stage-beat-enter pointer-events-none absolute inset-0 flex items-center justify-center p-2.5 sm:p-4 ${
                captionsEnabled ? "pb-10" : ""
              }`}
            >
              <div className="w-full max-w-[92%] rounded-xl border border-[#34d399]/45 bg-[#060c09]/92 px-3.5 py-2.5 shadow-[0_0_44px_rgba(52,211,153,0.16),inset_0_1px_0_rgba(52,211,153,0.2)] backdrop-blur-md sm:max-w-[84%] sm:px-4 sm:py-3.5">
                <div className="mb-1 flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3 shrink-0 text-[#34d399]" />
                  <span className="font-mono text-[9px] font-semibold uppercase tracking-widest text-[#34d399] sm:text-[10px]">
                    {stage.era} Mental Model
                  </span>
                </div>
                {activeBeat?.title ? (
                  <p className="mb-1 text-[11px] font-semibold tracking-tight text-white/75 sm:text-[12px]">
                    {activeBeat.title}
                  </p>
                ) : null}
                <p className="text-[12px] font-semibold leading-snug text-white sm:text-[13.5px]">
                  {activeBeat?.highlight || activeBeat?.caption || stage.feature}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Bottom highlight bar for phases 1–3 (lifts cleanly above CC when captions enabled) */}
      {phase !== "payoff" && activeBeat?.highlight ? (
        <div
          key={`evo-hl-${beatIndex}`}
          className={`stage-beat-enter shrink-0 transition-all duration-300 ${
            captionsEnabled ? (isRotated ? "mb-9" : "mb-7") : ""
          }`}
        >
          <div
            className={`flex items-center gap-2 rounded-md border px-2.5 py-1 backdrop-blur-md ${
              phase === "problem"
                ? "border-[#ff4d5a]/30 bg-[#15080a]/85"
                : phase === "shift"
                  ? "border-[#fbbf24]/30 bg-[#130f06]/85"
                  : "border-[#34d399]/35 bg-[#07140f]/85"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                phase === "problem"
                  ? "bg-[#ff4d5a]"
                  : phase === "shift"
                    ? "bg-[#fbbf24]"
                    : "bg-[#34d399]"
              }`}
              aria-hidden="true"
            />
            <p className="line-clamp-1 text-[10px] font-medium text-white/92 sm:text-[11px]">
              {activeBeat.highlight}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
