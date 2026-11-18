import { NextResponse } from "next/server";
import { referenceToMarkdown, resolveReferencePage } from "@/lib/cppref-engine";
import { ReferenceLang } from "@/types/cpp";

/**
 * Markdown for one reference page, built from the imported offline data.
 *   /api/notebook/cpp/<path>   C++ page ("/api/notebook/cpp" is the root)
 *   /api/notebook/c/<path>     C page
 *   /api/notebook/<path>       legacy form of a C++ path ("index" = C++ root)
 */
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
  if (slug[0] === "c" || slug[0] === "cpp") {
    lang = slug[0];
    pathSegments = slug.slice(1);
  } else if (slug.length === 1 && slug[0] === "index") {
    pathSegments = [];
  }

  const resolved = resolveReferencePage(lang, pathSegments);
  if (resolved.kind === "redirect") {
    const target = new URL(
      `/api/notebook/${lang}${resolved.to.slice(`/w/${lang}`.length)}`,
      request.url
    );
    target.search = new URL(request.url).search;
    return NextResponse.redirect(target, 308);
  }
  if (resolved.kind === "missing") {
    return NextResponse.json(
      { error: "Reference page not found", slug },
      { status: 404 }
    );
  }

  const page = resolved.page;
  const markdown = referenceToMarkdown(page, { includeQuizAnswers });
  const filename =
    (page.pagePath === ""
      ? `cppreference-${lang}-root`
      : `${lang}-${page.pagePath.replace(/[^a-zA-Z0-9_-]+/g, "-")}`) + ".md";

  const headers: Record<string, string> = {
    "Content-Type": "text/markdown; charset=utf-8",
    "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
  };
  if (download) {
    headers["Content-Disposition"] = `attachment; filename="${filename}"`;
  }

  return new NextResponse(markdown, { status: 200, headers });
}
