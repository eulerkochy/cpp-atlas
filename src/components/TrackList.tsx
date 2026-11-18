import Link from "next/link";
import { Bookmark } from "lucide-react";
import { TrackProgressCount } from "@/components/TrackProgressCount";
import { cn } from "@/lib/utils";
import type { TopicSummary, TrackWithTopics } from "@/types/topics";

/** The read-state dot shared by index rows and the legend. */
export function ReadDot({
  read,
  className,
}: {
  read: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-2.5 shrink-0 rounded-full border",
        read ? "border-ink bg-sun" : "border-ink-soft bg-transparent",
        className
      )}
    />
  );
}

function TopicIndexRow({
  topic,
  read,
  saved,
}: {
  topic: TopicSummary;
  read: boolean;
  saved: boolean;
}) {
  return (
    <li className="break-inside-avoid">
      <Link
        href={`/topics/${topic.slug}`}
        className="group grid grid-cols-[0.625rem_minmax(0,1fr)] gap-x-2.5 rounded-sm py-1 focus-visible:outline-offset-2"
      >
        <ReadDot read={read} className="mt-[0.45rem]" />
        <span className="min-w-0">
          <span className="flex items-end gap-1.5">
            <span className="min-w-0 font-display text-[1.05rem] leading-[1.3] font-[450] tracking-[-0.01em] text-ink decoration-sun decoration-2 underline-offset-4 group-hover:underline group-focus-visible:underline">
              {topic.title}
              {saved ? (
                <Bookmark
                  aria-hidden
                  className="ml-1.5 inline size-3.5 -translate-y-px fill-current align-baseline text-ink-soft"
                />
              ) : null}
            </span>
            <span
              aria-hidden
              className="mb-[0.4rem] min-w-3 flex-1 border-b border-dotted border-line-strong"
            />
            <span className="shrink-0 pb-px text-xs text-ink-soft tabular-nums">
              {topic.minutes} min
            </span>
          </span>
          {topic.summary ? (
            <span className="block truncate text-[0.8125rem] leading-snug text-ink-soft">
              {topic.summary}
            </span>
          ) : null}
          {read || saved ? (
            <span className="sr-only">
              {[read ? "Read" : null, saved ? "Saved" : null]
                .filter(Boolean)
                .join(", ")}
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

/** Tracks as index sections: a header, then compact rows read down two columns. */
export function TrackList({
  tracks,
  readSlugs,
  savedSlugs,
}: {
  tracks: TrackWithTopics[];
  readSlugs: ReadonlySet<string>;
  savedSlugs: ReadonlySet<string>;
}) {
  return (
    <div className="space-y-9">
      {tracks.map((track) => (
        <section
          key={track.id}
          id={track.id}
          data-track-section
          aria-labelledby={`track-${track.id}`}
          className="scroll-mt-14 lg:scroll-mt-2"
        >
          <header className="border-b border-line pb-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <h2
                id={`track-${track.id}`}
                className="font-display text-[1.5rem] leading-tight font-[450] tracking-[-0.02em] text-ink"
              >
                {track.title}
              </h2>
              <TrackProgressCount
                questionIds={track.topics.flatMap((t) => t.questionIds)}
                className="text-xs"
              />
            </div>
            <p className="mt-0.5 max-w-[80ch] text-sm leading-snug text-ink-soft">
              {track.description}
            </p>
          </header>

          <ul className="mt-1.5 gap-x-7 md:columns-2">
            {track.topics.map((topic) => (
              <TopicIndexRow
                key={topic.slug}
                topic={topic}
                read={readSlugs.has(topic.slug)}
                saved={savedSlugs.has(topic.slug)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
