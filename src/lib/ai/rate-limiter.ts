/**
 * Rate limiter для AI-моделей
 *
 * Отслеживает использование каждой модели (RPM и RPD).
 * Состояние хранится в памяти + на диске (/tmp) для устойчивости на Vercel.
 */

import { promises as fs } from "fs";
import path from "path";

const isProduction = process.env.NODE_ENV === "production";
const LIMITER_DIR = isProduction
  ? "/tmp/smartformat/rate-limits"
  : "./uploads/rate-limits";

interface ModelUsage {
  /** Запросы за текущую минуту */
  minuteRequests: number;
  /** Начало текущей минуты (timestamp) */
  minuteStart: number;
  /** Запросы за текущий день */
  dayRequests: number;
  /** Начало текущего дня (timestamp, полночь UTC) */
  dayStart: number;
  /** Время последнего запроса */
  lastRequestAt: number;
}

// In-memory cache
const usageCache = new Map<string, ModelUsage>();

function getDayStart(): number {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  ).getTime();
}

function getMinuteStart(): number {
  const now = Date.now();
  return now - (now % 60_000);
}

function usageFilePath(modelId: string): string {
  return path.join(LIMITER_DIR, `${modelId}.json`);
}

async function loadUsage(modelId: string): Promise<ModelUsage> {
  // Проверяем кэш
  const cached = usageCache.get(modelId);
  if (cached) return cached;

  // Пробуем с диска
  try {
    const raw = await fs.readFile(usageFilePath(modelId), "utf-8");
    const data = JSON.parse(raw) as ModelUsage;
    usageCache.set(modelId, data);
    return data;
  } catch {
    // Нет файла — создаём чистое состояние
    const fresh: ModelUsage = {
      minuteRequests: 0,
      minuteStart: getMinuteStart(),
      dayRequests: 0,
      dayStart: getDayStart(),
      lastRequestAt: 0,
    };
    usageCache.set(modelId, fresh);
    return fresh;
  }
}

async function saveUsage(modelId: string, usage: ModelUsage): Promise<void> {
  usageCache.set(modelId, usage);
  try {
    await fs.mkdir(LIMITER_DIR, { recursive: true });
    await fs.writeFile(usageFilePath(modelId), JSON.stringify(usage), "utf-8");
  } catch (err) {
    console.error(`[rate-limiter] Failed to persist usage for ${modelId}:`, err);
  }
}

/**
 * Сбрасывает счётчики если прошла минута / день
 */
function resetIfNeeded(usage: ModelUsage): ModelUsage {
  const nowMinute = getMinuteStart();
  const nowDay = getDayStart();

  let updated = { ...usage };

  if (updated.minuteStart < nowMinute) {
    updated.minuteRequests = 0;
    updated.minuteStart = nowMinute;
  }

  if (updated.dayStart < nowDay) {
    updated.dayRequests = 0;
    updated.dayStart = nowDay;
  }

  return updated;
}

/**
 * Проверяет, можно ли отправить запрос к модели
 */
export async function canUseModel(
  modelId: string,
  rpm: number,
  rpd: number
): Promise<boolean> {
  const raw = await loadUsage(modelId);
  const usage = resetIfNeeded(raw);

  // Обновляем кэш со сброшенными счётчиками
  if (usage !== raw) {
    usageCache.set(modelId, usage);
  }

  return usage.minuteRequests < rpm && usage.dayRequests < rpd;
}

/**
 * Регистрирует использование модели
 */
export async function recordUsage(modelId: string): Promise<void> {
  const raw = await loadUsage(modelId);
  const usage = resetIfNeeded(raw);

  usage.minuteRequests++;
  usage.dayRequests++;
  usage.lastRequestAt = Date.now();

  await saveUsage(modelId, usage);
}

/**
 * Помечает модель как «сломанную» на 5 минут (429, 500, etc.)
 * Реализуется через исчерпание минутного лимита
 */
export async function markModelFailed(modelId: string): Promise<void> {
  const raw = await loadUsage(modelId);
  const usage = resetIfNeeded(raw);

  // Ставим минутный счётчик на максимум — модель не будет выбрана до сброса
  usage.minuteRequests = 999;
  usage.lastRequestAt = Date.now();

  await saveUsage(modelId, usage);
}

/**
 * Получить текущее использование (для отладки / логов)
 */
export async function getUsageStats(
  modelId: string
): Promise<{ minuteUsed: number; dayUsed: number }> {
  const raw = await loadUsage(modelId);
  const usage = resetIfNeeded(raw);
  return { minuteUsed: usage.minuteRequests, dayUsed: usage.dayRequests };
}
