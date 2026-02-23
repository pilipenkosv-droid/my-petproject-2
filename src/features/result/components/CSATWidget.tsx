/**
 * CSAT (Customer Satisfaction Score) компонент
 * 
 * Позволяет пользователю оценить качество форматирования документа
 * по шкале от 1 до 5 звезд.
 */

"use client";

import { useState } from "react";
import { Star, Check, MessageSquare } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface CSATWidgetProps {
  jobId: string;
  onSubmit?: (rating: number, feedback?: string) => void;
}

export function CSATWidget({ jobId, onSubmit }: CSATWidgetProps) {
  const [rating, setRating] = useState<number | null>(null);
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (rating === null) return;

    setIsSubmitting(true);

    try {
      // Отправляем оценку на сервер
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          rating,
          feedback: feedback.trim() || undefined,
          timestamp: new Date().toISOString(),
        }),
      });

      setIsSubmitted(true);
      onSubmit?.(rating, feedback);
    } catch (error) {
      console.error("Error submitting CSAT:", error);
      // Молча проглатываем ошибку, чтобы не мешать пользователю
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <Card className="bg-surface border-surface-border backdrop-blur-sm">
        <CardContent className="py-6">
          <div className="flex items-center gap-3 text-emerald-400">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <Check className="w-5 h-5" />
            </div>
            <div>
              <p className="font-medium">Спасибо за вашу оценку!</p>
              <p className="text-sm text-on-surface-subtle">
                Мы используем ваш отзыв для улучшения сервиса
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-surface border-surface-border backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-foreground">Оцените качество форматирования</CardTitle>
        <CardDescription>
          Помогите нам стать лучше — поделитесь своими впечатлениями
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Звезды */}
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              onMouseEnter={() => setHoveredRating(star)}
              onMouseLeave={() => setHoveredRating(null)}
              className="transition-transform hover:scale-110 active:scale-95 focus:outline-none"
            >
              <Star
                className={`w-8 h-8 transition-colors ${
                  (hoveredRating !== null ? star <= hoveredRating : star <= (rating || 0))
                    ? "fill-yellow-400 text-yellow-400"
                    : "text-muted-foreground/60"
                }`}
              />
            </button>
          ))}
        </div>

        {/* Текстовое пояснение оценки */}
        {rating !== null && (
          <p className="text-sm text-on-surface-muted">
            {rating === 1 && "Очень плохо — документ требует много правок"}
            {rating === 2 && "Плохо — нашел много ошибок форматирования"}
            {rating === 3 && "Удовлетворительно — есть несколько ошибок"}
            {rating === 4 && "Хорошо — почти все правильно"}
            {rating === 5 && "Отлично — документ полностью соответствует требованиям"}
          </p>
        )}

        {/* Поле для комментария (показываем если оценка 3 или ниже) */}
        {rating !== null && rating <= 3 && (
          <div className="space-y-2">
            <label htmlFor="feedback" className="text-sm text-on-surface-muted flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Что можно улучшить? (необязательно)
            </label>
            <textarea
              id="feedback"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Например: не исправлены инициалы в списке литературы, неверное форматирование заголовков..."
              className="w-full min-h-[80px] px-3 py-2 rounded-lg bg-surface border border-surface-border text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-brand-2/50"
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">
              {feedback.length}/500 символов
            </p>
          </div>
        )}

        {/* Кнопка отправки */}
        <Button
          onClick={handleSubmit}
          disabled={rating === null || isSubmitting}
          variant="glow"
          className="w-full"
        >
          {isSubmitting ? "Отправка..." : "Отправить оценку"}
        </Button>
      </CardContent>
    </Card>
  );
}
