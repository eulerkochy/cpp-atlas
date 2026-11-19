import { NextResponse } from "next/server";
import {
  createGeminiClient,
  formatGeminiError,
  GEMINI_CHAT_MODEL,
  resolveGeminiApiKey,
} from "@/lib/gemini";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

const INVALID_FORMAT_MSG =
  "Paste a valid Gemini API key from Google AI Studio (starts with AIza…).";

function getErrorStatus(err: unknown): number | undefined {
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status?: unknown }).status;
    if (typeof status === "number") return status;
  }
  return undefined;
}

function normalizeVerifyFailureStatus(status: number | undefined): number {
  if (status === 429) return 429;
  return 401;
}

function cleanVerifyErrorMessage(raw: string): string {
  if (/GEMINI_API_KEY|API_KEY_INVALID|API key not valid/i.test(raw)) {
    return "Gemini rejected this API key. Check it in Google AI Studio and try again.";
  }
  return raw;
}

export async function POST(request: Request) {
  const headerKey = request.headers.get("x-gemini-api-key")?.trim() ?? "";
  const apiKey = headerKey || resolveGeminiApiKey(request)?.apiKey || "";

  if (!apiKey || apiKey.length < 10 || /\s/.test(apiKey)) {
    return NextResponse.json(
      { ok: false, error: INVALID_FORMAT_MSG },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const ai = createGeminiClient(apiKey);
    await ai.models.get({ model: GEMINI_CHAT_MODEL });
    return NextResponse.json(
      { ok: true, model: GEMINI_CHAT_MODEL },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    const rawStatus = getErrorStatus(err);
    if (rawStatus === 404) {
      try {
        const res = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
          {
            headers: { "x-goog-api-key": apiKey },
            cache: "no-store",
          }
        );
        if (res.ok) {
          return NextResponse.json(
            { ok: true, model: GEMINI_CHAT_MODEL },
            { status: 200, headers: NO_STORE_HEADERS }
          );
        }
        let message = "Gemini rejected this API key.";
        try {
          const body = (await res.json()) as {
            error?: { message?: string };
          };
          if (body?.error?.message) {
            message = body.error.message;
          }
        } catch {
          // Ignore non-JSON error bodies
        }
        return NextResponse.json(
          { ok: false, error: cleanVerifyErrorMessage(message) },
          {
            status: normalizeVerifyFailureStatus(res.status),
            headers: NO_STORE_HEADERS,
          }
        );
      } catch (fallbackErr) {
        const formattedFallback = formatGeminiError(fallbackErr);
        return NextResponse.json(
          {
            ok: false,
            error: cleanVerifyErrorMessage(formattedFallback.message),
          },
          {
            status: normalizeVerifyFailureStatus(formattedFallback.status),
            headers: NO_STORE_HEADERS,
          }
        );
      }
    }

    const formatted = formatGeminiError(err);
    return NextResponse.json(
      { ok: false, error: cleanVerifyErrorMessage(formatted.message) },
      {
        status: normalizeVerifyFailureStatus(formatted.status),
        headers: NO_STORE_HEADERS,
      }
    );
  }
}
