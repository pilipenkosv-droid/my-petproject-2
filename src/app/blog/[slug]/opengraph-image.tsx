import { ImageResponse } from "next/og";
import { getPostBySlug } from "@/lib/blog/posts";

export const runtime = "edge";
export const alt = "SmartFormat — Блог";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const FLOW_PATH =
  "M8 20 C8 13, 13 10, 16 10 C19.5 10, 19.5 14.5, 16 16.5 C12.5 18.5, 12.5 23, 16 23 C20 23, 24 18, 24 12";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  const title = post?.title || "SmartFormat — Блог";

  // Адаптивный размер шрифта: длинные заголовки — мельче
  const fontSize = title.length > 60 ? 40 : title.length > 40 ? 48 : 56;

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
          justifyContent: "space-between",
          padding: "60px 80px",
          background: "#0a0a0f",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Background glow */}
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

        {/* Top: Logo + Blog tag */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
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
                fontSize: "24px",
                fontWeight: 700,
                fontFamily: "Geologica",
                color: "rgba(255,255,255,0.7)",
                letterSpacing: "-0.5px",
              }}
            >
              SmartFormat
            </span>
          </div>
          <div
            style={{
              display: "flex",
              padding: "6px 16px",
              borderRadius: "8px",
              background: "rgba(139,92,246,0.15)",
              border: "1px solid rgba(139,92,246,0.3)",
              fontSize: "16px",
              fontWeight: 600,
              fontFamily: "Geologica",
              color: "rgba(139,92,246,0.9)",
            }}
          >
            Блог
          </div>
        </div>

        {/* Center: Post title */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            justifyContent: "center",
            paddingRight: "40px",
          }}
        >
          <span
            style={{
              fontSize: `${fontSize}px`,
              fontWeight: 700,
              fontFamily: "Geologica",
              color: "white",
              lineHeight: 1.2,
              letterSpacing: "-1.5px",
            }}
          >
            {title}
          </span>
        </div>

        {/* Bottom: URL */}
        <div style={{ display: "flex" }}>
          <span
            style={{
              fontSize: "18px",
              fontFamily: "Geologica",
              color: "rgba(255,255,255,0.3)",
            }}
          >
            ai-sformat.vercel.app
          </span>
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
