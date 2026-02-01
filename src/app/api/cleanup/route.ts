import { NextRequest, NextResponse } from "next/server";
import { runCleanup } from "@/lib/storage/cleanup";

/**
 * API endpoint для очистки старых записей в БД
 * GET /api/cleanup?secret=YOUR_CLEANUP_SECRET
 */
export async function GET(request: NextRequest) {
  // Опционально: проверка секретного ключа
  const secret = request.nextUrl.searchParams.get("secret");
  const expectedSecret = process.env.CLEANUP_SECRET;
  
  if (expectedSecret && secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runCleanup();
    
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Cleanup error:", error);
    return NextResponse.json(
      { error: "Cleanup failed" },
      { status: 500 }
    );
  }
}
