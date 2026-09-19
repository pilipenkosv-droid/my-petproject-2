import { NextResponse } from "next/server";
import { countDocumentsProcessed } from "@/lib/storage/documents-processed";

export const revalidate = 3600; // кеш 1 час

export async function GET() {
  try {
    return NextResponse.json({ documentsProcessed: await countDocumentsProcessed() });
  } catch {
    return NextResponse.json({ documentsProcessed: 1200 });
  }
}
