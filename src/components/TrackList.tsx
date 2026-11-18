import Link from "next/link";
import { TopicStatusBadges } from "@/components/TopicViewActions";
import { TrackProgressCount } from "@/components/TrackProgressCount";
import type { TrackWithTopics } from "@/types/topics";

export function TrackList({
  headingLevel = 2,
  tracks = [],
  showStatusBadges = true,
}: {
  headingLevel?: 2 | 3;
  tracks?: TrackWithTopics[];
  showStatusBadges?: boolean;
}) {
  const resolvedTracks = tracks.filter((track) => track.topics.length > 0);

  if (resolvedTracks.length === 0) {
    return (
      <div className="rounded-[var(--radius-panel)] border border-line bg-paper-raised p-8 text-sm text-ink-soft">
        Study topics are being prepared. Check back shortly or browse the{" "}
        <Link
          href="/w/cpp"
          className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
        >
          full C++ reference
        </Link>
        .
      </div>
    );
  }

  const TrackHeading = headingLevel === 2 ? "h2" : "h3";
  const TopicHeading = headingLevel === 2 ? "h3" : "h4";

  return (
    <div className="space-y-20">
      {resolvedTracks.map((track) => (
        <section
          key={track.id}
          id={track.id}
          aria-labelledby={`track-${track.id}`}
          className="grid scroll-mt-28 gap-6 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:gap-16"
        >
          <div className="lg:sticky lg:top-28 lg:self-start">
            <TrackHeading
              id={`track-${track.id}`}
              className="font-display text-[2rem] leading-tight font-[450] tracking-[-0.025em] text-ink"
            >
              {track.title}
            </TrackHeading>
            <p className="mt-3 max-w-[38ch] leading-relaxed text-ink-soft">
              {track.description}
            </p>
          </div>

          <ol className="border-t border-line">
            {track.topics.map((topic) => (
              <li key={topic.slug} className="border-b border-line">
                <Link
                  href={`/topics/${topic.slug}`}
                  className="group grid gap-x-8 gap-y-2 py-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:py-7"
                >
                  <div className="min-w-0">
                    <TopicHeading className="font-display text-[1.45rem] leading-snug font-[450] tracking-[-0.015em] text-ink decoration-sun decoration-2 underline-offset-[6px] group-hover:underline">
                      {topic.title}
                    </TopicHeading>
                    {topic.summary ? (
                      <p className="mt-1.5 max-w-[62ch] leading-relaxed text-ink-soft">
                        {topic.summary}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-soft sm:flex-col sm:items-end sm:pt-1.5 sm:text-right">
                    <span className="tabular-nums">{topic.minutes} min read</span>
                    <span className="tabular-nums">
                      {topic.questionCount}{" "}
                      {topic.questionCount === 1 ? "question" : "questions"}
                    </span>
                    <TrackProgressCount
                      questionIds={topic.questionIds}
                      className="text-xs"
                    />
                    {showStatusBadges ? (
                      <TopicStatusBadges
                        slug={topic.slug}
                        hasSimulator={Boolean(topic.simulator)}
                        className="sm:justify-end"
                      />
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
