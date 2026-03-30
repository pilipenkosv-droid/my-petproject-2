import { ImageResponse } from "next/og";
import { D_ICON_WHITE_BASE64 } from "@/lib/logo/constants";

export const runtime = "edge";
export const alt = "Diplox — результат оформления";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const WORK_TYPE_LABELS: Record<string, string> = {
  diplom: "дипломную работу",
  kursovaya: "курсовую работу",
  referat: "реферат",
  otchet: "отчёт по практике",
  dissertation: "диссертацию",
  vkr: "выпускную работу",
};

type Props = { params: Promise<{ jobId: string }> };

export default async function Image({ params }: Props) {
  const { jobId } = await params;

  const unbounded = await fetch(
    "https://fonts.gstatic.com/s/unbounded/v12/Yq6F-LOTXCb04q32xlpat-6uR42XTqtG6__2040.ttf"
  ).then((res) => res.arrayBuffer());

  let workLabel = "работу";
  let fixesApplied = 0;
  let pageCount = 0;

  try {
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://diplox.online";
    const res = await fetch(`${siteUrl}/api/status/${jobId}`, {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const data = await res.json();
      workLabel =
        WORK_TYPE_LABELS[data.workType as string] ?? "работу";
      fixesApplied = data.statistics?.fixesApplied ?? 0;
      pageCount = data.statistics?.pageCount ?? 0;
    }
  } catch {
    // Фоллбэк — показать универсальный вариант
  }

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
        {/* Purple glow */}
        <div
          style={{
            position: "absolute",
            bottom: "-120px",
            right: "-50px",
            width: "700px",
            height: "700px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(146,95,246,0.28) 0%, transparent 70%)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "-80px",
            left: "-60px",
            width: "500px",
            height: "500px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(99,68,245,0.15) 0%, transparent 70%)",
            display: "flex",
          }}
        />

        {/* Logo row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "48px",
            position: "relative",
          }}
        >
          <img
            src={D_ICON_WHITE_BASE64}
            width={36}
            height={36}
            style={{ objectFit: "contain" }}
          />
          <span
            style={{
              fontSize: "28px",
              fontWeight: 700,
              fontFamily: "Unbounded",
              color: "rgba(255,255,255,0.7)",
              letterSpacing: "-0.5px",
            }}
          >
            Diplox
          </span>
        </div>

        {/* Headline */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            marginBottom: "48px",
            position: "relative",
          }}
        >
          <span
            style={{
              fontSize: "52px",
              fontWeight: 700,
              fontFamily: "Unbounded",
              color: "rgba(255,255,255,0.55)",
              lineHeight: 1.15,
              letterSpacing: "-1.5px",
            }}
          >
            Оформил {workLabel}:
          </span>
          <span
            style={{
              fontSize: "68px",
              fontWeight: 700,
              fontFamily: "Unbounded",
              color: "white",
              lineHeight: 1.1,
              letterSpacing: "-2px",
            }}
          >
            {fixesApplied} исправлений
          </span>
          <span
            style={{
              fontSize: "40px",
              fontWeight: 700,
              fontFamily: "Unbounded",
              color: "rgba(146,95,246,0.9)",
              lineHeight: 1.2,
              letterSpacing: "-1px",
            }}
          >
            на {pageCount} стр.
          </span>
        </div>

        {/* CTA button */}
        <div style={{ display: "flex", position: "relative" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "14px 36px",
              borderRadius: "12px",
              background: "rgba(255,255,255,0.95)",
              fontSize: "20px",
              fontWeight: 700,
              fontFamily: "Unbounded",
              color: "#0a0a0f",
              letterSpacing: "-0.3px",
            }}
          >
            Попробовать бесплатно
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "Unbounded",
          data: unbounded,
          style: "normal",
          weight: 700,
        },
      ],
    }
  );
}
