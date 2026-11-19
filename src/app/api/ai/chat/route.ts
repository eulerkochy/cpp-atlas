import type { Interactions } from "@google/genai";
import { NextResponse } from "next/server";
import {
  createInteractionSseResponse,
  sanitizeAiSources,
  type StreamingInteractionParams,
} from "@/lib/ai-route-helpers";
import { resolveAiSources } from "@/lib/ai-sources";
import {
  createGeminiClient,
  GEMINI_CHAT_MODEL,
  resolveGeminiApiKey,
} from "@/lib/gemini";

interface HistoryTurn {
  role: "user" | "assistant";
  text: string;
}

function sanitizeHistory(raw: unknown): HistoryTurn[] {
  if (!Array.isArray(raw)) return [];
  const turns: HistoryTurn[] = [];
  for (const item of raw.slice(-16)) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (
      (rec.role === "user" || rec.role === "assistant") &&
      typeof rec.text === "string" &&
      rec.text.trim()
    ) {
      turns.push({ role: rec.role, text: rec.text.trim().slice(0, 12_000) });
    }
  }
  return turns;
}

function buildStatelessInput(
  history: HistoryTurn[],
  message: string
): string | Interactions.Step[] {
  if (history.length === 0) return message;
  const steps: Interactions.Step[] = history.map((turn) =>
    turn.role === "user"
      ? {
          type: "user_input",
          content: [{ type: "text", text: turn.text }],
        }
      : {
          type: "model_output",
          content: [{ type: "text", text: turn.text }],
        }
  );
  steps.push({
    type: "user_input",
    content: [{ type: "text", text: message }],
  });
  return steps;
}

function buildSystemInstruction(
  mode: "tutor" | "notebook",
  contextText: string
): string {
  const modeGuidance =
    mode === "notebook"
      ? "Synthesize across all loaded notebook sources. Draw explicit connections, contrasts, and invariants across pages."
      : "Act as a crisp, high-signal C++ tutor on the active page. Be scannable: lead with the mental model, then exact rules/traps, and minimal illustrative C++20/23/26 snippets.";

  return [
    "You are the C++ Atlas study assistant, grounded in an offline 1:1 cppreference mirror and curated C++ study notes.",
    modeGuidance,
    "Grounding rules:",
    "- Ground your answers strictly in the loaded C++ Atlas sources below.",
    "- Cite loaded sources inline using their bracket number like [1] or [2], and cite ISO C++ clauses (e.g. [basic.lval]) when present in the sources.",
    "- If the user asks something outside the loaded sources, say so explicitly in one short sentence before answering from general ISO C++ knowledge.",
    "- Use fenced ```cpp blocks for C++ examples. Never fabricate compiler diagnostics or non-existent standard features.",
    "",
    "=== LOADED C++ ATLAS SOURCES ===",
    contextText,
  ].join("\n");
}

export async function POST(request: Request) {
  const keyInfo = resolveGeminiApiKey(request);
  if (!keyInfo) {
    return NextResponse.json(
      {
        code: "MISSING_API_KEY",
        error: "Gemini API key is not configured on this server.",
      },
      { status: 401 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body." },
      { status: 400 }
    );
  }

  const sources = sanitizeAiSources(body.sources);
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const previousInteractionId =
    typeof body.previousInteractionId === "string" &&
    body.previousInteractionId.trim()
      ? body.previousInteractionId.trim()
      : undefined;
  const history = sanitizeHistory(body.history);
  const mode = body.mode === "notebook" ? "notebook" : "tutor";
  const includeQuizAnswers = body.includeQuizAnswers !== false;

  if (sources.length === 0) {
    return NextResponse.json(
      { error: "Select at least one topic or reference page first." },
      { status: 400 }
    );
  }

  if (!message || message.length > 8_000) {
    return NextResponse.json(
      { error: "Message must be between 1 and 8,000 characters." },
      { status: 400 }
    );
  }

  const { documents, contextText } = resolveAiSources(sources, {
    includeQuizAnswers,
    maxSources: 10,
    maxTotalChars: 160_000,
  });

  if (documents.length === 0) {
    return NextResponse.json(
      { error: "None of the requested C++ Atlas sources could be resolved." },
      { status: 404 }
    );
  }

  const systemInstruction = buildSystemInstruction(mode, contextText);
  const ai = createGeminiClient(keyInfo.apiKey);

  const statelessParams: StreamingInteractionParams = {
    model: GEMINI_CHAT_MODEL,
    input: buildStatelessInput(history, message),
    system_instruction: systemInstruction,
    stream: true,
    store: keyInfo.source === "server",
  };

  const primaryParams: StreamingInteractionParams =
    previousInteractionId && keyInfo.source === "server"
      ? {
          model: GEMINI_CHAT_MODEL,
          input: message,
          previous_interaction_id: previousInteractionId,
          system_instruction: systemInstruction,
          stream: true,
        }
      : statelessParams;

  return createInteractionSseResponse({
    ai,
    primaryParams,
    fallbackParams:
      previousInteractionId && keyInfo.source === "server"
        ? statelessParams
        : undefined,
    sources: documents.map((d) => ({
      key: d.key,
      title: d.title,
      urlPath: d.urlPath,
    })),
    signal: request.signal,
  });
}
