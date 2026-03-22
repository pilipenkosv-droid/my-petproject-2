/**
 * SMTP транспорт для отправки email через Timeweb
 */

import nodemailer from "nodemailer";

const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.timeweb.ru",
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER || "hello@diplox.online",
    pass: process.env.SMTP_PASSWORD,
  },
});

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailParams) {
  if (!process.env.SMTP_PASSWORD) {
    console.warn("⚠️ SMTP_PASSWORD not set, logging email instead");
    console.log(`📧 Email to: ${to} | Subject: ${subject}`);
    return;
  }

  await transport.sendMail({
    from: `"Diplox" <${process.env.SMTP_USER || "hello@diplox.online"}>`,
    to,
    subject,
    html,
  });

  console.log(`📧 Email sent to: ${to}`);
}
