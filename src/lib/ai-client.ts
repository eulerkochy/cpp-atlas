"use client";

import { useCallback, useSyncExternalStore } from "react";

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

export function readSessionGeminiKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.sessionStorage.getItem(SESSION_GEMINI_KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function writeSessionGeminiKey(value: string): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = value.trim();
    if (trimmed) {
      window.sessionStorage.setItem(SESSION_GEMINI_KEY_STORAGE, trimmed);
    } else {
      window.sessionStorage.removeItem(SESSION_GEMINI_KEY_STORAGE);
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

export function useSessionGeminiKey(): [string, (next: string) => void] {
  const key = useSyncExternalStore(
    subscribeSessionGeminiKey,
    readSessionGeminiKey,
    () => ""
  );
  const setKey = useCallback((next: string) => {
    writeSessionGeminiKey(next);
  }, []);
  return [key, setKey];
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
