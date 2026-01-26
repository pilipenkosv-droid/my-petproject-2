/**
 * Универсальный экстрактор текста из документов
 */

import { extractTextFromDocx } from "../documents/docx-reader";
import { extractTextFromPdf } from "../documents/pdf-reader";
import { extractTextFromTxt } from "../documents/txt-reader";

export type SupportedMimeType =
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  | "application/pdf"
  | "text/plain";

const MIME_TO_EXTRACTOR: Record<SupportedMimeType, (buffer: Buffer) => Promise<string>> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": extractTextFromDocx,
  "application/pdf": extractTextFromPdf,
  "text/plain": extractTextFromTxt,
};

/**
 * Проверить, поддерживается ли MIME-тип
 */
export function isSupportedMimeType(mimeType: string): mimeType is SupportedMimeType {
  return mimeType in MIME_TO_EXTRACTOR;
}

/**
 * Извлечь текст из файла по MIME-типу
 */
export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  if (!isSupportedMimeType(mimeType)) {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }

  const extractor = MIME_TO_EXTRACTOR[mimeType];
  return extractor(buffer);
}

/**
 * Определить MIME-тип по расширению файла
 */
export function getMimeTypeByExtension(filename: string): SupportedMimeType | null {
  const ext = filename.toLowerCase().split(".").pop();
  
  const extToMime: Record<string, SupportedMimeType> = {
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pdf: "application/pdf",
    txt: "text/plain",
  };

  return extToMime[ext || ""] || null;
}

/**
 * Валидировать файл документа (исходный документ - только .docx)
 */
export function isValidSourceDocument(mimeType: string): boolean {
  return mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

/**
 * Валидировать файл требований (.docx, .pdf, .txt)
 */
export function isValidRequirementsDocument(mimeType: string): boolean {
  return isSupportedMimeType(mimeType);
}
