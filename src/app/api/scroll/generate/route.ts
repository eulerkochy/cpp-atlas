import { NextResponse } from "next/server";
import { formatGeminiError, resolveGeminiApiKey } from "@/lib/gemini";
import { generateAdaptiveScrollCards } from "@/lib/scroll-generator";
import type {
  ScrollCardDifficulty,
  ScrollGenerateLikedCard,
  ScrollGenerateMissedTrap,
  ScrollGenerateRequest,
  ScrollGenerateResponse,
  ScrollGenerateTrigger,
} from "@/lib/scroll-types";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;
const MAX_BODY_BYTES = 65_536;
const SAFE_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,96}$/;

const VALID_TRIGGERS = new Set<ScrollGenerateTrigger>([
  "remediate",
  "deep-dive",
  "escalate",
  "explore",
]);

function sanitizeString(raw: unknown, maxLen: number): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, maxLen);
}

function sanitizeStringArray(
  raw: unknown,
  maxItems: number,
  maxItemLen: number
): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const cleaned = item.trim().slice(0, maxItemLen);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
    if (out.length >= maxItems) break;
  }
  return out;
}

function sanitizeDifficulty(raw: unknown): ScrollCardDifficulty | undefined {
  if (raw === 1 || raw === 2 || raw === 3) return raw;
  return undefined;
}

function sanitizeMissedTrap(raw: unknown): ScrollGenerateMissedTrap | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const rec = raw as Record<string, unknown>;
  const cardId = sanitizeString(rec.cardId, 128);
  const trapId = sanitizeString(rec.trapId, 128);
  const trackId = sanitizeString(rec.trackId, 64);
  const question = sanitizeString(rec.question, 600);
  const explanation = sanitizeString(rec.explanation, 1_000);
  const rawSlug = sanitizeString(rec.topicSlug, 96);
  const topicSlug = SAFE_SLUG_RE.test(rawSlug) ? rawSlug : undefined;
  const clause = sanitizeString(rec.clause, 80) || undefined;

  if (!question || (!trackId && !topicSlug)) return undefined;

  return {
    cardId: cardId || trapId || "unknown-card",
    trapId: trapId || cardId || "unknown-trap",
    ...(topicSlug ? { topicSlug } : {}),
    trackId: trackId || "value-semantics",
    question,
    ...(clause ? { clause } : {}),
    explanation,
  };
}

function sanitizeLikedCard(raw: unknown): ScrollGenerateLikedCard | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const rec = raw as Record<string, unknown>;
  const cardId = sanitizeString(rec.cardId, 128);
  const trackId = sanitizeString(rec.trackId, 64);
  const title = sanitizeString(rec.title, 200);
  const rawSlug = sanitizeString(rec.topicSlug, 96);
  const topicSlug = SAFE_SLUG_RE.test(rawSlug) ? rawSlug : undefined;
  const sourcePath = sanitizeString(rec.sourcePath, 160) || undefined;
  const tags = sanitizeStringArray(rec.tags, 10, 48);

  if (!title && !trackId && !topicSlug && !sourcePath) return undefined;

  return {
    cardId: cardId || "liked-card",
    ...(topicSlug ? { topicSlug } : {}),
    trackId: trackId || "value-semantics",
    title: title || "C++ topic",
    tags,
    ...(sourcePath ? { sourcePath } : {}),
  };
}

function parseGenerateRequest(
  rawBody: unknown
): { ok: true; value: ScrollGenerateRequest } | { ok: false; error: string } {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const rec = rawBody as Record<string, unknown>;
  const rawTrigger =
    typeof rec.trigger === "string" ? rec.trigger.trim() : "explore";

  if (!VALID_TRIGGERS.has(rawTrigger as ScrollGenerateTrigger)) {
    return {
      ok: false,
      error:
        'Invalid trigger. Expected one of: "remediate", "deep-dive", "escalate", "explore".',
    };
  }
  const trigger = rawTrigger as ScrollGenerateTrigger;

  const topTracks = sanitizeStringArray(rec.topTracks, 8, 64).filter((t) =>
    SAFE_SLUG_RE.test(t)
  );
  const difficultyTarget = sanitizeDifficulty(rec.difficultyTarget);
  const seenCardIds = sanitizeStringArray(rec.seenCardIds, 200, 128);
  const seenSourcePaths = sanitizeStringArray(rec.seenSourcePaths, 200, 160);
  const missedTrap = sanitizeMissedTrap(rec.missedTrap);
  const likedCard = sanitizeLikedCard(rec.likedCard);

  let count: number | undefined;
  if (rec.count !== undefined) {
    const parsedCount = Number(rec.count);
    if (Number.isFinite(parsedCount)) {
      count = Math.min(3, Math.max(1, Math.floor(parsedCount)));
    }
  }

  if (trigger === "remediate" && !missedTrap) {
    return {
      ok: false,
      error:
        'Trigger "remediate" requires a valid missedTrap payload with question and trackId/topicSlug.',
    };
  }

  return {
    ok: true,
    value: {
      trigger,
      ...(topTracks.length > 0 ? { topTracks } : {}),
      ...(difficultyTarget ? { difficultyTarget } : {}),
      ...(seenCardIds.length > 0 ? { seenCardIds } : {}),
      ...(seenSourcePaths.length > 0 ? { seenSourcePaths } : {}),
      ...(missedTrap ? { missedTrap } : {}),
      ...(likedCard ? { likedCard } : {}),
      ...(count !== undefined ? { count } : {}),
    },
  };
}

export async function POST(request: Request) {
  const keyInfo = resolveGeminiApiKey(request);
  if (!keyInfo) {
    return NextResponse.json(
      {
        error: "Gemini API key not configured",
        code: "MISSING_API_KEY",
      },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "Request body exceeds maximum allowed size." },
      { status: 413, headers: NO_STORE_HEADERS }
    );
  }

  let rawText: string;
  try {
    rawText = await request.text();
  } catch {
    return NextResponse.json(
      { error: "Unable to read request body." },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  if (rawText.length > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "Request body exceeds maximum allowed size." },
      { status: 413, headers: NO_STORE_HEADERS }
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = rawText.trim() ? JSON.parse(rawText) : {};
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body." },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const validated = parseGenerateRequest(parsedJson);
  if (!validated.ok) {
    return NextResponse.json(
      { error: validated.error },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const result: ScrollGenerateResponse = await generateAdaptiveScrollCards(
      validated.value,
      {
        apiKey: keyInfo.apiKey,
        signal: request.signal,
      }
    );

    return NextResponse.json(result, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (err) {
    const formatted = formatGeminiError(err);
    return NextResponse.json(
      { error: formatted.message },
      { status: formatted.status, headers: NO_STORE_HEADERS }
    );
  }
}
