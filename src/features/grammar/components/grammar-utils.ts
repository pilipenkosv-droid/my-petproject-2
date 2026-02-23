import type { GrammarCategory } from "@/lib/grammar/types";

/**
 * Цвета подсветки по категории ошибки
 */
export function getCategoryHighlight(category: GrammarCategory): string {
  switch (category) {
    case "SPELLING":
    case "TYPOS":
      return "bg-red-500/15 border-b-2 border-red-500 cursor-pointer";
    case "STYLE":
    case "CONFUSED_WORDS":
      return "bg-amber-500/15 border-b-2 border-amber-500 cursor-pointer";
    case "PUNCTUATION":
      return "bg-blue-500/15 border-b-2 border-blue-500 cursor-pointer";
    case "GRAMMAR":
      return "bg-brand-1/15 border-b-2 border-brand-1 cursor-pointer";
    case "CASING":
    case "OTHER":
    default:
      return "bg-gray-500/15 border-b-2 border-gray-500 cursor-pointer";
  }
}

/**
 * Цвета для Badge категории
 */
export function getCategoryColor(category: GrammarCategory): {
  bg: string;
  text: string;
  dot: string;
} {
  switch (category) {
    case "SPELLING":
    case "TYPOS":
      return {
        bg: "bg-red-500/15",
        text: "text-red-600 dark:text-red-400",
        dot: "bg-red-500",
      };
    case "STYLE":
    case "CONFUSED_WORDS":
      return {
        bg: "bg-amber-500/15",
        text: "text-amber-600 dark:text-amber-400",
        dot: "bg-amber-500",
      };
    case "PUNCTUATION":
      return {
        bg: "bg-blue-500/15",
        text: "text-blue-600 dark:text-blue-400",
        dot: "bg-blue-500",
      };
    case "GRAMMAR":
      return {
        bg: "bg-brand-1/15",
        text: "text-brand-2 dark:text-brand-1",
        dot: "bg-brand-1",
      };
    case "CASING":
    case "OTHER":
    default:
      return {
        bg: "bg-gray-500/15",
        text: "text-gray-600 dark:text-gray-400",
        dot: "bg-gray-500",
      };
  }
}

/**
 * Русские названия категорий
 */
export function getCategoryLabel(category: GrammarCategory): string {
  switch (category) {
    case "SPELLING":
      return "Орфография";
    case "TYPOS":
      return "Опечатка";
    case "STYLE":
      return "Стиль";
    case "CONFUSED_WORDS":
      return "Путаница слов";
    case "PUNCTUATION":
      return "Пунктуация";
    case "GRAMMAR":
      return "Грамматика";
    case "CASING":
      return "Регистр";
    case "OTHER":
    default:
      return "Другое";
  }
}

/**
 * Сгруппированные метки категорий для статистики
 */
export function getStatsCategoryLabel(category: string): string {
  switch (category) {
    case "SPELLING":
    case "TYPOS":
      return "орфография";
    case "STYLE":
    case "CONFUSED_WORDS":
      return "стиль";
    case "PUNCTUATION":
      return "пунктуация";
    case "GRAMMAR":
      return "грамматика";
    case "CASING":
      return "регистр";
    default:
      return "другое";
  }
}
