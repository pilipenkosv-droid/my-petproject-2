/**
 * GET /api/payment/check/[invoiceId]
 * Проверяет статус конкретного платежа (для поллинга на странице ожидания).
 * Если платёж всё ещё pending — дополнительно проверяет статус в Lava.top
 * и активирует доступ, если оплата прошла.
 */

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer, getSupabaseAdmin } from "@/lib/supabase/server";
import { getInvoiceStatus } from "@/lib/payment/lava-client";
import { activateAccess } from "@/lib/payment/access";
import { canGrantBotAccess, getUserProfile, provisionBotUser, storeBotAccess } from "@/lib/bot/provision";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json(
        { error: "Необходимо авторизоваться" },
        { status: 401 }
      );
    }

    const { invoiceId } = await params;

    const admin = getSupabaseAdmin();
    const { data: payment } = await admin
      .from("payments")
      .select("id, status, offer_type, user_id")
      .eq("lava_invoice_id", invoiceId)
      .eq("user_id", user.id)
      .single();

    if (!payment) {
      return NextResponse.json(
        { error: "Платёж не найден" },
        { status: 404 }
      );
    }

    // Если платёж ещё pending — проверяем напрямую в Lava.top
    if (payment.status === "pending") {
      try {
        const lavaStatus = await getInvoiceStatus(invoiceId);

        if (lavaStatus.status === "COMPLETED") {
          await admin
            .from("payments")
            .update({
              status: "completed",
              completed_at: new Date().toISOString(),
            })
            .eq("id", payment.id);

          await activateAccess(payment.user_id, payment.offer_type);

          console.log(`✅ Payment verified via API: ${payment.offer_type} for user ${payment.user_id}`);

          // Бот-провижнинг для подписчиков Pro Plus (первые 10)
          let botDeepLink: string | null = null;
          if (payment.offer_type === "subscription_plus") {
            try {
              const canGrant = await canGrantBotAccess(admin);
              if (canGrant) {
                const profile = await getUserProfile(admin, payment.user_id);
                if (profile) {
                  const result = await provisionBotUser(profile.email, profile.name);
                  if (result?.success) {
                    await storeBotAccess(admin, payment.user_id, result.deepLink);
                    botDeepLink = result.deepLink;
                    console.log(`🤖 Bot access granted for user ${payment.user_id}`);
                  }
                }
              }
            } catch (botError) {
              console.error("Bot provisioning failed (non-critical):", botError);
            }
          }

          return NextResponse.json({
            status: "completed",
            offerType: payment.offer_type,
            botDeepLink,
          });
        }

        if (lavaStatus.status === "FAILED") {
          await admin
            .from("payments")
            .update({ status: "failed" })
            .eq("id", payment.id);

          return NextResponse.json({
            status: "failed",
            offerType: payment.offer_type,
          });
        }
      } catch (err) {
        console.error("Lava.top status check error:", err);
      }
    }

    return NextResponse.json({
      status: payment.status,
      offerType: payment.offer_type,
    });
  } catch (error) {
    console.error("Payment check error:", error);
    return NextResponse.json(
      { error: "Ошибка проверки статуса" },
      { status: 500 }
    );
  }
}
