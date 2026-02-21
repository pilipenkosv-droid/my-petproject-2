"use client";

import { NumberTicker } from "@/components/ui/number-ticker";
import { BlurFade } from "@/components/ui/blur-fade";
import { FileText, Clock, Star } from "lucide-react";

const stats = [
  {
    icon: FileText,
    value: 1200,
    suffix: "+",
    label: "документов обработано",
  },
  {
    icon: Clock,
    value: 3,
    suffix: " мин",
    label: "среднее время",
  },
  {
    icon: Star,
    value: 4.8,
    suffix: "/5",
    label: "средняя оценка",
    decimalPlaces: 1,
  },
];

export function StatsCounter() {
  return (
    <BlurFade delay={0.6} inView>
      <div className="flex flex-wrap items-center justify-center md:justify-start gap-8 sm:gap-12 mt-16">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="flex items-center gap-3">
              <Icon className="w-5 h-5 text-muted-foreground" />
              <div>
                <div className="flex items-baseline gap-0.5">
                  <NumberTicker
                    value={stat.value}
                    decimalPlaces={stat.decimalPlaces || 0}
                    className="text-xl font-bold text-foreground"
                  />
                  <span className="text-xl font-bold text-foreground">{stat.suffix}</span>
                </div>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          );
        })}
      </div>
    </BlurFade>
  );
}
