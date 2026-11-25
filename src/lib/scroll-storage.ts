import {
  SCROLL_CARD_KINDS,
  type ScrollCard,
  type ScrollCardKind,
} from "@/lib/scroll-types";

export const SCROLL_STORAGE_KEY = "cpp-atlas-scroll-v1";
export const SCROLL_STORAGE_EVENT = "cpp-atlas-scroll-change";
export const SCROLL_DYNAMIC_STORAGE_KEY = "cpp-atlas-scroll-dynamic-v1";
export const SCROLL_DYNAMIC_STORAGE_EVENT = "cpp-atlas-scroll-dynamic-change";

export type ScrollFocusMode = "for-you" | "reviews" | "traps" | "visuals";
export type ScrollSRSource = "missed-trap" | "saved" | "manual";

export interface ScrollSeenEntry {
  count: number;
  lastSeenAt: number;
  totalDwellMs: number;
}

export interface ScrollTrapHistoryEntry {
  attempts: number;
  correct: number;
  lastResult: "correct" | "wrong";
  lastAt: number;
  selectedIndex?: number;
}

export interface ScrollSRItem {
  cardId: string;
  box: number;
  intervalMs: number;
  dueAt: number;
  lapses: number;
  source: ScrollSRSource;
}

export interface ScrollStreakState {
  currentDays: number;
  longestDays: number;
  lastActiveDay: string | null;
  todayDay: string;
  todayCards: number;
  todayTrapsRight: number;
  todayTrapsTotal: number;
  dailyGoal: number;
}

export interface ScrollPreferences {
  captionsEnabled: boolean;
  focusMode: ScrollFocusMode;
  adaptiveAiEnabled: boolean;
}

export interface ScrollRecentMissedTrap {
  cardId: string;
  trapId: string;
  topicSlug?: string;
  trackId: string;
  question: string;
  clause?: string;
  explanation: string;
  at: number;
}

export interface ScrollRecentLikedCard {
  cardId: string;
  topicSlug?: string;
  trackId: string;
  title: string;
  tags: string[];
  sourcePath?: string;
  at: number;
}

export interface ScrollUserProfile {
  likedIds: string[];
  savedIds: string[];
  seenIds: Record<string, ScrollSeenEntry>;
  trapHistory: Record<string, ScrollTrapHistoryEntry>;
  srQueue: Record<string, ScrollSRItem>;
  trackAffinity: Record<string, number>;
  kindAffinity: Record<ScrollCardKind, number>;
  tagAffinity: Record<string, number>;
  streak: ScrollStreakState;
  preferences: ScrollPreferences;
  seenSourcePaths: string[];
  recentMissedTraps: ScrollRecentMissedTrap[];
  recentLikedCards: ScrollRecentLikedCard[];
}

export interface ResetScrollWeightsOptions {
  preserveStreak?: boolean;
  preserveSaves?: boolean;
}

export interface RecordTrapAnswerOptions {
  selectedIndex?: number;
  now?: number;
}

/**
 * Leitner / SM-2 style spaced-repetition intervals:
 * - Box 0: 90s (in-session resurface after ~2–4 cards for missed traps)
 * - Box 1: 10 minutes (first save or first successful recall)
 * - Box 2: 1 day (standard saved card entry)
 * - Box 3: 3 days
 * - Box 4: 7 days
 * - Box 5: 21 days
 * - Box 6: 45 days
 */
export const SR_INTERVALS_MS: readonly number[] = [
  90_000,
  10 * 60_000,
  24 * 60 * 60_000,
  3 * 24 * 60 * 60_000,
  7 * 24 * 60 * 60_000,
  21 * 24 * 60 * 60_000,
  45 * 24 * 60 * 60_000,
] as const;

export const DEFAULT_DAILY_GOAL = 5;
export const STREAK_ACTIVE_CARD_THRESHOLD = 3;
export const MAX_DYNAMIC_CARDS = 60;

const MAX_SEEN_SOURCE_PATHS = 200;
const MAX_RECENT_MISSED_TRAPS = 15;
const MAX_RECENT_LIKED_CARDS = 15;

const TRACK_AFFINITY_MIN = -3;
const TRACK_AFFINITY_MAX = 5;
const KIND_AFFINITY_MIN = -2;
const KIND_AFFINITY_MAX = 4;
const TAG_AFFINITY_MIN = -2;
const TAG_AFFINITY_MAX = 4;

const QUICK_SKIP_MAX_MS = 1800;
const DEEP_DWELL_MIN_MS = 6000;
const MAX_SINGLE_DWELL_MS = 120_000;
const DWELL_COUNT_DEBOUNCE_MS = 5 * 60_000;
const SKIP_PENALTY_DEBOUNCE_MS = 60_000;

const VALID_FOCUS_MODES: readonly ScrollFocusMode[] = [
  "for-you",
  "reviews",
  "traps",
  "visuals",
] as const;

const VALID_SR_SOURCES: readonly ScrollSRSource[] = [
  "missed-trap",
  "saved",
  "manual",
] as const;

const DAY_STRING_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  const clamped = Math.min(max, Math.max(min, value));
  return Math.round(clamped * 1000) / 1000;
}

function createZeroKindAffinity(): Record<ScrollCardKind, number> {
  return {
    concept: 0,
    code: 0,
    evolution: 0,
    trap: 0,
  };
}

/**
 * Normalizes tags and topic slugs so variants like "Value Categories" and
 * "value-categories" share the same affinity key.
 */
export function normalizeScrollTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

function collectCardTagKeys(card: ScrollCard, includeTopicSlug = false): string[] {
  const keys = new Set<string>();
  for (const tag of card.tags) {
    const normalized = normalizeScrollTag(tag);
    if (normalized) keys.add(normalized);
  }
  if (includeTopicSlug && card.topicSlug) {
    const normalizedSlug = normalizeScrollTag(card.topicSlug);
    if (normalizedSlug) keys.add(normalizedSlug);
  }
  return Array.from(keys);
}

function pushSeenSourcePath(
  existing: readonly string[],
  sourcePath: string | undefined
): string[] {
  const trimmed = sourcePath?.trim();
  if (!trimmed) return existing as string[];
  if (existing[0] === trimmed) return existing as string[];

  const next: string[] = [trimmed];
  for (const item of existing) {
    if (item !== trimmed) {
      next.push(item);
      if (next.length >= MAX_SEEN_SOURCE_PATHS) break;
    }
  }
  return next;
}

