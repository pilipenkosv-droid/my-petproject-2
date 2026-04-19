/**
 * Rule-based fallback classifier for blocks that came back as `unknown` from AI
 * (rate limit, all models down, etc.). Ensures every paragraph gets SOME blockType.
 */

import { BlockType, BlockMarkupItem } from "./block-markup-schemas";

export interface ParagraphWithMarkup {
  index: number;
  text: string;
  style?: string;
}

const SECTION_HEADING_RE =
  /^(ВВЕДЕНИЕ|ЗАКЛЮЧЕНИЕ|СОДЕРЖАНИЕ|ОГЛАВЛЕНИЕ|СПИСОК (?:ИСПОЛЬЗОВАННЫХ )?ИСТОЧНИКОВ|ЛИТЕРАТУРА|ПРИЛОЖЕНИЕ)/i;
const NUMBERED_H1_RE = /^\d+\.\s+\S/;
const NUMBERED_H2_RE = /^\d+\.\d+\.?\s+\S/;
const NUMBERED_H3_RE = /^\d+\.\d+\.\d+\.?\s+\S/;
const LIST_MARKER_RE = /^(?:[-–—•●]\s|\d+[.)]\s)/;
const CAPTION_RE = /^(?:Рисунок|Рис\.|Таблица)\s*\d+/i;

export function classifyBlockRuleBased(p: ParagraphWithMarkup): BlockType {
  const text = (p.text || "").trim();
  if (text === "") return "empty";

  // Heading-3 check before heading-2 (more specific first)
  if (NUMBERED_H3_RE.test(text)) return "heading_3";
  if (NUMBERED_H2_RE.test(text)) return "heading_2";

  const short = text.length < 60;
  if (short && SECTION_HEADING_RE.test(text)) return "heading_1";
  if (short && NUMBERED_H1_RE.test(text)) return "heading_1";

  if (CAPTION_RE.test(text)) {
    return /^Таблица/i.test(text) ? "table_caption" : "figure_caption";
  }

  if (LIST_MARKER_RE.test(text)) return "list_item";

  // Style-based hints (docx style name)
  const style = (p.style || "").toLowerCase();
  if (style.startsWith("heading 1") || style === "heading1") return "heading_1";
  if (style.startsWith("heading 2") || style === "heading2") return "heading_2";
  if (style.startsWith("heading 3") || style === "heading3") return "heading_3";
  if (style.includes("list")) return "list_item";

  return "body_text";
}

/** Fills blocks where blockType is "unknown" using rule-based classifier. */
export function fillUnknownBlocksRuleBased(
  blocks: BlockMarkupItem[],
  paragraphs: ParagraphWithMarkup[]
): { filled: number } {
  const paraMap = new Map(paragraphs.map((p) => [p.index, p]));
  let filled = 0;

  for (const b of blocks) {
    if (b.blockType !== "unknown") continue;
    const p = paraMap.get(b.paragraphIndex);
    if (!p) continue;
    const newType = classifyBlockRuleBased(p);
    if (newType !== "unknown") {
      b.blockType = newType;
      b.confidence = Math.max(b.confidence, 0.5);
      filled++;
    }
  }

  return { filled };
}
