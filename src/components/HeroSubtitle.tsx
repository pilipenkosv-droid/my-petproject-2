"use client";

import { WordRotate } from "@/components/ui/word-rotate";

export function HeroSubtitle() {
  return (
    <div className="relative inline-block">
      <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6 flex flex-col items-center justify-center gap-y-1 sm:gap-y-2">
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
    </div>
  );
}
