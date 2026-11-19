"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
} from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  StepBack,
  StepForward,
  X,
} from "lucide-react";
import { highlightCppCode } from "@/lib/cpp-highlight";
import { cn } from "@/lib/utils";
import {
  AddressChip,
  addressesMatch,
  ClauseAnchor,
  memStateStyles,
  normalizeAddress,
  StatusPill,
  toneStyles,
} from "./PanePrimitives";
import type {
  RadDebuggerShellProps,
  RadScenario,
  RadWatchNode,
} from "./types";

function pickInitialScenarioId(
  scenarios: RadScenario[],
  initialScenarioId?: string,
  topicSlug?: string
): string {
  if (
    initialScenarioId &&
    scenarios.some((s) => s.id === initialScenarioId)
  ) {
    return initialScenarioId;
  }
  if (topicSlug) {
    const matched = scenarios.find((s) => s.topicSlugs?.includes(topicSlug));
    if (matched) return matched.id;
  }
  return scenarios[0]?.id ?? "";
}

function renderInlineAddressTokens(
  text: string,
  focusedAddress: string | null,
  onFocusAddress: (addr: string | null) => void
) {
  const parts = text.split(/(0x[0-9a-fA-F]{4,})/g);
  return parts.map((part, i) => {
    if (/^0x[0-9a-fA-F]{4,}$/.test(part)) {
      return (
        <AddressChip
          key={`${part}-${i}`}
          address={part}
          focusedAddress={focusedAddress}
          onFocusAddress={onFocusAddress}
          className="mx-0.5 align-middle"
        />
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

function filterWatchTree(
  nodes: RadWatchNode[],
  query: string
): RadWatchNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;
  const out: RadWatchNode[] = [];
  for (const node of nodes) {
    const filteredChildren = node.children
      ? filterWatchTree(node.children, q)
      : undefined;
    const selfMatch =
      node.expr.toLowerCase().includes(q) ||
      node.value.toLowerCase().includes(q) ||
      node.type.toLowerCase().includes(q) ||
      (node.address?.toLowerCase().includes(q) ?? false) ||
      (node.note?.toLowerCase().includes(q) ?? false);
    if (selfMatch || (filteredChildren && filteredChildren.length > 0)) {
      out.push({
        ...node,
        children:
          filteredChildren && filteredChildren.length > 0
            ? filteredChildren
            : node.children,
      });
    }
  }
  return out;
}

function collectExpandableIds(nodes: RadWatchNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.children && node.children.length > 0) {
      ids.push(node.id);
      ids.push(...collectExpandableIds(node.children));
    }
  }
  return ids;
}

function collectDefaultExpandedIds(nodes: RadWatchNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.children && node.children.length > 0) {
      if (node.defaultExpanded !== false) {
        ids.push(node.id);
      }
      ids.push(...collectDefaultExpandedIds(node.children));
    }
  }
  return ids;
}

function WatchTreeRow({
  node,
  depth,
  expandedMap,
  onToggleExpand,
  focusedAddress,
  onFocusAddress,
  forceExpand,
}: {
  node: RadWatchNode;
  depth: number;
  expandedMap: Record<string, boolean>;
  onToggleExpand: (id: string, currentExpanded: boolean) => void;
  focusedAddress: string | null;
  onFocusAddress: (addr: string | null) => void;
  forceExpand: boolean;
}) {
  const hasChildren = Boolean(node.children && node.children.length > 0);
  const isExpanded =
    forceExpand ||
    (expandedMap[node.id] !== undefined
      ? expandedMap[node.id]
      : node.defaultExpanded !== false);
  const isAddrFocused = addressesMatch(node.address, focusedAddress);
  const tone = toneStyles(node.tone ?? "neutral");

  return (
    <>
      <div
        className={cn(
          "group border-b border-line/70 px-2.5 py-1.5 font-mono text-[11.5px] leading-snug transition-colors",
          node.changed && "border-l-2 border-l-sun-deep bg-sun-wash/55",
          !node.changed &&
            node.tone === "danger" &&
            "border-l-2 border-l-wrong bg-wrong-wash/40",
          !node.changed &&
            node.tone === "safe" &&
            "border-l-2 border-l-[color:var(--right)] bg-right-wash/30",
          isAddrFocused && "ring-1 ring-inset ring-ink bg-sun-wash/75"
        )}
        style={{ paddingLeft: `${depth * 14 + 10}px` }}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <div className="flex min-w-0 items-center gap-1">
            {hasChildren ? (
              <button
                type="button"
                onClick={() => onToggleExpand(node.id, isExpanded)}
                aria-label={isExpanded ? `Collapse ${node.expr}` : `Expand ${node.expr}`}
                className="inline-flex size-4 shrink-0 items-center justify-center rounded-[3px] text-ink-soft hover:bg-ink/10 hover:text-ink cursor-pointer"
              >
                {isExpanded ? (
                  <ChevronDown className="size-3" aria-hidden />
                ) : (
                  <ChevronRight className="size-3" aria-hidden />
                )}
              </button>
            ) : (
              <span className="inline-block w-4 shrink-0 text-center text-ink-faint">
                {depth > 0 ? "├" : "·"}
              </span>
            )}
            <span className="font-semibold text-ink">{node.expr}</span>
            {node.offset ? (
              <span className="text-[10.5px] text-ink-faint">{node.offset}</span>
            ) : null}
          </div>

          <div className="ml-auto flex shrink-0 flex-wrap items-center gap-1.5">
            {node.badge ? (
              <StatusPill tone={node.tone ?? "neutral"} className="text-[10px]">
                {node.badge}
              </StatusPill>
            ) : null}
            <span className="text-[10.5px] text-ink-soft">{node.type}</span>
            {node.address ? (
              <AddressChip
                address={node.address}
                focusedAddress={focusedAddress}
                onFocusAddress={onFocusAddress}
              />
            ) : null}
          </div>
        </div>
        <div
          className={cn(
            "mt-0.5 pl-5 font-mono text-[11.5px] leading-snug break-words",
            node.tone && node.tone !== "neutral" ? tone.text : "text-ink-body"
          )}
        >
          <span className="text-ink-faint select-none">= </span>
          <span>{node.value}</span>
        </div>
        {node.note ? (
          <p className="mt-0.5 pl-5 font-sans text-[11px] leading-snug text-ink-soft">
            {node.note}
          </p>
        ) : null}
      </div>

      {hasChildren && isExpanded
        ? node.children!.map((child) => (
            <WatchTreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedMap={expandedMap}
              onToggleExpand={onToggleExpand}
              focusedAddress={focusedAddress}
              onFocusAddress={onFocusAddress}
              forceExpand={forceExpand}
            />
          ))
        : null}
    </>
  );
}

