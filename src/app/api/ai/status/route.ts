import { connection, NextResponse } from "next/server";
import {
  GEMINI_CHAT_MODEL,
  GEMINI_STUDIO_MODEL,
  GEMINI_TTS_MODEL,
  hasServerGeminiKey,
} from "@/lib/gemini";

export async function GET() {
  await connection();
  return NextResponse.json(
    {
      configured: hasServerGeminiKey(),
      chatModel: GEMINI_CHAT_MODEL,
      studioModel: GEMINI_STUDIO_MODEL,
      ttsModel: GEMINI_TTS_MODEL,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
