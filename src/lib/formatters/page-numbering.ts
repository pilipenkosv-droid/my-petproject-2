/**
 * Генерация footer XML для нумерации страниц в DOCX
 *
 * Создаёт footer с полем PAGE для автоматической нумерации.
 * Поддерживает настройку выравнивания, шрифта и размера.
 */

import { FormattingRules } from "@/types/formatting-rules";

const HALF_POINTS_PER_PT = 2;

/**
 * Генерирует XML для footer с номером страницы
 */
export function buildPageNumberFooterXml(rules: FormattingRules): string {
  const pn = rules.additional?.pageNumbering;
  const fontSize = pn?.fontSize || 12;
  const sizeHalf = fontSize * HALF_POINTS_PER_PT;
  const alignment = mapAlignment(pn?.alignment || "center");
  const fontFamily = rules.text.fontFamily || "Times New Roman";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:p>
    <w:pPr>
      <w:jc w:val="${alignment}"/>
    </w:pPr>
    <w:r>
      <w:rPr>
        <w:rFonts w:ascii="${fontFamily}" w:hAnsi="${fontFamily}" w:cs="${fontFamily}"/>
        <w:sz w:val="${sizeHalf}"/>
        <w:szCs w:val="${sizeHalf}"/>
      </w:rPr>
      <w:fldChar w:fldCharType="begin"/>
    </w:r>
    <w:r>
      <w:rPr>
        <w:rFonts w:ascii="${fontFamily}" w:hAnsi="${fontFamily}" w:cs="${fontFamily}"/>
        <w:sz w:val="${sizeHalf}"/>
        <w:szCs w:val="${sizeHalf}"/>
      </w:rPr>
      <w:instrText xml:space="preserve"> PAGE </w:instrText>
    </w:r>
    <w:r>
      <w:rPr>
        <w:rFonts w:ascii="${fontFamily}" w:hAnsi="${fontFamily}" w:cs="${fontFamily}"/>
        <w:sz w:val="${sizeHalf}"/>
        <w:szCs w:val="${sizeHalf}"/>
      </w:rPr>
      <w:fldChar w:fldCharType="end"/>
    </w:r>
  </w:p>
</w:ftr>`;
}

/** OOXML relationship type для footer */
export const FOOTER_RELATIONSHIP_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer";

/** Content type для footer */
export const FOOTER_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml";

function mapAlignment(alignment: string): string {
  switch (alignment) {
    case "left": return "left";
    case "right": return "right";
    case "center": return "center";
    default: return "center";
  }
}
