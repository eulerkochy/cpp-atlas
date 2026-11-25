"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { Menu, Search } from "lucide-react";
import { GoogleIcon, NotebookLmIcon } from "@/components/AiBrandIcons";
import { useGoogleNotebook } from "@/components/GoogleNotebookProvider";
import { LogoMark } from "@/components/LogoMark";
import { SearchShortcutHint } from "@/components/SearchShortcutHint";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useProgress } from "@/components/ProgressProvider";
import { buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { openGlobalSearch } from "./CommandPalette";

const NAV_LINKS = [
  { href: "/topics", label: "Topics" },
  { href: "/maps", label: "Maps" },
  { href: "/quiz", label: "Quiz" },
  { href: "/scroll", label: "Scroll" },
  { href: "/w/cpp", label: "Reference" },
  { href: "/notebook", label: "NotebookLM" },
];

const STUDY_LINK = { href: "/study", label: "Study" };
const STANDARDS_LINK = { href: "/standards", label: "C++11–26" };

const ALL_ACTIVE_CANDIDATES = [...NAV_LINKS, STUDY_LINK, STANDARDS_LINK];

function getActiveNavHref(pathname: string): string | undefined {
  if (pathname === "/") return "/";
  return ALL_ACTIVE_CANDIDATES.find((item) =>
    item.href === "/w/cpp"
      ? pathname === "/w" ||
        pathname.startsWith("/w/") ||
        pathname === "/explore" ||
        pathname.startsWith("/explore/")
      : pathname === item.href || pathname.startsWith(`${item.href}/`)
  )?.href;
}

function NavLinksStatic({
  active,
  studyCount = 0,
}: {
  active?: string;
  studyCount?: number;
}) {
  const studyActive = active === STUDY_LINK.href;

  return (
    <>
      {NAV_LINKS.map((item) => {
        const isActive = active === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[0.9rem] whitespace-nowrap transition-colors md:px-3.5",
              isActive
                ? "bg-sun text-ink font-medium"
                : "text-ink-soft hover:bg-ink/5 hover:text-ink"
            )}
          >
            {item.href === "/notebook" ? (
              <NotebookLmIcon className="size-3.5" />
            ) : null}
            <span>{item.label}</span>
          </Link>
        );
      })}
      <Link
        href={STUDY_LINK.href}
        aria-current={studyActive ? "page" : undefined}
        className={cn(
          "hidden h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[0.9rem] whitespace-nowrap transition-colors lg:inline-flex",
          studyActive
            ? "bg-sun text-ink font-medium"
            : "text-ink-soft hover:bg-ink/5 hover:text-ink"
        )}
      >
        <span>{STUDY_LINK.label}</span>
        {studyCount > 0 ? (
          <span
            aria-label={`${studyCount} saved or completed`}
            className={cn(
              "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium tabular-nums",
              studyActive ? "bg-paper-raised/85 text-ink" : "bg-sun-wash text-ink"
            )}
          >
            {studyCount}
          </span>
        ) : null}
      </Link>
    </>
  );
}

function NavLinks() {
  const pathname = usePathname();
  const { hydrated, completedTopics, bookmarkedTopics, bookmarkedPages } =
    useProgress();
  const studyCount = hydrated
    ? completedTopics.length + bookmarkedTopics.length + bookmarkedPages.length
    : 0;
  return (
    <NavLinksStatic
      active={getActiveNavHref(pathname)}
      studyCount={studyCount}
    />
  );
}

const MOBILE_NAV_LINKS = [
  { href: "/", label: "Home" },
  ...NAV_LINKS,
  STUDY_LINK,
  STANDARDS_LINK,
];

function NavGoogleAuth() {
  const { loading, configured, connected, user, signIn } = useGoogleNotebook();
  if (loading || !configured) return null;

  if (connected && user) {
    const firstName = user.name.split(/\s+/)[0] || user.email.split("@")[0];
    return (
      <Link
        href="/notebook"
        title={`NotebookLM connected as ${user.email}`}
        className="hidden h-9 shrink-0 items-center gap-1.5 rounded-full border border-line bg-paper-raised px-2.5 text-xs font-medium text-ink transition-colors hover:border-line-strong lg:inline-flex"
      >
        <span className="inline-flex size-5 items-center justify-center rounded-full bg-sun-wash text-[11px] font-semibold text-ink">
          {(user.name[0] || user.email[0] || "G").toUpperCase()}
        </span>
        <span className="max-w-[5.5rem] truncate">{firstName}</span>
        <span
          aria-hidden
          className="size-1.5 rounded-full bg-[color:var(--right)]"
        />
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => signIn()}
      title="Sign in with Google to connect NotebookLM"
      className="hidden h-9 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink cursor-pointer lg:inline-flex"
    >
      <GoogleIcon className="size-3.5" />
      <span>Sign in</span>
    </button>
  );
}

