import Link from "next/link";
import { Logo } from "@/components/Logo";

const footerLinks = {
  tools: {
    title: "Инструменты",
    links: [
      { label: "Форматирование", href: "/create" },
      { label: "Генератор плана", href: "/outline" },
      { label: "Проверка грамматики", href: "/grammar" },
      { label: "Повышение уникальности", href: "/rewrite" },
      { label: "Краткое содержание", href: "/summarize" },
      { label: "Подбор литературы", href: "/sources" },
    ],
  },
  info: {
    title: "Информация",
    links: [
      { label: "Тарифы", href: "/pricing" },
      { label: "О сервисе", href: "/about" },
      { label: "Блог", href: "/blog" },
    ],
  },
  support: {
    title: "Поддержка",
    links: [
      { label: "FAQ", href: "/faq" },
    ],
  },
};

export function Footer() {
  return (
    <footer className="border-t border-surface-border bg-surface/50 backdrop-blur-sm">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-2 sm:col-span-1">
            <Logo variant="favicon" size={28} withText />
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              Инструменты для оформления и подготовки научных работ
            </p>
          </div>

          {/* Link columns */}
          {Object.values(footerLinks).map((section) => (
            <div key={section.title}>
              <h3 className="text-sm font-semibold text-foreground mb-3">
                {section.title}
              </h3>
              <ul className="space-y-2">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-10 pt-6 border-t border-surface-border flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} <span className="font-logo font-bold">Diplox</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Сервис автоматического форматирования документов
          </p>
        </div>
      </div>
    </footer>
  );
}
