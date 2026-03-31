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
export function emailLayout(title: string, content: string): string {
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
    : `<!-- Diplox Bot upsell for Pro buyers -->
          <tr>
            <td style="padding:0 32px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding:16px;background-color:#f5f0ff;border:1px solid #e0d4ff;">
                    <p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#0a0a0a;">
                      &#129504; Хочешь ИИ-бота для учёбы?
                    </p>
                    <p style="margin:0 0 12px;font-size:13px;color:#666666;line-height:1.5;">
                      Diplox Bot в Telegram — сохраняй лекции голосом, задавай вопросы по своим материалам, получай конспекты.
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

          <!-- Upsell: Diplox Bot -->
          <tr>
            <td style="padding:0 32px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding:16px;background-color:#f5f0ff;border:1px solid #e0d4ff;">
                    <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#0a0a0a;">
                      &#129504; ИИ-бот для учёбы в Telegram
                    </p>
                    <p style="margin:0 0 12px;font-size:12px;color:#666666;line-height:1.4;">
                      Diplox Bot: сохраняй заметки голосом, задавай вопросы по своим материалам.
                    </p>
                    <a href="https://diplox.online/second-brain?ref=email-onetime"
                       style="font-size:12px;color:#0a0a0a;font-weight:600;text-decoration:underline;">
                      Узнать о Diplox Bot &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`);
}

// ─── Referral email templates ───

interface ReferralRegisteredParams {
  count: number;
  nextThreshold: number;
  nextRewardMonths: number;
  rewardGranted?: boolean;
  rewardMonths?: number;
}

