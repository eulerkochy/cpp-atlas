"use client";

import { useEffect } from "react";
import { openInGodbolt } from "@/lib/godbolt";

function extractCodeFromButton(btn: HTMLElement): string | null {
  const pre = btn.closest(".cppref-code")?.querySelector("pre");
  if (!pre) return null;
  return (pre.textContent ?? "").replace(/\u00a0/g, " ").replace(/\n+$/, "");
}

/**
 * Makes server-rendered Copy and Compiler Explorer buttons inside
 * `.cppref .cppref-code` work via a single delegated document click listener.
 */
export function CodeCopyEnhancer() {
  useEffect(() => {
    const timers = new Map<HTMLElement, number>();
    async function onClick(e: MouseEvent) {
      const target = e.target as Element | null;
      const godboltBtn = target?.closest<HTMLButtonElement>(
        ".cppref [data-godbolt]"
      );
      if (godboltBtn) {
        const text = extractCodeFromButton(godboltBtn);
        if (text === null) return;
        openInGodbolt(text, {
          lang: godboltBtn.dataset.godbolt === "c" ? "c" : "cpp",
        });
        return;
      }

      const btn = target?.closest<HTMLButtonElement>(".cppref [data-copy]");
      if (!btn) return;
      const text = extractCodeFromButton(btn);
      if (text === null) return;
      let label = "Copied";
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        label = "Copy failed";
      }
      btn.textContent = label;
      btn.dataset.state = label === "Copied" ? "done" : "error";
      window.clearTimeout(timers.get(btn));
      timers.set(
        btn,
        window.setTimeout(() => {
          btn.textContent = "Copy";
          delete btn.dataset.state;
        }, 1800)
      );
    }
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);
  return null;
}
