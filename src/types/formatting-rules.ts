/**
 * Типы правил форматирования научных работ
 * Используются для:
 * 1. Парсинга требований из документа с помощью AI
 * 2. Анализа исходного документа на соответствие
 * 3. Применения форматирования к документу
 */

/** Выравнивание текста */
export type TextAlignment = "left" | "center" | "right" | "justify";

/** Размер страницы */
export type PageSize = "A4" | "A5" | "Letter" | "Legal";

/** Ориентация страницы */
export type PageOrientation = "portrait" | "landscape";

/** Регистр заголовка */
export type CaseStyle = "first" | "all" | "none";

/** Стиль заголовка */
export interface HeadingStyle {
  fontFamily?: string;
  fontSize?: number; // в pt
  bold?: boolean;
  italic?: boolean;
  uppercase?: boolean;
  caseStyle?: CaseStyle; // Детальный контроль регистра
  alignment?: TextAlignment;
  spaceBefore?: number; // в pt
  spaceAfter?: number; // в pt
  numbering?: boolean; // нумерация заголовков
  numberingStyle?: string; // "1, 2, 3" | "I, II, III"
  noDotAfter?: boolean; // Без точки после номера
  indent?: number; // Абзацный отступ
  newPageForEach?: boolean; // Каждый с новой страницы
  minLinesAfter?: number; // Минимум строк текста после заголовка
  avoidOrphans?: boolean; // Не оставлять заголовок внизу без текста
  wrapRules?: {
    continueWithIndent?: boolean; // Перенос с абзацным отступом
    breakOnConjunction?: boolean; // Переносить "и", "для" на новую строку
  };
}

/** Поля документа в мм */
export interface Margins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Правила изложения текста и запреты */
export interface ProhibitedFormatting {
  underline?: boolean; // Запрет подчеркивания
  colorText?: boolean; // Запрет цветного текста (кроме черного)
  hyphenation?: boolean; // Запрет переносов
  differentFonts?: boolean; // Запрет разных гарнитур
  differentSizes?: boolean; // Запрет разных размеров (кроме исключений)
}

/** Правила использования символов */
export interface SymbolRules {
  quotes?: {
    type: "angular" | "straight"; // Угловые «» vs прямые ""
    required?: boolean;
  };
  dash?: {
    hyphen: string; // "-" дефис
    enDash: string; // "–" среднее тире
    emDash: string; // "—" длинное тире (запрещено)
    prohibitEmDash?: boolean;
  };
  multiply?: {
    correctSymbol: string; // "×" правильный символ умножения
    prohibitedSymbol: string; // "*" запрещенный
  };
  ellipsis?: string; // "…" троеточие
  nonBreakingHyphen?: string; // "‑" неразрывный дефис
}

/** Правила для чисел и величин */
export interface NumberRules {
  fractions?: {
    format: "decimal" | "simple"; // Десятичные vs простые дроби
    exceptions?: string[]; // ["inches", "special"]
  };
  ranges?: {
    separator: "-" | "–"; // Дефис для диапазонов
  };
  ordinals?: {
    writeOutUpTo: number; // До 10 словами
    fallbackFormat: "numeric"; // Больше 10 цифрами с окончанием
  };
  precision?: {
    decimalPlaces?: number; // Кол-во знаков после запятой
    alignInSeries?: boolean; // Выравнивать в ряду величин
  };
}

/** Правила оформления титульного листа */
export interface TitlePageRules {
  required?: boolean;
  universityPosition?: "top" | "center";
  titlePosition?: "center";
  authorPosition?: "right" | "center";
  datePosition?: "bottom";
  excludeFromPageNumbers?: boolean;
}

/** Правила оформления оглавления */
export interface TOCRules {
  required?: boolean;
  title?: string; // "Содержание", "Оглавление"
  showPageNumbers?: boolean;
  dotLeaders?: boolean; // точки между названием и номером страницы
  maxLevel?: number; // до какого уровня заголовков включать
  excludeSubpункты?: boolean; // Не включать подпункты
  indentLevel2?: number; // Отступ для подразделов (2 знака)
  indentLevel3?: number; // Отступ для пунктов (4 знака)
}

