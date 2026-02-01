/**
 * POST /api/payment/verify
 * Проверяет все pending-платежи пользователя через Lava.top API
 * и активирует доступ для завершённых.
 */

import { NextResponse } from "next/server";
import { createSupabaseServer, getSupabaseAdmin } from "@/lib/supabase/server";
import { getInvoiceStatus } from "@/lib/payment/lava-client";
import { activateAccess } from "@/lib/payment/access";

export async function POST() {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json(
        { error: "Необходимо авторизоваться" },
        { status: 401 }
      );
    }

    const admin = getSupabaseAdmin();
    const { data: pendingPayments } = await admin
      .from("payments")
      .select("id, lava_invoice_id, offer_type, user_id")
      .eq("user_id", user.id)
      .eq("status", "pending");

    if (!pendingPayments || pendingPayments.length === 0) {
      return NextResponse.json({ verified: 0, message: "Нет ожидающих платежей" });
    }

    let verified = 0;

    for (const payment of pendingPayments) {
      try {
        const lavaStatus = await getInvoiceStatus(payment.lava_invoice_id);

        if (lavaStatus.status === "COMPLETED") {
          await admin
            .from("payments")
            .update({
              status: "completed",
              completed_at: new Date().toISOString(),
            })
            .eq("id", payment.id);

          await activateAccess(payment.user_id, payment.offer_type);
          verified++;
          console.log(`✅ Payment verified: ${payment.offer_type} for user ${payment.user_id}`);
        } else if (lavaStatus.status === "FAILED") {
          await admin
            .from("payments")
            .update({ status: "failed" })
            .eq("id", payment.id);
        }
      } catch (err) {
        console.error(`Error checking invoice ${payment.lava_invoice_id}:`, err);
      }
    }

    return NextResponse.json({
      verified,
      message: verified > 0
        ? `Активировано платежей: ${verified}`
        : "Оплаченных платежей не найдено",
    });
  } catch (error) {
    console.error("Payment verify error:", error);
    return NextResponse.json(
      { error: "Ошибка проверки платежей" },
      { status: 500 }
    );
  }
}
