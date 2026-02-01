/**
 * POST /api/payment/create
 * Создаёт invoice в Lava.top и возвращает paymentUrl для редиректа
 */

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer, getSupabaseAdmin } from "@/lib/supabase/server";
import { createInvoice } from "@/lib/payment/lava-client";
import { LAVA_CONFIG, OfferType } from "@/lib/payment/config";

export async function POST(request: NextRequest) {
  try {
    // Проверяем авторизацию
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user?.id || !user?.email) {
      return NextResponse.json(
        { error: "Необходимо авторизоваться" },
        { status: 401 }
      );
    }

    const { offerType } = (await request.json()) as { offerType: OfferType };

    if (!offerType || !["one_time", "subscription"].includes(offerType)) {
      return NextResponse.json(
        { error: "Неверный тип тарифа" },
        { status: 400 }
      );
    }

    const offer =
      offerType === "one_time"
        ? LAVA_CONFIG.offers.oneTime
        : LAVA_CONFIG.offers.subscription;

    // Создаём invoice в Lava.top
    const invoice = await createInvoice({
      email: user.email,
      offerId: offer.offerId,
      currency: offer.currency,
      periodicity: offer.periodicity,
    });

    if (!invoice.paymentUrl) {
      throw new Error("Lava.top не вернул paymentUrl");
    }

    // Сохраняем платёж в БД
    const admin = getSupabaseAdmin();
    await admin.from("payments").insert({
      user_id: user.id,
      lava_invoice_id: invoice.id,
      offer_type: offerType,
      amount: offer.price,
      currency: offer.currency,
      status: "pending",
    });

    return NextResponse.json({
      paymentUrl: invoice.paymentUrl,
      invoiceId: invoice.id,
    });
  } catch (error) {
    console.error("Payment create error:", error);
    return NextResponse.json(
      { error: "Не удалось создать платёж" },
      { status: 500 }
    );
  }
}
