import { NextRequest, NextResponse } from "next/server";
import { getResultFile, getFullVersionFile } from "@/lib/storage/file-storage";
import { getJob } from "@/lib/storage/job-store";
import { createSupabaseServer, getSupabaseAdmin } from "@/lib/supabase/server";

/** JSON-ответ с явным charset=utf-8 (исправляет кракозябры на мобильных) */
function jsonResponse(body: Record<string, unknown>, status: number) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function logDownload(jobId: string, fileType: string, ymUid: string | null) {
  try {
    const job = await getJob(jobId);
    const supabase = getSupabaseAdmin();
    await supabase.from("download_events").insert({
      job_id: jobId,
      user_id: job?.userId ?? null,
      file_type: fileType,
      yandex_client_id: ymUid,
    });
  } catch (err) {
    console.error("[download] Log error:", err);
  }
}

/**
 * Проверяет доступ к скачиванию: авторизованный пользователь или валидный email-токен
 */
async function validateAccess(request: NextRequest, jobId: string): Promise<boolean> {
  // Проверка email-токена (для анонимных пользователей через email-capture)
  const token = request.nextUrl.searchParams.get("token");
  if (token) {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("email_captures")
      .select("id, used, created_at")
      .eq("token", token)
      .eq("job_id", jobId)
      .single();

    if (!data) return false;

    // Токен действует 24 часа (многоразовый в пределах этого окна)
    const createdAt = new Date(data.created_at).getTime();
    if (Date.now() - createdAt > 24 * 60 * 60 * 1000) return false;

    // Помечаем токен как использованный (для аналитики, не блокирует повторное скачивание)
    if (!data.used) {
      supabase.from("email_captures").update({ used: true }).eq("id", data.id).then();
    }
    return true;
  }

  // Проверка авторизации через Supabase сессию
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    return !!user;
  } catch {
    return false;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await params;
  
  // fileId имеет формат: {jobId}_{type} (например: abc123_original или abc123_formatted)
  const parts = fileId.split("_");
  if (parts.length < 2) {
    return jsonResponse({ error: "Неверный идентификатор файла" }, 400);
  }

  const jobId = parts.slice(0, -1).join("_");
  const type = parts[parts.length - 1] as "original" | "formatted";

  if (type !== "original" && type !== "formatted") {
    return jsonResponse({ error: "Неверный тип файла" }, 400);
  }

  // Скачивание доступно всем — trial-результат уже обрезан до лимита
  // Email-токен и авторизация используются только для аналитики

  let fileBuffer = await getResultFile(jobId, type);

  if (!fileBuffer) {
    return jsonResponse({ error: "Файл не найден" }, 404);
  }

  // Если оплата прошла, но unlock не сработал — отдаём полную версию напрямую
  const supabaseAdmin = getSupabaseAdmin();
  const { data: completedPayment } = await supabaseAdmin
    .from("payments")
    .select("id")
    .eq("unlock_job_id", jobId)
    .eq("status", "completed")
    .limit(1)
    .single();

  if (completedPayment) {
    const fullBuffer = await getFullVersionFile(jobId, type);
    if (fullBuffer) fileBuffer = fullBuffer;
  }

  // Серверный лог скачивания (fire-and-forget)
  const ymUid = request.cookies.get("_ym_uid")?.value ?? null;
  logDownload(jobId, type, ymUid);

  const filename = type === "original"
    ? "document_with_marks.docx"
    : "document_formatted.docx";

  return new NextResponse(new Uint8Array(fileBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
