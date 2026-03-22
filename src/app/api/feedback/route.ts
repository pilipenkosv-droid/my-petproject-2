/**
 * API endpoint для сбора обратной связи (CSAT)
 * Сохраняет оценки в Supabase (таблица feedback)
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

interface FeedbackPayload {
  jobId: string;
  rating: number;
  feedback?: string;
  workType?: string;
  requirementsMode?: string;
  wasTruncated?: boolean;
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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in feedback endpoint:", error);
    return NextResponse.json(
      { error: "Failed to save feedback" },
      { status: 500 }
    );
  }
}