function upsertRecentMissedTrap(
  existing: readonly ScrollRecentMissedTrap[],
  entry: ScrollRecentMissedTrap
): ScrollRecentMissedTrap[] {
  const next: ScrollRecentMissedTrap[] = [entry];
  for (const item of existing) {
    if (item.cardId !== entry.cardId) {
      next.push(item);
      if (next.length >= MAX_RECENT_MISSED_TRAPS) break;
    }
  }
  return next;
}

function removeRecentMissedTrap(
  existing: readonly ScrollRecentMissedTrap[],
  cardId: string
): ScrollRecentMissedTrap[] {
  if (!existing.some((item) => item.cardId === cardId)) {
    return existing as ScrollRecentMissedTrap[];
  }
  return existing.filter((item) => item.cardId !== cardId);
}

function upsertRecentLikedCard(
  existing: readonly ScrollRecentLikedCard[],
  entry: ScrollRecentLikedCard
): ScrollRecentLikedCard[] {
  const next: ScrollRecentLikedCard[] = [entry];
  for (const item of existing) {
    if (item.cardId !== entry.cardId) {
      next.push(item);
      if (next.length >= MAX_RECENT_LIKED_CARDS) break;
    }
  }
  return next;
}

function removeRecentLikedCard(
  existing: readonly ScrollRecentLikedCard[],
  cardId: string
): ScrollRecentLikedCard[] {
  if (!existing.some((item) => item.cardId === cardId)) {
    return existing as ScrollRecentLikedCard[];
  }
  return existing.filter((item) => item.cardId !== cardId);
}

/**
 * Returns a local-timezone YYYY-MM-DD date string for streak tracking.
 */
export function getLocalDayString(now: number = Date.now()): string {
  const date = new Date(now);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Computes signed whole-day difference (toDay - fromDay) using UTC midnight
 * so daylight-saving transitions never cause off-by-one streak errors.
 */
export function diffDayStrings(fromDay: string, toDay: string): number {
  const fromMatch = DAY_STRING_RE.exec(fromDay);
  const toMatch = DAY_STRING_RE.exec(toDay);
  if (!fromMatch || !toMatch) return 0;

  const fromUtc = Date.UTC(
    Number(fromMatch[1]),
    Number(fromMatch[2]) - 1,
    Number(fromMatch[3])
  );
  const toUtc = Date.UTC(
    Number(toMatch[1]),
    Number(toMatch[2]) - 1,
    Number(toMatch[3])
  );
  return Math.round((toUtc - fromUtc) / 86_400_000);
}

function reconcileStreakDay(
  streak: ScrollStreakState,
  now: number
): ScrollStreakState {
  const today = getLocalDayString(now);
  const lastActive = streak.lastActiveDay;
  const daysSinceActive =
    lastActive !== null ? diffDayStrings(lastActive, today) : null;

  const streakExpired = daysSinceActive !== null && daysSinceActive > 1;
  const currentDays = streakExpired ? 0 : Math.max(0, streak.currentDays);
  const longestDays = Math.max(streak.longestDays, currentDays);

  if (streak.todayDay === today) {
    if (currentDays === streak.currentDays && longestDays === streak.longestDays) {
      return streak;
    }
    return {
      ...streak,
      currentDays,
      longestDays,
    };
  }

  return {
    ...streak,
    currentDays,
    longestDays,
    todayDay: today,
    todayCards: 0,
    todayTrapsRight: 0,
    todayTrapsTotal: 0,
  };
}

function applyStreakProgress(
  streak: ScrollStreakState,
  now: number,
  deltas: {
    cards?: number;
    trapsTotal?: number;
    trapsRight?: number;
  }
): ScrollStreakState {
  const reconciled = reconcileStreakDay(streak, now);
  const today = reconciled.todayDay;

  const nextTodayCards = reconciled.todayCards + (deltas.cards ?? 0);
  const nextTodayTrapsTotal =
    reconciled.todayTrapsTotal + (deltas.trapsTotal ?? 0);
  const nextTodayTrapsRight =
    reconciled.todayTrapsRight + (deltas.trapsRight ?? 0);

  let nextCurrentDays = reconciled.currentDays;
  let nextLongestDays = reconciled.longestDays;
  let nextLastActiveDay = reconciled.lastActiveDay;

  if (
    nextTodayCards >= STREAK_ACTIVE_CARD_THRESHOLD &&
    nextLastActiveDay !== today
  ) {
    const gap =
      nextLastActiveDay !== null
        ? diffDayStrings(nextLastActiveDay, today)
        : null;
    if (gap === 1) {
      nextCurrentDays = Math.max(1, reconciled.currentDays) + 1;
    } else if (gap !== null && gap <= 0) {
      // System clock moved backwards; keep existing streak safely.
      nextCurrentDays = Math.max(1, reconciled.currentDays);
    } else {
      nextCurrentDays = 1;
    }
    nextLastActiveDay = today;
    nextLongestDays = Math.max(nextLongestDays, nextCurrentDays);
  }

  return {
    ...reconciled,
    currentDays: nextCurrentDays,
    longestDays: nextLongestDays,
    lastActiveDay: nextLastActiveDay,
    todayCards: nextTodayCards,
    todayTrapsRight: nextTodayTrapsRight,
    todayTrapsTotal: nextTodayTrapsTotal,
  };
}

function nudgeTrackAffinity(
  map: Record<string, number>,
  trackId: string,
  delta: number
): Record<string, number> {
  if (!trackId || delta === 0) return map;
  const nextValue = clamp(
    (map[trackId] ?? 0) + delta,
    TRACK_AFFINITY_MIN,
    TRACK_AFFINITY_MAX
  );
  if (nextValue === 0) {
    if (!Object.prototype.hasOwnProperty.call(map, trackId)) return map;
    const copy = { ...map };
    delete copy[trackId];
    return copy;
  }
  return { ...map, [trackId]: nextValue };
}

function nudgeKindAffinity(
  map: Record<ScrollCardKind, number>,
  kind: ScrollCardKind,
  delta: number
): Record<ScrollCardKind, number> {
  if (delta === 0) return map;
  return {
    ...map,
    [kind]: clamp((map[kind] ?? 0) + delta, KIND_AFFINITY_MIN, KIND_AFFINITY_MAX),
  };
}

function nudgeTagAffinity(
  map: Record<string, number>,
  tagKeys: readonly string[],
  delta: number
): Record<string, number> {
  if (tagKeys.length === 0 || delta === 0) return map;
  let next: Record<string, number> | null = null;
  for (const key of tagKeys) {
    const current = (next ?? map)[key] ?? 0;
    const updated = clamp(current + delta, TAG_AFFINITY_MIN, TAG_AFFINITY_MAX);
    if (updated === current) continue;
    if (!next) next = { ...map };
    if (updated === 0) {
      delete next[key];
    } else {
      next[key] = updated;
    }
  }
  return next ?? map;
}

function advanceSRItem(item: ScrollSRItem, now: number): ScrollSRItem {
  const nextBox = Math.min(item.box + 1, SR_INTERVALS_MS.length - 1);
  const intervalMs = SR_INTERVALS_MS[nextBox];
  return {
    ...item,
    box: nextBox,
    intervalMs,
    dueAt: now + intervalMs,
  };
}

export function createDefaultScrollProfile(now?: number): ScrollUserProfile {
  const todayDay =
    now !== undefined
      ? getLocalDayString(now)
      : typeof window !== "undefined"
        ? getLocalDayString()
        : "";
  return {
    likedIds: [],
    savedIds: [],
    seenIds: {},
    trapHistory: {},
    srQueue: {},
    trackAffinity: {},
    kindAffinity: createZeroKindAffinity(),
    tagAffinity: {},
    streak: {
      currentDays: 0,
      longestDays: 0,
      lastActiveDay: null,
      todayDay,
      todayCards: 0,
      todayTrapsRight: 0,
      todayTrapsTotal: 0,
      dailyGoal: DEFAULT_DAILY_GOAL,
    },
    preferences: {
      captionsEnabled: false,
      focusMode: "for-you",
      adaptiveAiEnabled: true,
    },
    seenSourcePaths: [],
    recentMissedTraps: [],
    recentLikedCards: [],
  };
}

function sanitizeStringArray(value: unknown, maxLength?: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      const trimmed = item.trim();
      if (trimmed.length > 0 && !seen.has(trimmed)) {
        seen.add(trimmed);
        out.push(trimmed);
        if (maxLength !== undefined && out.length >= maxLength) break;
      }
    }
  }
  return out;
}

