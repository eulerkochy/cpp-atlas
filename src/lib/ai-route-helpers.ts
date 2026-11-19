import type { GoogleGenAI, Interactions } from "@google/genai";
import type { AiSourceRef } from "@/lib/ai-links";
import { formatGeminiError } from "@/lib/gemini";

const SAFE_SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export function sanitizeAiSources(raw: unknown): AiSourceRef[] {
  if (!Array.isArray(raw)) return [];
  const out: AiSourceRef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (rec.kind === "topic" && typeof rec.slug === "string") {
      const slug = rec.slug.trim();
      if (SAFE_SLUG_RE.test(slug)) {
        out.push({ kind: "topic", slug });
      }
    } else if (
      rec.kind === "reference" &&
      (rec.lang === "cpp" || rec.lang === "c") &&
      typeof rec.path === "string"
    ) {
      out.push({
        kind: "reference",
        lang: rec.lang,
        path: rec.path.trim().replace(/^\/+/, ""),
      });
    }
  }
  return out;
}

export interface StreamSourceSummary {
  key: string;
  title: string;
  urlPath: string;
}

function encodeSseEvent(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  );
}

export type StreamingInteractionParams =
  Interactions.InteractionCreateParams.CreateModelInteractionParamsStreaming;

export function createInteractionSseResponse(options: {
  ai: GoogleGenAI;
  primaryParams: StreamingInteractionParams;
  fallbackParams?: StreamingInteractionParams;
  sources: StreamSourceSummary[];
  signal?: AbortSignal;
}): Response {
  const { ai, primaryParams, fallbackParams, sources, signal } = options;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encodeSseEvent(event, data));
        } catch {
          closed = true;
        }
      };

      try {
        let interactionStream;
        try {
          interactionStream = await ai.interactions.create(primaryParams, {
            signal,
          });
        } catch (err) {
          if (fallbackParams && !signal?.aborted) {
            interactionStream = await ai.interactions.create(fallbackParams, {
              signal,
            });
          } else {
            throw err;
          }
        }

        let interactionId: string | null = null;
        let totalTokens: number | null = null;
        let sentMeta = false;

        for await (const event of interactionStream) {
          if (signal?.aborted) break;

          if (event.event_type === "interaction.created") {
            interactionId = event.interaction.id;
            if (!sentMeta) {
              sentMeta = true;
              send("meta", { interactionId, sources });
            }
          } else if (event.event_type === "step.delta") {
            if (!sentMeta) {
              sentMeta = true;
              send("meta", { interactionId, sources });
            }
            if (event.delta.type === "text" && event.delta.text) {
              send("delta", { text: event.delta.text });
            }
          } else if (event.event_type === "interaction.completed") {
            interactionId = event.interaction.id || interactionId;
            totalTokens = event.interaction.usage?.total_tokens ?? null;
          } else if (event.event_type === "error") {
            const msg =
              event.error?.message || "Gemini returned a streaming error.";
            send("error", { error: msg });
            break;
          }
        }

        if (!sentMeta && !signal?.aborted) {
          send("meta", { interactionId, sources });
        }
        if (!signal?.aborted) {
          send("done", { interactionId, totalTokens });
        }
      } catch (err) {
        if (!signal?.aborted) {
          send("error", { error: formatGeminiError(err).message });
        }
      } finally {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // Stream already closed
          }
        }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