/** Правила оформления библиографии */
export interface BibliographyRules {
  required?: boolean;
  title?: string; // "Список литературы", "Список используемой литературы и источников"
  style?: "gost" | "apa" | "mla" | "chicago" | "ieee";
  sortOrder?: "alphabetical" | "appearance"; // по алфавиту или по появлению
  numbering?: boolean;
  numberingStyle?: "1." | "1)"; // Формат нумерации
  includeAll?: boolean; // Включать все типы изданий
}

/** Правила оформления рисунков */
export interface FigureRules {
  captionPosition?: "above" | "below";
  captionPrefix?: string; // "Рис.", "Рисунок"
  captionFormat?: string; // "Рисунок {number} – {title}"
  numbering?: "continuous" | "by-chapter"; // сквозная или по главам
  appendixNumbering?: string; // "А.1, Б.2..."
  alignment?: TextAlignment;
  subcaption?: {
    position?: "between-figure-and-caption"; // Подрисуночный текст
    alignment?: TextAlignment;
  };
  spacing?: {
    before?: number; // Пустых строк до
    after?: number; // Пустых строк после
  };
  prohibitions?: {
    noWordWraps?: boolean;
    noSplitAcrossPages?: boolean;
    requireNumberAndCaption?: boolean;
  };
}

/** Правила оформления таблиц */
export interface TableRules {
  captionPosition?: "above" | "below";
  captionPrefix?: string; // "Табл.", "Таблица"
  captionFormat?: string; // "Таблица {number} – {title}"
  numbering?: "continuous" | "by-chapter";
  appendixNumbering?: string; // "А.1, Б.2..."
  headerStyle?: "bold" | "normal";
  borders?: boolean;
  fontSize?: {
    default?: number; // 12pt
    exceptional?: number; // 10pt в исключительных случаях
  };
  headers?: {
    casing?: "capitalize" | "lowercase"; // Заголовки с прописной
    subheadersCasing?: "lowercase" | "capitalize";
    singular?: boolean; // Только в единственном числе
    alignment?: TextAlignment;
  };
  content?: {
    cellAlignment?: {
      numbers?: string; // "center-top"
      text?: string; // "left-top"
    };
    repeatText?: {
      sameWord?: string; // "\"\"" кавычки для повтора
      firstRepeat?: string; // "то же"
    };
    emptyCell?: string; // "–" прочерк
  };
  continuation?: {
    showCaption?: boolean; // Только над первой частью
    label?: string; // "Продолжение таблицы {number}"
  };
  spacing?: {
    before?: number;
    after?: number;
  };
  prohibitions?: {
    noWordWrapsInCaption?: boolean;
    noDiagonalLines?: boolean;
    noNumberColumn?: boolean; // Запрет графы "№ пп"
    noEmptyCells?: boolean;
  };
}

/** Правила оформления формул */
export interface FormulaRules {
  editor?: "equation" | "text"; // Редактор формул или текст
  alignment?: TextAlignment;
  numbering?: {
    position?: "right";
    format?: string; // "({number})" в круглых скобках
    continuous?: boolean;
    appendixStyle?: string; // "(Б.1), (В.2)..."
  };
  symbols?: {
    italicByDefault?: boolean; // Автоматический курсив
    standardCompliance?: boolean; // По ГОСТ
  };
  explanations?: {
    startWith?: string; // "где"
    noColon?: boolean; // Без двоеточия после "где"
    alignment?: TextAlignment;
    indent?: number; // 12,5 мм
    orderByFormula?: boolean; // Сверху вниз, слева направо
  };
  lineBreak?: {
    allowedOn?: string[]; // ["=", "+", "-", "×", ":", "/"]
    repeatSignOnNext?: boolean;
  };
  spacing?: {
    before?: number; // 1 пустая строка
    after?: number; // 1 пустая строка (после пояснений)
  };
  multipleFormulas?: {
    separator?: string; // ","
    endWith?: string; // "."
  };
}

/** Правила оформления сносок */
export interface FootnoteRules {
  position?: "bottom" | "end"; // внизу страницы или в конце документа
  numbering?: "continuous" | "by-page" | "by-chapter";
  fontSize?: number; // обычно меньше основного текста (10pt)
  marker?: string; // "superscript-number" надстрочная цифра
  separator?: string; // "thin-line" тонкая горизонтальная линия
  indent?: number;
  prohibitions?: {
    noBibliography?: boolean; // Нельзя библиографию в сноски
  };
}

