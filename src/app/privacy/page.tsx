import { Metadata } from "next";
import { Header } from "@/components/Header";
import { JsonLd } from "@/components/JsonLd";
import { getBreadcrumbSchema } from "@/lib/seo/schemas";
import { SITE_URL } from "@/lib/config/site";
import { Shield } from "lucide-react";

export const metadata: Metadata = {
  title: "Политика конфиденциальности — Diplox",
  description:
    "Политика конфиденциальности сервиса Diplox. Как мы обрабатываем ваши данные, загруженные документы и персональную информацию.",
  alternates: {
    canonical: `${SITE_URL}/privacy`,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen">
      <Header showBack backHref="/" />

      <JsonLd
        data={getBreadcrumbSchema([
          { name: "Главная", url: "/" },
          { name: "Политика конфиденциальности", url: "/privacy" },
        ])}
      />

      <main className="mx-auto max-w-3xl px-6 py-16">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-muted border border-border text-primary text-sm mb-6">
            <Shield className="w-4 h-4" />
            Документ
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">
            Политика конфиденциальности
          </h1>
          <p className="text-on-surface-muted">
            Последнее обновление: 16 марта 2026 г.
          </p>
        </div>

        <div className="space-y-8 text-on-surface-muted leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              1. Общие положения
            </h2>
            <p>
              Настоящая Политика конфиденциальности определяет порядок обработки
              и защиты персональных данных пользователей сервиса Diplox (далее —
              &laquo;Сервис&raquo;), доступного по адресу{" "}
              <a href="https://diplox.online" className="text-primary hover:text-primary/80">
                diplox.online
              </a>.
            </p>
            <p className="mt-2">
              Используя Сервис, вы соглашаетесь с условиями данной Политики.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              2. Какие данные мы собираем
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong className="text-foreground">Данные аккаунта:</strong>{" "}
                адрес электронной почты при регистрации через Supabase Auth.
              </li>
              <li>
                <strong className="text-foreground">Загруженные документы:</strong>{" "}
                файлы .docx и .pdf, которые вы загружаете для форматирования.
              </li>
              <li>
                <strong className="text-foreground">Данные об использовании:</strong>{" "}
                информация о посещённых страницах, действиях в сервисе (Yandex
                Metrika, Google Analytics, Vercel Analytics).
              </li>
              <li>
                <strong className="text-foreground">Платёжные данные:</strong>{" "}
                обрабатываются платёжным провайдером. Мы не храним данные
                банковских карт.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              3. Обработка загруженных документов
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Документы передаются по защищённому каналу (HTTPS/TLS).
              </li>
              <li>
                Загруженные файлы <strong className="text-foreground">автоматически удаляются через 24 часа</strong>{" "}
                после обработки.
              </li>
              <li>
                Содержимое документов <strong className="text-foreground">не передаётся в базы антиплагиата</strong>{" "}
                и не используется для обучения моделей ИИ.
              </li>
              <li>
                Для анализа методических указаний и форматирования используются
                API языковых моделей (OpenAI, Anthropic, Google). Данные
                обрабатываются в соответствии с политиками конфиденциальности
                этих провайдеров и не сохраняются ими для обучения.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              4. Цели обработки данных
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Предоставление услуг форматирования документов.</li>
              <li>Управление аккаунтом и подписками.</li>
              <li>Улучшение качества сервиса и пользовательского опыта.</li>
              <li>Обработка платежей и предоставление доступа к платным функциям.</li>
              <li>Техническая поддержка пользователей.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              5. Хранение и защита данных
            </h2>
            <p>
              Персональные данные хранятся на серверах Supabase (AWS, регион
              eu-central-1) и Vercel. Мы применяем стандартные меры защиты:
              шифрование при передаче (TLS 1.2+), HSTS, ограничение доступа.
            </p>
            <p className="mt-2">
              Данные аккаунта хранятся до момента удаления аккаунта
              пользователем. Загруженные документы хранятся не более 24 часов.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              6. Передача данных третьим лицам
            </h2>
            <p>
              Мы не продаём и не передаём ваши персональные данные третьим лицам,
              за исключением:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Платёжные провайдеры — для обработки оплаты.</li>
              <li>Провайдеры AI-моделей — для обработки документов (без сохранения).</li>
              <li>Аналитические сервисы — анонимизированные данные о посещениях.</li>
              <li>По требованию законодательства РФ.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              7. Файлы cookie
            </h2>
            <p>
              Сервис использует cookie для авторизации, аналитики и улучшения
              работы сайта. Вы можете отключить cookie в настройках браузера,
              однако это может ограничить функциональность сервиса.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              8. Права пользователей
            </h2>
            <p>Вы имеете право:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Запросить информацию о хранимых персональных данных.</li>
              <li>Потребовать удаления персональных данных и аккаунта.</li>
              <li>Отозвать согласие на обработку данных.</li>
              <li>Обратиться с жалобой в уполномоченный орган (Роскомнадзор).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              9. Контактная информация
            </h2>
            <p>
              По вопросам обработки персональных данных обращайтесь:{" "}
              <a
                href="mailto:support@diplox.online"
                className="text-primary hover:text-primary/80"
              >
                support@diplox.online
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              10. Изменения в политике
            </h2>
            <p>
              Мы оставляем за собой право обновлять данную Политику. Актуальная
              версия всегда доступна на этой странице. При существенных изменениях
              мы уведомим пользователей по электронной почте.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
