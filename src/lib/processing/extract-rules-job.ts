/**
 * Разбор методички — общая логика роута и воркера.
 *
 * Модуль не импортирует next/*: его исполняет и /api/extract-rules (инлайн),
 * и внешний воркер на обычном Node (ADR-016, фаза 2).
 */

import { extractText } from "@/lib/pipeline/text-extractor";
import {
  parseFormattingRules,
  mergeWithDefaults,
  type RulesExtractionResult,
} from "@/lib/ai/provider";
import { warmupModels } from "@/lib/ai/gateway";
import { updateJob, updateJobProgress } from "@/lib/storage/job-store";
import type { DocumentStatistics, FormattingRules } from "@/types/formatting-rules";
import type { ProgressReporter } from "./gost-job";

/** Текста в методичке меньше, чем нужно AI: разбирать нечего. */
export class RequirementsTooShortError extends Error {
  constructor() {
    super("Документ с требованиями слишком короткий или пустой");
    this.name = "RequirementsTooShortError";
  }
}

export interface ExtractRulesJobResult {
  rules: FormattingRules;
  confidence: number;
  warnings: string[];
  missingRules: string[];
}

export interface ExtractRulesJobOptions {
  /** Абсолютный дедлайн AI-вызова (Date.now() + бюджет). */
  deadline: number;
  onProgress?: ProgressReporter;
}

/**
 * Документ ещё не анализировался: в statistics пока только метаданные
 * извлечения — по ним в БД видно, чьи правила применились. Полную
 * статистику допишет confirm-rules, сохранив эти поля.
 */
function extractionStatistics(response: RulesExtractionResult): DocumentStatistics {
  return {
    rulesConfidence: response.confidence,
    rulesSource: "методичка",
    rulesNormalized: response.normalized,
    rulesDroppedChars: response.droppedChars,
    rulesSchemaMode: response.schemaMode,
    rulesRetrieval: response.retrieval,
    rulesProvenance: response.provenance,
  } as Partial<DocumentStatistics> as DocumentStatistics;
}

/** Текст методички + прогрев моделей: оба нужны до AI-вызова. */
async function extractRequirementsText(
  requirementsBuffer: Buffer,
  requirementsMimeType: string
): Promise<string> {
  const [requirementsText, warmup] = await Promise.all([
    extractText(requirementsBuffer, requirementsMimeType),
    warmupModels().catch((err) => {
      console.warn("[extract-rules] Warmup failed, proceeding anyway:", err);
      return { total: 0, alive: [] as string[], dead: [] as string[] };
    }),
  ]);

  // Warmup информационный — логируем, но НЕ блокируем
  if (warmup.alive.length === 0 && warmup.total > 0) {
    console.warn("[extract-rules] Warmup: no providers responded to ping, but will try AI call anyway");
  }

  if (!requirementsText || requirementsText.trim().length < 50) {
    throw new RequirementsTooShortError();
  }

  return requirementsText;
}

export async function processExtractRulesJob(
  jobId: string,
  requirementsBuffer: Buffer,
  requirementsMimeType: string,
  options: ExtractRulesJobOptions
): Promise<ExtractRulesJobResult> {
  const report: ProgressReporter =
    options.onProgress ??
    (async (status, progress, message) => {
      await updateJobProgress(jobId, status, progress, message);
    });

  await report("extracting_text", 20, "Извлечение текста из методички");
  const requirementsText = await extractRequirementsText(
    requirementsBuffer,
    requirementsMimeType
  );

  await report("parsing_rules", 50, "Анализ требований форматирования с помощью AI");

  const aiResponse = await parseFormattingRules(requirementsText, {
    deadline: options.deadline,
  });
  const rules = mergeWithDefaults(aiResponse.rules);

  await updateJob(jobId, {
    status: "awaiting_confirmation",
    progress: 100,
    statusMessage: "Правила извлечены, ожидается подтверждение",
    rules,
    guidelinesText: requirementsText,
    statistics: extractionStatistics(aiResponse),
  });

  return {
    rules,
    confidence: aiResponse.confidence,
    warnings: aiResponse.warnings,
    missingRules: aiResponse.missingRules,
  };
}
