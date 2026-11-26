import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { getBuildCatalog } from "@/lib/build-challenges";
import { buildOgImageUrl, SITE } from "@/lib/site";

export function generateMetadata(): Metadata {
  const title = "Build it yourself";
  const description =
    "Hands-on C++ challenges: implement std::vector, a UCI chess engine, and more from scratch, stage by stage, against a real test suite graded remotely.";
  const ogImage = buildOgImageUrl({
    title: "Build it yourself",
    kicker: "C++ Atlas Challenges",
    meta: "Stage-by-stage / graded remotely",
  });
  return {
    title,
    description,
    alternates: { canonical: "/build" },
    openGraph: {
      title,
      description,
      url: "/build",
      siteName: SITE.name,
      images: [{ url: ogImage, width: 1200, height: 630, alt: `${title} — ${SITE.name}` }],
    },
    twitter: { card: "summary_large_image", title, description, images: [ogImage] },
  };
}

export default function BuildIndexPage() {
  const catalog = getBuildCatalog();
  const titles = new Map(catalog.map((c) => [c.slug, c.title]));
  const live = catalog.filter((c) => c.status === "live");
  const soon = catalog.filter((c) => c.status !== "live");

  return (
    <>
      <PageHeader title="Build">
        <p>
          Learn C++ by writing the library yourself. Each challenge is a series of
          small stages. A remote test suite grades your code on one command or on
          every push, and each stage points back to the Atlas topics behind it.
        </p>
      </PageHeader>

      <div className="mx-auto max-w-6xl space-y-12 px-4 pb-16 sm:px-6">
        <section aria-labelledby="live-heading" className="space-y-4">
          <h2 id="live-heading" className="font-display text-2xl font-[450] tracking-[-0.02em] text-ink">
            Available now
          </h2>
          <ul className="grid gap-4 md:grid-cols-2">
            {live.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/build/${c.slug}`}
                  className="group flex h-full flex-col rounded-[var(--radius-panel)] border border-line bg-paper-raised p-6 transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  <h3 className="font-display text-xl font-[450] tracking-[-0.02em] text-ink decoration-sun decoration-2 underline-offset-4 group-hover:underline">
                    {c.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">{c.tagline}</p>
                  <div className="mt-auto flex items-center justify-between gap-3 pt-5 text-sm">
                    <span className="text-ink-soft tabular-nums">
                      {c.stageCount ? `${c.stageCount} stages` : "Live"}
                    </span>
                    <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                      Start building <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {soon.length > 0 ? (
          <section aria-labelledby="soon-heading" className="space-y-4">
            <h2 id="soon-heading" className="font-display text-2xl font-[450] tracking-[-0.02em] text-ink">
              Coming soon
            </h2>
            <ul className="grid gap-4 md:grid-cols-3">
              {soon.map((c) => (
                <li
                  key={c.slug}
                  className="flex h-full flex-col rounded-[var(--radius-panel)] border border-dashed border-line-strong bg-paper-sunk/65 p-5"
                >
                  <span className="inline-flex w-fit rounded-[var(--radius-chip)] border border-line bg-paper-raised px-2 py-0.5 text-xs font-medium text-ink-soft">
                    Coming soon
                  </span>
                  <h3 className="mt-3 font-display text-lg font-[450] tracking-[-0.01em] text-ink">
                    {c.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">{c.tagline}</p>
                  {c.dependsOn.length > 0 ? (
                    <p className="mt-auto pt-4 text-xs text-ink-faint">
                      Builds on: {c.dependsOn.map((d) => titles.get(d) ?? d).join(", ")}
                    </p>
                  ) : null}
                  {c.note ? (
                    <p className={`${c.dependsOn.length > 0 ? "mt-1" : "mt-auto pt-4"} text-xs leading-relaxed text-ink-faint`}>
                      {c.note}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}
