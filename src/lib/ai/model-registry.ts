/**
 * Реестр AI-моделей с конфигурацией и лимитами
 *
 * Каждая модель описывает провайдера, модельный ID, лимиты и
 * способ вызова (gemini-native или openai-compatible).
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
 * Порядок priority определяет предпочтение при прочих равных.
 */
export const MODEL_REGISTRY: ModelConfig[] = [
  // ── Google Gemini (бесплатный, но жёсткий RPD лимит) ──
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

  // ── AITUNNEL Gemini Flash Lite (платный, надёжный, ~19₽/1M input) ──
  {
    id: "aitunnel-gemini-flash-lite",
    displayName: "AITUNNEL Gemini Flash Lite",
    protocol: "openai-compatible",
    apiKeyEnv: "AITUNNEL_API_KEY",
    modelId: "gemini-2.5-flash-lite",
    baseUrl: "https://api.aitunnel.ru/v1",
    limits: { rpm: 60, rpd: 10_000, tpm: 1_000_000 },
    supportsJsonMode: true,
    priority: 2,
  },

  // ── AITUNNEL Llama 3.3 70B (платный, надёжный, ~23₽/1M input) ──
  {
    id: "aitunnel-llama-3.3-70b",
    displayName: "AITUNNEL Llama 3.3 70B",
    protocol: "openai-compatible",
    apiKeyEnv: "AITUNNEL_API_KEY",
    modelId: "llama-3.3-70b-instruct",
    baseUrl: "https://api.aitunnel.ru/v1",
    limits: { rpm: 60, rpd: 10_000, tpm: 1_000_000 },
    supportsJsonMode: true,
    priority: 3,
  },

  // ── Cerebras Qwen 235B — бесплатный, но ~59% success rate ──
  {
    id: "cerebras-qwen-3-235b",
    displayName: "Cerebras Qwen 3 235B",
    protocol: "openai-compatible",
    apiKeyEnv: "CEREBRAS_API_KEY",
    modelId: "qwen-3-235b-a22b-instruct-2507",
    baseUrl: "https://api.cerebras.ai/v1",
    limits: { rpm: 30, rpd: 200, tpm: 60_000 },
    supportsJsonMode: true,
    priority: 8,
  },

  // ── Cerebras Llama 8B (аварийный fallback — слабая модель) ──
  {
    id: "cerebras-llama-3.1-8b",
    displayName: "Cerebras Llama 3.1 8B",
    protocol: "openai-compatible",
    apiKeyEnv: "CEREBRAS_API_KEY",
    modelId: "llama3.1-8b",
    baseUrl: "https://api.cerebras.ai/v1",
    limits: { rpm: 30, rpd: 1000, tpm: 60_000 },
    supportsJsonMode: true,
    priority: 10,
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