function sanitizeSeenIds(value: unknown): Record<string, ScrollSeenEntry> {
  if (!isPlainObject(value)) return {};
  const out: Record<string, ScrollSeenEntry> = {};
  for (const [id, entry] of Object.entries(value)) {
    if (!id || !isPlainObject(entry)) continue;
    const count =
      typeof entry.count === "number" && Number.isFinite(entry.count)
        ? Math.max(0, Math.floor(entry.count))
        : 0;
    const lastSeenAt =
      typeof entry.lastSeenAt === "number" && Number.isFinite(entry.lastSeenAt)
        ? Math.max(0, entry.lastSeenAt)
        : 0;
    const totalDwellMs =
      typeof entry.totalDwellMs === "number" &&
      Number.isFinite(entry.totalDwellMs)
        ? Math.max(0, entry.totalDwellMs)
        : 0;
    out[id] = { count, lastSeenAt, totalDwellMs };
  }
  return out;
}

function sanitizeTrapHistory(
  value: unknown
): Record<string, ScrollTrapHistoryEntry> {
  if (!isPlainObject(value)) return {};
  const out: Record<string, ScrollTrapHistoryEntry> = {};
  for (const [id, entry] of Object.entries(value)) {
    if (!id || !isPlainObject(entry)) continue;
    const attempts =
      typeof entry.attempts === "number" && Number.isFinite(entry.attempts)
        ? Math.max(0, Math.floor(entry.attempts))
        : 0;
    const correct =
      typeof entry.correct === "number" && Number.isFinite(entry.correct)
        ? Math.max(0, Math.min(attempts, Math.floor(entry.correct)))
        : 0;
    const lastResult =
      entry.lastResult === "correct" || entry.lastResult === "wrong"
        ? entry.lastResult
        : "wrong";
    const lastAt =
      typeof entry.lastAt === "number" && Number.isFinite(entry.lastAt)
        ? Math.max(0, entry.lastAt)
        : 0;
    const sanitized: ScrollTrapHistoryEntry = {
      attempts,
      correct,
      lastResult,
      lastAt,
    };
    if (
      typeof entry.selectedIndex === "number" &&
      Number.isFinite(entry.selectedIndex) &&
      entry.selectedIndex >= 0
    ) {
      sanitized.selectedIndex = Math.floor(entry.selectedIndex);
    }
    out[id] = sanitized;
  }
  return out;
}

function sanitizeSRQueue(value: unknown): Record<string, ScrollSRItem> {
  if (!isPlainObject(value)) return {};
  const out: Record<string, ScrollSRItem> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!key || !isPlainObject(entry)) continue;
    const cardId =
      typeof entry.cardId === "string" && entry.cardId.length > 0
        ? entry.cardId
        : key;
    const box =
      typeof entry.box === "number" && Number.isFinite(entry.box)
        ? Math.max(0, Math.min(SR_INTERVALS_MS.length - 1, Math.floor(entry.box)))
        : 0;
    const intervalMs =
      typeof entry.intervalMs === "number" &&
      Number.isFinite(entry.intervalMs) &&
      entry.intervalMs > 0
        ? entry.intervalMs
        : SR_INTERVALS_MS[box];
    const dueAt =
      typeof entry.dueAt === "number" && Number.isFinite(entry.dueAt)
        ? Math.max(0, entry.dueAt)
        : 0;
    const lapses =
      typeof entry.lapses === "number" && Number.isFinite(entry.lapses)
        ? Math.max(0, Math.floor(entry.lapses))
        : 0;
    const source = VALID_SR_SOURCES.includes(entry.source as ScrollSRSource)
      ? (entry.source as ScrollSRSource)
      : "manual";
    out[cardId] = { cardId, box, intervalMs, dueAt, lapses, source };
  }
  return out;
}

function sanitizeAffinityMap(
  value: unknown,
  min: number,
  max: number,
  normalizeKeys = false
): Record<string, number> {
  if (!isPlainObject(value)) return {};
  const out: Record<string, number> = {};
  for (const [rawKey, rawVal] of Object.entries(value)) {
    if (!rawKey || typeof rawVal !== "number" || !Number.isFinite(rawVal)) {
      continue;
    }
    const key = normalizeKeys ? normalizeScrollTag(rawKey) : rawKey;
    if (!key) continue;
    const clamped = clamp(rawVal, min, max);
    if (clamped !== 0) {
      out[key] = clamped;
    }
  }
  return out;
}

function sanitizeKindAffinity(value: unknown): Record<ScrollCardKind, number> {
  const out = createZeroKindAffinity();
  if (!isPlainObject(value)) return out;
  for (const kind of SCROLL_CARD_KINDS) {
    const rawVal = value[kind];
    if (typeof rawVal === "number" && Number.isFinite(rawVal)) {
      out[kind] = clamp(rawVal, KIND_AFFINITY_MIN, KIND_AFFINITY_MAX);
    }
  }
  return out;
}

