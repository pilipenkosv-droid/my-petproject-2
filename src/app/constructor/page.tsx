"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileUploadZone } from "@/features/constructor/components/FileUploadZone";
import { ProcessingStatus } from "@/features/constructor/components/ProcessingStatus";
import {
  useDocumentUpload,
  SOURCE_DOCUMENT_CONFIG,
  REQUIREMENTS_DOCUMENT_CONFIG,
} from "@/features/constructor/hooks/useDocumentUpload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BorderBeam } from "@/components/ui/border-beam";
import { BlurFade } from "@/components/ui/blur-fade";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { ArrowLeft, FileText, Sparkles, Zap } from "lucide-react";

type PageState = "upload" | "processing";

export default function ConstructorPage() {
  const router = useRouter();
  const [pageState, setPageState] = useState<PageState>("upload");
  const [processingStep, setProcessingStep] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | undefined>();

  const sourceDoc = useDocumentUpload(SOURCE_DOCUMENT_CONFIG);
  const requirementsDoc = useDocumentUpload(REQUIREMENTS_DOCUMENT_CONFIG);

  const canProcess = sourceDoc.isValid && requirementsDoc.isValid;

  const handleProcess = async () => {
    if (!canProcess || !sourceDoc.uploadedFile || !requirementsDoc.uploadedFile) {
      return;
    }

    setPageState("processing");
    setProcessingStep("Извлечение требований из методички...");
    setError(undefined);

    try {
      const formData = new FormData();
      formData.append("sourceDocument", sourceDoc.uploadedFile.file);
      formData.append("requirementsDocument", requirementsDoc.uploadedFile.file);

      // Используем новый API для извлечения правил
      const response = await fetch("/api/extract-rules", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Ошибка при обработке документа");
      }

      const data = await response.json();
      
      // Перенаправляем на страницу подтверждения правил
      router.push(`/confirm-rules/${data.jobId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неизвестная ошибка");
      setPageState("upload");
    }
  };

  const handleReset = () => {
    sourceDoc.reset();
    requirementsDoc.reset();
    setPageState("upload");
    setError(undefined);
    setProgress(0);
    setProcessingStep(null);
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
          <div>
            <h1 className="text-lg font-bold">
              <span className="gradient-text">Smart</span>
              <span className="text-white">Formatter</span>
            </h1>
            <p className="text-sm text-white/50">
              Конструктор документов
            </p>
          </div>
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
                  <BorderBeam 
                    size={120} 
                    duration={8} 
                    colorFrom="#8b5cf6" 
                    colorTo="#a855f7"
                  />
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
                  <BorderBeam 
                    size={120} 
                    duration={8} 
                    delay={4}
                    colorFrom="#6366f1" 
                    colorTo="#3b82f6"
                  />
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

            {/* Ошибка */}
            {error && (
              <div className="rounded-2xl bg-red-500/10 border border-red-500/20 backdrop-blur-sm p-4 text-center">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

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
                Обработка документа
              </CardTitle>
              <CardDescription>
                Пожалуйста, подождите...
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProcessingStatus
                currentStep={processingStep as any}
                progress={progress}
                error={error}
              />
              {error && (
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
