import { Metadata } from "next";
import { Header } from "@/components/Header";
import { JsonLd } from "@/components/JsonLd";
import { getBreadcrumbSchema } from "@/lib/seo/schemas";
import { SITE_URL } from "@/lib/config/site";
import { FileText } from "lucide-react";

export const metadata: Metadata = {
  title: "Пользовательское соглашение — Diplox",
  description:
    "Пользовательское соглашение сервиса Diplox. Условия использования, тарифы, права и обязанности пользователей.",
  alternates: {
    canonical: `${SITE_URL}/terms`,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function TermsPage() {
  return (
    <div className="min-h-screen">
      <Header showBack backHref="/" />

      <JsonLd
        data={getBreadcrumbSchema([
          { name: "Главная", url: "/" },
          { name: "Пользовательское соглашение", url: "/terms" },
        ])}
      />

      <main className="mx-auto max-w-3xl px-6 py-16">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-muted border border-border text-primary text-sm mb-6">
            <FileText className="w-4 h-4" />
            Документ
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">
            Пользовательское соглашение
          </h1>
          <p className="text-on-surface-muted">
            Последнее обновление: 7 апреля 2026 г.
          </p>
        </div>

        <div className="space-y-8 text-on-surface-muted leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              1. Общие положения
            </h2>
            <p>
              Настоящее Пользовательское соглашение (далее —
              &laquo;Соглашение&raquo;) регулирует отношения между
              администрацией сервиса Diplox (далее — &laquo;Сервис&raquo;),
              доступного по адресу{" "}
              <a
                href="https://diplox.online"
                className="text-primary hover:text-primary/80"
              >
                diplox.online
              </a>
              , и пользователем (далее — &laquo;Пользователь&raquo;).
            </p>
            <p className="mt-2">
              Используя Сервис, Пользователь подтверждает, что ознакомился с
              условиями настоящего Соглашения и принимает их в полном объёме.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              2. Описание услуг
            </h2>
            <p>Сервис предоставляет инструменты для обработки и подготовки академических текстов:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Автоматическое форматирование документов по ГОСТ.</li>
              <li>Проверка грамматики и орфографии.</li>
              <li>Перефразирование текста.</li>
              <li>Создание краткого содержания.</li>
              <li>Генерация плана (содержания) работы.</li>
              <li>Подбор научных источников и литературы.</li>
            </ul>
            <p className="mt-2">
              Сервис является вспомогательным инструментом. Результаты обработки
              носят рекомендательный характер и не заменяют проверку научным
              руководителем или рецензентом.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              3. Регистрация и аккаунт
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Для доступа к платным функциям необходима регистрация с указанием
                адреса электронной почты.
              </li>
              <li>
                Пользователь несёт ответственность за сохранность данных доступа
                к своему аккаунту.
              </li>
              <li>
                Пробная обработка одного документа доступна без регистрации.
              </li>
              <li>
                Администрация вправе заблокировать аккаунт при нарушении условий
                настоящего Соглашения.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              4. Тарифы и оплата
            </h2>
            <p>Сервис предоставляет следующие тарифные планы:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>
                <strong className="text-foreground">Пробный</strong> — бесплатная
                обработка одного документа (до 50% страниц).
              </li>
              <li>
                <strong className="text-foreground">Разовая обработка</strong> —
                159 ₽ за один документ без ограничения по страницам.
              </li>
              <li>
                <strong className="text-foreground">Pro</strong> — 399 ₽/месяц,
                включает 10 обработок и доступ ко всем инструментам.
              </li>
              <li>
                <strong className="text-foreground">Pro Plus</strong> —
                1 499 ₽/месяц, неограниченные обработки и приоритетная поддержка.
              </li>
            </ul>
            <p className="mt-2">
              Оплата производится через платёжный сервис Lava.top. Актуальные
              цены указаны на{" "}
              <a href="/pricing" className="text-primary hover:text-primary/80">
                странице тарифов
              </a>
              . Администрация оставляет за собой право изменять стоимость услуг,
              уведомив об этом заранее.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              5. Подписка и её отмена
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Подписки Pro и Pro Plus продлеваются автоматически каждый
                месяц.
              </li>
              <li>
                Пользователь может отменить подписку в любое время. Доступ
                сохраняется до конца оплаченного периода.
              </li>
              <li>
                Условия возврата средств описаны в{" "}
                <a
                  href="/refund"
                  className="text-primary hover:text-primary/80"
                >
                  Политике возвратов
                </a>
                .
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              6. Интеллектуальная собственность
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Пользователь сохраняет все права на загруженные документы и
                результаты их обработки.
              </li>
              <li>
                Сервис не использует содержимое документов для обучения моделей
                ИИ и не передаёт их третьим лицам.
              </li>
              <li>
                Дизайн, код и контент Сервиса являются интеллектуальной
                собственностью администрации Diplox.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              7. Ограничение ответственности
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Сервис предоставляется &laquo;как есть&raquo; (as is).
                Администрация не гарантирует, что результаты обработки будут
                полностью соответствовать требованиям конкретного учебного
                заведения.
              </li>
              <li>
                Администрация не несёт ответственности за последствия
                использования результатов обработки, включая оценки за
                академические работы.
              </li>
              <li>
                Сервис не несёт ответственности за временную недоступность,
                вызванную техническими работами или обстоятельствами
                непреодолимой силы.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              8. Запрещённое использование
            </h2>
            <p>Пользователь обязуется не использовать Сервис для:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Загрузки вредоносных файлов или попыток нарушить работу Сервиса.</li>
              <li>Автоматизированного массового доступа (парсинг, боты).</li>
              <li>Нарушения прав третьих лиц, включая авторские права.</li>
              <li>Распространения незаконного контента.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              9. Обработка персональных данных
            </h2>
            <p>
              Обработка персональных данных осуществляется в соответствии с{" "}
              <a
                href="/privacy"
                className="text-primary hover:text-primary/80"
              >
                Политикой конфиденциальности
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              10. Изменение условий
            </h2>
            <p>
              Администрация вправе изменять условия настоящего Соглашения.
              Актуальная версия всегда доступна на этой странице. Продолжение
              использования Сервиса после внесения изменений означает согласие с
              новыми условиями.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              11. Контактная информация
            </h2>
            <p>
              По вопросам, связанным с настоящим Соглашением, обращайтесь:{" "}
              <a
                href="mailto:hello@diplox.online"
                className="text-primary hover:text-primary/80"
              >
                hello@diplox.online
              </a>
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
