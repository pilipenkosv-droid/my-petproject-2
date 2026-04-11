"use client";

import { useEffect, useState } from "react";
import { X, Zap } from "lucide-react";
import Link from "next/link";

/**
 * Баннер "Дипломный марафон" на /create и /pricing.
 * Показывается апрель-май, скрывается по нажатию на X.
 */
export function MarathonBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Проверяем: баннер не скрыт и сейчас апрель-май
    const dismissed = localStorage.getItem("dlx_marathon_dismissed");
    if (dismissed) return;

    const month = new Date().getMonth(); // 0-indexed
    // Апрель (3) — Май (4)
    if (month >= 3 && month <= 4) {
      setIsVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem("dlx_marathon_dismissed", "1");
  };

  if (!isVisible) return null;

  return (
    <div className="relative bg-gradient-to-r from-purple-500/10 to-emerald-500/10 border border-purple-500/20 px-4 py-3">
      <div className="flex items-center gap-3">
        <Zap className="w-5 h-5 text-purple-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
            Дипломный марафон:{" "}
            <span className="text-purple-400">+1 проверка</span> за каждого оплатившего друга
          </p>
          <Link
            href="/profile?ref=marathon-banner"
            className="text-xs text-purple-400 hover:text-purple-300 underline"
          >
            Получить ссылку для друзей
          </Link>
        </div>
        <button
          onClick={handleDismiss}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