/** Правила оформления списков */
export interface ListRules {
  bulletStyle?: string; // "–", "•", "-"
  numberingStyle?: string; // "1.", "1)", "а)", "I."
  indent?: number; // отступ в мм
  spaceBetweenItems?: number; // интервал между пунктами в pt
  simple?: {
    marker?: string; // "–" только тире
    markerPosition?: "start";
    indent?: number; // 12,5 мм
    endWith?: "," | ";" | ":"; // В зависимости от сложности
  };
  nested?: {
    level1?: {
      marker?: string; // "–"
      indent?: number;
    };
    level2?: {
      marker?: string; // "а), б), в)..."
      indent?: number; // Двойной абзацный отступ
      excludeLetters?: string[]; // ["ё", "з", "й", "о", "ч", "ъ", "ы", "ь"]
    };
    level3?: {
      marker?: string; // "1), 2), 3)..."
      indent?: number; // Двойной
    };
    level4?: {
      marker?: string; // "-" дефис
      indent?: number; // Тройной
    };
  };
  prohibitions?: {
    noTablesInside?: boolean;
    noFiguresInside?: boolean;
    noFormulasInside?: boolean;
    noNotesInside?: boolean;
  };
}

/** Правила для ссылок и цитирования */
export interface ReferenceRules {
  citations?: {
    format?: string; // "[1]" | "[1, c. 5]" | "[1]-[4]"
    numberingStyle?: "continuous"; // Сквозная нумерация
    correspondToNumber?: boolean; // Соответствие номеру в списке
  };
}

/** Правила для сокращений */
export interface AbbreviationRules {
  allowed?: {
    units?: boolean; // Единицы величин (м, кг, с)
    legalForms?: boolean; // ООО, ПАО
    citations?: boolean; // При цитировании
    bibliography?: boolean; // В библиографии
  };
  prohibited?: {
    graphicalShortcuts?: string[]; // ["т.д.", "т.п.", "т.е.", "т.к.", "и др."]
    startSentenceWith?: boolean; // Нельзя начинать предложение
  };
  customList?: {
    required?: boolean; // Если >= 3 сокращений
    position?: string; // "before-main-part"
    title?: string; // "Перечень сокращений и обозначений"
  };
}

/** Правила для единиц величин */
export interface UnitRules {
  system?: string; // "SI" Международная система
  spacing?: {
    nonBreaking?: boolean; // Неразрывный пробел
    exceptions?: string[]; // ["°", "'", "\""] без пробела
  };
  currency?: {
    format?: string; // "120 р. 50 к."
    tableFormat?: string; // "руб., коп."
  };
  ranges?: {
    unitAfterLast?: boolean; // Только после последнего: "от 7 до 10 мм"
    exceptions?: string[]; // ["°C", "%", "°"] повторять для каждого
  };
  prohibitions?: {
    noMinusSign?: boolean; // Писать "минус"
    noDiameterSymbol?: boolean; // Писать "диаметр"
    noSignsWithoutValues?: boolean; // Нельзя знаки без цифр
  };
}

/** Правила для приложений */
export interface AppendixRules {
  required?: boolean;
  labeling?: {
    letters?: string; // "А, Б, В..."
    excludeLetters?: string[]; // ["Ё", "З", "Й", "О", "Ч", "Ь", "Ы", "Ъ"]
    fallbackToLatin?: string[]; // ["a, b, c..."]
    excludeLatinLetters?: string[]; // ["i", "o"]
    fallbackToNumbers?: string[]; // ["1, 2, 3..."]
  };
  format?: {
    startKeyword?: string; // "Приложение"
    alignment?: TextAlignment;
    noIndent?: boolean;
    noDot?: boolean;
    title?: {
      position?: string; // "next-line"
      alignment?: TextAlignment;
      bold?: boolean;
    };
  };
  references?: {
    orderByAppearance?: boolean;
  };
  numbering?: {
    tables?: string; // "А.1, А.2..."
    figures?: string; // "А.1, А.2..."
    formulas?: string; // "(А.1), (А.2)..."
  };
  separate?: {
    allowSeparateBook?: boolean; // Если > 2 страниц
  };
  excludeFromVolume?: boolean; // Не входят в основной объем
}

