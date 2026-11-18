"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Bookmark,
  Check,
  CheckCircle2,
  ClipboardPaste,
  Copy,
  Download,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { useProgress } from "@/components/ProgressProvider";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Window } from "@/components/Window";
import { cn } from "@/lib/utils";
import type { TopicSummary, TrackWithTopics } from "@/types/topics";

export interface StudyQuizMeta {
  id: string;
  topicTitle: string;
  href: string;
  linkLabel: string;
  standardClause: string;
}

function parseReferenceKey(rawKey: string): {
  lang: "cpp" | "c";
  cleanPath: string;
  href: string;
  label: string;
} {
  if (rawKey.startsWith("c/")) {
    const cleanPath = rawKey.slice(2) || "index";
    const href = cleanPath === "index" ? "/w/c" : `/w/c/${cleanPath}`;
    return { lang: "c", cleanPath, href, label: href };
  }
  const cleanPath = rawKey.startsWith("cpp/")
    ? rawKey.slice(4) || "index"
    : rawKey || "index";
  const href = cleanPath === "index" ? "/w/cpp" : `/w/cpp/${cleanPath}`;
  return { lang: "cpp", cleanPath, href, label: href };
}

export function StudyDeskClient({
  tracks,
  quizMeta,
}: {
  tracks: TrackWithTopics[];
  quizMeta: StudyQuizMeta[];
}) {
  const {
    hydrated,
    answeredQuizzes,
    bookmarkedQuizzes,
    bookmarkedPages,
    reviewedPages,
    completedTopics,
    bookmarkedTopics,
    toggleTopicCompleted,
    toggleTopicBookmark,
    togglePageBookmark,
    togglePageReviewed,
    toggleQuizBookmark,
    exportProgressJson,
    importProgressJson,
    resetProgress,
  } = useProgress();

  const [copyState, setCopyState] = useState<"idle" | "done" | "error">("idle");
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [backupFeedback, setBackupFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeTracks = useMemo(
    () => tracks.filter((tr) => tr.topics.length > 0),
    [tracks]
  );

  const { allTopics, topicBySlug } = useMemo(() => {
    const list = activeTracks.flatMap((tr) => tr.topics);
    return {
      allTopics: list,
      topicBySlug: new Map<string, TopicSummary>(list.map((t) => [t.slug, t])),
    };
  }, [activeTracks]);

  const quizMetaById = useMemo(
    () => new Map(quizMeta.map((q) => [q.id, q])),
    [quizMeta]
  );

  const completedList = useMemo(
    () => (hydrated ? completedTopics : []),
    [hydrated, completedTopics]
  );
  const bookmarkedTopicList = useMemo(
    () => (hydrated ? bookmarkedTopics : []),
    [hydrated, bookmarkedTopics]
  );
  const bookmarkedPageList = useMemo(
    () => (hydrated ? bookmarkedPages : []),
    [hydrated, bookmarkedPages]
  );
  const reviewedPageList = useMemo(
    () => (hydrated ? reviewedPages : []),
    [hydrated, reviewedPages]
  );
  const bookmarkedQuizList = useMemo(
    () => (hydrated ? bookmarkedQuizzes : []),
    [hydrated, bookmarkedQuizzes]
  );

  const completedSet = useMemo(() => new Set(completedList), [completedList]);

  const completedCount = useMemo(
    () => allTopics.filter((t) => completedSet.has(t.slug)).length,
    [allTopics, completedSet]
  );

  const { clearedQuizCount, missedItems, answeredQuizCount } = useMemo(() => {
    if (!hydrated) {
      return {
        clearedQuizCount: 0,
        missedItems: [] as StudyQuizMeta[],
        answeredQuizCount: 0,
      };
    }

    let cleared = 0;
    let answered = 0;
    const missed: StudyQuizMeta[] = [];

    for (const q of quizMeta) {
      const rec = answeredQuizzes[q.id];
      if (!rec) continue;
      answered++;
      if (rec.correct) {
        cleared++;
      } else {
        missed.push(q);
      }
    }

    return {
      clearedQuizCount: cleared,
      missedItems: missed,
      answeredQuizCount: answered,
    };
  }, [hydrated, quizMeta, answeredQuizzes]);

  const savedTotal =
    bookmarkedTopicList.length +
    bookmarkedPageList.length +
    bookmarkedQuizList.length;

  const recommendedTopics = useMemo(() => {
    return allTopics
      .filter(
        (topic) =>
          !completedSet.has(topic.slug) &&
          topic.prerequisites.every(
            (pre) => !topicBySlug.has(pre) || completedSet.has(pre)
          )
      )
      .slice(0, 3);
  }, [allTopics, completedSet, topicBySlug]);

  const topicsPct =
    allTopics.length > 0
      ? Math.round((completedCount / allTopics.length) * 100)
      : 0;
  const quizPct =
    quizMeta.length > 0
      ? Math.round((clearedQuizCount / quizMeta.length) * 100)
      : 0;

  const handleDownloadJson = () => {
    const json = exportProgressJson();
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cpp-atlas-progress.json";
    a.click();
    URL.revokeObjectURL(url);
    setBackupFeedback({
      ok: true,
      message: "Downloaded cpp-atlas-progress.json.",
    });
  };

  const handleCopyJson = async () => {
    try {
      const json = exportProgressJson();
      await navigator.clipboard.writeText(json);
      setCopyState("done");
    } catch {
      setCopyState("error");
    }
    window.setTimeout(() => setCopyState("idle"), 1800);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      const result = importProgressJson(text);
      if (result.ok) {
        setBackupFeedback({
          ok: true,
          message: `Imported progress from ${file.name}.`,
        });
        setConfirmingReset(false);
      } else {
        setBackupFeedback({
          ok: false,
          message: result.error ?? "Unable to import JSON backup.",
        });
      }
    } catch {
      setBackupFeedback({
        ok: false,
        message: "Could not read selected file.",
      });
    }
  };

  const handleImportPaste = () => {
    if (!pasteText.trim()) {
      setBackupFeedback({
        ok: false,
        message: "Paste a JSON backup before importing.",
      });
      return;
    }
    const result = importProgressJson(pasteText);
    if (result.ok) {
      setBackupFeedback({
        ok: true,
        message: "Progress backup imported into this browser.",
      });
      setPasteText("");
      setShowPasteBox(false);
      setConfirmingReset(false);
    } else {
      setBackupFeedback({
        ok: false,
        message: result.error ?? "Unable to import JSON backup.",
      });
    }
  };

  const handleConfirmReset = () => {
    resetProgress();
    setConfirmingReset(false);
    setBackupFeedback({
      ok: true,
      message: "All local study progress has been cleared.",
    });
  };

  return (
    <div className="space-y-16">
      {/* a) Mastery overview */}
      <section aria-labelledby="mastery-heading" className="space-y-8">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2
            id="mastery-heading"
            className="font-display text-2xl font-[450] tracking-[-0.02em] text-ink"
          >
            Mastery overview
          </h2>
          <span className="text-xs text-ink-soft tabular-nums">
            {hydrated
              ? `${answeredQuizCount} of ${quizMeta.length} traps attempted`
              : "Loading browser progress…"}
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-3 rounded-[var(--radius-panel)] border border-line bg-paper-raised p-5">
            <div className="text-xs font-medium text-ink-soft">
              Topics completed
            </div>
            <div className="font-display text-3xl font-[450] tracking-[-0.03em] text-ink tabular-nums">
              {completedCount} / {allTopics.length}
            </div>
            <Progress value={topicsPct} className="h-1.5 bg-paper-sunk" />
          </div>

          <div className="space-y-3 rounded-[var(--radius-panel)] border border-line bg-paper-raised p-5">
            <div className="text-xs font-medium text-ink-soft">
              Standard traps cleared
            </div>
            <div className="font-display text-3xl font-[450] tracking-[-0.03em] text-ink tabular-nums">
              {clearedQuizCount} / {quizMeta.length}
            </div>
            <Progress value={quizPct} className="h-1.5 bg-paper-sunk" />
          </div>

          <div
            className={cn(
              "space-y-2 rounded-[var(--radius-panel)] border p-5",
              missedItems.length > 0
                ? "border-wrong/30 bg-wrong-wash/45"
                : "border-line bg-paper-raised"
            )}
          >
            <div className="text-xs font-medium text-ink-soft">Missed traps</div>
            <div
              className={cn(
                "font-display text-3xl font-[450] tracking-[-0.03em] tabular-nums",
                missedItems.length > 0 ? "text-wrong" : "text-ink"
              )}
            >
              {missedItems.length}
            </div>
            {missedItems.length > 0 ? (
              <Link
                href="/quiz?tab=missed"
                className="inline-flex items-center gap-1 text-xs font-medium text-wrong underline decoration-wrong/40 underline-offset-4 hover:decoration-wrong"
              >
                <span>Drill missed traps</span>
                <ArrowRight className="size-3" aria-hidden />
              </Link>
            ) : (
              <p className="text-xs text-ink-faint">
                No missed questions pending review.
              </p>
            )}
          </div>

          <div className="space-y-2 rounded-[var(--radius-panel)] border border-line bg-paper-raised p-5">
            <div className="text-xs font-medium text-ink-soft">Saved items</div>
            <div className="font-display text-3xl font-[450] tracking-[-0.03em] text-ink tabular-nums">
              {savedTotal}
            </div>
            <p className="text-xs text-ink-faint tabular-nums">
              {bookmarkedTopicList.length} topics, {bookmarkedPageList.length}{" "}
              reference, {bookmarkedQuizList.length} traps
            </p>
          </div>
        </div>

        <div className="space-y-4 rounded-[var(--radius-panel)] border border-line bg-paper-raised p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-display text-xl font-[450] tracking-[-0.015em] text-ink">
              Track progress ({activeTracks.length} tracks)
            </h3>
            <Link
              href="/maps"
              className="text-xs text-ink-soft underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink"
            >
              View dependency graph
            </Link>
          </div>

          <div className="grid gap-x-8 gap-y-4 md:grid-cols-2 lg:grid-cols-3">
            {activeTracks.map((track) => {
              const trackTopicsTotal = track.topics.length;
              const trackTopicsDone = track.topics.filter((t) =>
                completedSet.has(t.slug)
              ).length;
              const trackQuestionIds = track.topics.flatMap(
                (t) => t.questionIds
              );
              const trackCleared = hydrated
                ? trackQuestionIds.filter((id) => answeredQuizzes[id]?.correct)
                    .length
                : 0;
              const trackPct =
                trackTopicsTotal > 0
                  ? Math.round((trackTopicsDone / trackTopicsTotal) * 100)
                  : 0;

              return (
                <div key={track.id} className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <Link
                      href={`/topics#${track.id}`}
                      className="truncate font-medium text-ink underline decoration-transparent underline-offset-3 hover:decoration-sun"
                    >
                      {track.title}
                    </Link>
                    <span className="shrink-0 font-mono text-xs text-ink-soft tabular-nums">
                      {trackTopicsDone}/{trackTopicsTotal}
                    </span>
                  </div>
                  <Progress value={trackPct} className="h-1.5 bg-paper-sunk" />
                  <div className="flex items-center justify-between text-[11px] text-ink-faint tabular-nums">
                    <span>
                      {trackCleared}/{trackQuestionIds.length} traps cleared
                    </span>
                    {trackTopicsDone === trackTopicsTotal &&
                    trackTopicsTotal > 0 ? (
                      <span className="font-medium text-[color:var(--right)]">
                        Done
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* b) Recommended next */}
      <section aria-labelledby="recommended-heading" className="space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2
            id="recommended-heading"
            className="font-display text-2xl font-[450] tracking-[-0.02em] text-ink"
          >
            Recommended next
          </h2>
          <Link
            href="/topics"
            className="text-xs text-ink-soft underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink"
          >
            Explore all topics
          </Link>
        </div>

        {missedItems.length > 0 ? (
          <div className="space-y-4 rounded-[var(--radius-panel)] border border-wrong/35 bg-wrong-wash/45 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-wrong">
                  <AlertCircle className="size-4" aria-hidden />
                  <span>
                    {missedItems.length} missed{" "}
                    {missedItems.length === 1 ? "trap" : "traps"} ready to drill
                  </span>
                </div>
                <p className="text-xs text-ink-body">
                  Re-test questions you missed until the standardese mental
                  model clicks.
                </p>
              </div>
              <Link
                href="/quiz?tab=missed"
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-ink px-4 text-xs font-medium text-paper transition-colors hover:bg-ink/85"
              >
                <span>Open missed queue</span>
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>

            <ul className="grid gap-3 sm:grid-cols-2">
              {missedItems.slice(0, 4).map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="group flex flex-col justify-between gap-2 rounded-xl border border-wrong/20 bg-paper-raised p-3.5 transition-colors hover:border-ink/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-ink decoration-sun decoration-2 underline-offset-3 group-hover:underline">
                        {item.topicTitle}
                      </span>
                      <span className="shrink-0 rounded-[var(--radius-chip)] border border-line bg-paper px-1.5 py-0.5 font-mono text-[10px] text-ink-soft">
                        {item.standardClause}
                      </span>
                    </div>
                    <span className="font-mono text-[11px] text-ink-faint">
                      {item.linkLabel}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {recommendedTopics.length > 0 ? (
          <div
            className={cn(
              "grid gap-4",
              recommendedTopics.length === 1
                ? "max-w-xl"
                : recommendedTopics.length === 2
                  ? "md:grid-cols-2"
                  : "md:grid-cols-3"
            )}
          >
            {recommendedTopics.map((topic) => (
              <div
                key={topic.slug}
                className="flex flex-col justify-between gap-4 rounded-[var(--radius-panel)] border border-[color:var(--sun-deep)]/40 bg-paper-raised p-5"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="rounded-[var(--radius-chip)] bg-sun-wash px-2 py-0.5 font-medium text-ink">
                      Ready now
                    </span>
                    <span className="text-ink-faint tabular-nums">
                      {topic.minutes} min read
                    </span>
                  </div>
                  <h3 className="font-display text-xl leading-snug font-[450] tracking-[-0.015em] text-ink">
                    <Link
                      href={`/topics/${topic.slug}`}
                      className="decoration-sun decoration-2 underline-offset-4 hover:underline"
                    >
                      {topic.title}
                    </Link>
                  </h3>
                  <p className="text-xs font-medium text-ink-soft">
                    {topic.trackTitle}
                  </p>
                  {topic.summary ? (
                    <p className="text-sm leading-relaxed text-ink-soft">
                      {topic.summary}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                  <Link
                    href={`/topics/${topic.slug}`}
                    className="inline-flex h-7 items-center gap-1 rounded-full bg-sun px-3 text-xs font-medium text-ink transition-colors hover:bg-sun/90"
                  >
                    <span>Study topic</span>
                    <ArrowRight className="size-3" aria-hidden />
                  </Link>
                  <button
                    type="button"
                    onClick={() => toggleTopicCompleted(topic.slug)}
                    className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-ink-soft hover:bg-ink/5 hover:text-ink cursor-pointer"
                  >
                    <CheckCircle2 className="size-3.5" aria-hidden />
                    <span>Mark read</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[var(--radius-panel)] border border-[color:var(--right)]/30 bg-right-wash/45 p-6 text-sm text-ink">
            <p className="font-display text-lg font-[450]">
              All {allTopics.length} curriculum topics completed
            </p>
            <p className="mt-1 text-ink-soft">
              Revisit any topic below, drill missed standardese traps in the
              quiz arena, or explore the 1:1 cppreference index.
            </p>
          </div>
        )}
      </section>

      {/* c) Saved & reviewed library */}
      <section aria-labelledby="library-heading" className="space-y-6">
        <h2
          id="library-heading"
          className="font-display text-2xl font-[450] tracking-[-0.02em] text-ink"
        >
          Saved and reviewed library
        </h2>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Saved study topics */}
          <div className="space-y-4 rounded-[var(--radius-panel)] border border-line bg-paper-raised p-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="inline-flex items-center gap-2 font-display text-lg font-[450] text-ink">
                <Bookmark className="size-4 text-ink-soft" aria-hidden />
                <span>Saved study topics ({bookmarkedTopicList.length})</span>
              </h3>
              <Link
                href="/topics"
                className="text-xs text-ink-soft underline decoration-line-strong underline-offset-4 hover:text-ink"
              >
                Browse
              </Link>
            </div>

            {bookmarkedTopicList.length > 0 ? (
              <ul className="divide-y divide-line border-t border-line">
                {bookmarkedTopicList.map((slug) => {
                  const topic = topicBySlug.get(slug);
                  return (
                    <li
                      key={slug}
                      className="flex items-center justify-between gap-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/topics/${slug}`}
                          className="block truncate text-sm font-medium text-ink underline decoration-transparent underline-offset-3 hover:decoration-sun"
                        >
                          {topic?.title ?? slug}
                        </Link>
                        {topic ? (
                          <span className="block truncate text-xs text-ink-faint">
                            {topic.trackTitle}
                          </span>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleTopicBookmark(slug)}
                        aria-label={`Remove ${topic?.title ?? slug} from saved topics`}
                        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs text-ink-soft hover:bg-ink/5 hover:text-ink cursor-pointer"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                        <span>Remove</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="border-t border-line pt-3 text-xs leading-relaxed text-ink-faint">
                No study topics saved yet. Click Save topic inside any topic
                header to pin it here.
              </p>
            )}
          </div>

          {/* Completed study topics */}
          <div className="space-y-4 rounded-[var(--radius-panel)] border border-line bg-paper-raised p-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="inline-flex items-center gap-2 font-display text-lg font-[450] text-ink">
                <CheckCircle2
                  className="size-4 text-[color:var(--right)]"
                  aria-hidden
                />
                <span>Completed topics ({completedList.length})</span>
              </h3>
              <span className="font-mono text-xs text-ink-faint tabular-nums">
                {completedCount}/{allTopics.length}
              </span>
            </div>

            {completedList.length > 0 ? (
              <ul className="divide-y divide-line border-t border-line">
                {completedList.map((slug) => {
                  const topic = topicBySlug.get(slug);
                  return (
                    <li
                      key={slug}
                      className="flex items-center justify-between gap-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/topics/${slug}`}
                          className="block truncate text-sm font-medium text-ink underline decoration-transparent underline-offset-3 hover:decoration-sun"
                        >
                          {topic?.title ?? slug}
                        </Link>
                        {topic ? (
                          <span className="block truncate text-xs text-ink-faint">
                            {topic.trackTitle}
                          </span>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleTopicCompleted(slug)}
                        aria-label={`Mark ${topic?.title ?? slug} as unread`}
                        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs text-ink-soft hover:bg-ink/5 hover:text-ink cursor-pointer"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                        <span>Remove</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="border-t border-line pt-3 text-xs leading-relaxed text-ink-faint">
                No topics marked read yet. Completing topics unlocks dependent
                topics along the curriculum graph.
              </p>
            )}
          </div>

          {/* Bookmarked reference pages */}
          <div className="space-y-4 rounded-[var(--radius-panel)] border border-line bg-paper-raised p-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-lg font-[450] text-ink">
                Bookmarked reference pages ({bookmarkedPageList.length})
              </h3>
              <Link
                href="/w/cpp"
                className="text-xs text-ink-soft underline decoration-line-strong underline-offset-4 hover:text-ink"
              >
                Reference
              </Link>
            </div>

            {bookmarkedPageList.length > 0 ? (
              <ul className="divide-y divide-line border-t border-line">
                {bookmarkedPageList.map((rawKey) => {
                  const parsed = parseReferenceKey(rawKey);
                  return (
                    <li
                      key={rawKey}
                      className="flex items-center justify-between gap-3 py-2.5"
                    >
                      <Link
                        href={parsed.href}
                        className="min-w-0 truncate font-mono text-xs text-ink underline decoration-line-strong underline-offset-3 hover:decoration-ink"
                      >
                        {parsed.label}
                      </Link>
                      <button
                        type="button"
                        onClick={() => togglePageBookmark(rawKey)}
                        aria-label={`Remove ${parsed.label} bookmark`}
                        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs text-ink-soft hover:bg-ink/5 hover:text-ink cursor-pointer"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                        <span>Remove</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="border-t border-line pt-3 text-xs leading-relaxed text-ink-faint">
                Bookmark any C++ or C reference article under /w/cpp or /w/c to
                keep quick specification links here.
              </p>
            )}
          </div>

          {/* Reviewed reference pages */}
          <div className="space-y-4 rounded-[var(--radius-panel)] border border-line bg-paper-raised p-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-lg font-[450] text-ink">
                Reviewed reference pages ({reviewedPageList.length})
              </h3>
              <Link
                href="/w/c"
                className="text-xs text-ink-soft underline decoration-line-strong underline-offset-4 hover:text-ink"
              >
                C index
              </Link>
            </div>

            {reviewedPageList.length > 0 ? (
              <ul className="divide-y divide-line border-t border-line">
                {reviewedPageList.map((rawKey) => {
                  const parsed = parseReferenceKey(rawKey);
                  return (
                    <li
                      key={rawKey}
                      className="flex items-center justify-between gap-3 py-2.5"
                    >
                      <Link
                        href={parsed.href}
                        className="min-w-0 truncate font-mono text-xs text-ink underline decoration-line-strong underline-offset-3 hover:decoration-ink"
                      >
                        {parsed.label}
                      </Link>
                      <button
                        type="button"
                        onClick={() => togglePageReviewed(rawKey)}
                        aria-label={`Remove ${parsed.label} from reviewed pages`}
                        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs text-ink-soft hover:bg-ink/5 hover:text-ink cursor-pointer"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                        <span>Remove</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="border-t border-line pt-3 text-xs leading-relaxed text-ink-faint">
                Reference pages you mark reviewed on /w/cpp or /w/c appear here.
              </p>
            )}
          </div>
        </div>

        {bookmarkedQuizList.length > 0 ? (
          <div className="space-y-3 rounded-[var(--radius-panel)] border border-line bg-paper-raised p-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-lg font-[450] text-ink">
                Saved quiz traps ({bookmarkedQuizList.length})
              </h3>
              <Link
                href="/quiz?tab=saved"
                className="text-xs text-ink-soft underline decoration-line-strong underline-offset-4 hover:text-ink"
              >
                Open saved traps
              </Link>
            </div>
            <ul className="divide-y divide-line border-t border-line">
              {bookmarkedQuizList.map((quizId) => {
                const meta = quizMetaById.get(quizId);
                return (
                  <li
                    key={quizId}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <Link
                        href={meta?.href ?? "/quiz?tab=saved"}
                        className="block truncate text-sm font-medium text-ink underline decoration-transparent underline-offset-3 hover:decoration-sun"
                      >
                        {meta ? meta.topicTitle : quizId}
                      </Link>
                      <span className="block truncate font-mono text-xs text-ink-faint">
                        {meta ? `${quizId} ${meta.standardClause}` : quizId}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleQuizBookmark(quizId)}
                      aria-label={`Remove saved quiz ${quizId}`}
                      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs text-ink-soft hover:bg-ink/5 hover:text-ink cursor-pointer"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                      <span>Remove</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </section>

      {/* d) Portable backup */}
      <section aria-labelledby="backup-heading" className="space-y-4">
        <h2
          id="backup-heading"
          className="font-display text-2xl font-[450] tracking-[-0.02em] text-ink"
        >
          Portable progress backup
        </h2>

        <Window
          title="progress.json"
          actions={
            <span className="font-mono text-xs text-ink-soft tabular-nums">
              {hydrated
                ? `${completedCount} topics, ${answeredQuizCount} answers, ${savedTotal} saved`
                : "localStorage"}
            </span>
          }
          bodyClassName="p-5 sm:p-6 space-y-5"
        >
          <p className="max-w-[65ch] text-sm leading-relaxed text-ink-soft">
            Your progress stays locally inside this browser. Export a JSON
            snapshot to move between machines or restore a previous session.
          </p>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              type="button"
              size="sm"
              variant="default"
              onClick={handleDownloadJson}
              className="cursor-pointer"
            >
              <Download className="size-3.5" aria-hidden />
              <span>Download .json</span>
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleCopyJson}
              className="cursor-pointer"
            >
              {copyState === "done" ? (
                <Check
                  className="size-3.5 text-[color:var(--right)]"
                  aria-hidden
                />
              ) : (
                <Copy className="size-3.5" aria-hidden />
              )}
              <span>
                {copyState === "done"
                  ? "Copied"
                  : copyState === "error"
                    ? "Copy failed"
                    : "Copy JSON"}
              </span>
            </Button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              aria-label="Upload progress backup JSON file"
              className="sr-only"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="cursor-pointer"
            >
              <Upload className="size-3.5" aria-hidden />
              <span>Import JSON file</span>
            </Button>

            <Button
              type="button"
              size="sm"
              variant={showPasteBox ? "secondary" : "ghost"}
              aria-expanded={showPasteBox}
              onClick={() => setShowPasteBox((v) => !v)}
              className="cursor-pointer"
            >
              <ClipboardPaste className="size-3.5" aria-hidden />
              <span>Paste JSON</span>
            </Button>

            {!confirmingReset ? (
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => setConfirmingReset(true)}
                className="ml-auto cursor-pointer"
              >
                <RotateCcw className="size-3.5" aria-hidden />
                <span>Reset progress</span>
              </Button>
            ) : null}
          </div>

          {showPasteBox ? (
            <div className="space-y-3 rounded-[var(--radius-panel)] border border-line bg-paper p-4">
              <label
                htmlFor="progress-json-paste"
                className="block text-xs font-medium text-ink"
              >
                Paste contents of cpp-atlas-progress.json
              </label>
              <Textarea
                id="progress-json-paste"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={5}
                placeholder='{"version": 1, "completedTopics": [...], "answeredQuizzes": {...}}'
                className="bg-paper-raised font-mono text-xs text-ink"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="xs"
                  onClick={handleImportPaste}
                  className="cursor-pointer bg-sun text-ink hover:bg-sun/90"
                >
                  Apply backup
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    setShowPasteBox(false);
                    setPasteText("");
                  }}
                  className="cursor-pointer"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}

          {confirmingReset ? (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-panel)] border border-wrong/30 bg-wrong-wash/60 px-4 py-3 text-sm"
            >
              <p className="font-medium text-wrong">
                Clear all completed topics, quiz history, and bookmarks in this
                browser?
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="xs"
                  onClick={handleConfirmReset}
                  className="cursor-pointer bg-wrong text-white hover:bg-wrong/90"
                >
                  Confirm reset
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => setConfirmingReset(false)}
                  className="cursor-pointer"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}

          {backupFeedback ? (
            <div
              role="status"
              aria-live="polite"
              className={cn(
                "rounded-xl px-3.5 py-2.5 text-xs font-medium",
                backupFeedback.ok
                  ? "bg-right-wash text-[color:var(--right)]"
                  : "bg-wrong-wash text-wrong"
              )}
            >
              {backupFeedback.message}
            </div>
          ) : null}
        </Window>
      </section>
    </div>
  );
}
