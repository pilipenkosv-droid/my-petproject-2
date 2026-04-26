/**
 * Email-шаблон для отправки ссылки на полный результат AI-инструмента.
 * Используется при «Получить полную версию» в anon/free тире.
 */

import { emailLayout } from "./templates";
import type { ToolName } from "@/lib/auth/tool-access";

interface ToolOutputLinkEmailParams {
  tool: ToolName;
  link: string;
  expiresInDays?: number;
}

const TOOL_LABELS: Record<ToolName, string> = {
  rewrite: "Переписанный текст",
  summarize: "Краткое содержание",
  outline: "План работы",
  "ask-guidelines": "Ответ по методичке",
};

export function toolOutputLinkEmail({
  tool,
  link,
  expiresInDays = 7,
}: ToolOutputLinkEmailParams): string {
  const label = TOOL_LABELS[tool] ?? "Результат от Diplox";

  return emailLayout("Ваш результат от Diplox готов", `
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0a0a0a;line-height:1.3;">
                ${label} готов
              </h1>
              <p style="margin:0 0 24px;font-size:14px;color:#666666;line-height:1.5;">
                Полная версия результата доступна по ссылке ниже. Сохрани её — ссылка действует ${expiresInDays} дней.
              </p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:24px;">
                <tr>
                  <td align="center">
                    <a href="${link}"
                       target="_blank"
                       style="display:inline-block;padding:14px 32px;background-color:#0a0a0a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;letter-spacing:0.3px;">
                      Открыть результат
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 24px;font-size:12px;color:#999999;text-align:center;line-height:1.5;">
                Или скопируй ссылку: <br>
                <a href="${link}" style="color:#666;word-break:break-all;">${link}</a>
              </p>
            </td>
          </tr>

          <!-- Pro upsell -->
          <tr>
            <td style="padding:0 32px 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding:16px;background-color:#f5f0ff;border:1px solid #e0d4ff;">
                    <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#0a0a0a;">
                      Нужно больше? Подпиши Pro
                    </p>
                    <p style="margin:0 0 12px;font-size:12px;color:#666666;line-height:1.4;">
                      50 запросов к AI-инструментам в месяц + полные результаты сразу, без писем и ожидания.
                    </p>
                    <a href="https://diplox.online/pricing?ref=tool-email"
                       style="font-size:12px;color:#0a0a0a;font-weight:600;text-decoration:underline;">
                      Посмотреть Pro →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`);
}
