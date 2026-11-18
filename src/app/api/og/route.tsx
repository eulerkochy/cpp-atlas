import { ImageResponse } from "next/og";
import { OG_FONTS, OG_SIZE, OgBrand, OgByteStrip, OgCanvas } from "@/lib/og";
import { SITE } from "@/lib/site";

function clampText(
  raw: string | null,
  fallback: string,
  maxLength: number
): string {
  const normalized = raw?.replace(/\s+/g, " ").trim();
  if (!normalized) return fallback;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = clampText(searchParams.get("title"), SITE.name, 90);
  const kicker = clampText(
    searchParams.get("kicker"),
    "C++ Study & Reference",
    48
  );
  const meta = clampText(searchParams.get("meta"), "/w/cpp", 72);
  const footerNote = clampText(
    searchParams.get("sub"),
    "Read / Map / Quiz",
    40
  );

  const titleFontSize =
    title.length > 58 ? 62 : title.length > 34 ? 78 : 96;

  return new ImageResponse(
    (
      <OgCanvas>
        <div
          style={{
            position: "absolute",
            left: 64,
            right: 64,
            top: 56,
            bottom: 132,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <OgBrand name={SITE.name} />
            <div
              style={{
                display: "flex",
                fontSize: 24,
                letterSpacing: "-0.01em",
                color: "rgba(0, 0, 0, 0.74)",
              }}
            >
              {kicker}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              fontFamily: "Fraunces",
              fontSize: titleFontSize,
              lineHeight: 1.02,
              letterSpacing: "-0.035em",
              maxWidth: 1020,
            }}
          >
            {title}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 24,
            }}
          >
            <div
              style={{
                display: "flex",
                backgroundColor: "#ffffff",
                borderRadius: 10,
                padding: "9px 16px",
                fontFamily: "JetBrains Mono",
                fontSize: 20,
                boxShadow: "0 10px 24px -12px rgba(110, 70, 0, 0.5)",
              }}
            >
              {meta}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 22,
                color: "rgba(0, 0, 0, 0.68)",
              }}
            >
              {footerNote}
            </div>
          </div>
        </div>

        <OgByteStrip
          cell={30}
          height={40}
          repeat={3}
          style={{ position: "absolute", left: 64, bottom: 52 }}
        />
      </OgCanvas>
    ),
    {
      ...OG_SIZE,
      fonts: OG_FONTS,
      headers: {
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
      },
    }
  );
}
