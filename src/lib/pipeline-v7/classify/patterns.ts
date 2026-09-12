/**
 * Text patterns of Russian academic papers (ГОСТ 7.32 shapes).
 *
 * Every pattern is deliberately narrow: a false heading costs more than a
 * missed one, because the residue goes to the LLM layer, while a wrongly
 * promoted sentence silently restructures the document.
 */

import { headingRole, type Role } from "./types";

export interface TextVerdict {
  role: Role;
  confidence: number;
  /**
   * The verdict rests on a leading number and nothing else. "1.5 млн рублей"
   * has the shape of a heading and is a sentence, so the caller must find a
   * formatting signal before promoting it.
   */
  needsSignal?: boolean;
}

const SECTION_NAMES = [
  "ВВЕДЕНИЕ",
  "ЗАКЛЮЧЕНИЕ",
  "СОДЕРЖАНИЕ",
  "ОГЛАВЛЕНИЕ",
  "СПИСОК (?:ИСПОЛЬЗОВАННЫХ |ИСПОЛЬЗОВАННОЙ )?(?:ИСТОЧНИКОВ|ЛИТЕРАТУРЫ)(?: И ЛИТЕРАТУРЫ)?",
  "ЛИТЕРАТУРА",
  "БИБЛИОГРАФИЧЕСКИЙ СПИСОК",
  "РЕФЕРАТ",
  "АННОТАЦИЯ",
  "ABSTRACT",
  "ОПРЕДЕЛЕНИЯ",
  "ТЕРМИНЫ И ОПРЕДЕЛЕНИЯ",
  "ОБОЗНАЧЕНИЯ И СОКРАЩЕНИЯ",
  "ПЕРЕЧЕНЬ СОКРАЩЕНИЙ.*",
  "НОРМАТИВНЫЕ ССЫЛКИ",
  "ВЫВОДЫ",
].join("|");

const SECTION_RE = new RegExp(`^(?:\\d+(?:\\.\\d+)*\\.?\\s+)?(?:${SECTION_NAMES})\\s*\\.?$`, "iu");
const TOC_NAME_RE = /^(?:\d+\.?\s+)?(?:СОДЕРЖАНИЕ|ОГЛАВЛЕНИЕ)\s*\.?$/iu;
const BIBLIO_NAME_RE = new RegExp(
  "^(?:\\d+(?:\\.\\d+)*\\.?\\s+)?(?:СПИСОК (?:ИСПОЛЬЗОВАННЫХ |ИСПОЛЬЗОВАННОЙ )?" +
    "(?:ИСТОЧНИКОВ|ЛИТЕРАТУРЫ)(?: И ЛИТЕРАТУРЫ)?|ЛИТЕРАТУРА|БИБЛИОГРАФИЧЕСКИЙ СПИСОК)\\s*\\.?$",
  "iu"
);
const APPENDIX_RE = /^ПРИЛОЖЕНИЕ\s+[А-ЯA-Z\d]+/iu;

const TABLE_CAPTION_RE = /^Таблица\s+[\dА-ЯA-Z.]+\s*[—–-]/iu;
const TABLE_BARE_RE = /^Таблица\s+\d+(?:\.\d+)?$/iu;
const FIGURE_CAPTION_RE = /^(?:Рисунок|Рис\.)\s+[\dА-ЯA-Z.]+\s*[—–-]?/iu;

const NUMBERED_RE = /^(\d+(?:\.\d+){0,2})\.?\s+\S/u;
const TOO_DEEP_RE = /^\d+\.\d+\.\d+\.\d+/u;
const CHAPTER_RE = /^(?:ГЛАВА|РАЗДЕЛ)\s+\d+/iu;
const SENTENCE_TAIL_RE = /[.;,:]$/u;

export const MAX_SECTION_LEN = 80;
export const MAX_HEADING_LEN = 120;

/** Collapses whitespace so rules see one canonical form of the text. */
export function normalizeText(raw: string): string {
  return raw.normalize("NFC").replace(/[\s ]+/gu, " ").trim();
}

export function matchCaption(text: string): TextVerdict | undefined {
  if (TABLE_CAPTION_RE.test(text)) return { role: "table_caption", confidence: 0.95 };
  if (FIGURE_CAPTION_RE.test(text)) return { role: "figure_caption", confidence: 0.95 };
  if (TABLE_BARE_RE.test(text)) return { role: "table_caption", confidence: 0.8 };
  return undefined;
}

export function matchSectionName(text: string): TextVerdict | undefined {
  if (text.length <= MAX_SECTION_LEN && APPENDIX_RE.test(text)) {
    return { role: "appendix_heading", confidence: 0.95 };
  }
  if (text.length > MAX_SECTION_LEN || !SECTION_RE.test(text)) return undefined;
  if (TOC_NAME_RE.test(text)) return { role: "toc", confidence: 0.95 };
  return { role: "heading_L1", confidence: 0.95 };
}

/** True for the heading that opens a bibliography region. */
export function isBibliographyHeading(text: string): boolean {
  return text.length <= MAX_SECTION_LEN && BIBLIO_NAME_RE.test(text);
}

export function matchNumberedHeading(text: string): TextVerdict | undefined {
  if (text.length > MAX_HEADING_LEN || SENTENCE_TAIL_RE.test(text)) return undefined;
  if (CHAPTER_RE.test(text)) return { role: "heading_L1", confidence: 0.85 };
  if (TOO_DEEP_RE.test(text)) return undefined;
  const m = NUMBERED_RE.exec(text);
  if (!m) return undefined;
  return { role: headingRole(m[1].split(".").length), confidence: 0.85, needsSignal: true };
}
