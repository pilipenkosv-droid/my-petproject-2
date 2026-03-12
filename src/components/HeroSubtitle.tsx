"use client";

import { WordRotate } from "@/components/ui/word-rotate";
import { SpinningText } from "@/components/ui/spinning-text";

export function HeroSubtitle() {
  return (
    <div className="relative inline-block">
      <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6 flex flex-col items-center md:items-start justify-center gap-y-1 sm:gap-y-2">
        <span className="text-foreground">Идеальное</span>
        <span className="text-foreground">оформление</span>
        <WordRotate
          words={[
            "дипломной",
            "курсовой",
            "магистерской",
            "реферата",
            "эссе",
            "отчёта",
            "ВКР",
          ]}
          duration={2500}
          className="font-mono text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold text-foreground"
        />
        <span className="text-foreground">по методичке</span>
      </h1>

      {/* Spinning "AI powered inside" badge — superscript position */}
      <div className="absolute -top-16 left-0 sm:-top-20 sm:left-0 md:-top-24 md:left-0 lg:-top-28 lg:left-0 hidden sm:block">
        <SpinningText
          radius={4.2}
          duration={8}
          className="w-20 h-20 sm:w-24 sm:h-24 text-[10px] sm:text-xs font-medium text-purple-700 dark:text-purple-400 tracking-[0.25em] uppercase"
        >
          {`AI  powered  inside · `}
        </SpinningText>
      </div>
    </div>
  );
}
