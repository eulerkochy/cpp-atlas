"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { BookOpen, BugPlay, ListChecks, Network } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const VIEWS = ["read", "map", "debugger", "quiz"] as const;
export type ReferenceView = (typeof VIEWS)[number];
const EVENT = "cppatlas:view";

function isView(v: string | null): v is ReferenceView {
  return !!v && (VIEWS as readonly string[]).includes(v);
}

function readView(): ReferenceView {
  const param = new URLSearchParams(window.location.search).get("view");
  if (param === "simulator") return "debugger";
  if (isView(param)) return param;
  const hash = window.location.hash.slice(1);
  if (hash === "simulator") return "debugger";
  if (hash === "map" || hash === "debugger" || hash === "quiz") return hash;
  return "read";
}

function availableView(hasDebugger: boolean, hasQuiz: boolean): ReferenceView {
  const v = readView();
  if (v === "debugger" && !hasDebugger) return "read";
  if (v === "quiz" && !hasQuiz) return "read";
  return v;
}

function subscribe(cb: () => void) {
  window.addEventListener("popstate", cb);
  window.addEventListener("hashchange", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("popstate", cb);
    window.removeEventListener("hashchange", cb);
    window.removeEventListener(EVENT, cb);
  };
}

export function switchReferenceView(v: ReferenceView, scrollToViews = false) {
  const url = new URL(window.location.href);
  if (v === "read") url.searchParams.delete("view");
  else url.searchParams.set("view", v);
  if (
    url.hash === "#map" ||
    url.hash === "#debugger" ||
    url.hash === "#simulator" ||
    url.hash === "#quiz"
  ) {
    url.hash = "";
  }
  window.history.replaceState(null, "", url);
  window.dispatchEvent(new Event(EVENT));
  if (scrollToViews) {
    document.getElementById("views")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

/**
 * Read / Map / Debugger / Quiz segmented pill bar. All panels remain mounted in SSR HTML
 * (inactive panels hidden via Base UI hidden state) so crawlers and NotebookLM
 * always see the full specification and traps.
 */
export function ReferenceViews({
  read,
  map,
  debug,
  quiz,
  questionCount,
}: {
  read: ReactNode;
  map: ReactNode;
  debug?: ReactNode;
  quiz?: ReactNode;
  questionCount: number;
}) {
  const hasDebugger = debug !== undefined && debug !== null;
  const hasQuiz = quiz !== undefined && quiz !== null;
  const view = useSyncExternalStore(
    subscribe,
    () => availableView(hasDebugger, hasQuiz),
    () => "read" as ReferenceView
  );

  return (
    <Tabs
      value={view}
      onValueChange={(v) =>
        typeof v === "string" && isView(v) && switchReferenceView(v)
      }
      id="views"
      className="scroll-mt-24"
    >
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
        <TabsList aria-label="Choose a view">
          <TabsTrigger value="read" className="cursor-pointer">
            <BookOpen aria-hidden />
            Read
          </TabsTrigger>
          <TabsTrigger value="map" className="cursor-pointer">
            <Network aria-hidden />
            Map
          </TabsTrigger>
          {hasDebugger ? (
            <TabsTrigger value="debugger" className="cursor-pointer">
              <BugPlay aria-hidden />
              Debugger
            </TabsTrigger>
          ) : null}
          {hasQuiz ? (
            <TabsTrigger value="quiz" className="cursor-pointer">
              <ListChecks aria-hidden />
              Quiz
              {questionCount > 0 ? (
                <span className="text-xs text-ink-soft tabular-nums">
                  {questionCount}
                </span>
              ) : null}
            </TabsTrigger>
          ) : null}
        </TabsList>
      </div>

      <TabsContent value="read" keepMounted className="mt-10">
        {read}
      </TabsContent>
      <TabsContent value="map" keepMounted className="mt-10">
        {map}
      </TabsContent>
      {hasDebugger ? (
        <TabsContent value="debugger" keepMounted className="mt-10">
          {debug}
        </TabsContent>
      ) : null}
      {hasQuiz ? (
        <TabsContent value="quiz" keepMounted className="mt-10">
          {quiz}
        </TabsContent>
      ) : null}
    </Tabs>
  );
}
