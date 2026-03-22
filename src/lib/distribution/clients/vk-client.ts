/**
 * Клиент VK API для публикации на стену сообщества
 * Поддержка загрузки фото через photos.getWallUploadServer
 */

import type { VkConfig } from "../types";

const VK_API_VERSION = "5.199";
const SITE_URL = "https://diplox.online";

async function vkApi(method: string, params: Record<string, string>) {
  const urlParams = new URLSearchParams({ ...params, v: VK_API_VERSION });
  const res = await fetch(`https://api.vk.com/method/${method}`, {
    method: "POST",
    body: urlParams,
  });
  const body = (await res.json()) as {
    response?: Record<string, unknown>;
    error?: { error_msg: string; error_code: number };
  };
  if (body.error) {
    throw new Error(`VK API ${method} error ${body.error.error_code}: ${body.error.error_msg}`);
  }
  return body.response;
}

async function uploadWallPhoto(
  imageUrl: string,
  config: VkConfig
): Promise<string> {
  // 1. Получаем URL для загрузки
  const server = (await vkApi("photos.getWallUploadServer", {
    group_id: config.groupId,
    access_token: config.token,
  })) as { upload_url: string };

  // 2. Скачиваем изображение
  const imageRes = await fetch(imageUrl);
  const imageBlob = await imageRes.blob();

  // 3. Загружаем на VK
  const formData = new FormData();
  formData.append("photo", imageBlob, "cover.png");

  const uploadRes = await fetch(server.upload_url, {
    method: "POST",
    body: formData,
  });
  const uploadData = (await uploadRes.json()) as {
    server: number;
    photo: string;
    hash: string;
  };

  // 4. Сохраняем фото
  const saved = (await vkApi("photos.saveWallPhoto", {
    group_id: config.groupId,
    photo: uploadData.photo,
    server: String(uploadData.server),
    hash: uploadData.hash,
    access_token: config.token,
  })) as unknown as Array<{ owner_id: number; id: number }>;

  return `photo${saved[0].owner_id}_${saved[0].id}`;
}

export async function postToVkWall(
  message: string,
  _attachments: string,
  config: VkConfig,
  coverImagePath?: string
): Promise<void> {
  let attachments = "";

  if (coverImagePath) {
    try {
      const photoAttachment = await uploadWallPhoto(
        `${SITE_URL}${coverImagePath}`,
        config
      );
      attachments = photoAttachment;
    } catch (err) {
      console.error("[vk-client] Photo upload failed, posting without image:", err);
    }
  }

  const params: Record<string, string> = {
    owner_id: `-${config.groupId}`,
    from_group: "1",
    message,
    access_token: config.token,
  };

  if (attachments) {
    params.attachments = attachments;
  }

  await vkApi("wall.post", params);
}
