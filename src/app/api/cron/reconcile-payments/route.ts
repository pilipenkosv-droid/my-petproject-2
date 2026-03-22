import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getInvoiceStatus } from "@/lib/payment/lava-client";
import { activateAccess } from "@/lib/payment/access";
import { unlockFullVersion } from "@/lib/storage/file-storage";
import { updateJob } from "@/lib/storage/job-store";
import { getAllPosts } from "@/lib/blog/posts";
import { distributeAll } from "@/lib/distribution/distributor";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Проверка авторизации: Vercel Cron (Authorization: Bearer) или ручной вызов (x-cron-secret)
  const isLocal = process.env.NODE_ENV === "development";
  const authHeader = req.headers.get("authorization");
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET;

  const isAuthorized = isLocal
    || cronSecret === expectedSecret
    || authHeader === `Bearer ${expectedSecret}`;

  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date();
  const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Получаем зависшие платежи старше 30 минут (лимит 3 для Hobby 10s таймаута)
  const { data: payments, error } = await supabase
    .from("payments")
    .select("*")
    .eq("status", "pending")
    .lt("created_at", thirtyMinutesAgo.toISOString())
    .order("created_at", { ascending: true })
    .limit(3);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const summary = { completed: 0, failed: 0, expired: 0, errors: 0 };

  for (const payment of payments ?? []) {
    try {
      const invoice = await getInvoiceStatus(payment.lava_invoice_id);
      const isExpired = new Date(payment.created_at) < twentyFourHoursAgo;

      if (invoice.status === "COMPLETED") {
        // Активируем доступ и помечаем платёж как завершённый
        await activateAccess(payment.user_id, payment.offer_type);

        if (payment.unlock_job_id) {
          // Разблокируем полную версию файлов задачи (original + formatted)
          const [unlockedOrig, unlockedFmt] = await Promise.all([
            unlockFullVersion(payment.unlock_job_id, "original"),
            unlockFullVersion(payment.unlock_job_id, "formatted"),
          ]);
          if (unlockedOrig && unlockedFmt) {
            await updateJob(payment.unlock_job_id, { hasFullVersion: false });
            console.log(`🔓 Reconciled: unlocked job ${payment.unlock_job_id}`);
          }
        }

        await supabase
          .from("payments")
          .update({ status: "completed", completed_at: now.toISOString() })
          .eq("id", payment.id);

        summary.completed++;
      } else if (invoice.status === "FAILED") {
        // Помечаем как неудачный
        await supabase
          .from("payments")
          .update({ status: "failed" })
          .eq("id", payment.id);

        summary.failed++;
      } else if ((invoice.status === "NEW" || invoice.status === "IN_PROGRESS") && isExpired) {
        // Платёж завис более 24 часов — считаем просроченным
        await supabase
          .from("payments")
          .update({ status: "failed" })
          .eq("id", payment.id);

        summary.expired++;
      }
    } catch (err) {
      console.error(`[reconcile] Error processing payment ${payment.id}:`, err);
      summary.errors++;
    }
  }

  console.log(`[reconcile] Done: ${JSON.stringify(summary)}`);

  // Дистрибуция новых статей блога на внешние площадки
  let distributionSummary = { distributed: 0, failed: 0, skipped: 0 };
  try {
    const posts = getAllPosts();
    const { results } = await distributeAll(posts);
    distributionSummary = {
      distributed: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok && r.error !== "not_configured").length,
      skipped: results.filter((r) => r.error === "not_configured").length,
    };
    console.log(`[distribute-blog] Done: ${JSON.stringify(distributionSummary)}`);
  } catch (err) {
    console.error("[distribute-blog] Error:", err);
  }

  return NextResponse.json({
    ok: true,
    processed: payments?.length ?? 0,
    summary,
    distribution: distributionSummary,
    timestamp: now.toISOString(),
  });
}
