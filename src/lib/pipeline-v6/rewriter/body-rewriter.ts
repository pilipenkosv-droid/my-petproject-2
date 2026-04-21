// Body Rewriter — LLM rewrites ONLY body paragraph slots.
// Never touches headings, tables, formulas, lists — those come from extractor.
//
// Strategy:
//   1. Split extracted markdown into slots: { kind: "body" | "frozen", text }
//      Frozen = headings, tables, list items, formulas. LLM sees but cannot edit.
//   2. For each body slot, send to LLM with surrounding frozen context as read-only.
//   3. Collect rewrites, stitch back into markdown preserving positions.
//
// LLM returns { rewrittenText } per slot; frozen slots pass through untouched.

import { z } from "zod";
import { callAI } from "../../ai/gateway";

export type SlotKind = "body" | "frozen";

export interface Slot {
  kind: SlotKind;
  text: string;
  /** 0-based index in original line array. */
  startLine: number;
  endLine: number;
  /** Why frozen (for debug). */
  frozenReason?: string;
}

export interface RewriteOptions {
  /** System instruction (e.g. "ты редактор ГОСТ дипломов"). */
  systemPrompt?: string;
  /** Skip LLM call, return slots unchanged. Used in tests. */
  dryRun?: boolean;
  /** Max paragraphs per LLM call (batch). Default 1 = one call per body slot. */
  batchSize?: number;
}

const DEFAULT_SYSTEM_PROMPT = [
  "Ты редактор академических текстов по ГОСТ 7.32.",
  "Перепиши данный абзац, сохраняя смысл и тезисы. Требования:",
  "- Убрать разговорные обороты и орфографические ошибки.",
  "- Убрать множественные пробелы и подряд идущие знаки препинания.",
  "- Не добавлять заголовки, списки, таблицы — только связный текст.",
  "- Сохранить длину примерно такой же (±20%).",
  "- Русский язык. Научный стиль. Безличные конструкции.",
].join("\n");

const RewriteResponseSchema = z.object({
  rewrittenText: z.string(),
});

const HEADING_REGEX = /^#{1,6}\s/;
const LIST_ITEM_REGEX = /^\s*(?:[-*+]|\d+\.)\s+/;
const TABLE_ROW_REGEX = /^\s*\|.*\|\s*$/;
const FENCE_REGEX = /^(```|~~~)/;

export function splitIntoSlots(markdown: string): Slot[] {
  const lines = markdown.split("\n");
  const slots: Slot[] = [];
  let inFence = false;
  let buffer: string[] = [];
  let bufferStart = 0;

  const flushBody = (endLine: number) => {
    const text = buffer.join("\n").trim();
    if (text.length > 0) {
      slots.push({ kind: "body", text, startLine: bufferStart, endLine });
    }
    buffer = [];
  };

  lines.forEach((line, idx) => {
    if (FENCE_REGEX.test(line)) {
      flushBody(idx - 1);
      inFence = !inFence;
      slots.push({
        kind: "frozen",
        text: line,
        startLine: idx,
        endLine: idx,
        frozenReason: "code-fence",
      });
      return;
    }
    if (inFence) {
      slots.push({ kind: "frozen", text: line, startLine: idx, endLine: idx, frozenReason: "code-block" });
      return;
    }
    if (HEADING_REGEX.test(line)) {
      flushBody(idx - 1);
      slots.push({ kind: "frozen", text: line, startLine: idx, endLine: idx, frozenReason: "heading" });
      return;
    }
    if (TABLE_ROW_REGEX.test(line)) {
      flushBody(idx - 1);
      slots.push({ kind: "frozen", text: line, startLine: idx, endLine: idx, frozenReason: "table" });
      return;
    }
    if (LIST_ITEM_REGEX.test(line)) {
      flushBody(idx - 1);
      slots.push({ kind: "frozen", text: line, startLine: idx, endLine: idx, frozenReason: "list" });
      return;
    }
    if (line.trim() === "") {
      if (buffer.length > 0) flushBody(idx - 1);
      return;
    }
    if (buffer.length === 0) bufferStart = idx;
    buffer.push(line);
  });
  flushBody(lines.length - 1);
  return slots;
}

export async function rewriteSlot(
  slot: Slot,
  opts: RewriteOptions = {},
): Promise<string> {
  if (slot.kind !== "body" || opts.dryRun) return slot.text;

  const response = await callAI({
    systemPrompt: opts.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
    userPrompt: [
      "Перепиши следующий абзац по правилам выше.",
      "Верни JSON { \"rewrittenText\": string }.",
      "",
      "Абзац:",
      slot.text,
    ].join("\n"),
    temperature: 0.2,
  });

  const parsed = RewriteResponseSchema.safeParse(response.json);
  if (!parsed.success) {
    throw new Error(`LLM returned malformed rewrite: ${parsed.error.message}`);
  }
  return parsed.data.rewrittenText;
}

export async function rewriteBody(
  markdown: string,
  opts: RewriteOptions = {},
): Promise<{ markdown: string; slotsTotal: number; slotsRewritten: number }> {
  const slots = splitIntoSlots(markdown);
  let rewritten = 0;
  const rebuilt: string[] = [];
  for (const slot of slots) {
    if (slot.kind === "body") {
      const newText = await rewriteSlot(slot, opts);
      rebuilt.push(newText);
      if (newText !== slot.text) rewritten++;
    } else {
      rebuilt.push(slot.text);
    }
  }
  return {
    markdown: rebuilt.join("\n\n"),
    slotsTotal: slots.length,
    slotsRewritten: rewritten,
  };
}
