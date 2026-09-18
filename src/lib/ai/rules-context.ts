/**
 * Что именно уезжает в модель при извлечении правил: весь текст методички
 * или отобранные ретривом фрагменты. Вынесено из provider.ts, чтобы файл
 * извлечения остался обозримым.
 */

import { prefilterGuidelines } from "./rules-prefilter";
import { segmentGuidelines } from "./guidelines/segment";
import {
  selectRelevantUnits,
  buildRetrievalContext,
  RETRIEVAL_BUDGET_MS,
  type RetrievalStats,
} from "./guidelines/retrieval";

/**
 * До этой длины методичка уезжает в модель целиком.
 *
 * Бенч 18.09 показал: на фильтрованном контексте теряется ~8 п.п. требований,
 * а денег фильтр не экономит — счёт делают выходные токены. Значит отбор
 * оправдан только там, где полный текст уже не помещается в разумный запрос.
 * Переопределяется переменной окружения RULES_FULLTEXT_MAX_CHARS.
 */
export const RULES_FULLTEXT_MAX_CHARS = Number(
  process.env.RULES_FULLTEXT_MAX_CHARS ?? 25_000
);

export interface ExtractionContext {
  /** Что уедет в промпт: либо весь текст, либо отобранные единицы с [uN]. */
  text: string;
  /** Просить ли у модели provenance (есть ли в тексте метки [uN]). */
  provenance: boolean;
  droppedChars: number;
  retrieval?: RetrievalStats;
  /** Номера отобранных единиц — чтобы можно было проверить provenance модели. */
  unitIds?: number[];
}

/**
 * Политика длины: короткую методичку модель видит целиком, длинную —
 * через ретрив по 14 темам оформления. Фильтрация коротких текстов не окупается
 * (бенч 18.09: −8 п.п. требований и ноль экономии), поэтому порога два не бывает.
 */
export async function buildExtractionContext(
  requirementsText: string,
  deadline?: number
): Promise<ExtractionContext> {
  if (requirementsText.length <= RULES_FULLTEXT_MAX_CHARS) {
    return { text: requirementsText, provenance: false, droppedChars: 0 };
  }

  const units = segmentGuidelines(requirementsText);
  const selection = await selectRelevantUnits(units, {
    deadline,
    budgetMs: RETRIEVAL_BUDGET_MS,
  });

  // Отбор пустой — отдать модели пустоту хуже, чем длинный текст:
  // пусть сработает старый предфильтр по регуляркам.
  if (selection.units.length === 0) {
    const prefiltered = prefilterGuidelines(requirementsText);
    return {
      text: prefiltered.text,
      provenance: false,
      droppedChars: prefiltered.droppedChars,
      retrieval: selection.stats,
    };
  }

  const text = buildRetrievalContext(selection.units);
  console.log(
    `[provider] Ретрив (${selection.stats.mode}): ${units.length} единиц → ` +
      `${selection.stats.unitsSelected}, ${requirementsText.length} → ${text.length} символов, ` +
      `$${selection.stats.costUsd.toFixed(6)}`
  );
  return {
    text,
    provenance: true,
    unitIds: selection.units.map((u) => u.i),
    droppedChars: Math.max(0, requirementsText.length - selection.stats.charsOut),
    retrieval: selection.stats,
  };
}
