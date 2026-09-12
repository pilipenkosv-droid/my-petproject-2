// Общие хелперы для генерации корпуса pipeline-v7: шрифт/размеры, русский
// filler-текст и сборка типового ГОСТ-скелета студенческой работы
// (титульный лист → СОДЕРЖАНИЕ → ВВЕДЕНИЕ → 1 ГЛАВА (1.1/1.2) → ЗАКЛЮЧЕНИЕ →
// СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ), чтобы классификация структуры тоже
// тестировалась на каждом документе корпуса.
import { AlignmentType, HeadingLevel, Paragraph, TextRun } from "docx";
import type { FileChild } from "docx";

export const FONT = "Times New Roman";
export const BASE_SIZE = 28; // 14pt in half-points

export function half(pt: number): number {
  return pt * 2;
}

// Нейтральный, обобщённый филлер — без реальных имён, псевдо-академический тон.
export const FILLER: readonly string[] = [
  "Рассматриваемый процесс характеризуется совокупностью взаимосвязанных параметров, влияющих на итоговый результат.",
  "В рамках данного раздела проводится последовательный анализ исходных данных и формулируются промежуточные выводы.",
  "Согласно принятой методике, объект исследования описывается через набор показателей, допускающих количественную оценку.",
  "Полученные результаты сопоставляются с базовыми значениями, установленными на предыдущем этапе работы.",
  "Дальнейшее изложение материала опирается на структуру, принятую в соответствующей предметной области.",
  "Отдельное внимание уделяется факторам, оказывающим наибольшее влияние на устойчивость рассматриваемой системы.",
  "Приведённые данные позволяют сформировать целостное представление о характере изучаемого явления.",
  "Совокупность рассмотренных подходов формирует основу для практических рекомендаций, изложенных ниже.",
];

export function fillerText(index: number): string {
  return FILLER[index % FILLER.length];
}

export function fillerParagraphs(n: number, startAt = 0): Paragraph[] {
  const out: Paragraph[] = [];
  for (let i = 0; i < n; i++) {
    out.push(
      new Paragraph({
        spacing: { after: 120, line: 360 },
        children: [new TextRun({ text: fillerText(startAt + i), font: FONT, size: BASE_SIZE })],
      }),
    );
  }
  return out;
}

export function bodyPara(text: string, opts?: { bold?: boolean; center?: boolean }): Paragraph {
  return new Paragraph({
    alignment: opts?.center ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { after: 120, line: 360 },
    children: [new TextRun({ text, font: FONT, size: BASE_SIZE, bold: opts?.bold ?? false })],
  });
}

export function heading1(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.CENTER,
    spacing: { before: 240, after: 240 },
    children: [new TextRun({ text: text.toUpperCase(), font: FONT, size: half(16), bold: true })],
  });
}

export function heading2(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 160 },
    children: [new TextRun({ text, font: FONT, size: half(14), bold: true })],
  });
}

/** Синтетический титульный лист — без реальных вузов/имён, только форма ГОСТ. */
export function titlePageParagraphs(workTitle: string, workTypeLabel: string): Paragraph[] {
  return [
    bodyPara("МИНИСТЕРСТВО ОБРАЗОВАНИЯ И НАУКИ (синтетический пример)", { center: true }),
    bodyPara("Условное образовательное учреждение «Институт прикладных исследований»", { center: true }),
    new Paragraph({ children: [new TextRun({ text: "", font: FONT, size: BASE_SIZE })], spacing: { after: 600 } }),
    bodyPara(workTypeLabel, { center: true, bold: true }),
    bodyPara(`«${workTitle}»`, { center: true, bold: true }),
    new Paragraph({ children: [new TextRun({ text: "", font: FONT, size: BASE_SIZE })], spacing: { after: 600 } }),
    bodyPara("Выполнил: студент группы УС-101 Иванов И. И. (синтетическое имя)"),
    bodyPara("Руководитель: доцент Петрова А. С. (синтетическое имя)"),
    new Paragraph({ children: [new TextRun({ text: "", font: FONT, size: BASE_SIZE })], spacing: { after: 600 } }),
    bodyPara("Москва, 2026", { center: true }),
  ];
}

export function contentsPlaceholder(): Paragraph[] {
  return [
    heading1("Содержание"),
    bodyPara("Введение ................................................................. 3"),
    bodyPara("1 Обзор предметной области ...................................... 4"),
    bodyPara("1.1 Постановка задачи ............................................... 4"),
    bodyPara("1.2 Анализ существующих решений .......................... 5"),
    bodyPara("Заключение ............................................................. 8"),
    bodyPara("Список использованных источников ........................ 9"),
  ];
}

export function introductionSection(): Paragraph[] {
  return [heading1("Введение"), ...fillerParagraphs(3, 0)];
}

export function chapterHeading(): Paragraph {
  return heading1("1 Обзор предметной области");
}

export function subheading11(): Paragraph {
  return heading2("1.1 Постановка задачи");
}

export function subheading12(): Paragraph {
  return heading2("1.2 Анализ существующих решений");
}

export function conclusionSection(): Paragraph[] {
  return [heading1("Заключение"), ...fillerParagraphs(2, 4)];
}

export function bibliographyHeading(): Paragraph {
  return heading1("Список использованных источников");
}

export function shortBibliographyPlaceholder(): Paragraph[] {
  return [
    bodyPara("1. Автор Ф. И. Название работы. — Город : Изд-во, 2021. — 150 с."),
    bodyPara("2. Автор Ф. И. Название статьи // Научный журнал. — 2022. — № 4. — С. 5–12."),
    bodyPara("3. Название источника [Электронный ресурс]. URL: https://example.invalid (дата обращения: 01.02.2024)."),
  ];
}

export interface GostShellOptions {
  title: string;
  workTypeLabel?: string;
  /** Вставляется внутрь главы 1, после 1.1, перед/вместо 1.2 — специфика хазарда. */
  chapterBody: readonly FileChild[];
  /** По умолчанию — короткая ссылка-плейсхолдер; для doc11 передаётся полный список. */
  bibliography?: readonly FileChild[];
  /** По умолчанию — плейсхолдер-текст «Содержание»; для doc10 передаётся реальное TOC-поле. */
  contents?: readonly FileChild[];
}

/** Собирает типовой ГОСТ-скелет одним массивом children для секции. */
export function buildGostShell(opts: GostShellOptions): FileChild[] {
  return [
    ...titlePageParagraphs(opts.title, opts.workTypeLabel ?? "КУРСОВАЯ РАБОТА"),
    ...(opts.contents ?? contentsPlaceholder()),
    ...introductionSection(),
    chapterHeading(),
    subheading11(),
    ...fillerParagraphs(2, 1),
    subheading12(),
    ...opts.chapterBody,
    ...conclusionSection(),
    bibliographyHeading(),
    ...(opts.bibliography ?? shortBibliographyPlaceholder()),
  ];
}
