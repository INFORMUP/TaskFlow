import nodemailer, { type Transporter } from "nodemailer";
import { config } from "../config.js";

export interface InviteEmailInput {
  to: string;
  orgName: string;
  inviterName: string | null;
  role: string;
  acceptUrl: string;
  expiresAt: Date;
}

let transporter: Transporter | null = null;

function isConfigured(): boolean {
  return Boolean(config.smtpHost && config.smtpUser && config.smtpPass);
}

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpPort === 465,
      auth: { user: config.smtpUser, pass: config.smtpPass },
    });
  }
  return transporter;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function render(input: InviteEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const inviter = input.inviterName ?? "A teammate";
  const expires = input.expiresAt.toUTCString();
  const subject = `You've been invited to ${input.orgName} on TaskFlow`;
  const text = [
    `${inviter} has invited you to join ${input.orgName} on TaskFlow as a ${input.role}.`,
    "",
    `Accept the invitation: ${input.acceptUrl}`,
    "",
    `This invitation expires on ${expires}.`,
    "If you weren't expecting this, you can safely ignore it.",
  ].join("\n");
  const html = `
    <p>${escapeHtml(inviter)} has invited you to join <strong>${escapeHtml(input.orgName)}</strong> on TaskFlow as a <strong>${escapeHtml(input.role)}</strong>.</p>
    <p><a href="${escapeHtml(input.acceptUrl)}">Accept the invitation</a></p>
    <p style="color:#666;font-size:12px">This invitation expires on ${escapeHtml(expires)}. If you weren't expecting this, you can safely ignore it.</p>
  `.trim();
  return { subject, text, html };
}

export async function sendInviteEmail(input: InviteEmailInput): Promise<void> {
  const { subject, text, html } = render(input);

  if (!isConfigured()) {
    console.log(
      `[mailer] SMTP not configured; skipping send. to=${input.to} subject="${subject}"\n${text}`,
    );
    return;
  }

  try {
    await getTransporter().sendMail({
      from: config.smtpFrom,
      to: input.to,
      subject,
      text,
      html,
    });
  } catch (err) {
    console.error(`[mailer] failed to send invite email to ${input.to}:`, err);
  }
}

/** Test-only: drop the cached transporter so config changes take effect. */
export function __resetMailerForTests(): void {
  transporter = null;
}