/** Правила качества оформления */
export interface QualityRules {
  pageContent?: {
    minLines?: number; // Минимум 12 строк (1/3 страницы)
    maxEmptySpace?: number; // Максимум 2/3 пустого (0.67)
  };
  textQuality?: {
    sharpness?: boolean;
    uniformDensity?: boolean;
    noBlurring?: boolean;
  };
  prohibitions?: {
    noCorrections?: boolean; // Нельзя исправления
    noErasures?: boolean;
    noDamages?: boolean;
  };
}

/** Основные правила форматирования документа */
export interface FormattingRules {
  /** Параметры страницы */
  document: {
    pageSize: PageSize;
    margins: Margins;
    orientation: PageOrientation;
  };

  /** Параметры основного текста */
  text: {
    fontFamily: string; // "Times New Roman"
    fontSize: number; // в pt, обычно 14
    lineSpacing: number; // 1.5, 2.0 и т.д.
    paragraphIndent: number; // абзацный отступ в мм, обычно 12.5
    alignment: TextAlignment;
    spaceBetweenParagraphs?: number; // интервал между абзацами в pt
  };

  /** Стили заголовков */
  headings: {
    level1: HeadingStyle;
    level2: HeadingStyle;
    level3: HeadingStyle;
    level4?: HeadingStyle;
  };

  /** Правила для списков */
  lists: ListRules;

  /** Специальные элементы документа */
  specialElements: {
    titlePage?: TitlePageRules;
    tableOfContents?: TOCRules;
    bibliography?: BibliographyRules;
    figures?: FigureRules;
    tables?: TableRules;
    footnotes?: FootnoteRules;
    formulas?: FormulaRules;
    appendices?: AppendixRules;
  };

  /** Дополнительные правила */
  additional?: {
    pageNumbering?: {
      position?: "top" | "bottom";
      alignment?: TextAlignment;
      format?: "arabic" | "roman";
      fontSize?: number; // 12pt по методичке
      startFrom?: number;
      skipFirstPage?: boolean;
      skipPages?: string[]; // ["titlePage", "task", "calendar"]
      firstNumberOn?: string; // "annotation" | "contents"
      continuous?: boolean; // Сквозная нумерация
      includeAppendices?: boolean;
    };
    nonBreakingSpaces?: {
      beforeUnits?: boolean; // перед единицами измерения
      afterInitials?: boolean; // после инициалов
      inDates?: boolean; // в датах
      betweenNumberAndUnit?: boolean; // между числом и единицей
    };
    prohibitedFormatting?: ProhibitedFormatting;
    symbolRules?: SymbolRules;
    numberRules?: NumberRules;
    referenceRules?: ReferenceRules;
    abbreviationRules?: AbbreviationRules;
    unitRules?: UnitRules;
    qualityRules?: QualityRules;
  };
}

