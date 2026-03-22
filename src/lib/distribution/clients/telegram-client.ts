/**
 * Клиент Telegram Bot API для публикации в канал
 * Если есть coverImage — отправляет sendPhoto с caption
 * Иначе — sendMessage с текстом
 */

import type { TelegramConfig } from "../types";

const SITE_URL = "https://diplox.online";

export async function sendToTelegramChannel(
  text: string,
  config: TelegramConfig,
  coverImagePath?: string
): Promise<void> {
  const baseUrl = `https://api.telegram.org/bot${config.botToken}`;

  if (coverImagePath) {
    // sendPhoto с URL картинки — Telegram сам скачает
    const photoUrl = `${SITE_URL}${coverImagePath}`;
    const response = await fetch(`${baseUrl}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.channelId,
        photo: photoUrl,
        caption: text,
        parse_mode: "HTML",
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const description =
        (body as { description?: string }).description || response.statusText;
      throw new Error(`Telegram API error: ${description}`);
    }
  } else {
    const response = await fetch(`${baseUrl}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.channelId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: false,
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const description =
        (body as { description?: string }).description || response.statusText;
      throw new Error(`Telegram API error: ${description}`);
    }
  }
}
