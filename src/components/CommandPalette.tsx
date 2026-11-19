"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  BookmarkCheck,
  Compass,
  Cpu,
  FileText,
  History,
  Map as MapIcon,
  MapPin,
  Sparkles,
} from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import type {
  TopicSearchResult,
  UnifiedSearchResultItem,
} from "@/types/topics";

export function openGlobalSearch() {
  window.dispatchEvent(new CustomEvent("cppatlas-open-search"));
}

function topicSlugFromUrlPath(urlPath: string): string | null {
  if (!urlPath.startsWith("/topics/")) return null;
  const slug = urlPath.slice("/topics/".length).split(/[?#]/)[0];
  return slug || null;
}

function LocateOnMapButton({
  slug,
  onLocate,
}: {
  slug: string;
  onLocate: (href: string) => void;
}) {
  return (
    <button
      type="button"
      aria-label="Locate on world map"
      title="Locate on world map"
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.stopPropagation();
        }
      }}
      onClick={(e) => {
        e.stopPropagation();
        onLocate(`/maps?topic=${encodeURIComponent(slug)}`);
      }}
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-chip)] border border-line bg-paper text-ink-soft transition-colors hover:border-line-strong hover:bg-sun-wash hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink cursor-pointer"
    >
      <MapPin className="size-3.5" aria-hidden />
    </button>
  );
}

function TopicCommandItem({
  value,
  title,
  urlPath,
  badge,
  badgeClassName,
  showIcon,
  onNavigate,
}: {
  value: string;
  title: string;
  urlPath: string;
  badge: string;
  badgeClassName: string;
  showIcon?: boolean;
  onNavigate: (href: string) => void;
}) {
  const topicSlug = topicSlugFromUrlPath(urlPath);
  return (
    <CommandItem
      value={value}
      onSelect={() => onNavigate(urlPath)}
      className="flex items-center justify-between gap-2 py-2.5 cursor-pointer"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {showIcon ? <Cpu className="size-4 shrink-0 text-ink-soft" /> : null}
        <div className="min-w-0 truncate">
          <div className="truncate text-sm font-medium text-ink">{title}</div>
          <div className="truncate font-mono text-[11px] text-ink-faint">
            {urlPath}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span
          className={`shrink-0 rounded-[var(--radius-chip)] bg-sun-wash px-2 py-0.5 font-medium text-ink ${badgeClassName}`}
        >
          {badge}
        </span>
        {topicSlug ? (
          <LocateOnMapButton slug={topicSlug} onLocate={onNavigate} />
        ) : null}
      </div>
    </CommandItem>
  );
}

const FLAGSHIP_LINKS = [
  {
    name: "Value categories (lvalue, xvalue, prvalue)",
    urlPath: "/topics/value-categories",
    note: "Study topic",
  },
  {
    name: "Atomics and memory ordering",
    urlPath: "/topics/atomics-and-memory-ordering",
    note: "Study topic",
  },
  {
    name: "Object lifetime and storage",
    urlPath: "/topics/object-lifetime-and-storage",
    note: "Study topic",
  },
  {
    name: "Forwarding references and perfect forwarding",
    urlPath: "/topics/forwarding-references-and-perfect-forwarding",
    note: "Study topic",
  },
  {
    name: "SFINAE and concepts",
    urlPath: "/topics/sfinae-and-concepts",
    note: "Study topic",
  },
  {
    name: "std::memory_order (cppreference)",
    urlPath: "/w/cpp/atomic/memory_order",
    note: "Reference",
  },
];

