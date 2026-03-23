"use client";

import { useEffect, useState } from "react";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Users } from "lucide-react";

interface AlphaStatus {
  provisioned: number;
  limit: number;
  remaining: number;
}

interface AlphaSpotsCounterProps {
  /** "block" — полноценный блок со стилями, "inline" — компактная строка для баннера */
  variant?: "block" | "inline";
}

export function AlphaSpotsCounter({ variant = "block" }: AlphaSpotsCounterProps) {
  const [status, setStatus] = useState<AlphaStatus>({ provisioned: 0, limit: 10, remaining: 10 });

  useEffect(() => {
    fetch("/api/bot/alpha-status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
  }, []);

  if (variant === "inline") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm">
        <span className="text-on-surface-muted">занято</span>
        <span className="font-mono font-bold text-foreground">
          <NumberTicker value={status.provisioned} className="text-foreground font-bold" />
          <span> из {status.limit}</span>
        </span>
        <span className="text-on-surface-muted">мест</span>
      </span>
    );
  }

  return (
    <div className="inline-flex items-center gap-3 px-4 py-3 bg-surface border border-surface-border text-sm">
      <Users className="w-4 h-4 text-primary shrink-0" />
      <span className="text-on-surface-muted">Занято</span>
      <span className="font-mono font-bold text-foreground">
        <NumberTicker value={status.provisioned} className="text-foreground font-bold" />
        <span> из {status.limit}</span>
      </span>
      <span className="text-on-surface-muted">мест</span>
      {status.remaining <= 3 && status.remaining > 0 && (
        <span className="ml-1 px-2 py-0.5 bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 text-xs font-semibold">
          осталось {status.remaining}
        </span>
      )}
    </div>
  );
}
