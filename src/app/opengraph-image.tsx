import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt =
  "SmartFormat — Идеальное оформление научной работы по методичке";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/* S-curve path from Logo component (white mark only) */
const FLOW_PATH =
  "M8 20 C8 13, 13 10, 16 10 C19.5 10, 19.5 14.5, 16 16.5 C12.5 18.5, 12.5 23, 16 23 C20 23, 24 18, 24 12";

export default async function Image() {
  const geologica = await fetch(
    "https://fonts.gstatic.com/s/geologica/v5/oY1o8evIr7j9P3TN9YwNAdyjzUyDKkKdAGOJh1UlCDUIhAIdhCZOn1fLsig7jfvCCPHZckU8H3G11_z-_OZqD_jsQ-M.ttf"
  ).then((res) => res.arrayBuffer());

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px 100px",
          background: "#0a0a0f",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Subtle background glow */}
        <div
          style={{
            position: "absolute",
            bottom: "-200px",
            right: "-100px",
            width: "600px",
            height: "600px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)",
            display: "flex",
          }}
        />

        {/* Top: Logo icon + SmartFormat name (small, left-aligned) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "48px",
          }}
        >
          {/* White S-curve icon only (no purple bg) */}
          <svg width="36" height="36" viewBox="0 0 32 32" fill="none">
            <path
              d={FLOW_PATH}
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              strokeOpacity="0.8"
            />
          </svg>
          <span
            style={{
              fontSize: "28px",
              fontWeight: 700,
              fontFamily: "Geologica",
              color: "rgba(255,255,255,0.7)",
              letterSpacing: "-0.5px",
            }}
          >
            SmartFormat
          </span>
        </div>

        {/* Main headline (large, left-aligned) */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            marginBottom: "48px",
          }}
        >
          <span
            style={{
              fontSize: "72px",
              fontWeight: 700,
              fontFamily: "Geologica",
              color: "white",
              lineHeight: 1.1,
              letterSpacing: "-2px",
            }}
          >
            Идеальное
          </span>
          <span
            style={{
              fontSize: "72px",
              fontWeight: 700,
              fontFamily: "Geologica",
              color: "white",
              lineHeight: 1.1,
              letterSpacing: "-2px",
            }}
          >
            оформление,
          </span>
          <span
            style={{
              fontSize: "72px",
              fontWeight: 700,
              fontFamily: "Geologica",
              color: "rgba(255,255,255,0.5)",
              lineHeight: 1.1,
              letterSpacing: "-2px",
            }}
          >
            по методичке
          </span>
        </div>

        {/* CTA button */}
        <div style={{ display: "flex" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "14px 36px",
              borderRadius: "12px",
              background: "rgba(255,255,255,0.95)",
              fontSize: "20px",
              fontWeight: 700,
              fontFamily: "Geologica",
              color: "#0a0a0f",
              letterSpacing: "-0.3px",
            }}
          >
            Попробовать
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "Geologica",
          data: geologica,
          style: "normal",
          weight: 700,
        },
      ],
    }
  );
}
