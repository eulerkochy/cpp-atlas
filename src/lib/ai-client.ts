"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  buildBoundedExternalUrl,
  buildBundlePrompt,
  buildExternalPrompt,
  GEMINI_WEB_URL,
  type AiPageContext,
  type ExternalPromptOptions,
} from "@/lib/ai-links";

export const SESSION_GEMINI_KEY_STORAGE = "cpp-atlas:gemini-api-key";
const SESSION_GEMINI_KEY_EVENT = "cpp-atlas:gemini-key-change";

export interface AiStatusPayload {
  configured: boolean;
  chatModel: string;
  studioModel: string;
  ttsModel: string;
}

export interface StreamSourceInfo {
  key: string;
  title: string;
  urlPath: string;
}

export type GeminiKeyPersistence = "local" | "session";

export function readSessionGeminiKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return (
      window.sessionStorage.getItem(SESSION_GEMINI_KEY_STORAGE) ??
      window.localStorage.getItem(SESSION_GEMINI_KEY_STORAGE) ??
      ""
    );
  } catch {
    return "";
  }
}

export function readGeminiKeyPersistence(): GeminiKeyPersistence | null {
  if (typeof window === "undefined") return null;
  try {
    if (window.sessionStorage.getItem(SESSION_GEMINI_KEY_STORAGE)) {
      return "session";
    }
    if (window.localStorage.getItem(SESSION_GEMINI_KEY_STORAGE)) {
      return "local";
    }
    return null;
  } catch {
    return null;
  }
}

export function writeSessionGeminiKey(
  value: string,
  persistence: GeminiKeyPersistence = "local"
): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SESSION_GEMINI_KEY_STORAGE);
    window.localStorage.removeItem(SESSION_GEMINI_KEY_STORAGE);
    const trimmed = value.trim();
    if (trimmed) {
      const storage =
        persistence === "local" ? window.localStorage : window.sessionStorage;
      storage.setItem(SESSION_GEMINI_KEY_STORAGE, trimmed);
    }
    window.dispatchEvent(new Event(SESSION_GEMINI_KEY_EVENT));
  } catch {
    // Ignore storage quota/privacy errors
  }
}

function subscribeSessionGeminiKey(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(SESSION_GEMINI_KEY_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SESSION_GEMINI_KEY_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useSessionGeminiKey(): {
  key: string;
  persistence: GeminiKeyPersistence | null;
  setKey: (next: string, persistence?: GeminiKeyPersistence) => void;
  clearKey: () => void;
} {
  const key = useSyncExternalStore(
    subscribeSessionGeminiKey,
    readSessionGeminiKey,
    () => ""
  );
  const persistence = useSyncExternalStore(
    subscribeSessionGeminiKey,
    readGeminiKeyPersistence,
    () => null
  );
  const setKey = useCallback(
    (next: string, nextPersistence: GeminiKeyPersistence = "local") => {
      writeSessionGeminiKey(next, nextPersistence);
    },
    []
  );
  const clearKey = useCallback(() => {
    writeSessionGeminiKey("");
  }, []);
  return { key, persistence, setKey, clearKey };
}

export async function verifyGeminiKey(
  apiKey: string
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    return {
      ok: false,
      error: "Paste a Gemini API key from Google AI Studio first.",
    };
  }
  try {
    const res = await fetch("/api/ai/verify", {
      method: "POST",
      headers: {
        "x-gemini-api-key": trimmed,
      },
      cache: "no-store",
    });
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
    } | null;
    if (res.ok && data?.ok) {
      return { ok: true };
    }
    return {
      ok: false,
      error:
        data?.error ||
        `Gemini rejected this key (HTTP ${res.status}). Check it in Google AI Studio and try again.`,
    };
  } catch {
    return {
      ok: false,
      error: "Network error while checking your Gemini API key. Try again.",
    };
  }
}

export function buildAiHeaders(sessionKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const trimmed = sessionKey.trim();
  if (trimmed) {
    headers["x-gemini-api-key"] = trimmed;
  }
  return headers;
}

export async function fetchAiStatus(): Promise<AiStatusPayload> {
  const res = await fetch("/api/ai/status", { cache: "no-store" });
  if (!res.ok) {
    throw new Error("Could not check Gemini availability.");
  }
  return (await res.json()) as AiStatusPayload;
}

