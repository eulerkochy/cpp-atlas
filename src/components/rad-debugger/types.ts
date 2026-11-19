import type { ReactNode } from "react";

export type RadTone =
  | "neutral"
  | "active"
  | "safe"
  | "warn"
  | "danger"
  | "info";

export type RadMemCellState =
  | "alive"
  | "uninit"
  | "moved"
  | "freed"
  | "dangling"
  | "padding"
  | "vptr"
  | "rodata"
  | "ub";

export interface RadWatchNode {
  id: string;
  expr: string;
  value: string;
  type: string;
  address?: string;
  size?: string;
  offset?: string;
  tone?: RadTone;
  changed?: boolean;
  badge?: string;
  note?: string;
  children?: RadWatchNode[];
  defaultExpanded?: boolean;
}

export interface RadMemoryCell {
  offset: string;
  size: number;
  label: string;
  value: string;
  hex: string;
  ascii?: string;
  state: RadMemCellState;
  address: string;
  pointsTo?: string;
  changed?: boolean;
  note?: string;
}

export interface RadMemoryRegion {
  id: string;
  name: string;
  segment: "STACK" | "HEAP" | "RODATA" | "CORO" | "CACHE" | "STATIC";
  baseAddress: string;
  status?: "alive" | "freed" | "dangling" | "static" | "buffer";
  statusLabel?: string;
  cells: RadMemoryCell[];
}

export interface RadStackFrame {
  id: string;
  fn: string;
  file: string;
  line: number;
  addr: string;
  args?: string;
  isCurrent?: boolean;
  isSuspended?: boolean;
  thread?: string;
  note?: string;
}

export interface RadRegister {
  name: string;
  value: string;
  note?: string;
  changed?: boolean;
  tone?: RadTone;
}

export interface RadAsmLine {
  addr: string;
  op: string;
  operands: string;
  comment?: string;
  active?: boolean;
  isZeroCost?: boolean;
}

export interface RadStep {
  id: string;
  label: string;
  line: number;
  secondaryLine?: { line: number; thread: string };
  verdict: { tone: RadTone; label: string };
  clause: string;
  summary: string;
  inlineHints?: Record<number, { text: string; tone?: RadTone }>;
  watches: RadWatchNode[];
  memory: RadMemoryRegion[];
  callStack: RadStackFrame[];
  registers?: RadRegister[];
  disasm?: RadAsmLine[];
  disasmTitle?: string;
  registersTitle?: string;
}

export interface RadScenario {
  id: string;
  label: string;
  subtitle: string;
  filename: string;
  standard: string;
  target: string;
  topicSlugs?: string[];
  defaultBreakpoints?: number[];
  source: string[];
  steps: RadStep[];
  quickWatches?: { expr: string; note: string }[];
}

export interface RadVisualizerContext {
  scenario: RadScenario;
  step: RadStep;
  stepIndex: number;
  focusedAddress: string | null;
  onFocusAddress: (addr: string | null) => void;
  onJumpStep: (index: number) => void;
}

export interface RadDebuggerShellProps {
  ariaLabel: string;
  title: string;
  scenarios: RadScenario[];
  topicSlug?: string;
  initialScenarioId?: string;
  visualizerTitle: string;
  renderVisualizer: (ctx: RadVisualizerContext) => ReactNode;
  toolbarExtra?: ReactNode;
  scenarioId?: string;
  onScenarioChange?: (id: string) => void;
  stepIndex?: number;
  onStepChange?: (index: number) => void;
  compact?: boolean;
}
