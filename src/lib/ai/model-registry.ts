/**
 * Реестр AI-моделей с конфигурацией и лимитами
 *
 * Каждая модель описывает провайдера, модельный ID, лимиты и
 * способ вызова (gemini-native или openai-compatible).
 *
 * Только Gemini 2.5 Flash (полный) — Flash Lite даёт слабую разметку
 * (5 vs 30 bibliography, 26 vs 40 captions, 17 ложных H4).
 */

export type ModelProtocol = "gemini" | "openai-compatible" | "anthropic";

export interface ModelConfig {
  /** Уникальный ID в нашей системе */
  id: string;
  /** Название для логов */
  displayName: string;
  /** Протокол вызова */
  protocol: ModelProtocol;
  /** ENV-переменная с API-ключом */
  apiKeyEnv: string;
  /** ID модели у провайдера */
  modelId: string;
  /** Base URL для openai-compatible провайдеров */
  baseUrl?: string;
  /** Лимиты */
  limits: {
    /** Запросов в минуту */
    rpm: number;
    /** Запросов в сутки */
    rpd: number;
    /** Токенов в минуту */
    tpm: number;
  };
  /** Поддерживает ли native JSON mode */
  supportsJsonMode: boolean;
  /** Приоритет (меньше = выше приоритет) */
  priority: number;
  /** Дополнительные параметры генерации */
  extraParams?: Record<string, unknown>;
}

/**
 * Все поддерживаемые модели.
 *
 * Ротация: Vercel (primary) → AITUNNEL (fallback).
 * Обе используют Gemini 2.5 Flash (полный) — единственная модель,
 * прошедшая quality bench с 0% unknown.
 */
export const MODEL_REGISTRY: ModelConfig[] = [
  // ── Vercel AI Gateway — Gemini 2.5 Flash (primary, прод) ──
  {
    id: "vercel-gemini-flash",
    displayName: "Vercel Gemini 2.5 Flash",
    protocol: "openai-compatible",
    apiKeyEnv: "AI_GATEWAY_API_KEY",
    modelId: "google/gemini-2.5-flash",
    baseUrl: "https://ai-gateway.vercel.sh/v1",
    limits: { rpm: 60, rpd: 10_000, tpm: 1_000_000 },
    supportsJsonMode: true,
    priority: 1,
    extraParams: {
      // Корректный синтаксис для AI Gateway (подтверждён поддержкой Vercel 2026-04-20).
      // Раньше был thinking.budget_tokens — не уважался, reasoning достигал 7865 токенов
      // и latency p50 росла до 13с, обрубаясь нашим timeout.
      providerOptions: {
        google: { thinkingBudget: 1024 },
        vertex: { thinkingBudget: 1024 },
      },
    },
  },

  // ── AITUNNEL отключён 2026-04-20: баланс исчерпан, не используем ──
  // Конфиг сохранён закомментированным для возможного возврата в будущем.
  // {
  //   id: "aitunnel-gemini-flash",
  //   displayName: "AITUNNEL Gemini 2.5 Flash",
  //   protocol: "openai-compatible",
  //   apiKeyEnv: "AITUNNEL_API_KEY",
  //   modelId: "gemini-2.5-flash",
  //   baseUrl: "https://api.aitunnel.ru/v1",
  //   limits: { rpm: 60, rpd: 10_000, tpm: 1_000_000 },
  //   supportsJsonMode: true,
  //   priority: 2,
  //   extraParams: {
  //     providerOptions: {
  //       google: { thinkingBudget: 1024 },
  //       vertex: { thinkingBudget: 1024 },
  //     },
  //   },
  // },

  // ── Google AI — Gemini 2.5 Flash (native, бесплатный лимит) ──
  {
    id: "google-gemini-flash",
    displayName: "Google Gemini 2.5 Flash",
    protocol: "gemini",
    apiKeyEnv: "GEMINI_API_KEY",
    modelId: "gemini-2.5-flash",
    limits: { rpm: 15, rpd: 1_500, tpm: 250_000 },
    supportsJsonMode: true,
    priority: 3,
  },
];

/**
 * Получить модели, для которых настроены API-ключи
 */
export function getAvailableModels(): ModelConfig[] {
  return MODEL_REGISTRY.filter((m) => {
    const key = process.env[m.apiKeyEnv];
    return key && key.trim().length > 0;
  }).sort((a, b) => a.priority - b.priority);
}
