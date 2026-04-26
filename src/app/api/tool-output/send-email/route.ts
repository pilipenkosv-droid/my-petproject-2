import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/transport";
import { toolOutputLinkEmail } from "@/lib/email/tool-output-link";
import type { ToolName } from "@/lib/auth/tool-access";

const bodySchema = z.object({
  outputId: z.string().uuid(),
  email: z.string().email(),
});

export async function POST(req: NextRequest) {
  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { outputId, email } = parsed;
  const supabase = getSupabaseAdmin();

  const { data: row, error: fetchError } = await supabase
    .from("tool_outputs")
    .select("id, tool, expires_at, email_sent_at")
    .eq("id", outputId)
    .single();

  if (fetchError || !row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (new Date(row.expires_at) < new Date()) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }

  // Защита от ре-сенда: один outputId — одна email-ссылка.
  // Если злоумышленник захочет рассылать спам через нас, ему придётся
  // каждый раз генерировать новый outputId (= платить токенами LLM).
  if (row.email_sent_at) {
    return NextResponse.json({ error: "already_sent" }, { status: 409 });
  }

  const accessToken = randomBytes(32).toString("hex");

  const { error: updateError } = await supabase
    .from("tool_outputs")
    .update({
      email,
      email_sent_at: new Date().toISOString(),
      access_token: accessToken,
    })
    .eq("id", outputId)
    .is("email_sent_at", null); // race-safe: не перезаписываем существующий токен

  if (updateError) {
    console.error("[tool-output/send-email] update failed:", updateError.message);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://diplox.online";
  const link = `${siteUrl}/tool-output/${outputId}?t=${accessToken}`;

  try {
    await sendEmail({
      to: email,
      subject: "Ваш результат от Diplox готов",
      html: toolOutputLinkEmail({ tool: row.tool as ToolName, link }),
    });
  } catch (e) {
    console.error("[tool-output/send-email] email send failed:", e);
    // Не блокируем — данные сохранены, ссылку можно получить через поддержку
  }

  return NextResponse.json({ success: true });
}
