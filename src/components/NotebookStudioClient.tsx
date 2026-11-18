"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  Download,
  Headphones,
  Plus,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Window } from "@/components/Window";
import type { UnifiedSearchResultItem } from "@/types/topics";
import type { ReferenceLang } from "@/types/cpp";

export interface NotebookTopicOption {
  slug: string;
  title: string;
  trackTitle: string;
  summary: string;
}

type SelectedSource =
  | {
      kind: "reference";
      lang: ReferenceLang;
      path: string;
      name: string;
    }
  | {
      kind: "topic";
      slug: string;
      name: string;
      trackTitle?: string;
    };

interface PackPreset {
  id: string;
  label: string;
  sources: SelectedSource[];
}

const PRESETS: PackPreset[] = [
  {
    id: "value-lifetime",
    label: "Value semantics & lifetime",
    sources: [
      { kind: "reference", lang: "cpp", path: "language/value_category", name: "Value categories" },
      { kind: "reference", lang: "cpp", path: "language/copy_elision", name: "Copy elision" },
      { kind: "reference", lang: "cpp", path: "language/lifetime", name: "Object lifetime" },
    ],
  },
  {
    id: "memory-atomics",
    label: "Memory model & atomics",
    sources: [
      { kind: "reference", lang: "cpp", path: "language/memory_model", name: "Memory model" },
      { kind: "reference", lang: "cpp", path: "atomic/memory_order", name: "std::memory_order" },
      {
        kind: "reference",
        lang: "cpp",
        path: "atomic/atomic_thread_fence",
        name: "std::atomic_thread_fence",
      },
    ],
  },
  {
    id: "move-concepts",
    label: "Move, forwarding & concepts",
    sources: [
      { kind: "reference", lang: "cpp", path: "utility/move", name: "std::move" },
      { kind: "reference", lang: "cpp", path: "utility/forward", name: "std::forward" },
      { kind: "reference", lang: "cpp", path: "container/vector", name: "std::vector" },
      {
        kind: "reference",
        lang: "cpp",
        path: "language/constraints",
        name: "Constraints and concepts",
      },
    ],
  },
];

function sourceKey(item: SelectedSource): string {
  return item.kind === "topic"
    ? `topic:${item.slug}`
    : `ref:${item.lang}:${item.path}`;
}

function sourceDisplayPath(item: SelectedSource): string {
  return item.kind === "topic"
    ? `/topics/${item.slug}`
    : `/w/${item.lang}/${item.path}`;
}

function sourceEndpoint(item: SelectedSource, ansFlag: string): string {
  if (item.kind === "topic") {
    return `/api/notebook/topic/${item.slug}?answers=${ansFlag}`;
  }
  const encoded = item.path
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  return `/api/notebook/${item.lang}${encoded ? `/${encoded}` : ""}?answers=${ansFlag}`;
}

