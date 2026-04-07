import Link from "next/link";
import { Logo } from "@/components/Logo";

const footerLinks = {
  tools: {
    title: "Инструменты",
    links: [
      { label: "Форматирование", href: "/create" },
      { label: "Генератор плана", href: "/outline" },
      { label: "Проверка грамматики", href: "/grammar" },
      { label: "Перефразирование", href: "/rewrite" },
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
  legal: {
    title: "Документы",
    links: [
      { label: "Соглашение", href: "/terms" },
      { label: "Политика возвратов", href: "/refund" },
      { label: "Конфиденциальность", href: "/privacy" },
    ],
  },
  support: {
    title: "Поддержка",
    links: [
      { label: "FAQ", href: "/faq" },
      { label: "hello@diplox.online", href: "mailto:hello@diplox.online" },
    ],
  },
};

export function Footer() {
  return (
    <footer className="border-t border-surface-border bg-muted">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-8">
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

          <div className="flex items-center gap-4">
            <a
              href="https://t.me/diplox_blog"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Telegram"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
              </svg>
            </a>
            <a
              href="https://vk.com/club236935612"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="ВКонтакте"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.684 0H8.316C1.592 0 0 1.592 0 8.316v7.368C0 22.408 1.592 24 8.316 24h7.368C22.408 24 24 22.408 24 15.684V8.316C24 1.592 22.391 0 15.684 0zm3.692 17.123h-1.744c-.66 0-.862-.525-2.049-1.714-1.033-1.01-1.49-1.135-1.744-1.135-.356 0-.458.102-.458.593v1.575c0 .424-.135.678-1.253.678-1.846 0-3.896-1.12-5.339-3.202-2.17-3.058-2.763-5.35-2.763-5.834 0-.254.102-.491.593-.491h1.744c.44 0 .61.203.78.678.863 2.49 2.303 4.675 2.896 4.675.22 0 .322-.102.322-.66V9.721c-.068-1.186-.695-1.287-.695-1.71 0-.203.17-.407.44-.407h2.744c.373 0 .508.203.508.643v3.473c0 .372.17.508.271.508.22 0 .407-.136.813-.542 1.27-1.422 2.18-3.61 2.18-3.61.119-.254.322-.491.762-.491h1.744c.525 0 .644.27.525.643-.22 1.017-2.354 4.031-2.354 4.031-.186.305-.254.44 0 .78.186.254.796.78 1.203 1.253.745.847 1.32 1.558 1.473 2.049.17.49-.085.744-.576.744z"/>
              </svg>
            </a>
            <a
              href="https://dzen.ru/id/69bffa464441903916c18282"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Дзен"
            >
              <svg width="20" height="20" viewBox="0 0 44 44" fill="currentColor">
                <path d="M22 0C22 0 22 9.5 14.75 14.75C9.5 22 0 22 0 22C0 22 9.5 22 14.75 29.25C22 34.5 22 44 22 44C22 44 22 34.5 29.25 29.25C34.5 22 44 22 44 22C44 22 34.5 22 29.25 14.75C22 9.5 22 0 22 0Z" fillRule="evenodd" clipRule="evenodd"/>
              </svg>
            </a>
          </div>

          <p className="text-xs text-muted-foreground">
            Сервис автоматического форматирования документов
          </p>
        </div>
      </div>
    </footer>
  );
}
