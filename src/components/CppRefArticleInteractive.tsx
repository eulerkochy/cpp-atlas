"use client";

import { useState } from "react";
import { Bookmark, CheckCircle2 } from "lucide-react";
import { CodeCopyEnhancer } from "@/components/CodeCopyEnhancer";
import { useProgress } from "@/components/ProgressProvider";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { ReferenceLang } from "@/types/cpp";

export function CppRefArticleInteractive({
  lang,
  pagePath,
  bodyHtml,
}: {
  lang: ReferenceLang;
  pagePath: string;
  bodyHtml: string;
}) {
  const [focusMode, setFocusMode] = useState(true);

  const {
    hydrated,
    bookmarkedPages,
    reviewedPages,
    togglePageBookmark,
    togglePageReviewed,
  } = useProgress();

  const deckKey = `${lang}/${pagePath}`;
  const isBookmarked =
    hydrated &&
    (bookmarkedPages.includes(deckKey) || bookmarkedPages.includes(pagePath));
  const isReviewed =
    hydrated &&
    (reviewedPages.includes(deckKey) || reviewedPages.includes(pagePath));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-line py-3">
        <label className="flex items-center gap-2.5 text-sm text-ink-body cursor-pointer select-none">
          <Switch
            checked={focusMode}
            onCheckedChange={setFocusMode}
            size="sm"
          />
          <span>Focus mode (dim pre-C++14 deprecations &amp; defect reports)</span>
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={isBookmarked ? "secondary" : "ghost"}
            size="xs"
            aria-pressed={isBookmarked}
            onClick={() => togglePageBookmark(deckKey)}
            className={cn(isBookmarked && "bg-sun-wash border-ink/20 text-ink")}
          >
            <Bookmark
              aria-hidden
              className="size-3.5"
              fill={isBookmarked ? "currentColor" : "none"}
            />
            <span>{isBookmarked ? "Bookmarked" : "Bookmark"}</span>
          </Button>

          <Button
            type="button"
            variant={isReviewed ? "secondary" : "ghost"}
            size="xs"
            aria-pressed={isReviewed}
            onClick={() => togglePageReviewed(deckKey)}
            className={cn(
              isReviewed &&
                "bg-right-wash border-[color:var(--right)]/30 text-[color:var(--right)]"
            )}
          >
            <CheckCircle2 aria-hidden className="size-3.5" />
            <span>{isReviewed ? "Reviewed" : "Mark reviewed"}</span>
          </Button>
        </div>
      </div>

      <article
        className={cn("cppref", focusMode && "cppref-focus-mode")}
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
      <CodeCopyEnhancer />
    </div>
  );
}
