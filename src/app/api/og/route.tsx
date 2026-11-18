import { ImageResponse } from "next/og";

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
  const title = clampText(searchParams.get("title"), "C++ Atlas", 90);
  const kicker = clampText(
    searchParams.get("kicker"),
    "C++ Study & Reference",
    48
  );
  const meta = clampText(searchParams.get("meta"), "/w/cpp", 70);

  const titleFontSize =
    title.length > 58 ? 44 : title.length > 34 ? 54 : 62;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#fbfaf6",
          color: "#000000",
        }}
      >
        <div
          style={{
            width: "100%",
            height: 12,
            display: "flex",
            backgroundColor: "#ffc93a",
          }}
        />

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            padding: "44px 56px",
          }}
        >
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              backgroundColor: "#ffffff",
              border: "1px solid rgba(0, 0, 0, 0.1)",
              borderRadius: 20,
              overflow: "hidden",
              boxShadow:
                "0 24px 56px -24px rgba(120, 80, 0, 0.24), 0 2px 6px rgba(0, 0, 0, 0.05)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 26px",
                borderBottom: "1px solid rgba(0, 0, 0, 0.09)",
                backgroundColor: "#ffffff",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      width: 10,
                      height: 10,
                      borderRadius: 9999,
                      backgroundColor: "rgba(0, 0, 0, 0.14)",
                    }}
                  />
                  <div
                    style={{
                      display: "flex",
                      width: 10,
                      height: 10,
                      borderRadius: 9999,
                      backgroundColor: "rgba(0, 0, 0, 0.14)",
                    }}
                  />
                  <div
                    style={{
                      display: "flex",
                      width: 10,
                      height: 10,
                      borderRadius: 9999,
                      backgroundColor: "rgba(0, 0, 0, 0.14)",
                    }}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    fontSize: 16,
                    color: "rgba(0, 0, 0, 0.58)",
                  }}
                >
                  cpp-atlas.dev
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  fontSize: 15,
                  color: "rgba(0, 0, 0, 0.56)",
                }}
              >
                en.cppreference.com 1:1
              </div>
            </div>

            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                padding: "36px 42px 34px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    backgroundColor: "#ffc93a",
                    color: "#000000",
                    borderRadius: 9999,
                    padding: "8px 18px",
                    fontSize: 20,
                    fontWeight: 600,
                    letterSpacing: "-0.01em",
                  }}
                >
                  C++ Atlas
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    backgroundColor: "#f3f1e9",
                    border: "1px solid rgba(0, 0, 0, 0.09)",
                    color: "rgba(0, 0, 0, 0.78)",
                    borderRadius: 10,
                    padding: "8px 16px",
                    fontSize: 19,
                  }}
                >
                  {kicker}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  fontSize: titleFontSize,
                  fontWeight: 700,
                  lineHeight: 1.12,
                  letterSpacing: "-0.025em",
                  color: "#000000",
                  maxWidth: 980,
                }}
              >
                {title}
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingTop: 20,
                  borderTop: "1px solid rgba(0, 0, 0, 0.09)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    backgroundColor: "#fff3c9",
                    border: "1px solid rgba(0, 0, 0, 0.1)",
                    borderRadius: 10,
                    padding: "8px 16px",
                    fontSize: 20,
                    color: "#000000",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {meta}
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    fontSize: 18,
                    color: "rgba(0, 0, 0, 0.56)",
                  }}
                >
                  Mapped &amp; verified 1:1
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
      },
    }
  );
}
