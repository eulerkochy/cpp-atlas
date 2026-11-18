"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { CppRefHeading } from "@/types/cpp";

/**
 * Sticky list of sections with scroll-spy. Lists headings matching `depth`
 * (or mixes h2/h3 cleanly if most sections are h2 or h3).
 */
export function SectionRail({
  headings,
  label = "On this page",
}: {
  headings: CppRefHeading[];
  label?: string;
}) {
  const h2s = headings.filter((h) => h.level === 2);
  const h3s = headings.filter((h) => h.level === 3);
  const sections =
    h2s.length >= 2 ? h2s : h3s.length > 0 ? h3s : headings.slice(0, 18);

  const [active, setActive] = useState(sections[0]?.id);

  useEffect(() => {
    if (!sections.length) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight * 0.3;
      let current = sections[0].id;
      for (const s of sections) {
        const el = document.getElementById(s.id);
        if (!el || el.offsetParent === null) continue;
        if (el.getBoundingClientRect().top <= line) current = s.id;
        else break;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headings]);

  if (!sections.length) return null;

  return (
    <nav aria-label={label} className="px-1 text-[0.9rem]">
      <p className="mb-3 text-sm font-medium text-ink">{label}</p>
      <ol className="space-y-0.5">
        {sections.map((s, i) => {
          const on = s.id === active;
          return (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                aria-current={on ? "location" : undefined}
                className={cn(
                  "flex gap-2.5 border-l-2 py-1.5 pl-3 leading-snug transition-colors duration-150",
                  on
                    ? "border-ink text-ink font-medium"
                    : "border-transparent text-ink-faint hover:text-ink-soft"
                )}
              >
                <span className="w-4 shrink-0 tabular-nums">{i + 1}</span>
                <span className="min-w-0 [overflow-wrap:anywhere]">{s.text}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
