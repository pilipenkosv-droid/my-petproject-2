/**
 * Подсчёт таблиц в word/document.xml.
 *
 * Считаем regex-ом по открывающим тегам <w:tbl>, а не через парсер: одинаковый
 * метод нужен и оригиналу, и результату (checker сравнивает их между собой), а
 * mammoth-вход в extractDocument приходит с уже вырезанными таблицами
 * (stripTablesForMammoth), поэтому extracted.assets.tables всегда 0.
 *
 * Что это означает на практике:
 *   - таблица внутри <w:sdt> (content control, напр. авто-оглавление) считается;
 *   - вложенная таблица даёт +1 сверх внешней (учитываются все <w:tbl>);
 *   - пустая строка (документ без word/document.xml) → 0.
 */
export function countTablesInDocumentXml(xml: string): number {
  if (!xml) return 0;
  return (xml.match(/<w:tbl[ >]/g) || []).length;
}
