/**
 * GET /api/payment/check/[invoiceId]
 * Проверяет статус конкретного платежа (для поллинга на странице ожидания)
 */

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer, getSupabaseAdmin } from "@/lib/supabase/server";

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
      .select("status, offer_type")
      .eq("lava_invoice_id", invoiceId)
      .eq("user_id", user.id)
      .single();

    if (!payment) {
      return NextResponse.json(
        { error: "Платёж не найден" },
        { status: 404 }
      );
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