export function RadDebuggerShell({
  ariaLabel,
  title,
  scenarios,
  topicSlug,
  initialScenarioId,
  visualizerTitle,
  renderVisualizer,
  toolbarExtra,
  scenarioId: controlledScenarioId,
  onScenarioChange,
  stepIndex: controlledStepIndex,
  onStepChange,
  compact = false,
}: RadDebuggerShellProps) {
  const [uncontrolledScenarioId, setUncontrolledScenarioId] = useState<string>(
    () => pickInitialScenarioId(scenarios, initialScenarioId, topicSlug)
  );
  const [uncontrolledStepIndex, setUncontrolledStepIndex] = useState<number>(0);

  const activeScenarioId = controlledScenarioId ?? uncontrolledScenarioId;
  const scenario = useMemo(
    () =>
      scenarios.find((s) => s.id === activeScenarioId) ??
      scenarios[0],
    [scenarios, activeScenarioId]
  );

  const rawStepIndex = controlledStepIndex ?? uncontrolledStepIndex;
  const safeStepIndex = Math.max(
    0,
    Math.min(rawStepIndex, Math.max(0, scenario.steps.length - 1))
  );
  const step = scenario.steps[safeStepIndex] ?? scenario.steps[0];

  const [breakpointsByScenario, setBreakpointsByScenario] = useState<
    Record<string, number[]>
  >({});
  const activeBreakpoints = useMemo(
    () =>
      breakpointsByScenario[scenario.id] ?? scenario.defaultBreakpoints ?? [],
    [breakpointsByScenario, scenario]
  );

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [hitBreakpointLine, setHitBreakpointLine] = useState<number | null>(
    null
  );
  const [focusedAddress, setFocusedAddress] = useState<string | null>(null);
  const [watchFilter, setWatchFilter] = useState<string>("");
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  const [watchPaneTab, setWatchPaneTab] = useState<"watch" | "registers">(
    "watch"
  );
  const [memoryPaneTab, setMemoryPaneTab] = useState<"layout" | "hex">(
    "layout"
  );
  const [visualPaneTab, setVisualPaneTab] = useState<
    "visual" | "stack" | "disasm"
  >("visual");
  const [compactTab, setCompactTab] = useState<
    "visual" | "watch" | "memory" | "hex" | "stack" | "disasm" | "registers"
  >("visual");
  const [copiedSource, setCopiedSource] = useState<boolean>(false);

  const setStep = useCallback(
    (nextIndex: number) => {
      const clamped = Math.max(
        0,
        Math.min(nextIndex, Math.max(0, scenario.steps.length - 1))
      );
      if (onStepChange) {
        onStepChange(clamped);
      } else {
        setUncontrolledStepIndex(clamped);
      }
    },
    [onStepChange, scenario.steps.length]
  );

  const handleSelectScenario = useCallback(
    (nextId: string) => {
      setIsPlaying(false);
      setHitBreakpointLine(null);
      setFocusedAddress(null);
      setWatchFilter("");
      if (onScenarioChange) {
        onScenarioChange(nextId);
      } else {
        setUncontrolledScenarioId(nextId);
      }
      if (onStepChange) {
        onStepChange(0);
      } else {
        setUncontrolledStepIndex(0);
      }
    },
    [onScenarioChange, onStepChange]
  );

  const toggleBreakpoint = useCallback(
    (lineNum: number) => {
      setBreakpointsByScenario((prev) => {
        const current =
          prev[scenario.id] ?? scenario.defaultBreakpoints ?? [];
        const exists = current.includes(lineNum);
        const next = exists
          ? current.filter((l) => l !== lineNum)
          : [...current, lineNum].sort((a, b) => a - b);
        return { ...prev, [scenario.id]: next };
      });
    },
    [scenario.id, scenario.defaultBreakpoints]
  );

  const clearBreakpoints = useCallback(() => {
    setBreakpointsByScenario((prev) => ({ ...prev, [scenario.id]: [] }));
    setHitBreakpointLine(null);
  }, [scenario.id]);

  const handleReset = useCallback(() => {
    setIsPlaying(false);
    setHitBreakpointLine(null);
    setStep(0);
  }, [setStep]);

  const handleStepBack = useCallback(() => {
    setIsPlaying(false);
    setHitBreakpointLine(null);
    setStep(Math.max(0, safeStepIndex - 1));
  }, [safeStepIndex, setStep]);

  const handleStepOver = useCallback(() => {
    setIsPlaying(false);
    setHitBreakpointLine(null);
    setStep(Math.min(scenario.steps.length - 1, safeStepIndex + 1));
  }, [safeStepIndex, scenario.steps.length, setStep]);

  const handleTogglePlay = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    setHitBreakpointLine(null);
    if (safeStepIndex >= scenario.steps.length - 1) {
      setStep(0);
    }
    setIsPlaying(true);
  }, [isPlaying, safeStepIndex, scenario.steps.length, setStep]);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setTimeout(() => {
      if (safeStepIndex >= scenario.steps.length - 1) {
        setIsPlaying(false);
        return;
      }
      const nextIdx = safeStepIndex + 1;
      const nextStep = scenario.steps[nextIdx];
      setStep(nextIdx);
      if (nextStep && activeBreakpoints.includes(nextStep.line)) {
        setIsPlaying(false);
        setHitBreakpointLine(nextStep.line);
      } else if (nextIdx >= scenario.steps.length - 1) {
        setIsPlaying(false);
      }
    }, 1150);
    return () => window.clearTimeout(timer);
  }, [isPlaying, safeStepIndex, scenario.steps, activeBreakpoints, setStep]);

  const handleCopySource = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(scenario.source.join("\n"));
      setCopiedSource(true);
      window.setTimeout(() => setCopiedSource(false), 1600);
    } catch {
      setCopiedSource(false);
    }
  }, [scenario.source]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "ArrowRight" || e.key === "F10") {
        e.preventDefault();
        handleStepOver();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handleStepBack();
      } else if (e.key === " ") {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        toggleBreakpoint(step.line);
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        handleReset();
      }
    },
    [
      handleStepOver,
      handleStepBack,
      handleTogglePlay,
      toggleBreakpoint,
      step.line,
      handleReset,
    ]
  );

  const highlightedLines = useMemo(
    () => scenario.source.map((line) => highlightCppCode(line || " ")),
    [scenario.source]
  );

  const filteredWatches = useMemo(
    () => filterWatchTree(step.watches, watchFilter),
    [step.watches, watchFilter]
  );

  const allExpandableIds = useMemo(
    () => collectExpandableIds(step.watches),
    [step.watches]
  );

  const anyExpanded = useMemo(() => {
    if (allExpandableIds.length === 0) return false;
    const defaults = new Set(collectDefaultExpandedIds(step.watches));
    return allExpandableIds.some((id) =>
      expandedMap[id] !== undefined ? expandedMap[id] : defaults.has(id)
    );
  }, [allExpandableIds, expandedMap, step.watches]);

  const handleToggleAllWatches = useCallback(() => {
    const nextState = !anyExpanded;
    const nextMap: Record<string, boolean> = {};
    for (const id of allExpandableIds) {
      nextMap[id] = nextState;
    }
    setExpandedMap(nextMap);
  }, [allExpandableIds, anyExpanded]);

  const handleToggleOneWatch = useCallback(
    (id: string, currentExpanded: boolean) => {
      setExpandedMap((prev) => ({
        ...prev,
        [id]: !currentExpanded,
      }));
    },
    []
  );

  const hasRegisters = Boolean(step.registers && step.registers.length > 0);
  const hasDisasm = Boolean(step.disasm && step.disasm.length > 0);
  const effectiveWatchTab =
    watchPaneTab === "registers" && !hasRegisters ? "watch" : watchPaneTab;
  const effectiveVisualTab =
    visualPaneTab === "disasm" && !hasDisasm ? "visual" : visualPaneTab;
  const effectiveCompactTab =
    (compactTab === "disasm" && !hasDisasm) ||
    (compactTab === "registers" && !hasRegisters)
      ? "visual"
      : compactTab;

  const verdictStyle = toneStyles(step.verdict.tone);

  const sourceHeaderAndBody = (maxHeightClass: string) => (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-line bg-paper-sunk px-2.5 py-1">
        <div className="flex items-center gap-1">
          <span className="border-b-2 border-sun-deep px-1.5 py-1 font-mono text-[11.5px] font-semibold text-ink">
            {scenario.filename}
          </span>
          <span className="px-1.5 py-1 font-mono text-[11px] text-ink-faint">
            line {step.line}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {activeBreakpoints.length > 0 ? (
            <button
              type="button"
              onClick={clearBreakpoints}
              title="Clear all breakpoints in this file"
              className="inline-flex items-center gap-1 rounded-[4px] border border-wrong/30 bg-wrong-wash/60 px-1.5 py-0.5 font-mono text-[10.5px] text-wrong hover:bg-wrong-wash cursor-pointer"
            >
              <span className="size-1.5 rounded-full bg-wrong" aria-hidden />
              <span>BP: {activeBreakpoints.length}</span>
              <X className="size-2.5" aria-hidden />
            </button>
          ) : (
            <span className="font-mono text-[10.5px] text-ink-faint">
              Click gutter for BP
            </span>
          )}
          <button
            type="button"
            onClick={handleCopySource}
            className="inline-flex items-center gap-1 rounded-[4px] border border-line bg-paper-raised px-1.5 py-0.5 font-mono text-[10.5px] text-ink-soft hover:border-line-strong hover:text-ink cursor-pointer"
            aria-label="Copy source code"
          >
            {copiedSource ? (
              <>
                <Check className="size-2.5 text-[color:var(--right)]" aria-hidden />
                <span className="text-[color:var(--right)]">Copied</span>
              </>
            ) : (
              <>
                <Copy className="size-2.5" aria-hidden />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div
        className={cn(
          "rad-pane-scroll overflow-auto bg-paper-raised font-mono text-[12px] leading-[1.65]",
          maxHeightClass
        )}
      >
        <table className="w-full border-collapse">
          <tbody>
            {scenario.source.map((rawLine, idx) => {
              const lineNum = idx + 1;
              const isIp = step.line === lineNum;
              const isSecondaryIp = step.secondaryLine?.line === lineNum;
              const hasBp = activeBreakpoints.includes(lineNum);
              const hint = step.inlineHints?.[lineNum];
              const hintTone = toneStyles(hint?.tone ?? "info");

              return (
                <tr
                  key={lineNum}
                  className={cn(
                    "group transition-colors",
                    isIp && "bg-sun-wash/75",
                    !isIp && isSecondaryIp && "bg-sky-wash/65",
                    !isIp && !isSecondaryIp && "hover:bg-paper-sunk/55"
                  )}
                >
                  <td className="w-6 select-none border-r border-line/60 bg-paper-sunk/60 p-0 text-center align-middle">
                    <button
                      type="button"
                      onClick={() => toggleBreakpoint(lineNum)}
                      aria-label={`Toggle breakpoint on line ${lineNum}`}
                      title={`Toggle breakpoint on line ${lineNum}`}
                      className="flex h-full w-full items-center justify-center py-0.5 cursor-pointer"
                    >
                      <span
                        className={cn(
                          "size-2 rounded-full transition-opacity",
                          hasBp
                            ? "bg-wrong opacity-100"
                            : "bg-wrong/35 opacity-0 group-hover:opacity-100"
                        )}
                      />
                    </button>
                  </td>

                  <td
                    className={cn(
                      "w-11 select-none border-r border-line/60 bg-paper-sunk/40 px-1.5 text-right align-top tabular-nums",
                      isIp ? "font-bold text-ink" : "text-ink-faint"
                    )}
                  >
                    <span className="inline-flex items-center justify-end gap-1">
                      {isIp ? (
                        <span className="text-ink" aria-label="Instruction pointer">
                          ▸
                        </span>
                      ) : isSecondaryIp ? (
                        <span className="rounded-[3px] bg-sky-wash px-1 text-[9.5px] font-semibold text-[color:var(--code-blue)]">
                          {step.secondaryLine?.thread}
                        </span>
                      ) : null}
                      <span>{lineNum}</span>
                    </span>
                  </td>

                  <td className="px-2.5 py-0 align-top whitespace-pre">
                    <div className="flex items-baseline justify-between gap-3">
                      <code
                        className="text-[var(--code-ink)]"
                        dangerouslySetInnerHTML={{
                          __html: highlightedLines[idx] ?? " ",
                        }}
                      />
                      {hint ? (
                        <span
                          className={cn(
                            "ml-auto shrink-0 rounded-[4px] border px-1.5 py-0 text-[10.5px] whitespace-nowrap",
                            hintTone.pill
                          )}
                        >
                          {renderInlineAddressTokens(
                            hint.text,
                            focusedAddress,
                            setFocusedAddress
                          )}
                        </span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );

  const watchBody = (scrollHeightClass: string) => (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-paper px-2.5 py-1.5">
        <input
          type="search"
          value={watchFilter}
          onChange={(e) => setWatchFilter(e.target.value)}
          placeholder="Filter watch expressions…"
          aria-label="Filter watch expressions"
          className="min-w-[140px] flex-1 rounded-[4px] border border-line bg-paper-raised px-2 py-0.5 font-mono text-[11px] text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
        />
        {scenario.quickWatches?.map((qw) => {
          const isHexWatch = /^0x[0-9a-fA-F]{4,}$/.test(qw.expr);
          const isActive =
            watchFilter === qw.expr ||
            (isHexWatch && addressesMatch(qw.expr, focusedAddress));
          return (
            <button
              key={qw.expr}
              type="button"
              title={qw.note}
              onClick={() => {
                if (isHexWatch) {
                  const norm = normalizeAddress(qw.expr);
                  const clearing = addressesMatch(norm, focusedAddress);
                  setFocusedAddress(clearing ? null : norm);
                  setWatchFilter(clearing ? "" : qw.expr);
                } else {
                  setWatchFilter((cur) => (cur === qw.expr ? "" : qw.expr));
                }
              }}
              className={cn(
                "rounded-[4px] border px-1.5 py-0.5 font-mono text-[10.5px] transition-colors cursor-pointer",
                isActive
                  ? "border-ink bg-sun text-ink font-semibold"
                  : "border-line bg-paper-sunk text-ink-soft hover:border-line-strong hover:text-ink"
              )}
            >
              {qw.expr}
            </button>
          );
        })}
        {allExpandableIds.length > 0 ? (
          <button
            type="button"
            onClick={handleToggleAllWatches}
            className="ml-auto font-mono text-[10.5px] text-ink-soft hover:text-ink cursor-pointer"
          >
            {anyExpanded ? "Collapse all" : "Expand all"}
          </button>
        ) : null}
      </div>

      <div
        className={cn(
          "rad-pane-scroll flex-1 overflow-y-auto bg-paper-raised",
          scrollHeightClass
        )}
      >
        {filteredWatches.length > 0 ? (
          filteredWatches.map((node) => (
            <WatchTreeRow
              key={node.id}
              node={node}
              depth={0}
              expandedMap={expandedMap}
              onToggleExpand={handleToggleOneWatch}
              focusedAddress={focusedAddress}
              onFocusAddress={setFocusedAddress}
              forceExpand={watchFilter.trim().length > 0}
            />
          ))
        ) : (
          <div className="px-3 py-6 text-center font-mono text-xs text-ink-faint">
            No watch symbols match &ldquo;{watchFilter}&rdquo;.
          </div>
        )}
      </div>
    </div>
  );

  const registersBody = (
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
      {step.registers?.map((reg) => {
        const rTone = toneStyles(reg.tone ?? "neutral");
        return (
          <div
            key={reg.name}
            className={cn(
              "border border-line px-2.5 py-1.5 font-mono text-[11.5px]",
              reg.changed
                ? "border-l-2 border-l-sun-deep bg-sun-wash/55"
                : "bg-paper"
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold text-ink-soft">{reg.name}</span>
              <span
                className={cn(
                  "truncate font-semibold",
                  reg.tone && reg.tone !== "neutral" ? rTone.text : "text-ink"
                )}
              >
                {reg.value}
              </span>
            </div>
            {reg.note ? (
              <p className="mt-0.5 font-sans text-[11px] leading-snug text-ink-faint">
                {reg.note}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );

  const memoryLayoutBody = (
    <div className="divide-y divide-line">
      {step.memory.map((region) => {
        const regionFocused = addressesMatch(region.baseAddress, focusedAddress);
        const regionTone: "safe" | "danger" | "info" | "neutral" =
          region.status === "freed" || region.status === "dangling"
            ? "danger"
            : region.status === "alive"
              ? "safe"
              : region.status === "static" || region.status === "buffer"
                ? "info"
                : "neutral";

        return (
          <div
            key={region.id}
            className={cn("p-2.5", regionFocused && "bg-sun-wash/35")}
          >
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-[3px] border border-line-strong bg-paper-sunk px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ink">
                  {region.segment}
                </span>
                <span className="font-mono text-[11.5px] font-semibold text-ink">
                  {region.name}
                </span>
                <AddressChip
                  address={region.baseAddress}
                  focusedAddress={focusedAddress}
                  onFocusAddress={setFocusedAddress}
                />
              </div>
              {region.statusLabel ? (
                <StatusPill tone={regionTone} className="text-[10px]">
                  {region.statusLabel}
                </StatusPill>
              ) : null}
            </div>

            <div className="divide-y divide-line/60 border border-line bg-paper">
              {region.cells.map((cell) => {
                const cellStyle = memStateStyles(cell.state);
                const isCellFocused = addressesMatch(
                  cell.address,
                  focusedAddress
                );
                return (
                  <div
                    key={`${region.id}-${cell.offset}-${cell.label}`}
                    className={cn(
                      "px-2 py-1 font-mono text-[11px] leading-snug",
                      cellStyle.row,
                      cell.changed && "bg-sun-wash/60",
                      isCellFocused &&
                        "ring-1 ring-inset ring-ink bg-sun-wash/80"
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="w-10 shrink-0 text-ink-faint tabular-nums">
                        {cell.offset}
                      </span>
                      <span className="w-7 shrink-0 text-ink-soft tabular-nums">
                        {cell.size}B
                      </span>
                      <span className="min-w-[95px] font-semibold text-ink">
                        {cell.label}
                      </span>
                      <span className="min-w-[11rem] flex-[1_1_11rem] break-words text-ink-body">
                        {cell.value}
                      </span>
                      <div className="ml-auto flex shrink-0 flex-wrap items-center gap-1.5">
                        {cell.pointsTo ? (
                          <AddressChip
                            prefix="→"
                            address={cell.pointsTo}
                            focusedAddress={focusedAddress}
                            onFocusAddress={setFocusedAddress}
                          />
                        ) : null}
                        <span
                          className={cn(
                            "rounded-[3px] border px-1 py-0 text-[9.5px] font-semibold",
                            cellStyle.badge
                          )}
                        >
                          {cellStyle.label}
                        </span>
                      </div>
                    </div>
                    {cell.note ? (
                      <p className="mt-0.5 pl-[4.75rem] font-sans text-[10.5px] text-ink-soft">
                        {cell.note}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );

  const hexAsciiBody = (
    <div className="p-2.5 font-mono text-[11px]">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-line bg-paper-sunk text-left text-[10.5px] text-ink-soft">
            <th className="px-2 py-1 font-medium">Address</th>
            <th className="px-2 py-1 font-medium">Bytes (Hex)</th>
            <th className="px-2 py-1 font-medium">ASCII</th>
            <th className="px-2 py-1 font-medium">Field</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line/60">
          {step.memory.flatMap((region) =>
            region.cells.map((cell) => {
              const cellStyle = memStateStyles(cell.state);
              const isCellFocused =
                addressesMatch(cell.address, focusedAddress) ||
                addressesMatch(region.baseAddress, focusedAddress);
              return (
                <tr
                  key={`hex-${region.id}-${cell.offset}-${cell.label}`}
                  onClick={() =>
                    setFocusedAddress(
                      addressesMatch(cell.address, focusedAddress)
                        ? null
                        : normalizeAddress(cell.address)
                    )
                  }
                  className={cn(
                    "cursor-pointer hover:bg-paper-sunk/60",
                    cell.changed && "bg-sun-wash/50",
                    isCellFocused && "bg-sun-wash/80 font-semibold"
                  )}
                >
                  <td className="px-2 py-1 whitespace-nowrap text-[color:var(--code-blue)] tabular-nums">
                    {cell.address}
                  </td>
                  <td
                    className={cn(
                      "px-2 py-1 whitespace-nowrap tabular-nums",
                      cellStyle.hex
                    )}
                  >
                    {cell.hex}
                  </td>
                  <td className="px-2 py-1 whitespace-nowrap text-ink-soft">
                    {cell.ascii ?? "........"}
                  </td>
                  <td className="px-2 py-1 text-ink">
                    <span className="text-ink-faint">[{region.segment}] </span>
                    {cell.label}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );

  const callStackBody = (
    <div className="divide-y divide-line border border-line bg-paper">
      {step.callStack.map((frame, idx) => (
        <div
          key={frame.id}
          className={cn(
            "px-2.5 py-2 font-mono text-[11.5px]",
            frame.isCurrent && "border-l-2 border-l-sun-deep bg-sun-wash/55",
            frame.isSuspended &&
              "border-l-2 border-l-[color:var(--code-blue)] bg-sky-wash/40"
          )}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex flex-wrap items-baseline gap-1.5">
              <span className="text-ink-faint">#{idx}</span>
              {frame.thread ? (
                <StatusPill tone="info" className="text-[10px]">
                  {frame.thread}
                </StatusPill>
              ) : null}
              <span className="font-semibold text-ink">{frame.fn}</span>
              {frame.args ? (
                <span className="text-ink-soft">({frame.args})</span>
              ) : null}
            </div>

            <div className="flex items-center gap-1.5">
              {frame.isCurrent ? (
                <StatusPill tone="active" className="text-[10px]">
                  ACTIVE
                </StatusPill>
              ) : null}
              {frame.isSuspended ? (
                <StatusPill tone="info" className="text-[10px]">
                  SUSPENDED
                </StatusPill>
              ) : null}
              <AddressChip
                address={frame.addr}
                focusedAddress={focusedAddress}
                onFocusAddress={setFocusedAddress}
              />
            </div>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10.5px] text-ink-soft">
            <span>
              {frame.file}:{frame.line}
            </span>
            {frame.note ? (
              <span className="font-sans text-ink-soft">— {frame.note}</span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );

  const disasmBody = hasDisasm ? (
    <div className="divide-y divide-line border border-line bg-paper font-mono text-[11px]">
      {step.disasm!.map((asm) => (
        <div
          key={`${asm.addr}-${asm.op}-${asm.operands}`}
          className={cn(
            "flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-2.5 py-1.5",
            asm.active && "border-l-2 border-l-sun-deep bg-sun-wash/60 font-medium"
          )}
        >
          <span className="w-20 shrink-0 text-ink-faint tabular-nums">
            {asm.addr}
          </span>
          <span className="w-20 shrink-0 font-semibold text-ink">{asm.op}</span>
          <span className="min-w-[130px] text-[color:var(--code-blue)]">
            {asm.operands}
          </span>
          {asm.isZeroCost ? (
            <StatusPill tone="safe" className="text-[9.5px]">
              0 instr
            </StatusPill>
          ) : null}
          {asm.comment ? (
            <span className="ml-auto font-sans text-[11px] text-ink-soft">
              ; {asm.comment}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  ) : null;

  const visualizerCtx = {
    scenario,
    step,
    stepIndex: safeStepIndex,
    focusedAddress,
    onFocusAddress: setFocusedAddress,
    onJumpStep: (idx: number) => {
      setIsPlaying(false);
      setHitBreakpointLine(null);
      setStep(idx);
    },
  };

  return (
    <section
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="@container relative overflow-hidden rounded-[var(--radius-window)] border border-line-strong bg-paper-raised shadow-window outline-none focus-visible:ring-2 focus-visible:ring-ink"
    >
      {/* Top Debugger Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-paper-sunk px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="flex shrink-0 gap-1" aria-hidden>
            <span className="size-2 rounded-full bg-ink/20" />
            <span className="size-2 rounded-full bg-ink/20" />
            <span className="size-2 rounded-full bg-ink/20" />
          </span>
          <span className="truncate font-mono text-xs font-semibold text-ink">
            {title}
          </span>
          <span className="text-ink-faint" aria-hidden>
            ·
          </span>
          <span className="truncate font-mono text-xs text-ink-soft">
            {scenario.filename}
          </span>
          <span className="rounded-[4px] border border-line-strong bg-paper px-1.5 py-0.5 font-mono text-[10.5px] text-ink-soft">
            {scenario.standard} · {scenario.target}
          </span>
        </div>

        {/* Transport Controls */}
        <div
          className="flex flex-wrap items-center gap-1"
          role="toolbar"
          aria-label="Debugger execution controls"
        >
          <button
            type="button"
            onClick={handleReset}
            disabled={safeStepIndex === 0 && !isPlaying}
            title="Reset to start (R)"
            aria-label="Reset execution"
            className="inline-flex h-7 items-center gap-1 rounded-[6px] border border-line-strong bg-paper-raised px-2 font-mono text-[11px] text-ink transition-colors hover:bg-paper disabled:opacity-40 cursor-pointer disabled:cursor-default"
          >
            <SkipBack className="size-3" aria-hidden />
            <span className="hidden sm:inline">Reset</span>
          </button>
          <button
            type="button"
            onClick={handleStepBack}
            disabled={safeStepIndex === 0}
            title="Step Back (←)"
            aria-label="Step back"
            className="inline-flex h-7 items-center gap-1 rounded-[6px] border border-line-strong bg-paper-raised px-2 font-mono text-[11px] text-ink transition-colors hover:bg-paper disabled:opacity-40 cursor-pointer disabled:cursor-default"
          >
            <StepBack className="size-3" aria-hidden />
            <span className="hidden sm:inline">Back</span>
          </button>
          <button
            type="button"
            onClick={handleStepOver}
            disabled={safeStepIndex >= scenario.steps.length - 1}
            title="Step Over (→ / F10)"
            aria-label="Step over"
            className="inline-flex h-7 items-center gap-1 rounded-[6px] border border-line-strong bg-paper-raised px-2 font-mono text-[11px] font-medium text-ink transition-colors hover:bg-paper disabled:opacity-40 cursor-pointer disabled:cursor-default"
          >
            <StepForward className="size-3" aria-hidden />
            <span>Step</span>
          </button>
          <button
            type="button"
            onClick={handleTogglePlay}
            title={
              isPlaying
                ? "Pause execution (Space)"
                : "Continue / Run to next breakpoint (Space)"
            }
            aria-label={isPlaying ? "Pause execution" : "Continue execution"}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-[6px] border px-2.5 font-mono text-[11px] font-semibold transition-colors cursor-pointer",
              isPlaying
                ? "border-sun-deep bg-sun text-ink"
                : "border-ink bg-ink text-paper hover:bg-ink/85"
            )}
          >
            {isPlaying ? (
              <>
                <Pause className="size-3" aria-hidden />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="size-3" aria-hidden />
                <span>Run</span>
              </>
            )}
          </button>
          <span className="ml-1 rounded-[4px] border border-line bg-paper px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-ink-soft">
            {String(safeStepIndex + 1).padStart(2, "0")}/
            {String(scenario.steps.length).padStart(2, "0")}
          </span>
        </div>
      </div>

      {/* Scenario Selector Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-paper px-3 py-1.5">
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="tablist"
          aria-label="Debugger scenarios"
        >
          <span className="mr-1 font-mono text-[11px] text-ink-faint">
            Target:
          </span>
          {scenarios.map((s) => {
            const selected = s.id === scenario.id;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => handleSelectScenario(s.id)}
                className={cn(
                  "rounded-[6px] border px-2.5 py-1 font-sans text-xs font-medium transition-colors cursor-pointer",
                  selected
                    ? "border-ink bg-sun text-ink"
                    : "border-line bg-paper-raised text-ink-soft hover:border-line-strong hover:text-ink"
                )}
              >
                {s.label}
              </button>
            );
          })}
        </div>
        {!compact ? (
          <span className="font-sans text-xs text-ink-soft">
            {scenario.subtitle}
          </span>
        ) : null}
      </div>

      {/* Optional Domain Controls Strip */}
      {toolbarExtra ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-paper-sunk/60 px-3 py-1.5">
          {toolbarExtra}
        </div>
      ) : null}

      {/* Execution Timeline Scrubber */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-line bg-paper-sunk/40 px-3 py-1.5">
        <div className="flex max-w-full shrink-0 items-center gap-1 overflow-x-auto py-0.5">
          {scenario.steps.map((s, idx) => {
            const isCurrent = idx === safeStepIndex;
            const isPast = idx < safeStepIndex;
            const hasBp = activeBreakpoints.includes(s.line);
            return (
              <Fragment key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    setIsPlaying(false);
                    setHitBreakpointLine(null);
                    setStep(idx);
                  }}
                  title={`Step ${idx + 1}: ${s.label} (line ${s.line})`}
                  className={cn(
                    "relative inline-flex shrink-0 items-center gap-1 rounded-[5px] border px-2 py-0.5 font-mono text-[11px] tabular-nums transition-colors cursor-pointer",
                    isCurrent
                      ? "border-ink bg-sun text-ink font-semibold"
                      : isPast
                        ? "border-line-strong bg-paper-raised text-ink"
                        : "border-line bg-paper text-ink-faint hover:border-line-strong hover:text-ink"
                  )}
                >
                  {hasBp ? (
                    <span
                      className="size-1.5 rounded-full bg-wrong"
                      aria-label="Breakpoint on this step's line"
                    />
                  ) : null}
                  <span>{idx + 1}</span>
                </button>
                {idx < scenario.steps.length - 1 ? (
                  <span
                    className={cn(
                      "h-px w-2.5 shrink-0",
                      isPast ? "bg-ink/45" : "bg-line-strong"
                    )}
                    aria-hidden
                  />
                ) : null}
              </Fragment>
            );
          })}
        </div>

        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          <span className="min-w-0 break-words font-mono text-[11px] font-medium text-ink">
            {step.label}
          </span>
          <ClauseAnchor clause={step.clause} />
        </div>
      </div>

      {compact ? (
        /* Compact 2-Pane Workbench (HomeTopicShowcase / narrow embeds) */
        <div className="flex flex-col">
          {/* Top Full-Width Source & Breakpoints */}
          <div className="min-w-0 border-b border-line">
            {sourceHeaderAndBody("max-h-[210px]")}
          </div>

          {/* Bottom Full-Width Unified Inspector Well */}
          <div className="flex min-w-0 flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-paper-sunk px-2.5 py-1">
              <div className="flex flex-wrap items-center gap-1" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={effectiveCompactTab === "visual"}
                  onClick={() => setCompactTab("visual")}
                  className={cn(
                    "px-2 py-1 font-mono text-[11px] transition-colors cursor-pointer",
                    effectiveCompactTab === "visual"
                      ? "border-b-2 border-sun-deep font-semibold text-ink"
                      : "text-ink-soft hover:text-ink"
                  )}
                >
                  {visualizerTitle}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={effectiveCompactTab === "watch"}
                  onClick={() => setCompactTab("watch")}
                  className={cn(
                    "px-2 py-1 font-mono text-[11px] transition-colors cursor-pointer",
                    effectiveCompactTab === "watch"
                      ? "border-b-2 border-sun-deep font-semibold text-ink"
                      : "text-ink-soft hover:text-ink"
                  )}
                >
                  Watch &amp; Locals
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={effectiveCompactTab === "memory"}
                  onClick={() => setCompactTab("memory")}
                  className={cn(
                    "px-2 py-1 font-mono text-[11px] transition-colors cursor-pointer",
                    effectiveCompactTab === "memory"
                      ? "border-b-2 border-sun-deep font-semibold text-ink"
                      : "text-ink-soft hover:text-ink"
                  )}
                >
                  Memory Layout
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={effectiveCompactTab === "hex"}
                  onClick={() => setCompactTab("hex")}
                  className={cn(
                    "px-2 py-1 font-mono text-[11px] transition-colors cursor-pointer",
                    effectiveCompactTab === "hex"
                      ? "border-b-2 border-sun-deep font-semibold text-ink"
                      : "text-ink-soft hover:text-ink"
                  )}
                >
                  Hex + ASCII
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={effectiveCompactTab === "stack"}
                  onClick={() => setCompactTab("stack")}
                  className={cn(
                    "px-2 py-1 font-mono text-[11px] transition-colors cursor-pointer",
                    effectiveCompactTab === "stack"
                      ? "border-b-2 border-sun-deep font-semibold text-ink"
                      : "text-ink-soft hover:text-ink"
                  )}
                >
                  Call Stack ({step.callStack.length})
                </button>
                {hasDisasm ? (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={effectiveCompactTab === "disasm"}
                    onClick={() => setCompactTab("disasm")}
                    className={cn(
                      "px-2 py-1 font-mono text-[11px] transition-colors cursor-pointer",
                      effectiveCompactTab === "disasm"
                        ? "border-b-2 border-sun-deep font-semibold text-ink"
                        : "text-ink-soft hover:text-ink"
                    )}
                  >
                    {step.disasmTitle ?? "Disasm"}
                  </button>
                ) : null}
                {hasRegisters ? (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={effectiveCompactTab === "registers"}
                    onClick={() => setCompactTab("registers")}
                    className={cn(
                      "px-2 py-1 font-mono text-[11px] transition-colors cursor-pointer",
                      effectiveCompactTab === "registers"
                        ? "border-b-2 border-sun-deep font-semibold text-ink"
                        : "text-ink-soft hover:text-ink"
                    )}
                  >
                    {step.registersTitle ?? "Registers"}
                  </button>
                ) : null}
              </div>

              {focusedAddress ? (
                <button
                  type="button"
                  onClick={() => setFocusedAddress(null)}
                  className="inline-flex items-center gap-1 rounded-[4px] border border-ink bg-sun px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-ink cursor-pointer"
                >
                  <span>Focus: {focusedAddress}</span>
                  <X className="size-2.5" aria-hidden />
                </button>
              ) : null}
            </div>

            {effectiveCompactTab === "watch" ? (
              watchBody("max-h-[215px]")
            ) : (
              <div className="rad-pane-scroll max-h-[255px] overflow-auto bg-paper-raised p-2.5">
                {effectiveCompactTab === "visual"
                  ? renderVisualizer(visualizerCtx)
                  : null}
                {effectiveCompactTab === "memory" ? memoryLayoutBody : null}
                {effectiveCompactTab === "hex" ? hexAsciiBody : null}
                {effectiveCompactTab === "stack" ? callStackBody : null}
                {effectiveCompactTab === "disasm" ? disasmBody : null}
                {effectiveCompactTab === "registers" ? registersBody : null}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Full 4-Pane Tiled RAD Debugger Grid */
        <div className="grid grid-cols-1 @[880px]:grid-cols-12">
          {/* PANE 1: Source & Breakpoints */}
          <div className="min-w-0 border-b border-line @[880px]:col-span-7 @[880px]:border-r">
            {sourceHeaderAndBody("max-h-[300px]")}
          </div>

          {/* PANE 2: Watch & Locals / Registers */}
          <div className="flex min-w-0 flex-col border-b border-line @[880px]:col-span-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-paper-sunk px-2.5 py-1">
              <div className="flex items-center gap-1" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={effectiveWatchTab === "watch"}
                  onClick={() => setWatchPaneTab("watch")}
                  className={cn(
                    "px-2 py-1 font-mono text-[11.5px] transition-colors cursor-pointer",
                    effectiveWatchTab === "watch"
                      ? "border-b-2 border-sun-deep font-semibold text-ink"
                      : "text-ink-soft hover:text-ink"
                  )}
                >
                  Watch &amp; Locals
                </button>
                {hasRegisters ? (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={effectiveWatchTab === "registers"}
                    onClick={() => setWatchPaneTab("registers")}
                    className={cn(
                      "px-2 py-1 font-mono text-[11.5px] transition-colors cursor-pointer",
                      effectiveWatchTab === "registers"
                        ? "border-b-2 border-sun-deep font-semibold text-ink"
                        : "text-ink-soft hover:text-ink"
                    )}
                  >
                    {step.registersTitle ?? "Registers"}
                  </button>
                ) : null}
              </div>
            </div>

            {effectiveWatchTab === "watch" ? (
              watchBody("max-h-[258px]")
            ) : (
              <div className="rad-pane-scroll max-h-[300px] flex-1 overflow-y-auto bg-paper-raised p-2.5">
                {registersBody}
              </div>
            )}
          </div>

          {/* PANE 3: Memory & Hex Well */}
          <div className="flex min-w-0 flex-col border-b border-line @[880px]:col-span-6 @[880px]:border-b-0 @[880px]:border-r">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-paper-sunk px-2.5 py-1">
              <div className="flex items-center gap-1" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={memoryPaneTab === "layout"}
                  onClick={() => setMemoryPaneTab("layout")}
                  className={cn(
                    "px-2 py-1 font-mono text-[11.5px] transition-colors cursor-pointer",
                    memoryPaneTab === "layout"
                      ? "border-b-2 border-sun-deep font-semibold text-ink"
                      : "text-ink-soft hover:text-ink"
                  )}
                >
                  Memory Layout
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={memoryPaneTab === "hex"}
                  onClick={() => setMemoryPaneTab("hex")}
                  className={cn(
                    "px-2 py-1 font-mono text-[11.5px] transition-colors cursor-pointer",
                    memoryPaneTab === "hex"
                      ? "border-b-2 border-sun-deep font-semibold text-ink"
                      : "text-ink-soft hover:text-ink"
                  )}
                >
                  Hex + ASCII
                </button>
              </div>

              {focusedAddress ? (
                <button
                  type="button"
                  onClick={() => setFocusedAddress(null)}
                  className="inline-flex items-center gap-1 rounded-[4px] border border-ink bg-sun px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-ink cursor-pointer"
                >
                  <span>Focus: {focusedAddress}</span>
                  <X className="size-2.5" aria-hidden />
                </button>
              ) : (
                <span className="font-mono text-[10.5px] text-ink-faint">
                  Click any address to inspect
                </span>
              )}
            </div>

            <div className="rad-pane-scroll max-h-[320px] flex-1 overflow-auto bg-paper-raised">
              {memoryPaneTab === "layout" ? memoryLayoutBody : hexAsciiBody}
            </div>
          </div>

          {/* PANE 4: Visualizer / Call Stack / Disasm */}
          <div className="flex min-w-0 flex-col @[880px]:col-span-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-paper-sunk px-2.5 py-1">
              <div className="flex flex-wrap items-center gap-1" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={effectiveVisualTab === "visual"}
                  onClick={() => setVisualPaneTab("visual")}
                  className={cn(
                    "px-2 py-1 font-mono text-[11.5px] transition-colors cursor-pointer",
                    effectiveVisualTab === "visual"
                      ? "border-b-2 border-sun-deep font-semibold text-ink"
                      : "text-ink-soft hover:text-ink"
                  )}
                >
                  {visualizerTitle}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={effectiveVisualTab === "stack"}
                  onClick={() => setVisualPaneTab("stack")}
                  className={cn(
                    "px-2 py-1 font-mono text-[11.5px] transition-colors cursor-pointer",
                    effectiveVisualTab === "stack"
                      ? "border-b-2 border-sun-deep font-semibold text-ink"
                      : "text-ink-soft hover:text-ink"
                  )}
                >
                  Call Stack ({step.callStack.length})
                </button>
                {hasDisasm ? (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={effectiveVisualTab === "disasm"}
                    onClick={() => setVisualPaneTab("disasm")}
                    className={cn(
                      "px-2 py-1 font-mono text-[11.5px] transition-colors cursor-pointer",
                      effectiveVisualTab === "disasm"
                        ? "border-b-2 border-sun-deep font-semibold text-ink"
                        : "text-ink-soft hover:text-ink"
                    )}
                  >
                    {step.disasmTitle ?? "Disasm / Lowering"}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="rad-pane-scroll max-h-[320px] flex-1 overflow-auto bg-paper-raised p-3">
              {effectiveVisualTab === "visual"
                ? renderVisualizer(visualizerCtx)
                : null}
              {effectiveVisualTab === "stack" ? callStackBody : null}
              {effectiveVisualTab === "disasm" ? disasmBody : null}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Diagnostic & ISO Status Bar */}
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2",
          verdictStyle.surface
        )}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <StatusPill tone={step.verdict.tone}>{step.verdict.label}</StatusPill>
          {hitBreakpointLine !== null ? (
            <StatusPill tone="danger">
              Paused at breakpoint · line {hitBreakpointLine}
            </StatusPill>
          ) : null}
          <p className="min-w-0 flex-1 font-sans text-xs leading-relaxed text-ink">
            {step.summary}
          </p>
        </div>

        <div className="hidden shrink-0 items-center gap-2 font-mono text-[10.5px] text-ink-soft xl:flex">
          <RotateCcw className="size-3 opacity-60" aria-hidden />
          <span>←/→ Step · Space Run · B Breakpoint · R Reset</span>
        </div>
      </div>
    </section>
  );
}
