"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { BookOpen, Layers, Menu, Search } from "lucide-react";
import { openGlobalSearch } from "@/components/CommandPalette";
import { LogoMark } from "@/components/LogoMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useBuildDone } from "@/components/build/StageDone";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export interface RailStageItem {
  number: number;
  slug: string;
  title: string;
}

export interface RailChallengeInfo {
  slug: string;
  title: string;
  standard: string;
  repoUrl: string;
  hasBrowserGrader: boolean;
  stages: RailStageItem[];
}

interface CourseRailBodyProps {
  challenge: RailChallengeInfo;
  activeStageSlug: string | null;
  done: Set<string>;
  hydrated: boolean;
  onNavigate?: () => void;
}

function CourseRailBody({
  challenge,
  activeStageSlug,
  done,
  hydrated,
  onNavigate,
}: CourseRailBodyProps) {
  const total = challenge.stages.length;
  const doneCount = hydrated
    ? challenge.stages.filter((s) => done.has(`${challenge.slug}/${s.slug}`)).length
    : 0;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2.5 border-b border-line px-4 pt-5 pb-4">
        <div className="flex items-center justify-between gap-2 text-xs text-ink-soft">
          <span>
            {challenge.standard} · {challenge.hasBrowserGrader ? "Repo + browser" : "Template repo"}
          </span>
        </div>
        <Link
          href={`/build/${challenge.slug}`}
          onClick={onNavigate}
          className="block font-display text-[1.15rem] leading-snug font-[500] tracking-[-0.02em] text-ink decoration-sun decoration-2 underline-offset-4 hover:underline"
        >
          {challenge.title}
        </Link>
        <div className="space-y-1.5 pt-0.5">
          <div className="flex items-center justify-between text-xs text-ink-soft tabular-nums">
            <span>
              {doneCount} of {total} stages
            </span>
            <span>{pct}%</span>
          </div>
          <div
            role="progressbar"
            aria-label="Challenge completion"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-1.5 w-full overflow-hidden rounded-full bg-line"
          >
            <div
              className="h-full rounded-full bg-[color:var(--right)] transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      <nav aria-label="Course stages" className="flex-1 overflow-y-auto px-2.5 py-3 rad-pane-scroll">
        <ol className="space-y-1">
          {challenge.stages.map((s) => {
            const isActive = activeStageSlug === s.slug;
            const isDone = hydrated && done.has(`${challenge.slug}/${s.slug}`);
            return (
              <li key={s.slug}>
                <Link
                  href={`/build/${challenge.slug}/${s.slug}`}
                  onClick={onNavigate}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "group flex items-start gap-2.5 rounded-xl px-2.5 py-2 text-[0.84rem] leading-snug transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                    isActive
                      ? "border border-line bg-paper-raised font-medium text-ink shadow-[0_1px_3px_rgb(0_0_0/0.06)]"
                      : "border border-transparent text-ink-soft hover:bg-ink/[0.04] hover:text-ink"
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 inline-flex size-5.5 shrink-0 items-center justify-center rounded-full text-[11px] font-medium tabular-nums transition-colors",
                      isDone
                        ? "bg-[color:var(--right)] font-semibold text-paper dark:text-[#07150f]"
                        : isActive
                          ? "border-2 border-ink bg-paper-raised font-semibold text-ink"
                          : "border border-line-strong text-ink-soft group-hover:border-ink/45 group-hover:text-ink"
                    )}
                  >
                    {s.number}
                  </span>
                  <span className="min-w-0 flex-1 pt-0.5">{s.title}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="space-y-2 border-t border-line px-2.5 py-3">
        <Link
          href={`/build/${challenge.slug}`}
          onClick={onNavigate}
          aria-current={activeStageSlug === null ? "page" : undefined}
          className={cn(
            "block rounded-xl border px-3 py-2.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
            activeStageSlug === null
              ? "border-line bg-paper-raised shadow-[0_1px_3px_rgb(0_0_0/0.06)]"
              : "border-transparent hover:bg-ink/[0.04]"
          )}
        >
          <div className="flex items-center gap-2 text-[0.84rem] font-medium text-ink">
            <BookOpen className="size-3.5 text-ink-soft" aria-hidden />
            <span>About this challenge</span>
          </div>
          <p className="mt-0.5 pl-5.5 text-xs text-ink-soft">
            {challenge.slug === "chess"
              ? "Overview, setup, interactive workbench"
              : "Overview, setup, prerequisites"}
          </p>
        </Link>

        <Link
          href="/build"
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs text-ink-soft transition-colors hover:bg-ink/[0.04] hover:text-ink"
        >
          <Layers className="size-3.5" aria-hidden />
          <span>All challenges</span>
        </Link>
      </div>
    </div>
  );
}

export function CourseRailShell({
  challenge,
  activeStageSlug,
  activeLabel,
  wideCenter = false,
  rightRail,
  bottomDock,
  children,
}: {
  challenge: RailChallengeInfo;
  activeStageSlug: string | null;
  activeLabel: string;
  wideCenter?: boolean;
  rightRail: ReactNode;
  bottomDock: ReactNode;
  children: ReactNode;
}) {
  const { done, hydrated } = useBuildDone();
  const [mobileRailOpen, setMobileRailOpen] = useState(false);

  const total = challenge.stages.length;
  const doneCount = hydrated
    ? challenge.stages.filter((s) => done.has(`${challenge.slug}/${s.slug}`)).length
    : 0;

  return (
    <div className="min-h-screen bg-paper text-ink-body">
      <header className="sticky top-0 z-30 flex h-13 items-center justify-between gap-2 border-b border-line bg-paper/95 px-3 backdrop-blur-md sm:gap-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">
          <Sheet open={mobileRailOpen} onOpenChange={setMobileRailOpen}>
            <SheetTrigger
              render={
                <button
                  type="button"
                  aria-label="Open course stages"
                  className="inline-flex h-8.5 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-paper-raised px-2 text-xs font-medium text-ink transition-colors hover:border-line-strong sm:px-2.5 lg:hidden cursor-pointer"
                />
              }
            >
              <Menu className="size-3.5" aria-hidden />
              <span>Stages</span>
            </SheetTrigger>
            <SheetContent side="left" className="w-[290px] border-line bg-paper-sunk p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>{challenge.title}</SheetTitle>
              </SheetHeader>
              <CourseRailBody
                challenge={challenge}
                activeStageSlug={activeStageSlug}
                done={done}
                hydrated={hydrated}
                onNavigate={() => setMobileRailOpen(false)}
              />
            </SheetContent>
          </Sheet>

          <Link
            href="/"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-1 py-1 transition-colors hover:bg-ink/[0.04] sm:gap-2 sm:px-1.5"
          >
            <LogoMark className="size-5.5 shrink-0" />
            <span className="whitespace-nowrap font-display text-[0.92rem] font-medium tracking-[-0.02em] text-ink sm:text-[0.98rem]">
              C++ Atlas
            </span>
          </Link>

          <span className="hidden text-ink-faint sm:inline" aria-hidden>
            /
          </span>

          <span className="hidden truncate text-sm font-medium text-ink sm:inline">
            {activeLabel}
          </span>

          <span className="hidden items-center gap-1.5 rounded-full border border-line bg-paper-sunk px-2.5 py-0.5 text-xs text-ink-soft tabular-nums md:inline-flex">
            <span className="font-semibold text-ink">{doneCount}</span>
            <span>/ {total} stages</span>
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={openGlobalSearch}
            aria-label="Search C++ Atlas"
            className="inline-flex h-8.5 items-center gap-1.5 rounded-full border border-line bg-paper-raised px-2.5 text-xs text-ink-soft transition-colors hover:border-line-strong hover:text-ink cursor-pointer"
          >
            <Search className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">Search</span>
          </button>
          <ThemeToggle />
          <Link
            href="/build"
            className="inline-flex h-8.5 items-center rounded-full border border-line bg-paper-raised px-2.5 text-xs font-medium text-ink transition-colors hover:border-line-strong sm:px-3"
          >
            <span className="sm:hidden">Build</span>
            <span className="hidden sm:inline">All challenges</span>
          </Link>
        </div>
      </header>

      <div
        className={cn(
          "grid min-h-[calc(100vh-3.25rem)] grid-cols-1 lg:grid-cols-[272px_minmax(0,1fr)]",
          wideCenter
            ? "xl:grid-cols-[256px_minmax(0,1fr)_280px] 2xl:grid-cols-[272px_minmax(0,1fr)_312px]"
            : "xl:grid-cols-[272px_minmax(0,1fr)_312px]"
        )}
      >
        <aside className="hidden border-r border-line bg-paper-sunk/75 lg:sticky lg:top-13 lg:block lg:h-[calc(100vh-3.25rem-2.5rem)]">
          <CourseRailBody
            challenge={challenge}
            activeStageSlug={activeStageSlug}
            done={done}
            hydrated={hydrated}
          />
        </aside>

        <div className="min-w-0 bg-paper pb-20">
          <div
            className={cn(
              "mx-auto w-full",
              wideCenter
                ? "max-w-[1040px] px-4 py-7 sm:px-6 lg:px-7"
                : "max-w-[780px] px-5 py-8 sm:px-8 lg:px-10"
            )}
          >
            {children}
          </div>
        </div>

        <aside className="border-t border-line bg-paper px-5 pt-6 pb-20 sm:px-6 xl:sticky xl:top-13 xl:h-[calc(100vh-3.25rem-2.5rem)] xl:overflow-y-auto xl:border-t-0 xl:border-l rad-pane-scroll">
          {rightRail}
        </aside>
      </div>

      {bottomDock}
    </div>
  );
}
