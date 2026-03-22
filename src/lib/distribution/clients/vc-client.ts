/**
 * Клиент VC.ru API для создания записи
 */

import type { VcConfig } from "../types";

export async function createVcEntry(
  title: string,
  text: string,
  config: VcConfig
): Promise<void> {
  const response = await fetch("https://api.vc.ru/v2.1/entry/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Device-Token": config.token,
    },
    body: JSON.stringify({
      title,
      text,
      subsite_id: Number(config.subsiteId),
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`VC.ru API error ${response.status}: ${body.slice(0, 200)}`);
  }
}
