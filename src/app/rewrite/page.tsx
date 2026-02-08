"use client";

import { Suspense, useState, useCallback } from "react";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { BlurFade } from "@/components/ui/blur-fade";
import { FileUploadZone } from "@/features/constructor/components/FileUploadZone";
import { useDocumentUpload, TEXT_DOCUMENT_CONFIG } from "@/features/constructor/hooks/useDocumentUpload";
import {
  Sparkles,
  Copy,
  Check,
  RefreshCw,
  Loader2,
  ArrowRight,
  Pencil,
  Type,
  Upload,
} from "lucide-react";
import { trackEvent } from "@/lib/analytics/events";
import { RelatedTools } from "@/components/RelatedTools";

type InputMode = "text" | "file";
type RewriteMode = "light" | "medium" | "heavy";

const MODE_OPTIONS: { value: RewriteMode; label: string; description: string }[] = [
  { value: "light", label: "Лёгкий", description: "Синонимы, ~70-80%" },
  { value: "medium", label: "Средний", description: "Перестройка, ~80-90%" },
  { value: "heavy", label: "Глубокий", description: "Перефразирование, ~90-95%" },
];

export default function RewritePage() {
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
      <RewritePageContent />
    </Suspense>
  );
}

function RewritePageContent() {
  const [inputMode, setInputMode] = useState<InputMode>("text");
  const [text, setText] = useState("");
  const [rewriteMode, setRewriteMode] = useState<RewriteMode>("medium");
  const [preserveTerms, setPreserveTerms] = useState("");
  const [rewritten, setRewritten] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fileUpload = useDocumentUpload(TEXT_DOCUMENT_CONFIG);

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
    setRewritten(null);

    trackEvent("rewrite_generate", {
      rewriteMode,
      inputMode,
      textLength: inputText.length,
      hasPreserveTerms: preserveTerms.trim().length > 0,
    });

    try {
      const response = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: inputText.trim(),
          mode: rewriteMode,
          preserveTerms: preserveTerms.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Ошибка при рерайте текста");
      }

      const data = await response.json();
      setRewritten(data.rewritten);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Неизвестная ошибка");
    } finally {
      setIsGenerating(false);
    }
  }, [isGenerating, activeText, inputMode, extractedText, handleExtractText, rewriteMode, preserveTerms]);

  const handleCopy = useCallback(async () => {
    if (!rewritten) return;
    try {
      await navigator.clipboard.writeText(rewritten);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback — ignore
    }
  }, [rewritten]);

  const handleReset = () => {
    setRewritten(null);
    setError(null);
  };

  const handleModeSwitch = (mode: InputMode) => {
    setInputMode(mode);
    setError(null);
    setRewritten(null);
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
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/25 mb-4">
                <Pencil className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold mb-2 text-foreground">
                Повышение уникальности
              </h1>
              <p className="text-muted-foreground max-w-md mx-auto">
                Вставьте текст или загрузите файл — AI перепишет его с сохранением смысла для повышения уникальности
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
                    <Label htmlFor="text">Текст для рерайта</Label>
                    <Textarea
                      id="text"
                      placeholder="Вставьте текст, который нужно переписать..."
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
                      label="Документ для рерайта"
                      description="Загрузите .docx, .pdf или .txt файл"
                      acceptedTypes={TEXT_DOCUMENT_CONFIG.acceptedTypes}
                      acceptedExtensions={TEXT_DOCUMENT_CONFIG.acceptedExtensions}
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

                {/* Rewrite mode */}
                <div className="space-y-2">
                  <Label>Глубина рерайта</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {MODE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setRewriteMode(option.value)}
                        disabled={isGenerating}
                        className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-3 text-sm transition-all ${
                          rewriteMode === option.value
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

                {/* Preserve terms */}
                <div className="space-y-2">
                  <Label htmlFor="terms">
                    Сохранить термины{" "}
                    <span className="text-muted-foreground font-normal">(необязательно)</span>
                  </Label>
                  <Input
                    id="terms"
                    placeholder="NPV, EBITDA, рентабельность"
                    value={preserveTerms}
                    onChange={(e) => setPreserveTerms(e.target.value)}
                    maxLength={500}
                    disabled={isGenerating}
                  />
                  <p className="text-xs text-muted-foreground">
                    Через запятую — эти слова останутся без изменений
                  </p>
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
                        Переписываем...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5 mr-2" />
                        Переписать текст
                      </>
                    )}
                  </ShimmerButton>
                </div>
              </CardContent>
            </Card>
          </BlurFade>

          {/* Result */}
          {rewritten && (
            <BlurFade delay={0.1} inView>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Pencil className="w-5 h-5 text-amber-500" />
                    Результат
                  </CardTitle>
                  <CardDescription>
                    {MODE_OPTIONS.find((o) => o.value === rewriteMode)?.label} рерайт
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground bg-muted/50 rounded-lg p-4 max-h-[500px] overflow-y-auto">
                    {rewritten}
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
                      Ещё раз
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </BlurFade>
          )}

          {/* CTA block */}
          {rewritten && (
            <BlurFade delay={0.2} inView>
              <Card className="border-amber-500/20 bg-gradient-to-r from-amber-500/5 to-orange-500/5">
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
            <RelatedTools currentTool="rewrite" />
          </BlurFade>
        </div>
      </div>
    </main>
  );
}
