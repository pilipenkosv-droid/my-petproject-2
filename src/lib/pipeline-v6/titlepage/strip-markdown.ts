// Удаляет титульную шапку из mammoth-markdown, чтобы pandoc не отрендерил
// её повторно после нашего prepend. Эвристика:
//   1. Находим индекс первой строки, которая является "настоящим" началом
//      документа — заголовок Введение/Содержание/Оглавление/Глава 1 или
//      параграф длиной >200 символов (первый абзац введения).
//   2. Отрезаем всё до этой строки.
//   3. TOC-entries вида "Введение ......5" не считаем настоящим началом —
//      они имеют dot-leader + номер страницы.

const TOC_ENTRY = /(\.{3,}|…{1,})\s*\d+\s*$/;
const SECTION_HEADING = /^(#{1,3}\s*)?\s*(Введение|ВВЕДЕНИЕ|Оглавление|ОГЛАВЛЕНИЕ|Содержание|СОДЕРЖАНИЕ|Глава\s+\d|ГЛАВА\s+\d)\s*$/;

export function stripTitleFromMarkdown(markdown: string): { markdown: string; removedLines: number } {
  const lines = markdown.split("\n");
  let cutIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    // TOC-entry — пропускаем
    if (TOC_ENTRY.test(trimmed)) continue;

    // Настоящий заголовок секции
    if (SECTION_HEADING.test(trimmed)) {
      cutIndex = i;
      break;
    }

    // Длинный параграф (первый абзац содержательного текста) — обычно Введение
    // ПОСЛЕ 15-й строки (до этого — титул, даже если параграфы длинные из-за
    // названия работы, названия вуза и т.п.).
    if (i > 15 && trimmed.length > 200) {
      cutIndex = i;
      break;
    }
  }

  if (cutIndex <= 0) {
    // Не нашли — оставляем markdown как есть, возвращаем 0 removed
    return { markdown, removedLines: 0 };
  }

  return {
    markdown: lines.slice(cutIndex).join("\n"),
    removedLines: cutIndex,
  };
}
