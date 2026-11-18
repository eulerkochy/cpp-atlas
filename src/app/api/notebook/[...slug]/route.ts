import { NextResponse } from "next/server";
import { getReferencePage, htmlToCleanMarkdown } from "@/lib/cppref-engine";
import { ReferenceLang } from "@/types/cpp";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string[] }> }
) {
  const { slug } = await context.params;
  const { searchParams } = new URL(request.url);
  const includeQuizAnswers = searchParams.get("answers") !== "0";
  const download = searchParams.get("download") === "1";

  let lang: ReferenceLang = "cpp";
  let pathSegments = slug;

  if (slug[0] === "c") {
    lang = "c";
    pathSegments = slug.slice(1);
  } else if (slug[0] === "cpp") {
    lang = "cpp";
    pathSegments = slug.slice(1);
  }

  const targetParts =
    pathSegments.length === 0 ||
    (pathSegments.length === 1 && pathSegments[0] === "index")
      ? []
      : pathSegments;

  const page = await getReferencePage(lang, targetParts);

  if (!page) {
    return NextResponse.json(
      { error: "Reference page not found", slug },
      { status: 404 }
    );
  }

  const markdown = htmlToCleanMarkdown(page, { includeQuizAnswers });
  const filename =
    (page.pagePath === "index"
      ? `cppreference-${lang}-root`
      : `${lang}-${page.pagePath.replace(/[^a-zA-Z0-9_-]+/g, "-")}`) + ".md";

  const headers: Record<string, string> = {
    "Content-Type": "text/markdown; charset=utf-8",
    "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
  };

  if (download) {
    headers["Content-Disposition"] = `attachment; filename="${filename}"`;
  }

  return new NextResponse(markdown, {
    status: 200,
    headers,
  });
}
