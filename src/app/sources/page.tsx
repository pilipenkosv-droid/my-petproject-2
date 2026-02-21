"use client";

import { Suspense, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/Header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  BookOpen,
  Copy,
  Check,
  RefreshCw,
  Loader2,
  ArrowRight,
  Search,
} from "lucide-react";
import { WORK_TYPES } from "@/types/work-types";
import { trackEvent } from "@/lib/analytics/events";
import { RelatedTools } from "@/components/RelatedTools";
import { Mascot } from "@/components/Mascot";
import { useSourceSearch } from "@/features/sources/hooks/useSourceSearch";
import { SourcesTable } from "@/features/sources/components/SourcesTable";

const SOURCE_WORK_TYPES = WORK_TYPES.filter((wt) => wt.slug !== "other");

const COUNT_OPTIONS = [
  { value: "5", label: "5 источников" },
  { value: "10", label: "10 источников" },
  { value: "15", label: "15 источников" },
  { value: "20", label: "20 источников" },
];

export default function SourcesPage() {
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
      <SourcesPageContent />
    </Suspense>
  );
}

function SourcesPageContent() {
  const searchParams = useSearchParams();

  const [topic, setTopic] = useState(searchParams.get("topic") || "");
  const [workType, setWorkType] = useState(searchParams.get("type") || "");
  const [count, setCount] = useState("10");
  const [copied, setCopied] = useState(false);

  const sourceSearch = useSourceSearch();

  const workTypeLabel =
    SOURCE_WORK_TYPES.find((wt) => wt.slug === workType)?.label || workType;

  const canSearch = topic.trim().length >= 5 && workType;

  const handleSearch = useCallback(async () => {
    if (!canSearch || sourceSearch.isSearching) return;

    trackEvent("sources_search", {
      workType,
      topicLength: topic.length,
      count: Number(count),
    });

    await sourceSearch.search(topic, workTypeLabel, Number(count));
  }, [canSearch, sourceSearch, topic, workType, workTypeLabel, count]);

  const handleCopy = useCallback(async () => {
    const text = sourceSearch.getSelectedFormatted();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback — ignore
    }
  }, [sourceSearch]);

  const handleReset = () => {
    sourceSearch.reset();
  };

  const hasResult = sourceSearch.sources.length > 0;

  return (
    <main className="min-h-screen relative">
      <div className="fixed inset-0 mesh-gradient pointer-events-none" />
      <Header />

      <div className="relative z-10 mx-auto max-w-2xl px-6 py-8">
        <div className="space-y-6">
          {/* Header */}
          <BlurFade delay={0.1} inView>
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 shadow-lg shadow-teal-500/25 mb-4">
                <BookOpen className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold mb-2 text-foreground">
                Подбор литературы
              </h1>
              <p className="text-muted-foreground max-w-md mx-auto">
                Введите тему — найдём реальные научные источники, проверим
                релевантность и оформим по ГОСТ
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
                    disabled={sourceSearch.isSearching}
                  />
                  <p className="text-xs text-muted-foreground text-right">
                    {topic.length}/500
                  </p>
                </div>

                {/* Work type + Count row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Тип работы</Label>
                    <Select
                      value={workType}
                      onValueChange={setWorkType}
                      disabled={sourceSearch.isSearching}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Выберите тип работы" />
                      </SelectTrigger>
                      <SelectContent>
                        {SOURCE_WORK_TYPES.map((wt) => (
                          <SelectItem key={wt.slug} value={wt.slug}>
                            {wt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Количество источников</Label>
                    <Select
                      value={count}
                      onValueChange={setCount}
                      disabled={sourceSearch.isSearching}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COUNT_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Error */}
                {sourceSearch.error && (
                  <p className="text-sm text-red-500">{sourceSearch.error}</p>
                )}

                {/* Submit */}
                <div className="flex justify-center pt-2">
                  <ShimmerButton
                    onClick={handleSearch}
                    disabled={!canSearch || sourceSearch.isSearching}
                  >
                    {sourceSearch.isSearching ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Ищем источники...
                      </>
                    ) : (
                      <>
                        <Search className="w-5 h-5 mr-2" />
                        Найти источники
                      </>
                    )}
                  </ShimmerButton>
                </div>
              </CardContent>
            </Card>
          </BlurFade>

          {/* Results */}
          {hasResult && (
            <BlurFade delay={0.1} inView>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-teal-500" />
                    Найденные источники
                  </CardTitle>
                  <CardDescription>
                    Найдено {sourceSearch.sources.length} источников
                    {sourceSearch.apis && (
                      <span className="text-xs ml-1 opacity-60">
                        (OpenAlex: {sourceSearch.apis.openalex}, CrossRef:{" "}
                        {sourceSearch.apis.crossref})
                      </span>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <SourcesTable
                    sources={sourceSearch.sources}
                    selectedIds={sourceSearch.selectedIds}
                    onToggle={sourceSearch.toggleSelected}
                    onToggleAll={sourceSearch.toggleAll}
                  />

                  <div className="flex flex-wrap gap-2 justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopy}
                      disabled={sourceSearch.selectedIds.size === 0}
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4 mr-1" />
                          Скопировано
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 mr-1" />
                          Скопировать выбранные
                        </>
                      )}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleReset}
                    >
                      <RefreshCw className="w-4 h-4 mr-1" />
                      Искать ещё
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </BlurFade>
          )}

          {/* No results state */}
          {!sourceSearch.isSearching &&
            sourceSearch.sources.length === 0 &&
            sourceSearch.totalFound === 0 &&
            sourceSearch.error === null &&
            sourceSearch.apis !== null && (
              <BlurFade delay={0.1} inView>
                <Card>
                  <CardContent className="py-8 text-center">
                    <Mascot
                      src="/mascot/teamwork.png"
                      alt="Диплодок и робот ищут вместе"
                      width={490}
                      height={340}
                      className="mx-auto mb-3 w-28 sm:w-48 md:w-auto"
                    />
                    <p className="text-foreground font-medium mb-1">
                      Источники не найдены
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Попробуйте изменить тему или формулировку запроса
                    </p>
                  </CardContent>
                </Card>
              </BlurFade>
            )}

          {/* CTA block */}
          {hasResult && (
            <BlurFade delay={0.2} inView>
              <Card className="border-teal-500/20 bg-gradient-to-r from-teal-500/5 to-cyan-500/5">
                <CardContent className="py-6 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Нужно отформатировать работу по ГОСТу?
                  </p>
                  <Link href="/create">
                    <Button>
                      Начать форматирование
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </BlurFade>
          )}

          <BlurFade delay={0.25} inView>
            <RelatedTools currentTool="sources" />
          </BlurFade>
        </div>
      </div>
    </main>
  );
}