export function NotebookStudioClient({
  topics = [],
}: {
  topics?: NotebookTopicOption[];
}) {
  const [selectedSources, setSelectedSources] = useState<SelectedSource[]>(() =>
    topics.length >= 2
      ? topics.slice(0, 3).map((t) => ({
          kind: "topic",
          slug: t.slug,
          name: t.title,
          trackTitle: t.trackTitle,
        }))
      : PRESETS[0].sources
  );
  const [includeAnswers, setIncludeAnswers] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UnifiedSearchResultItem[]>(
    []
  );
  const [topicFilter, setTopicFilter] = useState("");
  const [markdownPreview, setMarkdownPreview] = useState<string>("");
  const [loadingMd, setLoadingMd] = useState(false);
  const [copiedMd, setCopiedMd] = useState(false);
  const [copiedUrls, setCopiedUrls] = useState(false);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(q)}&limit=14`
        );
        if (res.ok && !cancelled) {
          const data = (await res.json()) as {
            results: UnifiedSearchResultItem[];
          };
          setSearchResults(data.results ?? []);
        }
      } catch {
        // Ignore transient search error
      }
    }, 120);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [searchQuery]);

  useEffect(() => {
    if (selectedSources.length === 0) return;
    let cancelled = false;

    (async () => {
      setLoadingMd(true);
      try {
        const ansFlag = includeAnswers ? "1" : "0";
        const parts = await Promise.all(
          selectedSources.map(async (item) => {
            const res = await fetch(sourceEndpoint(item, ansFlag));
            if (!res.ok) {
              return `# ${item.name}\n\nUnable to load ${sourceDisplayPath(item)}.`;
            }
            return await res.text();
          })
        );
        if (!cancelled) {
          setMarkdownPreview(parts.join("\n\n---\n\n"));
        }
      } finally {
        if (!cancelled) setLoadingMd(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedSources, includeAnswers]);

  const activeSearchResults = searchQuery.trim() ? searchResults : [];
  const displayedMarkdown =
    selectedSources.length === 0 ? "" : markdownPreview;

  const filteredTopicOptions = topics.filter((t) => {
    const q = topicFilter.trim().toLowerCase();
    if (!q) return true;
    return (
      t.title.toLowerCase().includes(q) ||
      t.slug.toLowerCase().includes(q) ||
      t.trackTitle.toLowerCase().includes(q)
    );
  });

  const toggleItem = (item: SelectedSource) => {
    const key = sourceKey(item);
    setSelectedSources((prev) => {
      const exists = prev.some((p) => sourceKey(p) === key);
      return exists
        ? prev.filter((p) => sourceKey(p) !== key)
        : [...prev, item];
    });
  };

  const addItem = (item: SelectedSource) => {
    const key = sourceKey(item);
    setSelectedSources((prev) =>
      prev.some((p) => sourceKey(p) === key) ? prev : [...prev, item]
    );
    setSearchQuery("");
    setSearchResults([]);
  };

  const handleDownload = () => {
    if (!displayedMarkdown) return;
    const blob = new Blob([displayedMarkdown], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cpp-atlas-notebooklm-pack.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyMarkdown = async () => {
    if (!displayedMarkdown) return;
    await navigator.clipboard.writeText(displayedMarkdown);
    setCopiedMd(true);
    setTimeout(() => setCopiedMd(false), 1800);
  };

  const handleCopyUrls = async () => {
    const origin = window.location.origin;
    const text = selectedSources
      .map((p) => `${origin}${sourceDisplayPath(p)}`)
      .join("\n");
    await navigator.clipboard.writeText(text);
    setCopiedUrls(true);
    setTimeout(() => setCopiedUrls(false), 1800);
  };

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[360px_minmax(0,1fr)]">
      <div className="space-y-6">
        <Window title="sources.bundle" bodyClassName="p-5 space-y-5">
          <div className="flex items-center justify-between gap-2 text-sm font-medium text-ink">
            <div className="flex items-center gap-2">
              <Headphones className="size-4 text-ink-soft" aria-hidden />
              <span>Curated podcast presets</span>
            </div>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route handler, not a page */}
            <a
              href="/api/notebook/topics-all?download=1"
              className="text-xs font-medium text-ink-soft underline decoration-line-strong underline-offset-3 hover:text-ink hover:decoration-ink"
            >
              All topics .md
            </a>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((preset) => (
              <Button
                key={preset.id}
                type="button"
                size="xs"
                variant="outline"
                onClick={() => setSelectedSources(preset.sources)}
                className="text-xs cursor-pointer"
              >
                {preset.label}
              </Button>
            ))}
          </div>

          {topics.length > 0 ? (
            <div className="space-y-2 border-t border-line pt-4">
              <div className="text-xs font-medium text-ink">
                Add study topics ({topics.length})
              </div>
              <Input
                value={topicFilter}
                onChange={(e) => setTopicFilter(e.target.value)}
                placeholder="Filter study topics…"
                className="h-8 rounded-full border-line-strong bg-paper px-3.5 text-xs text-ink"
              />
              <div className="max-h-40 divide-y divide-line overflow-y-auto rounded-2xl border border-line bg-paper-raised">
                {filteredTopicOptions.map((topic) => {
                  const key = `topic:${topic.slug}`;
                  const added = selectedSources.some(
                    (s) => sourceKey(s) === key
                  );
                  return (
                    <button
                      key={topic.slug}
                      type="button"
                      onClick={() =>
                        toggleItem({
                          kind: "topic",
                          slug: topic.slug,
                          name: topic.title,
                          trackTitle: topic.trackTitle,
                        })
                      }
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-sun-wash/50 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium text-ink">
                          {topic.title}
                        </div>
                        <div className="truncate text-[10px] text-ink-faint">
                          {topic.trackTitle}
                        </div>
                      </div>
                      {added ? (
                        <Check
                          className="size-3.5 shrink-0 text-[color:var(--right)]"
                          aria-hidden
                        />
                      ) : (
                        <Plus className="size-3.5 shrink-0 text-ink" aria-hidden />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="space-y-2 border-t border-line pt-4">
            <div className="text-xs font-medium text-ink">
              Search topics or cppreference pages
            </div>
            <div className="relative">
              <Search
                className="size-3.5 text-ink-faint absolute left-3.5 top-1/2 -translate-y-1/2"
                aria-hidden
              />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search std::span, malloc, coroutines…"
                className="h-9 rounded-full border-line-strong bg-paper pl-9 text-xs text-ink"
              />
            </div>

            {activeSearchResults.length > 0 ? (
              <div className="max-h-52 divide-y divide-line overflow-y-auto rounded-2xl border border-line bg-paper-raised">
                {activeSearchResults.map((res) => (
                  <button
                    key={`${res.kind ?? "ref"}-${res.lang}-${res.path}-${res.name}`}
                    type="button"
                    onClick={() =>
                      res.kind === "topic" && res.slug
                        ? addItem({
                            kind: "topic",
                            slug: res.slug,
                            name: res.name,
                            trackTitle: res.companionShortTitle,
                          })
                        : addItem({
                            kind: "reference",
                            lang: res.lang,
                            path: res.path.split("#")[0],
                            name: res.name,
                          })
                    }
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-sun-wash/50 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-mono text-xs text-ink">
                        {res.name}
                      </div>
                      <div className="truncate font-mono text-[10px] text-ink-faint">
                        {res.urlPath}
                      </div>
                    </div>
                    <Plus className="size-3.5 shrink-0 text-ink" aria-hidden />
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="space-y-2.5 border-t border-line pt-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-ink">
                Included sources ({selectedSources.length})
              </span>
              {selectedSources.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setSelectedSources([])}
                  className="text-ink-faint hover:text-ink cursor-pointer"
                >
                  Clear all
                </button>
              ) : null}
            </div>

            <div className="space-y-2">
              {selectedSources.map((item) => (
                <div
                  key={sourceKey(item)}
                  className="flex items-center justify-between gap-2 rounded-2xl border border-line bg-paper px-3 py-2"
                >
                  <label className="flex min-w-0 items-center gap-2.5 cursor-pointer">
                    <Checkbox
                      checked
                      onCheckedChange={() => toggleItem(item)}
                    />
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium text-ink">
                        {item.name}
                      </div>
                      <div className="truncate font-mono text-[10px] text-ink-faint">
                        {sourceDisplayPath(item)}
                      </div>
                    </div>
                  </label>
                  <button
                    type="button"
                    onClick={() => toggleItem(item)}
                    aria-label={`Remove ${item.name}`}
                    className="p-1 text-ink-faint hover:text-ink cursor-pointer"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-line pt-4">
            <label className="flex items-center justify-between gap-3 text-xs text-ink-body cursor-pointer">
              <span>Include Socratic quiz answers</span>
              <Switch
                checked={includeAnswers}
                onCheckedChange={setIncludeAnswers}
                size="sm"
              />
            </label>
          </div>
        </Window>

        <div className="space-y-2 border-t border-line pt-5 text-xs leading-relaxed text-ink-soft">
          <div className="font-medium text-ink text-sm">
            How to generate an Audio Overview in NotebookLM
          </div>
          <ol className="list-decimal space-y-1.5 pl-4">
            <li>
              Assemble 2–5 closely focused study topics or reference pages (or
              choose a curated pack above).
            </li>
            <li>
              Download the combined{" "}
              <span className="font-mono text-ink">.md</span> file or copy the{" "}
              <span className="font-mono text-ink">/topics/...</span> and{" "}
              <span className="font-mono text-ink">/w/...</span> URLs once
              deployed.
            </li>
            <li>
              Add it under Sources in NotebookLM and trigger{" "}
              <strong className="font-semibold text-ink">Audio Overview</strong>
              ; the concept maps and Socratic traps guide the hosts.
            </li>
          </ol>
        </div>
      </div>

      <Window
        title={
          loadingMd
            ? "notebooklm-pack.md (compiling…)"
            : "notebooklm-pack.md"
        }
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={handleCopyUrls}
              disabled={selectedSources.length === 0}
              className="cursor-pointer"
            >
              {copiedUrls ? (
                <Check
                  className="size-3.5 text-[color:var(--right)]"
                  aria-hidden
                />
              ) : (
                <Copy className="size-3.5" aria-hidden />
              )}
              <span>{copiedUrls ? "Copied URLs" : "Copy URLs"}</span>
            </Button>

            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={handleCopyMarkdown}
              disabled={!displayedMarkdown}
              className="cursor-pointer"
            >
              {copiedMd ? (
                <Check
                  className="size-3.5 text-[color:var(--right)]"
                  aria-hidden
                />
              ) : (
                <Copy className="size-3.5" aria-hidden />
              )}
              <span>{copiedMd ? "Copied" : "Copy markdown"}</span>
            </Button>

            <Button
              type="button"
              size="xs"
              variant="default"
              onClick={handleDownload}
              disabled={!displayedMarkdown}
              className="cursor-pointer"
            >
              <Download className="size-3.5" aria-hidden />
              <span>Download .md</span>
            </Button>
          </div>
        }
        bodyClassName="p-5 sm:p-6"
      >
        <ScrollArea className="h-[600px] rounded-[var(--radius-panel)] border border-line bg-paper p-5">
          {displayedMarkdown ? (
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-[var(--code-ink)]">
              {displayedMarkdown}
            </pre>
          ) : loadingMd ? (
            <div className="flex h-full items-center justify-center py-20 text-sm text-ink-soft">
              Compiling NotebookLM Markdown from selected sources…
            </div>
          ) : (
            <div className="flex h-full items-center justify-center py-20 text-sm text-ink-soft">
              Select at least one topic or reference page on the left to preview
              its NotebookLM source document.
            </div>
          )}
        </ScrollArea>
      </Window>
    </div>
  );
}
