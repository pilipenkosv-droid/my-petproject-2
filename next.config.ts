import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Включаем Server Actions для обработки файлов
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb", // Увеличенный лимит для загрузки документов
    },
  },
  // Отключаем DevTools overlay
  devIndicators: {
    appIsrStatus: false,
    buildActivity: false,
  },
};

export default nextConfig;
