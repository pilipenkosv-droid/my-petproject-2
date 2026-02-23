import Link from "next/link";
import {
  FileCheck,
  ListTree,
  SpellCheck,
  Pencil,
  BookOpen,
  Sparkles,
} from "lucide-react";

const TOOLS = [
  {
    slug: "create",
    href: "/create",
    label: "Форматирование по ГОСТу",
    description: "Автоматическое оформление документа",
    icon: FileCheck,
    gradient: "from-brand-2 to-brand-3",
  },
  {
    slug: "outline",
    href: "/outline",
    label: "Генератор плана",
    description: "Структура работы с разделами",
    icon: ListTree,
    gradient: "from-brand-teal to-brand-teal-dark",
  },
  {
    slug: "grammar",
    href: "/grammar",
    label: "Проверка грамматики",
    description: "Орфография, пунктуация, стиль",
    icon: SpellCheck,
    gradient: "from-brand-1 to-brand-2",
  },
  {
    slug: "rewrite",
    href: "/rewrite",
    label: "Повышение уникальности",
    description: "Рерайт с сохранением смысла",
    icon: Pencil,
    gradient: "from-brand-teal-dark to-brand-3",
  },
  {
    slug: "summarize",
    href: "/summarize",
    label: "Краткое содержание",
    description: "AI-аннотация вашей работы",
    icon: Sparkles,
    gradient: "from-brand-teal-light to-brand-teal",
  },
  {
    slug: "sources",
    href: "/sources",
    label: "Подбор литературы",
    description: "Научные источники по теме",
    icon: BookOpen,
    gradient: "from-brand-3 to-brand-2",
  },
];

interface RelatedToolsProps {
  currentTool: string;
  title?: string;
}

export function RelatedTools({
  currentTool,
  title = "Другие инструменты",
}: RelatedToolsProps) {
  const related = TOOLS.filter((t) => t.slug !== currentTool);

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-foreground mb-4 text-center">
        {title}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {related.map((tool) => {
          const Icon = tool.icon;
          return (
            <Link
              key={tool.slug}
              href={tool.href}
              className="flex items-center gap-4 bg-surface rounded-xl border border-surface-border p-4 hover:bg-surface-hover transition-colors group"
            >
              <div
                className={`w-10 h-10 rounded-xl bg-gradient-to-br ${tool.gradient} flex items-center justify-center shrink-0`}
              >
                <Icon className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-foreground text-sm group-hover:text-primary transition-colors">
                  {tool.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  {tool.description}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
