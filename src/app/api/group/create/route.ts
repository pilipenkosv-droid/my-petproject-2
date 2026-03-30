/**
 * POST /api/group/create — Создать или получить групповую ссылку
 * Auth required
 */

import { NextResponse } from "next/server";
import { createSupabaseServer, getSupabaseAdmin } from "@/lib/supabase/server";
import { getOrCreateGroupLink, getGroupUrl } from "@/lib/group/utils";

export async function POST() {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Проверяем активную кампанию для expires_at
    let expiresAt: string | undefined;
    try {
      const admin = getSupabaseAdmin();
      const { data: campaign } = await admin
        .from("campaign_config")
        .select("value")
        .eq("key", "marathon_2026")
        .single();

      const config = campaign?.value as { active?: boolean; ends_at?: string } | null;
      if (config?.active && config.ends_at && new Date(config.ends_at) > new Date()) {
        expiresAt = config.ends_at;
      }
    } catch {
      // Ок — создаём без expiry
    }

    const { code, memberCount } = await getOrCreateGroupLink(user.id, expiresAt);

    return NextResponse.json({
      code,
      url: getGroupUrl(code),
      memberCount,
    });
  } catch (err) {
    console.error("[group/create] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
