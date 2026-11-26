"use client";

import { useSyncExternalStore } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const KEY = "cpp-atlas-build-v1";
const EVENT = "cpp-atlas-build-change";

function readDone(): string {
  try {
    return window.localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

function parse(raw: string): string[] {
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Completed stage ids ("vector/01-slug") from localStorage; empty on the server and first paint. */
export function useBuildDone(): { done: Set<string>; hydrated: boolean } {
  const raw = useSyncExternalStore(subscribe, readDone, () => "[]");
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  return { done: new Set(parse(raw)), hydrated };
}

export function markStagesDone(ids: string[]) {
  try {
    const current = parse(readDone());
    const next = new Set(current);
    for (const id of ids) next.add(id);
    window.localStorage.setItem(KEY, JSON.stringify([...next]));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // storage unavailable
  }
}

export function StageDoneButton({ id, className }: { id: string; className?: string }) {
  const { done, hydrated } = useBuildDone();
  const isDone = done.has(id);

  function toggle() {
    const next = new Set(done);
    if (isDone) next.delete(id);
    else next.add(id);
    try {
      window.localStorage.setItem(KEY, JSON.stringify([...next]));
      window.dispatchEvent(new Event(EVENT));
    } catch {
      // storage unavailable: progress simply is not remembered
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={hydrated && isDone}
      className={cn(
        "inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors",
        hydrated && isDone
          ? "border-ink bg-sun text-ink"
          : "border-line-strong bg-paper-raised text-ink-soft hover:border-ink hover:text-ink",
        className
      )}
    >
      <Check className="size-3.5" aria-hidden />
      {hydrated && isDone ? "Marked done" : "Mark stage done"}
    </button>
  );
}

/** "3 of 8 stages done" for the challenge overview; renders nothing until hydrated and non-zero. */
export function StageDoneCount({ ids }: { ids: string[] }) {
  const { done, hydrated } = useBuildDone();
  const n = ids.filter((id) => done.has(id)).length;
  if (!hydrated || n === 0) return null;
  return (
    <span className="text-xs text-ink-soft tabular-nums">
      {n} of {ids.length} stages done
    </span>
  );
}

export function StageDoneDot({ id }: { id: string }) {
  const { done, hydrated } = useBuildDone();
  const isDone = hydrated && done.has(id);
  return (
    <span
      role="img"
      aria-label={isDone ? "Done" : "Not done"}
      className={cn(
        "inline-block size-2.5 shrink-0 rounded-full border",
        isDone ? "border-ink bg-sun" : "border-ink-soft bg-transparent"
      )}
    />
  );
}
