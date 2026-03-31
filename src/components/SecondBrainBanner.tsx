"use client";

import Link from "next/link";
import { Bot, ArrowRight } from "lucide-react";

export function SecondBrainBanner() {
  return (
    <div className="bg-purple-500/5 border border-purple-500/20 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 bg-purple-600 flex items-center justify-center shrink-0">
          <Bot className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground mb-1">
            Diplox Bot — ИИ-бот для учёбы в Telegram
          </p>
          <p className="text-xs text-on-surface-muted mb-2 leading-relaxed">
            Сохраняй заметки голосом, задавай вопросы по своим материалам, получай конспекты — всё в одном чате.
          </p>
          <Link
            href="/second-brain"
            className="inline-flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 font-medium transition-colors"
          >
            Узнать подробнее
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
