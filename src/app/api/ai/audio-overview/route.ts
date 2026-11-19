import { NextResponse } from "next/server";
import { sanitizeAiSources } from "@/lib/ai-route-helpers";
import { resolveAiSources } from "@/lib/ai-sources";
import {
  createGeminiClient,
  formatGeminiError,
  GEMINI_STUDIO_MODEL,
  GEMINI_TTS_MODEL,
  resolveGeminiApiKey,
} from "@/lib/gemini";

interface DialogueTurn {
  speaker: "Alex" | "Maya";
  style: string;
  text: string;
}

interface ParsedDialogue {
  title: string;
  summary: string;
  turns: DialogueTurn[];
}

function parseDialogueJson(rawText: string): ParsedDialogue | null {
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  if (!cleaned) return null;

  try {
    const parsed = JSON.parse(cleaned) as {
      title?: unknown;
      summary?: unknown;
      turns?: unknown;
    };
    if (!Array.isArray(parsed.turns) || parsed.turns.length === 0) {
      return null;
    }

    const turns: DialogueTurn[] = [];
    for (const item of parsed.turns) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const text = typeof rec.text === "string" ? rec.text.trim() : "";
      if (!text) continue;
      const speaker = rec.speaker === "Alex" ? "Alex" : "Maya";
      const style =
        typeof rec.style === "string" && rec.style.trim()
          ? rec.style.trim()
          : speaker === "Alex"
            ? "curious, sharp, and conversational"
            : "warm, clear, and authoritative";
      turns.push({ speaker, style, text });
    }

    if (turns.length === 0) return null;

    return {
      title:
        typeof parsed.title === "string" && parsed.title.trim()
          ? parsed.title.trim()
          : "C++ Atlas Audio Overview",
      summary:
        typeof parsed.summary === "string" ? parsed.summary.trim() : "",
      turns,
    };
  } catch {
    return null;
  }
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
  const focus =
    typeof body.focus === "string" ? body.focus.trim().slice(0, 400) : "";
  const length = body.length === "standard" ? "standard" : "short";
  const includeQuizAnswers = body.includeQuizAnswers !== false;

  if (sources.length === 0) {
    return NextResponse.json(
      { error: "Select at least one topic or reference page first." },
      { status: 400 }
    );
  }

  const { documents, contextText } = resolveAiSources(sources, {
    includeQuizAnswers,
    maxSources: 8,
    maxTotalChars: 100_000,
  });

  if (documents.length === 0) {
    return NextResponse.json(
      { error: "None of the requested C++ Atlas sources could be resolved." },
      { status: 404 }
    );
  }

  const ai = createGeminiClient(keyInfo.apiKey);

  const targetTurns = length === "standard" ? "14 to 18" : "8 to 12";
  const targetWords = length === "standard" ? "360 to 460" : "200 to 280";

  let dialogue: ParsedDialogue | null = null;
  try {
    const scriptInteraction = await ai.interactions.create(
      {
        model: GEMINI_STUDIO_MODEL,
        store: false,
        system_instruction: [
          "You write tight, natural two-host technical Audio Overview scripts grounded strictly in the C++ Atlas sources below.",
          "Hosts:",
          "- Alex: curious systems engineer probing concrete edge cases, mental models, and why naive code fails.",
          "- Maya: calm C++ standards veteran explaining the exact invariant, memory/lifetime model, and standard rationale.",
          "Spoken-script rules:",
          "- Write for ears, not eyes: never use markdown formatting, bullets, asterisks, or backticks inside `text`.",
          "- Spell out C++ symbols cleanly when spoken (e.g. say 'std move', 'rvalue reference', 'memory order acquire').",
          "- Keep delivery vivid and grounded in the sources; hit the nastiest subtle traps.",
          `- Produce ${targetTurns} alternating turns totaling roughly ${targetWords} words.`,
          "- `style` should be a short 2–5 word acting/tone cue (e.g. 'curious and upbeat', 'calm and precise').",
          "",
          "=== LOADED C++ ATLAS SOURCES ===",
          contextText,
        ].join("\n"),
        input: focus
          ? `Create a two-host Audio Overview focusing especially on: ${focus}`
          : "Create an engaging two-host Audio Overview synthesizing the loaded C++ Atlas sources.",
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: {
            type: "object",
            properties: {
              title: { type: "string" },
              summary: { type: "string" },
              turns: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    speaker: { type: "string", enum: ["Alex", "Maya"] },
                    style: { type: "string" },
                    text: { type: "string" },
                  },
                  required: ["speaker", "style", "text"],
                },
              },
            },
            required: ["title", "summary", "turns"],
          },
        },
      },
      { signal: request.signal }
    );

    dialogue = parseDialogueJson(scriptInteraction.output_text ?? "");
  } catch (err) {
    const formatted = formatGeminiError(err);
    return NextResponse.json(
      { error: formatted.message },
      { status: formatted.status }
    );
  }

  if (!dialogue) {
    return NextResponse.json(
      { error: "Could not parse the generated Audio Overview script." },
      { status: 502 }
    );
  }

  try {
    const ttsInteraction = await ai.interactions.create(
      {
        model: GEMINI_TTS_MODEL,
        store: false,
        input: [
          {
            type: "user_input",
            content: dialogue.turns.map((turn) => ({
              type: "text" as const,
              text: turn.text,
              annotations: [
                {
                  type: "speech_metadata" as const,
                  speaker: turn.speaker,
                  style: turn.style,
                },
              ],
            })),
          },
        ],
        response_format: { type: "audio" },
        generation_config: {
          speech_config: {
            speakers: [
              { speaker: "Alex", voice: "Puck" },
              { speaker: "Maya", voice: "Kore" },
            ],
          },
        },
      },
      { signal: request.signal }
    );

    const audioBase64 = ttsInteraction.output_audio?.data ?? null;
    const mimeType = ttsInteraction.output_audio?.mime_type ?? "audio/wav";

    return NextResponse.json({
      title: dialogue.title,
      summary: dialogue.summary,
      turns: dialogue.turns,
      sources: documents.map((d) => ({
        key: d.key,
        title: d.title,
        urlPath: d.urlPath,
      })),
      audioBase64,
      mimeType: audioBase64 ? mimeType : null,
      ttsWarning: audioBase64
        ? null
        : "Audio synthesis returned no audio payload; showing transcript only.",
    });
  } catch (err) {
    return NextResponse.json({
      title: dialogue.title,
      summary: dialogue.summary,
      turns: dialogue.turns,
      sources: documents.map((d) => ({
        key: d.key,
        title: d.title,
        urlPath: d.urlPath,
      })),
      audioBase64: null,
      mimeType: null,
      ttsWarning: formatGeminiError(err).message,
    });
  }
}