function MobileGoogleAuth() {
  const { loading, configured, connected, user, signIn, signOut } =
    useGoogleNotebook();
  if (loading || !configured) return null;

  if (connected && user) {
    return (
      <div className="mt-2 space-y-2 border-t border-line pt-3 text-xs">
        <div className="px-2">
          <div className="font-medium text-ink truncate">{user.name}</div>
          <div className="text-[11px] text-ink-faint truncate">{user.email}</div>
        </div>
        <SheetClose
          render={
            <button
              type="button"
              onClick={() => void signOut()}
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "w-full justify-start rounded-full text-ink-soft cursor-pointer"
              )}
            />
          }
        >
          Disconnect Google NotebookLM
        </SheetClose>
      </div>
    );
  }

  return (
    <div className="mt-2 border-t border-line pt-3">
      <SheetClose
        render={
          <button
            type="button"
            onClick={() => signIn()}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "w-full justify-start gap-2 rounded-full cursor-pointer"
            )}
          />
        }
      >
        <GoogleIcon className="size-3.5" />
        <span>Sign in with Google</span>
      </SheetClose>
    </div>
  );
}

function MobileSheetLinksStatic({ active }: { active?: string }) {
  return (
    <>
      {MOBILE_NAV_LINKS.map((item) => {
        const isActive = active === item.href;
        return (
          <SheetClose
            key={item.href}
            render={
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  buttonVariants({ variant: "ghost" }),
                  "justify-start gap-2 rounded-full",
                  isActive && "bg-sun text-ink font-medium hover:bg-sun"
                )}
              />
            }
          >
            {item.href === "/notebook" ? (
              <NotebookLmIcon className="size-4" />
            ) : null}
            <span>{item.label}</span>
          </SheetClose>
        );
      })}
    </>
  );
}

function MobileSheetLinks() {
  const pathname = usePathname();
  return <MobileSheetLinksStatic active={getActiveNavHref(pathname)} />;
}

/** The floating pill, centred at the top. */
export function Navbar() {
  return (
    <header className="pointer-events-none fixed inset-x-0 top-3 z-40 flex justify-center px-4 sm:top-4">
      <nav
        aria-label="Main"
        className="pointer-events-auto flex h-12 items-center gap-0.5 rounded-full border border-line bg-[var(--nav-glass)] pr-1.5 pl-1.5 shadow-[0_6px_24px_-12px_rgb(0_0_0/0.25)] backdrop-blur-xl backdrop-saturate-150"
      >
        <Link
          href="/"
          className="mr-1 inline-flex h-9 items-center gap-2 rounded-full pr-3 pl-1.5 transition-colors hover:bg-ink/5"
        >
          <LogoMark className="size-6 shrink-0" />
          <span className="font-display text-[1.05rem] font-medium tracking-[-0.02em] text-ink whitespace-nowrap">
            C++ Atlas
          </span>
        </Link>

        <div className="hidden items-center gap-0.5 sm:flex">
          <Suspense fallback={<NavLinksStatic />}>
            <NavLinks />
          </Suspense>
          <span className="mx-1 h-5 w-px bg-line" aria-hidden />
          <button
            type="button"
            onClick={openGlobalSearch}
            aria-keyshortcuts="Meta+K Control+K Slash"
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3 text-sm whitespace-nowrap text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink cursor-pointer"
          >
            <Search className="size-4" aria-hidden />
            <span>Search</span>
            <SearchShortcutHint className="rounded-md border border-line bg-paper px-1.5 font-sans text-[11px] text-ink-faint" />
          </button>
          <NavGoogleAuth />
          <ThemeToggle />
        </div>

        <div className="flex items-center sm:hidden">
          <button
            type="button"
            onClick={openGlobalSearch}
            aria-label="Search C++ and C reference"
            aria-keyshortcuts="Meta+K Control+K"
            className="inline-flex size-9 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink cursor-pointer"
          >
            <Search className="size-4" aria-hidden />
          </button>
          <ThemeToggle />
          <Sheet>
            <SheetTrigger
              render={
                <button
                  type="button"
                  aria-label="Open menu"
                  className="inline-flex size-9 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink cursor-pointer"
                />
              }
            >
              <Menu className="size-4" aria-hidden />
            </SheetTrigger>
            <SheetContent side="right" className="w-72 border-line bg-paper">
              <SheetHeader>
                <SheetTitle className="font-display text-lg font-medium text-ink">
                  C++ Atlas
                </SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-1.5 px-4 pt-2">
                <Suspense fallback={<MobileSheetLinksStatic />}>
                  <MobileSheetLinks />
                </Suspense>
                <MobileGoogleAuth />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  );
}
