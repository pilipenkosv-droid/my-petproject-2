"use client";

import { Suspense, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { BlurFade } from "@/components/ui/blur-fade";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Sparkles,
  Copy,
  Check,
  RefreshCw,
  Loader2,
  ArrowRight,
  FileText,
} from "lucide-react";
import { WORK_TYPES } from "@/types/work-types";
import { trackEvent } from "@/lib/analytics/events";
import { RelatedTools } from "@/components/RelatedTools";

const OUTLINE_WORK_TYPES = WORK_TYPES.filter((wt) => wt.slug !== "other");

export default function OutlinePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen relative">
          <div className="fixed inset-0 mesh-gradient pointer-events-none" />
          <Header />
          <div className="relative z-10 mx-auto max-w-2xl px-6 py-12">
            <Card>
              <CardContent className="py-12 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
              </CardContent>
            </Card>
          </div>
        </main>
      }
    >
      <OutlinePageContent />
    </Suspense>
  );
}

function OutlinePageContent() {
  const searchParams = useSearchParams();

  const [topic, setTopic] = useState("");
  const [workType, setWorkType] = useState(searchParams.get("type") || "");
  const [subject, setSubject] = useState("");
  const [additionalRequirements, setAdditionalRequirements] = useState("");
  const [outline, setOutline] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const workTypeLabel =
    OUTLINE_WORK_TYPES.find((wt) => wt.slug === workType)?.label || workType;

  const canGenerate = topic.trim().length >= 5 && workType;

  const handleGenerate = useCallback(async () => {
    if (!canGenerate || isGenerating) return;

    setIsGenerating(true);
    setError(null);
    setOutline(null);

    trackEvent("outline_generate", {
      workType,
      topicLength: topic.length,
    });

    try {
      const response = await fetch("/api/generate-outline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          workType: workTypeLabel,
          subject: subject.trim() || undefined,
          additionalRequirements: additionalRequirements.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Ошибка при генерации плана");
      }

      const data = await response.json();
      setOutline(data.outline);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неизвестная ошибка");
    } finally {
      setIsGenerating(false);
    }
  }, [canGenerate, isGenerating, topic, workType, workTypeLabel, subject, additionalRequirements]);

  const handleCopy = useCallback(async () => {
    if (!outline) return;
    try {
      await navigator.clipboard.writeText(outline);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback — ignore
    }
  }, [outline]);

  const handleReset = () => {
    setOutline(null);
    setError(null);
  };

  return (
    <main className="min-h-screen relative">
      {/* Background */}
      <div className="fixed inset-0 mesh-gradient pointer-events-none" />
      <Header />

      <div className="relative z-10 mx-auto max-w-2xl px-6 py-8">
        <div className="space-y-6">
          {/* Header */}
          <BlurFade delay={0.1} inView>
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-3 to-brand-2 shadow-lg shadow-brand-3/25 mb-4">
                <FileText className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold mb-2 text-foreground">
                Генератор плана работы
              </h1>
              <p className="text-muted-foreground max-w-md mx-auto">
                Введите тему и тип работы — AI сгенерирует структуру с разделами, подразделами и рекомендуемым объёмом
              </p>
            </div>
          </BlurFade>

          {/* Form */}
          <BlurFade delay={0.2} inView>
            <Card>
              <CardContent className="pt-6 space-y-4">
                {/* Topic */}
                <div className="space-y-2">
                  <Label htmlFor="topic">Тема работы</Label>
                  <Textarea
                    id="topic"
                    placeholder="Например: Анализ финансовой устойчивости предприятия"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    rows={2}
                    maxLength={500}
                    disabled={isGenerating}
                  />
                  <p className="text-xs text-muted-foreground text-right">
                    {topic.length}/500
                  </p>
                </div>

                {/* Work type */}
                <div className="space-y-2">
                  <Label>Тип работы</Label>
                  <Select
                    value={workType}
                    onValueChange={setWorkType}
                    disabled={isGenerating}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Выберите тип работы" />
                    </SelectTrigger>
                    <SelectContent>
                      {OUTLINE_WORK_TYPES.map((wt) => (
                        <SelectItem key={wt.slug} value={wt.slug}>
                          {wt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Subject */}
                <div className="space-y-2">
                  <Label htmlFor="subject">
                    Название предмета{" "}
                    <span className="text-muted-foreground font-normal">(необязательно)</span>
                  </Label>
                  <Input
                    id="subject"
                    placeholder="Например: Финансовый менеджмент"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    maxLength={200}
                    disabled={isGenerating}
                  />
                </div>

                {/* Additional requirements */}
                <div className="space-y-2">
                  <Label htmlFor="requirements">
                    Дополнительные требования{" "}
                    <span className="text-muted-foreground font-normal">(необязательно)</span>
                  </Label>
                  <Textarea
                    id="requirements"
                    placeholder="Например: Включить анализ за 2020-2024 гг."
                    value={additionalRequirements}
                    onChange={(e) => setAdditionalRequirements(e.target.value)}
                    rows={2}
                    maxLength={500}
                    disabled={isGenerating}
                  />
                </div>

                {/* Error */}
                {error && (
                  <p className="text-sm text-red-500">{error}</p>
                )}

                {/* Submit */}
                <div className="flex justify-center pt-2">
                  <ShimmerButton
                    onClick={handleGenerate}
                    disabled={!canGenerate || isGenerating}
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Генерируем план...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5 mr-2" />
                        Сгенерировать план
                      </>
                    )}
                  </ShimmerButton>
                </div>
              </CardContent>
            </Card>
          </BlurFade>

          {/* Result */}
          {outline && (
            <BlurFade delay={0.1} inView>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-indigo-500" />
                    План работы
                  </CardTitle>
                  <CardDescription>
                    {workTypeLabel} — {topic.length > 60 ? topic.slice(0, 60) + "..." : topic}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground bg-muted/50 rounded-lg p-4 max-h-[500px] overflow-y-auto">
                    {outline}
                  </pre>

                  <div className="flex flex-wrap gap-2 justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopy}
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4 mr-1" />
                          Скопировано
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 mr-1" />
                          Скопировать
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleReset}
                    >
                      <RefreshCw className="w-4 h-4 mr-1" />
                      Сгенерировать ещё
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </BlurFade>
          )}

          {/* CTA: Подбор литературы */}
          {outline && (
            <BlurFade delay={0.2} inView>
              <Card className="border-teal-500/20 bg-gradient-to-r from-teal-500/5 to-cyan-500/5">
                <CardContent className="py-4 text-center space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Подберём реальные источники для этой темы?
                  </p>
                  <Link
                    href={`/sources?topic=${encodeURIComponent(topic)}${workType ? `&type=${workType}` : ""}`}
                  >
                    <Button variant="outline" size="sm">
                      Найти литературу
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </BlurFade>
          )}

          {/* CTA: Форматирование */}
          {outline && (
            <BlurFade delay={0.25} inView>
              <Card className="border-indigo-500/20 bg-gradient-to-r from-indigo-500/5 to-violet-500/5">
                <CardContent className="py-6 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Готовый план? Отформатируйте работу по ГОСТу автоматически!
                  </p>
                  <Link href={workType ? `/create?type=${workType}` : "/create"}>
                    <Button>
                      Начать форматирование
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </BlurFade>
          )}

          <BlurFade delay={0.3} inView>
            <RelatedTools currentTool="outline" />
          </BlurFade>
        </div>
      </div>
    </main>
  );
}
