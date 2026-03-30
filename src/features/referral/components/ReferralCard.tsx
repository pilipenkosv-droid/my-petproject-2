"use client";

import { useState, useEffect } from "react";
import { Gift, Copy, Check } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShareButtons } from "@/components/ShareButtons";
import { ReferralProgressBar } from "./ReferralProgressBar";
import { trackEvent } from "@/lib/analytics/events";

interface ReferralStats {
  clicks: number;
  registrations: number;
  nextThreshold: number;
  nextRewardMonths: number;
  rewards: { threshold: number; rewardMonths: number; grantedAt: string }[];
  code: string;
  referralUrl: string;
}

export function ReferralCard() {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/referral/stats")
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  const handleCopy = async () => {
    if (!stats) return;
    await navigator.clipboard.writeText(stats.referralUrl);
    setCopied(true);
    trackEvent("referral_link_copy", {});
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="animate-pulse rounded-xl bg-surface-hover h-40 w-full" />
    );
  }

  if (!stats) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gift className="h-5 w-5 text-violet-400" />
          Реферальная программа
        </CardTitle>
        <CardDescription>Приглашай друзей — получай Pro бесплатно</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Referral link */}
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-md bg-surface-hover px-3 py-2 text-sm text-on-surface-subtle truncate font-mono">
            {stats.referralUrl}
          </div>
          <Button variant="outline" size="sm" onClick={handleCopy} className="shrink-0">
            {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span className="ml-1.5">{copied ? "Скопировано" : "Копировать"}</span>
          </Button>
        </div>

        {/* Progress */}
        {stats.nextThreshold > 0 && (
          <ReferralProgressBar
            current={stats.registrations}
            target={stats.nextThreshold}
            rewardMonths={stats.nextRewardMonths}
          />
        )}

        {/* Share */}
        <ShareButtons
          variant="compact"
          url={stats.referralUrl}
          title="Попробуй Diplox — сервис для оформления учебных работ по ГОСТу"
        />

        {/* Reward tiers */}
        <p className="text-xs text-on-surface-muted">
          Награды: 5 друзей → 1 мес · 15 → 3 мес · 30 → 6 мес
        </p>

        {/* Granted rewards */}
        {stats.rewards.length > 0 && (
          <div className="space-y-1 border-t border-surface-border pt-3">
            <p className="text-sm font-medium text-foreground">Полученные награды</p>
            {stats.rewards.map((r, i) => (
              <div key={i} className="flex justify-between text-sm text-on-surface-subtle">
                <span>{r.rewardMonths} мес. Pro за {r.threshold} друзей</span>
                <span className="text-on-surface-muted text-xs">
                  {new Date(r.grantedAt).toLocaleDateString("ru-RU", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
