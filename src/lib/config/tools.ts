import {
  ListTree,
  BookOpen,
  Pencil,
  SpellCheck,
  Sparkles,
  FileCheck,
} from "lucide-react";

export const DIPLOX_TOOLS = {
  outline: { toolName: "Генератор плана", href: "/outline", icon: ListTree },
  sources: { toolName: "Подбор литературы", href: "/sources", icon: BookOpen },
  rewrite: { toolName: "Повышение уникальности", href: "/rewrite", icon: Pencil },
  grammar: { toolName: "Проверка грамматики", href: "/grammar", icon: SpellCheck },
  summarize: { toolName: "Краткое содержание", href: "/summarize", icon: Sparkles },
  create: { toolName: "Форматирование по ГОСТу", href: "/create", icon: FileCheck },
};
