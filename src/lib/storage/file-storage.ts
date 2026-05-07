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
 * Удалить из bucket-ов "documents" и "results" объекты старше maxAgeMs.
 * Supabase Storage lifecycle policies на Free tier недоступны, поэтому
 * чистим вручную через ежедневный cron (см. vercel.json → /api/cleanup).
 *
 * Списки путей берём из storage.objects через service_role (read-only SELECT,
 * безопасно — orphan-инг происходит только при прямом DELETE из этой таблицы).
 * Удаление через Storage API (.remove()) корректно удаляет и метаданные, и
 * физические объекты в S3.
 *
 * По умолчанию 48 часов — запас для активных джоб (рендер ≤ 5 минут, 48ч
 * даёт буфер на support-кейсы и ретраи).
 */
export async function cleanupOldFiles(
  maxAgeMs: number = 48 * 60 * 60 * 1000
): Promise<number> {
  const supabase = getSupabaseAdmin();
  const cutoffISO = new Date(Date.now() - maxAgeMs).toISOString();
  const buckets = ["documents", "results"] as const;
  const removeChunkSize = 100;
  let totalDeleted = 0;

  for (const bucket of buckets) {
    const { data, error } = await supabase
      .schema("storage")
      .from("objects")
      .select("name")
      .eq("bucket_id", bucket)
      .lt("created_at", cutoffISO)
      .limit(50_000);

    if (error) {
      console.error(`[file-storage] list ${bucket} error:`, error.message);
      continue;
    }
    if (!data || data.length === 0) continue;

    const paths = data.map((row) => row.name as string);

    for (let i = 0; i < paths.length; i += removeChunkSize) {
      const chunk = paths.slice(i, i + removeChunkSize);
      const { error: delErr } = await supabase.storage.from(bucket).remove(chunk);
      if (delErr) {
        console.error(`[file-storage] remove ${bucket} error:`, delErr.message);
        break;
      }
      totalDeleted += chunk.length;
    }
  }

  return totalDeleted;
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

/**
 * Сохранить полную версию результата (до обрезки) для trial пользователей
 * Эти файлы становятся доступны после оплаты
 */
export async function saveFullVersionFile(
  jobId: string,
  type: "original" | "formatted",
  buffer: Buffer
): Promise<string> {
  const supabase = getSupabaseAdmin();
  const storagePath = `${jobId}/${type}_full.docx`;

  const { error } = await supabase.storage
    .from("results")
    .upload(storagePath, buffer, {
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true,
    });

  if (error) {
    console.error("[file-storage] Failed to save full version file:", error);
    throw new Error(`Failed to save full version file: ${error.message}`);
  }

  return storagePath;
}

/**
 * Получить полную версию результата (bucket: results)
 */
export async function getFullVersionFile(
  jobId: string,
  type: "original" | "formatted"
): Promise<Buffer | null> {
  const supabase = getSupabaseAdmin();
  const storagePath = `${jobId}/${type}_full.docx`;

  const { data, error } = await supabase.storage
    .from("results")
    .download(storagePath);

  if (error || !data) {
    console.error(
      `[file-storage] Full version file not found: ${storagePath}`,
      error
    );
    return null;
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Разблокировать полную версию (скопировать из _full в основной файл)
 */
export async function unlockFullVersion(
  jobId: string,
  type: "original" | "formatted"
): Promise<boolean> {
  const fullBuffer = await getFullVersionFile(jobId, type);
  if (!fullBuffer) {
    console.error(`[file-storage] No full version to unlock for ${jobId}/${type}`);
    return false;
  }

  await saveResultFile(jobId, type, fullBuffer);
  console.log(`[file-storage] Unlocked full version: ${jobId}/${type}`);
  return true;
}

/**
 * Проверить, есть ли полная версия файла
 */
export async function hasFullVersion(jobId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const storagePath = `${jobId}/formatted_full.docx`;

  const { data, error } = await supabase.storage
    .from("results")
    .download(storagePath);

  return !error && !!data;
}
