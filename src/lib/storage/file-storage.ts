/**
 * Абстракция хранения файлов — Supabase Storage
 *
 * Заменяет локальное хранение в /tmp на Supabase Storage buckets.
 * Работает корректно на Vercel serverless.
 *
 * Buckets:
 * - documents: загруженные пользователем файлы
 * - results: результаты обработки (marked original + formatted)
 */

import { getSupabaseAdmin } from "@/lib/supabase/server";
import { nanoid } from "nanoid";

export interface StoredFile {
  id: string;
  originalName: string;
  storagePath: string;
  mimeType: string;
  size: number;
  createdAt: Date;
}

export interface UploadedFileData {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
}

/**
 * Получить расширение файла по MIME-типу
 */
function getExtensionByMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      ".docx",
    "application/pdf": ".pdf",
    "text/plain": ".txt",
  };
  return mimeToExt[mimeType] || "";
}

/**
 * Извлечь расширение из имени файла
 */
function getExtFromName(name: string): string {
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex === -1) return "";
  return name.substring(dotIndex);
}

/**
 * Сохранить файл в хранилище (bucket: documents)
 */
export async function saveFile(fileData: UploadedFileData): Promise<StoredFile> {
  const supabase = getSupabaseAdmin();
  const id = nanoid();
  const ext =
    getExtensionByMimeType(fileData.mimeType) ||
    getExtFromName(fileData.originalName);

  const storagePath = `${id}${ext}`;

  const { error } = await supabase.storage
    .from("documents")
    .upload(storagePath, fileData.buffer, {
      contentType: fileData.mimeType,
      upsert: false,
    });

  if (error) {
    console.error("[file-storage] Failed to upload file:", error);
    throw new Error(`Failed to upload file: ${error.message}`);
  }

  return {
    id,
    originalName: fileData.originalName,
    storagePath,
    mimeType: fileData.mimeType,
    size: fileData.buffer.length,
    createdAt: new Date(),
  };
}

/**
 * Получить файл из хранилища (bucket: documents)
 */
export async function getFile(fileId: string): Promise<Buffer | null> {
  const supabase = getSupabaseAdmin();

  // Пробуем распространённые расширения
  const extensions = [".docx", ".pdf", ".txt", ""];

  for (const ext of extensions) {
    const path = `${fileId}${ext}`;
    const { data, error } = await supabase.storage
      .from("documents")
      .download(path);

    if (!error && data) {
      const arrayBuffer = await data.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }
  }

  console.error(`[file-storage] File not found: ${fileId}`);
  return null;
}

/**
 * Получить путь к файлу по ID (для Supabase — возвращает storage path)
 */
export async function getFilePath(fileId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  const extensions = [".docx", ".pdf", ".txt", ""];

  for (const ext of extensions) {
    const path = `${fileId}${ext}`;
    const { data } = await supabase.storage
      .from("documents")
      .download(path);

    if (data) {
      return path;
    }
  }

  return null;
}

/**
 * Удалить файл из хранилища
 */
export async function deleteFile(fileId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  const extensions = [".docx", ".pdf", ".txt", ""];

  for (const ext of extensions) {
    const path = `${fileId}${ext}`;
    const { error } = await supabase.storage.from("documents").remove([path]);

    if (!error) return true;
  }

  return false;
}

/**
 * Очистить старые файлы — для Supabase Storage управляется через lifecycle policies
 * Оставляем stub для совместимости
 */
export async function cleanupOldFiles(
  _maxAgeMs: number = 3600000
): Promise<number> {
  // Supabase Storage lifecycle policies handle this
  return 0;
}

/**
 * Сохранить результат обработки (bucket: results)
 */
export async function saveResultFile(
  jobId: string,
  type: "original" | "formatted",
  buffer: Buffer
): Promise<string> {
  const supabase = getSupabaseAdmin();
  const storagePath = `${jobId}/${type}.docx`;

  const { error } = await supabase.storage
    .from("results")
    .upload(storagePath, buffer, {
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true,
    });

  if (error) {
    console.error("[file-storage] Failed to save result file:", error);
    throw new Error(`Failed to save result file: ${error.message}`);
  }

  return storagePath;
}

/**
 * Получить результат обработки (bucket: results)
 */
export async function getResultFile(
  jobId: string,
  type: "original" | "formatted"
): Promise<Buffer | null> {
  const supabase = getSupabaseAdmin();
  const storagePath = `${jobId}/${type}.docx`;

  const { data, error } = await supabase.storage
    .from("results")
    .download(storagePath);

  if (error || !data) {
    console.error(
      `[file-storage] Result file not found: ${storagePath}`,
      error
    );
    return null;
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
