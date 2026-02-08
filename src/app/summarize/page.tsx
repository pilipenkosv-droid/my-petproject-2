"use client";

import { Suspense, useState, useCallback } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { BlurFade } from "@/components/ui/blur-fade";
import { FileUploadZone } from "@/features/constructor/components/FileUploadZone";
import { useDocumentUpload } from "@/features/constructor/hooks/useDocumentUpload";
import {
  Sparkles,
  Copy,
  Check,
  RefreshCw,
  Loader2,
  ArrowRight,
  FileText,
  Type,
  Upload,
  Minus,
  Plus,
} from "lucide-react";
import { trackEvent } from "@/lib/analytics/events";

type InputMode = "text" | "file";
type TargetLength = "short" | "medium" | "detailed";

const LENGTH_OPTIONS: { value: TargetLength; label: string; description: string }[] = [
  { value: "short", label: "Короткое", description: "100-200 слов" },
  { value: "medium", label: "Среднее", description: "300-500 слов" },
  { value: "detailed", label: "Подробное", description: "800-1000 слов" },
];

const SUMMARIZE_DOCUMENT_CONFIG = {
  acceptedTypes: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/pdf",
    "text/plain",
  ],
  acceptedExtensions: [".docx", ".pdf", ".txt"],
};

export default function SummarizePage() {
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
      <SummarizePageContent />
    </Suspense>
  );
}

