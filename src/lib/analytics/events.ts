import { sendGAEvent } from "@/components/analytics/GoogleAnalytics";

/**
 * Funnel events for Diplox conversion tracking.
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
  | "sources_search"        // User searched for academic sources
  | "gost_mode_selected"    // User switched to standard GOST mode
  | "work_type_selected"    // User selected work type
  | "subscription_pro_view"    // Pro card scrolled into viewport on pricing page
  | "subscription_upsell_view"  // Pro upsell banner viewed on result page
  | "email_capture_submit"      // Anonymous user submitted email to get download link
  | "share_popup_shown"         // Share popup shown after job completion
  | "share_click"               // User clicked share button (any channel)
  | "share_page_visit"          // Visitor landed on /r/[jobId] share page
  | "referral_link_copy"        // User copied referral link
  | "referral_click"            // Visitor clicked referral link
  | "referral_registration"     // Referred user registered
  | "referral_reward"           // Referral reward granted
  | "group_link_created"        // User created a group link
  | "group_link_joined"         // User joined via group link
  | "group_link_copy"            // User copied group link
  | "tool_call_attempt"          // Tool API call initiated (server-side)
  | "tool_truncated_shown"       // Truncated tool result rendered to anon/free user
  | "tool_email_gate_opened"     // EmailGateModal opened for tool source
  | "tool_email_submitted"       // Email submitted from tool gate
  | "tool_upsell_clicked"        // CTA clicked in ProUpsellBanner with context=tool
  | "ask_quota_exceeded_shown"   // Free user hit ask-guidelines question limit
  | "tool_quota_exceeded_shown"; // Pro user hit monthly tool-uses cap

/**
 * Track a conversion funnel event in both Yandex.Metrika and GA4.
 */
export function trackEvent(
  event: FunnelEvent,
  params?: Record<string, unknown>
) {
  sendGAEvent(event, params);
}
