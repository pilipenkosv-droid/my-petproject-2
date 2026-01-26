/**
 * Извлечение текста из PDF файлов
 */

import pdf from "pdf-parse";

export interface PdfContent {
  /** Текстовое содержимое */
  text: string;
  /** Количество страниц */
  pageCount: number;
  /** Метаинформация */
  info: {
    title?: string;
    author?: string;
    creator?: string;
  };
}

/**
 * Извлечь текст и метаданные из PDF
 */
export async function extractFromPdf(buffer: Buffer): Promise<PdfContent> {
  const data = await pdf(buffer);

  return {
    text: data.text,
    pageCount: data.numpages,
    info: {
      title: data.info?.Title,
      author: data.info?.Author,
      creator: data.info?.Creator,
    },
  };
}

/**
 * Извлечь только текст из PDF
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const data = await pdf(buffer);
  return data.text;
}
