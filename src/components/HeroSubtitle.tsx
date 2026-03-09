"use client";

import { WordRotate } from "@/components/ui/word-rotate";
import { SpinningText } from "@/components/ui/spinning-text";

export function HeroSubtitle() {
  return (
    <div className="relative inline-block">
      <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight mb-6 flex flex-col items-center md:items-start justify-center gap-y-2">
        <span className="text-foreground">Идеальное оформление</span>
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
          className="font-mono text-3xl sm:text-5xl md:text-6xl font-extrabold text-foreground"
        />
        <span className="text-foreground">по методичке</span>
      </h1>

      {/* Spinning "AI powered inside" badge — superscript position */}
      <div className="absolute -top-8 right-0 sm:-top-10 sm:right-4 md:-top-12 md:right-8 hidden sm:block">
        <SpinningText
          radius={3.5}
          duration={8}
          className="w-20 h-20 sm:w-24 sm:h-24 text-[10px] sm:text-xs font-medium text-purple-500 tracking-widest uppercase"
        >
          {`AI powered inside · `}
        </SpinningText>
      </div>
    </div>
  );
}
