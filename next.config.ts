import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Включаем Server Actions для обработки файлов
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
  // Отключаем DevTools overlay
  devIndicators: {
    appIsrStatus: false,
    buildActivity: false,
  },
  // Cache headers — позволяет Cloudflare CDN кэшировать статику
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        {
          key: "X-DNS-Prefetch-Control",
          value: "on",
        },
      ],
    },
    {
      // Статические ассеты (_next/static) — долгий кэш
      source: "/_next/static/(.*)",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=31536000, immutable",
        },
      ],
    },
    {
      // Шрифты — долгий кэш
      source: "/(.*\\.woff2?)",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=31536000, immutable",
        },
      ],
    },
  ],
};

export default nextConfig;
