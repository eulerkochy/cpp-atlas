import { Suspense } from "react";
import { ScrollFeedClient } from "@/components/scroll/ScrollFeedClient";
import { getScrollSeedBatch } from "@/lib/scroll-corpus";

const SSR_SEED_LIMIT = 48;

function ScrollFeedShellFallback() {
  return (
    <div className="flex h-dvh w-screen items-center justify-center overflow-hidden bg-black">
      <div className="relative flex h-dvh w-full max-w-[calc(100dvh*9/16)] flex-col justify-between overflow-hidden bg-black sm:border-x sm:border-white/10">
        <div className="flex items-center justify-between px-3.5 pt-3.5">
          <span className="text-[15px] leading-none font-extrabold tracking-tight text-white">
            C<span className="text-[#ff4d5a]">++</span> Atlas{" "}
            <span className="font-medium text-white/70">Scroll</span>
          </span>
          <span className="h-6 w-16 animate-pulse rounded-full bg-white/10" />
        </div>
        <div className="px-0 sm:px-2.5">
          <div className="aspect-video w-full animate-pulse bg-white/[0.06] ring-1 ring-white/10 sm:rounded-lg" />
        </div>
        <div className="space-y-2.5 px-3.5 pb-6">
          <div className="h-4 w-36 animate-pulse rounded-full bg-white/12" />
          <div className="h-5 w-3/4 animate-pulse rounded bg-white/15" />
          <div className="h-3.5 w-5/6 animate-pulse rounded bg-white/10" />
        </div>
      </div>
    </div>
  );
}

export default function ScrollPage() {
  const { cards, meta, total } = getScrollSeedBatch(SSR_SEED_LIMIT);

  return (
    <Suspense fallback={<ScrollFeedShellFallback />}>
      <ScrollFeedClient
        initialCorpus={cards}
        initialMeta={meta}
        totalCorpusCount={meta.totalAvailable ?? total}
      />
    </Suspense>
  );
}
