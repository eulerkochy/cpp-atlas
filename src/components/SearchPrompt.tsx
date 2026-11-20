"use client";

import { Search } from "lucide-react";
import { openGlobalSearch } from "@/components/CommandPalette";
import { SearchShortcutHint } from "@/components/SearchShortcutHint";
import { cn } from "@/lib/utils";

/** A search field look-alike that opens the command palette. */
export function SearchPrompt({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={openGlobalSearch}
      aria-keyshortcuts="Meta+K Control+K"
      className={cn(
        "flex h-12 w-full max-w-md items-center gap-3 rounded-full border border-line-strong bg-paper-raised px-5 text-left text-ink-soft shadow-[0_8px_24px_-16px_rgb(0_0_0/0.25)] transition-colors hover:border-ink/40 hover:text-ink cursor-pointer",
        className
      )}
    >
      <Search className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <SearchShortcutHint className="rounded-md border border-line bg-paper px-1.5 font-sans text-[11px] text-ink-faint" />
    </button>
  );
}
