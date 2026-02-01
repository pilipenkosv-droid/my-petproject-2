/**
 * Реестр AI-моделей с конфигурацией и лимитами
 *
 * Каждая модель описывает провайдера, модельный ID, лимиты и
 * способ вызова (gemini-native или openai-compatible).
 */

export type ModelProtocol = "gemini" | "openai-compatible";

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
 * Порядок priority определяет предпочтение при прочих равных.
 */
export const MODEL_REGISTRY: ModelConfig[] = [
  // ── Google Gemini (3 модели × 20 RPD = 60 RPD) ──
  {
    id: "gemini-2.5-flash-lite",
    displayName: "Gemini 2.5 Flash Lite",
    protocol: "gemini",
    apiKeyEnv: "GEMINI_API_KEY",
    modelId: "gemini-2.5-flash-lite",
    limits: { rpm: 10, rpd: 20, tpm: 250_000 },
    supportsJsonMode: true,
    priority: 1,
  },
  {
    id: "gemini-2.5-flash",
    displayName: "Gemini 2.5 Flash",
    protocol: "gemini",
    apiKeyEnv: "GEMINI_API_KEY",
    modelId: "gemini-2.5-flash",
    limits: { rpm: 5, rpd: 20, tpm: 250_000 },
    supportsJsonMode: true,
    priority: 2,
  },
  // ── Groq (Llama через OpenAI-compatible API) ──
  {
    id: "groq-llama-3.3-70b",
    displayName: "Groq Llama 3.3 70B",
    protocol: "openai-compatible",
    apiKeyEnv: "GROQ_API_KEY",
    modelId: "llama-3.3-70b-versatile",
    baseUrl: "https://api.groq.com/openai/v1",
    limits: { rpm: 30, rpd: 14400, tpm: 6000 },
    supportsJsonMode: true,
    priority: 4,
  },
  {
    id: "groq-llama-3.1-8b",
    displayName: "Groq Llama 3.1 8B",
    protocol: "openai-compatible",
    apiKeyEnv: "GROQ_API_KEY",
    modelId: "llama-3.1-8b-instant",
    baseUrl: "https://api.groq.com/openai/v1",
    limits: { rpm: 30, rpd: 14400, tpm: 6000 },
    supportsJsonMode: true,
    priority: 10, // менее качественная, используем как запасную
  },

  // ── OpenRouter (бесплатные модели) ──
  {
    id: "openrouter-llama-3.1-8b",
    displayName: "OpenRouter Llama 3.1 8B",
    protocol: "openai-compatible",
    apiKeyEnv: "OPENROUTER_API_KEY",
    modelId: "meta-llama/llama-3.1-8b-instruct:free",
    baseUrl: "https://openrouter.ai/api/v1",
    limits: { rpm: 20, rpd: 200, tpm: 100_000 },
    supportsJsonMode: true,
    priority: 8,
    extraParams: {
      headers: {
        "HTTP-Referer": "https://sformat.online",
        "X-Title": "SmartFormat",
      },
    },
  },
  {
    id: "openrouter-gemma-2-9b",
    displayName: "OpenRouter Gemma 2 9B",
    protocol: "openai-compatible",
    apiKeyEnv: "OPENROUTER_API_KEY",
    modelId: "google/gemma-2-9b-it:free",
    baseUrl: "https://openrouter.ai/api/v1",
    limits: { rpm: 20, rpd: 200, tpm: 100_000 },
    supportsJsonMode: true,
    priority: 9,
    extraParams: {
      headers: {
        "HTTP-Referer": "https://sformat.online",
        "X-Title": "SmartFormat",
      },
    },
  },

  // ── Cerebras ──
  {
    id: "cerebras-llama-3.3-70b",
    displayName: "Cerebras Llama 3.3 70B",
    protocol: "openai-compatible",
    apiKeyEnv: "CEREBRAS_API_KEY",
    modelId: "llama-3.3-70b",
    baseUrl: "https://api.cerebras.ai/v1",
    limits: { rpm: 30, rpd: 1000, tpm: 60_000 },
    supportsJsonMode: true,
    priority: 5,
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
