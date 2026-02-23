"use client"

import React, { memo } from "react"

interface AuroraTextProps {
  children: React.ReactNode
  className?: string
  colors?: string[]
  speed?: number
}

export const AuroraText = memo(
  ({
    children,
    className = "",
    colors = ["#925FF6", "#7029F8", "#491990", "#32C6A5"],
    speed = 1,
  }: AuroraTextProps) => {
    const gradientStyle = {
      backgroundImage: `linear-gradient(135deg, ${colors.join(", ")}, ${
        colors[0]
      })`,
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      animationDuration: `${10 / speed}s`,
    }

    return (
      <span
        className={`animate-aurora relative inline-block bg-[length:200%_auto] bg-clip-text text-transparent ${className}`}
        style={gradientStyle}
      >
        {children}
      </span>
    )
  }
)

AuroraText.displayName = "AuroraText"
