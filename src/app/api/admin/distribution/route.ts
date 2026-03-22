import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getDistributionLog } from "@/lib/distribution/tracker";

const ADMIN_EMAILS = ["pilipenkosv@gmail.com", "mary_shu@mail.ru"];

async function getAdminUser(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  const admin = getSupabaseAdmin();
  const {
    data: { user },
  } = await admin.auth.getUser(token);

  if (!user?.email || !ADMIN_EMAILS.includes(user.email)) return null;
  return user;
}

export async function GET(request: NextRequest) {
  const user = await getAdminUser(request);

  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const log = await getDistributionLog(50);

  // Сводка по платформам и статусам
  const summary: Record<string, Record<string, number>> = {};
  for (const row of log) {
    if (!summary[row.platform]) summary[row.platform] = {};
    summary[row.platform][row.status] =
      (summary[row.platform][row.status] || 0) + 1;
  }

  return NextResponse.json({ log, summary, total: log.length });
}