export function CommandPalette({ referencePages }: { referencePages: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UnifiedSearchResultItem[]>([]);
  const [topics, setTopics] = useState<TopicSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
        return;
      }
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          Boolean(target?.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        setOpen(true);
      }
    };
    const onCustomOpen = () => setOpen(true);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("cppatlas-open-search", onCustomOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("cppatlas-open-search", onCustomOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(query)}&limit=35`
        );
        if (res.ok && !cancelled) {
          const data = (await res.json()) as {
            topics?: TopicSearchResult[];
            results: UnifiedSearchResultItem[];
          };
          setTopics(data.topics ?? []);
          setResults(data.results ?? []);
        }
      } catch {
        // Ignore network errors during typing
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 90);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open]);

  const navigateTo = (href: string) => {
    setOpen(false);
    setQuery("");
    if (
      typeof window !== "undefined" &&
      window.location.pathname === "/maps" &&
      href.startsWith("/maps?")
    ) {
      window.history.pushState(null, "", href);
      window.dispatchEvent(new Event("cppatlas:atlas-url"));
      return;
    }
    router.push(href);
  };

  const standardResults = results.filter((item) => item.kind === "standard");
  const refResults = results.filter(
    (item) => item.kind !== "topic" && item.kind !== "standard"
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Search topics & cppreference"
      description={`Search all study topics, concept maps, and ${referencePages.toLocaleString("en-US")} C++ and C reference pages.`}
      className="sm:max-w-xl rounded-[var(--radius-window)] border border-line bg-paper-raised text-ink-body shadow-window"
    >
      <Command shouldFilter={false}>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search topics, std::vector, malloc, memory_order, [basic.lval]…"
        />
        <CommandList className="max-h-96">
          <CommandEmpty>
            {loading
              ? `Searching topics and ${referencePages.toLocaleString("en-US")} reference pages…`
              : "Nothing matches. Try a topic like “coroutines” or symbol like “shared_ptr”."}
          </CommandEmpty>

          {query.trim() === "" && (
            <>
              <CommandGroup heading="Study topics">
                {(topics.length > 0
                  ? topics.map((t) => ({
                      name: t.title,
                      urlPath: t.urlPath,
                      note: t.trackTitle,
                    }))
                  : FLAGSHIP_LINKS
                ).map((item) => (
                  <TopicCommandItem
                    key={item.urlPath}
                    value={item.urlPath}
                    title={item.name}
                    urlPath={item.urlPath}
                    badge={item.note}
                    badgeClassName="text-[11px]"
                    showIcon
                    onNavigate={navigateTo}
                  />
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Workspaces">
                <CommandItem
                  value="world-atlas concept-maps"
                  onSelect={() => navigateTo("/maps")}
                  className="py-2 cursor-pointer"
                >
                  <MapIcon className="size-4 text-ink-soft" />
                  <span>Open the World Atlas &amp; concept maps</span>
                </CommandItem>
                <CommandItem
                  value="study-desk"
                  onSelect={() => navigateTo("/study")}
                  className="py-2 cursor-pointer"
                >
                  <BookmarkCheck className="size-4 text-ink-soft" />
                  <span>Open your study desk</span>
                </CommandItem>
                <CommandItem
                  value="standards-evolution"
                  onSelect={() => navigateTo("/standards")}
                  className="py-2 cursor-pointer"
                >
                  <History className="size-4 text-ink-soft" />
                  <span>Browse C++11–C++26 evolution</span>
                </CommandItem>
                <CommandItem
                  value="topics-index"
                  onSelect={() => navigateTo("/topics")}
                  className="py-2 cursor-pointer"
                >
                  <Compass className="size-4 text-ink-soft" />
                  <span>Browse all study topics</span>
                </CommandItem>
                <CommandItem
                  value="explore-directory"
                  onSelect={() => navigateTo("/explore")}
                  className="py-2 cursor-pointer"
                >
                  <BookOpen className="size-4 text-ink-soft" />
                  <span>Browse all 46 reference domains</span>
                </CommandItem>
                <CommandItem
                  value="quiz-arena"
                  onSelect={() => navigateTo("/quiz")}
                  className="py-2 cursor-pointer"
                >
                  <Sparkles className="size-4 text-ink-soft" />
                  <span>Open Standardese quiz arena</span>
                </CommandItem>
                <CommandItem
                  value="notebook-studio audio gemini markdown"
                  onSelect={() => navigateTo("/notebook")}
                  className="py-2 cursor-pointer"
                >
                  <FileText className="size-4 text-ink-soft" />
                  <span>Open NotebookLM &amp; Gemini Studio</span>
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
            </>
          )}

          {query.trim() !== "" && topics.length > 0 && (
            <>
              <CommandGroup heading={`Study topics (${topics.length})`}>
                {topics.map((topic) => (
                  <TopicCommandItem
                    key={`topic-${topic.slug}`}
                    value={`topic ${topic.title} ${topic.slug}`}
                    title={topic.title}
                    urlPath={topic.urlPath}
                    badge={topic.trackTitle}
                    badgeClassName="text-[10px]"
                    onNavigate={navigateTo}
                  />
                ))}
              </CommandGroup>
              <CommandSeparator />
            </>
          )}

          {query.trim() !== "" && standardResults.length > 0 && (
            <>
              <CommandGroup heading={`Standard revisions (${standardResults.length})`}>
                {standardResults.map((item) => (
                  <CommandItem
                    key={`standard-${item.path}`}
                    value={`standard ${item.name} ${item.path} ${item.companionShortTitle ?? ""}`}
                    onSelect={() => navigateTo(item.urlPath)}
                    className="flex items-center justify-between gap-2 py-2.5 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-ink truncate">
                        {item.name}
                      </div>
                      <div className="font-mono text-[11px] text-ink-faint truncate">
                        {item.urlPath}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.companionShortTitle ? (
                        <span className="rounded-[var(--radius-chip)] bg-sun-wash px-2 py-0.5 font-mono text-[10px] font-medium text-ink">
                          {item.companionShortTitle}
                        </span>
                      ) : null}
                      <span className="rounded-[var(--radius-chip)] border border-line bg-paper px-1.5 py-0.5 text-[10px] text-ink-soft">
                        {item.type}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
              {refResults.length > 0 ? <CommandSeparator /> : null}
            </>
          )}

          {refResults.length > 0 && (
            <CommandGroup
              heading={
                query.trim()
                  ? `Reference matches (${refResults.length})`
                  : "Featured index entries"
              }
            >
              {refResults.map((item) => (
                <CommandItem
                  key={`${item.lang}-${item.path}-${item.name}`}
                  value={`${item.lang} ${item.name} ${item.path}`}
                  onSelect={() => navigateTo(item.urlPath)}
                  className="flex items-center justify-between gap-2 py-2 cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="font-mono text-xs font-medium text-ink truncate">
                      {item.name}
                    </div>
                    <div className="font-mono text-[11px] text-ink-faint truncate">
                      {item.urlPath}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.hasCompanion && (
                      <span className="rounded-[var(--radius-chip)] bg-sun-wash px-2 py-0.5 text-[10px] font-medium text-ink">
                        Study track
                      </span>
                    )}
                    {item.lang === "c" && (
                      <span className="rounded-[var(--radius-chip)] border border-line bg-paper-sunk px-1.5 py-0.5 font-mono text-[10px] text-ink-soft">
                        C
                      </span>
                    )}
                    <span className="rounded-[var(--radius-chip)] border border-line bg-paper px-1.5 py-0.5 text-[10px] text-ink-soft">
                      {item.type}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
