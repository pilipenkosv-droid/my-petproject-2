"use client";

import { useState, useCallback, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FileUploadZone } from "@/features/constructor/components/FileUploadZone";
import { ProcessingStatus } from "@/features/constructor/components/ProcessingStatus";
import {
  useDocumentUpload,
  SOURCE_DOCUMENT_CONFIG,
  REQUIREMENTS_DOCUMENT_CONFIG,
} from "@/features/constructor/hooks/useDocumentUpload";
import { useAnimatedProgress, type AnimatedStep } from "@/features/constructor/hooks/useAnimatedProgress";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BlurFade } from "@/components/ui/blur-fade";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, Sparkles, Zap, LogIn, BookOpen, Shield, Lightbulb, GraduationCap, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Header } from "@/components/Header";
import { FlowStepper } from "@/components/FlowStepper";
import { useAuth } from "@/components/providers/AuthProvider";
import { trackEvent } from "@/lib/analytics/events";
import { WORK_TYPES, type RequirementsMode } from "@/types/work-types";
import { MarathonBanner } from "@/features/seasonal/components/MarathonBanner";

type PageState = "upload" | "processing";

const UPLOAD_STEPS: AnimatedStep[] = [
  { id: "uploading", label: "Загрузка файлов", rangeStart: 0, rangeEnd: 15 },
  { id: "extracting_text", label: "Извлечение текста из документов", rangeStart: 15, rangeEnd: 35 },
  { id: "parsing_rules", label: "Чтение методички", rangeStart: 35, rangeEnd: 60 },
  { id: "ai_understanding", label: "AI-анализ требований", rangeStart: 60, rangeEnd: 85 },
  { id: "building_ruleset", label: "Формирование свода правил", rangeStart: 85, rangeEnd: 100 },
];

const GOST_STEPS: AnimatedStep[] = [
  { id: "uploading", label: "Загрузка документа", rangeStart: 0, rangeEnd: 10 },
  { id: "parsing_structure", label: "Разбор структуры документа", rangeStart: 10, rangeEnd: 28 },
  { id: "analyzing", label: "AI-разметка и поиск нарушений", rangeStart: 28, rangeEnd: 55 },
  { id: "formatting", label: "Применение правил ГОСТ 7.32", rangeStart: 55, rangeEnd: 80 },
  { id: "checking_compliance", label: "Проверка соответствия требованиям", rangeStart: 80, rangeEnd: 92 },
  { id: "finalizing", label: "Сборка итогового документа", rangeStart: 92, rangeEnd: 100 },
];

function ConstructorPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading } = useAuth();
  const [pageState, setPageState] = useState<PageState>("upload");
  const [trialBlocked, setTrialBlocked] = useState(false);
  const [workType, setWorkType] = useState(searchParams.get("type") || "");
  const [requirementsMode, setRequirementsMode] = useState<RequirementsMode>("upload");

  const [proInfo, setProInfo] = useState<{ type: string; remaining: number } | null>(null);

  // Если пользователь вернулся после оплаты на Lava.top — redirect на страницу статуса
  useEffect(() => {
    const pendingInvoice = localStorage.getItem("pendingInvoiceId");
    if (pendingInvoice) {
      router.replace(`/payment/success?invoiceId=${pendingInvoice}`);
    }
  }, [router]);

  useEffect(() => {
    if (!user) return;
    fetch("/api/user/access")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data && (data.accessType === "subscription" || data.accessType === "subscription_plus")) {
          setProInfo({ type: data.accessType, remaining: data.remainingUses });
        }
      })
      .catch(() => {});
  }, [user]);

  const sourceDoc = useDocumentUpload(SOURCE_DOCUMENT_CONFIG);
  const requirementsDoc = useDocumentUpload(REQUIREMENTS_DOCUMENT_CONFIG);

  const handleSourceFileSelect = useCallback((file: File) => {
    trackEvent("file_upload", { file_type: file.name.split(".").pop() });
    sourceDoc.handleFileSelect(file);
  }, [sourceDoc]);

  const handleGuidelinesFileSelect = useCallback((file: File) => {
    trackEvent("guidelines_upload", { file_type: file.name.split(".").pop() });
    requirementsDoc.handleFileSelect(file);
  }, [requirementsDoc]);

  const canProcess = sourceDoc.isValid && workType !== "" && (requirementsMode === "gost" || requirementsDoc.isValid);

  const activeSteps = requirementsMode === "gost" ? GOST_STEPS : UPLOAD_STEPS;

  const animatedProgress = useAnimatedProgress({
    steps: activeSteps,
    minTotalDuration: 60000,
    totalJitter: 30000,
  });

  const [sourcePageEstimate, setSourcePageEstimate] = useState<number>(30);
  useEffect(() => {
    const file = sourceDoc.uploadedFile?.file;
    if (!file) {
      setSourcePageEstimate(30);
      return;
    }
    // Rough estimate: ~3KB per page for docx, clamp to [10, 200]
    const est = Math.max(10, Math.min(200, Math.round(file.size / 3072)));
    setSourcePageEstimate(est);
  }, [sourceDoc.uploadedFile]);

  const stepDefs = activeSteps.map(s => ({ id: s.id, label: s.label }));

  const handleWorkTypeChange = useCallback((value: string) => {
    setWorkType(value);
    trackEvent("work_type_selected", { work_type: value });
  }, []);

  const handleRequirementsModeChange = useCallback((value: string) => {
    setRequirementsMode(value as RequirementsMode);
    if (value === "gost") {
      trackEvent("gost_mode_selected");
    }
  }, []);

  const handleProcess = useCallback(async () => {
    if (!canProcess || !sourceDoc.uploadedFile) return;
    if (requirementsMode === "upload" && !requirementsDoc.uploadedFile) return;

    setPageState("processing");
    animatedProgress.start();
    trackEvent("processing_start");

    try {
      const formData = new FormData();
      formData.append("sourceDocument", sourceDoc.uploadedFile.file);
      if (workType) {
        formData.append("workType", workType);
      }

      if (requirementsMode === "upload" && requirementsDoc.uploadedFile) {
        formData.append("requirementsDocument", requirementsDoc.uploadedFile.file);
      }

      const endpoint = requirementsMode === "gost" ? "/api/process-gost" : "/api/extract-rules";

      const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const responseText = await response.text().catch(() => "");
        let errorMessage = "Ошибка при обработке документа";
        let requiresAuth = false;
        try {
          const errorData = JSON.parse(responseText);
          errorMessage = errorData.error || errorMessage;
          requiresAuth = errorData.requiresAuth === true;
        } catch {
          if (responseText) {
            errorMessage = `Ошибка сервера (${response.status}). Попробуйте ещё раз.`;
          } else {
            errorMessage = `Ошибка сервера (${response.status})`;
          }
        }
        if (requiresAuth) {
          setTrialBlocked(true);
          setPageState("upload");
          return;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();

      const redirectUrl = requirementsMode === "gost"
        ? `/result/${data.jobId}`
        : `/confirm-rules/${data.jobId}`;

      animatedProgress.complete(() => {
        try {
          const finalSec = Math.max(1, Math.round(animatedProgress.elapsedMs / 1000));
          localStorage.setItem(`dlx_flow_time_${data.jobId}`, String(finalSec));
        } catch {}
        router.push(redirectUrl);
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Неизвестная ошибка";
      animatedProgress.fail(msg);
    }
  }, [canProcess, sourceDoc.uploadedFile, requirementsDoc.uploadedFile, requirementsMode, workType, animatedProgress, router]);

  const handleReset = () => {
    sourceDoc.reset();
    requirementsDoc.reset();
    setPageState("upload");
  };

  const processingTitle = requirementsMode === "gost"
    ? "Форматирование по ГОСТу"
    : "Извлечение требований";

  const processingDescription = requirementsMode === "gost"
    ? "Применяем стандартные правила ГОСТ 7.32..."
    : "Анализируем методичку с помощью AI...";

  return (
    <main className="min-h-screen relative">
      {/* Background */}
      <div className="fixed inset-0 mesh-gradient pointer-events-none" />

      <Header showBack />

      <div className="relative z-10 mx-auto max-w-2xl px-6 pt-4">
        <MarathonBanner />
      </div>

      <div className="relative z-10 mx-auto max-w-2xl px-6 pt-6">
        <FlowStepper currentStep={0} />
      </div>

      <div className="relative z-10 mx-auto max-w-2xl px-6 py-12">
        {pageState === "upload" ? (
          <div className="space-y-6">
            {/* Баннер: триал заблокирован */}
            {trialBlocked && (
              <BlurFade inView>
                <Card className="border-border bg-primary/10">
                  <CardContent className="pt-6 text-center">
                    <p className="text-foreground mb-3">
                      Бесплатная попытка использована. Зарегистрируйтесь для продолжения.
                    </p>
                    <Button onClick={() => router.push("/login")}>
                      <LogIn className="mr-2 h-4 w-4" />
                      Войти или зарегистрироваться
                    </Button>
                  </CardContent>
                </Card>
              </BlurFade>
            )}

            {/* Баннер: анонимный пользователь, триал доступен */}
            {!authLoading && !user && !trialBlocked && (
              <BlurFade inView>
                <div className="text-center p-3 bg-surface border border-surface-border">
                  <p className="text-sm text-on-surface-muted">
                    У вас <span className="text-primary font-medium">1 бесплатная обработка</span> без регистрации (50% документа).{" "}
                    <button onClick={() => router.push("/login")} className="text-primary hover:text-primary/80 underline">
                      Войдите
                    </button>
                    {" "}для неограниченного доступа.
                  </p>
                </div>
              </BlurFade>
            )}


            {/* Баннер: Pro/Pro Plus подписка */}
            {proInfo && (
              <BlurFade inView>
                <div className="flex items-center justify-between px-4 py-2.5 bg-muted border border-border text-sm">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-primary" />
                    <span className="font-medium text-foreground">
                      {proInfo.type === "subscription_plus" ? "Pro Plus" : "Pro"}
                    </span>
                    <span className="text-on-surface-muted">·</span>
                    <span className="text-on-surface-muted">{proInfo.remaining} из 10 обработок</span>
                  </div>
                  {proInfo.remaining === 0 && (
                    <Link href="/pricing" className="text-xs text-primary hover:underline">
                      Продлить
                    </Link>
                  )}
                </div>
              </BlurFade>
            )}

            {/* Описание */}
            <div className="text-center">
              <h2 className="text-3xl font-bold mb-3 text-foreground">
                Загрузите документ
              </h2>
              <p className="text-on-surface-subtle max-w-md mx-auto">
                Добавьте вашу работу — и выберите, как её оформить
              </p>
            </div>

            {/* 1. Тип работы (контекст первым) */}
            <BlurFade delay={0.15} inView>
              <Card
                className={cn(
                  "group relative overflow-hidden transition-colors",
                  workType
                    ? "border-emerald-500/30"
                    : "border-primary/40 ring-1 ring-primary/20"
                )}
              >
                <CardHeader>
                  <CardTitle className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 bg-foreground shadow-sm">
                      <GraduationCap className="h-5 w-5 text-background" />
                    </div>
                    <span>Тип работы</span>
                    {workType && (
                      <CheckCircle className="h-4 w-4 text-emerald-500 ml-auto" />
                    )}
                  </CardTitle>
                  <CardDescription>
                    {workType
                      ? "Контекст учтён — алгоритм подстроится под этот тип работы"
                      : "Обязательно: диплом, курсовая, реферат или другой тип"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Select value={workType} onValueChange={handleWorkTypeChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Выберите тип работы" />
                    </SelectTrigger>
                    <SelectContent>
                      {WORK_TYPES.map((wt) => (
                        <SelectItem key={wt.slug} value={wt.slug}>
                          {wt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!workType && (
                    <p className="text-xs text-primary mt-2">
                      Без этого не получится запустить обработку
                    </p>
                  )}
                </CardContent>
              </Card>
            </BlurFade>

            {/* 2. Исходный документ */}
            <BlurFade delay={0.2} inView>
              <Card className="group relative overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 bg-foreground shadow-sm">
                      <FileText className="h-5 w-5 text-background" />
                    </div>
                    <span>Исходный документ</span>
                  </CardTitle>
                  <CardDescription>
                    Ваша курсовая, диплом или научная работа
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FileUploadZone
                    label=""
                    description="Документ, который нужно отформатировать"
                    acceptedTypes={SOURCE_DOCUMENT_CONFIG.acceptedTypes}
                    acceptedExtensions={SOURCE_DOCUMENT_CONFIG.acceptedExtensions}
                    uploadedFile={sourceDoc.uploadedFile}
                    onFileSelect={handleSourceFileSelect}
                    onFileRemove={sourceDoc.handleFileRemove}
                    disabled={false}
                  />
                </CardContent>
              </Card>
            </BlurFade>

            {/* Ссылка на генератор плана */}
            <BlurFade delay={0.27} inView>
              <Link
                href={workType ? `/outline?type=${workType}` : "/outline"}
                className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                <Lightbulb className="h-4 w-4" />
                Нет плана? Сгенерируем структуру работы с помощью AI
              </Link>
            </BlurFade>

            {/* 3. Требования к оформлению */}
            <BlurFade delay={0.3} inView>
              <Card className="group relative overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 bg-foreground shadow-sm">
                      <Sparkles className="h-5 w-5 text-background" />
                    </div>
                    <span>Требования к оформлению</span>
                  </CardTitle>
                  <CardDescription>
                    Загрузите методичку или используйте стандартный ГОСТ
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs
                    value={requirementsMode}
                    onValueChange={handleRequirementsModeChange}
                  >
                    <TabsList className="w-full">
                      <TabsTrigger value="upload" className="flex-1 gap-1.5">
                        <BookOpen className="h-4 w-4" />
                        Методичка
                      </TabsTrigger>
                      <TabsTrigger value="gost" className="flex-1 gap-1.5">
                        <Shield className="h-4 w-4" />
                        Стандартный ГОСТ
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="upload" className="mt-4">
                      <FileUploadZone
                        label=""
                        description="Методичка или правила от вашего ВУЗа"
                        acceptedTypes={REQUIREMENTS_DOCUMENT_CONFIG.acceptedTypes}
                        acceptedExtensions={REQUIREMENTS_DOCUMENT_CONFIG.acceptedExtensions}
                        uploadedFile={requirementsDoc.uploadedFile}
                        onFileSelect={handleGuidelinesFileSelect}
                        onFileRemove={requirementsDoc.handleFileRemove}
                        disabled={false}
                      />
                    </TabsContent>

                    <TabsContent value="gost" className="mt-4">
                      <div className="border border-surface-border bg-surface p-4 space-y-3">
                        <p className="text-sm text-foreground font-medium">
                          Будет применён стандартный ГОСТ 7.32-2017:
                        </p>
                        <ul className="text-sm text-on-surface-muted space-y-1.5">
                          <li className="flex items-start gap-2">
                            <span className="text-primary mt-0.5">•</span>
                            Шрифт Times New Roman, 14 pt
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-primary mt-0.5">•</span>
                            Полуторный межстрочный интервал
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-primary mt-0.5">•</span>
                            Поля: 20-30-15-15 мм
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-primary mt-0.5">•</span>
                            Абзацный отступ 1.25 см
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-primary mt-0.5">•</span>
                            Выравнивание по ширине
                          </li>
                        </ul>
                        <p className="text-xs text-muted-foreground">
                          Для точного соответствия требованиям кафедры рекомендуем загрузить методичку.
                        </p>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </BlurFade>

            {/* Кнопка обработки */}
            <BlurFade delay={0.4} inView>
              <div className="flex flex-col items-center gap-4">
                <Button size="lg"
                  onClick={handleProcess}
                  disabled={!canProcess}
                  className={!canProcess ? "opacity-50 pointer-events-none" : ""}
                >
                  <Zap className="w-5 h-5 mr-2" />
                  Обработать документ
                </Button>

                {/* Подсказка — какое поле не заполнено */}
                {!canProcess && (
                  <p className="text-sm text-muted-foreground">
                    {!workType
                      ? "Выберите тип работы"
                      : !sourceDoc.uploadedFile
                        ? "Загрузите исходный документ"
                        : requirementsMode === "upload" && !requirementsDoc.uploadedFile
                          ? "Загрузите методичку или переключитесь на «Стандартный ГОСТ»"
                          : "Заполните все поля выше"}
                  </p>
                )}
              </div>
            </BlurFade>
          </div>
        ) : (
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <div className="w-10 h-10 bg-foreground flex items-center justify-center animate-pulse">
                  <Sparkles className="w-5 h-5 text-background" />
                </div>
                {processingTitle}
              </CardTitle>
              <CardDescription>
                {processingDescription}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProcessingStatus
                currentStep={animatedProgress.displayStep}
                progress={animatedProgress.displayProgress}
                error={animatedProgress.error}
                steps={stepDefs}
                elapsedMs={animatedProgress.elapsedMs}
                pageCount={sourcePageEstimate}
              />
              {animatedProgress.error && (
                <div className="mt-6 flex justify-center">
                  <Button variant="outline" onClick={handleReset}>
                    Попробовать снова
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}

export default function ConstructorPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen relative">
        <div className="fixed inset-0 mesh-gradient pointer-events-none" />
        <Header showBack />
        <div className="relative z-10 mx-auto max-w-2xl px-6 py-12">
          <div className="text-center">
            <div className="h-8 w-48 mx-auto bg-muted animate-pulse mb-4" />
            <div className="h-4 w-64 mx-auto bg-muted animate-pulse" />
          </div>
        </div>
      </main>
    }>
      <ConstructorPageContent />
    </Suspense>
  );
}
