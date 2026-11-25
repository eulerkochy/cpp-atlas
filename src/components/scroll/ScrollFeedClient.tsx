"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ChevronLeft, Flame } from "lucide-react";
import { useProgress } from "@/components/ProgressProvider";
import {
  buildAiHeaders,
  fetchAiStatus,
  useSessionGeminiKey,
  type GeminiKeyPersistence,
} from "@/lib/ai-client";
import {
  buildAdaptiveGenerateRequest,
  getTopAffinities,
  getTrapAccuracyStats,
  rankNextBatch,
  type RankedScrollItem,
} from "@/lib/scroll-ranker";
import {
  createDefaultScrollProfile,
  loadDynamicCards,
  loadScrollProfile,
  recordDwell,
  recordLike,
  recordReadClick,
  recordSave,
  recordTrapAnswer,
  resetScrollWeights,
  saveDynamicCards,
  saveScrollProfile,
  SCROLL_STORAGE_EVENT,
  SCROLL_STORAGE_KEY,
  updateScrollPreferences,
  type ScrollFocusMode,
  type ScrollUserProfile,
} from "@/lib/scroll-storage";
import type {
  ScrollCard,
  ScrollFeedMeta,
  ScrollFeedResponse,
  ScrollGenerateResponse,
  ScrollGenerateTrigger,
} from "@/lib/scroll-types";
import { SITE } from "@/lib/site";
import { cn } from "@/lib/utils";
import { ScrollOverlayDrawer } from "./ScrollOverlayDrawer";
import { ScrollSlide } from "./ScrollSlide";

export interface ScrollFeedClientProps {
  initialCorpus: ScrollCard[];
  initialMeta: ScrollFeedMeta;
  totalCorpusCount?: number;
}

interface QueuedScrollSlide extends RankedScrollItem {
  slideKey: string;
}

interface HomeTarget {
  href: string;
  isExternal: boolean;
}

const INITIAL_BATCH_SIZE = 14;
const APPEND_BATCH_SIZE = 12;
const APPEND_THRESHOLD = 4;
const DEEP_DWELL_MS = 6000;
const OFFLINE_UNSEEN_FLOOR = 35;
const OFFLINE_ALL_BATCH_LIMIT = 60;
const OFFLINE_REF_BATCH_LIMIT = 30;

const AI_REMEDIATE_COOLDOWN_MS = 8_000;
const AI_DEEP_DIVE_COOLDOWN_MS = 25_000;
const AI_DEEP_DIVE_LIKE_STRIDE = 3;
const AI_EXPLORE_SLIDE_STRIDE = 6;
const AI_EXPLORE_COOLDOWN_MS = 20_000;
const AI_ERROR_BACKOFF_MS = 30_000;

const MODE_LABELS: Record<ScrollFocusMode, string> = {
  "for-you": "For You",
  visuals: "Visuals",
  traps: "Traps",
  reviews: "Reviews",
};

const SERVER_PROFILE_SNAPSHOT = createDefaultScrollProfile(0);
const SERVER_HOME_TARGET: HomeTarget = { href: "/", isExternal: false };

const emptySubscribe = () => () => {};

let cachedProfileRaw: string | null | undefined;
let cachedProfileSnapshot: ScrollUserProfile = SERVER_PROFILE_SNAPSHOT;

function getClientProfileSnapshot(): ScrollUserProfile {
  try {
    const raw = window.localStorage.getItem(SCROLL_STORAGE_KEY);
    if (raw === cachedProfileRaw) {
      return cachedProfileSnapshot;
    }
    cachedProfileRaw = raw;
    cachedProfileSnapshot = loadScrollProfile();
    return cachedProfileSnapshot;
  } catch {
    return SERVER_PROFILE_SNAPSHOT;
  }
}

function getServerProfileSnapshot(): ScrollUserProfile {
  return SERVER_PROFILE_SNAPSHOT;
}

function subscribeScrollProfile(callback: () => void): () => void {
  const onUpdate = () => {
    cachedProfileRaw = undefined;
    callback();
  };
  window.addEventListener("storage", onUpdate);
  window.addEventListener(SCROLL_STORAGE_EVENT, onUpdate);
  return () => {
    window.removeEventListener("storage", onUpdate);
    window.removeEventListener(SCROLL_STORAGE_EVENT, onUpdate);
  };
}

let cachedHomeHost: string | undefined;
let cachedHomeTarget: HomeTarget = SERVER_HOME_TARGET;

function getClientHomeTarget(): HomeTarget {
  const hostKey = `${window.location.protocol}//${window.location.host}`;
  if (hostKey === cachedHomeHost) return cachedHomeTarget;
  cachedHomeHost = hostKey;
  const hostname = window.location.hostname.toLowerCase();
  if (hostname.startsWith("scroll.")) {
    if (hostname === "scroll.localhost") {
      const port = window.location.port ? `:${window.location.port}` : "";
      cachedHomeTarget = {
        href: `${window.location.protocol}//localhost${port}/`,
        isExternal: true,
      };
    } else {
      cachedHomeTarget = {
        href: SITE.url,
        isExternal: true,
      };
    }
  } else {
    cachedHomeTarget = SERVER_HOME_TARGET;
  }
  return cachedHomeTarget;
}

function getServerHomeTarget(): HomeTarget {
  return SERVER_HOME_TARGET;
}

function mergeCorpus(existing: ScrollCard[], incoming: ScrollCard[]): ScrollCard[] {
  if (incoming.length === 0) return existing;
  const byId = new Map<string, ScrollCard>();
  for (const card of existing) {
    byId.set(card.id, card);
  }
  for (const card of incoming) {
    byId.set(card.id, card);
  }
  return Array.from(byId.values());
}

function matchesFocusMode(card: ScrollCard, mode: ScrollFocusMode): boolean {
  if (mode === "traps") return card.kind === "trap";
  if (mode === "visuals") return card.kind !== "trap";
  return true;
}

