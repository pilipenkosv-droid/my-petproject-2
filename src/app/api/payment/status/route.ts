/**
 * GET /api/payment/status
 * Возвращает текущий статус доступа пользователя
 */

import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getUserAccess } from "@/lib/payment/access";

export async function GET() {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json(
        { error: "Необходимо авторизоваться" },
        { status: 401 }
      );
    }

    const access = await getUserAccess(user.id);

    return NextResponse.json(access);
  } catch (error) {
    console.error("Payment status error:", error);
    return NextResponse.json(
      { error: "Ошибка проверки доступа" },
      { status: 500 }
    );
  }
}
