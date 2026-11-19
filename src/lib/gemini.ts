import { ApiError, GoogleGenAI } from "@google/genai";

export const GEMINI_CHAT_MODEL = "gemini-4-hydrogen";
export const GEMINI_STUDIO_MODEL = "gemini-4-hydrogen";
export const GEMINI_TTS_MODEL = "gemini-3.8-flash-tts";

export function hasServerGeminiKey(): boolean {
  return Boolean(
    (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim()
  );
}

export function resolveGeminiApiKey(
  request?: Request
): { apiKey: string; source: "server" | "client" } | null {
  const serverKey = (
    process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  )?.trim();
  if (serverKey) {
    return { apiKey: serverKey, source: "server" };
  }

  const clientKey = request?.headers.get("x-gemini-api-key")?.trim();
  if (clientKey && clientKey.length >= 10 && !/\s/.test(clientKey)) {
    return { apiKey: clientKey, source: "client" };
  }

  return null;
}

export function createGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey });
}

function extractFriendlyMessage(raw: string, status: number): string {
  const trimmed = raw.trim();
  let message = trimmed;
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as {
        error?: { message?: string };
        message?: string;
      };
      message = parsed.error?.message || parsed.message || trimmed;
    } catch {
      // Keep original string if not valid JSON
    }
  }

  if (status === 401 || status === 403 || /api key/i.test(message)) {
    return "Gemini rejected the API key. Check that your GEMINI_API_KEY is valid and enabled for the Gemini API.";
  }
  if (status === 429 || /rate limit|quota|resource_exhausted/i.test(message)) {
    return "Gemini rate limit or quota exceeded. Please wait a moment and try again.";
  }
  if (status === 404) {
    return "The requested Gemini model is unavailable for this API key.";
  }
  if (message.length > 260) {
    return `${message.slice(0, 257)}…`;
  }
  return message || "Gemini request failed.";
}

export function formatGeminiError(err: unknown): {
  status: number;
  message: string;
} {
  if (err instanceof ApiError) {
    const status =
      err.status >= 400 && err.status < 600 ? err.status : 502;
    return {
      status,
      message: extractFriendlyMessage(err.message, status),
    };
  }

  if (err instanceof Error) {
    const anyErr = err as Error & { status?: number; code?: number };
    const status =
      typeof anyErr.status === "number" &&
      anyErr.status >= 400 &&
      anyErr.status < 600
        ? anyErr.status
        : 502;
    return {
      status,
      message: extractFriendlyMessage(err.message, status),
    };
  }

  return {
    status: 502,
    message: "Unexpected error while calling Gemini.",
  };
}
