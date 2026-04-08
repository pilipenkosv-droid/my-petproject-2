/**
 * Ядро lifecycle-рассылок: дедупликация, отписка, отправка
 */

import { getSupabaseAdmin } from "@/lib/supabase/server";
import { sendEmail } from "./transport";
import { createHmac } from "crypto";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://diplox.online";
const HMAC_SECRET = process.env.CRON_SECRET || "default-secret";

export type EmailType =
  | "activation_24h"
  | "share_nudge"
  | "subscription_upsell"
  | "reactivation_14d"
  | "csat_low"
  | "csat_high"
  | "marathon_blast"
  | "payment_abandoned_30m";

/**
 * Проверяет, было ли уже отправлено письмо данного типа пользователю
 */
export async function hasEmailBeenSent(
  userId: string,
  emailType: EmailType,
  jobId?: string
): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("email_sent_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("email_type", emailType);

  if (jobId) {
    query = query.eq("job_id", jobId);
  } else {
    query = query.is("job_id", null);
  }

  const { count } = await query;
  return (count ?? 0) > 0;
}

/**
 * Записывает факт отправки письма (catch unique constraint)
 */
export async function recordEmailSent(
  userId: string,
  emailType: EmailType,
  jobId?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("email_sent_log").insert({
    user_id: userId,
    email_type: emailType,
    job_id: jobId || null,
    metadata: metadata || null,
  });

  // 23505 = unique_violation — уже отправлено, это ок
  if (error && error.code !== "23505") {
    console.error(`[lifecycle] Failed to record email: ${error.message}`);
  }
}

/**
 * Проверяет, отписался ли пользователь от данного типа писем
 */
export async function isUserUnsubscribed(
  userId: string,
  emailType: EmailType
): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  const { data } = await supabase
    .from("user_profiles")
    .select("email_unsubscribed_types")
    .eq("user_id", userId)
    .single();

  if (!data?.email_unsubscribed_types) return false;

  const types = data.email_unsubscribed_types as string[];
  return types.includes("all") || types.includes(emailType);
}

export interface LifecycleEmailParams {
  userId: string;
  email: string;
  emailType: EmailType;
  jobId?: string;
  subject: string;
  html: string;
  metadata?: Record<string, unknown>;
}

/**
 * Обёртка: unsubscribe check → dedup check → send → record
 */
export async function sendLifecycleEmail(params: LifecycleEmailParams): Promise<boolean> {
  const { userId, email, emailType, jobId, subject, html, metadata } = params;

  // Проверяем отписку
  if (await isUserUnsubscribed(userId, emailType)) {
    return false;
  }

  // Проверяем дедупликацию
  if (await hasEmailBeenSent(userId, emailType, jobId)) {
    return false;
  }

  // Отправляем
  await sendEmail({ to: email, subject, html });

  // Записываем
  await recordEmailSent(userId, emailType, jobId, metadata);

  return true;
}

/**
 * Генерирует HMAC-токен для ссылки отписки
 */
export function generateUnsubscribeToken(userId: string, emailType: string): string {
  return createHmac("sha256", HMAC_SECRET)
    .update(`${userId}:${emailType}`)
    .digest("hex");
}

/**
 * Проверяет HMAC-токен отписки
 */
export function verifyUnsubscribeToken(userId: string, emailType: string, token: string): boolean {
  const expected = generateUnsubscribeToken(userId, emailType);
  return token === expected;
}

/**
 * Возвращает URL отписки для вставки в email
 */
export function getUnsubscribeUrl(userId: string, emailType: EmailType): string {
  const token = generateUnsubscribeToken(userId, emailType);
  return `${SITE_URL}/api/email/unsubscribe?uid=${userId}&type=${emailType}&token=${token}`;
}

/**
 * Добавляет footer с ссылкой отписки к HTML письма
 */
export function appendUnsubscribeFooter(html: string, userId: string, emailType: EmailType): string {
  const url = getUnsubscribeUrl(userId, emailType);

  const footer = `
    <tr>
      <td style="padding:12px 32px;text-align:center;">
        <a href="${url}" style="font-size:10px;color:#cccccc;text-decoration:underline;">
          Отписаться от этих уведомлений
        </a>
      </td>
    </tr>`;

  // Вставляем перед закрывающим </table> footer
  return html.replace(
    /(<\/table>\s*<\/td>\s*<\/tr>\s*<\/table>\s*<\/body>)/,
    `${footer}$1`
  );
}

/**
 * Определяет текущий сезон для контекстных писем
 */
export function getCurrentSeason(): "spring" | "fall" | "general" {
  const month = new Date().getMonth(); // 0-indexed
  if (month >= 3 && month <= 5) return "spring"; // апрель-июнь
  if (month >= 8 && month <= 10) return "fall";   // сентябрь-ноябрь
  return "general";
}

/**
 * Считает дни до ближайшего дедлайна сессии
 */
export function getDaysUntilDeadline(): number | null {
  const now = new Date();
  const year = now.getFullYear();
  const season = getCurrentSeason();

  if (season === "spring") {
    const deadline = new Date(year, 5, 15); // 15 июня
    return Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  }
  if (season === "fall") {
    const deadline = new Date(year + 1, 0, 15); // 15 января следующего года
    return Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  }
  return null;
}
