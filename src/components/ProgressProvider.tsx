"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
} from "react";

const STORAGE_KEY = "cpp-atlas-progress-v1";
const LEGACY_STORAGE_KEY = "lucid-cpp-progress-v1";
const CHANGE_EVENT = "cpp-atlas-progress-change";

export interface QuizRecord {
  selectedIndex: number;
  correct: boolean;
}

export interface ProgressState {
  answeredQuizzes: Record<string, QuizRecord>;
  bookmarkedQuizzes: string[];
  bookmarkedPages: string[];
  reviewedPages: string[];
  completedTopics: string[];
  bookmarkedTopics: string[];
}

const DEFAULT_STATE: ProgressState = {
  answeredQuizzes: {},
  bookmarkedQuizzes: [],
  bookmarkedPages: [],
  reviewedPages: [],
  completedTopics: [],
  bookmarkedTopics: [],
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && !seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return result;
}

function sanitizeAnsweredQuizzes(value: unknown): Record<string, QuizRecord> {
  if (!isPlainObject(value)) return {};
  const result: Record<string, QuizRecord> = {};
  for (const [quizId, entry] of Object.entries(value)) {
    if (!quizId || !isPlainObject(entry)) continue;
    if (
      typeof entry.selectedIndex === "number" &&
      Number.isFinite(entry.selectedIndex) &&
      typeof entry.correct === "boolean"
    ) {
      result[quizId] = {
        selectedIndex: entry.selectedIndex,
        correct: entry.correct,
      };
    }
  }
  return result;
}

function sanitizeProgressState(rawObj: Record<string, unknown>): ProgressState {
  return {
    answeredQuizzes: sanitizeAnsweredQuizzes(rawObj.answeredQuizzes),
    bookmarkedQuizzes: sanitizeStringArray(rawObj.bookmarkedQuizzes),
    bookmarkedPages: sanitizeStringArray(rawObj.bookmarkedPages),
    reviewedPages: sanitizeStringArray(rawObj.reviewedPages),
    completedTopics: sanitizeStringArray(rawObj.completedTopics),
    bookmarkedTopics: sanitizeStringArray(rawObj.bookmarkedTopics),
  };
}

