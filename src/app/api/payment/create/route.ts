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
    console.log("[payment/create] Step 1: Starting...");

    // Проверяем авторизацию
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    console.log("[payment/create] Step 2: User check", { userId: user?.id, email: user?.email });

    if (!user?.id || !user?.email) {
      return NextResponse.json(
        { error: "Необходимо авторизоваться" },
        { status: 401 }
      );
    }

    const { offerType, unlockJobId } = (await request.json()) as {
      offerType: OfferType;
      unlockJobId?: string;
    };
    console.log("[payment/create] Step 3: offerType =", offerType, "unlockJobId =", unlockJobId);

    if (!offerType || !["one_time", "subscription", "subscription_plus"].includes(offerType)) {
      return NextResponse.json(
        { error: "Неверный тип тарифа" },
        { status: 400 }
      );
    }

    const offerMap = {
      one_time: LAVA_CONFIG.offers.oneTime,
      subscription: LAVA_CONFIG.offers.subscription,
      subscription_plus: LAVA_CONFIG.offers.subscriptionPlus,
    } as const;
    const offer = offerMap[offerType];

    const admin = getSupabaseAdmin();

    // Дедупликация: ищем pending-платёж за последние 30 минут для того же пользователя/типа
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    let existingQuery = admin
      .from("payments")
      .select("lava_invoice_id, payment_url")
      .eq("user_id", user.id)
      .eq("offer_type", offerType)
      .eq("status", "pending")
      .gte("created_at", thirtyMinAgo)
      .order("created_at", { ascending: false })
      .limit(1);

    // Если unlock_job_id передан — ищем точно для этого job
    if (unlockJobId) {
      existingQuery = existingQuery.eq("unlock_job_id", unlockJobId);
    }

    const { data: existingPending } = await existingQuery.maybeSingle();

    if (existingPending?.payment_url) {
      console.log("[payment/create] Reusing existing pending payment:", existingPending.lava_invoice_id);
      return NextResponse.json({
        paymentUrl: existingPending.payment_url,
        invoiceId: existingPending.lava_invoice_id,
      });
    }

    console.log("[payment/create] Step 4: Creating Lava invoice...", { offerId: offer.offerId });

    // Создаём invoice в Lava.top
    const invoice = await createInvoice({
      email: user.email,
      offerId: offer.offerId,
      currency: offer.currency,
      periodicity: offer.periodicity,
    });

    console.log("[payment/create] Step 5: Lava invoice created", { invoiceId: invoice.id, hasPaymentUrl: !!invoice.paymentUrl });

    if (!invoice.paymentUrl) {
      throw new Error("Lava.top не вернул paymentUrl");
    }

    console.log("[payment/create] Step 6: Saving to DB...");

    // Сохраняем платёж в БД (с paymentUrl для дедупликации)
    const { error: dbError } = await admin.from("payments").insert({
      user_id: user.id,
      lava_invoice_id: invoice.id,
      offer_type: offerType,
      amount: offer.price,
      currency: offer.currency,
      status: "pending",
      payment_url: invoice.paymentUrl,
      ...(unlockJobId && { unlock_job_id: unlockJobId }),
    });

    if (dbError) {
      console.error("[payment/create] DB insert error:", dbError);
      throw new Error(`DB error: ${dbError.message}`);
    }

    console.log("[payment/create] Step 7: Success!");

    return NextResponse.json({
      paymentUrl: invoice.paymentUrl,
      invoiceId: invoice.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Payment create error:", message, error);
    return NextResponse.json(
      { error: `Не удалось создать платёж: ${message}` },
      { status: 500 }
    );
  }
}