export async function streamAiSse(options: {
  url: string;
  body: unknown;
  sessionKey: string;
  signal: AbortSignal;
  onMeta?: (payload: {
    interactionId: string | null;
    sources: StreamSourceInfo[];
  }) => void;
  onDelta: (chunk: string) => void;
  onDone?: (payload: {
    interactionId: string | null;
    totalTokens: number | null;
  }) => void;
}): Promise<void> {
  const res = await fetch(options.url, {
    method: "POST",
    headers: buildAiHeaders(options.sessionKey),
    body: JSON.stringify(options.body),
    signal: options.signal,
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let code = "";
    try {
      const errJson = (await res.json()) as { error?: string; code?: string };
      if (errJson.error) message = errJson.error;
      if (errJson.code) code = errJson.code;
    } catch {
      // Ignore parse error
    }
    const err = new Error(message) as Error & { code?: string; status?: number };
    err.code = code;
    err.status = res.status;
    throw err;
  }

  if (!res.body) {
    throw new Error("Response stream is empty.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const dispatchBlock = (block: string) => {
    const lines = block.split("\n");
    let eventName = "message";
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (dataLines.length === 0) return;
    const rawData = dataLines.join("\n");
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawData) as Record<string, unknown>;
    } catch {
      return;
    }

    if (eventName === "meta" && options.onMeta) {
      options.onMeta({
        interactionId:
          typeof parsed.interactionId === "string"
            ? parsed.interactionId
            : null,
        sources: Array.isArray(parsed.sources)
          ? (parsed.sources as StreamSourceInfo[])
          : [],
      });
    } else if (eventName === "delta") {
      if (typeof parsed.text === "string" && parsed.text) {
        options.onDelta(parsed.text);
      }
    } else if (eventName === "done" && options.onDone) {
      options.onDone({
        interactionId:
          typeof parsed.interactionId === "string"
            ? parsed.interactionId
            : null,
        totalTokens:
          typeof parsed.totalTokens === "number" ? parsed.totalTokens : null,
      });
    } else if (eventName === "error") {
      throw new Error(
        typeof parsed.error === "string"
          ? parsed.error
          : "Gemini streaming error."
      );
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

    let sep = buffer.indexOf("\n\n");
    while (sep !== -1) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      if (block.trim()) {
        dispatchBlock(block);
      }
      sep = buffer.indexOf("\n\n");
    }
  }

  if (buffer.trim()) {
    dispatchBlock(buffer);
  }
}

const markdownCache = new Map<string, string>();
const markdownInflight = new Map<string, Promise<string | null>>();

export function getCachedMarkdown(endpoint: string): string | null {
  if (!endpoint) return null;
  return markdownCache.get(endpoint) ?? null;
}

export function prefetchMarkdown(endpoint: string): Promise<string | null> {
  if (!endpoint) return Promise.resolve(null);
  const cached = markdownCache.get(endpoint);
  if (cached !== undefined) {
    return Promise.resolve(cached);
  }
  const inflight = markdownInflight.get(endpoint);
  if (inflight) {
    return inflight;
  }

  const promise = fetch(endpoint)
    .then(async (res) => {
      if (!res.ok) return null;
      const text = await res.text();
      if (text) {
        markdownCache.set(endpoint, text);
      }
      return text || null;
    })
    .catch(() => null)
    .finally(() => {
      markdownInflight.delete(endpoint);
    });

  markdownInflight.set(endpoint, promise);
  return promise;
}

export async function copyTextWithGesture(
  textOrPromise: string | Promise<string>
): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    return false;
  }

  if (typeof textOrPromise === "string") {
    try {
      await navigator.clipboard.writeText(textOrPromise);
      return true;
    } catch {
      return false;
    }
  }

  if (
    typeof ClipboardItem !== "undefined" &&
    typeof navigator.clipboard.write === "function"
  ) {
    try {
      const item = new ClipboardItem({
        "text/plain": textOrPromise.then(
          (text) => new Blob([text], { type: "text/plain" })
        ),
      });
      await navigator.clipboard.write([item]);
      return true;
    } catch {
      // Fallback below if ClipboardItem with async Promise is unsupported
    }
  }

  try {
    const resolved = await textOrPromise;
    await navigator.clipboard.writeText(resolved);
    return true;
  } catch {
    return false;
  }
}

