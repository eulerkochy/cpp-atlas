"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { MindMap } from "@/components/MindMap";
import { Window } from "@/components/Window";
import { cn } from "@/lib/utils";
import type { TopicMapNode } from "@/types/topics";

// The simulator loads only when its view is first opened.
const ValueCategoryMap = dynamic(
  () =>
    import("@/components/memory-maps/ValueCategoryMap").then(
      (m) => m.ValueCategoryMap
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center rounded-[var(--radius-window)] border border-line bg-paper-raised text-sm text-ink-faint">
        Loading debugger…
      </div>
    ),
  }
);

const VIEWS = [
  {
    id: "read",
    label: "Read",
    description:
      "The article explains one idea at a time, with code you can copy and the clause of the standard behind it.",
    linkLabel: "Open the article",
    query: "",
  },
  {
    id: "see",
    label: "See",
    description:
      "Step through C++ execution like a native debugger—inspect value categories, watch expressions, memory layout, and assembly live.",
    linkLabel: "Open the debugger",
    query: "?view=debugger",
  },
  {
    id: "trace",
    label: "Trace",
    description:
      "The concept map lays the topic out as a tree. Select a node to read its note.",
    linkLabel: "Open the concept map",
    query: "?view=map",
  },
] as const;

/**
 * One topic shown three ways: a list of views on the left and one window on
 * the right that swaps with the selected view.
 */
export function HomeTopicShowcase({
  slug,
  title,
  article,
  mapRoot,
}: {
  slug: string;
  title: string;
  /** Server-rendered opening of the topic article. */
  article: ReactNode;
  mapRoot: TopicMapNode | null;
}) {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const view = VIEWS[active];

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const last = VIEWS.length - 1;
    let next: number;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      next = active === last ? 0 : active + 1;
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      next = active === 0 ? last : active - 1;
    } else if (e.key === "Home") {
      next = 0;
    } else if (e.key === "End") {
      next = last;
    } else {
      return;
    }
    e.preventDefault();
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-14">
      <div className="grid lg:sticky lg:top-28 lg:self-start lg:pt-10">
        <div
          role="tablist"
          aria-label={`Three views of ${title}`}
          aria-orientation="vertical"
          className="contents"
        >
          {VIEWS.map((v, i) => {
            const selected = i === active;
            return (
              <button
                key={v.id}
                type="button"
                role="tab"
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                id={`showcase-tab-${v.id}`}
                aria-selected={selected}
                aria-controls="showcase-panel"
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(i)}
                onKeyDown={onKeyDown}
                style={{ gridRow: i * 2 + 1 }}
                className={cn(
                  "block w-full cursor-pointer border-l-2 py-2 pl-5 text-left font-display text-[1.75rem] leading-tight font-[450] tracking-[-0.02em] transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                  selected
                    ? "border-sun text-ink"
                    : "border-line text-ink-faint hover:text-ink-soft"
                )}
              >
                {v.label}
              </button>
            );
          })}
        </div>
        {VIEWS.map((v, i) => {
          const selected = i === active;
          return (
            <div
              key={`${v.id}-detail`}
              style={{ gridRow: i * 2 + 2 }}
              className={cn(
                "border-l-2 pl-5 transition-colors duration-200",
                selected ? "border-sun" : "border-transparent"
              )}
            >
              <div
                inert={!selected}
                className={cn(
                  "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
                  selected
                    ? "grid-rows-[1fr] opacity-100"
                    : "grid-rows-[0fr] opacity-0"
                )}
              >
                <div className="overflow-hidden">
                  <p className="max-w-[44ch] text-[0.9375rem] leading-relaxed text-ink-soft">
                    {v.description}
                  </p>
                  <p className="mt-2 pb-3 text-sm">
                    <Link
                      href={`/topics/${slug}${v.query}`}
                      className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
                    >
                      {v.linkLabel}
                    </Link>
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div
        id="showcase-panel"
        role="tabpanel"
        aria-labelledby={`showcase-tab-${view.id}`}
        className="grid min-w-0 lg:min-h-[var(--showcase-h)] [&>*]:min-w-0"
        style={{ "--showcase-h": "50rem" } as React.CSSProperties}
      >
        {view.id === "read" ? (
          <Window
            key="read"
            title={`${slug}/article.md`}
            className="max-h-[32rem] animate-in overflow-clip duration-200 fade-in lg:max-h-[var(--showcase-h)]"
            bodyClassName="px-5 pt-6 sm:px-9 sm:pt-8"
          >
            {article}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-paper-raised from-10% to-transparent"
            />
          </Window>
        ) : null}
        {view.id === "see" ? (
          <div key="see" className="grid animate-in duration-200 fade-in">
            <ValueCategoryMap compact />
          </div>
        ) : null}
        {view.id === "trace" ? (
          <div key="trace" className="grid animate-in duration-200 fade-in">
            {mapRoot ? (
              <MindMap slug={slug} title={title} root={mapRoot} panel="below" />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