function sanitizeStreak(value: unknown, now: number): ScrollStreakState {
  const today = getLocalDayString(now);
  if (!isPlainObject(value)) {
    return {
      currentDays: 0,
      longestDays: 0,
      lastActiveDay: null,
      todayDay: today,
      todayCards: 0,
      todayTrapsRight: 0,
      todayTrapsTotal: 0,
      dailyGoal: DEFAULT_DAILY_GOAL,
    };
  }

  const currentDays =
    typeof value.currentDays === "number" && Number.isFinite(value.currentDays)
      ? Math.max(0, Math.floor(value.currentDays))
      : 0;
  const longestDays =
    typeof value.longestDays === "number" && Number.isFinite(value.longestDays)
      ? Math.max(currentDays, Math.floor(value.longestDays))
      : currentDays;
  const lastActiveDay =
    typeof value.lastActiveDay === "string" &&
    DAY_STRING_RE.test(value.lastActiveDay)
      ? value.lastActiveDay
      : null;
  const todayDay =
    typeof value.todayDay === "string" && DAY_STRING_RE.test(value.todayDay)
      ? value.todayDay
      : today;
  const todayCards =
    typeof value.todayCards === "number" && Number.isFinite(value.todayCards)
      ? Math.max(0, Math.floor(value.todayCards))
      : 0;
  const todayTrapsRight =
    typeof value.todayTrapsRight === "number" &&
    Number.isFinite(value.todayTrapsRight)
      ? Math.max(0, Math.floor(value.todayTrapsRight))
      : 0;
  const todayTrapsTotal =
    typeof value.todayTrapsTotal === "number" &&
    Number.isFinite(value.todayTrapsTotal)
      ? Math.max(todayTrapsRight, Math.floor(value.todayTrapsTotal))
      : todayTrapsRight;
  const dailyGoal =
    typeof value.dailyGoal === "number" &&
    Number.isFinite(value.dailyGoal) &&
    value.dailyGoal >= 1
      ? Math.min(50, Math.floor(value.dailyGoal))
      : DEFAULT_DAILY_GOAL;

  return reconcileStreakDay(
    {
      currentDays,
      longestDays,
      lastActiveDay,
      todayDay,
      todayCards,
      todayTrapsRight,
      todayTrapsTotal,
      dailyGoal,
    },
    now
  );
}

function sanitizePreferences(value: unknown): ScrollPreferences {
  if (!isPlainObject(value)) {
    return {
      captionsEnabled: false,
      focusMode: "for-you",
      adaptiveAiEnabled: true,
    };
  }
  const captionsEnabled = Boolean(value.captionsEnabled);
  const focusMode = VALID_FOCUS_MODES.includes(
    value.focusMode as ScrollFocusMode
  )
    ? (value.focusMode as ScrollFocusMode)
    : "for-you";
  const adaptiveAiEnabled =
    typeof value.adaptiveAiEnabled === "boolean"
      ? value.adaptiveAiEnabled
      : true;
  return { captionsEnabled, focusMode, adaptiveAiEnabled };
}

function sanitizeRecentMissedTraps(value: unknown): ScrollRecentMissedTrap[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: ScrollRecentMissedTrap[] = [];
  for (const raw of value) {
    if (!isPlainObject(raw)) continue;
    if (
      typeof raw.cardId !== "string" ||
      !raw.cardId ||
      seen.has(raw.cardId) ||
      typeof raw.trapId !== "string" ||
      !raw.trapId ||
      typeof raw.trackId !== "string" ||
      !raw.trackId ||
      typeof raw.question !== "string" ||
      typeof raw.explanation !== "string"
    ) {
      continue;
    }
    const at =
      typeof raw.at === "number" && Number.isFinite(raw.at)
        ? Math.max(0, raw.at)
        : 0;
    const entry: ScrollRecentMissedTrap = {
      cardId: raw.cardId,
      trapId: raw.trapId,
      trackId: raw.trackId,
      question: raw.question,
      explanation: raw.explanation,
      at,
    };
    if (typeof raw.topicSlug === "string" && raw.topicSlug.trim()) {
      entry.topicSlug = raw.topicSlug.trim();
    }
    if (typeof raw.clause === "string" && raw.clause.trim()) {
      entry.clause = raw.clause.trim();
    }
    seen.add(entry.cardId);
    out.push(entry);
    if (out.length >= MAX_RECENT_MISSED_TRAPS) break;
  }
  return out;
}

function sanitizeRecentLikedCards(value: unknown): ScrollRecentLikedCard[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: ScrollRecentLikedCard[] = [];
  for (const raw of value) {
    if (!isPlainObject(raw)) continue;
    if (
      typeof raw.cardId !== "string" ||
      !raw.cardId ||
      seen.has(raw.cardId) ||
      typeof raw.trackId !== "string" ||
      !raw.trackId ||
      typeof raw.title !== "string"
    ) {
      continue;
    }
    const at =
      typeof raw.at === "number" && Number.isFinite(raw.at)
        ? Math.max(0, raw.at)
        : 0;
    const entry: ScrollRecentLikedCard = {
      cardId: raw.cardId,
      trackId: raw.trackId,
      title: raw.title,
      tags: sanitizeStringArray(raw.tags, 10),
      at,
    };
    if (typeof raw.topicSlug === "string" && raw.topicSlug.trim()) {
      entry.topicSlug = raw.topicSlug.trim();
    }
    if (typeof raw.sourcePath === "string" && raw.sourcePath.trim()) {
      entry.sourcePath = raw.sourcePath.trim();
    }
    seen.add(entry.cardId);
    out.push(entry);
    if (out.length >= MAX_RECENT_LIKED_CARDS) break;
  }
  return out;
}

