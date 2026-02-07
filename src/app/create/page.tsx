"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
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
import { FileText, Sparkles, Zap, LogIn } from "lucide-react";
import { Header } from "@/components/Header";
import { useAuth } from "@/components/providers/AuthProvider";

type PageState = "upload" | "processing";

const PHASE1_STEPS: AnimatedStep[] = [
  { id: "uploading", label: "Загрузка файлов", rangeStart: 0, rangeEnd: 20 },
  { id: "extracting_text", label: "Извлечение текста", rangeStart: 20, rangeEnd: 55 },
  { id: "parsing_rules", label: "Анализ требований с помощью AI", rangeStart: 55, rangeEnd: 100 },
];

const PHASE1_STEP_DEFS = PHASE1_STEPS.map(s => ({ id: s.id, label: s.label }));

export default function ConstructorPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [pageState, setPageState] = useState<PageState>("upload");
  const [trialBlocked, setTrialBlocked] = useState(false);

  const sourceDoc = useDocumentUpload(SOURCE_DOCUMENT_CONFIG);
  const requirementsDoc = useDocumentUpload(REQUIREMENTS_DOCUMENT_CONFIG);

  const canProcess = sourceDoc.isValid && requirementsDoc.isValid;

  const animatedProgress = useAnimatedProgress({
    steps: PHASE1_STEPS,
    minStepDuration: 1500,
  });

  const handleProcess = useCallback(async () => {
    if (!canProcess || !sourceDoc.uploadedFile || !requirementsDoc.uploadedFile) {
      return;
    }

    setPageState("processing");
    animatedProgress.start();

    try {
      const formData = new FormData();
      formData.append("sourceDocument", sourceDoc.uploadedFile.file);
      formData.append("requirementsDocument", requirementsDoc.uploadedFile.file);

      const response = await fetch("/api/extract-rules", {
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

      // Let animation finish walking through steps, then redirect
      animatedProgress.complete(() => {
        router.push(`/confirm-rules/${data.jobId}`);
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Неизвестная ошибка";
      animatedProgress.fail(msg);
    }
  }, [canProcess, sourceDoc.uploadedFile, requirementsDoc.uploadedFile, animatedProgress, router]);

  const handleReset = () => {
    sourceDoc.reset();
    requirementsDoc.reset();
    setPageState("upload");
  };

  return (
    <main className="min-h-screen relative">
      {/* Background */}
      <div className="fixed inset-0 mesh-gradient pointer-events-none" />

      {/* Floating decorative elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 right-20 w-64 h-64 bg-violet-500/20 rounded-full blur-[100px] animate-pulse-glow" />
        <div className="absolute bottom-40 left-20 w-80 h-80 bg-indigo-500/15 rounded-full blur-[120px] animate-pulse-glow" style={{ animationDelay: '2s' }} />
      </div>

      <Header showBack />

      <div className="relative z-10 mx-auto max-w-4xl px-6 py-12">
        {pageState === "upload" ? (
          <div className="space-y-8">
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

            {/* Описание */}
            <div className="text-center">
              <h2 className="text-3xl font-bold mb-3">
                <span className="gradient-text">Загрузите</span>
                <span className="text-foreground"> документы</span>
              </h2>
              <p className="text-on-surface-subtle max-w-md mx-auto">
                Добавьте вашу научную работу и файл с требованиями к оформлению
              </p>
            </div>

            {/* Карточки загрузки */}
            <div className="grid gap-6 md:grid-cols-2">
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
                      onFileSelect={sourceDoc.handleFileSelect}
                      onFileRemove={sourceDoc.handleFileRemove}
                      disabled={false}
                    />
                  </CardContent>
                </Card>
              </BlurFade>

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
                      Методичка или правила от вашего ВУЗа
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <FileUploadZone
                      label=""
                      description="Документ с правилами форматирования"
                      acceptedTypes={REQUIREMENTS_DOCUMENT_CONFIG.acceptedTypes}
                      acceptedExtensions={REQUIREMENTS_DOCUMENT_CONFIG.acceptedExtensions}
                      uploadedFile={requirementsDoc.uploadedFile}
                      onFileSelect={requirementsDoc.handleFileSelect}
                      onFileRemove={requirementsDoc.handleFileRemove}
                      disabled={false}
                    />
                  </CardContent>
                </Card>
              </BlurFade>
            </div>

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
                {!canProcess && (sourceDoc.uploadedFile || requirementsDoc.uploadedFile) && (
                  <p className="text-sm text-muted-foreground">
                    Загрузите оба документа для начала обработки
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
                Извлечение требований
              </CardTitle>
              <CardDescription>
                Анализируем методичку с помощью AI...
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProcessingStatus
                currentStep={animatedProgress.displayStep}
                progress={animatedProgress.displayProgress}
                error={animatedProgress.error}
                steps={PHASE1_STEP_DEFS}
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
