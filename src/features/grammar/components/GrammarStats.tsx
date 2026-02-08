"use client";

import type { GrammarCheckResult } from "@/lib/grammar/types";
import type { GrammarCategory } from "@/lib/grammar/types";
import { getCategoryColor, getStatsCategoryLabel } from "./grammar-utils";

interface GrammarStatsProps {
  stats: GrammarCheckResult["stats"];
}

export function GrammarStats({ stats }: GrammarStatsProps) {
  // Группируем схожие категории для компактности
  const grouped = groupCategories(stats.byCategory);

  if (stats.total === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
        <div className="w-3 h-3 rounded-full bg-emerald-500" />
        <p className="text-sm font-medium text-foreground">
          Ошибок не найдено!
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface p-4 space-y-3">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-foreground">
          {stats.total}
        </span>
        <span className="text-sm text-muted-foreground">
          {pluralize(stats.total, "ошибка", "ошибки", "ошибок")}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {grouped.map(({ label, count, category }) => {
          const { dot } = getCategoryColor(category as GrammarCategory);
          return (
            <div key={label} className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-full ${dot}`} />
              <span className="text-xs text-muted-foreground">
                {count} {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Утилиты ────────────────────────────────────────────

interface GroupedCategory {
  label: string;
  count: number;
  category: string;
}

function groupCategories(
  byCategory: Record<string, number>
): GroupedCategory[] {
  // Объединяем SPELLING+TYPOS, STYLE+CONFUSED_WORDS
  const merged: Record<string, { count: number; category: string }> = {};

  for (const [cat, count] of Object.entries(byCategory)) {
    const label = getStatsCategoryLabel(cat);
    if (merged[label]) {
      merged[label].count += count;
    } else {
      merged[label] = { count, category: cat };
    }
  }

  return Object.entries(merged)
    .map(([label, { count, category }]) => ({ label, count, category }))
    .sort((a, b) => b.count - a.count);
}

function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;

  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}
