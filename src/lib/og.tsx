import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CSSProperties, ReactNode } from "react";

/**
 * Shared pieces of the social share cards (the home card and /api/og).
 * Colours are literal: the image renderer does not read the site's CSS variables.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;

export const OG = {
  ink: "#000000",
  inkSoft: "rgba(0, 0, 0, 0.66)",
  paper: "#fbfaf6",
  sunk: "#f3f1e9",
  sun: "#ffc93a",
  sky: "#cfe0f3",
  leaf: "#cfe8d6",
  codeInk: "#262626",
  codeBlue: "#2c5684",
  codeSoft: "#6b6b6b",
} as const;

const FONT_DIR = join(process.cwd(), "src", "assets", "fonts");
const font = (file: string) => readFile(join(FONT_DIR, file));

// The same three faces the site uses, read once per server instance.
const [display, sans, sansBold, mono] = await Promise.all([
  font("fraunces-latin-500-normal.woff"),
  font("instrument-sans-latin-500-normal.woff"),
  font("instrument-sans-latin-600-normal.woff"),
  font("jetbrains-mono-latin-500-normal.woff"),
]);

export const OG_FONTS = [
  { name: "Fraunces", data: display, style: "normal" as const, weight: 500 as const },
  { name: "Instrument Sans", data: sans, style: "normal" as const, weight: 500 as const },
  { name: "Instrument Sans", data: sansBold, style: "normal" as const, weight: 600 as const },
  { name: "JetBrains Mono", data: mono, style: "normal" as const, weight: 500 as const },
];

/** The sunlit ground: the hero's yellow with a paler patch where the light lands. */
export function OgCanvas({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        fontFamily: "Instrument Sans",
        fontWeight: 500,
        color: OG.ink,
        backgroundColor: OG.sun,
        backgroundImage:
          "radial-gradient(circle at 18% 0%, #fff6d6 0%, rgba(255, 246, 214, 0) 58%), linear-gradient(180deg, #ffe08a 0%, #ffc93a 60%, #ffbd1f 100%)",
      }}
    >
      {children}
    </div>
  );
}

export function OgBrand({ name }: { name: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <svg viewBox="0 0 32 32" width={40} height={40}>
        <circle cx="16" cy="16" r="16" fill="#000000" />
        <circle cx="22.5" cy="10" r="5.5" fill="#FFC93A" />
        <path d="M7 22.5h18" stroke="#FBFAF6" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <div style={{ display: "flex", fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em" }}>
        {name}
      </div>
    </div>
  );
}

/**
 * `struct Packet { char tag; int id; short len; }` byte by byte on a typical
 * 64-bit ABI: 12 bytes, 5 of them padding.
 */
const PACKET_LAYOUT = [
  { label: "tag", bytes: 1, fill: OG.sun, pad: false },
  { label: "padding", bytes: 3, fill: OG.sunk, pad: true },
  { label: "id", bytes: 4, fill: OG.sky, pad: false },
  { label: "len", bytes: 2, fill: OG.leaf, pad: false },
  { label: "pad", bytes: 2, fill: OG.sunk, pad: true },
] as const;

/** A row of byte cells. With `labels`, each field is named under its bytes. */
export function OgByteStrip({
  cell,
  height,
  labels = false,
  repeat = 1,
  style,
}: {
  cell: number;
  height: number;
  labels?: boolean;
  repeat?: number;
  style?: CSSProperties;
}) {
  const fields = Array.from({ length: repeat }, () => PACKET_LAYOUT).flat();
  return (
    <div style={{ display: "flex", gap: 4, fontFamily: "JetBrains Mono", ...style }}>
      {fields.map((field, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            style={{
              display: "flex",
              height,
              borderRadius: 7,
              overflow: "hidden",
              backgroundColor: field.fill,
              border: field.pad
                ? "1.5px dashed rgba(0, 0, 0, 0.3)"
                : "1.5px solid rgba(0, 0, 0, 0.8)",
            }}
          >
            {Array.from({ length: field.bytes }, (_, b) => (
              <div
                key={b}
                style={{
                  display: "flex",
                  width: cell,
                  height: "100%",
                  borderLeft: b === 0 ? "none" : "1px solid rgba(0, 0, 0, 0.16)",
                }}
              />
            ))}
          </div>
          {labels ? (
            <div
              style={{
                display: "flex",
                fontSize: 15,
                color: field.pad ? "rgba(0, 0, 0, 0.45)" : OG.ink,
              }}
            >
              {field.label}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
