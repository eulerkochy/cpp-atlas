import { NextResponse } from "next/server";
import { getTopic } from "@/lib/topics";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const topic = getTopic(slug);

  if (!topic?.map?.root) {
    return NextResponse.json(
      { error: "Topic concept map not found", slug },
      { status: 404 }
    );
  }

  return NextResponse.json(
    { root: topic.map.root },
    {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    }
  );
}
