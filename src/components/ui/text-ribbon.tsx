"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

interface TextRibbonProps {
  beforeText: string;
  afterText: string;
  beforeSpeed?: number;
  afterSpeed?: number;
  className?: string;
  centerIcon?: React.ReactNode;
  /** Цвет подложки-полосы для after-текста (hex), по умолчанию #a855f7 (purple-500) */
  afterStrokeColor?: string;
}

// Обе кривые заканчиваются/начинаются на Y=100 (центр viewBox 200)
// Before: S-образная петля, плавно выходит к правому краю на Y=100
const CURVE_BEFORE =
  "M0 160 C80 120, 140 30, 280 50 C420 70, 380 170, 500 140 C620 110, 700 60, 800 80 C900 100, 980 100, 1050 100";

// After: плавная дуга, начинается на Y=100 (совпадает с концом before)
const CURVE_AFTER =
  "M0 100 C120 100, 200 70, 400 80 C600 90, 800 120, 1050 100";

function CurvedTextSvg({
  text,
  speed,
  curveId,
  curvePath,
  viewBox,
  strokeWidth,
  strokeColor,
  strokeOpacity,
  textOpacity,
  textWeight,
}: {
  text: string;
  speed: number;
  curveId: string;
  curvePath: string;
  viewBox: string;
  strokeWidth?: number;
  strokeColor?: string;
  strokeOpacity?: number;
  textOpacity?: number;
  textWeight?: number;
}) {
  const long = Array(8).fill(text).join("   ·   ");
  const shiftLength = 1800;

  const svgContent = `
    <path id="${curveId}" d="${curvePath}"
      ${strokeWidth ? `stroke="${strokeColor || "#a855f7"}" stroke-width="${strokeWidth}" stroke-linecap="round" opacity="${strokeOpacity ?? 0.15}"` : 'stroke="none"'} fill="none" />
    <text x="0" font-size="30" font-weight="${textWeight || 300}"
      fill="currentColor" opacity="${textOpacity ?? 0.2}">
      <textPath xlink:href="#${curveId}">${escapeHtml(long)}</textPath>
      <animate attributeName="x" dur="${speed}s"
        values="-${shiftLength}; 0" repeatCount="indefinite" />
    </text>
  `;

  return (
    <svg
      width="100%"
      height="auto"
      viewBox={viewBox}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      xmlnsXlink="http://www.w3.org/1999/xlink"
      className="w-full h-auto"
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function TextRibbon({
  beforeText,
  afterText,
  beforeSpeed = 35,
  afterSpeed = 45,
  className,
  centerIcon,
  afterStrokeColor = "#a855f7",
}: TextRibbonProps) {
  const id = useId().replace(/:/g, "");

  return (
    <div
      className={cn("relative w-full overflow-hidden", className)}
      aria-hidden="true"
    >
      <div className="relative mx-auto flex items-center justify-center max-w-[1400px]">
        {/* Left — «before» (messy text on wavy curve) */}
        <div className="flex-1 min-w-0">
          <CurvedTextSvg
            text={beforeText}
            speed={beforeSpeed}
            curveId={`cb-${id}`}
            curvePath={CURVE_BEFORE}
            viewBox="0 0 1050 200"
            textOpacity={0.18}
            textWeight={300}
          />
        </div>

        {/* Center icon — overlaps both curve ends */}
        {centerIcon && (
          <div className="relative z-10 shrink-0 mx-[-28px] sm:mx-[-36px]">
            {centerIcon}
          </div>
        )}

        {/* Right — «after» (clean text on smooth curve with thick purple stroke) */}
        <div className="flex-1 min-w-0">
          <CurvedTextSvg
            text={afterText}
            speed={afterSpeed}
            curveId={`ca-${id}`}
            curvePath={CURVE_AFTER}
            viewBox="0 0 1050 200"
            strokeWidth={24}
            strokeColor={afterStrokeColor}
            strokeOpacity={0.15}
            textOpacity={0.85}
            textWeight={500}
          />
        </div>
      </div>
    </div>
  );
}
