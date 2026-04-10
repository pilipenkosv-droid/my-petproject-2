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
  // ── Google Gemini ──
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

  // ── Cerebras Qwen 235B — лучший баланс качества/скорости, 60K TPM ──
  {
    id: "cerebras-qwen-3-235b",
    displayName: "Cerebras Qwen 3 235B",
    protocol: "openai-compatible",
    apiKeyEnv: "CEREBRAS_API_KEY",
    modelId: "qwen-3-235b-a22b-instruct-2507",
    baseUrl: "https://api.cerebras.ai/v1",
    limits: { rpm: 30, rpd: 200, tpm: 60_000 },
    supportsJsonMode: true,
    priority: 3,
  },

  // ── OpenRouter GPT-OSS 120B — подтверждён тестом и продом ──
  {
    id: "openrouter-gpt-oss-120b",
    displayName: "OpenRouter GPT-OSS 120B",
    protocol: "openai-compatible",
    apiKeyEnv: "OPENROUTER_API_KEY",
    modelId: "openai/gpt-oss-120b:free",
    baseUrl: "https://openrouter.ai/api/v1",
    limits: { rpm: 20, rpd: 200, tpm: 100_000 },
    supportsJsonMode: true,
    priority: 5,
    extraParams: {
      headers: {
        "HTTP-Referer": "https://diplox.online",
        "X-Title": "Diplox",
      },
    },
  },

  // ── Groq Llama 70B — качественная, но жёсткий TPM лимит (6K) ──
  {
    id: "groq-llama-3.3-70b",
    displayName: "Groq Llama 3.3 70B",
    protocol: "openai-compatible",
    apiKeyEnv: "GROQ_API_KEY",
    modelId: "llama-3.3-70b-versatile",
    baseUrl: "https://api.groq.com/openai/v1",
    limits: { rpm: 30, rpd: 14400, tpm: 6000 },
    supportsJsonMode: true,
    priority: 7,
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