/** Дефолтные правила по методичке ТГУ (ГОСТ) */
export const DEFAULT_GOST_RULES: FormattingRules = {
  document: {
    pageSize: "A4",
    margins: { top: 20, bottom: 20, left: 30, right: 15 }, // По методичке ТГУ п.4.1.2
    orientation: "portrait",
  },
  text: {
    fontFamily: "Times New Roman", // п.4.1.3
    fontSize: 14, // п.4.1.3
    lineSpacing: 1.5, // п.4.1.4 полуторный
    paragraphIndent: 12.5, // п.4.1.5
    alignment: "justify", // п.4.1.5 по ширине
  },
  headings: {
    // Структурные заголовки: Аннотация, Содержание, Введение, Заключение, Список литературы
    // п.5.1.1: по центру, полужирный, с прописной, без точки
    level1: {
      fontFamily: "Times New Roman",
      fontSize: 14,
      bold: true,
      caseStyle: "first", // С прописной буквы
      alignment: "center",
      spaceAfter: 12, // 1 пустая строка п.5.1.2
      numbering: true,
      numberingStyle: "1, 2, 3",
      noDotAfter: true, // п.5.2
      newPageForEach: true, // п.5.2
      indent: 12.5, // п.5.2 с абзацным отступом
      minLinesAfter: 3, // п.5.2 минимум 3 строки
      avoidOrphans: true,
      wrapRules: {
        continueWithIndent: true, // п.5.2
        breakOnConjunction: true, // п.5.2
      },
    },
    // Подразделы/параграфы п.5.2
    level2: {
      fontFamily: "Times New Roman",
      fontSize: 14,
      bold: true,
      alignment: "justify", // п.5.2 по ширине
      spaceBefore: 12, // 1 пустая строка
      spaceAfter: 12, // 1 пустая строка
      numbering: true,
      numberingStyle: "1.1, 1.2",
      noDotAfter: true,
      indent: 12.5,
      wrapRules: {
        continueWithIndent: true,
        breakOnConjunction: true,
      },
    },
    // Пункты п.5.2
    level3: {
      fontFamily: "Times New Roman",
      fontSize: 14,
      bold: true,
      alignment: "justify",
      numbering: true,
      numberingStyle: "1.1.1, 1.1.2",
      noDotAfter: true,
      indent: 12.5,
    },
    // Подпункты п.5.2
    level4: {
      fontFamily: "Times New Roman",
      fontSize: 14,
      bold: true,
      alignment: "justify",
      numbering: true,
      numberingStyle: "1.1.1.1, 1.1.1.2",
      noDotAfter: true,
      indent: 12.5,
    },
  },
  lists: {
    bulletStyle: "–", // п.5.3 только тире
    indent: 12.5, // п.5.3 с абзацного отступа
    simple: {
      marker: "–",
      indent: 12.5,
      endWith: ",", // п.5.3 запятая для простых
    },
    nested: {
      level1: {
        marker: "–",
        indent: 12.5,
      },
      level2: {
        marker: "а), б), в)...", // п.5.3
        indent: 25, // Двойной абзацный отступ
        excludeLetters: ["ё", "з", "й", "о", "ч", "ъ", "ы", "ь"],
      },
      level3: {
        marker: "1), 2), 3)...",
        indent: 25,
      },
      level4: {
        marker: "-", // Дефис п.5.3
        indent: 37.5, // Тройной
      },
    },
    prohibitions: {
      noTablesInside: true, // п.5.3
      noFiguresInside: true,
      noFormulasInside: true,
      noNotesInside: true,
    },
  },
  specialElements: {
    titlePage: {
      required: true,
      excludeFromPageNumbers: true, // п.4.1.6
    },
    tableOfContents: {
      required: true,
      title: "Содержание", // или "Оглавление" п.6.2.1
      showPageNumbers: true,
      dotLeaders: true, // п.6.2.3 отточие
      maxLevel: 3, // До пунктов
      excludeSubpункты: true, // п.6.2.2
      indentLevel2: 2, // п.6.2.4 2 знака
      indentLevel3: 4, // п.6.2.4 4 знака
    },
    bibliography: {
      required: true,
      title: "Список используемой литературы и используемых источников", // п.6.3.2
      style: "gost",
      sortOrder: "alphabetical", // п.6.3.3
      numbering: true,
      numberingStyle: "1.", // п.6.3.3 с точкой
      includeAll: true, // п.6.3.3 все типы изданий
    },
    figures: {
      captionPosition: "below", // п.5.5
      captionPrefix: "Рисунок",
      captionFormat: "Рисунок {number} – {title}", // п.5.5
      numbering: "continuous", // п.5.5 сквозная
      appendixNumbering: "А.1, Б.2...", // п.5.5
      alignment: "center",
      spacing: {
        before: 12, // 1 пустая строка п.5.5
        after: 12,
      },
      subcaption: {
        position: "between-figure-and-caption",
        alignment: "center",
      },
      prohibitions: {
        noWordWraps: true, // п.5.5
        noSplitAcrossPages: true,
        requireNumberAndCaption: true,
      },
    },
    tables: {
      captionPosition: "above", // п.5.4
      captionPrefix: "Таблица",
      captionFormat: "Таблица {number} – {title}", // п.5.4
      numbering: "continuous",
      appendixNumbering: "А.1, Б.2...",
      headerStyle: "bold",
      borders: true,
      fontSize: {
        default: 12, // п.4.1.3
        exceptional: 10, // п.4.1.3
      },
      headers: {
        casing: "capitalize", // п.5.4 с прописной
        subheadersCasing: "lowercase", // п.5.4 со строчной если одно предложение
        singular: true, // п.5.4 единственное число
        alignment: "center", // п.5.4
      },
      content: {
        cellAlignment: {
          numbers: "center-top",
          text: "left-top",
        },
        repeatText: {
          sameWord: '""', // п.5.4 кавычки
          firstRepeat: "то же",
        },
        emptyCell: "–", // п.5.4 прочерк
      },
      continuation: {
        showCaption: false, // п.5.4 только над первой частью
        label: "Продолжение таблицы {number}",
      },
      spacing: {
        before: 12, // п.5.4
        after: 12,
      },
      prohibitions: {
        noWordWrapsInCaption: true, // п.5.4
        noDiagonalLines: true, // п.5.4
        noNumberColumn: true, // п.5.4 запрет "№ пп"
        noEmptyCells: true, // п.5.4
      },
    },
    footnotes: {
      position: "bottom", // п.5.8.7
      numbering: "continuous",
      fontSize: 10, // п.4.1.3
      marker: "superscript-number", // п.5.8.7 надстрочная цифра
      separator: "thin-line", // п.5.8.7
      indent: 12.5,
      prohibitions: {
        noBibliography: true, // п.5.8.7
      },
    },
    formulas: {
      editor: "equation", // п.5.6.1 редактор формул
      alignment: "center", // п.5.6.1
      numbering: {
        position: "right", // п.5.6.2
        format: "({number})", // п.5.6.2 в круглых скобках
        continuous: true,
        appendixStyle: "(Б.1), (В.2)...",
      },
      symbols: {
        italicByDefault: true, // п.5.6.1 курсив
        standardCompliance: true, // п.5.6.3
      },
      explanations: {
        startWith: "где", // п.5.6.4
        noColon: true, // п.5.6.4 без двоеточия
        alignment: "justify",
        indent: 12.5,
        orderByFormula: true, // п.5.6.4 слева направо, сверху вниз
      },
      lineBreak: {
        allowedOn: ["=", "+", "-", "×", ":", "/"], // п.5.6.6
        repeatSignOnNext: true,
      },
      spacing: {
        before: 12, // п.5.6.7 1 пустая строка
        after: 12,
      },
      multipleFormulas: {
        separator: ",", // п.5.6.5
        endWith: ".",
      },
    },
    appendices: {
      required: false,
      labeling: {
        letters: "А, Б, В...",
        excludeLetters: ["Ё", "З", "Й", "О", "Ч", "Ь", "Ы", "Ъ"], // п.6.4.4
        fallbackToLatin: ["a, b, c..."],
        excludeLatinLetters: ["i", "o"],
        fallbackToNumbers: ["1, 2, 3..."],
      },
      format: {
        startKeyword: "Приложение", // п.6.4.4
        alignment: "center",
        noIndent: true,
        noDot: true,
        title: {
          position: "next-line", // п.6.4.5
          alignment: "center",
          bold: true,
        },
      },
      references: {
        orderByAppearance: true, // п.6.4.3
      },
      numbering: {
        tables: "А.1, А.2...",
        figures: "А.1, А.2...",
        formulas: "(А.1), (А.2)...",
      },
      separate: {
        allowSeparateBook: true, // п.6.4.8
      },
      excludeFromVolume: true, // п.6.4.2
    },
  },
  additional: {
    pageNumbering: {
      position: "bottom", // п.4.1.6
      alignment: "center",
      format: "arabic",
      fontSize: 12, // п.4.1.3
      startFrom: 1,
      skipFirstPage: true, // п.4.1.6 титульный лист
      skipPages: ["task", "calendar"], // п.4.1.6
      firstNumberOn: "annotation", // или "contents" для магистров п.4.1.6
      continuous: true, // п.4.1.6 сквозная
      includeAppendices: true, // п.4.1.6
    },
    nonBreakingSpaces: {
      beforeUnits: true, // п.4.3.5
      afterInitials: true, // п.4.3.5
      inDates: true,
      betweenNumberAndUnit: true, // п.5.10.2
    },
    prohibitedFormatting: {
      underline: true, // п.4.3.6
      colorText: true, // п.4.3.6
      hyphenation: true, // п.4.3.6
      differentFonts: true, // п.4.3.6
      differentSizes: true, // п.4.3.6
    },
    symbolRules: {
      quotes: {
        type: "angular", // п.4.3.4 угловые кавычки
        required: true,
      },
      dash: {
        hyphen: "-",
        enDash: "–",
        emDash: "—",
        prohibitEmDash: true, // п.4.3.6
      },
      multiply: {
        correctSymbol: "×",
        prohibitedSymbol: "*", // п.4.3.6
      },
      ellipsis: "…",
      nonBreakingHyphen: "‑",
    },
    numberRules: {
      fractions: {
        format: "decimal", // п.5.10.8
        exceptions: ["inches"], // 1/4"
      },
      ranges: {
        separator: "-", // п.5.10.11 дефис
      },
      ordinals: {
        writeOutUpTo: 10, // п.5.10.10
        fallbackFormat: "numeric",
      },
      precision: {
        alignInSeries: true, // п.5.10.7
      },
    },
    referenceRules: {
      citations: {
        format: "[1]", // п.5.7.1.4
        numberingStyle: "continuous", // п.5.7.1.2
        correspondToNumber: true, // п.5.7.1.2
      },
    },
    abbreviationRules: {
      allowed: {
        units: true, // п.5.9.1
        legalForms: true,
        citations: true,
        bibliography: true,
      },
      prohibited: {
        graphicalShortcuts: ["т.д.", "т.п.", "т.е.", "т.к.", "и др."], // п.5.9.3
        startSentenceWith: true, // п.5.9.3
      },
      customList: {
        required: true, // п.5.9.4 если >= 3
        position: "before-main-part",
        title: "Перечень сокращений и обозначений",
      },
    },
    unitRules: {
      system: "SI", // п.5.10.1
      spacing: {
        nonBreaking: true, // п.5.10.2
        exceptions: ["°", "'", '"'], // п.5.10.2
      },
      currency: {
        format: "120 р. 50 к.", // п.5.10.9
        tableFormat: "руб., коп.",
      },
      ranges: {
        unitAfterLast: true, // п.5.10.5
        exceptions: ["°C", "%", "°"],
      },
      prohibitions: {
        noMinusSign: true, // п.4.3.7 писать "минус"
        noDiameterSymbol: true, // п.4.3.7 писать "диаметр"
        noSignsWithoutValues: true, // п.4.3.7
      },
    },
    qualityRules: {
      pageContent: {
        minLines: 12, // п.4.3.2 минимум 1/3 страницы
        maxEmptySpace: 0.67,
      },
      textQuality: {
        sharpness: true, // п.4.3.3
        uniformDensity: true,
        noBlurring: true,
      },
      prohibitions: {
        noCorrections: true, // п.4.4.4
        noErasures: true,
        noDamages: true,
      },
    },
  },
};

