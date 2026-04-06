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
  /** Количество ошибок подряд (сбрасывается при успехе) */
  consecutiveErrors: number;
  /** Timestamp до которого модель заблокирована после ошибок */
  blockedUntil: number;
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
      consecutiveErrors: 0,
      blockedUntil: 0,
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
    consecutiveErrors: (row.consecutive_errors as number) ?? 0,
    blockedUntil: (row.blocked_until as number) ?? 0,
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
      consecutive_errors: usage.consecutiveErrors,
      blocked_until: usage.blockedUntil,
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

  // Модель временно заблокирована после ошибок
  if (usage.blockedUntil > Date.now()) {
    return false;
  }

  return usage.minuteRequests < rpm && usage.dayRequests < rpd;
}

/**
 * Регистрирует успешное использование модели
 */
export async function recordUsage(modelId: string): Promise<void> {
  const raw = await loadUsage(modelId);
  const usage = resetIfNeeded(raw);

  usage.minuteRequests++;
  usage.dayRequests++;
  usage.lastRequestAt = Date.now();
  // Успех — сбрасываем счётчик ошибок
  usage.consecutiveErrors = 0;
  usage.blockedUntil = 0;

  await saveUsage(modelId, usage);
}

/** Время блокировки после ошибок (экспоненциальный backoff) */
const BLOCK_DURATIONS_MS = [
  0,       // 1 ошибка — не блокируем, дадим шанс
  15_000,  // 2 ошибки подряд — 15 сек
  30_000,  // 3 ошибки — 30 сек
  60_000,  // 4+ ошибки — 1 мин
];

/**
 * Помечает модель как временно нерабочую.
 * Блокировка зависит от количества ошибок подряд (exponential backoff).
 * Сбрасывается при первом успешном вызове (recordUsage).
 */
export async function markModelFailed(modelId: string): Promise<void> {
  const raw = await loadUsage(modelId);
  const usage = resetIfNeeded(raw);

  usage.consecutiveErrors++;
  usage.lastRequestAt = Date.now();

  const durationIndex = Math.min(usage.consecutiveErrors, BLOCK_DURATIONS_MS.length - 1);
  const blockDuration = BLOCK_DURATIONS_MS[durationIndex];

  if (blockDuration > 0) {
    usage.blockedUntil = Date.now() + blockDuration;
  }

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

// ── AI Usage Daily Logging ──

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Записывает успешный запрос в ai_usage_daily
 */
export async function logDailySuccess(modelId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const today = getTodayDate();

  const { error } = await supabase.rpc("increment_ai_usage", {
    p_model_id: modelId,
    p_date: today,
    p_total: 1,
    p_success: 1,
    p_failed: 0,
  });

  if (error) {
    // Fallback: upsert напрямую если RPC не существует
    await upsertDailyUsage(supabase, modelId, today, 1, 1, 0);
  }
}

/**
 * Записывает неуспешный запрос в ai_usage_daily
 */
export async function logDailyFailure(modelId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const today = getTodayDate();

  const { error } = await supabase.rpc("increment_ai_usage", {
    p_model_id: modelId,
    p_date: today,
    p_total: 1,
    p_success: 0,
    p_failed: 1,
  });

  if (error) {
    await upsertDailyUsage(supabase, modelId, today, 1, 0, 1);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertDailyUsage(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  modelId: string,
  date: string,
  total: number,
  success: number,
  failed: number,
): Promise<void> {
  // Пробуем вставить новую запись
  const { error: insertError } = await supabase
    .from("ai_usage_daily")
    .insert({
      model_id: modelId,
      date,
      total_requests: total,
      successful_requests: success,
      failed_requests: failed,
    });

  if (insertError?.code === "23505") {
    // Уже есть запись за сегодня — обновляем инкрементально
    const { data } = await supabase
      .from("ai_usage_daily")
      .select("total_requests, successful_requests, failed_requests")
      .eq("model_id", modelId)
      .eq("date", date)
      .single();

    if (data) {
      await supabase
        .from("ai_usage_daily")
        .update({
          total_requests: (data.total_requests ?? 0) + total,
          successful_requests: (data.successful_requests ?? 0) + success,
          failed_requests: (data.failed_requests ?? 0) + failed,
        })
        .eq("model_id", modelId)
        .eq("date", date);
    }
  } else if (insertError) {
    console.error("[ai-usage-daily] Failed to log:", insertError);
  }
}
