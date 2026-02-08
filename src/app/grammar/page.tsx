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
import { useDocumentUpload, TEXT_DOCUMENT_CONFIG } from "@/features/constructor/hooks/useDocumentUpload";
import { useGrammarCheck } from "@/features/grammar/hooks/useGrammarCheck";
import { HighlightedText } from "@/features/grammar/components/HighlightedText";
import { GrammarStats } from "@/features/grammar/components/GrammarStats";
import {
  SpellCheck,
  Copy,
  Check,
  RefreshCw,
  Loader2,
  ArrowRight,
  Type,
  Upload,
  Search,
} from "lucide-react";
import { trackEvent } from "@/lib/analytics/events";

type InputMode = "text" | "file";

export default function GrammarPage() {
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
      <GrammarPageContent />
    </Suspense>
  );
}

function GrammarPageContent() {
  const [inputMode, setInputMode] = useState<InputMode>("text");
  const [text, setText] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fileUpload = useDocumentUpload(TEXT_DOCUMENT_CONFIG);
  const grammar = useGrammarCheck();

  const activeText = inputMode === "text" ? text : extractedText;
  const canCheck =
    inputMode === "text"
      ? text.trim().length >= 10
      : (extractedText && extractedText.trim().length >= 10) || false;

  const handleExtractText = useCallback(async () => {
    if (!fileUpload.uploadedFile?.file) return null;

    setIsExtracting(true);

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
    } catch {
      return null;
    } finally {
      setIsExtracting(false);
    }
  }, [fileUpload.uploadedFile?.file]);

  const handleCheck = useCallback(async () => {
    if (grammar.isChecking) return;

    let inputText = activeText;

    if (inputMode === "file" && !extractedText) {
      inputText = await handleExtractText();
      if (!inputText) return;
    }

    if (!inputText || inputText.trim().length < 10) return;

    trackEvent("grammar_check", {
      inputMode,
      textLength: inputText.length,
    });

    await grammar.check(inputText);
  }, [grammar, activeText, inputMode, extractedText, handleExtractText]);

  const handleCopyCorrected = useCallback(async () => {
    const corrected = grammar.getCorrectedText();
    if (!corrected) return;
    try {
      await navigator.clipboard.writeText(corrected);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [grammar]);

  const handleReset = () => {
    grammar.reset();
  };

  const handleModeSwitch = (mode: InputMode) => {
    setInputMode(mode);
    grammar.reset();
    if (mode === "text") {
      setExtractedText(null);
      fileUpload.reset();
    } else {
      setText("");
    }
  };

  const hasResult = grammar.stats !== null;

  return (
    <main className="min-h-screen relative">
      <div className="fixed inset-0 mesh-gradient pointer-events-none" />
      <Header />

      <div className="relative z-10 mx-auto max-w-2xl px-6 py-8">
        <div className="space-y-6">
          {/* Header */}
          <BlurFade delay={0.1} inView>
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 shadow-lg shadow-red-500/25 mb-4">
                <SpellCheck className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold mb-2 text-foreground">
                Проверка грамматики
              </h1>
              <p className="text-muted-foreground max-w-md mx-auto">
                Вставьте текст или загрузите файл — найдём орфографические, пунктуационные и стилистические ошибки
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
                    disabled={grammar.isChecking}
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
                    disabled={grammar.isChecking}
                  >
                    <Upload className="h-4 w-4" />
                    Файл
                  </button>
                </div>

                {/* Text input */}
                {inputMode === "text" && (
                  <div className="space-y-2">
                    <Label htmlFor="text">Текст для проверки</Label>
                    <Textarea
                      id="text"
                      placeholder="Вставьте текст, который нужно проверить на ошибки..."
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      rows={8}
                      maxLength={100000}
                      disabled={grammar.isChecking}
                    />
                    <p className="text-xs text-muted-foreground text-right">
                      {text.length.toLocaleString()}/100 000
                    </p>
                  </div>
                )}

                {/* File input */}
                {inputMode === "file" && (
                  <div className="space-y-2">
                    <Label>Загрузите документ</Label>
                    <FileUploadZone
                      label="Документ для проверки"
                      description="Загрузите .docx, .pdf или .txt файл"
                      acceptedTypes={TEXT_DOCUMENT_CONFIG.acceptedTypes}
                      acceptedExtensions={TEXT_DOCUMENT_CONFIG.acceptedExtensions}
                      uploadedFile={fileUpload.uploadedFile}
                      onFileSelect={fileUpload.handleFileSelect}
                      onFileRemove={() => {
                        fileUpload.handleFileRemove();
                        setExtractedText(null);
                      }}
                      disabled={grammar.isChecking || isExtracting}
                    />
                    {extractedText && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">
                        Текст извлечён ({extractedText.length.toLocaleString()} символов)
                      </p>
                    )}
                  </div>
                )}

                {/* Error */}
                {grammar.error && (
                  <p className="text-sm text-red-500">{grammar.error}</p>
                )}

                {/* Submit */}
                <div className="flex justify-center pt-2">
                  <ShimmerButton
                    onClick={handleCheck}
                    disabled={
                      grammar.isChecking ||
                      isExtracting ||
                      (inputMode === "text" ? !canCheck : !fileUpload.isValid)
                    }
                  >
                    {isExtracting ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Извлекаем текст...
                      </>
                    ) : grammar.isChecking ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Проверяем...
                      </>
                    ) : (
                      <>
                        <Search className="w-5 h-5 mr-2" />
                        Проверить текст
                      </>
                    )}
                  </ShimmerButton>
                </div>
              </CardContent>
            </Card>
          </BlurFade>

          {/* Statistics */}
          {hasResult && grammar.stats && (
            <BlurFade delay={0.1} inView>
              <GrammarStats stats={grammar.stats} />
            </BlurFade>
          )}

          {/* Result — highlighted text */}
          {hasResult && grammar.stats && grammar.stats.total > 0 && (
            <BlurFade delay={0.15} inView>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <SpellCheck className="w-5 h-5 text-red-500" />
                    Результат проверки
                  </CardTitle>
                  <CardDescription>
                    Нажмите на подсвеченное слово, чтобы увидеть подробности и варианты исправления
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <HighlightedText
                    text={grammar.checkedText}
                    errors={grammar.errors}
                  />

                  <div className="flex flex-wrap gap-2 justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyCorrected}
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4 mr-1" />
                          Скопировано
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 mr-1" />
                          Скопировать исправленный
                        </>
                      )}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleReset}
                    >
                      <RefreshCw className="w-4 h-4 mr-1" />
                      Проверить заново
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </BlurFade>
          )}

          {/* No errors state */}
          {hasResult && grammar.stats && grammar.stats.total === 0 && (
            <BlurFade delay={0.15} inView>
              <Card>
                <CardContent className="py-8 text-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500/10 mb-3">
                    <Check className="w-6 h-6 text-emerald-500" />
                  </div>
                  <p className="text-foreground font-medium mb-1">
                    Текст без ошибок!
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Мы не нашли орфографических, пунктуационных или стилистических ошибок
                  </p>
                </CardContent>
              </Card>
            </BlurFade>
          )}

          {/* CTA block */}
          {hasResult && (
            <BlurFade delay={0.2} inView>
              <Card className="border-red-500/20 bg-gradient-to-r from-red-500/5 to-rose-500/5">
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
