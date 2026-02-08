"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

declare global {
  interface Window {
    gtag: (...args: unknown[]) => void;
    dataLayer: unknown[];
  }
}

export function GoogleAnalytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!GA_ID) return;
    // Track page views on SPA navigation
    window.gtag?.("config", GA_ID, {
      page_path: pathname + (searchParams.toString() ? `?${searchParams.toString()}` : ""),
    });
  }, [pathname, searchParams]);

  if (!GA_ID) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script
        id="google-analytics"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}');
          `,
        }}
      />
    </>
  );
}

/**
 * Send a GA4 event.
 * Usage: sendGAEvent("file_upload", { file_type: "docx" })
 */
export function sendGAEvent(
  eventName: string,
  params?: Record<string, unknown>
) {
  if (!GA_ID) return;
  window.gtag?.("event", eventName, params);
}
