import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { createSupabaseServer } from "@/lib/supabase/server";

const ADMIN_EMAILS = ["pilipenkosv@gmail.com", "mary_shu@mail.ru"];

export async function GET(request: NextRequest) {
  // Проверка админского доступа (middleware обновляет сессию для /api/admin/)
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user?.email || !ADMIN_EMAILS.includes(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const days = parseInt(request.nextUrl.searchParams.get("days") ?? "30");
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // Параллельные запросы
  const [jobsRes, paymentsRes, accessRes, feedbackRes, downloadsRes] = await Promise.all([
    admin.from("jobs").select("id,user_id,status,work_type,requirements_mode,has_full_version,yandex_client_id,referrer,created_at").gte("created_at", cutoff).order("created_at", { ascending: false }),
    admin.from("payments").select("*").order("created_at", { ascending: false }),
    admin.from("user_access").select("*"),
    admin.from("feedback").select("*").order("created_at", { ascending: false }),
    admin.from("download_events").select("*").gte("created_at", cutoff).order("created_at", { ascending: false }),
  ]);

  const jobs = jobsRes.data ?? [];
  const payments = paymentsRes.data ?? [];
  const access = accessRes.data ?? [];
  const feedback = feedbackRes.data ?? [];
  const downloads = downloadsRes.data ?? [];

  // Пользователи (через Auth Admin API)
  const { data: usersData } = await admin.auth.admin.listUsers({ perPage: 500 });
  const users = usersData?.users ?? [];
  const recentUsers = users.filter((u) => u.created_at >= cutoff);

  // --- Воронка ---
  const completedPayments = payments.filter((p) => p.status === "completed");
  const pendingPayments = payments.filter((p) => p.status === "pending");
  const failedPayments = payments.filter((p) => p.status === "failed");
  const hookPayments = payments.filter((p) => p.unlock_job_id);
  const directPayments = payments.filter((p) => !p.unlock_job_id);
  const payingUserIds = new Set(completedPayments.map((p) => p.user_id));
  const initiatedUserIds = new Set(payments.map((p) => p.user_id));

  // Время до покупки
  const timeToPayment = completedPayments.map((p) => {
    const user = users.find((u) => u.id === p.user_id);
    if (!user) return null;
    const hours = (new Date(p.completed_at).getTime() - new Date(user.created_at).getTime()) / 3600000;
    return {
      email: user.email,
      hours: Math.round(hours * 10) / 10,
      offer_type: p.offer_type,
      hook: !!p.unlock_job_id,
      date: p.completed_at?.slice(0, 10),
    };
  }).filter(Boolean);

  // Регистрации по дням
  const regByDay: Record<string, number> = {};
  recentUsers.forEach((u) => {
    const day = u.created_at.slice(0, 10);
    regByDay[day] = (regByDay[day] || 0) + 1;
  });

  // Платежи по дням
  const payByDay: Record<string, { completed: number; revenue: number }> = {};
  completedPayments.forEach((p) => {
    const day = p.completed_at?.slice(0, 10) ?? p.created_at.slice(0, 10);
    if (!payByDay[day]) payByDay[day] = { completed: 0, revenue: 0 };
    payByDay[day].completed++;
    payByDay[day].revenue += Number(p.amount);
  });

  // Джобы по статусам
  const jobsByStatus: Record<string, { total: number; auth: number; anon: number }> = {};
  jobs.forEach((j) => {
    if (!jobsByStatus[j.status]) jobsByStatus[j.status] = { total: 0, auth: 0, anon: 0 };
    jobsByStatus[j.status].total++;
    if (j.user_id) jobsByStatus[j.status].auth++;
    else jobsByStatus[j.status].anon++;
  });

  // Work type
  const workTypes: Record<string, number> = {};
  jobs.forEach((j) => {
    const wt = j.work_type || "(не указан)";
    workTypes[wt] = (workTypes[wt] || 0) + 1;
  });

  // CSAT
  const ratings = feedback.map((f) => f.rating);
  const avgRating = ratings.length > 0 ? Math.round((ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length) * 10) / 10 : 0;

  // Активность
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const activeLastWeek = users.filter((u) => u.last_sign_in_at && u.last_sign_in_at >= weekAgo).length;

  const totalRevenue = completedPayments.reduce((sum, p) => sum + Number(p.amount), 0);

  return NextResponse.json({
    period: { days, from: cutoff.slice(0, 10), to: new Date().toISOString().slice(0, 10) },

    funnel: {
      total_users: users.length,
      recent_registrations: recentUsers.length,
      active_last_7d: activeLastWeek,
      initiated_payment: initiatedUserIds.size,
      completed_payment: payingUserIds.size,
      conversion_reg_to_pay: recentUsers.length > 0 ? `${Math.round(100 * payingUserIds.size / recentUsers.length)}%` : "0%",
      conversion_init_to_complete: initiatedUserIds.size > 0 ? `${Math.round(100 * payingUserIds.size / initiatedUserIds.size)}%` : "0%",
    },

    revenue: {
      total_rub: totalRevenue,
      completed_payments: completedPayments.length,
      pending_stuck: pendingPayments.length,
      failed: failedPayments.length,
    },

    hook_offer: {
      hook_attempts: hookPayments.length,
      hook_completed: hookPayments.filter((p) => p.status === "completed").length,
      hook_rate: hookPayments.length > 0 ? `${Math.round(100 * hookPayments.filter((p) => p.status === "completed").length / hookPayments.length)}%` : "0%",
      direct_attempts: directPayments.length,
      direct_completed: directPayments.filter((p) => p.status === "completed").length,
      direct_rate: directPayments.length > 0 ? `${Math.round(100 * directPayments.filter((p) => p.status === "completed").length / directPayments.length)}%` : "0%",
    },

    time_to_payment: timeToPayment,

    jobs: {
      total: jobs.length,
      by_status: jobsByStatus,
      by_work_type: workTypes,
      trial_truncated: jobs.filter((j) => j.has_full_version).length,
    },

    registrations_by_day: regByDay,
    payments_by_day: payByDay,

    csat: {
      total_reviews: feedback.length,
      avg_rating: avgRating,
      distribution: {
        "5": ratings.filter((r: number) => r === 5).length,
        "4": ratings.filter((r: number) => r === 4).length,
        "3": ratings.filter((r: number) => r === 3).length,
        "2": ratings.filter((r: number) => r === 2).length,
        "1": ratings.filter((r: number) => r === 1).length,
      },
    },

    downloads: {
      total: downloads.length,
      by_type: {
        original: downloads.filter((d) => d.file_type === "original").length,
        formatted: downloads.filter((d) => d.file_type === "formatted").length,
      },
    },
  });
}
