"use client";

import type { ReactNode } from "react";
import { Crosshair, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { standardRefToUrl } from "@/types/topics";
import type { RadMemCellState, RadTone } from "./types";

export function toneStyles(tone: RadTone = "neutral"): {
  pill: string;
  text: string;
  border: string;
  surface: string;
} {
  switch (tone) {
    case "safe":
      return {
        pill: "border-[color:var(--right)]/30 bg-right-wash text-[color:var(--right)]",
        text: "text-[color:var(--right)]",
        border: "border-[color:var(--right)]/40",
        surface: "bg-right-wash/45",
      };
    case "danger":
      return {
        pill: "border-wrong/35 bg-wrong-wash text-wrong",
        text: "text-wrong",
        border: "border-wrong/45",
        surface: "bg-wrong-wash/55",
      };
    case "warn":
    case "active":
      return {
        pill: "border-sun-deep/45 bg-sun-wash text-ink",
        text: "text-ink",
        border: "border-sun-deep/60",
        surface: "bg-sun-wash/60",
      };
    case "info":
      return {
        pill: "border-[color:var(--code-blue)]/30 bg-sky-wash text-[color:var(--code-blue)]",
        text: "text-[color:var(--code-blue)]",
        border: "border-[color:var(--code-blue)]/40",
        surface: "bg-sky-wash/55",
      };
    case "neutral":
    default:
      return {
        pill: "border-line-strong bg-paper-sunk text-ink-soft",
        text: "text-ink-soft",
        border: "border-line",
        surface: "bg-paper-sunk/60",
      };
  }
}

export function memStateStyles(state: RadMemCellState): {
  badge: string;
  row: string;
  hex: string;
  label: string;
} {
  switch (state) {
    case "alive":
      return {
        badge: "border-[color:var(--right)]/30 bg-right-wash text-[color:var(--right)]",
        row: "border-l-2 border-l-[color:var(--right)]",
        hex: "text-ink",
        label: "ALIVE",
      };
    case "uninit":
      return {
        badge: "border-line-strong bg-paper-sunk text-ink-faint",
        row: "border-l-2 border-l-line-strong opacity-80",
        hex: "text-ink-faint",
        label: "UNINIT",
      };
    case "moved":
      return {
        badge: "border-sun-deep/45 bg-sun-wash text-ink",
        row: "border-l-2 border-l-sun-deep bg-sun-wash/30",
        hex: "text-ink-soft",
        label: "MOVED",
      };
    case "freed":
      return {
        badge: "border-line-strong bg-paper-sunk text-ink-faint line-through",
        row: "border-l-2 border-l-line-strong bg-paper-sunk/40 opacity-70",
        hex: "text-ink-faint",
        label: "FREED",
      };
    case "dangling":
    case "ub":
      return {
        badge: "border-wrong/40 bg-wrong-wash text-wrong",
        row: "border-l-2 border-l-wrong bg-wrong-wash/40",
        hex: "text-wrong",
        label: state === "ub" ? "UB" : "DANGLING",
      };
    case "padding":
      return {
        badge: "border-line bg-paper-sunk text-ink-faint",
        row: "border-l-2 border-l-line bg-paper-sunk/55",
        hex: "text-ink-faint",
        label: "PAD",
      };
    case "vptr":
      return {
        badge: "border-[color:var(--code-blue)]/35 bg-sky-wash text-[color:var(--code-blue)]",
        row: "border-l-2 border-l-[color:var(--code-blue)] bg-sky-wash/35",
        hex: "text-[color:var(--code-blue)]",
        label: "VPTR",
      };
    case "rodata":
      return {
        badge: "border-[color:var(--code-blue)]/30 bg-sky-wash text-[color:var(--code-blue)]",
        row: "border-l-2 border-l-[color:var(--code-blue)]/70",
        hex: "text-[color:var(--code-blue)]",
        label: "RODATA",
      };
  }
}

export function normalizeAddress(addr: string): string {
  const match = addr.match(/0x[0-9a-fA-F]+/);
  return match ? match[0].toLowerCase() : addr.trim().toLowerCase();
}

export function addressesMatch(
  a?: string | null,
  b?: string | null
): boolean {
  if (!a || !b) return false;
  return normalizeAddress(a) === normalizeAddress(b);
}

export function AddressChip({
  address,
  focusedAddress,
  onFocusAddress,
  prefix,
  className,
}: {
  address: string;
  focusedAddress?: string | null;
  onFocusAddress?: (addr: string | null) => void;
  prefix?: string;
  className?: string;
}) {
  const isFocused = addressesMatch(address, focusedAddress);
  const norm = normalizeAddress(address);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (!onFocusAddress) return;
        onFocusAddress(isFocused ? null : norm);
      }}
      title={
        isFocused
          ? `Clear focus on ${norm}`
          : `Inspect ${norm} across watch & memory panes`
      }
      className={cn(
        "inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-0.5 font-mono text-[11px] leading-none tabular-nums transition-colors cursor-pointer",
        isFocused
          ? "border-ink bg-sun text-ink font-semibold"
          : "border-[color:var(--code-blue)]/25 bg-sky-wash/70 text-[color:var(--code-blue)] hover:border-[color:var(--code-blue)]/60 hover:bg-sky-wash",
        className
      )}
    >
      {prefix ? <span className="text-ink-faint">{prefix}</span> : null}
      <span>{address}</span>
      <Crosshair className="size-2.5 opacity-70" aria-hidden />
    </button>
  );
}

export function StatusPill({
  tone = "neutral",
  children,
  className,
}: {
  tone?: RadTone;
  children: ReactNode;
  className?: string;
}) {
  const styles = toneStyles(tone);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-0.5 font-mono text-[11px] font-medium leading-tight tracking-tight",
        styles.pill,
        className
      )}
    >
      {children}
    </span>
  );
}

export function ClauseAnchor({
  clause,
  className,
}: {
  clause: string;
  className?: string;
}) {
  return (
    <a
      href={standardRefToUrl(clause)}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex items-center gap-1 rounded-[4px] border border-line-strong bg-paper px-1.5 py-0.5 font-mono text-[11px] leading-tight text-ink-soft transition-colors hover:border-ink/40 hover:text-ink",
        className
      )}
      title={`Open ISO C++ standard reference ${clause} on eel.is`}
    >
      <span>{clause}</span>
      <ExternalLink className="size-2.5 opacity-70" aria-hidden />
    </a>
  );
}
