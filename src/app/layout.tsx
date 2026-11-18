import type { Metadata, Viewport } from "next";
import { Fraunces, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import { CommandPalette } from "@/components/CommandPalette";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { ProgressProvider } from "@/components/ProgressProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
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

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://cpp-atlas.vercel.app"
  ),
  title: {
    default: "C++ Atlas — Every cppreference Page Mapped 1:1",
    template: "%s | C++ Atlas",
  },
  description:
    "33 visual C++ study topics, 11 interactive memory and layout simulators, 220 ISO standardese traps, and every page of cppreference.com mapped 1:1.",
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "C++ Atlas — Every cppreference Page Mapped 1:1",
    description:
      "33 visual C++ study topics, 11 interactive memory and layout simulators, 220 ISO standardese traps, and every page of cppreference.com mapped 1:1.",
    siteName: "C++ Atlas",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "C++ Atlas — Every cppreference Page Mapped 1:1",
    description:
      "33 visual C++ study topics, 11 interactive memory and layout simulators, 220 ISO standardese traps, and every page of cppreference.com mapped 1:1.",
  },
};

export const viewport: Viewport = {
  themeColor: "#fbfaf6",
  colorScheme: "light",
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
    >
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
            <CommandPalette />
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
