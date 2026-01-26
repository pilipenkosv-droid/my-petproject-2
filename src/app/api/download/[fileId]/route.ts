import { NextRequest, NextResponse } from "next/server";
import { getResultFile } from "@/lib/storage/file-storage";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await params;
  
  // fileId имеет формат: {jobId}_{type} (например: abc123_original или abc123_formatted)
  const parts = fileId.split("_");
  if (parts.length < 2) {
    return NextResponse.json(
      { error: "Неверный идентификатор файла" },
      { status: 400 }
    );
  }

  const jobId = parts.slice(0, -1).join("_");
  const type = parts[parts.length - 1] as "original" | "formatted";

  if (type !== "original" && type !== "formatted") {
    return NextResponse.json(
      { error: "Неверный тип файла" },
      { status: 400 }
    );
  }

  const fileBuffer = await getResultFile(jobId, type);

  if (!fileBuffer) {
    return NextResponse.json(
      { error: "Файл не найден" },
      { status: 404 }
    );
  }

  const filename = type === "original" 
    ? "document_with_marks.docx" 
    : "document_formatted.docx";

  return new NextResponse(new Uint8Array(fileBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
