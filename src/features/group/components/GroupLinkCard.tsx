"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShareButtons } from "@/components/ShareButtons";
import { Users, Copy, Check } from "lucide-react";
import { trackEvent } from "@/lib/analytics/events";

interface GroupLinkCardProps {
  userId?: string;
}

interface GroupData {
  code: string;
  url: string;
  memberCount: number;
}

/**
 * Карточка "Поделись с одногруппниками" на странице результата.
 * Показывается только авторизованным пользователям.
 */
export function GroupLinkCard({ userId }: GroupLinkCardProps) {
  const [group, setGroup] = useState<GroupData | null>(null);
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;

    // Пробуем получить существующую ссылку
    fetch("/api/group/stats")
      .then((r) => r.json())
      .then((data) => {
        if (data.code) {
          setGroup({ code: data.code, url: data.url, memberCount: data.memberCount });
        }
      })
      .catch(() => {});
  }, [userId]);

  const handleCreate = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/group/create", { method: "POST" });
      const data = await res.json();
      if (data.code) {
        setGroup({ code: data.code, url: data.url, memberCount: data.memberCount });
        trackEvent("group_link_created" as any);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!group) return;
    await navigator.clipboard.writeText(group.url);
    setCopied(true);
    trackEvent("group_link_copy" as any);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!userId) return null;

  return (
    <Card className="border-purple-500/20 bg-purple-500/5">
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-purple-500/20 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 text-purple-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground mb-1">
              Сдаёте работы вместе?
            </p>
            <p className="text-sm text-on-surface-subtle mb-4">
              Поделись ссылкой с одногруппниками — каждый получит +1 бесплатную проверку
            </p>

            {group ? (
              <div className="space-y-3">
                {/* Ссылка + копировать */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 px-3 py-2 bg-surface border border-surface-border text-sm text-muted-foreground truncate">
                    {group.url}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopy}
                    className="shrink-0"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>

                {/* Счётчик */}
                {group.memberCount > 0 && (
                  <p className="text-xs text-purple-400">
                    {group.memberCount} {pluralize(group.memberCount, "одногруппник присоединился", "одногруппника присоединились", "одногруппников присоединились")}
                  </p>
                )}

                {/* Шаринг */}
                <ShareButtons
                  url={group.url}
                  title="Проверь свою работу бесплатно — Diplox"
                  description="Присоединяйся — получи бесплатную проверку работы по ГОСТу"
                  variant="compact"
                />
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCreate}
                disabled={isLoading}
              >
                {isLoading ? "Создаю..." : "Создать ссылку для группы"}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}