function sanitizeScrollProfile(
  raw: Record<string, unknown>,
  now: number
): ScrollUserProfile {
  return {
    likedIds: sanitizeStringArray(raw.likedIds),
    savedIds: sanitizeStringArray(raw.savedIds),
    seenIds: sanitizeSeenIds(raw.seenIds),
    trapHistory: sanitizeTrapHistory(raw.trapHistory),
    srQueue: sanitizeSRQueue(raw.srQueue),
    trackAffinity: sanitizeAffinityMap(
      raw.trackAffinity,
      TRACK_AFFINITY_MIN,
      TRACK_AFFINITY_MAX
    ),
    kindAffinity: sanitizeKindAffinity(raw.kindAffinity),
    tagAffinity: sanitizeAffinityMap(
      raw.tagAffinity,
      TAG_AFFINITY_MIN,
      TAG_AFFINITY_MAX,
      true
    ),
    streak: sanitizeStreak(raw.streak, now),
    preferences: sanitizePreferences(raw.preferences),
    seenSourcePaths: sanitizeStringArray(
      raw.seenSourcePaths,
      MAX_SEEN_SOURCE_PATHS
    ),
    recentMissedTraps: sanitizeRecentMissedTraps(raw.recentMissedTraps),
    recentLikedCards: sanitizeRecentLikedCards(raw.recentLikedCards),
  };
}

function isValidStoredScrollCard(value: unknown): value is ScrollCard {
  if (!isPlainObject(value)) return false;
  if (
    typeof value.id !== "string" ||
    !value.id ||
    !SCROLL_CARD_KINDS.includes(value.kind as ScrollCardKind) ||
    typeof value.title !== "string" ||
    typeof value.summary !== "string" ||
    typeof value.trackId !== "string" ||
    typeof value.readHref !== "string" ||
    !Array.isArray(value.tags) ||
    !Array.isArray(value.captions) ||
    !isPlainObject(value.stage) ||
    value.stage.type !== value.kind
  ) {
    return false;
  }
  return true;
}

/**
 * Loads the persisted ScrollUserProfile from localStorage with SSR guards,
 * JSON parse recovery, backwards-compatible v1 -> v2 migration, field
 * sanitization, and automatic midnight day rollover.
 */
export function loadScrollProfile(now: number = Date.now()): ScrollUserProfile {
  if (typeof window === "undefined") {
    return createDefaultScrollProfile();
  }
  try {
    const raw = window.localStorage.getItem(SCROLL_STORAGE_KEY);
    if (!raw) {
      return createDefaultScrollProfile(now);
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainObject(parsed)) {
      return createDefaultScrollProfile(now);
    }
    return sanitizeScrollProfile(parsed, now);
  } catch {
    return createDefaultScrollProfile(now);
  }
}

/**
 * Persists the ScrollUserProfile safely to localStorage and notifies listeners.
 */
export function saveScrollProfile(profile: ScrollUserProfile): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SCROLL_STORAGE_KEY, JSON.stringify(profile));
    window.dispatchEvent(new Event(SCROLL_STORAGE_EVENT));
  } catch {
    // Ignore storage quota or private-mode errors gracefully.
  }
}

/**
 * Loads persisted dynamic cards (AI-generated + streamed reference cards)
 * under `cpp-atlas-scroll-dynamic-v1` so saved AI cards and missed twin traps
 * survive reloads and spaced-repetition resurfacing.
 */
export function loadDynamicCards(): ScrollCard[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SCROLL_DYNAMIC_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: ScrollCard[] = [];
    for (const item of parsed) {
      if (!isValidStoredScrollCard(item) || seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
      if (out.length >= MAX_DYNAMIC_CARDS) break;
    }
    return out;
  } catch {
    return [];
  }
}

function selectDynamicCardsToPersist(
  cards: readonly ScrollCard[],
  profile?: ScrollUserProfile,
  maxCards: number = MAX_DYNAMIC_CARDS
): ScrollCard[] {
  // Deduplicate keeping the latest occurrence of each non-core card.
  const deduped = new Map<string, { card: ScrollCard; order: number }>();
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    if (!card || !card.id || card.origin === "core") continue;
    deduped.set(card.id, { card, order: i });
  }

  const savedSet = new Set(profile?.savedIds ?? []);
  const likedSet = new Set(profile?.likedIds ?? []);
  const srQueue = profile?.srQueue ?? {};

  const entries = Array.from(deduped.values());

  const priorityRank = (card: ScrollCard): number => {
    const pinnedByUser =
      Object.prototype.hasOwnProperty.call(srQueue, card.id) ||
      savedSet.has(card.id) ||
      likedSet.has(card.id);
    if (pinnedByUser) {
      if (card.origin === "ai") return 50;
      if (card.origin === "reference") return 45;
      return 40;
    }
    if (card.origin === "ai") return 30;
    if (card.origin === "reference") return 20;
    return 10;
  };

  // Sort highest retention priority first, then most recently added first.
  entries.sort((a, b) => {
    const rankDiff = priorityRank(b.card) - priorityRank(a.card);
    if (rankDiff !== 0) return rankDiff;
    return b.order - a.order;
  });

  return entries.slice(0, maxCards).map((entry) => entry.card);
}

/**
 * Persists a bounded set (<= 60) of dynamic (AI / reference / non-core) cards
 * under `cpp-atlas-scroll-dynamic-v1`, always preserving cards in `srQueue`,
 * `savedIds`, or `likedIds` first. Returns the pruned list persisted.
 */
export function saveDynamicCards(
  cards: readonly ScrollCard[],
  profile?: ScrollUserProfile
): ScrollCard[] {
  const pruned = selectDynamicCardsToPersist(cards, profile, MAX_DYNAMIC_CARDS);
  if (typeof window === "undefined") return pruned;

  try {
    window.localStorage.setItem(
      SCROLL_DYNAMIC_STORAGE_KEY,
      JSON.stringify(pruned)
    );
    window.dispatchEvent(new Event(SCROLL_DYNAMIC_STORAGE_EVENT));
    return pruned;
  } catch {
    // Quota fallback: retry with a leaner cap prioritizing pinned/AI cards.
    const compact = selectDynamicCardsToPersist(
      pruned,
      profile,
      Math.min(24, pruned.length)
    );
    try {
      window.localStorage.setItem(
        SCROLL_DYNAMIC_STORAGE_KEY,
        JSON.stringify(compact)
      );
      window.dispatchEvent(new Event(SCROLL_DYNAMIC_STORAGE_EVENT));
      return compact;
    } catch {
      return pruned;
    }
  }
}

/**
 * Pure helper to roll over streak counters across midnight when displaying
 * or updating an in-memory profile during a long session.
 */
export function reconcileScrollStreak(
  profile: ScrollUserProfile,
  now: number = Date.now()
): ScrollUserProfile {
  const nextStreak = reconcileStreakDay(profile.streak, now);
  if (nextStreak === profile.streak) return profile;
  return {
    ...profile,
    streak: nextStreak,
  };
}

/**
 * Resets adaptive For-You weights (track, kind, tag affinities) while
 * preserving daily streak and saved items by default.
 */
