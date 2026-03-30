/**
 * GET /api/group/stats — Статистика групповой ссылки для создателя
 * Auth required
 */

import { NextResponse } from "next/server";
import { createSupabaseServer, getSupabaseAdmin } from "@/lib/supabase/server";
import { getGroupUrl } from "@/lib/group/utils";

export async function GET() {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getSupabaseAdmin();

    const { data: link } = await admin
      .from("group_links")
      .select("code, label, created_at, expires_at")
      .eq("creator_id", user.id)
      .eq("is_active", true)
      .single();

    if (!link) {
      return NextResponse.json({ code: null, memberCount: 0 });
    }

    const { count } = await admin
      .from("group_members")
      .select("id", { count: "exact", head: true })
      .eq("group_code", link.code);

    return NextResponse.json({
      code: link.code,
      url: getGroupUrl(link.code),
      memberCount: count ?? 0,
      label: link.label,
      expiresAt: link.expires_at,
    });
  } catch (err) {
    console.error("[group/stats] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
