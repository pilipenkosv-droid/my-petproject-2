"use client";

import { DocumentStatistics } from "@/types/formatting-rules";
import { NumberTicker } from "@/components/ui/number-ticker";
import { FileText, BookOpen, AlertTriangle, CheckCircle, Clock } from "lucide-react";

interface StatisticsPanelProps {
  statistics: DocumentStatistics;
  violationsCount: number;
  fixesApplied: number;
}

export function StatisticsPanel({
  statistics,
  violationsCount,
  fixesApplied,
}: StatisticsPanelProps) {
  const manualFixCount = violationsCount - fixesApplied;

  const stats = [
    {
      label: "Символов",
      value: statistics.totalCharacters,
      icon: FileText,
      delay: 0,
      subtitle: null as string | null,
    },
    {
      label: "Страниц",
      value: statistics.pageCount,
      icon: BookOpen,
      delay: 0.1,
      subtitle: null as string | null,
    },
    {
      label: "Обнаружено",
      value: violationsCount,
      icon: AlertTriangle,
      delay: 0.2,
      subtitle: null as string | null,
    },
    {
      label: "Исправлено",
      value: fixesApplied,
      icon: CheckCircle,
      delay: 0.3,
      subtitle: manualFixCount > 0
        ? `${manualFixCount} треб. ручной правки`
        : "все нарушения исправлены",
    },
    ...(statistics.pipelineTimeMs
      ? [
          {
            label: "Время обработки",
            value: Math.round(statistics.pipelineTimeMs / 1000),
            icon: Clock,
            delay: 0.4,
            subtitle: "секунд",
          },
        ]
      : []),
  ];

  return (
    <div className={`grid grid-cols-2 gap-4 ${stats.length > 4 ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="bg-surface border border-surface-border p-4 transition-all duration-300 hover:bg-surface-hover hover:border-surface-border"
        >
          <div className="w-10 h-10 bg-foreground flex items-center justify-center mb-3 shadow-sm">
            <stat.icon className="h-5 w-5 text-background" />
          </div>
          <div className="text-2xl font-bold text-foreground">
            <NumberTicker value={stat.value} delay={stat.delay} />
          </div>
          <div className="text-xs text-on-surface-subtle mt-1">
            {stat.label}
          </div>
          {stat.subtitle && (
            <div className="text-[10px] text-on-surface-subtle mt-1 opacity-70">
              {stat.subtitle}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
