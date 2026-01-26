/**
 * Абстракция хранения файлов
 * - Dev: локальное хранение в ./uploads
 * - Prod (Vercel): /tmp для временных файлов
 */

import { promises as fs } from "fs";
import path from "path";
import { nanoid } from "nanoid";

// Определяем базовую директорию в зависимости от окружения
const isProduction = process.env.NODE_ENV === "production";
const BASE_DIR = isProduction ? "/tmp/smartformatter" : "./uploads";

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
 * Убедиться, что директория существует
 */
async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    // Игнорируем, если директория уже существует
  }
}

/**
 * Получить расширение файла по MIME-типу
 */
function getExtensionByMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/pdf": ".pdf",
    "text/plain": ".txt",
  };
  return mimeToExt[mimeType] || "";
}

/**
 * Сохранить файл в хранилище
 */
export async function saveFile(fileData: UploadedFileData): Promise<StoredFile> {
  const id = nanoid();
  const ext = getExtensionByMimeType(fileData.mimeType) || 
    path.extname(fileData.originalName);
  
  const fileName = `${id}${ext}`;
  const storagePath = path.join(BASE_DIR, fileName);

  await ensureDir(BASE_DIR);
  await fs.writeFile(storagePath, fileData.buffer);

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
 * Получить файл из хранилища
 */
export async function getFile(fileId: string): Promise<Buffer | null> {
  try {
    // Ищем файл с любым расширением
    const files = await fs.readdir(BASE_DIR);
    const matchingFile = files.find((f) => f.startsWith(fileId));
    
    if (!matchingFile) {
      return null;
    }

    const filePath = path.join(BASE_DIR, matchingFile);
    return await fs.readFile(filePath);
  } catch (error) {
    console.error(`Error reading file ${fileId}:`, error);
    return null;
  }
}

/**
 * Получить путь к файлу по ID
 */
export async function getFilePath(fileId: string): Promise<string | null> {
  try {
    const files = await fs.readdir(BASE_DIR);
    const matchingFile = files.find((f) => f.startsWith(fileId));
    
    if (!matchingFile) {
      return null;
    }

    return path.join(BASE_DIR, matchingFile);
  } catch (error) {
    console.error(`Error finding file ${fileId}:`, error);
    return null;
  }
}

/**
 * Удалить файл из хранилища
 */
export async function deleteFile(fileId: string): Promise<boolean> {
  try {
    const files = await fs.readdir(BASE_DIR);
    const matchingFile = files.find((f) => f.startsWith(fileId));
    
    if (!matchingFile) {
      return false;
    }

    const filePath = path.join(BASE_DIR, matchingFile);
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    console.error(`Error deleting file ${fileId}:`, error);
    return false;
  }
}

/**
 * Очистить старые файлы (по TTL)
 * @param maxAgeMs максимальный возраст файла в миллисекундах
 */
export async function cleanupOldFiles(maxAgeMs: number = 3600000): Promise<number> {
  let deletedCount = 0;
  
  try {
    await ensureDir(BASE_DIR);
    const files = await fs.readdir(BASE_DIR);
    const now = Date.now();

    for (const file of files) {
      const filePath = path.join(BASE_DIR, file);
      const stats = await fs.stat(filePath);
      const fileAge = now - stats.mtimeMs;

      if (fileAge > maxAgeMs) {
        await fs.unlink(filePath);
        deletedCount++;
      }
    }
  } catch (error) {
    console.error("Error during cleanup:", error);
  }

  return deletedCount;
}

/**
 * Сохранить результат обработки (с префиксом для идентификации)
 */
export async function saveResultFile(
  jobId: string,
  type: "original" | "formatted",
  buffer: Buffer
): Promise<string> {
  const fileName = `${jobId}_${type}.docx`;
  const storagePath = path.join(BASE_DIR, fileName);

  await ensureDir(BASE_DIR);
  await fs.writeFile(storagePath, buffer);

  return storagePath;
}

/**
 * Получить результат обработки
 */
export async function getResultFile(
  jobId: string,
  type: "original" | "formatted"
): Promise<Buffer | null> {
  const fileName = `${jobId}_${type}.docx`;
  const storagePath = path.join(BASE_DIR, fileName);

  try {
    return await fs.readFile(storagePath);
  } catch (error) {
    return null;
  }
}
