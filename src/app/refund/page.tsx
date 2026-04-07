import { Metadata } from "next";
import { Header } from "@/components/Header";
import { JsonLd } from "@/components/JsonLd";
import { getBreadcrumbSchema } from "@/lib/seo/schemas";
import { SITE_URL } from "@/lib/config/site";
import { RefreshCw } from "lucide-react";

export const metadata: Metadata = {
  title: "Политика возвратов — Diplox",
  description:
    "Политика возвратов сервиса Diplox. Условия возврата средств за разовые покупки и подписки.",
  alternates: {
    canonical: `${SITE_URL}/refund`,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RefundPage() {
  return (
    <div className="min-h-screen">
      <Header showBack backHref="/" />

      <JsonLd
        data={getBreadcrumbSchema([
          { name: "Главная", url: "/" },
          { name: "Политика возвратов", url: "/refund" },
        ])}
      />

      <main className="mx-auto max-w-3xl px-6 py-16">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-muted border border-border text-primary text-sm mb-6">
            <RefreshCw className="w-4 h-4" />
            Документ
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">
            Политика возвратов
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
              Настоящая Политика возвратов определяет условия и порядок возврата
              денежных средств за услуги сервиса Diplox (далее —
              &laquo;Сервис&raquo;), доступного по адресу{" "}
              <a
                href="https://diplox.online"
                className="text-primary hover:text-primary/80"
              >
                diplox.online
              </a>
              .
            </p>
            <p className="mt-2">
              Оплата услуг производится через платёжный сервис Lava.top. Возврат
              средств осуществляется тем же способом, которым была произведена
              оплата.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              2. Возврат за разовую обработку
            </h2>
            <p>
              Стоимость разовой обработки составляет 159 ₽ за один документ.
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>
                Возврат возможен в течение <strong className="text-foreground">3 календарных дней</strong> с
                момента оплаты, если услуга не была оказана (документ не был
                обработан).
              </li>
              <li>
                Если документ был обработан и результат доступен для скачивания,
                возврат не производится, так как услуга считается оказанной в
                полном объёме.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              3. Возврат за подписку
            </h2>
            <p>
              Подписки Pro (399 ₽/мес) и Pro Plus (1 499 ₽/мес) продлеваются
              автоматически.
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>
                Пользователь может отменить подписку в любое время. Доступ к
                платным функциям сохраняется до конца оплаченного периода.
              </li>
              <li>
                Возврат за текущий период подписки возможен в
                течение <strong className="text-foreground">3 календарных дней</strong> с
                момента списания, если за этот период не было использовано ни
                одной обработки.
              </li>
              <li>
                При наличии использованных обработок в текущем периоде возврат
                не производится.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              4. Когда возврат невозможен
            </h2>
            <p>Возврат денежных средств не производится в следующих случаях:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>
                Документ был обработан и результат доступен для скачивания.
              </li>
              <li>
                С момента оплаты прошло более 3 календарных дней.
              </li>
              <li>
                Пользователь использовал обработки в рамках текущего периода
                подписки.
              </li>
              <li>
                Пользователь нарушил условия{" "}
                <a
                  href="/terms"
                  className="text-primary hover:text-primary/80"
                >
                  Пользовательского соглашения
                </a>
                .
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              5. Порядок оформления возврата
            </h2>
            <p>Для оформления возврата необходимо:</p>
            <ol className="list-decimal pl-6 space-y-2 mt-2">
              <li>
                Отправить запрос на{" "}
                <a
                  href="mailto:hello@diplox.online"
                  className="text-primary hover:text-primary/80"
                >
                  hello@diplox.online
                </a>{" "}
                с указанием адреса электронной почты, использованного при оплате.
              </li>
              <li>
                В письме описать причину возврата.
              </li>
              <li>
                Срок рассмотрения заявки — до <strong className="text-foreground">5 рабочих дней</strong>.
              </li>
              <li>
                В случае одобрения средства возвращаются тем же способом, которым
                была произведена оплата, в течение 5–10 рабочих дней (зависит от
                банка).
              </li>
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              6. Техническая неисправность
            </h2>
            <p>
              Если обработка документа не была выполнена по техническим причинам
              (ошибка сервиса, сбой обработки), Пользователь имеет право на
              повторную обработку или полный возврат средств вне зависимости от
              сроков.
            </p>
            <p className="mt-2">
              Для этого обратитесь в поддержку по адресу{" "}
              <a
                href="mailto:hello@diplox.online"
                className="text-primary hover:text-primary/80"
              >
                hello@diplox.online
              </a>{" "}
              с описанием проблемы.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              7. Изменения в политике
            </h2>
            <p>
              Администрация оставляет за собой право изменять условия данной
              Политики. Актуальная версия всегда доступна на этой странице.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">
              8. Контактная информация
            </h2>
            <p>
              По вопросам возвратов обращайтесь:{" "}
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
