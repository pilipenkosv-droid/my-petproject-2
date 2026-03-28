"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Bot, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlphaSpotsCounter } from "@/components/bot/AlphaSpotsCounter";
import { trackEvent } from "@/lib/analytics/events";

export function ProUpsellBanner() {
  const tracked = useRef(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !tracked.current) {
          tracked.current = true;
          trackEvent("subscription_upsell_view");
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Card ref={ref} className="border-purple-500/30 bg-purple-500/5 overflow-hidden relative">
      <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-[60px] -translate-y-1/2 translate-x-1/2" />
      <CardContent className="pt-6 relative">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-purple-600 flex items-center justify-center shadow-sm shrink-0">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-foreground font-semibold text-lg mb-1">
              Следующий документ — за 39 ₽
            </p>
            <p className="text-on-surface-muted text-sm mb-4">
              С Pro-подпиской каждая обработка стоит 39 ₽ вместо 159 ₽ — экономия 75%.
              Плюс AI-напарник в Telegram для учёбы — в подарок.
            </p>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
              <Link href="/pricing?ref=result">
                <Button className="group bg-purple-600 hover:bg-purple-700">
                  Оформить Pro — 399 ₽/мес
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
              <Link
                href="/second-brain"
                className="text-sm text-purple-400 hover:text-purple-300 transition-colors"
              >
                Подробнее о Second Brain →
              </Link>
            </div>

            <AlphaSpotsCounter />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
