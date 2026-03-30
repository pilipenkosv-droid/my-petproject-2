/**
 * API endpoint для сбора обратной связи (CSAT)
 * Сохраняет оценки в Supabase (таблица feedback)
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { sendLifecycleEmail, appendUnsubscribeFooter } from "@/lib/email/lifecycle";
import { csatLowEmail, csatHighEmail } from "@/lib/email/templates";
import { getOrCreateGroupLink, getGroupUrl } from "@/lib/group/utils";

interface FeedbackPayload {
  jobId: string;
  rating: number;
  feedback?: string;
  workType?: string;
  requirementsMode?: string;
  wasTruncated?: boolean;
  source?: string;
}

export async function POST(request: NextRequest) {
  try {
    const data: FeedbackPayload = await request.json();

    if (!data.jobId || !data.rating || data.rating < 1 || data.rating > 5) {
      return NextResponse.json(
        { error: "Invalid feedback data" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Пытаемся получить user_id из сессии (необязательно)
    let userId: string | null = null;
    try {
      const authHeader = request.headers.get("authorization");
      if (authHeader?.startsWith("Bearer ")) {
        const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
        userId = user?.id ?? null;
      }
    } catch {
      // Анонимный фидбек — тоже ок
    }

    const { error } = await supabase.from("feedback").insert({
      job_id: data.jobId,
      user_id: userId,
      rating: data.rating,
      comment: data.feedback?.trim() || null,
      work_type: data.workType || null,
      requirements_mode: data.requirementsMode || null,
      was_truncated: data.wasTruncated ?? null,
      source: data.source || "result_page",
    });

    if (error) {
      console.error("Error saving feedback to Supabase:", error);
      return NextResponse.json(
        { error: "Failed to save feedback" },
        { status: 500 }
      );
    }

    // Alert на низкие оценки для диагностики
    if (data.rating <= 2) {
      console.warn(`🚨 LOW CSAT: ${data.rating}/5 | job=${data.jobId} | type=${data.workType || "?"} | mode=${data.requirementsMode || "?"} | truncated=${data.wasTruncated ?? "?"} | comment="${data.feedback?.trim() || "нет"}"`);
    } else {
      console.log(`📊 CSAT: ${data.rating}/5 for job ${data.jobId}`);
    }

    // Lifecycle emails по CSAT (fire-and-forget)
    if (userId) {
      triggerCsatEmail(userId, data.rating, data.jobId).catch((err) =>
        console.error("[feedback] CSAT email error:", err)
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in feedback endpoint:", error);
    return NextResponse.json(
      { error: "Failed to save feedback" },
      { status: 500 }
    );
  }
}

async function triggerCsatEmail(userId: string, rating: number, jobId: string) {
  const supabase = getSupabaseAdmin();
  const { data: userData } = await supabase.auth.admin.getUserById(userId);
  if (!userData?.user?.email) return;

  if (rating <= 2) {
    const html = appendUnsubscribeFooter(csatLowEmail(), userId, "csat_low");
    await sendLifecycleEmail({
      userId,
      email: userData.user.email,
      emailType: "csat_low",
      jobId,
      subject: "Что пошло не так? Расскажи одним предложением",
      html,
      metadata: { rating },
    });
  } else if (rating >= 4) {
    let groupLinkUrl: string | null = null;
    try {
      const { code } = await getOrCreateGroupLink(userId);
      groupLinkUrl = getGroupUrl(code);
    } catch {
      // Ок — отправим без group link
    }

    const html = appendUnsubscribeFooter(
      csatHighEmail({ groupLinkUrl }),
      userId,
      "csat_high"
    );
    await sendLifecycleEmail({
      userId,
      email: userData.user.email,
      emailType: "csat_high",
      jobId,
      subject: "Спасибо! Поделись с одногруппниками",
      html,
      metadata: { rating },
    });
  }
}