export function referralRegisteredEmail({
  count,
  nextThreshold,
  nextRewardMonths,
  rewardGranted,
  rewardMonths,
}: ReferralRegisteredParams): string {
  const rewardBlock = rewardGranted && rewardMonths
    ? `<tr>
        <td style="padding:0 32px 24px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <td style="padding:16px;background-color:#f0fff4;border:1px solid #86efac;">
                <p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#166534;">
                  &#127881; Поздравляем! Вы получили ${rewardMonths} мес. Pro бесплатно
                </p>
                <p style="margin:0;font-size:13px;color:#166534;">
                  Подписка уже активирована. Продолжайте приглашать друзей для ещё больших наград!
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : "";

  const remaining = nextThreshold - count;

  return emailLayout("Новый друг зарегистрировался", `
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0a0a0a;">
                +1! По вашей ссылке зарегистрировался новый пользователь
              </h1>
              <p style="margin:0 0 24px;font-size:14px;color:#666666;line-height:1.5;">
                ${rewardGranted
                  ? `У вас уже ${count} приглашённых друзей. Отличный результат!`
                  : `Всего ${count} из ${nextThreshold}. Ещё ${remaining} — и вы получите ${nextRewardMonths} мес. Pro бесплатно.`
                }
              </p>

              <!-- Progress -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:24px;">
                <tr>
                  <td>
                    <div style="background-color:#e5e5e5;height:8px;border-radius:4px;overflow:hidden;">
                      <div style="background-color:#7c3aed;height:8px;width:${Math.min(100, Math.round((count / nextThreshold) * 100))}%;border-radius:4px;"></div>
                    </div>
                    <p style="margin:6px 0 0;font-size:12px;color:#999999;">${count} / ${nextThreshold} друзей</p>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <a href="https://diplox.online/profile"
                       style="display:inline-block;padding:14px 32px;background-color:#0a0a0a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">
                      Посмотреть прогресс
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ${rewardBlock}`);
}

// ─── Lifecycle email templates ───

/**
 * Email #1: Активация — юзер зарегался, но не сделал обработку за 24ч
 */
export function activationNudgeEmail(): string {
  return emailLayout("Загрузи первый документ", `
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0a0a0a;">
                Загрузи первый документ за 2 минуты
              </h1>
              <p style="margin:0 0 24px;font-size:14px;color:#666666;line-height:1.5;">
                Ты зарегистрировался в Diplox — осталось загрузить работу, и мы оформим её по ГОСТу автоматически.
              </p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:24px;">
                <tr>
                  <td style="padding:16px;background-color:#fafafa;border:1px solid #e5e5e5;">
                    <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#0a0a0a;">Как это работает:</p>
                    <p style="margin:0 0 4px;font-size:13px;color:#333;line-height:1.5;">1. Загрузи .docx файл</p>
                    <p style="margin:0 0 4px;font-size:13px;color:#333;line-height:1.5;">2. Мы проверим и исправим форматирование</p>
                    <p style="margin:0;font-size:13px;color:#333;line-height:1.5;">3. Скачай готовый документ</p>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <a href="https://diplox.online/create?ref=email-activation"
                       style="display:inline-block;padding:14px 32px;background-color:#0a0a0a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">
                      Загрузить документ
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`);
}

/**
 * Email #2: Share nudge — после первой обработки, предложить поделиться
 */
interface ShareNudgeEmailParams {
  fixesApplied: number;
  workType?: string;
}

export function shareNudgeEmail({ fixesApplied, workType }: ShareNudgeEmailParams): string {
  const workLabel = workType || "документ";

  return emailLayout("Результат обработки", `
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0a0a0a;">
                ${fixesApplied > 0 ? `${fixesApplied} исправлений в твоей работе` : "Твой документ обработан"}
              </h1>
              <p style="margin:0 0 24px;font-size:14px;color:#666666;line-height:1.5;">
                Мы проверили твой ${workLabel} и ${fixesApplied > 0 ? `нашли ${fixesApplied} нарушений форматирования` : "всё выглядит отлично"}.
                Покажи одногруппникам — им тоже может пригодиться.
              </p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:24px;">
                <tr>
                  <td style="padding:16px;background-color:#f5f0ff;border:1px solid #e0d4ff;">
                    <p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#0a0a0a;">
                      Поделись с одногруппниками
                    </p>
                    <p style="margin:0;font-size:13px;color:#666666;line-height:1.5;">
                      Каждый, кто зарегистрируется по твоей ссылке, получит бесплатную проверку. А ты — бонус за приглашение.
                    </p>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <a href="https://diplox.online/profile?ref=email-share"
                       style="display:inline-block;padding:14px 32px;background-color:#0a0a0a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">
                      Получить ссылку для друзей
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`);
}

/**
 * Email #3: Upsell подписки — 3+ разовых покупки
 */
interface SubscriptionUpsellEmailParams {
  totalSpent: number;
  purchaseCount: number;
}

export function subscriptionUpsellEmail({ totalSpent, purchaseCount }: SubscriptionUpsellEmailParams): string {
  return emailLayout("Сэкономь на оформлении", `
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0a0a0a;">
                Ты потратил ${totalSpent.toLocaleString("ru-RU")}&nbsp;&#8381; на оформление
              </h1>
              <p style="margin:0 0 24px;font-size:14px;color:#666666;line-height:1.5;">
                ${purchaseCount} обработок по 159&nbsp;&#8381; — это ${totalSpent.toLocaleString("ru-RU")}&nbsp;&#8381;.
                С Pro-подпиской — 10 обработок за 399&nbsp;&#8381;/мес (39&nbsp;&#8381; за документ).
              </p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:24px;">
                <tr>
                  <td style="padding:16px;background-color:#f0fff4;border:1px solid #86efac;">
                    <p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#166534;">
                      Экономия: ${(totalSpent - 399).toLocaleString("ru-RU")}&nbsp;&#8381; в месяц
                    </p>
                    <p style="margin:0;font-size:13px;color:#166534;">
                      Pro = 399&nbsp;&#8381;/мес за 10 документов вместо ${totalSpent.toLocaleString("ru-RU")}&nbsp;&#8381;
                    </p>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <a href="https://diplox.online/pricing?ref=email-upsell"
                       style="display:inline-block;padding:14px 32px;background-color:#0a0a0a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">
                      Перейти на Pro
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`);
}

/**
 * Email #4: Реактивация — нет визита 14 дней
 */
interface ReactivationEmailParams {
  daysUntilDeadline: number | null;
}

export function reactivationEmail({ daysUntilDeadline }: ReactivationEmailParams): string {
  const deadlineBlock = daysUntilDeadline !== null && daysUntilDeadline > 0
    ? `<p style="margin:0 0 24px;font-size:14px;color:#b45309;font-weight:600;">
        До сдачи осталось ~${daysUntilDeadline} дней. Не оставляй оформление на потом.
      </p>`
    : `<p style="margin:0 0 24px;font-size:14px;color:#666666;line-height:1.5;">
        Не забудь оформить работу перед сдачей — это занимает 2 минуты.
      </p>`;

  return emailLayout("Не забудь оформить работу", `
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0a0a0a;">
                Давно не заходил — всё в порядке?
              </h1>
              ${deadlineBlock}

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <a href="https://diplox.online/create?ref=email-reactivation"
                       style="display:inline-block;padding:14px 32px;background-color:#0a0a0a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">
                      Оформить документ
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`);
}

/**
 * Email #5: CSAT низкий (≤2) — просим фидбек
 */
export function csatLowEmail(): string {
  return emailLayout("Что пошло не так?", `
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0a0a0a;">
                Что пошло не так?
              </h1>
              <p style="margin:0 0 24px;font-size:14px;color:#666666;line-height:1.5;">
                Ты поставил низкую оценку нашей обработке. Нам важно понять, что именно не понравилось,
                чтобы стать лучше.
              </p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:24px;">
                <tr>
                  <td style="padding:16px;background-color:#fafafa;border:1px solid #e5e5e5;">
                    <p style="margin:0;font-size:13px;color:#333333;line-height:1.5;">
                      Ответь одним предложением — что было не так? Мы читаем каждое сообщение.
                    </p>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <a href="mailto:hello@diplox.online?subject=Обратная связь по обработке"
                       style="display:inline-block;padding:14px 32px;background-color:#0a0a0a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">
                      Написать нам
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`);
}

/**
 * Email #6: CSAT высокий (≥4) — спасибо + поделись
 */
interface CsatHighEmailParams {
  groupLinkUrl?: string | null;
}

export function csatHighEmail({ groupLinkUrl }: CsatHighEmailParams): string {
  const shareBlock = groupLinkUrl
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:24px;">
                <tr>
                  <td style="padding:16px;background-color:#f5f0ff;border:1px solid #e0d4ff;">
                    <p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#0a0a0a;">
                      Поделись с одногруппниками
                    </p>
                    <p style="margin:0 0 12px;font-size:13px;color:#666666;">
                      Каждый получит бесплатную проверку по этой ссылке:
                    </p>
                    <a href="${groupLinkUrl}" style="font-size:13px;color:#7c3aed;font-weight:600;text-decoration:none;word-break:break-all;">${groupLinkUrl}</a>
                  </td>
                </tr>
              </table>`
    : `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:24px;">
                <tr>
                  <td style="padding:16px;background-color:#f5f0ff;border:1px solid #e0d4ff;">
                    <p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#0a0a0a;">
                      Расскажи одногруппникам
                    </p>
                    <p style="margin:0;font-size:13px;color:#666666;">
                      Пригласи друзей — каждый получит бонусную проверку, а ты приблизишься к бесплатному Pro.
                    </p>
                  </td>
                </tr>
              </table>`;

  return emailLayout("Спасибо за оценку!", `
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0a0a0a;">
                Спасибо за высокую оценку!
              </h1>
              <p style="margin:0 0 24px;font-size:14px;color:#666666;line-height:1.5;">
                Рады, что результат понравился. Мы стараемся делать оформление максимально точным.
              </p>

              ${shareBlock}

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <a href="https://diplox.online/profile?ref=email-csat"
                       style="display:inline-block;padding:14px 32px;background-color:#0a0a0a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">
                      Открыть профиль
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`);
}

