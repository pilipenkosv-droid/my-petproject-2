"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign"] as const;
const STORAGE_KEY = "dlx_utm";

/**
 * Серверный трекинг посещений страниц.
 * Отправляет POST /api/track/pageview при каждой навигации.
 * UTM-параметры сохраняются в sessionStorage при первом визите.
 */
export function PageTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const prevPath = useRef<string | null>(null);

  useEffect(() => {
    // Не дублируем один и тот же путь подряд
    if (pathname === prevPath.current) return;
    prevPath.current = pathname;

    // Парсим UTM из URL (только при первом визите с UTM)
    let utm = getStoredUtm();
    const urlUtmSource = searchParams.get("utm_source");
    if (urlUtmSource && !utm) {
      utm = {
        utmSource: urlUtmSource,
        utmMedium: searchParams.get("utm_medium") || undefined,
        utmCampaign: searchParams.get("utm_campaign") || undefined,
      };
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(utm));
      } catch { /* SSR/privacy mode */ }
    }

    // Fire-and-forget
    fetch("/api/track/pageview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: pathname,
        referrer: document.referrer || undefined,
        ...utm,
      }),
      keepalive: true,
    }).catch(() => { /* Не блокируем UX */ });
  }, [pathname, searchParams]);

  return null;
}

function getStoredUtm(): Record<string, string | undefined> | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
