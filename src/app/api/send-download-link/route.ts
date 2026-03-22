import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/transport";
import { downloadLinkEmail } from "@/lib/email/templates";

interface RequestBody {
  email: string;
  jobId: string;
  downloadType: "original" | "formatted";
}

export async function POST(req: NextRequest) {
  const body: RequestBody = await req.json();
  const { email, jobId, downloadType } = body;

  if (!email || !jobId || !downloadType) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const token = crypto.randomUUID();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const downloadUrl = `${siteUrl}/api/download/${jobId}_${downloadType}?token=${token}`;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("email_captures").insert({
    email,
    job_id: jobId,
    download_type: downloadType,
    token,
    used: false,
  });

  if (error) {
    console.error("email_captures insert error:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  // Отправляем email со ссылкой на скачивание
  try {
    await sendEmail({
      to: email,
      subject: "Ваш документ готов — Diplox",
      html: downloadLinkEmail({ downloadUrl, downloadType }),
    });
  } catch (emailError) {
    console.error("Email send error:", emailError);
    // Не блокируем — email сохранён в БД, ссылку можно получить через поддержку
  }

  return NextResponse.json({ success: true });
}
