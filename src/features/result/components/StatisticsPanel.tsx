"use client";

import { DocumentStatistics } from "@/types/formatting-rules";
import { NumberTicker } from "@/components/ui/number-ticker";
import { FileText, BookOpen, AlertTriangle, CheckCircle } from "lucide-react";

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
  const stats = [
    {
      label: "Символов",
      value: statistics.totalCharacters,
      icon: FileText,
      gradient: "from-violet-500 to-purple-600",
      delay: 0,
    },
    {
      label: "Страниц",
      value: statistics.pageCount,
      icon: BookOpen,
      gradient: "from-indigo-500 to-blue-600",
      delay: 0.1,
    },
    {
      label: "Найдено нарушений",
      value: violationsCount,
      icon: AlertTriangle,
      gradient: "from-red-500 to-rose-600",
      delay: 0.2,
    },
    {
      label: "Исправлено",
      value: fixesApplied,
      icon: CheckCircle,
      gradient: "from-emerald-500 to-teal-600",
      delay: 0.3,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <div 
          key={stat.label} 
          className="rounded-2xl bg-surface border border-surface-border backdrop-blur-sm p-4 transition-all duration-300 hover:bg-surface-hover hover:border-surface-border"
        >
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center mb-3 shadow-lg`}>
            <stat.icon className="h-5 w-5 text-white" />
          </div>
          <div className="text-2xl font-bold text-foreground">
            <NumberTicker value={stat.value} delay={stat.delay} />
          </div>
          <div className="text-xs text-on-surface-subtle mt-1">
            {stat.label}
          </div>
        </div>
      ))}
    </div>
  );
}
