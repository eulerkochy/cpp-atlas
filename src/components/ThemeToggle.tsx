"use client";

import { Moon, Sun } from "lucide-react";

/** The theme the last click asked for; the class lands a frame later during a fade. */
let wanted: boolean | null = null;
let fades = 0;

/** Switches between the day and night themes and remembers the choice. */
export function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const dark = !(wanted ?? root.classList.contains("dark"));
    wanted = dark;
    const apply = () => root.classList.toggle("dark", wanted ?? dark);
    try {
      localStorage.setItem("theme", dark ? "dark" : "light");
    } catch {
      /* private mode: the choice lasts for this page only */
    }

    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !document.startViewTransition) {
      apply();
      return;
    }
    // Cross-fade the whole page so every surface changes together. A click
    // during a fade cuts it short and starts the next one from where it is.
    const mine = ++fades;
    root.classList.add("theme-switching");
    const done = () => {
      if (mine === fades) root.classList.remove("theme-switching");
    };
    document.startViewTransition(apply).finished.then(done, done);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Switch between light and dark theme"
      title="Switch theme"
      className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
    >
      <Moon className="size-4 dark:hidden" aria-hidden />
      <Sun className="hidden size-4 dark:block" aria-hidden />
    </button>
  );
}
