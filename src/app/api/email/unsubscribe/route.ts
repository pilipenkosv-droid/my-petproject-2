/**
 * GET /api/email/unsubscribe — Отписка от lifecycle-писем
 * Query: uid, type, token (HMAC)
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { verifyUnsubscribeToken } from "@/lib/email/lifecycle";

export async function GET(request: NextRequest) {
  const uid = request.nextUrl.searchParams.get("uid");
  const type = request.nextUrl.searchParams.get("type");
  const token = request.nextUrl.searchParams.get("token");

  if (!uid || !type || !token) {
    return new NextResponse(renderPage("Неверная ссылка", "Параметры отписки некорректны."), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (!verifyUnsubscribeToken(uid, type, token)) {
    return new NextResponse(renderPage("Неверная ссылка", "Ссылка отписки недействительна."), {
      status: 403,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const supabase = getSupabaseAdmin();

  // Получаем текущий список отписок
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("email_unsubscribed_types")
    .eq("user_id", uid)
    .single();

  const currentTypes = (profile?.email_unsubscribed_types as string[]) || [];

  if (!currentTypes.includes(type)) {
    await supabase
      .from("user_profiles")
      .update({
        email_unsubscribed_types: [...currentTypes, type],
      })
      .eq("user_id", uid);
  }

  return new NextResponse(
    renderPage("Вы отписались", "Вы больше не будете получать эти уведомления от Diplox."),
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

function renderPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Diplox</title>
  <style>
    body { margin:0; padding:40px 16px; background:#f5f5f5; font-family:-apple-system,sans-serif; display:flex; justify-content:center; }
    .card { max-width:400px; background:#fff; border:1px solid #e5e5e5; padding:32px; text-align:center; }
    h1 { font-size:20px; font-weight:700; color:#0a0a0a; margin:0 0 8px; }
    p { font-size:14px; color:#666; margin:0 0 24px; }
    a { color:#7c3aed; text-decoration:none; font-weight:600; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="https://diplox.online">Вернуться на diplox.online</a>
  </div>
</body>
</html>`;
}