export function resetScrollWeights(
  profile: ScrollUserProfile,
  options?: ResetScrollWeightsOptions,
  now: number = Date.now()
): ScrollUserProfile {
  const preserveStreak = options?.preserveStreak ?? true;
  const preserveSaves = options?.preserveSaves ?? true;

  let nextSRQueue = profile.srQueue;
  if (!preserveSaves) {
    const filtered: Record<string, ScrollSRItem> = {};
    for (const [id, item] of Object.entries(profile.srQueue)) {
      if (item.source !== "saved") {
        filtered[id] = item;
      }
    }
    nextSRQueue = filtered;
  }

  return {
    ...profile,
    likedIds: preserveSaves ? profile.likedIds : [],
    savedIds: preserveSaves ? profile.savedIds : [],
    recentLikedCards: preserveSaves ? profile.recentLikedCards : [],
    srQueue: nextSRQueue,
    trackAffinity: {},
    kindAffinity: createZeroKindAffinity(),
    tagAffinity: {},
    streak: preserveStreak
      ? reconcileStreakDay(profile.streak, now)
      : {
          currentDays: 0,
          longestDays: 0,
          lastActiveDay: null,
          todayDay: getLocalDayString(now),
          todayCards: 0,
          todayTrapsRight: 0,
          todayTrapsTotal: 0,
          dailyGoal: profile.streak.dailyGoal || DEFAULT_DAILY_GOAL,
        },
  };
}

/**
 * Records dwell time when leaving or absorbing a card:
 * - Always records `card.sourcePath` in the capped `seenSourcePaths` LRU.
 * - `< 1800ms` (quick skip): nudges track/kind/tag affinity by `-0.25`.
 * - `>= 6000ms` (engaged watch): nudges track/kind/tag affinity by `+0.35`,
 *   counts toward `todayCards` & streak (debounced per 5m window), and advances
 *   due non-trap saved reviews automatically.
 */
export function recordDwell(
  profile: ScrollUserProfile,
  card: ScrollCard,
  dwellMs: number,
  now: number = Date.now()
): ScrollUserProfile {
  if (!Number.isFinite(dwellMs) || dwellMs <= 0) {
    return profile;
  }

  const clampedDwell = Math.min(Math.round(dwellMs), MAX_SINGLE_DWELL_MS);
  const prevSeen = profile.seenIds[card.id];
  const tagKeys = collectCardTagKeys(card);
  const nextSeenSourcePaths = pushSeenSourcePath(
    profile.seenSourcePaths,
    card.sourcePath
  );

  const wasRecentlyCounted = Boolean(
    prevSeen &&
      prevSeen.totalDwellMs >= DEEP_DWELL_MIN_MS &&
      now - prevSeen.lastSeenAt < DWELL_COUNT_DEBOUNCE_MS
  );
  const wasRecentlySkipped = Boolean(
    prevSeen &&
      prevSeen.totalDwellMs < DEEP_DWELL_MIN_MS &&
      now - prevSeen.lastSeenAt < SKIP_PENALTY_DEBOUNCE_MS
  );

  if (clampedDwell >= DEEP_DWELL_MIN_MS) {
    const nextSeen: ScrollSeenEntry = {
      count: (prevSeen?.count ?? 0) + (wasRecentlyCounted ? 0 : 1),
      lastSeenAt: now,
      totalDwellMs: (prevSeen?.totalDwellMs ?? 0) + clampedDwell,
    };

    let nextSRQueue = profile.srQueue;
    const existingSR = profile.srQueue[card.id];
    if (
      existingSR &&
      card.kind !== "trap" &&
      existingSR.dueAt <= now &&
      !wasRecentlyCounted
    ) {
      nextSRQueue = {
        ...profile.srQueue,
        [card.id]: advanceSRItem(existingSR, now),
      };
    }

    if (wasRecentlyCounted) {
      return {
        ...profile,
        seenIds: { ...profile.seenIds, [card.id]: nextSeen },
        seenSourcePaths: nextSeenSourcePaths,
        streak: reconcileStreakDay(profile.streak, now),
      };
    }

    return {
      ...profile,
      seenIds: { ...profile.seenIds, [card.id]: nextSeen },
      seenSourcePaths: nextSeenSourcePaths,
      srQueue: nextSRQueue,
      trackAffinity: nudgeTrackAffinity(
        profile.trackAffinity,
        card.trackId,
        0.35
      ),
      kindAffinity: nudgeKindAffinity(profile.kindAffinity, card.kind, 0.35),
      tagAffinity: nudgeTagAffinity(profile.tagAffinity, tagKeys, 0.35),
      streak: applyStreakProgress(profile.streak, now, { cards: 1 }),
    };
  }

  if (clampedDwell < QUICK_SKIP_MAX_MS) {
    const nextSeen: ScrollSeenEntry = {
      count:
        (prevSeen?.count ?? 0) +
        (wasRecentlySkipped || wasRecentlyCounted ? 0 : 1),
      lastSeenAt: now,
      totalDwellMs: (prevSeen?.totalDwellMs ?? 0) + clampedDwell,
    };

    if (wasRecentlySkipped || wasRecentlyCounted) {
      return {
        ...profile,
        seenIds: { ...profile.seenIds, [card.id]: nextSeen },
        seenSourcePaths: nextSeenSourcePaths,
        streak: reconcileStreakDay(profile.streak, now),
      };
    }

    return {
      ...profile,
      seenIds: { ...profile.seenIds, [card.id]: nextSeen },
      seenSourcePaths: nextSeenSourcePaths,
      trackAffinity: nudgeTrackAffinity(
        profile.trackAffinity,
        card.trackId,
        -0.25
      ),
      kindAffinity: nudgeKindAffinity(profile.kindAffinity, card.kind, -0.25),
      tagAffinity: nudgeTagAffinity(profile.tagAffinity, tagKeys, -0.25),
      streak: reconcileStreakDay(profile.streak, now),
    };
  }

  // Neutral glance (1.8s <= dwell < 6.0s): record freshness without nudging weights.
  const recentlyTouched = Boolean(prevSeen && now - prevSeen.lastSeenAt < 30_000);
  const nextSeen: ScrollSeenEntry = {
    count: (prevSeen?.count ?? 0) + (recentlyTouched ? 0 : 1),
    lastSeenAt: now,
    totalDwellMs: (prevSeen?.totalDwellMs ?? 0) + clampedDwell,
  };

  return {
    ...profile,
    seenIds: { ...profile.seenIds, [card.id]: nextSeen },
    seenSourcePaths: nextSeenSourcePaths,
    streak: reconcileStreakDay(profile.streak, now),
  };
}