function SummarizePageContent() {
  const [inputMode, setInputMode] = useState<InputMode>("text");
  const [text, setText] = useState("");
  const [targetLength, setTargetLength] = useState<TargetLength>("medium");
  const [summary, setSummary] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fileUpload = useDocumentUpload(SUMMARIZE_DOCUMENT_CONFIG);

  const activeText = inputMode === "text" ? text : extractedText;
  const canGenerate =
    inputMode === "text"
      ? text.trim().length >= 50
      : (extractedText && extractedText.trim().length >= 50) || false;

  const handleExtractText = useCallback(async () => {
    if (!fileUpload.uploadedFile?.file) return null;

    setIsExtracting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", fileUpload.uploadedFile.file);

      const response = await fetch("/api/extract-text", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Ошибка при извлечении текста");
      }

      const data = await response.json();
      setExtractedText(data.text);
      return data.text as string;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось извлечь текст из файла");
      return null;
    } finally {
      setIsExtracting(false);
    }
  }, [fileUpload.uploadedFile?.file]);

  const handleGenerate = useCallback(async () => {
    if (isGenerating) return;

    let inputText = activeText;

    // Если файловый режим и текст ещё не извлечён — извлекаем
    if (inputMode === "file" && !extractedText) {
      inputText = await handleExtractText();
      if (!inputText) return;
    }

    if (!inputText || inputText.trim().length < 50) {
      setError("Текст слишком короткий (минимум 50 символов)");
      return;
    }

    setIsGenerating(true);
    setError(null);
    setSummary(null);

    trackEvent("summarize_generate", {
      targetLength,
      inputMode,
      textLength: inputText.length,
    });

    try {
      const response = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: inputText.trim(),
          targetLength,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Ошибка при генерации резюме");
      }

      const data = await response.json();
      setSummary(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неизвестная ошибка");
    } finally {
      setIsGenerating(false);
    }
  }, [isGenerating, activeText, inputMode, extractedText, handleExtractText, targetLength]);

  const handleShorter = useCallback(() => {
    const idx = LENGTH_OPTIONS.findIndex((o) => o.value === targetLength);
    if (idx > 0) {
      setTargetLength(LENGTH_OPTIONS[idx - 1].value);
      // Перегенерируем после обновления state
      setTimeout(() => {
        setSummary(null);
        setError(null);
      }, 0);
    }
  }, [targetLength]);

  const handleLonger = useCallback(() => {
    const idx = LENGTH_OPTIONS.findIndex((o) => o.value === targetLength);
    if (idx < LENGTH_OPTIONS.length - 1) {
      setTargetLength(LENGTH_OPTIONS[idx + 1].value);
      setTimeout(() => {
        setSummary(null);
        setError(null);
      }, 0);
    }
  }, [targetLength]);

  const handleCopy = useCallback(async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback — ignore
    }
  }, [summary]);

  const handleReset = () => {
    setSummary(null);
    setError(null);
  };

  const handleModeSwitch = (mode: InputMode) => {
    setInputMode(mode);
    setError(null);
    setSummary(null);
    if (mode === "text") {
      setExtractedText(null);
      fileUpload.reset();
    } else {
      setText("");
    }
  };

  return (
    <main className="min-h-screen relative">
      <div className="fixed inset-0 mesh-gradient pointer-events-none" />
      <Header />

      <div className="relative z-10 mx-auto max-w-2xl px-6 py-8">
        <div className="space-y-6">
          {/* Header */}
          <BlurFade delay={0.1} inView>
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/25 mb-4">
                <FileText className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold mb-2 text-foreground">
                Краткое содержание
              </h1>
              <p className="text-muted-foreground max-w-md mx-auto">
                Вставьте текст или загрузите файл — AI создаст аннотацию или краткое содержание вашей работы
              </p>
            </div>
          </BlurFade>

          {/* Form */}
          <BlurFade delay={0.2} inView>
            <Card>
              <CardContent className="pt-6 space-y-4">
                {/* Input mode toggle */}
                <div className="flex rounded-lg border border-surface-border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => handleModeSwitch("text")}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                      inputMode === "text"
                        ? "bg-primary text-primary-foreground"
                        : "bg-surface hover:bg-surface-hover text-muted-foreground"
                    }`}
                    disabled={isGenerating}
                  >
                    <Type className="h-4 w-4" />
                    Текст
                  </button>
                  <button
                    type="button"
                    onClick={() => handleModeSwitch("file")}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                      inputMode === "file"
                        ? "bg-primary text-primary-foreground"
                        : "bg-surface hover:bg-surface-hover text-muted-foreground"
                    }`}
                    disabled={isGenerating}
                  >
                    <Upload className="h-4 w-4" />
                    Файл
                  </button>
                </div>

                {/* Text input */}
                {inputMode === "text" && (
                  <div className="space-y-2">
                    <Label htmlFor="text">Текст для резюмирования</Label>
                    <Textarea
                      id="text"
                      placeholder="Вставьте текст работы или её фрагмент..."
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      rows={8}
                      maxLength={50000}
                      disabled={isGenerating}
                    />
                    <p className="text-xs text-muted-foreground text-right">
                      {text.length.toLocaleString()}/50 000
                    </p>
                  </div>
                )}

                {/* File input */}
                {inputMode === "file" && (
                  <div className="space-y-2">
                    <Label>Загрузите документ</Label>
                    <FileUploadZone
                      label="Документ для резюмирования"
                      description="Загрузите .docx, .pdf или .txt файл"
                      acceptedTypes={SUMMARIZE_DOCUMENT_CONFIG.acceptedTypes}
                      acceptedExtensions={SUMMARIZE_DOCUMENT_CONFIG.acceptedExtensions}
                      uploadedFile={fileUpload.uploadedFile}
                      onFileSelect={fileUpload.handleFileSelect}
                      onFileRemove={() => {
                        fileUpload.handleFileRemove();
                        setExtractedText(null);
                      }}
                      disabled={isGenerating || isExtracting}
                    />
                    {extractedText && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">
                        Текст извлечён ({extractedText.length.toLocaleString()} символов)
                      </p>
                    )}
                  </div>
                )}

                {/* Target length */}
                <div className="space-y-2">
                  <Label>Длина резюме</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {LENGTH_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setTargetLength(option.value)}
                        disabled={isGenerating}
                        className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-3 text-sm transition-all ${
                          targetLength === option.value
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : "border-surface-border bg-surface hover:bg-surface-hover text-muted-foreground"
                        }`}
                      >
                        <span>{option.label}</span>
                        <span className="text-[11px] opacity-70">{option.description}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <p className="text-sm text-red-500">{error}</p>
                )}

                {/* Submit */}
                <div className="flex justify-center pt-2">
                  <ShimmerButton
                    onClick={handleGenerate}
                    disabled={
                      isGenerating ||
                      isExtracting ||
                      (inputMode === "text" ? !canGenerate : !fileUpload.isValid)
                    }
                  >
                    {isExtracting ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Извлекаем текст...
                      </>
                    ) : isGenerating ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Генерируем резюме...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5 mr-2" />
                        Сгенерировать резюме
                      </>
                    )}
                  </ShimmerButton>
                </div>
              </CardContent>
            </Card>
          </BlurFade>

          {/* Result */}
          {summary && (
            <BlurFade delay={0.1} inView>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-emerald-500" />
                    Краткое содержание
                  </CardTitle>
                  <CardDescription>
                    {LENGTH_OPTIONS.find((o) => o.value === targetLength)?.label} резюме
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground bg-muted/50 rounded-lg p-4 max-h-[500px] overflow-y-auto">
                    {summary}
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

                    {targetLength !== "short" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleShorter}
                      >
                        <Minus className="w-4 h-4 mr-1" />
                        Ещё короче
                      </Button>
                    )}

                    {targetLength !== "detailed" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleLonger}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Подробнее
                      </Button>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleReset}
                    >
                      <RefreshCw className="w-4 h-4 mr-1" />
                      Заново
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </BlurFade>
          )}

          {/* CTA block */}
          {summary && (
            <BlurFade delay={0.2} inView>
              <Card className="border-emerald-500/20 bg-gradient-to-r from-emerald-500/5 to-teal-500/5">
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
        </div>
      </div>
    </main>
  );
}
