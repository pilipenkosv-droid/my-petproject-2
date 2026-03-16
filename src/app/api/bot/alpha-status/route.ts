import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const BOT_ACCESS_LIMIT = 10;

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { count, error } = await supabase
      .from("user_access")
      .select("*", { count: "exact", head: true })
      .eq("bot_access_granted", true);

    if (error) {
      console.error("alpha-status query error:", error);
      return NextResponse.json({ provisioned: 3, limit: BOT_ACCESS_LIMIT, remaining: BOT_ACCESS_LIMIT - 3 });
    }

    const real = count ?? 0;
    // Social proof floor: show real+3 while it doesn't exceed 9, then show real
    const displayed = real + 3 <= 9 ? real + 3 : real;
    return NextResponse.json({
      provisioned: displayed,
      limit: BOT_ACCESS_LIMIT,
      remaining: Math.max(0, BOT_ACCESS_LIMIT - displayed),
    });
  } catch (err) {
    console.error("alpha-status error:", err);
    return NextResponse.json({ provisioned: 3, limit: BOT_ACCESS_LIMIT, remaining: BOT_ACCESS_LIMIT - 3 });
  }
}
