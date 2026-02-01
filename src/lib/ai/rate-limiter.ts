/**
 * Rate limiter для AI-моделей — Supabase PostgreSQL
 *
 * Отслеживает использование каждой модели (RPM и RPD).
 * Состояние хранится в Supabase PostgreSQL для устойчивости на Vercel serverless.
 */

import { getSupabaseAdmin } from "@/lib/supabase/server";

interface ModelUsage {
  minuteRequests: number;
  minuteStart: number;
  dayRequests: number;
  dayStart: number;
  lastRequestAt: number;
}

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

/**
 * Загрузить usage из БД (или создать новую запись)
 */
async function loadUsage(modelId: string): Promise<ModelUsage> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("rate_limits")
    .select("*")
    .eq("model_id", modelId)
    .single();

  if (error || !data) {
    return {
      minuteRequests: 0,
      minuteStart: getMinuteStart(),
      dayRequests: 0,
      dayStart: getDayStart(),
      lastRequestAt: 0,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = data as any;
  return {
    minuteRequests: row.minute_requests as number,
    minuteStart: row.minute_start as number,
    dayRequests: row.day_requests as number,
    dayStart: row.day_start as number,
    lastRequestAt: row.last_request_at as number,
  };
}

/**
 * Сохранить usage в БД (upsert)
 */
async function saveUsage(modelId: string, usage: ModelUsage): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("rate_limits").upsert(
    {
      model_id: modelId,
      minute_requests: usage.minuteRequests,
      minute_start: usage.minuteStart,
      day_requests: usage.dayRequests,
      day_start: usage.dayStart,
      last_request_at: usage.lastRequestAt,
    },
    { onConflict: "model_id" }
  );

  if (error) {
    console.error(
      `[rate-limiter] Failed to persist usage for ${modelId}:`,
      error
    );
  }
}

/**
 * Сбрасывает счётчики если прошла минута / день
 */
function resetIfNeeded(usage: ModelUsage): ModelUsage {
  const nowMinute = getMinuteStart();
  const nowDay = getDayStart();

  const updated = { ...usage };

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
 * Помечает модель как «сломанную» до конца текущей минуты.
 * Устанавливает minuteRequests = 100 (достаточно чтобы превысить любой RPM лимит,
 * но автоматически сбросится при следующей минуте через resetIfNeeded).
 */
export async function markModelFailed(modelId: string): Promise<void> {
  const raw = await loadUsage(modelId);
  const usage = resetIfNeeded(raw);

  usage.minuteRequests = 100;
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
