/**
 * Чтение текстовых файлов
 */

/**
 * Извлечь текст из .txt файла
 */
export async function extractTextFromTxt(buffer: Buffer): Promise<string> {
  // Определяем кодировку (UTF-8 по умолчанию)
  // Можно добавить определение кодировки через chardet если нужно
  return buffer.toString("utf-8");
}
