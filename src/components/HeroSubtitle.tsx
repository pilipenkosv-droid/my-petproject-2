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
            "Сдача завтра? Успеем за 4 минуты",
            "Ты написал — мы оформим",
            "Нормоконтроль с первого раза",
            "Без ночи за отступами",
          ]}
          duration={2800}
          className="font-mono text-sm sm:text-lg md:text-xl lg:text-2xl font-medium text-muted-foreground"
        />
      </h1>
    </div>
  );
}
