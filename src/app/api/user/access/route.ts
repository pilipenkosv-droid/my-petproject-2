import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/api-auth";
import { getUserAccess } from "@/lib/payment/access";

export async function GET() {
  const user = await getAuthUser();

  if (!user) {
    return NextResponse.json({ accessType: "none" }, { status: 401 });
  }

  const access = await getUserAccess(user.id);
  return NextResponse.json(access);
}
