import type { Metadata, Viewport } from "next";
import { Fraunces, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import { CommandPalette } from "@/components/CommandPalette";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { ProgressProvider } from "@/components/ProgressProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SITE } from "@/lib/site";
import { getSiteStats, siteDescription } from "@/lib/site-stats";
import "./globals.css";
import "./cppref.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display-face",
  axes: ["opsz", "SOFT", "WONK"],
  display: "swap",
});

const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-sans-face",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-face",
  display: "swap",
});

const SITE_TITLE = "C++ Atlas — Every cppreference Page Mapped 1:1";

export function generateMetadata(): Metadata {
  const description = siteDescription();
  return {
    metadataBase: new URL(SITE.url),
    title: {
      default: SITE_TITLE,
      template: `%s | ${SITE.name}`,
    },
    description,
    applicationName: SITE.name,
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      title: SITE_TITLE,
      description,
      siteName: SITE.name,
      type: "website",
      url: "/",
      locale: "en",
    },
    twitter: {
      card: "summary_large_image",
      title: SITE_TITLE,
      description,
    },
  };
}

/**
 * Runs before first paint so the page never flashes the wrong theme. The
 * reader's choice (ThemeToggle) wins; otherwise the system setting decides.
 */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");var d=t?t==="dark":matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf6" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1220" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-20 focus:left-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-paper"
        >
          Skip to content
        </a>
        <TooltipProvider delay={0}>
          <ProgressProvider>
            <Navbar />
            <CommandPalette referencePages={getSiteStats().referencePages} />
            <main id="main" className="flex-1">
              {children}
            </main>
            <Footer />
          </ProgressProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
