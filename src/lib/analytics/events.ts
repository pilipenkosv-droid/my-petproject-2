import { reachGoal } from "@/components/analytics/YandexMetrika";
import { sendGAEvent } from "@/components/analytics/GoogleAnalytics";

/**
 * Funnel events for SmartFormat conversion tracking.
 *
 * Funnel: visit → upload → processing → preview → payment → download
 */
export type FunnelEvent =
  | "file_upload"           // User uploaded source document
  | "guidelines_upload"     // User uploaded methodology document
  | "processing_start"      // Formatting started
  | "processing_complete"   // Formatting finished
  | "preview_view"          // User viewed result preview
  | "payment_init"          // User clicked "Pay" button
  | "payment_complete"      // Payment confirmed
  | "file_download"         // User downloaded formatted file
  | "outline_generate"      // User generated work outline
  | "chat_question"         // User asked question about guidelines
  | "blog_share"            // User shared a blog post
  | "summarize_generate"    // User generated text summary
  | "rewrite_generate"      // User generated rewritten text
  | "grammar_check"         // User checked text grammar
  | "gost_mode_selected"    // User switched to standard GOST mode
  | "work_type_selected";   // User selected work type

/**
 * Track a conversion funnel event in both Yandex.Metrika and GA4.
 */
export function trackEvent(
  event: FunnelEvent,
  params?: Record<string, unknown>
) {
  reachGoal(event, params);
  sendGAEvent(event, params);
}
