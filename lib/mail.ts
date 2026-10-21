import nodemailer, { type Transporter } from "nodemailer";
import { getConfig, type AppConfig } from "./config";
import { logger } from "./logger";

/*
 * Outgoing email over SMTP (MAIL_* settings, same names as Laravel). Used for signup verification.
 * Without MAIL_HOST nothing is sent: the message (with its link) is only logged, which is fine for
 * local development but means nobody can verify an account in production.
 */

export type Mail = { to: string; subject: string; text: string; html: string };

let transporter: Transporter | undefined;

function getTransporter(cfg: AppConfig): Transporter | undefined {
  if (!cfg.MAIL_HOST) return undefined;
  transporter ??= nodemailer.createTransport({
    host: cfg.MAIL_HOST,
    port: cfg.MAIL_PORT,
    // "ssl" = implicit TLS (port 465); "tls" = STARTTLS upgrade (port 587), required, never plain text.
    secure: cfg.MAIL_ENCRYPTION === "ssl",
    requireTLS: cfg.MAIL_ENCRYPTION === "tls",
    auth: cfg.MAIL_USERNAME ? { user: cfg.MAIL_USERNAME, pass: cfg.MAIL_PASSWORD } : undefined,
    connectionTimeout: 15_000,
  });
  return transporter;
}

export function mailConfigured(cfg: AppConfig = getConfig()): boolean {
  return Boolean(cfg.MAIL_HOST && cfg.MAIL_FROM_ADDRESS);
}

export async function sendMail(mail: Mail, cfg: AppConfig = getConfig()): Promise<void> {
  const t = getTransporter(cfg);
  if (!t || !cfg.MAIL_FROM_ADDRESS) {
    logger.warn({ to: mail.to, subject: mail.subject, text: mail.text }, "MAIL_HOST not set: email NOT sent");
    return;
  }
  await t.sendMail({
    from: { name: cfg.MAIL_FROM_NAME, address: cfg.MAIL_FROM_ADDRESS },
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
  logger.info({ to: mail.to, subject: mail.subject }, "email sent");
}

/** Checks the SMTP login without sending anything. */
export async function verifyMailConnection(cfg: AppConfig = getConfig()): Promise<void> {
  const t = getTransporter(cfg);
  if (!t) throw new Error("MAIL_HOST is not set");
  await t.verify();
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function verificationMail(to: string, link: string, appName: string): Mail {
  return {
    to,
    subject: `Confirm your email for ${appName}`,
    text: `Welcome to ${appName}!\n\nConfirm your email address by opening this link (valid for 24 hours):\n${link}\n\nIf you didn't sign up, ignore this email.`,
    html: `<p>Welcome to ${escapeHtml(appName)}!</p>
<p>Confirm your email address (the link is valid for 24 hours):</p>
<p><a href="${escapeHtml(link)}">Confirm my email</a></p>
<p style="color:#666;font-size:12px">Or paste this link into your browser: ${escapeHtml(link)}<br>If you didn't sign up, ignore this email.</p>`,
  };
}
