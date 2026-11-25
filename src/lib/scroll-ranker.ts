import {
  normalizeScrollTag,
  type ScrollFocusMode,
  type ScrollSRItem,
  type ScrollUserProfile,
} from "@/lib/scroll-storage";
import {
  SCROLL_CARD_KINDS,
  type ScrollCard,
  type ScrollCardDifficulty,
  type ScrollCardKind,
  type ScrollFeedMeta,
  type ScrollFeedTrackMeta,
  type ScrollGenerateLikedCard,
  type ScrollGenerateMissedTrap,
  type ScrollGenerateRequest,
  type ScrollGenerateTrigger,
} from "@/lib/scroll-types";

export interface RankedScrollItem {
  card: ScrollCard;
  reasonBadge: string;
  rankTag: string;
  isDueReview: boolean;
  score: number;
}

export interface RankNextBatchOptions {
  corpus: ScrollCard[];
  profile: ScrollUserProfile;
  alreadyQueuedIds: Set<string>;
  batchSize: number;
  pinnedCardId?: string;
  completedTopicSlugs?: Set<string>;
  bookmarkedSlugs?: Set<string>;
  now?: number;
  /** Optional IDs currently queued ahead of the active slide (prevents duplicate upcoming reviews) */
  upcomingQueuedIds?: Set<string>;
  /** Optional trailing cards from the previous batch for seamless cross-batch pacing */
  tailCards?: ScrollCard[];
  /**
   * Optional high-priority dynamic cards (e.g. freshly generated Gemini
   * remediate walkthrough + twin trap, or deep-dive cards) woven naturally
   * 1–4 slides ahead while respecting pacing constraints.
   */
  priorityCards?: ScrollCard[];
}

export interface BuildAdaptiveGenerateRequestOptions {
  trigger: ScrollGenerateTrigger;
  profile: ScrollUserProfile;
  missedCard?: ScrollCard;
  likedCard?: ScrollCard;
  recentCards?: ScrollCard[];
  count?: number;
}

export interface TrapAccuracyStats {
  attempts: number;
  correct: number;
  accuracy: number;
}

export interface TrackAffinitySummary {
  trackId: string;
  trackTitle: string;
  continentId: string;
  continentLabel: string;
  score: number;
  strengthPct: number;
}

export interface TopAffinitiesResult {
  topTracks: TrackAffinitySummary[];
  dueReviewCount: number;
  totalQueuedReviews: number;
  preferredKind: ScrollCardKind | null;
}

export interface GetTopAffinitiesOptions {
  limit?: number;
  now?: number;
}

interface ScoredCandidate {
  card: ScrollCard;
  baseTotal: number;
  isFrontier: boolean;
  isReinforcement: boolean;
  isExploration: boolean;
  isPreviouslyMissed: boolean;
  trackAff: number;
  lastSeenAt: number;
  recycled: boolean;
}

const THIRTY_MINUTES_MS = 30 * 60_000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60_000;
const FIFTEEN_MINUTES_MS = 15 * 60_000;
const DUE_REVIEW_MIN_GAP_FOR_YOU = 3;
const DUE_REVIEW_MIN_GAP_TRAPS = 2;

/**
 * Fast, pure, deterministic 32-bit hash (FNV-1a style) for light exploration jitter
 * without non-deterministic Math.random() calls.
 */
