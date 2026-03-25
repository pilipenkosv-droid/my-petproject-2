"use client";

import { ArrowRight, Wrench } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ChangeSummaryItem } from "@/features/result/hooks/useJobStatus";

interface ChangesSummaryProps {
  changes: ChangeSummaryItem[];
  totalFixes: number;
}

export function ChangesSummary({ changes, totalFixes }: ChangesSummaryProps) {
  if (changes.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Wrench className="h-4 w-4" />
          Что было исправлено
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          {changes.map((change, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 py-2 border-b border-surface-border last:border-0"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">{change.type}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-red-400 line-through">{change.before}</span>
                  <ArrowRight className="h-3 w-3 text-on-surface-subtle shrink-0" />
                  <span className="text-xs text-emerald-500 font-medium">{change.after}</span>
                </div>
              </div>
              <span className="text-xs text-on-surface-subtle whitespace-nowrap">
                {change.count} {declension(change.count, ["место", "места", "мест"])}
              </span>
            </div>
          ))}
        </div>
        {totalFixes > changes.reduce((s, c) => s + c.count, 0) && (
          <p className="text-xs text-on-surface-subtle mt-3">
            И другие исправления — всего {totalFixes}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function declension(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const lastDigit = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (lastDigit > 1 && lastDigit < 5) return forms[1];
  if (lastDigit === 1) return forms[0];
  return forms[2];
}
