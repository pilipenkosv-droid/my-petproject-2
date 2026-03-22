import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { createSupabaseServer } from "@/lib/supabase/server";

/**
 * POST /api/track/pageview — серверный трекинг посещений страниц.
 * Записывает page_views + first-touch атрибуцию в session_attributions.
 * Fire-and-forget — не блокирует рендер клиента.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const path: string = body.path;
    if (!path) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const sessionId = request.cookies.get("dlx_sid")?.value;
    if (!sessionId) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const ymUid = request.cookies.get("_ym_uid")?.value ?? null;
    const referrer: string | null = body.referrer || null;
    const utmSource: string | null = body.utmSource || null;
    const utmMedium: string | null = body.utmMedium || null;
    const utmCampaign: string | null = body.utmCampaign || null;

    // Получаем user_id если авторизован
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id ?? null;

    const admin = getSupabaseAdmin();

    // Записываем page view
    await admin.from("page_views").insert({
      session_id: sessionId,
      user_id: userId,
      path,
      referrer,
      yandex_client_id: ymUid,
    });

    // First-touch атрибуция (ON CONFLICT DO NOTHING — записывается только 1 раз)
    await admin.from("session_attributions").upsert(
      {
        session_id: sessionId,
        landing_page: path,
        referrer,
        utm_source: utmSource,
        utm_medium: utmMedium,
        utm_campaign: utmCampaign,
        yandex_client_id: ymUid,
      },
      { onConflict: "session_id", ignoreDuplicates: true }
    );

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
