import { NextResponse } from "next/server";
import { allTopicsToMarkdown } from "@/lib/topics";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const includeQuizAnswers = searchParams.get("answers") !== "0";
  const download = searchParams.get("download") === "1";

  const markdown = allTopicsToMarkdown({ includeQuizAnswers });
  const headers: Record<string, string> = {
    "Content-Type": "text/markdown; charset=utf-8",
    "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
  };

  if (download) {
    headers["Content-Disposition"] =
      'attachment; filename="cpp-atlas-topics-all.md"';
  }

  return new NextResponse(markdown, {
    status: 200,
    headers,
  });
}
