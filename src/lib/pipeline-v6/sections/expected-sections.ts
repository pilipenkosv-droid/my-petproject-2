// Expected structural sections per GOST work type.
//
// Sourced from ГОСТ 7.32-2017 (общие требования к отчётам о НИР) and common
// academic conventions. Each work type lists mandatory sections with:
//   - canonical heading text (upper-cased, for heading match)
//   - synonyms accepted during detection (different capitalisation, older
//     terms, colloquial variants)
//   - per-section placeholder content inserted when section is missing,
//     giving the student a structural guide + abstract example.
//
// Reference: SecondBrain/thoughts/research/2026-04-21-diplox-formatting-world-practices.md
// world-practice pattern — "show a fishbone template so student sees expected
// information structure, not field-specific content".

export type WorkType =
  | "курсовая"
  | "диплом"
  | "вкр"
  | "магистерская"
  | "бакалаврская"
  | "реферат"
  | "отчёт"
  | "иное";

export interface ExpectedSection {
  /** Canonical uppercase heading text for insertion. */
  canonical: string;
  /** Accepted synonyms (lower-case, trimmed) for detection. */
  synonyms: string[];
  /** Whether section is mandatory for this work type. Non-mandatory means
   *  we do NOT insert a placeholder when missing — it is just optional. */
  mandatory: boolean;
  /** Body text inserted when the section is missing. Markdown-safe; will be
   *  rendered through pandoc with italic/placeholder styling. */
  placeholder: {
    /** One-sentence explanation of what the section is for (GOST context). */
    purpose: string;
    /** Bullet list of sub-items the section should usually cover. */
    structure: string[];
    /** Abstract example showing expected information density (not topic). */
    example: string;
  };
}

// Common placeholders reused across work types — declared once, referenced by
// `sections` tables below.
const SECTION_INTRO: ExpectedSection = {
  canonical: "ВВЕДЕНИЕ",
  synonyms: ["введение"],
  mandatory: true,
  placeholder: {
    purpose:
      "Во введении обосновывается выбор темы, ставится проблема исследования и задаются рамки работы. По ГОСТ 7.32-2017 — отдельный раздел, не нумеруется.",
    structure: [
      "Актуальность темы (1–2 абзаца).",
      "Степень разработанности проблемы (кто и что уже сделал).",
      "Цель работы (формулируется одним предложением).",
      "Задачи (3–5 пунктов, начинаются с глагола: «изучить…», «проанализировать…», «разработать…»).",
      "Объект и предмет исследования.",
      "Методы исследования.",
      "Научная/практическая значимость.",
      "Структура работы (1 абзац, перечисление глав).",
    ],
    example:
      "Пример: «Актуальность темы обусловлена ростом X на Y% за последние N лет. Несмотря на работы авторов A, B, C, вопрос Z остаётся открытым. Цель работы — разработать подход к … . Для достижения цели поставлены задачи: 1) изучить …; 2) проанализировать …; 3) предложить …. Объект исследования — … . Предмет — … . Методы: анализ литературы, … . Практическая значимость состоит в … . Работа состоит из введения, трёх глав, заключения и списка литературы.»",
  },
};

const SECTION_CONCLUSION: ExpectedSection = {
  canonical: "ЗАКЛЮЧЕНИЕ",
  synonyms: ["заключение", "выводы"],
  mandatory: true,
  placeholder: {
    purpose:
      "Заключение подводит итоги работы: соотнесение с задачами из введения, итоговые выводы, практическое применение. По ГОСТ 7.32-2017 — обязательный раздел, не нумеруется.",
    structure: [
      "Краткие выводы по каждой задаче из введения (в том же порядке).",
      "Главный результат работы (1–2 предложения).",
      "Теоретическая и/или практическая значимость полученных результатов.",
      "Рекомендации по применению результатов.",
      "Перспективы дальнейших исследований.",
    ],
    example:
      "Пример: «В ходе работы были решены поставленные задачи. 1) Изучены … — выявлено, что … . 2) Проанализированы …, что позволило выделить следующие критерии: … . 3) Предложен подход … , отличающийся от существующих тем, что … . Основной результат работы — … . Практическая значимость состоит в возможности применения … для … . Перспективы дальнейших исследований связаны с … .»",
  },
};

