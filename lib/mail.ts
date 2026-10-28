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

/** One email with a single button-style link, in plain text and HTML. */
function linkMail(
  to: string,
  subject: string,
  intro: string[],
  button: { label: string; href: string },
  footer: string,
): Mail {
  return {
    to,
    subject,
    text: `${intro.join("\n\n")}\n\n${button.label}: ${button.href}\n\n${footer}`,
    html: `${intro.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n")}
<p><a href="${escapeHtml(button.href)}">${escapeHtml(button.label)}</a></p>
<p style="color:#666;font-size:12px">Or paste this link into your browser: ${escapeHtml(button.href)}<br>${escapeHtml(footer)}</p>`,
  };
}

export function verificationMail(to: string, link: string, appName: string): Mail {
  return linkMail(
    to,
    `Confirm your email for ${appName}`,
    [
      `Welcome to ${appName}!`,
      "Confirm your email address to activate your account (the link works for 24 hours):",
    ],
    { label: "Confirm my email", href: link },
    "If you didn't sign up, ignore this email: nothing happens without this link.",
  );
}

/** Sent when someone signs up with an email that already has a confirmed account. */
export function alreadyRegisteredMail(to: string, origin: string, appName: string): Mail {
  return linkMail(
    to,
    `You already have a ${appName} account`,
    [
      `Someone (probably you) just tried to sign up for ${appName} with this email, but it already has an account.`,
      `Sign in at ${origin}/login. Forgot your password? Reset it here:`,
    ],
    { label: "Reset my password", href: `${origin}/forgot` },
    "If this wasn't you, ignore this email: your account hasn't changed.",
  );
}

export function resetPasswordMail(to: string, link: string, appName: string): Mail {
  return linkMail(
    to,
    `Reset your ${appName} password`,
    ["Choose a new password for your account (the link works for 1 hour and only once):"],
    { label: "Choose a new password", href: link },
    "If you didn't ask for this, ignore this email: your password stays the same.",
  );
}
