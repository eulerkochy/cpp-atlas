"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CppRefIndexEntry, ReferenceLang } from "@/types/cpp";

export interface ExploreEntryItem extends CppRefIndexEntry {
  hasCompanion: boolean;
}

export function ExploreDomainClient({
  lang,
  domainName,
  entries,
}: {
  lang: ReferenceLang;
  domainName: string;
  entries: ExploreEntryItem[];
}) {
  const [filter, setFilter] = useState("");
  const [showAll, setShowAll] = useState(false);

  const q = filter.trim().toLowerCase();
  const filtered = q
    ? entries.filter(
        (e) =>
          e.name.toLowerCase().includes(q) || e.path.toLowerCase().includes(q)
      )
    : entries;

  const limit = showAll ? filtered.length : 120;
  const visible = filtered.slice(0, limit);
  const basePrefix = `/w/${lang}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h2 className="font-display text-2xl font-[450] tracking-[-0.02em] text-ink">
            {domainName}
          </h2>
          <p className="mt-0.5 text-xs text-ink-faint tabular-nums">
            Showing {visible.length} of {filtered.length} matching entries
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search
            className="size-3.5 text-ink-faint absolute left-3.5 top-1/2 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={`Filter ${domainName.toLowerCase()}…`}
            className="h-9 rounded-full border-line-strong bg-paper-raised pl-9 text-sm text-ink placeholder:text-ink-faint"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="border-t border-line py-10 text-center text-sm text-ink-soft">
          No entries match &ldquo;{filter}&rdquo; in {domainName}.
        </div>
      ) : (
        <ol className="border-t border-line">
          {visible.map((item) => (
            <li
              key={`${item.path}-${item.name}`}
              className="border-b border-line"
            >
              <Link
                href={`${basePrefix}/${item.path}`}
                className="group flex flex-wrap items-center justify-between gap-3 py-3.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-sm font-medium text-ink decoration-sun decoration-2 underline-offset-[5px] group-hover:underline truncate">
                      {item.name}
                    </span>
                    {item.hasCompanion ? (
                      <span className="shrink-0 rounded-[var(--radius-chip)] bg-sun-wash px-2 py-0.5 text-[11px] font-medium text-ink">
                        Map &amp; quiz
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-xs text-ink-faint">
                    {basePrefix}/{item.path}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2.5">
                  <span className="rounded-[var(--radius-chip)] border border-line bg-paper-raised px-2 py-0.5 text-[11px] text-ink-soft">
                    {item.type}
                  </span>
                  <ArrowUpRight
                    className="size-3.5 text-ink-faint transition-colors group-hover:text-ink"
                    aria-hidden
                  />
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}

      {filtered.length > limit ? (
        <div className="flex justify-center pt-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setShowAll(true)}
            className="cursor-pointer"
          >
            Load all {filtered.length} entries in {domainName}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
