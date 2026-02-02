import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt =
  "SmartFormat — Идеальное оформление научной работы по методичке";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/* S-curve path from Logo component */
const FLOW_PATH =
  "M8 20 C8 13, 13 10, 16 10 C19.5 10, 19.5 14.5, 16 16.5 C12.5 18.5, 12.5 23, 16 23 C20 23, 24 18, 24 12";

export default async function Image() {
  const [geologica] = await Promise.all([
    fetch(
      "https://fonts.gstatic.com/s/geologica/v5/oY1o8evIr7j9P3TN9YwNAdyjzUyDKkKdAGOJh1UlCDUIhAIdhCZOn1fLsig7jfvCCPHZckU8H3G11_z-_OZqD_jsQ-M.ttf"
    ).then((res) => res.arrayBuffer()),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0a0a0f 0%, #1a1025 40%, #0f0a1a 100%)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Background glow circles */}
        <div
          style={{
            position: "absolute",
            top: "-100px",
            left: "-100px",
            width: "500px",
            height: "500px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-150px",
            right: "-100px",
            width: "600px",
            height: "600px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "800px",
            height: "400px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(124,58,237,0.08) 0%, transparent 60%)",
            display: "flex",
          }}
        />

        {/* Logo icon + text */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "20px",
            marginBottom: "32px",
          }}
        >
          {/* Logo icon */}
          <svg
            width="80"
            height="80"
            viewBox="0 0 32 32"
            fill="none"
          >
            <defs>
              <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#667eea" />
                <stop offset="100%" stopColor="#764ba2" />
              </linearGradient>
            </defs>
            <rect width="32" height="32" rx="8" fill="url(#bg)" />
            <path
              d={FLOW_PATH}
              stroke="white"
              strokeWidth="2.8"
              strokeLinecap="round"
              fill="none"
            />
          </svg>

          {/* SmartFormat text */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                fontSize: "64px",
                fontWeight: 700,
                fontFamily: "Geologica",
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Smart
            </span>
            <span
              style={{
                fontSize: "64px",
                fontWeight: 700,
                fontFamily: "Geologica",
                color: "white",
              }}
            >
              Format
            </span>
            {/* Beta badge */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "4px 12px",
                borderRadius: "20px",
                background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                fontSize: "16px",
                fontWeight: 600,
                fontFamily: "Geologica",
                color: "rgba(255,255,255,0.9)",
                letterSpacing: "2px",
                textTransform: "uppercase" as const,
                marginLeft: "4px",
                marginBottom: "20px",
              }}
            >
              beta
            </div>
          </div>
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: "32px",
            fontWeight: 500,
            fontFamily: "Geologica",
            color: "rgba(255,255,255,0.75)",
            textAlign: "center",
            maxWidth: "800px",
            lineHeight: 1.4,
          }}
        >
          Идеальное оформление научной работы
        </div>
        <div
          style={{
            fontSize: "32px",
            fontWeight: 500,
            fontFamily: "Geologica",
            color: "rgba(255,255,255,0.75)",
            textAlign: "center",
            maxWidth: "800px",
            lineHeight: 1.4,
          }}
        >
          по методичке
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: "20px",
            fontFamily: "Geologica",
            color: "rgba(255,255,255,0.4)",
            textAlign: "center",
            maxWidth: "700px",
            marginTop: "20px",
            lineHeight: 1.5,
          }}
        >
          Загрузите работу и методичку — ИИ автоматически оформит документ по ГОСТу
        </div>

        {/* Bottom border accent */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "4px",
            background: "linear-gradient(90deg, transparent 0%, #667eea 30%, #764ba2 70%, transparent 100%)",
            display: "flex",
          }}
        />
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