/**
 * Toggles like on a card. Liking boosts track (+0.8), kind (+0.4), tags (+0.35)
 * and records the card in `recentLikedCards` (+ `seenSourcePaths`); unliking
 * symmetrically reverses the boost and removes it from `recentLikedCards`.
 */
export function recordLike(
  profile: ScrollUserProfile,
  card: ScrollCard,
  now: number = Date.now()
): ScrollUserProfile {
  const alreadyLiked = profile.likedIds.includes(card.id);
  const sign = alreadyLiked ? -1 : 1;
  const tagKeys = collectCardTagKeys(card);

  const nextLikedIds = alreadyLiked
    ? profile.likedIds.filter((id) => id !== card.id)
    : [...profile.likedIds, card.id];

  const nextRecentLikedCards = alreadyLiked
    ? removeRecentLikedCard(profile.recentLikedCards, card.id)
    : upsertRecentLikedCard(profile.recentLikedCards, {
        cardId: card.id,
        ...(card.topicSlug ? { topicSlug: card.topicSlug } : {}),
        trackId: card.trackId,
        title: card.title,
        tags: card.tags.slice(0, 8),
        ...(card.sourcePath ? { sourcePath: card.sourcePath } : {}),
        at: now,
      });

  const nextSeenSourcePaths = alreadyLiked
    ? profile.seenSourcePaths
    : pushSeenSourcePath(profile.seenSourcePaths, card.sourcePath);

  return {
    ...profile,
    likedIds: nextLikedIds,
    recentLikedCards: nextRecentLikedCards,
    seenSourcePaths: nextSeenSourcePaths,
    trackAffinity: nudgeTrackAffinity(
      profile.trackAffinity,
      card.trackId,
      0.8 * sign
    ),
    kindAffinity: nudgeKindAffinity(profile.kindAffinity, card.kind, 0.4 * sign),
    tagAffinity: nudgeTagAffinity(profile.tagAffinity, tagKeys, 0.35 * sign),
    streak: reconcileStreakDay(profile.streak, now),
  };
}

/**
 * Toggles save/bookmark on a card. Saving schedules it into spaced repetition
 * (`source: "saved"`, entering at 10m for the very first save or 1d otherwise)
 * and boosts track/kind/tag affinity.
 */
export function recordSave(
  profile: ScrollUserProfile,
  card: ScrollCard,
  now: number = Date.now()
): ScrollUserProfile {
  const alreadySaved = profile.savedIds.includes(card.id);
  const sign = alreadySaved ? -1 : 1;
  const tagKeys = collectCardTagKeys(card);

  const nextSavedIds = alreadySaved
    ? profile.savedIds.filter((id) => id !== card.id)
    : [...profile.savedIds, card.id];

  let nextSRQueue = profile.srQueue;
  if (alreadySaved) {
    const existing = profile.srQueue[card.id];
    if (existing && existing.source === "saved") {
      const copy = { ...profile.srQueue };
      delete copy[card.id];
      nextSRQueue = copy;
    }
  } else if (!profile.srQueue[card.id]) {
    const entryBox = profile.savedIds.length === 0 ? 1 : 2;
    const intervalMs = SR_INTERVALS_MS[entryBox];
    nextSRQueue = {
      ...profile.srQueue,
      [card.id]: {
        cardId: card.id,
        box: entryBox,
        intervalMs,
        dueAt: now + intervalMs,
        lapses: 0,
        source: "saved",
      },
    };
  }

  return {
    ...profile,
    savedIds: nextSavedIds,
    srQueue: nextSRQueue,
    seenSourcePaths: alreadySaved
      ? profile.seenSourcePaths
      : pushSeenSourcePath(profile.seenSourcePaths, card.sourcePath),
    trackAffinity: nudgeTrackAffinity(
      profile.trackAffinity,
      card.trackId,
      0.6 * sign
    ),
    kindAffinity: nudgeKindAffinity(
      profile.kindAffinity,
      card.kind,
      0.35 * sign
    ),
    tagAffinity: nudgeTagAffinity(profile.tagAffinity, tagKeys, 0.4 * sign),
    streak: reconcileStreakDay(profile.streak, now),
  };
}

/**
 * Records a click on the primary "Read" deep-link CTA: strong curiosity signal
 * (+0.7 track/tags) and counts toward `todayCards` if not already counted recently.
 */
export function recordReadClick(
  profile: ScrollUserProfile,
  card: ScrollCard,
  now: number = Date.now()
): ScrollUserProfile {
  const prevSeen = profile.seenIds[card.id];
  const wasRecentlyCounted = Boolean(
    prevSeen &&
      prevSeen.totalDwellMs >= DEEP_DWELL_MIN_MS &&
      now - prevSeen.lastSeenAt < DWELL_COUNT_DEBOUNCE_MS
  );
  const tagKeys = collectCardTagKeys(card, true);

  const nextSeen: ScrollSeenEntry = {
    count: (prevSeen?.count ?? 0) + (wasRecentlyCounted ? 0 : 1),
    lastSeenAt: now,
    totalDwellMs: Math.max(prevSeen?.totalDwellMs ?? 0, DEEP_DWELL_MIN_MS),
  };

  let nextSRQueue = profile.srQueue;
  const existingSR = profile.srQueue[card.id];
  if (
    existingSR &&
    card.kind !== "trap" &&
    existingSR.dueAt <= now &&
    !wasRecentlyCounted
  ) {
    nextSRQueue = {
      ...profile.srQueue,
      [card.id]: advanceSRItem(existingSR, now),
    };
  }

  return {
    ...profile,
    seenIds: { ...profile.seenIds, [card.id]: nextSeen },
    seenSourcePaths: pushSeenSourcePath(
      profile.seenSourcePaths,
      card.sourcePath
    ),
    srQueue: nextSRQueue,
    trackAffinity: nudgeTrackAffinity(profile.trackAffinity, card.trackId, 0.7),
    tagAffinity: nudgeTagAffinity(profile.tagAffinity, tagKeys, 0.7),
    streak: wasRecentlyCounted
      ? reconcileStreakDay(profile.streak, now)
      : applyStreakProgress(profile.streak, now, { cards: 1 }),
  };
}

/**
 * Records an interactive 1-tap Trap Quiz answer:
 * - Updates `trapHistory[card.id]`, `streak.todayTrapsRight/Total`, `todayCards`,
 *   `seenSourcePaths`, and `recentMissedTraps`.
 * - If WRONG: schedules immediate 90s in-session spaced repetition (`box: 0`,
 *   increments `lapses`), records in `recentMissedTraps` for adaptive Gemini
 *   remediation, AND boosts track/topic/tag + concept/code affinities.
 * - If CORRECT: advances `srQueue` box if present, clears from `recentMissedTraps`,
 *   and gently boosts mastery.
 */
