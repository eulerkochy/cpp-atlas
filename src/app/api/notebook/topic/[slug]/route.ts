import { NextResponse } from "next/server";
import { getTopic, topicToMarkdown } from "@/lib/topics";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const { searchParams } = new URL(request.url);
  const includeQuizAnswers = searchParams.get("answers") !== "0";
  const download = searchParams.get("download") === "1";

  const topic = getTopic(slug);
  if (!topic) {
    return NextResponse.json(
      { error: "Topic not found", slug },
      { status: 404 }
    );
  }

  const markdown = topicToMarkdown(topic, { includeQuizAnswers });
  const headers: Record<string, string> = {
    "Content-Type": "text/markdown; charset=utf-8",
    "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
  };

  if (download) {
    headers["Content-Disposition"] = `attachment; filename="${topic.slug}.md"`;
  }

  return new NextResponse(markdown, {
    status: 200,
    headers,
  });
}
