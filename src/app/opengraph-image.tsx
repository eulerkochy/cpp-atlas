import { ImageResponse } from "next/og";
import { SITE } from "@/lib/site";
import { getSiteStats } from "@/lib/site-stats";

export const alt =
  "C++ Atlas — Visual C++ Study Topics, Memory Simulators & Offline Reference";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  const stats = getSiteStats();
  const STATS = [
    { value: String(stats.topics), label: "Study topics", wide: false },
    { value: String(stats.simulators), label: "Machine simulators", wide: false },
    {
      value: stats.traps.toLocaleString("en-US"),
      label: "Clause-cited traps",
      wide: false,
    },
    {
      value: stats.referencePages.toLocaleString("en-US"),
      label: "Offline /w/cpp & /w/c pages",
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
            padding: "42px 56px 48px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 18,
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
                  {SITE.name}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    fontSize: 20,
                    color: "rgba(0, 0, 0, 0.62)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {stats.tracks} tracks, C++11 to C++26
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
                Offline 1:1 cppreference
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontSize: 54,
                  fontWeight: 600,
                  lineHeight: 1.07,
                  letterSpacing: "-0.03em",
                  color: "#000000",
                  maxWidth: 1020,
                }}
              >
                Every corner of C++, mapped to the machine &amp; the standard
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: 22,
                  lineHeight: 1.35,
                  color: "rgba(0, 0, 0, 0.66)",
                  maxWidth: 980,
                }}
              >
                Deep-dive prose, interactive concept maps, live memory layouts,
                and Compiler Explorer links.
              </div>
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
                  {SITE.host}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  fontSize: 15,
                  color: "rgba(0, 0, 0, 0.56)",
                }}
              >
                Read / Map / Quiz
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
