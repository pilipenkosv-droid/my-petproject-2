"use client";

import Link from "next/link";
import { Bot, BookOpen, MessageSquare, Wrench, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlphaSpotsCounter } from "@/components/bot/AlphaSpotsCounter";

const botFeatures = [
  {
    icon: BookOpen,
    title: "Хранилище заметок",
    description: "Текст, голос, PDF — всё в одном месте",
  },
  {
    icon: MessageSquare,
    title: "AI-ответы из твоих материалов",
    description: "Спроси — бот ответит из твоих конспектов",
  },
  {
    icon: Wrench,
    title: "Инструменты в чате",
    description: "Рерайт, грамматика, план — прямо в Telegram",
  },
  {
    icon: FileText,
    title: "Дневной конспект",
    description: "Структурированная выжимка за день",
  },
];

export function ProBotTeaser() {
  return (
    <Card className="border-purple-500/20 bg-purple-500/5 overflow-hidden relative">
      <div className="absolute top-0 right-0 w-40 h-40 bg-purple-500/10 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2" />
      <CardContent className="pt-6 relative">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-purple-600 flex items-center justify-center shrink-0">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-foreground font-semibold">
              Second Brain — AI-напарник в Telegram
            </p>
            <p className="text-on-surface-muted text-sm">
              Личный помощник по учёбе прямо в мессенджере
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          {botFeatures.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.title} className="flex items-start gap-2">
                <Icon className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">{feature.title}</p>
                  <p className="text-xs text-on-surface-muted">{feature.description}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <AlphaSpotsCounter />
          <Link
            href="/second-brain"
            className="text-sm text-purple-400 hover:text-purple-300 transition-colors"
          >
            Подробнее о Second Brain →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
