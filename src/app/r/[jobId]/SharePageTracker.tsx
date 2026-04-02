"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics/events";

export function SharePageTracker({ jobId }: { jobId: string }) {
  useEffect(() => {
    trackEvent("share_page_visit", { job_id: jobId });
  }, [jobId]);

  return null;
}
