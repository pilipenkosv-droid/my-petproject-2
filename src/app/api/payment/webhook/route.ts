/**
 * POST /api/payment/webhook
 * Обработка вебхуков от Lava.top
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { activateAccess } from "@/lib/payment/access";

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
        await activateAccess(
          payment.user_id,
          payment.offer_type,
          payload.subscriptionId
        );

        console.log(`✅ Payment completed: ${payment.offer_type} for user ${payment.user_id}`);
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
        // Продление подписки — обновляем дату
        const subscriptionId = payload.subscriptionId;
        if (!subscriptionId) break;

        const { data: access } = await supabase
          .from("user_access")
          .select("*")
          .eq("lava_subscription_id", subscriptionId)
          .single();

        if (access) {
          const activeUntil = new Date();
          activeUntil.setDate(activeUntil.getDate() + 30);

          await supabase
            .from("user_access")
            .update({
              subscription_active_until: activeUntil.toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", access.id);

          console.log(`🔄 Subscription renewed for user ${access.user_id}`);
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
