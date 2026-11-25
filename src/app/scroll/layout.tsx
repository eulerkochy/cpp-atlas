import type { Metadata, Viewport } from "next";
import { buildOgImageUrl, SITE } from "@/lib/site";
import "@/components/scroll/scroll.css";

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
};

export function generateMetadata(): Metadata {
  const title = "Scroll — Visual C++ Feed";
  const description =
    "Infinite 9:16 visual C++ explainers, stepped code walkthroughs, C++11–C++26 evolution diffs, and 1-tap standardese traps with adaptive For-You ranking and spaced repetition.";
  const ogImage = buildOgImageUrl({
    title: "C++ Atlas Scroll",
    kicker: "Visual Feed · Spaced Repetition",
    meta: "Diagrams / Code Steps / C++11–26 Diffs / 1-Tap Traps",
    sub: "Adaptive For-You knowledge feed",
  });

  return {
    title,
    description,
    alternates: { canonical: "/scroll" },
    openGraph: {
      title,
      description,
      url: "/scroll",
      siteName: SITE.name,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: `${title} — ${SITE.name}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default function ScrollLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      data-scroll-viewport=""
      className="scroll-viewport-root fixed inset-0 z-10 h-dvh w-screen overflow-hidden bg-black text-white"
    >
      {children}
    </div>
  );
}
