import { NextResponse } from "next/server";
import { getAllQuizQuestions } from "@/lib/quiz-bank";

export async function GET() {
  return NextResponse.json(getAllQuizQuestions(), {
    headers: {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
