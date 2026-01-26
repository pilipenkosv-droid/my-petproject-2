"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormattingRules } from "@/types/formatting-rules";
import { RulesEditor } from "@/features/confirm-rules/components/RulesEditor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BlurFade } from "@/components/ui/blur-fade";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { 
  ArrowLeft, 
  CheckCircle, 
  Sparkles, 
  Zap, 
  RefreshCw,
  Loader2
} from "lucide-react";

interface ConfirmRulesPageProps {
  params: Promise<{ jobId: string }>;
}

interface JobData {
  id: string;
  status: string;
  rules?: FormattingRules;
  confidence?: number;
  warnings?: string[];
  missingRules?: string[];
}

export default function ConfirmRulesPage({ params }: ConfirmRulesPageProps) {
  const { jobId } = use(params);
  const router = useRouter();
  
  const [job, setJob] = useState<JobData | null>(null);
  const [rules, setRules] = useState<FormattingRules | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Загружаем данные задачи
  useEffect(() => {
    async function fetchJob() {
      try {
        const response = await fetch(`/api/status/${jobId}`);
        
        if (!response.ok) {
          if (response.status === 404) {
            setError("Задача не найдена");
            return;
          }
          throw new Error("Ошибка при получении данных");
        }

        const data = await response.json();
        
        // Если задача уже завершена, редирект на результат
        if (data.status === "completed") {
          router.replace(`/result/${jobId}`);
          return;
        }

        // Если не в статусе ожидания подтверждения
        if (data.status !== "awaiting_confirmation") {
          // Может быть ещё обрабатывается, или ошибка
          if (data.status === "failed") {
            setError(data.error || "Ошибка обработки");
            return;
          }
          // Редирект на результат для отслеживания прогресса
          router.replace(`/result/${jobId}`);
          return;
        }

        setJob(data);
        setRules(data.rules);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Неизвестная ошибка");
      } finally {
        setIsLoading(false);
      }
    }

    fetchJob();
  }, [jobId, router]);

  const handleConfirm = async () => {
    if (!rules) return;

    setIsProcessing(true);
    setError(null);

    try {
      const response = await fetch("/api/confirm-rules", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jobId,
          rules,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Ошибка при обработке");
      }

      // Редирект на страницу результата
      router.push(`/result/${jobId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неизвестная ошибка");
      setIsProcessing(false);
    }
  };

  const handleRulesChange = (newRules: FormattingRules) => {
    setRules(newRules);
  };

  // Состояние загрузки
  if (isLoading) {
    return (
      <main className="min-h-screen relative">
        <div className="fixed inset-0 mesh-gradient pointer-events-none" />
        <Header />
        <div className="relative z-10 mx-auto max-w-4xl px-6 py-12">
          <Card className="max-w-md mx-auto">
            <CardContent className="py-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-white/50 mx-auto mb-4" />
              <p className="text-white/50">Загрузка...</p>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  // Ошибка
  if (error) {
    return (
      <main className="min-h-screen relative">
        <div className="fixed inset-0 mesh-gradient pointer-events-none" />
        <Header />
        <div className="relative z-10 mx-auto max-w-4xl px-6 py-12">
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle className="text-red-400">Ошибка</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/constructor">
                <Button variant="outline" className="w-full">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Попробовать снова
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  // Нет данных
  if (!job || !rules) {
    return (
      <main className="min-h-screen relative">
        <div className="fixed inset-0 mesh-gradient pointer-events-none" />
        <Header />
        <div className="relative z-10 mx-auto max-w-4xl px-6 py-12">
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle className="text-white/70">Данные не найдены</CardTitle>
            </CardHeader>
            <CardContent>
              <Link href="/constructor">
                <Button variant="outline" className="w-full">
                  Загрузить документы
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen relative">
      {/* Background */}
      <div className="fixed inset-0 mesh-gradient pointer-events-none" />
      
      {/* Floating decorative elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 right-20 w-64 h-64 bg-indigo-500/20 rounded-full blur-[100px] animate-pulse-glow" />
        <div className="absolute bottom-40 left-20 w-80 h-80 bg-violet-500/15 rounded-full blur-[120px] animate-pulse-glow" style={{ animationDelay: '2s' }} />
      </div>
      
      <Header />
      
      <div className="relative z-10 mx-auto max-w-4xl px-6 py-8">
        <div className="space-y-6">
          {/* Заголовок */}
          <BlurFade delay={0.1} inView>
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/25 mb-4">
                <CheckCircle className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold mb-2">
                <span className="gradient-text">Проверьте</span>
                <span className="text-white"> требования к форматированию</span>
              </h2>
              <p className="text-white/50 max-w-md mx-auto">
                AI извлёк правила из вашей методички. Проверьте их и при необходимости скорректируйте перед обработкой документа.
              </p>
            </div>
          </BlurFade>

          {/* Редактор правил */}
          <BlurFade delay={0.2} inView>
            <RulesEditor
              rules={rules}
              onChange={handleRulesChange}
              warnings={job.warnings}
              missingRules={job.missingRules}
              confidence={job.confidence}
            />
          </BlurFade>

          {/* Кнопки действий */}
          <BlurFade delay={0.3} inView>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Link href="/constructor">
                <Button variant="secondary" disabled={isProcessing}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Загрузить другие документы
                </Button>
              </Link>
              
              <ShimmerButton
                onClick={handleConfirm}
                disabled={isProcessing}
                className={isProcessing ? "opacity-70" : ""}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Обработка...
                  </>
                ) : (
                  <>
                    <Zap className="w-5 h-5 mr-2" />
                    Подтвердить и обработать
                  </>
                )}
              </ShimmerButton>
            </div>
          </BlurFade>
        </div>
      </div>
    </main>
  );
}

function Header() {
  return (
    <header className="relative z-10 border-b border-white/10 bg-white/5 backdrop-blur-xl">
      <div className="mx-auto max-w-4xl px-6 py-4 flex items-center gap-4">
        <Link 
          href="/constructor" 
          className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-all"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-lg font-bold">
            <span className="gradient-text">Smart</span>
            <span className="text-white">Formatter</span>
          </h1>
          <p className="text-sm text-white/50">
            Подтверждение требований
          </p>
        </div>
      </div>
    </header>
  );
}
