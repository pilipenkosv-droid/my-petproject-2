"use client";

import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface ConfirmRulesWaitingProps {
  /** Текст текущего шага из задачи: очередь, разбор методички, форматирование. */
  message: string;
}

/**
 * Экран ожидания: методичку разбирает воркер, правил для показа ещё нет.
 * В инлайн-режиме этот экран виден доли секунды.
 */
export function ConfirmRulesWaiting({ message }: ConfirmRulesWaitingProps) {
  return (
    <Card className="max-w-md mx-auto">
      <CardContent className="py-12 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-on-surface-subtle mx-auto mb-4" />
        <p className="text-foreground font-medium mb-1">{message}</p>
        <p className="text-sm text-on-surface-subtle">
          Страница обновится сама — её можно не перезагружать.
        </p>
      </CardContent>
    </Card>
  );
}