function toggleListItem(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

let cachedRaw: string | null = null;
let cachedParsed: ProgressState = DEFAULT_STATE;

function getClientSnapshot(): ProgressState {
  try {
    const primaryRaw = window.localStorage.getItem(STORAGE_KEY);
    const raw =
      primaryRaw ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
    const cacheKey =
      primaryRaw !== null
        ? `primary:${primaryRaw}`
        : raw !== null
          ? `legacy:${raw}`
          : null;
    if (cacheKey === cachedRaw) return cachedParsed;
    cachedRaw = cacheKey;
    if (!raw) {
      cachedParsed = DEFAULT_STATE;
      return cachedParsed;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainObject(parsed)) {
      cachedParsed = DEFAULT_STATE;
      return cachedParsed;
    }
    cachedParsed = sanitizeProgressState(parsed);
    return cachedParsed;
  } catch {
    return DEFAULT_STATE;
  }
}

function getServerSnapshot(): ProgressState {
  return DEFAULT_STATE;
}

function subscribeStorage(callback: () => void): () => void {
  const onUpdate = () => callback();
  window.addEventListener("storage", onUpdate);
  window.addEventListener(CHANGE_EVENT, onUpdate);
  return () => {
    window.removeEventListener("storage", onUpdate);
    window.removeEventListener(CHANGE_EVENT, onUpdate);
  };
}

function writeStorage(next: ProgressState) {
  try {
    const raw = JSON.stringify(next);
    window.localStorage.setItem(STORAGE_KEY, raw);
    cachedRaw = `primary:${raw}`;
    cachedParsed = next;
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Ignore storage errors in restricted environments
  }
}

interface ProgressContextValue extends ProgressState {
  hydrated: boolean;
  recordQuizAnswer: (
    quizId: string,
    selectedIndex: number,
    correct: boolean
  ) => void;
  clearQuizAnswer: (quizId: string) => void;
  toggleQuizBookmark: (quizId: string) => void;
  togglePageBookmark: (cleanPath: string) => void;
  togglePageReviewed: (cleanPath: string) => void;
  toggleTopicCompleted: (slug: string) => void;
  toggleTopicBookmark: (slug: string) => void;
  exportProgressJson: () => string;
  importProgressJson: (raw: string) => { ok: boolean; error?: string };
  resetProgress: () => void;
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

const emptySubscribe = () => () => {};

export function ProgressProvider({ children }: { children: React.ReactNode }) {
  const state = useSyncExternalStore(
    subscribeStorage,
    getClientSnapshot,
    getServerSnapshot
  );
  const hydrated = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const recordQuizAnswer = useCallback(
    (quizId: string, selectedIndex: number, correct: boolean) => {
      const current = getClientSnapshot();
      writeStorage({
        ...current,
        answeredQuizzes: {
          ...current.answeredQuizzes,
          [quizId]: { selectedIndex, correct },
        },
      });
    },
    []
  );

  const clearQuizAnswer = useCallback((quizId: string) => {
    const current = getClientSnapshot();
    if (!Object.prototype.hasOwnProperty.call(current.answeredQuizzes, quizId)) {
      return;
    }
    const nextAnswered = { ...current.answeredQuizzes };
    delete nextAnswered[quizId];
    writeStorage({
      ...current,
      answeredQuizzes: nextAnswered,
    });
  }, []);

  const toggleQuizBookmark = useCallback((quizId: string) => {
    const current = getClientSnapshot();
    writeStorage({
      ...current,
      bookmarkedQuizzes: toggleListItem(current.bookmarkedQuizzes, quizId),
    });
  }, []);

  const togglePageBookmark = useCallback((cleanPath: string) => {
    const current = getClientSnapshot();
    writeStorage({
      ...current,
      bookmarkedPages: toggleListItem(current.bookmarkedPages, cleanPath),
    });
  }, []);

  const togglePageReviewed = useCallback((cleanPath: string) => {
    const current = getClientSnapshot();
    writeStorage({
      ...current,
      reviewedPages: toggleListItem(current.reviewedPages, cleanPath),
    });
  }, []);

  const toggleTopicCompleted = useCallback((slug: string) => {
    const current = getClientSnapshot();
    writeStorage({
      ...current,
      completedTopics: toggleListItem(current.completedTopics, slug),
    });
  }, []);

  const toggleTopicBookmark = useCallback((slug: string) => {
    const current = getClientSnapshot();
    writeStorage({
      ...current,
      bookmarkedTopics: toggleListItem(current.bookmarkedTopics, slug),
    });
  }, []);

  const exportProgressJson = useCallback(() => {
    const current = getClientSnapshot();
    return JSON.stringify(
      {
        version: 1,
        exportedAt: new Date().toISOString(),
        ...current,
      },
      null,
      2
    );
  }, []);

  const importProgressJson = useCallback(
    (raw: string): { ok: boolean; error?: string } => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return { ok: false, error: "Invalid JSON syntax." };
      }
      if (!isPlainObject(parsed)) {
        return {
          ok: false,
          error: "Progress backup must be a JSON object.",
        };
      }
      const sanitized = sanitizeProgressState(parsed);
      writeStorage(sanitized);
      return { ok: true };
    },
    []
  );

  const resetProgress = useCallback(() => {
    writeStorage(DEFAULT_STATE);
  }, []);

  return (
    <ProgressContext.Provider
      value={{
        ...state,
        hydrated,
        recordQuizAnswer,
        clearQuizAnswer,
        toggleQuizBookmark,
        togglePageBookmark,
        togglePageReviewed,
        toggleTopicCompleted,
        toggleTopicBookmark,
        exportProgressJson,
        importProgressJson,
        resetProgress,
      }}
    >
      {children}
    </ProgressContext.Provider>
  );
}

export function useProgress() {
  const ctx = useContext(ProgressContext);
  if (!ctx) {
    throw new Error("useProgress must be used within ProgressProvider");
  }
  return ctx;
}