/** Нарушение правила форматирования */
export interface FormattingViolation {
  /** ID правила, которое нарушено */
  ruleId: string;
  /** Путь к правилу в структуре FormattingRules */
  rulePath: string;
  /** Описание нарушения для пользователя */
  message: string;
  /** Ожидаемое значение */
  expected: string;
  /** Фактическое значение */
  actual: string;
  /** Позиция в документе */
  location: {
    paragraphIndex?: number;
    startOffset?: number;
    endOffset?: number;
    text?: string; // фрагмент текста с нарушением
  };
  /** Можно ли автоматически исправить */
  autoFixable: boolean;
}

/** Результат анализа документа */
export interface AnalysisResult {
  /** Список нарушений */
  violations: FormattingViolation[];
  /** Статистика документа */
  statistics: DocumentStatistics;
  /** Правила, которые были проверены */
  checkedRules: string[];
}

/** Статистика документа */
export interface DocumentStatistics {
  /** Общее количество символов (с пробелами) */
  totalCharacters: number;
  /** Количество символов без пробелов */
  charactersWithoutSpaces: number;
  /** Количество слов */
  wordCount: number;
  /** Примерное количество страниц */
  pageCount: number;
  /** Количество абзацев */
  paragraphCount: number;
  /** Количество изображений */
  imageCount: number;
  /** Количество таблиц */
  tableCount: number;
  /** Документ был обрезан (пробный тариф) */
  wasTruncated?: boolean;
  /** Количество страниц до обрезки */
  originalPageCount?: number;
  /** Применённый лимит страниц */
  pageLimitApplied?: number;
}
