"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import { ArrowLeft, FileText, Sparkles, Zap } from "lucide-react";

type PageState = "upload" | "processing";

const PHASE1_STEPS: AnimatedStep[] = [
  { id: "uploading", label: "Загрузка файлов", rangeStart: 0, rangeEnd: 20 },
  { id: "extracting_text", label: "Извлечение текста", rangeStart: 20, rangeEnd: 55 },
  { id: "parsing_rules", label: "Анализ требований с помощью AI", rangeStart: 55, rangeEnd: 100 },
];

const PHASE1_STEP_DEFS = PHASE1_STEPS.map(s => ({ id: s.id, label: s.label }));

export default function ConstructorPage() {
  const router = useRouter();
  const [pageState, setPageState] = useState<PageState>("upload");

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
        // Читаем тело как текст, потом пробуем распарсить как JSON
        const responseText = await response.text().catch(() => "");
        let errorMessage = "Ошибка при обработке документа";
        try {
          const errorData = JSON.parse(responseText);
          errorMessage = errorData.error || errorMessage;
        } catch {
          // Vercel может вернуть не-JSON ответ (таймаут, 502, etc.)
          if (responseText) {
            errorMessage = `Ошибка сервера (${response.status}). Попробуйте ещё раз.`;
          } else {
            errorMessage = `Ошибка сервера (${response.status})`;
          }
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

      {/* Header */}
      <header className="relative z-10 border-b border-white/10 bg-white/5 backdrop-blur-xl">
        <div className="mx-auto max-w-4xl px-6 py-4 flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-all"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <Link href="/" className="group">
            <h1 className="text-lg font-bold">
              <span className="gradient-text group-hover:opacity-80 transition-opacity">Smart</span>
              <span className="text-white group-hover:opacity-80 transition-opacity">Format</span>
            </h1>
            <p className="text-sm text-white/50">
              Конструктор документов
            </p>
          </Link>
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-4xl px-6 py-12">
        {pageState === "upload" ? (
          <div className="space-y-8">
            {/* Описание */}
            <div className="text-center">
              <h2 className="text-3xl font-bold mb-3">
                <span className="gradient-text">Загрузите</span>
                <span className="text-white"> документы</span>
              </h2>
              <p className="text-white/50 max-w-md mx-auto">
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
                  <p className="text-sm text-white/40">
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