async function openBoundedChatTarget(options: {
  target: "chatgpt" | "claude";
  cachedMarkdown: string | null;
  loadMarkdown: () => Promise<string | null>;
  buildPrompt: (
    markdown?: string,
    promptOptions?: ExternalPromptOptions
  ) => string;
}): Promise<{ copiedFull: boolean; truncated: boolean }> {
  const { target, cachedMarkdown, loadMarkdown, buildPrompt } = options;

  if (cachedMarkdown !== null) {
    const { url, truncated } = buildBoundedExternalUrl(
      target,
      (promptOpts) => buildPrompt(cachedMarkdown, promptOpts),
      cachedMarkdown
    );
    const copyPromise = truncated
      ? copyTextWithGesture(buildPrompt(cachedMarkdown))
      : null;
    window.open(url, "_blank", "noopener,noreferrer");
    const copiedFull = copyPromise ? await copyPromise : false;
    return { copiedFull, truncated };
  }

  const popup = window.open("", "_blank");
  if (popup) {
    try {
      popup.opener = null;
    } catch {
      // Ignore opener restrictions
    }
  }

  const fetched = await loadMarkdown();
  const { url, truncated } = buildBoundedExternalUrl(
    target,
    (promptOpts) => buildPrompt(fetched ?? undefined, promptOpts),
    fetched ?? undefined
  );

  const copiedFull =
    truncated && fetched
      ? await copyTextWithGesture(buildPrompt(fetched))
      : false;

  if (popup && !popup.closed) {
    popup.location.replace(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return { copiedFull, truncated };
}

export async function openExternalAiPage(
  target: "chatgpt" | "claude" | "gemini",
  ctx: AiPageContext
): Promise<{ copiedFull: boolean; truncated: boolean }> {
  if (target === "gemini") {
    const cached = getCachedMarkdown(ctx.markdownEndpoint);
    const promptOrPromise =
      cached !== null
        ? buildExternalPrompt(ctx, cached)
        : prefetchMarkdown(ctx.markdownEndpoint).then((md) =>
            buildExternalPrompt(ctx, md ?? undefined)
          );
    const copyPromise = copyTextWithGesture(promptOrPromise);
    window.open(GEMINI_WEB_URL, "_blank", "noopener,noreferrer");
    const copiedFull = await copyPromise;
    return { copiedFull, truncated: false };
  }

  return openBoundedChatTarget({
    target,
    cachedMarkdown: getCachedMarkdown(ctx.markdownEndpoint),
    loadMarkdown: () => prefetchMarkdown(ctx.markdownEndpoint),
    buildPrompt: (md, promptOpts) => buildExternalPrompt(ctx, md, promptOpts),
  });
}

function getCachedBundleMarkdown(
  sources: { endpoint: string }[],
  preloadedMarkdown?: string
): string | null {
  if (preloadedMarkdown && preloadedMarkdown.trim()) {
    return preloadedMarkdown;
  }
  const capped = sources.slice(0, 12);
  if (capped.length === 0) return "";
  const parts: string[] = [];
  for (const s of capped) {
    const cached = getCachedMarkdown(s.endpoint);
    if (cached === null) return null;
    parts.push(cached);
  }
  return parts.join("\n\n---\n\n");
}

async function loadBundleMarkdown(
  sources: { endpoint: string }[],
  preloadedMarkdown?: string
): Promise<string | null> {
  const cached = getCachedBundleMarkdown(sources, preloadedMarkdown);
  if (cached !== null) return cached;
  const capped = sources.slice(0, 12);
  const parts = await Promise.all(
    capped.map((s) => prefetchMarkdown(s.endpoint))
  );
  const valid = parts.filter((p): p is string => Boolean(p));
  return valid.length > 0 ? valid.join("\n\n---\n\n") : null;
}

export async function openExternalAiBundle(
  target: "chatgpt" | "claude" | "gemini",
  sources: { name: string; urlPath: string; endpoint: string }[],
  preloadedMarkdown?: string
): Promise<{ copiedFull: boolean; truncated: boolean }> {
  const buildPrompt = (
    md?: string,
    promptOpts?: ExternalPromptOptions
  ): string => buildBundlePrompt(sources, md, promptOpts);

  if (target === "gemini") {
    const cached = getCachedBundleMarkdown(sources, preloadedMarkdown);
    const promptOrPromise =
      cached !== null
        ? buildPrompt(cached)
        : loadBundleMarkdown(sources, preloadedMarkdown).then((md) =>
            buildPrompt(md ?? undefined)
          );
    const copyPromise = copyTextWithGesture(promptOrPromise);
    window.open(GEMINI_WEB_URL, "_blank", "noopener,noreferrer");
    const copiedFull = await copyPromise;
    return { copiedFull, truncated: false };
  }

  return openBoundedChatTarget({
    target,
    cachedMarkdown: getCachedBundleMarkdown(sources, preloadedMarkdown),
    loadMarkdown: () => loadBundleMarkdown(sources, preloadedMarkdown),
    buildPrompt,
  });
}
