"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

const METRIKA_ID = process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID;

declare global {
  interface Window {
    ym: (...args: unknown[]) => void;
  }
}

export function YandexMetrika() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!METRIKA_ID) return;
    // Track page views on route change (SPA navigation)
    window.ym?.(Number(METRIKA_ID), "hit", window.location.href);
  }, [pathname, searchParams]);

  if (!METRIKA_ID) return null;

  return (
    <>
      <Script
        id="yandex-metrika"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
            m[i].l=1*new Date();
            for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
            k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
            (window, document, "script", "https://mc.yandex.ru/metrika/tag.js?id=${METRIKA_ID}", "ym");

            ym(${METRIKA_ID}, "init", {
              ssr: true,
              clickmap: true,
              trackLinks: true,
              accurateTrackBounce: true,
              webvisor: true,
              trackHash: true,
              ecommerce: "dataLayer",
              referrer: document.referrer,
              url: location.href
            });
          `,
        }}
      />
      <noscript>
        <div>
          <img
            src={`https://mc.yandex.ru/watch/${METRIKA_ID}`}
            style={{ position: "absolute", left: "-9999px" }}
            alt=""
          />
        </div>
      </noscript>
    </>
  );
}

/**
 * Send a Yandex.Metrika goal/event.
 * Usage: reachGoal("file_upload") or reachGoal("payment_complete", { price: 159 })
 */
export function reachGoal(target: string, params?: Record<string, unknown>) {
  if (!METRIKA_ID) return;
  window.ym?.(Number(METRIKA_ID), "reachGoal", target, params);
}
