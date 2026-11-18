"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { openGlobalSearch } from "@/components/CommandPalette";
import { cn } from "@/lib/utils";

/**
 * The home page's pinned search dock: a wide paper arc floating over the
 * bottom of the viewport with one search button. It slides away while the
 * site footer is on screen so it never covers it.
 */
export function HomeDock({
  topics,
  referencePages,
}: {
  topics: number;
  referencePages: number;
}) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const footer = document.querySelector("footer");
    if (!footer) return;
    const observer = new IntersectionObserver(([entry]) => {
      setHidden(entry.isIntersecting);
    });
    observer.observe(footer);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      inert={hidden}
      aria-hidden={hidden || undefined}
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-30 h-[7.5rem] overflow-hidden transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] sm:h-[8rem]",
        hidden && "translate-y-full"
      )}
    >
      <div
        aria-hidden
        className="absolute top-0 left-1/2 h-[24rem] w-[170%] -translate-x-1/2 rounded-[50%] border border-line bg-paper shadow-[0_-10px_32px_-14px_rgb(0_0_0/0.2)] sm:w-[160%] dark:shadow-[0_-10px_32px_-14px_rgb(0_4_16/0.8)]"
      />
      <div className="relative flex h-full flex-col items-center px-4 pt-7 sm:pt-8">
        <button
          type="button"
          onClick={openGlobalSearch}
          aria-keyshortcuts="Meta+K Control+K"
          tabIndex={hidden ? -1 : undefined}
          className="pointer-events-auto inline-flex h-12 w-full max-w-sm cursor-pointer items-center justify-center gap-3 rounded-full bg-ink px-6 text-[0.9375rem] font-medium text-paper shadow-[0_8px_24px_-12px_rgb(0_0_0/0.4)] transition-transform hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-ink active:scale-[0.99]"
        >
          <Search className="size-[1.05rem] shrink-0" aria-hidden />
          <span>Search C++ Atlas</span>
          <kbd className="rounded-md border border-paper/25 px-1.5 font-sans text-[11px] leading-5 text-paper/70">
            ⌘K
          </kbd>
        </button>
        <p className="mt-2.5 text-xs text-ink-faint">
          {topics} topics and {referencePages.toLocaleString("en-US")}{" "}
          reference pages
        </p>
      </div>
    </div>
  );
}
