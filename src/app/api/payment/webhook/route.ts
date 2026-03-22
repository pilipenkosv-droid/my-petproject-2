/**
 * POST /api/payment/webhook
 * Обработка вебхуков от Lava.top
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { activateAccess } from "@/lib/payment/access";
import { LAVA_CONFIG } from "@/lib/payment/config";
import { unlockFullVersion as unlockFullVersionFile } from "@/lib/storage/file-storage";
import { updateJob } from "@/lib/storage/job-store";
import { canGrantBotAccess, getUserProfile, provisionBotUser, storeBotAccess } from "@/lib/bot/provision";

interface LavaWebhookPayload {
  type: string;
  contractId?: string;
  invoiceId?: string;
  subscriptionId?: string;
  status?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/**
 * Проверяет Basic Auth от Lava.top webhook
 */
function verifyBasicAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Basic ")) return false;

  const expectedLogin = process.env.LAVA_WEBHOOK_LOGIN || "smartformat";
  const expectedPassword = process.env.LAVA_WEBHOOK_PASSWORD || "sf_webhook_2024";

  const decoded = Buffer.from(authHeader.slice(6), "base64").toString();
  const [login, password] = decoded.split(":");

  return login === expectedLogin && password === expectedPassword;
}

export async function POST(request: NextRequest) {
  try {
    // Верификация Basic Auth
    if (!verifyBasicAuth(request)) {
      console.error("Webhook Basic Auth verification failed");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rawBody = await request.text();
    const payload: LavaWebhookPayload = JSON.parse(rawBody);
    console.log(`📥 Lava.top webhook: ${payload.type}`, JSON.stringify(payload).substring(0, 200));

    const supabase = getSupabaseAdmin();

    switch (payload.type) {
      case "payment.success": {
        const invoiceId = payload.contractId || payload.invoiceId;
        if (!invoiceId) break;

        // Находим платёж в БД
        const { data: payment } = await supabase
          .from("payments")
          .select("*")
          .eq("lava_invoice_id", invoiceId)
          .single();

        if (!payment) {
          console.error(`Payment not found for invoice ${invoiceId}`);
          break;
        }

        // Обновляем статус платежа
        await supabase
          .from("payments")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", payment.id);

        // Активируем доступ
        const subId = payload.subscriptionId || payload.contractId || undefined;
        await activateAccess(
          payment.user_id,
          payment.offer_type,
          subId
        );

        // Если subscriptionId не был передан в activateAccess, но появился позже — допишем
        if (payment.offer_type === "subscription" && subId) {
          await supabase
            .from("user_access")
            .update({ lava_subscription_id: subId })
            .eq("user_id", payment.user_id)
            .is("lava_subscription_id", null);
        }

        // Если есть jobId для разблокировки — разблокируем полную версию
        if (payment.unlock_job_id) {
          try {
            const [unlockedOriginal, unlockedFormatted] = await Promise.all([
              unlockFullVersionFile(payment.unlock_job_id, "original"),
              unlockFullVersionFile(payment.unlock_job_id, "formatted"),
            ]);

            if (unlockedOriginal && unlockedFormatted) {
              // Убираем флаг hasFullVersion, т.к. теперь основные файлы — полные версии
              await updateJob(payment.unlock_job_id, { hasFullVersion: false });
              console.log(`🔓 Full version unlocked for job ${payment.unlock_job_id}`);
            } else {
              console.warn(`⚠️ Could not unlock full version for job ${payment.unlock_job_id}`);
            }
          } catch (unlockError) {
            console.error(`Failed to unlock job ${payment.unlock_job_id}:`, unlockError);
          }
        }

        console.log(`✅ Payment completed: ${payment.offer_type} for user ${payment.user_id}`);

        // Бот-провижнинг для подписчиков Pro (первые 10)
        if (payment.offer_type === "subscription") {
          try {
            const canGrant = await canGrantBotAccess(supabase);
            if (canGrant) {
              const profile = await getUserProfile(supabase, payment.user_id);
              if (profile) {
                const result = await provisionBotUser(profile.email, profile.name);
                if (result?.success) {
                  await storeBotAccess(supabase, payment.user_id, result.deepLink);
                  console.log(`🤖 Bot access granted for user ${payment.user_id} (existing: ${result.existing})`);
                }
              }
            }
          } catch (botError) {
            // Сбой бота не должен ломать оплату
            console.error("Bot provisioning failed (non-critical):", botError);
          }
        }

        break;
      }

      case "payment.failed": {
        const invoiceId = payload.contractId || payload.invoiceId;
        if (!invoiceId) break;

        await supabase
          .from("payments")
          .update({ status: "failed" })
          .eq("lava_invoice_id", invoiceId);

        console.log(`❌ Payment failed: invoice ${invoiceId}`);
        break;
      }

      case "subscription.recurring.payment.success": {
        // Продление подписки — обновляем дату и использования
        const subscriptionId = payload.subscriptionId;
        if (!subscriptionId) break;

        // Ищем по lava_subscription_id
        let { data: access } = await supabase
          .from("user_access")
          .select("*")
          .eq("lava_subscription_id", subscriptionId)
          .single();

        // Fallback: ищем по contractId через payments
        if (!access && payload.contractId) {
          const { data: payment } = await supabase
            .from("payments")
            .select("user_id")
            .eq("lava_invoice_id", payload.contractId)
            .single();

          if (payment) {
            const { data: fallbackAccess } = await supabase
              .from("user_access")
              .select("*")
              .eq("user_id", payment.user_id)
              .eq("access_type", "subscription")
              .single();

            if (fallbackAccess) {
              access = fallbackAccess;
              // Сохраняем subscriptionId для будущих рекуррентных платежей
              await supabase
                .from("user_access")
                .update({ lava_subscription_id: subscriptionId })
                .eq("id", fallbackAccess.id);
              console.log(`🔗 Linked subscription ${subscriptionId} to user ${payment.user_id}`);
            }
          }
        }

        if (access) {
          const activeUntil = new Date();
          activeUntil.setDate(activeUntil.getDate() + 30);

          await supabase
            .from("user_access")
            .update({
              subscription_active_until: activeUntil.toISOString(),
              remaining_uses: LAVA_CONFIG.offers.subscription.uses,
              updated_at: new Date().toISOString(),
            })
            .eq("id", access.id);

          console.log(`🔄 Subscription renewed for user ${access.user_id}`);
        } else {
          console.error(`user_access not found for subscription ${subscriptionId} — no fallback available`);
        }
        break;
      }

      case "subscription.cancelled": {
        const subscriptionId = payload.subscriptionId;
        if (!subscriptionId) break;

        // Не удаляем доступ сразу — он действует до конца оплаченного периода
        console.log(`🚫 Subscription cancelled: ${subscriptionId}`);
        break;
      }

      default:
        console.log(`Unhandled webhook type: ${payload.type}`);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    // Возвращаем 200 чтобы Lava.top не ретраила
    return NextResponse.json({ ok: true });
  }
}
