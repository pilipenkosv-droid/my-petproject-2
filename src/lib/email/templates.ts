/**
 * HTML-шаблоны email в стиле Diplox
 */

interface DownloadLinkEmailParams {
  downloadUrl: string;
  downloadType: "original" | "formatted";
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
