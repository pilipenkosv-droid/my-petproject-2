"use client";

import { WordRotate } from "@/components/ui/word-rotate";
import { SpinningText } from "@/components/ui/spinning-text";

export function HeroSubtitle() {
  return (
    <div className="relative inline-block">
      <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6 flex flex-col items-center md:items-start justify-center gap-y-1 sm:gap-y-2">
        <span className="text-foreground">Сдай работу</span>
        <span className="text-foreground">с первого раза.</span>
        <WordRotate
          words={[
            "Без ночи за отступами",
            "Без «переделай оформление»",
            "Без нормоконтроля по 3 кругу",
            "Без Word, который всё ломает",
          ]}
          duration={2800}
          className="font-mono text-lg sm:text-2xl md:text-3xl lg:text-4xl font-medium text-muted-foreground"
        />
      </h1>

      {/* Spinning "AI powered inside" badge — superscript position */}
      <div className="absolute -top-8 left-0 sm:-top-10 sm:left-0 md:-top-12 md:left-0 lg:-top-14 lg:left-0 hidden sm:block">
        <SpinningText
          radius={3.8}
          duration={8}
          className="w-16 h-16 sm:w-[4.5rem] sm:h-[4.5rem] text-[5px] sm:text-[5.5px] font-medium text-purple-700 dark:text-purple-400 tracking-[0.35em] uppercase"
        >
          {`AI  powered  inside  ·  `}
        </SpinningText>
      </div>
    </div>
  );
}
