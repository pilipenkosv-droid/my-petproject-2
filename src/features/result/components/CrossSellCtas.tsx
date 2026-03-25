import Link from "next/link";
import { RefreshCw, FileText, SpellCheck, BookOpen } from "lucide-react";

const ctas = [
  {
    label: "Уникальность",
    description: "Переписать текст",
    href: "/rewrite",
    icon: RefreshCw,
  },
  {
    label: "Аннотация",
    description: "Создать с помощью AI",
    href: "/summarize",
    icon: FileText,
  },
  {
    label: "Грамматика",
    description: "Проверить на ошибки",
    href: "/grammar",
    icon: SpellCheck,
  },
  {
    label: "Источники",
    description: "Подобрать литературу",
    href: "/sources",
    icon: BookOpen,
  },
];

export function CrossSellCtas() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {ctas.map((cta) => (
        <Link
          key={cta.href}
          href={cta.href}
          className="flex items-center gap-3 border border-surface-border bg-surface p-4 transition-all duration-200 hover:bg-surface-hover hover:border-foreground/20"
        >
          <div className="w-9 h-9 bg-foreground flex items-center justify-center shrink-0">
            <cta.icon className="w-4 h-4 text-background" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{cta.label}</p>
            <p className="text-xs text-on-surface-subtle truncate">{cta.description}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
