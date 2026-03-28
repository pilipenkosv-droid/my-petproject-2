/**
 * HTML-шаблоны email в стиле Diplox
 */

interface DownloadLinkEmailParams {
  downloadUrl: string;
  downloadType: "original" | "formatted";
}

interface SubscriptionWelcomeEmailParams {
  botDeepLink?: string | null;
}

/**
 * Общий layout-обёртка для всех email
 */
function emailLayout(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Diplox</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f5f5f5;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background-color:#ffffff;border:1px solid #e5e5e5;">

          <!-- Header -->
          <tr>
            <td style="padding:32px 32px 24px;border-bottom:1px solid #e5e5e5;">
              <span style="font-size:22px;font-weight:800;color:#0a0a0a;letter-spacing:-0.5px;">Diplox</span>
            </td>
          </tr>

          ${content}

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #e5e5e5;">
              <p style="margin:0;font-size:11px;color:#999999;line-height:1.5;text-align:center;">
                &copy; 2026 Diplox &middot; Автоматическое форматирование научных работ<br>
                <a href="https://diplox.online" style="color:#999999;">diplox.online</a>
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>`;
}

export function downloadLinkEmail({ downloadUrl, downloadType }: DownloadLinkEmailParams): string {
  const fileLabel = downloadType === "formatted"
    ? "Исправленный документ"
    : "Документ с пометками";

  const fileDescription = downloadType === "formatted"
    ? "Форматирование уже применено — шрифты, отступы, интервалы по ГОСТу"
    : "Исходный файл с выделенными нарушениями для просмотра";

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ваш документ готов — Diplox</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

  <!-- Wrapper -->
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f5f5f5;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <!-- Card -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background-color:#ffffff;border:1px solid #e5e5e5;">

          <!-- Header -->
          <tr>
            <td style="padding:32px 32px 24px;border-bottom:1px solid #e5e5e5;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="font-size:22px;font-weight:800;color:#0a0a0a;letter-spacing:-0.5px;">Diplox</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0a0a0a;line-height:1.3;">
                Ваш документ готов
              </h1>
              <p style="margin:0 0 24px;font-size:14px;color:#666666;line-height:1.5;">
                ${fileDescription}
              </p>

              <!-- File card -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:24px;">
                <tr>
                  <td style="padding:16px;background-color:#fafafa;border:1px solid #e5e5e5;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td width="44" valign="top">
                          <div style="width:40px;height:40px;background-color:#0a0a0a;text-align:center;line-height:40px;">
                            <span style="color:#ffffff;font-size:16px;">&#128196;</span>
                          </div>
                        </td>
                        <td style="padding-left:12px;" valign="middle">
                          <p style="margin:0;font-size:14px;font-weight:600;color:#0a0a0a;">${fileLabel}</p>
                          <p style="margin:2px 0 0;font-size:12px;color:#999999;">Формат: .docx</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <a href="${downloadUrl}"
                       target="_blank"
                       style="display:inline-block;padding:14px 32px;background-color:#0a0a0a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;letter-spacing:0.3px;">
                      Скачать документ
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:20px 0 0;font-size:12px;color:#999999;text-align:center;line-height:1.5;">
                Ссылка действует 24 часа
              </p>
            </td>
          </tr>

          <!-- Upsell -->
          <tr>
            <td style="padding:0 32px 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding:16px;background-color:#fafafa;border:1px solid #e5e5e5;">
                    <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#0a0a0a;">
                      Нужно оформить ещё работу?
                    </p>
                    <p style="margin:0 0 12px;font-size:12px;color:#666666;line-height:1.4;">
                      Разовая обработка — 159 ₽. С подпиской Pro — 39 ₽ за документ
                    </p>
                    <a href="https://diplox.online/pricing?ref=email"
                       style="font-size:12px;color:#0a0a0a;font-weight:600;text-decoration:underline;">
                      Посмотреть тарифы →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #e5e5e5;">
              <p style="margin:0;font-size:11px;color:#999999;line-height:1.5;text-align:center;">
                © 2026 Diplox · Автоматическое форматирование научных работ<br>
                <a href="https://diplox.online" style="color:#999999;">diplox.online</a>
              </p>
            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>
  <!-- /Wrapper -->

</body>
</html>`;
}

/**
 * Welcome-email для подписчиков Pro (399 ₽/мес).
 * Если botDeepLink передан — показываем блок с ссылкой на Telegram-бота.
 */
