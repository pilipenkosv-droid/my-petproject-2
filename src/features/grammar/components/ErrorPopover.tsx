"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { GrammarError } from "@/lib/grammar/types";
import { getCategoryColor, getCategoryLabel } from "./grammar-utils";

interface ErrorPopoverProps {
  error: GrammarError;
  onApplyReplacement?: (errorId: string, replacement: string) => void;
}

export function ErrorPopover({ error, onApplyReplacement }: ErrorPopoverProps) {
  const { bg: badgeBg, text: badgeText } = getCategoryColor(error.category);

  return (
    <div className="space-y-3 max-w-[280px]">
      {/* Сообщение об ошибке */}
      <p className="text-sm font-medium text-foreground leading-snug">
        {error.message}
      </p>

      {/* Категория */}
      <Badge
        variant="secondary"
        className={`text-xs ${badgeBg} ${badgeText} border-0`}
      >
        {getCategoryLabel(error.category)}
      </Badge>

      {/* Варианты замены */}
      {error.replacements.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Варианты замены:</p>
          <div className="flex flex-wrap gap-1.5">
            {error.replacements.map((replacement, i) => (
              <Button
                key={i}
                variant="outline"
                size="sm"
                className="h-7 text-xs px-2.5"
                onClick={() => onApplyReplacement?.(error.id, replacement)}
              >
                {replacement}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
