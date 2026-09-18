import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const revalidate = 3600; // кеш 1 час

export async function GET() {
  const admin = getSupabaseAdmin();

  const { count, error } = await admin
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "completed")
    .is("shadow_of", null); // теневые копии не показываем как обработанные документы

  if (error) {
    return NextResponse.json({ documentsProcessed: 1200 });
  }

  return NextResponse.json({ documentsProcessed: count ?? 1200 });
}
