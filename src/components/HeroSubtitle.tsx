"use client";

import React, { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

function ContainerTextFlip({
  words = ["better", "modern", "beautiful", "awesome"],
  interval = 3000,
  className,
  textClassName,
  animationDuration = 700,
}: {
  words?: string[];
  interval?: number;
  className?: string;
  textClassName?: string;
  animationDuration?: number;
}) {
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const measuredWidths = useRef<number[]>([]);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState<number | undefined>(undefined);

  // Measure all words once on mount
  useEffect(() => {
    if (!measureRef.current) return;
    const el = measureRef.current;
    const widths: number[] = [];
    for (const word of words) {
      el.textContent = word;
      widths.push(el.scrollWidth);
    }
    el.textContent = "";
    measuredWidths.current = widths;
    setWidth(widths[0]);
  }, [words]);

  useEffect(() => {
    if (measuredWidths.current.length > 0) {
      setWidth(measuredWidths.current[currentWordIndex]);
    }
  }, [currentWordIndex]);

  useEffect(() => {
    const id = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentWordIndex((prev) => (prev + 1) % words.length);
        setIsAnimating(false);
      }, animationDuration);
    }, interval);
    return () => clearInterval(id);
  }, [words, interval, animationDuration]);

  const dur = animationDuration / 1000;

  return (
    <span
      suppressHydrationWarning
      className={cn(
        "relative inline-flex items-center justify-center overflow-hidden rounded-lg pt-2 pb-3 text-center",
        className
      )}
      style={
        width
          ? { width: `${width + 44}px`, transition: `width ${dur / 2}s ease` }
          : undefined
      }
    >
      {/* Hidden measurer — same font classes, no animation */}
      <span
        ref={measureRef}
        aria-hidden
        className={cn("absolute invisible whitespace-nowrap", textClassName)}
      />
      <span
        className={cn("inline-block whitespace-nowrap", textClassName)}
        style={{
          transition: `opacity ${dur}s ease, transform ${dur}s ease, filter ${dur}s ease`,
          opacity: isAnimating ? 0 : 1,
          transform: isAnimating ? "translateY(-8px)" : "translateY(0)",
          filter: isAnimating ? "blur(8px)" : "blur(0px)",
        }}
      >
        {words[currentWordIndex].split("").map((letter, index) => (
          <span
            key={`${currentWordIndex}-${index}`}
            style={{
              display: "inline-block",
              animation: isAnimating
                ? "none"
                : `textFlipIn ${dur}s ease ${index * 0.02}s both`,
            }}
          >
            {letter}
          </span>
        ))}
      </span>
    </span>
  );
}

export function HeroSubtitle() {
  return (
    <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight mb-6 flex flex-col items-center md:items-start justify-center gap-y-3">
      <span className="text-foreground">Идеальное оформление</span>
      <ContainerTextFlip
        words={[
          "дипломной",
          "курсовой",
          "магистерской",
          "реферата",
          "эссе",
          "отчёта",
          "ВКР",
        ]}
        interval={2500}
        animationDuration={600}
        className="text-3xl sm:text-5xl md:text-6xl font-extrabold px-5 py-1.5 [background:linear-gradient(to_bottom,#ede9fe,#ddd6fe)] shadow-[inset_0_-1px_#c4b5fd,inset_0_0_0_1px_#c4b5fd,0_4px_8px_rgba(139,92,246,0.15)] dark:[background:linear-gradient(to_bottom,rgba(139,92,246,0.2),rgba(99,102,241,0.15))] dark:shadow-[inset_0_-1px_rgba(139,92,246,0.4),inset_0_0_0_1px_rgba(139,92,246,0.3),0_4px_12px_rgba(139,92,246,0.2)]"
        textClassName="text-violet-700 dark:text-violet-300"
      />
      <span className="text-foreground">по методичке</span>
    </h1>
  );
}
