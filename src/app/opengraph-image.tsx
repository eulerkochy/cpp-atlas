import { ImageResponse } from "next/og";
import { OG, OG_FONTS, OG_SIZE, OgBrand, OgByteStrip, OgCanvas } from "@/lib/og";
import { SITE } from "@/lib/site";
import { getSiteStats } from "@/lib/site-stats";

export const alt =
  "C++ Atlas: the C++ reference that explains itself. A struct shown byte by byte, padding included.";
export const size = OG_SIZE;
export const contentType = "image/png";

type Token = [text: string, color?: string];

const CODE: Token[][] = [
  [["struct", OG.codeBlue], [" Packet {"]],
  [["  char", OG.codeBlue], ["  tag;"]],
  [["  int", OG.codeBlue], ["   id;"]],
  [["  short", OG.codeBlue], [" len;"]],
  [["};"]],
];

export default function OpenGraphImage() {
  const stats = getSiteStats();
  const counts = [
    { value: String(stats.topics), label: "topics" },
    { value: String(stats.simulators), label: "simulators" },
    {
      value: stats.referencePages.toLocaleString("en-US"),
      label: "reference pages",
    },
  ];

  return new ImageResponse(
    (
      <OgCanvas>
        <div
          style={{
            position: "absolute",
            left: 64,
            top: 56,
            bottom: 56,
            width: 560,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <OgBrand name={SITE.name} />

          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <div
              style={{
                display: "flex",
                fontFamily: "Fraunces",
                fontSize: 80,
                lineHeight: 0.98,
                letterSpacing: "-0.035em",
              }}
            >
              The C++ reference that explains itself.
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 25,
                lineHeight: 1.3,
                letterSpacing: "-0.01em",
                color: "rgba(0, 0, 0, 0.74)",
              }}
            >
              All of cppreference, plus deep-dive topics, simulators and quizzes that cite the standard.
            </div>
          </div>

          <div style={{ display: "flex", gap: 30 }}>
            {counts.map((c) => (
              <div
                key={c.label}
                style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 22 }}
              >
                <div style={{ display: "flex", fontWeight: 600 }}>{c.value}</div>
                <div style={{ display: "flex", color: "rgba(0, 0, 0, 0.68)" }}>
                  {c.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            left: 668,
            top: 92,
            width: 500,
            display: "flex",
            flexDirection: "column",
            backgroundColor: "#ffffff",
            borderRadius: 22,
            transform: "rotate(-3deg)",
            boxShadow:
              "0 40px 70px -30px rgba(110, 70, 0, 0.55), 0 3px 8px rgba(0, 0, 0, 0.08)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 22px",
              borderBottom: "1px solid rgba(0, 0, 0, 0.09)",
            }}
          >
            <div style={{ display: "flex", gap: 7 }}>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    width: 11,
                    height: 11,
                    borderRadius: 9999,
                    backgroundColor: "rgba(0, 0, 0, 0.14)",
                  }}
                />
              ))}
            </div>
            <div
              style={{
                display: "flex",
                fontFamily: "JetBrains Mono",
                fontSize: 15,
                color: OG.codeSoft,
              }}
            >
              packet.cpp
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              padding: "24px 30px 6px",
              fontFamily: "JetBrains Mono",
              fontSize: 27,
              lineHeight: 1.5,
              color: OG.codeInk,
            }}
          >
            {CODE.map((line, i) => (
              <div key={i} style={{ display: "flex", whiteSpace: "pre" }}>
                {line.map(([text, color], j) => (
                  <div key={j} style={{ display: "flex", color: color ?? OG.codeInk }}>
                    {text}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 14,
              padding: "20px 30px 28px",
            }}
          >
            <OgByteStrip cell={34} height={46} labels />
            <div
              style={{
                display: "flex",
                fontFamily: "JetBrains Mono",
                fontSize: 16,
                color: OG.codeSoft,
              }}
            >
              sizeof(Packet) == 12, 5 bytes are padding
            </div>
          </div>
        </div>
      </OgCanvas>
    ),
    { ...size, fonts: OG_FONTS }
  );
}