const SECTION_REFERENCES: ExpectedSection = {
  canonical: "СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ",
  synonyms: [
    "список литературы",
    "список использованных источников",
    "список источников",
    "список использованной литературы",
    "библиографический список",
    "список использованных источников и литературы",
  ],
  mandatory: true,
  placeholder: {
    purpose:
      "Список источников оформляется по ГОСТ 7.1-2003 или ГОСТ Р 7.0.100-2018. Обязательный раздел, нумерация сквозная, ссылки в тексте — в квадратных скобках.",
    structure: [
      "Не менее 20 источников (для ВКР/диплома — от 30).",
      "Источники разных типов: книги, статьи, нормативные акты, электронные ресурсы.",
      "Давность основной части: не старше 5 лет (для нормативных — действующая редакция).",
      "Оформление: автор → название → город → издательство → год → страницы.",
      "Электронные источники: URL + дата обращения.",
      "Иностранные источники допускаются (отдельный блок или в общем списке).",
    ],
    example:
      "Пример оформления:\n\n1. Иванов И. И. Название книги / И. И. Иванов. — Москва : Наука, 2024. — 320 с.\n2. Петров П. П. Название статьи // Название журнала. — 2023. — № 4. — С. 15–22.\n3. ГОСТ 7.32-2017. Отчёт о научно-исследовательской работе. — Москва : Стандартинформ, 2017. — 32 с.\n4. Название сайта [Электронный ресурс]. — URL: https://example.com/article (дата обращения: 01.04.2026).",
  },
};

const SECTION_ABSTRACT: ExpectedSection = {
  canonical: "РЕФЕРАТ",
  synonyms: ["реферат", "аннотация"],
  mandatory: true,
  placeholder: {
    purpose:
      "Реферат/аннотация — краткое изложение работы. По ГОСТ 7.32-2017 обязателен для ВКР, дипломной и магистерской работ. Объём — до 1 страницы.",
    structure: [
      "Сведения об объёме работы: N страниц, M рисунков, K таблиц, L источников, P приложений.",
      "Перечень ключевых слов (5–15 слов, заглавными буквами через запятую).",
      "Текст реферата: объект, цель, методы, полученные результаты, рекомендации по применению.",
    ],
    example:
      "Пример: «Работа выполнена на 70 страницах, содержит 12 рисунков, 8 таблиц, 35 источников, 2 приложения.\n\nКЛЮЧЕВЫЕ СЛОВА: СЛОВО1, СЛОВО2, СЛОВО3, СЛОВО4, СЛОВО5.\n\nОбъект исследования — … . Цель работы — … . Методы — … . В результате предложен … . Полученные результаты могут быть применены в … .»",
  },
};

const SECTION_TOC: ExpectedSection = {
  canonical: "СОДЕРЖАНИЕ",
  synonyms: ["содержание", "оглавление"],
  mandatory: true,
  placeholder: {
    purpose:
      "Содержание перечисляет все структурные элементы работы с номерами страниц. По ГОСТ 7.32-2017 — отдельная страница, не нумеруется.",
    structure: [
      "Введение.",
      "Нумерованные главы (1, 2, 3) с подглавами (1.1, 1.2).",
      "Заключение.",
      "Список использованных источников.",
      "Приложения (если есть).",
    ],
    example:
      "Заполняется автоматически на основе заголовков вашей работы.",
  },
};

// Base mandatory sections — intro, conclusion, references. These are required
// across all academic work types in Russian academic convention.
const BASE_SECTIONS = [SECTION_INTRO, SECTION_CONCLUSION, SECTION_REFERENCES];

export const EXPECTED_SECTIONS: Record<WorkType, ExpectedSection[]> = {
  курсовая: [SECTION_TOC, ...BASE_SECTIONS],
  диплом: [SECTION_ABSTRACT, SECTION_TOC, ...BASE_SECTIONS],
  вкр: [SECTION_ABSTRACT, SECTION_TOC, ...BASE_SECTIONS],
  магистерская: [SECTION_ABSTRACT, SECTION_TOC, ...BASE_SECTIONS],
  бакалаврская: [SECTION_ABSTRACT, SECTION_TOC, ...BASE_SECTIONS],
  реферат: [SECTION_TOC, SECTION_INTRO, SECTION_CONCLUSION, SECTION_REFERENCES],
  // Отчёт по практике has its own specifics (company description, daily log),
  // but the three base sections are still required.
  "отчёт": [SECTION_TOC, ...BASE_SECTIONS],
  иное: [SECTION_TOC, ...BASE_SECTIONS],
};

/** Resolve expected sections list by work type. Falls back to `иное`. */
export function expectedSectionsFor(type: WorkType | null | undefined): ExpectedSection[] {
  if (type && EXPECTED_SECTIONS[type]) return EXPECTED_SECTIONS[type];
  return EXPECTED_SECTIONS.иное;
}
