"use client";

import { useState, useCallback, Suspense } from "react";
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
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, Sparkles, Zap, LogIn, BookOpen, Shield, Lightbulb } from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { Header } from "@/components/Header";
import { FlowStepper } from "@/components/FlowStepper";
import { useAuth } from "@/components/providers/AuthProvider";
import { trackEvent } from "@/lib/analytics/events";
import { WORK_TYPES, type RequirementsMode } from "@/types/work-types";

type PageState = "upload" | "processing";

const UPLOAD_STEPS: AnimatedStep[] = [
  { id: "uploading", label: "Загрузка файлов", rangeStart: 0, rangeEnd: 20 },
  { id: "extracting_text", label: "Извлечение текста", rangeStart: 20, rangeEnd: 55 },
  { id: "parsing_rules", label: "Анализ требований с помощью AI", rangeStart: 55, rangeEnd: 100 },
];

const GOST_STEPS: AnimatedStep[] = [
  { id: "uploading", label: "Загрузка документа", rangeStart: 0, rangeEnd: 15 },
  { id: "analyzing", label: "AI-разметка и проверка документа", rangeStart: 15, rangeEnd: 60 },
  { id: "formatting", label: "Применение форматирования по ГОСТу", rangeStart: 60, rangeEnd: 100 },
];

function ConstructorPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading } = useAuth();
  const [pageState, setPageState] = useState<PageState>("upload");
  const [trialBlocked, setTrialBlocked] = useState(false);
  const [workType, setWorkType] = useState(searchParams.get("type") || "");
  const [requirementsMode, setRequirementsMode] = useState<RequirementsMode>("upload");

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

  const canProcess = sourceDoc.isValid && (requirementsMode === "gost" || requirementsDoc.isValid);

  const activeSteps = requirementsMode === "gost" ? GOST_STEPS : UPLOAD_STEPS;

  const animatedProgress = useAnimatedProgress({
    steps: activeSteps,
    minStepDuration: 1500,
  });

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

      <div className="relative z-10 mx-auto max-w-2xl px-6 pt-6">
        <FlowStepper currentStep={0} />
      </div>

      <div className="relative z-10 mx-auto max-w-2xl px-6 py-12">
        {pageState === "upload" ? (
          <div className="space-y-6">
            {/* Баннер: триал заблокирован */}
            {trialBlocked && (
              <BlurFade inView>
                <Card className="border-violet-500/30 bg-violet-500/10">
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
                <div className="text-center p-3 rounded-lg bg-surface border border-surface-border">
                  <p className="text-sm text-on-surface-muted">
                    У вас <span className="text-primary font-medium">1 бесплатная обработка</span> без регистрации (первые 30 страниц).{" "}
                    <button onClick={() => router.push("/login")} className="text-primary hover:text-primary/80 underline">
                      Войдите
                    </button>
                    {" "}для неограниченного доступа.
                  </p>
                </div>
              </BlurFade>
            )}

            {/* Маскот */}
            <Mascot
              src="/mascot/writing.png"
              alt="Диплодок за ноутбуком"
              width={460}
              height={368}
              className="mx-auto mb-2 w-32 sm:w-auto hidden sm:block"
            />

            {/* Описание */}
            <div className="text-center">
              <h2 className="text-3xl font-bold mb-3 text-foreground">
                Загрузите документ
              </h2>
              <p className="text-on-surface-subtle max-w-md mx-auto">
                Добавьте вашу работу — и выберите, как её оформить
              </p>
            </div>

            {/* 1. Исходный документ */}
            <BlurFade delay={0.2} inView>
              <Card className="group relative overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/25">
                      <FileText className="h-5 w-5 text-white" />
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

            {/* 2. Тип работы */}
            <BlurFade delay={0.25} inView>
              <div className="flex items-center gap-3 px-1">
                <label className="text-sm font-medium text-foreground whitespace-nowrap">
                  Тип работы:
                </label>
                <Select value={workType} onValueChange={handleWorkTypeChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Выберите тип работы (опционально)" />
                  </SelectTrigger>
                  <SelectContent>
                    {WORK_TYPES.map((wt) => (
                      <SelectItem key={wt.slug} value={wt.slug}>
                        {wt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
                    <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 shadow-lg shadow-indigo-500/25">
                      <Sparkles className="h-5 w-5 text-white" />
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
                      <div className="rounded-lg border border-surface-border bg-surface/50 p-4 space-y-3">
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
                <ShimmerButton
                  onClick={handleProcess}
                  disabled={!canProcess}
                  className={!canProcess ? "opacity-50 pointer-events-none" : ""}
                >
                  <Zap className="w-5 h-5 mr-2" />
                  Обработать документ
                </ShimmerButton>

                {/* Подсказка */}
                {!canProcess && sourceDoc.uploadedFile && requirementsMode === "upload" && (
                  <p className="text-sm text-muted-foreground">
                    Загрузите методичку или переключитесь на «Стандартный ГОСТ»
                  </p>
                )}
              </div>
            </BlurFade>
          </div>
        ) : (
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center animate-pulse">
                  <Sparkles className="w-5 h-5 text-white" />
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
            <div className="h-8 w-48 mx-auto bg-muted rounded animate-pulse mb-4" />
            <div className="h-4 w-64 mx-auto bg-muted rounded animate-pulse" />
          </div>
        </div>
      </main>
    }>
      <ConstructorPageContent />
    </Suspense>
  );
}
