/**
 * POST /api/group/register — Привязать пользователя к группе после регистрации
 * Body: { userId, code }
 * Вызывается из auth/callback при наличии cookie dlx_grp
 */

import { NextRequest, NextResponse } from "next/server";
import { joinGroup } from "@/lib/group/utils";

export async function POST(request: NextRequest) {
  try {
    const { userId, code } = await request.json();

    if (!userId || !code) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
    }

    const result = await joinGroup(code, userId);

    return NextResponse.json({
      ok: result.ok,
      alreadyMember: result.alreadyMember,
    });
  } catch (err) {
    console.error("[group/register] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