function deterministicJitter(
  cardId: string,
  bucket: number,
  salt: number
): number {
  let hash = 2166136261 ^ bucket ^ (salt * 16777619);
  for (let i = 0; i < cardId.length; i++) {
    hash ^= cardId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const unit = (hash >>> 0) / 4294967295; // [0, 1]
  return (unit - 0.5) * 0.7; // [-0.35, +0.35]
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function formatTrackFallbackTitle(trackId: string): string {
  return trackId
    .split("-")
    .filter(Boolean)
    .map((part) => {
      if (part === "cpp26") return "C++26";
      if (part === "and") return "and";
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function computeDueUrgency(item: ScrollSRItem, now: number): number {
  const overdueHours = Math.max(0, (now - item.dueAt) / 3_600_000);
  const missedPriority = item.source === "missed-trap" ? 100 : 0;
  const lapseWeight = item.lapses * 12;
  const lowBoxWeight = Math.max(0, 6 - item.box) * 4;
  return missedPriority + lapseWeight + lowBoxWeight + Math.min(overdueHours, 72);
}

/**
 * Computes aggregate trap accuracy across `profile.trapHistory` so adaptive
 * generation can escalate difficulty cleanly when the learner is crushing traps.
 */
export function getTrapAccuracyStats(
  profile: ScrollUserProfile
): TrapAccuracyStats {
  let attempts = 0;
  let correct = 0;
  for (const entry of Object.values(profile.trapHistory)) {
    attempts += entry.attempts;
    correct += entry.correct;
  }
  return {
    attempts,
    correct,
    accuracy: attempts > 0 ? correct / attempts : 0,
  };
}

function toGenerateMissedTrap(card: ScrollCard): ScrollGenerateMissedTrap {
  const trapId = card.stage.type === "trap" ? card.stage.trapId : card.id;
  const question =
    card.stage.type === "trap" ? card.stage.question : card.title;
  const explanation =
    card.stage.type === "trap" ? card.stage.explanation : card.summary;
  const clause = card.stage.type === "trap" ? card.stage.clause : undefined;

  return {
    cardId: card.id,
    trapId,
    ...(card.topicSlug ? { topicSlug: card.topicSlug } : {}),
    trackId: card.trackId,
    question,
    ...(clause ? { clause } : {}),
    explanation,
  };
}

function toGenerateLikedCard(card: ScrollCard): ScrollGenerateLikedCard {
  return {
    cardId: card.id,
    ...(card.topicSlug ? { topicSlug: card.topicSlug } : {}),
    trackId: card.trackId,
    title: card.title,
    tags: card.tags.slice(0, 8),
    ...(card.sourcePath ? { sourcePath: card.sourcePath } : {}),
  };
}

/**
 * Builds a grounded `ScrollGenerateRequest` payload for `POST /api/scroll/generate`:
 * - Selects top learned tracks (anchored by `missedCard` / `likedCard` when present)
 * - Escalates `difficultyTarget` (`1 -> 2 -> 3`) from trap accuracy & cards absorbed
 * - Deduplicates recent `seenCardIds` and `seenSourcePaths` so Gemini explores fresh ground
 */
export function buildAdaptiveGenerateRequest(
  options: BuildAdaptiveGenerateRequestOptions
): ScrollGenerateRequest {
  const { trigger, profile, missedCard, likedCard, recentCards = [], count } =
    options;

  // 1. Compute topTracks anchored by trigger card -> learned trackAffinity -> recent history.
  const topTracks: string[] = [];
  const pushTrack = (trackId: string | undefined) => {
    if (!trackId || topTracks.includes(trackId)) return;
    topTracks.push(trackId);
  };

  if (trigger === "remediate") {
    pushTrack(missedCard?.trackId ?? profile.recentMissedTraps[0]?.trackId);
  } else if (trigger === "deep-dive") {
    pushTrack(likedCard?.trackId ?? profile.recentLikedCards[0]?.trackId);
  }

  const positiveTracks = Object.entries(profile.trackAffinity)
    .filter(([, score]) => Number.isFinite(score) && score > 0.05)
    .sort((a, b) => b[1] - a[1]);

  for (const [trackId] of positiveTracks) {
    pushTrack(trackId);
    if (topTracks.length >= 4) break;
  }

  if (topTracks.length < 3) {
    for (const card of recentCards) {
      pushTrack(card.trackId);
      if (topTracks.length >= 3) break;
    }
  }
  if (topTracks.length < 3) {
    for (const liked of profile.recentLikedCards) {
      pushTrack(liked.trackId);
      if (topTracks.length >= 3) break;
    }
  }
  if (topTracks.length < 3) {
    for (const missed of profile.recentMissedTraps) {
      pushTrack(missed.trackId);
      if (topTracks.length >= 3) break;
    }
  }

  // 2. Compute adaptive difficultyTarget (1 -> 2 -> 3).
  const trapStats = getTrapAccuracyStats(profile);
  const seenCount = Object.keys(profile.seenIds).length;

  let difficultyTarget: ScrollCardDifficulty;
  if (trigger === "escalate") {
    difficultyTarget = 3;
  } else if (trigger === "remediate") {
    if (missedCard) {
      difficultyTarget = missedCard.difficulty === 3 ? 2 : missedCard.difficulty;
    } else {
      difficultyTarget = 2;
    }
  } else {
    if (
      (trapStats.attempts >= 4 && trapStats.accuracy >= 0.75) ||
      (seenCount >= 25 && (trapStats.attempts === 0 || trapStats.accuracy >= 0.65))
    ) {
      difficultyTarget = 3;
    } else if (
      (trapStats.attempts >= 2 && trapStats.accuracy >= 0.5) ||
      seenCount >= 6 ||
      profile.streak.todayCards >= 3
    ) {
      difficultyTarget = 2;
    } else {
      difficultyTarget = 1;
    }

    if (
      trigger === "deep-dive" &&
      likedCard &&
      likedCard.difficulty > difficultyTarget
    ) {
      difficultyTarget = likedCard.difficulty;
    }
  }

  // 3. Collect capped recent seenCardIds (most recent first, <= 60).
  const seenCardIds: string[] = [];
  const seenCardSet = new Set<string>();
  const pushCardId = (id: string | undefined) => {
    if (!id || seenCardSet.has(id) || seenCardIds.length >= 60) return;
    seenCardSet.add(id);
    seenCardIds.push(id);
  };

  for (let i = recentCards.length - 1; i >= 0; i--) {
    pushCardId(recentCards[i].id);
  }
  const recentSeenEntries = Object.entries(profile.seenIds)
    .sort((a, b) => b[1].lastSeenAt - a[1].lastSeenAt)
    .slice(0, 60);
  for (const [cardId] of recentSeenEntries) {
    pushCardId(cardId);
  }

  // 4. Collect capped seenSourcePaths (most recent first, <= 80).
  const seenSourcePaths: string[] = [];
  const seenPathSet = new Set<string>();
  const pushPath = (path: string | undefined) => {
    const trimmed = path?.trim();
    if (!trimmed || seenPathSet.has(trimmed) || seenSourcePaths.length >= 80) {
      return;
    }
    seenPathSet.add(trimmed);
    seenSourcePaths.push(trimmed);
  };

  for (let i = recentCards.length - 1; i >= 0; i--) {
    pushPath(recentCards[i].sourcePath);
  }
  for (const path of profile.seenSourcePaths) {
    pushPath(path);
  }

  // 5. Attach trigger-specific context.
  let missedTrapPayload: ScrollGenerateMissedTrap | undefined;
  if (missedCard) {
    missedTrapPayload = toGenerateMissedTrap(missedCard);
  } else if (trigger === "remediate" && profile.recentMissedTraps.length > 0) {
    const latest = profile.recentMissedTraps[0];
    missedTrapPayload = {
      cardId: latest.cardId,
      trapId: latest.trapId,
      ...(latest.topicSlug ? { topicSlug: latest.topicSlug } : {}),
      trackId: latest.trackId,
      question: latest.question,
      ...(latest.clause ? { clause: latest.clause } : {}),
      explanation: latest.explanation,
    };
  }

  let likedCardPayload: ScrollGenerateLikedCard | undefined;
  if (likedCard) {
    likedCardPayload = toGenerateLikedCard(likedCard);
  } else if (trigger === "deep-dive" && profile.recentLikedCards.length > 0) {
    const latest = profile.recentLikedCards[0];
    likedCardPayload = {
      cardId: latest.cardId,
      ...(latest.topicSlug ? { topicSlug: latest.topicSlug } : {}),
      trackId: latest.trackId,
      title: latest.title,
      tags: latest.tags.slice(0, 8),
      ...(latest.sourcePath ? { sourcePath: latest.sourcePath } : {}),
    };
  }

  const defaultCount = trigger === "explore" ? 3 : 2;
  const resolvedCount =
    count !== undefined && Number.isFinite(count)
      ? Math.max(1, Math.min(4, Math.floor(count)))
      : defaultCount;

  return {
    trigger,
    topTracks,
    difficultyTarget,
    seenCardIds,
    seenSourcePaths,
    ...(missedTrapPayload ? { missedTrap: missedTrapPayload } : {}),
    ...(likedCardPayload ? { likedCard: likedCardPayload } : {}),
    count: resolvedCount,
  };
}

/**
 * Returns all cards currently due for spaced repetition (`dueAt <= now`),
 * sorted with overdue missed traps and higher-lapse cards first.
 */
export function getDueReviewCards(
  cards: ScrollCard[],
  profile: ScrollUserProfile,
  now: number = Date.now()
): ScrollCard[] {
  const duePairs: { card: ScrollCard; urgency: number }[] = [];
  for (const card of cards) {
    const srItem = profile.srQueue[card.id];
    if (!srItem || srItem.dueAt > now) continue;
    duePairs.push({
      card,
      urgency: computeDueUrgency(srItem, now),
    });
  }
  duePairs.sort((a, b) => b.urgency - a.urgency);
  return duePairs.map((pair) => pair.card);
}

function matchesFocusMode(card: ScrollCard, mode: ScrollFocusMode): boolean {
  if (mode === "traps") return card.kind === "trap";
  if (mode === "visuals") return card.kind !== "trap";
  return true;
}

function canResurfaceDueReview(
  cardId: string,
  srItem: ScrollSRItem,
  profile: ScrollUserProfile,
  alreadyQueuedIds: Set<string>,
  upcomingQueuedIds: Set<string> | undefined,
  tailCardIds: Set<string>,
  now: number
): boolean {
  if (srItem.dueAt > now) return false;
  if (upcomingQueuedIds?.has(cardId)) return false;
  if (tailCardIds.has(cardId)) return false;

  if (!alreadyQueuedIds.has(cardId)) {
    return true;
  }

  // Allow in-session resurfacing once a missed trap / saved card crosses its dueAt
  // after at least a few other cards have been queued.
  const lastTrapAt = profile.trapHistory[cardId]?.lastAt ?? 0;
  const lastSeenAt = profile.seenIds[cardId]?.lastSeenAt ?? 0;
  const lastInteraction = Math.max(lastTrapAt, lastSeenAt);
  return (
    alreadyQueuedIds.size >= 3 &&
    lastInteraction > 0 &&
    lastInteraction < srItem.dueAt
  );
}

function isRemediateAiCard(card: ScrollCard): boolean {
  if (card.id.includes(":remediate:")) return true;
  const reason = card.aiReason ?? "";
  return /fix|remediat|missed/i.test(reason);
}

function isTwinTrapAiCard(card: ScrollCard): boolean {
  const reason = card.aiReason ?? "";
  if (/twin/i.test(reason)) return true;
  return card.kind === "trap" && isRemediateAiCard(card);
}

function buildAiLabels(card: ScrollCard): {
  rankTag: string;
  reasonBadge: string;
} {
  if (isTwinTrapAiCard(card)) {
    return {
      rankTag: "✦ Twin Trap",
      reasonBadge: card.aiReason || "Twin Trap Check",
    };
  }
  if (isRemediateAiCard(card)) {
    return {
      rankTag: "✦ Tailored Fix",
      reasonBadge: card.aiReason || "Targeted Fix",
    };
  }
  return {
    rankTag: "✦ Adaptive AI",
    reasonBadge: card.aiReason || "Tailored For You",
  };
}

function buildLabels(params: {
  card: ScrollCard;
  ordinal: number;
  slotIndex: number;
  focusMode: ScrollFocusMode;
  isPinned?: boolean;
  isDueReview?: boolean;
  isUpcomingReview?: boolean;
  isPriority?: boolean;
  srSource?: ScrollSRItem["source"];
  isFrontier?: boolean;
  isReinforcement?: boolean;
  isExploration?: boolean;
  isPreviouslyMissed?: boolean;
  trackAff?: number;
}): { rankTag: string; reasonBadge: string } {
  const {
    card,
    ordinal,
    slotIndex,
    focusMode,
    isPinned,
    isDueReview,
    isUpcomingReview,
    isPriority,
    srSource,
    isFrontier,
    isReinforcement,
    isExploration,
    isPreviouslyMissed,
    trackAff = 0,
  } = params;

  if (isPinned) {
    return { rankTag: "Pinned", reasonBadge: "Shared Card" };
  }

  if (isDueReview) {
    return {
      rankTag: "↺ Review Due",
      reasonBadge:
        srSource === "missed-trap" ? "Missed Trap Recall" : "Saved Review",
    };
  }

  if (card.origin === "ai" || isPriority) {
    if (card.origin === "ai") {
      return buildAiLabels(card);
    }
    if (card.origin === "reference") {
      return {
        rankTag: "✦ cppreference",
        reasonBadge: card.aiReason || "Deep Reference",
      };
    }
    return {
      rankTag: card.kind === "trap" ? "✦ Twin Trap" : "✦ Tailored Fix",
      reasonBadge: card.aiReason || "Tailored For You",
    };
  }

  if (isUpcomingReview) {
    return {
      rankTag: "↺ Up Next",
      reasonBadge: "Review Queue",
    };
  }

  if (isFrontier) {
    return {
      rankTag: "↑ Next Frontier",
      reasonBadge: "Prerequisites Met",
    };
  }

  if (isReinforcement) {
    return {
      rankTag: "↺ Reinforce",
      reasonBadge: "Related to Missed Trap",
    };
  }

  if (card.origin === "reference") {
    return ordinal <= 2
      ? { rankTag: `#${ordinal} For You`, reasonBadge: "✦ cppreference" }
      : { rankTag: "✦ cppreference", reasonBadge: `#${ordinal} For You` };
  }

  if (card.origin === "simulator") {
    return ordinal <= 2
      ? { rankTag: `#${ordinal} For You`, reasonBadge: "✦ Machine Model" }
      : { rankTag: "✦ Machine Model", reasonBadge: `#${ordinal} For You` };
  }

  const isCpp26 = card.standard === "C++26" || card.trackId === "cpp26";
  const isCpp23 = card.standard === "C++23";

  if (isCpp26) {
    return ordinal <= 3
      ? { rankTag: `#${ordinal} For You`, reasonBadge: "⚡ C++26 Preview" }
      : { rankTag: "⚡ C++26 Preview", reasonBadge: `#${ordinal} For You` };
  }

  if (isCpp23) {
    return ordinal <= 3
      ? { rankTag: `#${ordinal} For You`, reasonBadge: "⚡ C++23 New" }
      : { rankTag: "⚡ C++23 New", reasonBadge: `#${ordinal} For You` };
  }

  if (card.difficulty === 3 && slotIndex % 3 === 2) {
    return {
      rankTag: "✦ Deep Cut",
      reasonBadge: `#${ordinal} For You`,
    };
  }

  if (focusMode === "traps") {
    return {
      rankTag: isPreviouslyMissed ? "↺ Retry Trap" : `#${ordinal} Trap`,
      reasonBadge: isPreviouslyMissed ? "Previously Missed" : "Standardese Check",
    };
  }

  if (focusMode === "visuals") {
    return {
      rankTag: `#${ordinal} For You`,
      reasonBadge: trackAff >= 0.75 ? "Matched Track" : "Visual Explainer",
    };
  }

  if (trackAff >= 0.8) {
    return {
      rankTag: `#${ordinal} For You`,
      reasonBadge: "Matched Track",
    };
  }

  if (isExploration) {
    return {
      rankTag: `#${ordinal} For You`,
      reasonBadge: "✦ Explore",
    };
  }

  return {
    rankTag: `#${ordinal} For You`,
    reasonBadge: "For You",
  };
}

function orderPriorityQueue(
  priorityCards: readonly ScrollCard[],
  focusMode: ScrollFocusMode,
  alreadyQueuedIds: Set<string>,
  upcomingQueuedIds: Set<string> | undefined,
  chosenInBatch: Set<string>
): ScrollCard[] {
  const deduped: ScrollCard[] = [];
  const seen = new Set<string>();

  for (const card of priorityCards) {
    if (!card || !card.id) continue;
    if (
      seen.has(card.id) ||
      chosenInBatch.has(card.id) ||
      alreadyQueuedIds.has(card.id) ||
      upcomingQueuedIds?.has(card.id)
    ) {
      continue;
    }
    if (!matchesFocusMode(card, focusMode)) continue;
    seen.add(card.id);
    deduped.push(card);
  }

  // When a remediate pair contains a walkthrough + twin trap, ensure the
  // non-trap explainer surfaces ahead of the twin trap.
  const nonTraps = deduped.filter((c) => c.kind !== "trap");
  const traps = deduped.filter((c) => c.kind === "trap");
  if (nonTraps.length > 0 && traps.length > 0) {
    const interleaved: ScrollCard[] = [];
    const maxLen = Math.max(nonTraps.length, traps.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < nonTraps.length) interleaved.push(nonTraps[i]);
      if (i < traps.length) interleaved.push(traps[i]);
    }
    return interleaved;
  }

  return deduped;
}

/**
 * Pure, fast (<5ms even over 2,000+ multi-pool cards) adaptive "For You" sequencer with:
 * - Pinned `?card=<id>` priority at index 0
 * - Natural 1–4 slide weaving of `priorityCards` (Gemini remediate walkthrough + twin trap / deep-dive)
 * - Smooth spaced-repetition due-review interleaving (never back-to-back in For You)
 * - Multi-pool mixing (`core`, `simulator`, `procedural`, `reference`, `ai`) with sourcePath diversity
 * - Affinity scoring (track, kind, normalized tags, bookmarks, prerequisite frontier,
 *   missed-trap concept reinforcement, freshness decay, deterministic exploration)
 * - Pacing constraints (no back-to-back traps unless Traps mode, no back-to-back
 *   same track when alternatives exist, ~1 trap every 3–4 visual cards)
 * - Seamless oldest-seen infinite recycling so scrolling never runs dry
 */
export function rankNextBatch(
  options: RankNextBatchOptions
): RankedScrollItem[] {
  const {
    corpus,
    profile,
    alreadyQueuedIds,
    batchSize,
    pinnedCardId,
    completedTopicSlugs,
    bookmarkedSlugs,
    upcomingQueuedIds,
    tailCards = [],
    priorityCards = [],
    now = Date.now(),
  } = options;

  if ((corpus.length === 0 && priorityCards.length === 0) || batchSize <= 0) {
    return [];
  }

  const focusMode: ScrollFocusMode = profile.preferences.focusMode;
  const result: RankedScrollItem[] = [];
  const chosenInBatch = new Set<string>();
  const cardById = new Map<string, ScrollCard>();

  // Normalize baseScore across corpus to [0, 1.5] so ranking weights stay well-scaled
  // regardless of corpus baseScore range.
  let minBase = Infinity;
  let maxBase = -Infinity;
  for (const card of corpus) {
    cardById.set(card.id, card);
    if (card.baseScore < minBase) minBase = card.baseScore;
    if (card.baseScore > maxBase) maxBase = card.baseScore;
  }
  for (const card of priorityCards) {
    if (!cardById.has(card.id)) {
      cardById.set(card.id, card);
    }
  }
  const baseSpan = maxBase - minBase;

  const normalizeBase = (raw: number): number => {
    if (!Number.isFinite(raw)) return 0.75;
    if (baseSpan <= 0.0001) return 0.75;
    return ((raw - minBase) / baseSpan) * 1.5;
  };

  // Detect recently missed traps (last 30 minutes) so related visual explainers
  // receive a reinforcement boost before the missed trap resurfaces.
  const recentMissedTracks = new Set<string>();
  const recentMissedTopicSlugs = new Set<string>();
  for (const [cardId, hist] of Object.entries(profile.trapHistory)) {
    if (hist.lastResult !== "wrong") continue;
    if (now - hist.lastAt > THIRTY_MINUTES_MS) continue;
    const missedCard = cardById.get(cardId);
    if (!missedCard) continue;
    recentMissedTracks.add(missedCard.trackId);
    if (missedCard.topicSlug) {
      recentMissedTopicSlugs.add(missedCard.topicSlug);
    }
  }

  // Track recent history across batch boundaries for diversity pacing.
  const recentWindow: ScrollCard[] = tailCards.slice(-3);
  const tailCardIds = new Set(recentWindow.map((c) => c.id));

  let visualsSinceLastTrap = 0;
  for (let i = recentWindow.length - 1; i >= 0; i--) {
    if (recentWindow[i].kind === "trap") break;
    visualsSinceLastTrap++;
  }

  let slotsSinceLastEvolution = alreadyQueuedIds.size === 0 ? 2 : 0;
  let slotsSinceLastReference = alreadyQueuedIds.size === 0 ? 2 : 0;
  if (recentWindow.length > 0) {
    slotsSinceLastEvolution = 0;
    for (let i = recentWindow.length - 1; i >= 0; i--) {
      if (recentWindow[i].kind === "evolution") break;
      slotsSinceLastEvolution++;
    }
    slotsSinceLastReference = 0;
    for (let i = recentWindow.length - 1; i >= 0; i--) {
      if (recentWindow[i].origin === "reference") break;
      slotsSinceLastReference++;
    }
  }

  let slotsSinceLastDueReview = alreadyQueuedIds.size === 0 ? 1 : 2;
  // Allow first priorityCard immediately at slot 0 when splicing downstream of active slide,
  // or at slot 1 on a cold batch so slot 0 hooks the user cleanly.
  let slotsSinceLastPriority = tailCards.length > 0 ? 2 : 1;
  let placedPriorityCount = 0;
  const baseOrdinal = alreadyQueuedIds.size;

  const pushItem = (item: RankedScrollItem, isPriority = false) => {
    result.push(item);
    chosenInBatch.add(item.card.id);
    recentWindow.push(item.card);
    if (recentWindow.length > 3) recentWindow.shift();

    if (item.card.kind === "trap") {
      visualsSinceLastTrap = 0;
    } else {
      visualsSinceLastTrap++;
    }

    if (item.card.kind === "evolution") {
      slotsSinceLastEvolution = 0;
    } else {
      slotsSinceLastEvolution++;
    }

    if (item.card.origin === "reference") {
      slotsSinceLastReference = 0;
    } else {
      slotsSinceLastReference++;
    }

    if (item.isDueReview) {
      slotsSinceLastDueReview = 0;
    } else {
      slotsSinceLastDueReview++;
    }

    if (isPriority) {
      slotsSinceLastPriority = 0;
      placedPriorityCount++;
    } else {
      slotsSinceLastPriority++;
    }
  };

  // 1. Pinned ?card=<id> ALWAYS goes first at index 0.
  if (pinnedCardId && !alreadyQueuedIds.has(pinnedCardId)) {
    const pinnedCard = cardById.get(pinnedCardId);
    if (pinnedCard) {
      const srItem = profile.srQueue[pinnedCard.id];
      const isDue = Boolean(srItem && srItem.dueAt <= now);
      const { rankTag, reasonBadge } = buildLabels({
        card: pinnedCard,
        ordinal: baseOrdinal + 1,
        slotIndex: 0,
        focusMode,
        isPinned: true,
      });
      pushItem({
        card: pinnedCard,
        rankTag,
        reasonBadge,
        isDueReview: isDue,
        score: 100,
      });
    }
  }

  if (result.length >= batchSize) {
    return result;
  }

  // 2. Prepare priority dynamic cards (e.g. fresh Gemini remediate / deep-dive).
  const priorityQueue = orderPriorityQueue(
    priorityCards,
    focusMode,
    alreadyQueuedIds,
    upcomingQueuedIds,
    chosenInBatch
  );
  const priorityIdSet = new Set(priorityQueue.map((c) => c.id));

  // 3. Gather eligible due spaced-repetition items sorted by urgency.
  const dueQueue: { card: ScrollCard; srItem: ScrollSRItem; urgency: number }[] =
    [];
  for (const card of corpus) {
    if (chosenInBatch.has(card.id) || priorityIdSet.has(card.id)) continue;
    if (focusMode === "traps" && card.kind !== "trap") continue;
    if (focusMode === "visuals" && card.kind === "trap") continue;

    const srItem = profile.srQueue[card.id];
    if (!srItem) continue;
    if (
      !canResurfaceDueReview(
        card.id,
        srItem,
        profile,
        alreadyQueuedIds,
        upcomingQueuedIds,
        tailCardIds,
        now
      )
    ) {
      continue;
    }
    dueQueue.push({
      card,
      srItem,
      urgency: computeDueUrgency(srItem, now),
    });
  }
  dueQueue.sort((a, b) => b.urgency - a.urgency);

  const timeBucket = Math.floor(now / FIFTEEN_MINUTES_MS);
  const savedSet = new Set(profile.savedIds);
  const seenSourcePathSet = new Set(profile.seenSourcePaths);
  const hasCompleted = Boolean(
    completedTopicSlugs && completedTopicSlugs.size > 0
  );
  const hasTagAffinities = Object.keys(profile.tagAffinity).length > 0;

  // Score any candidate list cleanly.
  const scoreCard = (
    card: ScrollCard,
    recycled: boolean,
    salt: number
  ): ScoredCandidate => {
    const base = normalizeBase(card.baseScore);
    const trackAff = profile.trackAffinity[card.trackId] ?? 0;
    const kindAff = profile.kindAffinity[card.kind] ?? 0;

    let tagScore = 0;
    if (hasTagAffinities) {
      let tagSum = 0;
      let tagCount = 0;
      for (const rawTag of card.tags) {
        const key = normalizeScrollTag(rawTag);
        const val = profile.tagAffinity[key];
        if (val !== undefined) {
          tagSum += val;
          tagCount++;
        }
      }
      if (card.topicSlug) {
        const slugVal = profile.tagAffinity[normalizeScrollTag(card.topicSlug)];
        if (slugVal !== undefined) {
          tagSum += slugVal;
          tagCount++;
        }
      }
      const avgTagAff = tagCount > 0 ? tagSum / tagCount : 0;
      tagScore = Math.max(-1.5, Math.min(2.5, avgTagAff * 0.75));
    }

    const isBookmarked =
      savedSet.has(card.id) ||
      Boolean(
        bookmarkedSlugs && card.topicSlug && bookmarkedSlugs.has(card.topicSlug)
      );
    const bookmarkBonus = isBookmarked ? 0.55 : 0;

    let frontierBonus = 0;
    let isFrontier = false;
    let completedAdjustment = 0;
    if (hasCompleted && completedTopicSlugs) {
      const isTopicCompleted = Boolean(
        card.topicSlug && completedTopicSlugs.has(card.topicSlug)
      );
      if (
        !isTopicCompleted &&
        card.prerequisites.length > 0 &&
        card.prerequisites.every((prereq) => completedTopicSlugs.has(prereq))
      ) {
        frontierBonus = 1.2;
        isFrontier = true;
      } else if (isTopicCompleted) {
        completedAdjustment = card.kind === "trap" ? 0.25 : -0.35;
      }
    }

    let reinforcementBonus = 0;
    let isReinforcement = false;
    if (card.kind !== "trap") {
      if (card.topicSlug && recentMissedTopicSlugs.has(card.topicSlug)) {
        reinforcementBonus = 1.45;
        isReinforcement = true;
      } else if (recentMissedTracks.has(card.trackId)) {
        reinforcementBonus = 0.65;
        isReinforcement = true;
      }
    }

    const trapHist = profile.trapHistory[card.id];
    const isPreviouslyMissed = Boolean(
      trapHist && trapHist.attempts > trapHist.correct
    );
    const missedTrapBonus =
      isPreviouslyMissed && focusMode === "traps" ? 1.1 : 0;

    const seen = profile.seenIds[card.id];
    const lastSeenAt = seen?.lastSeenAt ?? 0;

    // Multi-pool discovery freshness boost for unseen non-core cards.
    let originDiscoveryBonus = 0;
    if (!seen && !recycled) {
      if (card.origin === "ai") originDiscoveryBonus = 0.75;
      else if (card.origin === "reference") originDiscoveryBonus = 0.35;
      else if (card.origin === "simulator") originDiscoveryBonus = 0.35;
      else if (card.origin === "procedural") originDiscoveryBonus = 0.25;
    }

    // Mild sourcePath dedup nudge so users explore diverse docs across thousands of pages.
    const sourcePathPenalty =
      !recycled && card.sourcePath && seenSourcePathSet.has(card.sourcePath)
        ? -0.65
        : 0;

    let freshnessScore = 0;
    if (!recycled && seen) {
      const ageMs = Math.max(0, now - seen.lastSeenAt);
      if (ageMs < THIRTY_MINUTES_MS) {
        freshnessScore = -6.0 + 3.0 * (ageMs / THIRTY_MINUTES_MS);
      } else if (ageMs < TWENTY_FOUR_HOURS_MS) {
        freshnessScore = -1.8;
      } else if (seen.count > 0) {
        freshnessScore = -0.6 * Math.min(seen.count, 5);
      }
    }

    const jitter = deterministicJitter(card.id, timeBucket, salt);
    const isExploration =
      !seen && trackAff === 0 && jitter > 0.16 && base >= 0.85;

    const baseTotal =
      base +
      trackAff * 0.9 +
      kindAff * 0.65 +
      tagScore +
      bookmarkBonus +
      frontierBonus +
      completedAdjustment +
      reinforcementBonus +
      missedTrapBonus +
      originDiscoveryBonus +
      sourcePathPenalty +
      freshnessScore +
      jitter;

    return {
      card,
      baseTotal,
      isFrontier,
      isReinforcement,
      isExploration,
      isPreviouslyMissed,
      trackAff,
      lastSeenAt,
      recycled,
    };
  };

  // Helper to pop next compatible priorityCard without violating back-to-back traps.
  const popNextPriorityCard = (
    prevCard: ScrollCard | undefined,
    allowBackToBackTrap: boolean
  ): ScrollCard | null => {
    if (priorityQueue.length === 0) return null;

    for (let i = 0; i < priorityQueue.length; i++) {
      const card = priorityQueue[i];
      if (chosenInBatch.has(card.id)) continue;
      if (
        !allowBackToBackTrap &&
        prevCard?.kind === "trap" &&
        card.kind === "trap"
      ) {
        continue;
      }
      priorityQueue.splice(i, 1);
      return card;
    }
    return null;
  };

  // Helper to pick the best due review respecting no-consecutive-trap and track variety.
  const popNextDueReview = (
    prevCard: ScrollCard | undefined,
    allowBackToBackTrap: boolean
  ): { card: ScrollCard; srItem: ScrollSRItem; urgency: number } | null => {
    if (dueQueue.length === 0) return null;

    let bestIndex = -1;
    let bestEffective = -Infinity;

    for (let i = 0; i < dueQueue.length; i++) {
      const entry = dueQueue[i];
      if (chosenInBatch.has(entry.card.id)) continue;

      let effective = entry.urgency;
      if (
        !allowBackToBackTrap &&
        prevCard?.kind === "trap" &&
        entry.card.kind === "trap"
      ) {
        // Defer trap review by 1 slot instead of violating back-to-back trap rule.
        continue;
      }
      if (prevCard && prevCard.trackId === entry.card.trackId) {
        effective -= 25;
      }
      if (effective > bestEffective) {
        bestEffective = effective;
        bestIndex = i;
      }
    }

    if (bestIndex === -1) return null;
    const [picked] = dueQueue.splice(bestIndex, 1);
    return picked;
  };

  const allowBackToBackTrap = focusMode === "traps";

  // Special handling for `focusMode === "reviews"`:
  // Front-load due reviews, then priority AI remediation cards, then upcoming SR queue items.
  if (focusMode === "reviews") {
    while (result.length < batchSize && dueQueue.length > 0) {
      const prevCard = recentWindow[recentWindow.length - 1];
      const picked = popNextDueReview(prevCard, true);
      if (!picked) break;
      const ordinal = baseOrdinal + result.length + 1;
      const { rankTag, reasonBadge } = buildLabels({
        card: picked.card,
        ordinal,
        slotIndex: result.length,
        focusMode,
        isDueReview: true,
        srSource: picked.srItem.source,
      });
      pushItem({
        card: picked.card,
        rankTag,
        reasonBadge,
        isDueReview: true,
        score: roundScore(20 + Math.min(picked.urgency, 50) / 10),
      });
    }

    while (result.length < batchSize && priorityQueue.length > 0) {
      const prevCard = recentWindow[recentWindow.length - 1];
      const pickedPriority = popNextPriorityCard(prevCard, true);
      if (!pickedPriority) break;
      const ordinal = baseOrdinal + result.length + 1;
      const { rankTag, reasonBadge } = buildLabels({
        card: pickedPriority,
        ordinal,
        slotIndex: result.length,
        focusMode,
        isPriority: true,
      });
      pushItem(
        {
          card: pickedPriority,
          rankTag,
          reasonBadge,
          isDueReview: false,
          score: 18,
        },
        true
      );
    }

    if (result.length < batchSize) {
      const upcomingSR = Object.values(profile.srQueue)
        .filter(
          (item) =>
            item.dueAt > now &&
            !alreadyQueuedIds.has(item.cardId) &&
            !chosenInBatch.has(item.cardId)
        )
        .sort((a, b) => a.dueAt - b.dueAt);

      while (result.length < batchSize && upcomingSR.length > 0) {
        const prevCard = recentWindow[recentWindow.length - 1];
        let bestIdx = 0;
        if (prevCard) {
          const diffTrackIdx = upcomingSR.findIndex((sr) => {
            const c = cardById.get(sr.cardId);
            return c && c.trackId !== prevCard.trackId;
          });
          if (diffTrackIdx !== -1) bestIdx = diffTrackIdx;
        }
        const [srItem] = upcomingSR.splice(bestIdx, 1);
        const card = cardById.get(srItem.cardId);
        if (!card) continue;

        const ordinal = baseOrdinal + result.length + 1;
        const { rankTag, reasonBadge } = buildLabels({
          card,
          ordinal,
          slotIndex: result.length,
          focusMode,
          isUpcomingReview: true,
        });
        pushItem({
          card,
          rankTag,
          reasonBadge,
          isDueReview: false,
          score: roundScore(10),
        });
      }
    }
  }

  // Build primary unqueued candidate pool for the active focusMode.
  const allPoolCards: ScrollCard[] =
    corpus.length > 0 ? corpus : [...priorityCards];
  const modeCorpus = allPoolCards.filter((c) => matchesFocusMode(c, focusMode));
  const activePoolSource = modeCorpus.length > 0 ? modeCorpus : allPoolCards;

  const buildCandidatePool = (
    recycled: boolean,
    salt: number
  ): ScoredCandidate[] => {
    const candidates: ScoredCandidate[] = [];
    for (const card of activePoolSource) {
      if (chosenInBatch.has(card.id) || priorityIdSet.has(card.id)) continue;
      if (!recycled && alreadyQueuedIds.has(card.id)) continue;
      candidates.push(scoreCard(card, recycled, salt));
    }

    // When recycling, grant a smooth oldest-seen boost so the feed cycles cleanly
    // through the corpus without immediate repeats.
    if (recycled && candidates.length > 1) {
      let minSeen = Infinity;
      let maxSeen = -Infinity;
      for (const cand of candidates) {
        if (cand.lastSeenAt < minSeen) minSeen = cand.lastSeenAt;
        if (cand.lastSeenAt > maxSeen) maxSeen = cand.lastSeenAt;
      }
      const span = maxSeen - minSeen;
      if (span > 0) {
        for (const cand of candidates) {
          const staleness = 1 - (cand.lastSeenAt - minSeen) / span; // 1 = oldest
          cand.baseTotal += staleness * 1.4;
        }
      }
    }

    // Pre-sort descending by baseTotal so top-K candidate selection stays <2ms
    // even when multi-pool client memory reaches 2,000+ cards.
    candidates.sort((a, b) => b.baseTotal - a.baseTotal);
    return candidates;
  };

  let recyclePass = 0;
  let candidates = buildCandidatePool(false, baseOrdinal);

  const dueGap =
    focusMode === "traps"
      ? DUE_REVIEW_MIN_GAP_TRAPS
      : DUE_REVIEW_MIN_GAP_FOR_YOU;

  const scanLimit = Math.max(batchSize * 8, 120);

  while (result.length < batchSize) {
    const prevCard = recentWindow[recentWindow.length - 1];
    const prevPrevCard = recentWindow[recentWindow.length - 2];
    const slotIndex = result.length;
    const ordinal = baseOrdinal + slotIndex + 1;
    const remainingSlots = batchSize - result.length;

    // Weave high-priority dynamic cards (Gemini remediate walkthrough + twin trap / deep-dive)
    // naturally 1–4 slides ahead while respecting pacing constraints.
    if (priorityQueue.length > 0) {
      const mustDrainNow = remainingSlots <= priorityQueue.length;
      const firstReady =
        placedPriorityCount === 0 &&
        (tailCards.length > 0 ? slotIndex >= 0 : slotIndex >= 1);
      const nextSpacedReady =
        placedPriorityCount > 0 && slotsSinceLastPriority >= 2;

      if (mustDrainNow || firstReady || nextSpacedReady) {
        const pickedPriority = popNextPriorityCard(
          prevCard,
          allowBackToBackTrap
        );
        if (pickedPriority) {
          const { rankTag, reasonBadge } = buildLabels({
            card: pickedPriority,
            ordinal,
            slotIndex,
            focusMode,
            isPriority: true,
          });
          pushItem(
            {
              card: pickedPriority,
              rankTag,
              reasonBadge,
              isDueReview: false,
              score: 16,
            },
            true
          );
          continue;
        }
      }
    }

    // Interleave due spaced-repetition reviews smoothly in for-you / traps / visuals.
    if (
      focusMode !== "reviews" &&
      dueQueue.length > 0 &&
      slotsSinceLastDueReview >= dueGap &&
      !(alreadyQueuedIds.size === 0 && slotIndex < 2)
    ) {
      const pickedDue = popNextDueReview(prevCard, allowBackToBackTrap);
      if (pickedDue) {
        const { rankTag, reasonBadge } = buildLabels({
          card: pickedDue.card,
          ordinal,
          slotIndex,
          focusMode,
          isDueReview: true,
          srSource: pickedDue.srItem.source,
        });
        pushItem({
          card: pickedDue.card,
          rankTag,
          reasonBadge,
          isDueReview: true,
          score: roundScore(12 + Math.min(pickedDue.urgency, 40) / 10),
        });
        continue;
      }
    }

    // If unqueued pool is exhausted, gracefully recycle oldest-seen cards so
    // infinite scrolling NEVER runs dry!
    if (candidates.length === 0) {
      // First drain any deferred priority cards (e.g. a trap deferred by 1 slot).
      if (priorityQueue.length > 0) {
        const pickedPriority =
          popNextPriorityCard(prevCard, allowBackToBackTrap) ??
          priorityQueue.shift() ??
          null;
        if (pickedPriority) {
          const { rankTag, reasonBadge } = buildLabels({
            card: pickedPriority,
            ordinal,
            slotIndex,
            focusMode,
            isPriority: true,
          });
          pushItem(
            {
              card: pickedPriority,
              rankTag,
              reasonBadge,
              isDueReview: false,
              score: 16,
            },
            true
          );
          continue;
        }
      }

      recyclePass++;
      if (chosenInBatch.size >= activePoolSource.length) {
        chosenInBatch.clear();
        priorityIdSet.clear();
        if (prevCard && activePoolSource.length > 1) {
          chosenInBatch.add(prevCard.id);
        }
      }
      candidates = buildCandidatePool(true, baseOrdinal + recyclePass * 31);
      if (candidates.length === 0) {
        const onlyCard = activePoolSource[0];
        if (!onlyCard) break;
        candidates = [scoreCard(onlyCard, true, baseOrdinal + recyclePass * 31)];
      }
    }

    const isColdFirstSlot =
      alreadyQueuedIds.size === 0 && slotIndex === 0 && focusMode === "for-you";
    const isExploreSlot =
      focusMode === "for-you" && slotIndex > 0 && ordinal % 6 === 0;

    const evaluateCandidate = (cand: ScoredCandidate): number => {
      const card = cand.card;
      let effective = cand.baseTotal;

      // Hard-soft diversity guard 1: Never schedule 2 trap cards back-to-back
      // unless focusMode === "traps" or no alternatives exist.
      if (
        !allowBackToBackTrap &&
        prevCard?.kind === "trap" &&
        card.kind === "trap"
      ) {
        effective -= 100;
      }

      // Hard-soft diversity guard 2: Never schedule the same trackId back-to-back
      // when alternatives exist.
      if (prevCard && prevCard.trackId === card.trackId) {
        effective -= 50;
      } else if (prevPrevCard && prevPrevCard.trackId === card.trackId) {
        effective -= 0.55;
      }

      // Avoid repeating the exact last 2 cards during recycling if alternatives exist.
      if (
        cand.recycled &&
        recentWindow.some((recent) => recent.id === card.id)
      ) {
        effective -= 40;
      }

      // Cold-start slot 0: lead with a live animated visual explainer.
      if (isColdFirstSlot) {
        if (card.kind === "trap") {
          effective -= 1.4;
        } else if (card.kind === "concept" || card.kind === "evolution") {
          effective += 0.45;
        }
      }

      // Learn -> Test -> Learn pacing rhythm in "for-you" mode:
      // weave 1 interactive trap every ~3–4 visual cards.
      if (focusMode === "for-you") {
        if (visualsSinceLastTrap >= 3 && card.kind === "trap") {
          effective += 2.2;
        } else if (
          visualsSinceLastTrap === 1 &&
          card.kind === "trap" &&
          (profile.kindAffinity.trap ?? 0) < 1.5
        ) {
          effective -= 0.7;
        }

        // Encourage variety among visual explainer kinds (concept / code / evolution).
        if (
          prevCard &&
          prevCard.kind !== "trap" &&
          prevCard.kind === card.kind
        ) {
          effective -= 0.75;
        }
        if (slotsSinceLastEvolution >= 4 && card.kind === "evolution") {
          effective += 0.65;
        }
      } else if (focusMode === "visuals") {
        if (prevCard && prevCard.kind === card.kind) {
          effective -= 0.85;
        }
        if (slotsSinceLastEvolution >= 4 && card.kind === "evolution") {
          effective += 0.65;
        }
      }

      // Multi-pool origin variety: smoothly mix cppreference & procedural cards.
      if (card.origin === "reference") {
        if (
          prevCard?.origin === "reference" &&
          prevPrevCard?.origin === "reference"
        ) {
          effective -= 0.9;
        } else if (
          (focusMode === "for-you" || focusMode === "visuals") &&
          slotsSinceLastReference >= 4
        ) {
          effective += 0.55;
        }
      } else if (
        card.origin === "procedural" &&
        prevCard?.origin === "procedural"
      ) {
        effective -= 0.7;
      }

      // Gentle filter-bubble breaker every ~6 cards.
      if (isExploreSlot && cand.isExploration) {
        effective += 1.1;
      }

      return effective;
    };

    const initialEnd = Math.min(candidates.length, scanLimit);
    let bestIndex = 0;
    let bestEffective = -Infinity;

    for (let i = 0; i < initialEnd; i++) {
      const effective = evaluateCandidate(candidates[i]);
      if (effective > bestEffective) {
        bestEffective = effective;
        bestIndex = i;
      }
    }

    // If every top-K candidate hit a hard-soft diversity penalty (same track / trap),
    // scan the remainder so diversity constraints still find valid alternatives.
    if (bestEffective < -20 && initialEnd < candidates.length) {
      for (let i = initialEnd; i < candidates.length; i++) {
        const effective = evaluateCandidate(candidates[i]);
        if (effective > bestEffective) {
          bestEffective = effective;
          bestIndex = i;
        }
      }
    }

    const [picked] = candidates.splice(bestIndex, 1);
    const { rankTag, reasonBadge } = buildLabels({
      card: picked.card,
      ordinal,
      slotIndex,
      focusMode,
      isFrontier: picked.isFrontier,
      isReinforcement: picked.isReinforcement,
      isExploration: picked.isExploration,
      isPreviouslyMissed: picked.isPreviouslyMissed,
      trackAff: picked.trackAff,
    });

    pushItem({
      card: picked.card,
      rankTag,
      reasonBadge,
      isDueReview: false,
      score: roundScore(picked.baseTotal),
    });
  }

  return result;
}

/**
 * Summarizes the user's top learned tracks, preferred card kind, and due review
 * count for the minimalist streak / For-You drawer.
 */
export function getTopAffinities(
  profile: ScrollUserProfile,
  corpusMeta?: ScrollFeedMeta | { tracks?: ScrollFeedTrackMeta[] },
  options?: GetTopAffinitiesOptions
): TopAffinitiesResult {
  const limit = Math.max(1, options?.limit ?? 3);
  const now = options?.now ?? Date.now();

  const trackMetaById = new Map<string, ScrollFeedTrackMeta>();
  if (corpusMeta?.tracks) {
    for (const track of corpusMeta.tracks) {
      trackMetaById.set(track.id, track);
    }
  }

  const positiveTracks: TrackAffinitySummary[] = [];
  for (const [trackId, score] of Object.entries(profile.trackAffinity)) {
    if (!Number.isFinite(score) || score <= 0.05) continue;
    const meta = trackMetaById.get(trackId);
    positiveTracks.push({
      trackId,
      trackTitle: meta?.title ?? formatTrackFallbackTitle(trackId),
      continentId: meta?.continentId ?? "",
      continentLabel: meta?.continentLabel ?? "",
      score: roundScore(score),
      strengthPct: Math.min(100, Math.max(8, Math.round((score / 5) * 100))),
    });
  }

  positiveTracks.sort((a, b) => b.score - a.score);

  let dueReviewCount = 0;
  let totalQueuedReviews = 0;
  for (const item of Object.values(profile.srQueue)) {
    totalQueuedReviews++;
    if (item.dueAt <= now) {
      dueReviewCount++;
    }
  }

  let preferredKind: ScrollCardKind | null = null;
  let bestKindScore = 0.05;
  for (const kind of SCROLL_CARD_KINDS) {
    const score = profile.kindAffinity[kind] ?? 0;
    if (score > bestKindScore) {
      bestKindScore = score;
      preferredKind = kind;
    }
  }

  return {
    topTracks: positiveTracks.slice(0, limit),
    dueReviewCount,
    totalQueuedReviews,
    preferredKind,
  };
}
