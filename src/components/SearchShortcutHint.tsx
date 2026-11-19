"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

function subscribeShortcut() {
  return () => {};
}

function serverShortcut() {
  return "⌘K";
}

function shortcutLabel(): string {
  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  const platform = nav.userAgentData?.platform || navigator.platform || "";
  return /mac/i.test(platform) ? "⌘K" : "Ctrl K";
}

/**
 * Keyboard hint for the command palette. Coarse pointers (touch) never see
 * it. Fine-pointer Macs show ⌘K; other desktops show Ctrl K.
 */
export function SearchShortcutHint({ className }: { className?: string }) {
  const label = useSyncExternalStore(
    subscribeShortcut,
    shortcutLabel,
    serverShortcut
  );

  return (
    <kbd className={cn("pointer-coarse:hidden", className)}>{label}</kbd>
  );
}