export function subscriptionWelcomeEmail({ botDeepLink }: SubscriptionWelcomeEmailParams = {}): string {
  const botBlock = botDeepLink
    ? `<!-- Bot access -->
          <tr>
            <td style="padding:0 32px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding:16px;background-color:#f0f7ff;border:1px solid #d0e3ff;">
                    <p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#0a0a0a;">
                      &#129302; Telegram-бот — твой персональный помощник
                    </p>
                    <p style="margin:0 0 12px;font-size:13px;color:#666666;line-height:1.5;">
                      Конспектируй лекции голосом, задавай вопросы по учёбе, получай помощь прямо в Telegram.
                    </p>
                    <a href="${botDeepLink}"
                       target="_blank"
                       style="display:inline-block;padding:10px 24px;background-color:#0a0a0a;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;">
                      Открыть бота &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
    : `<!-- Second Brain upsell for Pro buyers -->
          <tr>
            <td style="padding:0 32px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding:16px;background-color:#f5f0ff;border:1px solid #e0d4ff;">
                    <p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#0a0a0a;">
                      &#129504; Хочешь AI-помощника для учёбы?
                    </p>
                    <p style="margin:0 0 12px;font-size:13px;color:#666666;line-height:1.5;">
                      Second Brain в Telegram — сохраняй лекции голосом, задавай вопросы по своим материалам, получай конспекты.
                    </p>
                    <a href="https://diplox.online/second-brain?ref=email-pro"
                       style="font-size:12px;color:#0a0a0a;font-weight:600;text-decoration:underline;">
                      Узнать о Pro Plus &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;

  return emailLayout("Подписка Pro активирована", `
          <!-- Content -->
          <tr>
            <td style="padding:32px 32px 24px;">
              <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0a0a0a;line-height:1.3;">
                Подписка Pro активирована
              </h1>
              <p style="margin:0 0 24px;font-size:14px;color:#666666;line-height:1.5;">
                Спасибо за доверие! Теперь тебе доступно всё, что нужно для оформления работ.
              </p>

              <!-- What's included -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:24px;">
                <tr>
                  <td style="padding:16px;background-color:#fafafa;border:1px solid #e5e5e5;">
                    <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#0a0a0a;">Что входит в Pro:</p>
                    <p style="margin:0 0 6px;font-size:13px;color:#333333;line-height:1.5;">&#10003; 10 обработок документов в месяц</p>
                    <p style="margin:0 0 6px;font-size:13px;color:#333333;line-height:1.5;">&#10003; Форматирование по ГОСТу — шрифты, отступы, интервалы</p>
                    <p style="margin:0;font-size:13px;color:#333333;line-height:1.5;">&#10003; Документ с пометками + исправленная версия</p>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <a href="https://diplox.online/create?ref=welcome-email"
                       target="_blank"
                       style="display:inline-block;padding:14px 32px;background-color:#0a0a0a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;letter-spacing:0.3px;">
                      Оформить документ
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${botBlock}`);
}

/**
 * Thank-you email для разовой покупки (159 ₽).
 * Включает upsell на подписку Pro.
 */
export function oneTimePurchaseEmail(): string {
  return emailLayout("Спасибо за покупку", `
          <!-- Content -->
          <tr>
            <td style="padding:32px 32px 24px;">
              <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0a0a0a;line-height:1.3;">
                Спасибо за покупку!
              </h1>
              <p style="margin:0 0 24px;font-size:14px;color:#666666;line-height:1.5;">
                Доступ к обработке документа активирован. Загрузи файл — и получи оформленную работу по ГОСТу.
              </p>

              <!-- CTA -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:24px;">
                <tr>
                  <td align="center">
                    <a href="https://diplox.online/create?ref=welcome-email"
                       target="_blank"
                       style="display:inline-block;padding:14px 32px;background-color:#0a0a0a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;letter-spacing:0.3px;">
                      Оформить документ
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Upsell: Pro -->
          <tr>
            <td style="padding:0 32px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding:16px;background-color:#fafafa;border:1px solid #e5e5e5;">
                    <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#0a0a0a;">
                      Оформляешь работы регулярно?
                    </p>
                    <p style="margin:0 0 12px;font-size:12px;color:#666666;line-height:1.4;">
                      С подпиской Pro — 39 &#8381; за документ вместо 159 &#8381;. 10 обработок в месяц.
                    </p>
                    <a href="https://diplox.online/pricing?ref=welcome-email"
                       style="font-size:12px;color:#0a0a0a;font-weight:600;text-decoration:underline;">
                      Посмотреть тарифы &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Upsell: Second Brain -->
          <tr>
            <td style="padding:0 32px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding:16px;background-color:#f5f0ff;border:1px solid #e0d4ff;">
                    <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#0a0a0a;">
                      &#129504; AI-помощник для учёбы
                    </p>
                    <p style="margin:0 0 12px;font-size:12px;color:#666666;line-height:1.4;">
                      Second Brain в Telegram: сохраняй заметки голосом, задавай вопросы по своим материалам.
                    </p>
                    <a href="https://diplox.online/second-brain?ref=email-onetime"
                       style="font-size:12px;color:#0a0a0a;font-weight:600;text-decoration:underline;">
                      Узнать о Second Brain &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`);;
}