function copyTextFallback(text: string): boolean {
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function ScrollFeedClient({
  initialCorpus,
  initialMeta,
}: ScrollFeedClientProps) {
  const searchParams = useSearchParams();
  const pinnedCardParam = searchParams.get("card")?.trim() || undefined;

  const {
    completedTopics,
    bookmarkedTopics,
    bookmarkedPages,
    toggleTopicBookmark,
    recordQuizAnswer,
  } = useProgress();

  const completedTopicSlugs = useMemo(
    () => new Set(completedTopics),
    [completedTopics]
  );
  const bookmarkedSlugs = useMemo(
    () => new Set([...bookmarkedTopics, ...bookmarkedPages]),
    [bookmarkedTopics, bookmarkedPages]
  );

  // SSR-safe localStorage profile & browser host via useSyncExternalStore
  const profile = useSyncExternalStore(
    subscribeScrollProfile,
    getClientProfileSnapshot,
    getServerProfileSnapshot
  );
  const hydrated = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  const homeTarget = useSyncExternalStore(
    emptySubscribe,
    getClientHomeTarget,
    getServerHomeTarget
  );

  // Visitor Gemini BYOK state shared across C++ Atlas
  const {
    key: sessionGeminiKey,
    persistence: geminiKeyPersistence,
    setKey: saveGeminiKeyRaw,
    clearKey: clearGeminiKeyRaw,
  } = useSessionGeminiKey();

  const [corpus, setCorpus] = useState<ScrollCard[]>(initialCorpus);
  const [meta, setMeta] = useState<ScrollFeedMeta>(initialMeta);
  const [nowClock, setNowClock] = useState<number>(0);
  const [observerGen, setObserverGen] = useState<number>(0);

  // Adaptive Gemini state
  const [serverAiConfigured, setServerAiConfigured] = useState<boolean | null>(
    null
  );
  const [isGeneratingAi, setIsGeneratingAi] = useState<boolean>(false);
  const [sessionAiCount, setSessionAiCount] = useState<number>(0);
  const [aiStatusNote, setAiStatusNote] = useState<string | null>(null);

  const profileRef = useRef(profile);
  const corpusRef = useRef(corpus);
  const metaRef = useRef(meta);
  const serverAiConfiguredRef = useRef(serverAiConfigured);
  const sessionGeminiKeyRef = useRef(sessionGeminiKey);
  const queueGenRef = useRef(0);
  const seqCounterRef = useRef(0);

  const attachSlideKeys = useCallback(
    (ranked: RankedScrollItem[], gen: number): QueuedScrollSlide[] =>
      ranked.map((item) => {
        seqCounterRef.current += 1;
        return {
          ...item,
          slideKey: `${gen}-${seqCounterRef.current}-${item.card.id}`,
        };
      }),
    []
  );

  const needsPinnedFetch = Boolean(
    pinnedCardParam && !initialCorpus.some((c) => c.id === pinnedCardParam)
  );
  const [resolvingPinned, setResolvingPinned] = useState(needsPinnedFetch);

  const [items, setItems] = useState<QueuedScrollSlide[]>(() => {
    if (needsPinnedFetch || initialCorpus.length === 0) {
      return [];
    }
    const ranked = rankNextBatch({
      corpus: initialCorpus,
      profile: SERVER_PROFILE_SNAPSHOT,
      alreadyQueuedIds: new Set<string>(),
      batchSize: INITIAL_BATCH_SIZE,
      pinnedCardId: pinnedCardParam,
      now: 0,
    });
    return ranked.map((item, idx) => ({
      ...item,
      slideKey: `0-${idx + 1}-${item.card.id}`,
    }));
  });

  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isRotated, setIsRotated] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Per-slide answered trap results so due reviews resurface fresh while visited slides stay graded
  const [sessionTrapResults, setSessionTrapResults] = useState<
    Record<string, { selectedIndex: number; isCorrect: boolean }>
  >({});

  const itemsRef = useRef(items);
  const activeIndexRef = useRef(activeIndex);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollTargetRef = useRef<number | null>(null);
  const pendingScrollTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  // Dwell tracking refs
  const dwellStartRef = useRef<number>(0);
  const dwellCardRef = useRef<ScrollCard | null>(null);

  // Offline multi-pool streaming cursors & guards
  const allPoolCursorRef = useRef<number>(0);
  const allPoolExhaustedRef = useRef<boolean>(false);
  const allPoolInFlightRef = useRef<boolean>(false);

  const refPoolCursorRef = useRef<number>(0);
  const refPoolTrackRef = useRef<string | null>(null);
  const refPoolBroadFallbackRef = useRef<boolean>(false);
  const refPoolExhaustedRef = useRef<boolean>(false);
  const refPoolInFlightRef = useRef<boolean>(false);

  // Adaptive Gemini prefetch cooldowns & guards
  const aiInFlightRef = useRef<boolean>(false);
  const aiAuthBlockedRef = useRef<boolean>(false);
  const lastAiCallAtRef = useRef<number>(0);
  const lastRemediateCardIdRef = useRef<string | null>(null);
  const likesSinceDeepDiveRef = useRef<number>(0);
  const lastLikeAiAtRef = useRef<number>(0);
  const lastExploreSlideRef = useRef<number>(0);
  const pendingPriorityCardsRef = useRef<ScrollCard[]>([]);

  // Keep imperative refs synced outside of render (React 19 strict hooks compliant)
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    corpusRef.current = corpus;
  }, [corpus]);

  useEffect(() => {
    metaRef.current = meta;
  }, [meta]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    serverAiConfiguredRef.current = serverAiConfigured;
  }, [serverAiConfigured]);

  useEffect(() => {
    sessionGeminiKeyRef.current = sessionGeminiKey;
  }, [sessionGeminiKey]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 2000);
  }, []);

  const persistDynamicPool = useCallback(
    (cards: ScrollCard[], activeProfile: ScrollUserProfile) => {
      const dynamicOnly = cards.filter(
        (c) => c.origin !== undefined && c.origin !== "core"
      );
      if (dynamicOnly.length > 0) {
        saveDynamicCards(dynamicOnly, activeProfile);
      }
    },
    []
  );

  const commitProfile = useCallback(
    (updater: (prev: ScrollUserProfile) => ScrollUserProfile) => {
      const current = getClientProfileSnapshot();
      const next = updater(current);
      profileRef.current = next;
      cachedProfileRaw = undefined;
      saveScrollProfile(next);
      setNowClock(Date.now());
      return next;
    },
    []
  );

  // Lock document background/scroll while /scroll is active (cleans up on navigation or Next.js 16 Activity hide)
  useEffect(() => {
    document.documentElement.dataset.scrollActive = "true";
    return () => {
      delete document.documentElement.dataset.scrollActive;
    };
  }, []);

  // Check Gemini server availability once on mount
  useEffect(() => {
    let cancelled = false;
    void fetchAiStatus()
      .then((status) => {
        if (!cancelled) {
          serverAiConfiguredRef.current = status.configured;
          setServerAiConfigured(status.configured);
        }
      })
      .catch(() => {
        if (!cancelled) {
          serverAiConfiguredRef.current = false;
          setServerAiConfigured(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Build fresh queue helper (used on hydration, mode change, pinned card load, weight reset)
  const rebuildQueue = useCallback(
    (options: {
      sourceCorpus: ScrollCard[];
      activeProfile: ScrollUserProfile;
      pinnedCardId?: string;
      resetScroll?: boolean;
    }) => {
      const { sourceCorpus, activeProfile, pinnedCardId, resetScroll } = options;
      if (sourceCorpus.length === 0) return;

      queueGenRef.current += 1;
      const gen = queueGenRef.current;
      seqCounterRef.current = 0;

      const priorityCards = pendingPriorityCardsRef.current;
      pendingPriorityCardsRef.current = [];

      const now = Date.now();
      const ranked = rankNextBatch({
        corpus: sourceCorpus,
        profile: activeProfile,
        alreadyQueuedIds: new Set<string>(),
        batchSize: INITIAL_BATCH_SIZE,
        pinnedCardId,
        completedTopicSlugs,
        bookmarkedSlugs,
        priorityCards: priorityCards.length > 0 ? priorityCards : undefined,
        now,
      });

      const nextSlides = attachSlideKeys(ranked, gen);
      itemsRef.current = nextSlides;
      setObserverGen((v) => v + 1);
      setItems(nextSlides);
      setActiveIndex(0);
      activeIndexRef.current = 0;
      setIsPaused(false);
      setNowClock(now);
      pendingScrollTargetRef.current = null;
      lastExploreSlideRef.current = 0;

      if (resetScroll && scrollerRef.current) {
        scrollerRef.current.scrollTo({ top: 0, behavior: "instant" });
      }
    },
    [attachSlideKeys, bookmarkedSlugs, completedTopicSlugs]
  );

  // Splice newly generated AI priority cards cleanly 2 slides downstream without disturbing active/next slide
  const splicePriorityCardsAhead = useCallback(
    (newCards: ScrollCard[], leadOffset = 2) => {
      if (newCards.length === 0) return;

      const currentItems = itemsRef.current;
      if (currentItems.length === 0) {
        pendingPriorityCardsRef.current = [
          ...newCards,
          ...pendingPriorityCardsRef.current,
        ];
        return;
      }

      const spliceAt = Math.min(
        currentItems.length,
        activeIndexRef.current + Math.max(1, leadOffset)
      );
      const prefix = currentItems.slice(0, spliceAt);
      const alreadyQueuedIds = new Set(prefix.map((item) => item.card.id));
      const tailCards = prefix.slice(-4).map((item) => item.card);
      const targetTailSize = Math.max(
        APPEND_BATCH_SIZE,
        currentItems.length - spliceAt
      );

      const rerankedTail = rankNextBatch({
        corpus: corpusRef.current,
        profile: profileRef.current,
        alreadyQueuedIds,
        tailCards,
        priorityCards: newCards,
        batchSize: targetTailSize,
        completedTopicSlugs,
        bookmarkedSlugs,
        now: Date.now(),
      });

      if (rerankedTail.length === 0) return;

      const keyedTail = attachSlideKeys(rerankedTail, queueGenRef.current);
      const mergedSlides = [...prefix, ...keyedTail];
      itemsRef.current = mergedSlides;
      setItems(mergedSlides);
      setObserverGen((v) => v + 1);
    },
    [attachSlideKeys, bookmarkedSlugs, completedTopicSlugs]
  );

  // Silent background streaming across offline core/simulator/procedural + 5,971+ cppreference pages
  const maybeStreamOfflinePools = useCallback((forceWarmup = false) => {
    const activeProfile = profileRef.current;
    const focusMode = activeProfile.preferences.focusMode;
    const queuedIds = new Set(itemsRef.current.map((item) => item.card.id));
    const unseenMatching = corpusRef.current.filter(
      (card) => !queuedIds.has(card.id) && matchesFocusMode(card, focusMode)
    ).length;

    if (!forceWarmup && unseenMatching >= OFFLINE_UNSEEN_FLOOR) {
      return;
    }

    // Stream 1: Massive offline pool (all 876 traps + simulator + 200+ procedural puzzles + core)
    if (!allPoolExhaustedRef.current && !allPoolInFlightRef.current) {
      allPoolInFlightRef.current = true;
      const cursor = allPoolCursorRef.current;
      const params = new URLSearchParams({
        pool: "all",
        cursor: String(cursor),
        limit: String(OFFLINE_ALL_BATCH_LIMIT),
      });
      if (focusMode === "traps" && cursor === 0 && unseenMatching < 20) {
        // Keep main pool general so switching modes stays rich; trap density in pool=all is >50%!
      }

      void fetch(`/api/scroll/feed?${params.toString()}`)
        .then(async (res) => {
          if (!res.ok) return;
          const data = (await res.json()) as ScrollFeedResponse;
          allPoolCursorRef.current =
            data.nextCursor ?? cursor + data.cards.length;
          if (data.nextCursor === null) {
            allPoolExhaustedRef.current = true;
          }
          if (data.cards.length > 0) {
            const merged = mergeCorpus(corpusRef.current, data.cards);
            corpusRef.current = merged;
            setCorpus(merged);
          }
          if (data.meta) {
            metaRef.current = data.meta;
            setMeta(data.meta);
          }
        })
        .catch(() => {
          // Non-fatal: existing pool stays playable
        })
        .finally(() => {
          allPoolInFlightRef.current = false;
        });
    }

    // Stream 2: On-demand cppreference pool (5,971+ offline reference pages), guided by top track affinity
    if (
      focusMode !== "traps" &&
      !refPoolExhaustedRef.current &&
      !refPoolInFlightRef.current
    ) {
      refPoolInFlightRef.current = true;

      const topTrack = refPoolBroadFallbackRef.current
        ? null
        : (getTopAffinities(activeProfile, metaRef.current, { limit: 1 })
            .topTracks[0]?.trackId ?? null);

      // If the user's top track shifted before we entered broad mode, start fresh on that track
      if (
        !refPoolBroadFallbackRef.current &&
        topTrack &&
        refPoolTrackRef.current !== topTrack
      ) {
        refPoolTrackRef.current = topTrack;
        refPoolCursorRef.current = 0;
      }

      const cursor = refPoolCursorRef.current;
      const params = new URLSearchParams({
        pool: "reference",
        cursor: String(cursor),
        limit: String(OFFLINE_REF_BATCH_LIMIT),
      });
      if (topTrack) {
        params.set("track", topTrack);
      }

      void fetch(`/api/scroll/feed?${params.toString()}`)
        .then(async (res) => {
          if (!res.ok) return;
          const data = (await res.json()) as ScrollFeedResponse;
          if (data.nextCursor === null) {
            if (topTrack && !refPoolBroadFallbackRef.current) {
              // Finished top track's reference pages -> widen seamlessly to all 5,971+ reference pages
              refPoolBroadFallbackRef.current = true;
              refPoolTrackRef.current = null;
              refPoolCursorRef.current = 0;
            } else {
              refPoolExhaustedRef.current = true;
            }
          } else {
            refPoolCursorRef.current = data.nextCursor;
          }

          if (data.cards.length > 0) {
            const merged = mergeCorpus(corpusRef.current, data.cards);
            corpusRef.current = merged;
            setCorpus(merged);
          }
          if (data.meta) {
            metaRef.current = data.meta;
            setMeta(data.meta);
          }
        })
        .catch(() => {
          // Non-fatal
        })
        .finally(() => {
          refPoolInFlightRef.current = false;
        });
    }
  }, []);

  // Silent rolling Adaptive Gemini generator (also powers manual 1-tap generate in drawer)
  const runAdaptiveGenerate = useCallback(
    async (options: {
      trigger: ScrollGenerateTrigger;
      missedCard?: ScrollCard;
      likedCard?: ScrollCard;
      count?: number;
      manual?: boolean;
    }) => {
      const { trigger, missedCard, likedCard, count, manual = false } = options;

      const hasKey =
        serverAiConfiguredRef.current === true ||
        Boolean(sessionGeminiKeyRef.current);
      if (!hasKey) return;
      if (!manual && !profileRef.current.preferences.adaptiveAiEnabled) return;
      if (!manual && aiAuthBlockedRef.current) return;
      if (aiInFlightRef.current) return;

      aiInFlightRef.current = true;
      lastAiCallAtRef.current = Date.now();
      if (manual) {
        setIsGeneratingAi(true);
        setAiStatusNote(null);
      }

      try {
        const recentCards = itemsRef.current
          .slice(
            Math.max(0, activeIndexRef.current - 5),
            activeIndexRef.current + 1
          )
          .map((item) => item.card);

        const body = buildAdaptiveGenerateRequest({
          trigger,
          profile: profileRef.current,
          missedCard,
          likedCard,
          recentCards,
          count,
        });

        const res = await fetch("/api/scroll/generate", {
          method: "POST",
          headers: buildAiHeaders(sessionGeminiKeyRef.current),
          body: JSON.stringify(body),
        });

        if (res.status === 401) {
          aiAuthBlockedRef.current = true;
          if (manual) {
            setAiStatusNote(
              "Gemini API key missing or rejected. Add or update your key above."
            );
          }
          return;
        }

        if (!res.ok) {
          lastAiCallAtRef.current = Date.now() + AI_ERROR_BACKOFF_MS;
          if (manual) {
            setAiStatusNote(
              res.status === 429
                ? "Gemini rate limit reached — offline pool continues seamlessly."
                : "Could not tailor AI cards right now — offline pool continues seamlessly."
            );
          }
          return;
        }

        const data = (await res.json()) as ScrollGenerateResponse;
        const generated = Array.isArray(data.cards) ? data.cards : [];
        if (generated.length === 0) {
          if (manual) {
            setAiStatusNote("No new AI cards returned — try again shortly.");
          }
          return;
        }

        const merged = mergeCorpus(corpusRef.current, generated);
        corpusRef.current = merged;
        setCorpus(merged);
        persistDynamicPool(merged, profileRef.current);
        setSessionAiCount((prev) => prev + generated.length);

        splicePriorityCardsAhead(generated, manual ? 1 : 2);

        if (manual) {
          const sourceHint =
            data.sourceTitles?.length > 0
              ? ` grounded in ${data.sourceTitles[0]}`
              : "";
          setAiStatusNote(
            `Queued ${generated.length} tailored card${generated.length === 1 ? "" : "s"}${sourceHint} right ahead.`
          );
          showToast(
            `${generated.length} tailored AI card${generated.length === 1 ? "" : "s"} queued ahead`
          );
        }
      } catch {
        lastAiCallAtRef.current = Date.now() + AI_ERROR_BACKOFF_MS;
        if (manual) {
          setAiStatusNote(
            "Network issue reaching Gemini — continuing with offline pool."
          );
        }
      } finally {
        aiInFlightRef.current = false;
        if (manual) {
          setIsGeneratingAi(false);
        }
      }
    },
    [persistDynamicPool, showToast, splicePriorityCardsAhead]
  );

  // Hydrate persisted profile + dynamic cards + resolve deep-link ?card=<id> + warm background pools
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      await Promise.resolve();
      if (cancelled) return;

      const loadedProfile = getClientProfileSnapshot();
      profileRef.current = loadedProfile;
      setNowClock(Date.now());

      // Hydrate persisted AI & saved/SR reference cards before initial ranking
      const dynamicCards = loadDynamicCards();
      if (dynamicCards.length > 0) {
        const mergedDynamic = mergeCorpus(corpusRef.current, dynamicCards);
        corpusRef.current = mergedDynamic;
        setCorpus(mergedDynamic);
      }

      const hasPinnedLocally =
        !pinnedCardParam ||
        corpusRef.current.some((card) => card.id === pinnedCardParam);

      if (hasPinnedLocally) {
        setResolvingPinned(false);
        rebuildQueue({
          sourceCorpus: corpusRef.current,
          activeProfile: loadedProfile,
          pinnedCardId: pinnedCardParam,
          resetScroll: true,
        });
      } else {
        setResolvingPinned(true);
        try {
          const res = await fetch(
            `/api/scroll/feed?card=${encodeURIComponent(pinnedCardParam ?? "")}&limit=1`
          );
          if (res.ok && !cancelled) {
            const data = (await res.json()) as ScrollFeedResponse;
            if (!cancelled) {
              const merged = mergeCorpus(corpusRef.current, data.cards);
              corpusRef.current = merged;
              setCorpus(merged);
              if (data.meta) {
                metaRef.current = data.meta;
                setMeta(data.meta);
              }
              const resolvedPinnedId = data.cards[0]?.id ?? pinnedCardParam;
              rebuildQueue({
                sourceCorpus: merged,
                activeProfile: profileRef.current,
                pinnedCardId: resolvedPinnedId,
                resetScroll: true,
              });
            }
          }
        } catch {
          if (!cancelled) {
            rebuildQueue({
              sourceCorpus: corpusRef.current,
              activeProfile: profileRef.current,
              resetScroll: true,
            });
          }
        } finally {
          if (!cancelled) setResolvingPinned(false);
        }
      }

      // Hydrate any saved/SR card IDs not in seed or dynamic cache
      const srAndSavedIds = Array.from(
        new Set([
          ...Object.keys(loadedProfile.srQueue),
          ...loadedProfile.savedIds,
        ])
      ).filter((id) => !corpusRef.current.some((c) => c.id === id));

      if (srAndSavedIds.length > 0 && !cancelled) {
        try {
          const res = await fetch(
            `/api/scroll/feed?ids=${encodeURIComponent(srAndSavedIds.slice(0, 40).join(","))}`
          );
          if (res.ok && !cancelled) {
            const data = (await res.json()) as ScrollFeedResponse;
            if (!cancelled && data.cards.length > 0) {
              const merged = mergeCorpus(corpusRef.current, data.cards);
              corpusRef.current = merged;
              setCorpus(merged);
              if (
                profileRef.current.preferences.focusMode === "reviews" &&
                activeIndexRef.current === 0 &&
                !pinnedCardParam
              ) {
                rebuildQueue({
                  sourceCorpus: merged,
                  activeProfile: profileRef.current,
                  resetScroll: true,
                });
              }
            }
          }
        } catch {
          // Non-fatal
        }
      }

      // Warm up first offline + cppreference batches silently in the background
      if (!cancelled) {
        maybeStreamOfflinePools(true);
      }
    };

    void init();

    return () => {
      cancelled = true;
    };
    // Re-run only when deep-link param changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinnedCardParam]);

  // Periodically refresh nowClock every 30s so in-session 90s SR badges stay live
  useEffect(() => {
    const id = window.setInterval(() => {
      setNowClock(Date.now());
    }, 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Stream more offline & cppreference batches whenever unseen pool runs low + Trigger 3 (explore / escalate)
  useEffect(() => {
    if (!hydrated || resolvingPinned) return;

    maybeStreamOfflinePools(false);

    // Trigger 3: every ~6 slides scrolled, silently prefetch an adaptive Gemini batch
    if (
      activeIndex >= AI_EXPLORE_SLIDE_STRIDE &&
      activeIndex - lastExploreSlideRef.current >= AI_EXPLORE_SLIDE_STRIDE
    ) {
      lastExploreSlideRef.current = activeIndex;
      const now = Date.now();
      if (now - lastAiCallAtRef.current >= AI_EXPLORE_COOLDOWN_MS) {
        const stats = getTrapAccuracyStats(profileRef.current);
        const trigger: ScrollGenerateTrigger =
          stats.attempts >= 3 && stats.accuracy >= 0.75
            ? "escalate"
            : "explore";
        void runAdaptiveGenerate({
          trigger,
          count: trigger === "escalate" ? 2 : 3,
        });
      }
    }
  }, [
    activeIndex,
    hydrated,
    maybeStreamOfflinePools,
    resolvingPinned,
    runAdaptiveGenerate,
  ]);

  // Infinite append when approaching end of queue
  useEffect(() => {
    if (!hydrated || resolvingPinned) return;
    if (items.length === 0 || corpus.length === 0) return;
    if (activeIndex < items.length - APPEND_THRESHOLD) return;

    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      const currentItems = itemsRef.current;
      if (activeIndexRef.current < currentItems.length - APPEND_THRESHOLD) {
        return;
      }

      const alreadyQueuedIds = new Set(
        currentItems.map((item) => item.card.id)
      );
      const upcomingQueuedIds = new Set(
        currentItems
          .slice(activeIndexRef.current + 1)
          .map((item) => item.card.id)
      );
      const tailCards = currentItems.slice(-4).map((item) => item.card);
      const priorityCards = pendingPriorityCardsRef.current;
      pendingPriorityCardsRef.current = [];

      const nextBatch = rankNextBatch({
        corpus: corpusRef.current,
        profile: profileRef.current,
        alreadyQueuedIds,
        upcomingQueuedIds,
        tailCards,
        priorityCards: priorityCards.length > 0 ? priorityCards : undefined,
        batchSize: APPEND_BATCH_SIZE,
        completedTopicSlugs,
        bookmarkedSlugs,
        now: Date.now(),
      });

      if (nextBatch.length === 0) return;

      const keyed = attachSlideKeys(nextBatch, queueGenRef.current);
      setItems((prev) => [...prev, ...keyed]);
    });

    return () => {
      cancelled = true;
    };
  }, [
    activeIndex,
    attachSlideKeys,
    bookmarkedSlugs,
    completedTopicSlugs,
    corpus.length,
    hydrated,
    items.length,
    resolvingPinned,
  ]);

  // Track activeIndex via IntersectionObserver (threshold 0.65)
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (resolvingPinned || !scroller || items.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let bestIndex: number | null = null;
        let bestRatio = 0;

        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.65) {
            const idxAttr = (entry.target as HTMLElement).dataset.slideIndex;
            const parsed = idxAttr !== undefined ? Number(idxAttr) : NaN;
            if (Number.isInteger(parsed) && entry.intersectionRatio > bestRatio) {
              bestRatio = entry.intersectionRatio;
              bestIndex = parsed;
            }
          }
        }

        if (bestIndex !== null && bestIndex !== activeIndexRef.current) {
          activeIndexRef.current = bestIndex;
          setActiveIndex(bestIndex);
          setIsPaused(false);
          if (pendingScrollTargetRef.current === bestIndex) {
            pendingScrollTargetRef.current = null;
          }
        }
      },
      {
        root: scroller,
        threshold: [0.65, 0.85],
      }
    );

    const slides = scroller.querySelectorAll<HTMLElement>("[data-slide-index]");
    slides.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [observerGen, items.length, resolvingPinned]);

  // Dwell tracking: flush elapsed dwell on slide change / unmount / tab hide + live 6s streak pulse
  const flushCurrentDwell = useCallback(() => {
    const prevCard = dwellCardRef.current;
    const startTs = dwellStartRef.current;
    if (!prevCard || startTs <= 0) return;
    const elapsed = Date.now() - startTs;
    dwellStartRef.current = Date.now();
    if (elapsed >= 250) {
      commitProfile((prev) => recordDwell(prev, prevCard, elapsed));
    }
  }, [commitProfile]);

  const activeSlideKey = items[activeIndex]?.slideKey ?? null;

  useEffect(() => {
    if (!hydrated) return;
    const currentItem = itemsRef.current[activeIndex];
    const currentCard = currentItem?.card ?? null;

    if (dwellCardRef.current && dwellCardRef.current.id !== currentCard?.id) {
      flushCurrentDwell();
    }

    dwellCardRef.current = currentCard;
    dwellStartRef.current = currentCard ? Date.now() : 0;

    if (!currentCard) return;

    const engageTimer = window.setTimeout(() => {
      if (
        dwellCardRef.current?.id === currentCard.id &&
        document.visibilityState === "visible"
      ) {
        commitProfile((prev) => recordDwell(prev, currentCard, DEEP_DWELL_MS));
      }
    }, DEEP_DWELL_MS + 150);

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushCurrentDwell();
      } else {
        dwellStartRef.current = Date.now();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearTimeout(engageTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [activeIndex, activeSlideKey, commitProfile, flushCurrentDwell, hydrated]);

  // Flush dwell cleanly when navigating away from /scroll (or Activity hide)
  useEffect(() => {
    return () => {
      flushCurrentDwell();
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
      if (pendingScrollTimerRef.current !== null) {
        window.clearTimeout(pendingScrollTimerRef.current);
      }
    };
  }, [flushCurrentDwell]);

  const scrollToSlide = useCallback((targetIndex: number) => {
    const scroller = scrollerRef.current;
    const total = itemsRef.current.length;
    if (!scroller || total === 0) return;

    const clamped = Math.max(0, Math.min(total - 1, targetIndex));
    pendingScrollTargetRef.current = clamped;

    if (pendingScrollTimerRef.current !== null) {
      window.clearTimeout(pendingScrollTimerRef.current);
    }
    pendingScrollTimerRef.current = window.setTimeout(() => {
      pendingScrollTargetRef.current = null;
    }, 420);

    const targetEl = scroller.querySelector<HTMLElement>(
      `[data-slide-index="${clamped}"]`
    );
    const slideHeight = scroller.clientHeight || window.innerHeight;
    scroller.scrollTo({
      top: targetEl ? targetEl.offsetTop : clamped * slideHeight,
      behavior: "smooth",
    });
  }, []);

  // Card interactions
  const handleLike = useCallback(
    (card: ScrollCard) => {
      const wasLiked = profileRef.current.likedIds.includes(card.id);
      const nextProfile = commitProfile((prev) => recordLike(prev, card));
      persistDynamicPool(corpusRef.current, nextProfile);

      // Trigger 2 (deep-dive): throttled after likes (every 3 likes, min 25s apart)
      if (!wasLiked) {
        likesSinceDeepDiveRef.current += 1;
        const now = Date.now();
        if (
          likesSinceDeepDiveRef.current >= AI_DEEP_DIVE_LIKE_STRIDE &&
          now - lastLikeAiAtRef.current >= AI_DEEP_DIVE_COOLDOWN_MS &&
          now - lastAiCallAtRef.current >= AI_REMEDIATE_COOLDOWN_MS
        ) {
          likesSinceDeepDiveRef.current = 0;
          lastLikeAiAtRef.current = now;
          void runAdaptiveGenerate({
            trigger: "deep-dive",
            likedCard: card,
            count: 2,
          });
        }
      }
    },
    [commitProfile, persistDynamicPool, runAdaptiveGenerate]
  );

  const handleSave = useCallback(
    (card: ScrollCard) => {
      const wasSaved = profileRef.current.savedIds.includes(card.id);
      const nextProfile = commitProfile((prev) => recordSave(prev, card));
      persistDynamicPool(corpusRef.current, nextProfile);

      if (card.topicSlug) {
        const isTopicBookmarked = bookmarkedTopics.includes(card.topicSlug);
        if (!wasSaved && !isTopicBookmarked) {
          toggleTopicBookmark(card.topicSlug);
        } else if (wasSaved && isTopicBookmarked) {
          const anotherSavedWithSameTopic = nextProfile.savedIds.some((id) => {
            const match = corpusRef.current.find((c) => c.id === id);
            return match?.topicSlug === card.topicSlug;
          });
          if (!anotherSavedWithSameTopic) {
            toggleTopicBookmark(card.topicSlug);
          }
        }
      }

      if (!wasSaved) {
        showToast("Saved for spaced review");
      }
    },
    [
      bookmarkedTopics,
      commitProfile,
      persistDynamicPool,
      showToast,
      toggleTopicBookmark,
    ]
  );

  const handleShare = useCallback(
    (card: ScrollCard) => {
      const shareUrl = `${window.location.origin}/scroll?card=${encodeURIComponent(card.id)}`;
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(shareUrl).catch(() => {
          copyTextFallback(shareUrl);
        });
      } else {
        copyTextFallback(shareUrl);
      }
      showToast("Link copied");
    },
    [showToast]
  );

  const handleToggleCaptions = useCallback(() => {
    commitProfile((prev) =>
      updateScrollPreferences(prev, {
        captionsEnabled: !prev.preferences.captionsEnabled,
      })
    );
  }, [commitProfile]);

  const handleToggleAdaptiveAi = useCallback(
    (enabled: boolean) => {
      commitProfile((prev) =>
        updateScrollPreferences(prev, {
          adaptiveAiEnabled: enabled,
        })
      );
      if (enabled) {
        aiAuthBlockedRef.current = false;
      }
      showToast(enabled ? "Adaptive AI enabled" : "Adaptive AI paused");
    },
    [commitProfile, showToast]
  );

  const handleSaveGeminiKey = useCallback(
    (key: string, persistence: GeminiKeyPersistence) => {
      saveGeminiKeyRaw(key, persistence);
      sessionGeminiKeyRef.current = key;
      aiAuthBlockedRef.current = false;
      setAiStatusNote("Gemini connected — adaptive AI cards are now active.");
      showToast("Gemini connected");
    },
    [saveGeminiKeyRaw, showToast]
  );

  const handleClearGeminiKey = useCallback(() => {
    clearGeminiKeyRaw();
    sessionGeminiKeyRef.current = "";
    setAiStatusNote(null);
    showToast("Gemini key removed");
  }, [clearGeminiKeyRaw, showToast]);

  const handleGenerateNow = useCallback(() => {
    aiAuthBlockedRef.current = false;
    void runAdaptiveGenerate({
      trigger: "explore",
      count: 3,
      manual: true,
    });
  }, [runAdaptiveGenerate]);

  const handleReadClick = useCallback(
    (card: ScrollCard) => {
      commitProfile((prev) => recordReadClick(prev, card));
    },
    [commitProfile]
  );

  const handleTrapAnswer = useCallback(
    (
      slideKey: string,
      card: ScrollCard,
      selectedIndex: number,
      isCorrect: boolean
    ) => {
      setSessionTrapResults((prev) => ({
        ...prev,
        [slideKey]: { selectedIndex, isCorrect },
      }));
      const nextProfile = commitProfile((prev) =>
        recordTrapAnswer(prev, card, isCorrect, { selectedIndex })
      );
      persistDynamicPool(corpusRef.current, nextProfile);

      if (card.stage.type === "trap") {
        recordQuizAnswer(card.stage.trapId, selectedIndex, isCorrect);
      }

      // Trigger 1 (remediate): silently queue targeted walkthrough + twin trap right after a missed trap
      if (!isCorrect) {
        const now = Date.now();
        if (
          lastRemediateCardIdRef.current !== card.id &&
          now - lastAiCallAtRef.current >= AI_REMEDIATE_COOLDOWN_MS
        ) {
          lastRemediateCardIdRef.current = card.id;
          void runAdaptiveGenerate({
            trigger: "remediate",
            missedCard: card,
            count: 2,
          });
        }
      }
    },
    [commitProfile, persistDynamicPool, recordQuizAnswer, runAdaptiveGenerate]
  );

  const handleSelectMode = useCallback(
    (mode: ScrollFocusMode) => {
      const nextProfile = commitProfile((prev) =>
        updateScrollPreferences(prev, { focusMode: mode })
      );
      rebuildQueue({
        sourceCorpus: corpusRef.current,
        activeProfile: nextProfile,
        resetScroll: true,
      });
      maybeStreamOfflinePools(false);
      showToast(`Feed: ${MODE_LABELS[mode]}`);
    },
    [commitProfile, maybeStreamOfflinePools, rebuildQueue, showToast]
  );

  const handleResetWeights = useCallback(() => {
    const nextProfile = commitProfile((prev) =>
      resetScrollWeights(prev, {
        preserveStreak: true,
        preserveSaves: true,
      })
    );
    rebuildQueue({
      sourceCorpus: corpusRef.current,
      activeProfile: nextProfile,
      resetScroll: true,
    });
    setDrawerOpen(false);
    showToast("For-You weights reset");
  }, [commitProfile, rebuildQueue, showToast]);

  const handleOpenDrawer = useCallback(() => {
    setNowClock(Date.now());
    setDrawerOpen(true);
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (drawerOpen) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable ||
          target.closest("[role='dialog']"))
      ) {
        return;
      }

      const key = e.key;
      const lower = key.toLowerCase();

      if (key === "ArrowDown" || lower === "j") {
        e.preventDefault();
        const base = pendingScrollTargetRef.current ?? activeIndexRef.current;
        scrollToSlide(base + 1);
        return;
      }

      if (key === "ArrowUp" || lower === "k") {
        e.preventDefault();
        const base = pendingScrollTargetRef.current ?? activeIndexRef.current;
        scrollToSlide(base - 1);
        return;
      }

      if (key === " ") {
        e.preventDefault();
        setIsPaused((prev) => !prev);
        return;
      }

      if (lower === "c") {
        e.preventDefault();
        handleToggleCaptions();
        return;
      }

      if (lower === "r") {
        e.preventDefault();
        setIsRotated((prev) => !prev);
        return;
      }

      const activeItem = itemsRef.current[activeIndexRef.current];
      if (!activeItem) return;

      if (lower === "l") {
        e.preventDefault();
        handleLike(activeItem.card);
        return;
      }

      if (lower === "s") {
        e.preventDefault();
        handleSave(activeItem.card);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    drawerOpen,
    handleLike,
    handleSave,
    handleToggleCaptions,
    scrollToSlide,
  ]);

  const likedSet = useMemo(
    () => new Set(profile.likedIds),
    [profile.likedIds]
  );
  const savedSet = useMemo(
    () => new Set(profile.savedIds),
    [profile.savedIds]
  );

  const affinities = useMemo(
    () => getTopAffinities(profile, meta, { limit: 3, now: nowClock }),
    [meta, nowClock, profile]
  );

  const captionsEnabled = profile.preferences.captionsEnabled;
  const focusMode = profile.preferences.focusMode;
  const { streak } = profile;

  return (
    <div className="flex h-dvh w-screen items-center justify-center overflow-hidden bg-black">
      {/* Main 9:16 Portrait Column (smoothly expands to theater mode when rotated) */}
      <div
        data-scroll-column=""
        data-rotated={isRotated ? "true" : "false"}
        className={cn(
          "relative h-dvh w-full overflow-hidden bg-black transition-[max-width] duration-300 ease-out sm:border-x sm:border-white/10",
          isRotated ? "max-w-5xl" : "max-w-[calc(100dvh*9/16)]"
        )}
      >
        {/* Top Floating Minimal Header (z-40) */}
        <header className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-center justify-between bg-gradient-to-b from-black/75 via-black/30 to-transparent px-3.5 pt-3 pb-6">
          <div className="pointer-events-auto flex items-center gap-2">
            {homeTarget.isExternal ? (
              <a
                href={homeTarget.href}
                aria-label="Back to C++ Atlas"
                className="inline-flex items-center gap-1 rounded-full py-1 pr-2 pl-0.5 text-white transition-opacity hover:opacity-85"
              >
                <ChevronLeft
                  className="size-3.5 text-white/55"
                  aria-hidden
                />
                <span className="text-[15px] leading-none font-extrabold tracking-tight">
                  C<span className="text-[#ff4d5a]">++</span> Atlas
                </span>
                <span className="ml-0.5 text-[15px] leading-none font-medium text-white/70">
                  Scroll
                </span>
              </a>
            ) : (
              <Link
                href={homeTarget.href}
                aria-label="Back to C++ Atlas"
                className="inline-flex items-center gap-1 rounded-full py-1 pr-2 pl-0.5 text-white transition-opacity hover:opacity-85"
              >
                <ChevronLeft
                  className="size-3.5 text-white/55"
                  aria-hidden
                />
                <span className="text-[15px] leading-none font-extrabold tracking-tight">
                  C<span className="text-[#ff4d5a]">++</span> Atlas
                </span>
                <span className="ml-0.5 text-[15px] leading-none font-medium text-white/70">
                  Scroll
                </span>
              </Link>
            )}

            {focusMode !== "for-you" ? (
              <button
                type="button"
                onClick={handleOpenDrawer}
                className="rounded-full bg-white/12 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white/90 uppercase ring-1 ring-white/15 backdrop-blur-md transition-colors hover:bg-white/20 cursor-pointer"
              >
                {MODE_LABELS[focusMode]}
              </button>
            ) : null}
          </div>

          {/* Ultra-minimal frosted glass streak & review queue pill */}
          <button
            type="button"
            onClick={handleOpenDrawer}
            aria-label="Open streak, review queue, and For-You controls"
            aria-expanded={drawerOpen}
            data-scroll-streak-trigger="true"
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1.5 text-[11px] leading-none font-medium text-white/90 ring-1 ring-white/15 backdrop-blur-md transition-all hover:bg-black/65 hover:ring-white/25 active:scale-95 cursor-pointer"
          >
            <Flame
              className={cn(
                "size-3.5",
                streak.currentDays > 0 ? "text-[#ff4d5a]" : "text-white/60"
              )}
              aria-hidden
            />
            <span className="font-mono tabular-nums">
              {streak.currentDays}d
            </span>
            <span aria-hidden className="text-white/30">
              ·
            </span>
            <span className="font-mono tabular-nums text-white/80">
              {streak.todayCards}/{streak.dailyGoal}
            </span>
            {affinities.dueReviewCount > 0 ? (
              <span
                aria-label={`${affinities.dueReviewCount} due reviews`}
                className="ml-0.5 inline-block size-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.95)]"
              />
            ) : null}
          </button>
        </header>

        {/* Vertical Snap Feed Scroller */}
        {resolvingPinned || items.length === 0 ? (
          <div className="flex h-dvh w-full flex-col items-center justify-center bg-black px-6 text-center">
            <div className="aspect-video w-full animate-pulse rounded-lg bg-white/[0.06] ring-1 ring-white/10" />
            <p className="mt-4 text-xs text-white/45">
              {resolvingPinned
                ? "Loading shared card…"
                : "Preparing C++ Atlas Scroll…"}
            </p>
          </div>
        ) : (
          <div
            ref={scrollerRef}
            className="scroll-feed-scroller h-dvh w-full overflow-y-scroll snap-y snap-mandatory"
          >
            {items.map((item, idx) => (
              <ScrollSlide
                key={item.slideKey}
                card={item.card}
                index={idx}
                reasonBadge={item.reasonBadge}
                rankTag={item.rankTag}
                isDueReview={item.isDueReview}
                isActive={idx === activeIndex}
                shouldRenderStage={Math.abs(idx - activeIndex) <= 2}
                isPaused={idx === activeIndex ? isPaused : true}
                isRotated={isRotated}
                captionsEnabled={captionsEnabled}
                isLiked={likedSet.has(item.card.id)}
                isSaved={savedSet.has(item.card.id)}
                existingTrapResult={sessionTrapResults[item.slideKey] ?? null}
                onTogglePause={() => setIsPaused((p) => !p)}
                onSetPaused={setIsPaused}
                onToggleRotate={() => setIsRotated((r) => !r)}
                onToggleCaptions={handleToggleCaptions}
                onLike={handleLike}
                onSave={handleSave}
                onShare={handleShare}
                onReadClick={handleReadClick}
                onTrapAnswer={(card, selectedIndex, isCorrect) =>
                  handleTrapAnswer(item.slideKey, card, selectedIndex, isCorrect)
                }
              />
            ))}
          </div>
        )}

        {/* Centered White Pill Toast (e.g. "Link copied") */}
        {toastMessage ? (
          <div
            role="status"
            aria-live="polite"
            className="scroll-toast-enter pointer-events-none absolute bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-black shadow-[0_12px_32px_rgba(0,0,0,0.65)]"
          >
            {toastMessage}
          </div>
        ) : null}
      </div>

      {/* Minimalist Dark Frosted Streak, Adaptive AI & For-You Overlay Sheet (closed by default) */}
      <ScrollOverlayDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        profile={profile}
        affinities={affinities}
        meta={meta}
        loadedPoolCount={corpus.length}
        sessionAiCount={sessionAiCount}
        serverAiConfigured={serverAiConfigured}
        sessionGeminiKey={sessionGeminiKey}
        geminiKeyPersistence={geminiKeyPersistence}
        onSaveGeminiKey={handleSaveGeminiKey}
        onClearGeminiKey={handleClearGeminiKey}
        onToggleAdaptiveAi={handleToggleAdaptiveAi}
        isGeneratingAi={isGeneratingAi}
        aiStatusNote={aiStatusNote}
        onGenerateNow={handleGenerateNow}
        onSelectMode={handleSelectMode}
        onResetWeights={handleResetWeights}
      />
    </div>
  );
}
