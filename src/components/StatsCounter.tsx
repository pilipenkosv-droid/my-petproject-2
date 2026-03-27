"use client";

import { NumberTicker } from "@/components/ui/number-ticker";
import { BlurFade } from "@/components/ui/blur-fade";
import { FileText, Clock, Star } from "lucide-react";

const BASELINE = 1200;

export function StatsCounter({ documentsProcessed = 0 }: { documentsProcessed?: number }) {
  const docsCount = documentsProcessed >= BASELINE ? documentsProcessed : BASELINE + documentsProcessed;

  return (
    <BlurFade delay={0.6} inView>
      <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-12" suppressHydrationWarning>
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-muted-foreground" />
          <div>
            <div className="flex items-baseline gap-0.5 font-mono">
              <span className="text-xl font-bold text-foreground inline-block tracking-wider tabular-nums">{docsCount.toLocaleString("ru-RU")}</span>
              <span className="text-xl font-bold text-foreground">+</span>
            </div>
            <p className="text-xs text-muted-foreground font-mono">документов обработано</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Clock className="w-5 h-5 text-muted-foreground" />
          <div>
            <div className="flex items-baseline gap-0.5 font-mono">
              <NumberTicker value={3} className="text-xl font-bold text-foreground" />
              <span className="text-xl font-bold text-foreground"> мин</span>
            </div>
            <p className="text-xs text-muted-foreground font-mono">среднее время</p>
          </div>
        </div>

        <a href="#testimonials" className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer">
          <Star className="w-5 h-5 text-muted-foreground" />
          <div>
            <div className="flex items-baseline gap-0.5 font-mono">
              <span className="text-xl font-bold text-foreground inline-block tracking-wider tabular-nums">4,8</span>
              <span className="text-xl font-bold text-foreground">/5</span>
            </div>
            <p className="text-xs text-muted-foreground font-mono">средняя оценка</p>
          </div>
        </a>
      </div>
    </BlurFade>
  );
}