export function recordTrapAnswer(
  profile: ScrollUserProfile,
  card: ScrollCard,
  isCorrect: boolean,
  options?: RecordTrapAnswerOptions
): ScrollUserProfile {
  const now = options?.now ?? Date.now();
  const prevHistory = profile.trapHistory[card.id];
  const prevSeen = profile.seenIds[card.id];
  const wasRecentlyCounted = Boolean(
    prevSeen &&
      prevSeen.totalDwellMs >= DEEP_DWELL_MIN_MS &&
      now - prevSeen.lastSeenAt < DWELL_COUNT_DEBOUNCE_MS
  );

  const nextHistoryEntry: ScrollTrapHistoryEntry = {
    attempts: (prevHistory?.attempts ?? 0) + 1,
    correct: (prevHistory?.correct ?? 0) + (isCorrect ? 1 : 0),
    lastResult: isCorrect ? "correct" : "wrong",
    lastAt: now,
    ...(options?.selectedIndex !== undefined
      ? { selectedIndex: options.selectedIndex }
      : prevHistory?.selectedIndex !== undefined
        ? { selectedIndex: prevHistory.selectedIndex }
        : {}),
  };

  // Mark card as engaged in seenIds so immediately swiping away after answering
  // does not double-count todayCards or trigger a <1.8s quick-skip penalty.
  const nextSeen: ScrollSeenEntry = {
    count: (prevSeen?.count ?? 0) + (wasRecentlyCounted ? 0 : 1),
    lastSeenAt: now,
    totalDwellMs: Math.max(prevSeen?.totalDwellMs ?? 0, DEEP_DWELL_MIN_MS),
  };

  const existingSR = profile.srQueue[card.id];
  let nextSRQueue = profile.srQueue;
  let nextTrackAffinity = profile.trackAffinity;
  let nextKindAffinity = profile.kindAffinity;
  let nextTagAffinity = profile.tagAffinity;
  let nextRecentMissedTraps = profile.recentMissedTraps;

  const tagKeys = collectCardTagKeys(card, true);

  if (!isCorrect) {
    const resetInterval = SR_INTERVALS_MS[0];
    nextSRQueue = {
      ...profile.srQueue,
      [card.id]: {
        cardId: card.id,
        box: 0,
        intervalMs: resetInterval,
        dueAt: now + resetInterval,
        lapses: (existingSR?.lapses ?? 0) + 1,
        source: "missed-trap",
      },
    };
    nextTrackAffinity = nudgeTrackAffinity(
      profile.trackAffinity,
      card.trackId,
      0.85
    );
    nextTagAffinity = nudgeTagAffinity(profile.tagAffinity, tagKeys, 0.55);
    // Gently elevate visual explainers so the user absorbs the concept before recall.
    nextKindAffinity = nudgeKindAffinity(
      nudgeKindAffinity(profile.kindAffinity, "concept", 0.25),
      "code",
      0.15
    );

    const trapId = card.stage.type === "trap" ? card.stage.trapId : card.id;
    const question =
      card.stage.type === "trap" ? card.stage.question : card.title;
    const explanation =
      card.stage.type === "trap" ? card.stage.explanation : card.summary;
    const clause =
      card.stage.type === "trap" ? card.stage.clause : undefined;

    nextRecentMissedTraps = upsertRecentMissedTrap(profile.recentMissedTraps, {
      cardId: card.id,
      trapId,
      ...(card.topicSlug ? { topicSlug: card.topicSlug } : {}),
      trackId: card.trackId,
      question,
      ...(clause ? { clause } : {}),
      explanation,
      at: now,
    });
  } else {
    if (existingSR) {
      nextSRQueue = {
        ...profile.srQueue,
        [card.id]: advanceSRItem(existingSR, now),
      };
    }
    nextRecentMissedTraps = removeRecentMissedTrap(
      profile.recentMissedTraps,
      card.id
    );
    nextTrackAffinity = nudgeTrackAffinity(
      profile.trackAffinity,
      card.trackId,
      0.25
    );
    nextKindAffinity = nudgeKindAffinity(profile.kindAffinity, "trap", 0.2);
    nextTagAffinity = nudgeTagAffinity(profile.tagAffinity, tagKeys, 0.15);
  }

  return {
    ...profile,
    seenIds: { ...profile.seenIds, [card.id]: nextSeen },
    seenSourcePaths: pushSeenSourcePath(
      profile.seenSourcePaths,
      card.sourcePath
    ),
    trapHistory: { ...profile.trapHistory, [card.id]: nextHistoryEntry },
    recentMissedTraps: nextRecentMissedTraps,
    srQueue: nextSRQueue,
    trackAffinity: nextTrackAffinity,
    kindAffinity: nextKindAffinity,
    tagAffinity: nextTagAffinity,
    streak: applyStreakProgress(profile.streak, now, {
      cards: wasRecentlyCounted ? 0 : 1,
      trapsTotal: 1,
      trapsRight: isCorrect ? 1 : 0,
    }),
  };
}

/**
 * Updates persistent UI preferences (captionsEnabled / focusMode / adaptiveAiEnabled).
 */
export function updateScrollPreferences(
  profile: ScrollUserProfile,
  patch: Partial<ScrollPreferences>,
  now: number = Date.now()
): ScrollUserProfile {
  const nextCaptions =
    patch.captionsEnabled !== undefined
      ? Boolean(patch.captionsEnabled)
      : profile.preferences.captionsEnabled;
  const nextFocusMode =
    patch.focusMode !== undefined &&
    VALID_FOCUS_MODES.includes(patch.focusMode)
      ? patch.focusMode
      : profile.preferences.focusMode;
  const nextAdaptiveAi =
    patch.adaptiveAiEnabled !== undefined
      ? Boolean(patch.adaptiveAiEnabled)
      : profile.preferences.adaptiveAiEnabled;

  if (
    nextCaptions === profile.preferences.captionsEnabled &&
    nextFocusMode === profile.preferences.focusMode &&
    nextAdaptiveAi === profile.preferences.adaptiveAiEnabled
  ) {
    return profile;
  }

  return {
    ...profile,
    preferences: {
      captionsEnabled: nextCaptions,
      focusMode: nextFocusMode,
      adaptiveAiEnabled: nextAdaptiveAi,
    },
    streak: reconcileStreakDay(profile.streak, now),
  };
}
