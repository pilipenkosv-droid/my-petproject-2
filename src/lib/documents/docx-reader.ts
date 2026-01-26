/**
 * Чтение .docx файлов с помощью mammoth
 */

import mammoth from "mammoth";

export interface DocxContent {
  /** Текстовое содержимое документа */
  text: string;
  /** HTML-представление документа */
  html: string;
  /** Сообщения и предупреждения при парсинге */
  messages: string[];
}

/**
 * Извлечь текст и HTML из .docx файла
 */
export async function extractFromDocx(buffer: Buffer): Promise<DocxContent> {
  const [textResult, htmlResult] = await Promise.all([
    mammoth.extractRawText({ buffer }),
    mammoth.convertToHtml({ buffer }),
  ]);

  const messages = [
    ...textResult.messages.map((m) => m.message),
    ...htmlResult.messages.map((m) => m.message),
  ];

  return {
    text: textResult.value,
    html: htmlResult.value,
    messages,
  };
}

/**
 * Извлечь только текст из .docx файла
 */
export async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

/**
 * Конвертировать .docx в HTML для preview
 */
export async function convertDocxToHtml(buffer: Buffer): Promise<string> {
  const result = await mammoth.convertToHtml({ buffer });
  return result.value;
}