/**
 * Email: Marathon blast — сезонная рассылка
 */
export function marathonBlastEmail(): string {
  return emailLayout("Сезон дипломов: оформляйте вместе", `
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0a0a0a;">
                Дипломный марафон в Diplox
              </h1>
              <p style="margin:0 0 24px;font-size:14px;color:#666666;line-height:1.5;">
                Сезон сдачи работ — самое время оформить документы. Приглашай одногруппников:
                каждый получит +5 бесплатных проверок вместо обычных 3.
              </p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:24px;">
                <tr>
                  <td style="padding:16px;background-color:#f0fff4;border:1px solid #86efac;">
                    <p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#166534;">
                      Акция до 1 июня
                    </p>
                    <p style="margin:0;font-size:13px;color:#166534;">
                      +5 проверок за каждого приглашённого друга (обычно +3)
                    </p>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <a href="https://diplox.online/profile?ref=email-marathon"
                       style="display:inline-block;padding:14px 32px;background-color:#0a0a0a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">
                      Получить ссылку для друзей
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`);
}

interface ReferralReminderParams {
  count: number;
  nextThreshold: number;
  referralUrl: string;
}

export function referralWeeklyReminderEmail({
  count,
  nextThreshold,
  referralUrl,
}: ReferralReminderParams): string {
  const remaining = nextThreshold - count;

  return emailLayout("До бесплатного Pro осталось немного", `
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0a0a0a;">
                Ещё ${remaining} ${remaining === 1 ? "друг" : remaining < 5 ? "друга" : "друзей"} до бесплатного Pro
              </h1>
              <p style="margin:0 0 24px;font-size:14px;color:#666666;line-height:1.5;">
                У вас уже ${count} приглашённых. Поделитесь ссылкой с одногруппниками —
                и получите месяц Pro подписки бесплатно.
              </p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:24px;">
                <tr>
                  <td style="padding:12px 16px;background-color:#fafafa;border:1px solid #e5e5e5;word-break:break-all;">
                    <a href="${referralUrl}" style="font-size:13px;color:#7c3aed;font-weight:600;text-decoration:none;">${referralUrl}</a>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <a href="https://diplox.online/profile"
                       style="display:inline-block;padding:14px 32px;background-color:#0a0a0a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">
                      Мой прогресс
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`);
}
