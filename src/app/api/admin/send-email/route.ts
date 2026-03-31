/**
 * POST /api/admin/send-email
 *
 * Универсальный admin-endpoint для email-рассылок через Timeweb SMTP.
 * Поддерживает: персонализированные письма, batch-отправку, HTML-шаблоны.
 *
 * Body:
 *   recipients: Array<{ email: string; subject: string; html: string }>
 *   — или —
 *   template: string (название шаблона)
 *   recipients: Array<{ email: string; vars: Record<string, string> }>
 *
 * Примеры использования:
 *   - Извинительные письма с персонализированными ссылками
 *   - Маркетинговые прогревы
 *   - Уведомления о новых фичах
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/transport";
import { emailLayout } from "@/lib/email/templates";

export const maxDuration = 60;

const ADMIN_EMAILS = ["pilipenkosv@gmail.com", "mary_shu@mail.ru"];

async function verifyAdmin(request: NextRequest): Promise<boolean> {
  // Вариант 1: Bearer token (из /admin UI)
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const admin = getSupabaseAdmin();
    const { data: { user } } = await admin.auth.getUser(token);
    if (user?.email && ADMIN_EMAILS.includes(user.email)) return true;
  }

  // Вариант 2: x-cron-secret (для программного доступа и автоматических рассылок)
  const cronSecret = request.headers.get("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET;
  if (cronSecret && expectedSecret && cronSecret === expectedSecret) return true;

  return false;
}

/** Встроенные шаблоны */
const TEMPLATES: Record<string, (vars: Record<string, string>) => { subject: string; html: string }> = {
  apology_unlock: (vars) => ({
    subject: "Ваш документ готов — приносим извинения за задержку | Diplox",
    html: emailLayout("Ваш документ готов", `
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#0a0a0a;">Здравствуйте!</p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#0a0a0a;">
                Из-за технического сбоя после оплаты вам была выдана неполная версия документа
                <strong>&laquo;${vars.docName}&raquo;</strong>.
                Мы это исправили &mdash; <strong>полная версия вашего документа (${vars.pages} стр.) теперь доступна для скачивания</strong>.
              </p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#0a0a0a;">Приносим искренние извинения за неудобства.</p>
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="background-color:#0a0a0a;padding:14px 28px;">
                    <a href="${vars.resultUrl}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;">
                      Скачать полную версию
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#666666;">Если возникнут вопросы &mdash; напишите нам, мы поможем.</p>
            </td>
          </tr>`),
  }),

  announcement: (vars) => ({
    subject: vars.subject || "Новости от Diplox",
    html: emailLayout(vars.subject || "Новости", `
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#0a0a0a;line-height:1.3;">
                ${vars.heading || vars.subject}
              </h1>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#333333;">${vars.body}</p>
              ${vars.ctaUrl ? `
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="background-color:#0a0a0a;padding:14px 28px;">
                    <a href="${vars.ctaUrl}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;">
                      ${vars.ctaText || "Подробнее"}
                    </a>
                  </td>
                </tr>
              </table>` : ""}
            </td>
          </tr>`),
  }),
};

interface TemplateRecipient {
  email: string;
  vars: Record<string, string>;
}

interface RawRecipient {
  email: string;
  subject: string;
  html: string;
}

interface SendEmailRequest {
  template?: string;
  recipients: (TemplateRecipient | RawRecipient)[];
  dryRun?: boolean;
}

export async function POST(request: NextRequest) {
  const isAdmin = await verifyAdmin(request);
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body: SendEmailRequest = await request.json();
  const { template, recipients, dryRun } = body;

  if (!recipients?.length) {
    return NextResponse.json({ error: "recipients required" }, { status: 400 });
  }

  if (recipients.length > 50) {
    return NextResponse.json({ error: "max 50 recipients per request" }, { status: 400 });
  }

  const templateFn = template ? TEMPLATES[template] : null;
  if (template && !templateFn) {
    return NextResponse.json({
      error: `Unknown template: ${template}`,
      available: Object.keys(TEMPLATES),
    }, { status: 400 });
  }

  const results: { email: string; ok: boolean; error?: string }[] = [];

  for (const recipient of recipients) {
    try {
      let subject: string;
      let html: string;

      if (templateFn && "vars" in recipient) {
        const rendered = templateFn(recipient.vars);
        subject = rendered.subject;
        html = rendered.html;
      } else if ("subject" in recipient && "html" in recipient) {
        subject = recipient.subject;
        html = recipient.html;
      } else {
        results.push({ email: recipient.email, ok: false, error: "invalid recipient format" });
        continue;
      }

      if (dryRun) {
        results.push({ email: recipient.email, ok: true, error: "dry_run" });
        continue;
      }

      await sendEmail({ to: recipient.email, subject, html });
      results.push({ email: recipient.email, ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      console.error(`[send-email] Failed for ${recipient.email}:`, msg);
      results.push({ email: recipient.email, ok: false, error: msg });
    }
  }

  const sent = results.filter((r) => r.ok && r.error !== "dry_run").length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`[send-email] Admin send: sent=${sent}, failed=${failed}, dryRun=${!!dryRun}`);

  return NextResponse.json({
    ok: true,
    sent,
    failed,
    dryRun: !!dryRun,
    results,
  });
}
