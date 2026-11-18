import { ImageResponse } from "next/og";
import { getSiteStats } from "@/lib/site-stats";

export const alt = "C++ Atlas — Every cppreference Page Mapped 1:1";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  const stats = getSiteStats();
  const STATS = [
    { value: String(stats.topics), label: "Study topics", wide: false },
    { value: String(stats.simulators), label: "Memory simulators", wide: false },
    { value: String(stats.traps), label: "Standardese traps", wide: false },
    {
      value: stats.referencePages.toLocaleString("en-US"),
      label: "1:1 /w/cpp & /w/c pages",
      wide: true,
    },
  ] as const;
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
            justifyContent: "space-between",
            padding: "44px 56px 50px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 24,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    backgroundColor: "#ffc93a",
                    color: "#000000",
                    borderRadius: 9999,
                    padding: "8px 20px",
                    fontSize: 22,
                    fontWeight: 600,
                    letterSpacing: "-0.015em",
                  }}
                >
                  C++ Atlas
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    fontSize: 21,
                    color: "rgba(0, 0, 0, 0.6)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  en.cppreference.com 1:1
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  backgroundColor: "#fff3c9",
                  border: "1px solid rgba(0, 0, 0, 0.1)",
                  borderRadius: 9999,
                  padding: "7px 16px",
                  fontSize: 17,
                  color: "#000000",
                }}
              >
                C++11 to C++26
              </div>
            </div>

            <div
              style={{
                display: "flex",
                fontSize: 58,
                fontWeight: 600,
                lineHeight: 1.08,
                letterSpacing: "-0.03em",
                color: "#000000",
                maxWidth: 960,
              }}
            >
              Every cppreference page, mapped &amp; tested
            </div>
          </div>

          <div
            style={{
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
                padding: "14px 22px",
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
                    color: "rgba(0, 0, 0, 0.6)",
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
                Sunlit Study &amp; Reference
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "row",
                gap: 16,
                padding: "24px 24px",
              }}
            >
              {STATS.map((item) => (
                <div
                  key={item.label}
                  style={{
                    flex: item.wide ? 1.3 : 1,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: 8,
                    backgroundColor: "#fbfaf6",
                    border: "1px solid rgba(0, 0, 0, 0.08)",
                    borderRadius: 14,
                    padding: "18px 20px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      fontSize: 38,
                      fontWeight: 700,
                      lineHeight: 1.05,
                      letterSpacing: "-0.03em",
                      color: "#000000",
                    }}
                  >
                    {item.value}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      fontSize: 17,
                      lineHeight: 1.3,
                      color: "rgba(0, 0, 0, 0.68)",
                    }}
                  >
                    {item.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
