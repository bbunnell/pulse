import nodemailer from "nodemailer";
import { getEmailSettings, type EmailSettings } from "@/lib/db-store";

export interface EmailAttachment {
  filename: string;
  content: string;
  contentType: string;
}

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
}

export interface EmailResult {
  status: "sent" | "queued" | "failed";
  provider?: string;
  providerMessageId?: string;
  errorMessage?: string;
}

export async function sendTransactionalEmail(email: OutboundEmail): Promise<EmailResult> {
  const cfg = await getEmailSettings();
  const provider = cfg.provider.toLowerCase();

  if (provider === "resend" && process.env.RESEND_API_KEY) {
    return sendResend(email, cfg.emailFrom);
  }

  if (provider === "postmark" && process.env.POSTMARK_SERVER_TOKEN) {
    return sendPostmark(email, cfg.emailFrom);
  }

  if (provider === "sendgrid" && process.env.SENDGRID_API_KEY) {
    return sendSendGrid(email, cfg.emailFrom);
  }

  if (provider === "smtp" && cfg.smtpHost) {
    return sendSmtp(email, cfg);
  }

  return {
    status: "queued",
    provider: provider || "none",
  };
}

export function timeOffConfirmationEmail(args: {
  employeeName: string;
  timeOffType: string;
  dateRange: string;
}) {
  const subject = `${titleCase(args.timeOffType)} recorded`;
  const text = [
    `${args.employeeName}, your ${args.timeOffType} entry has been recorded for ${args.dateRange}.`,
    "Please update your Outlook out-of-office status for the same date range.",
  ].join("\n\n");

  return {
    subject,
    text,
    html: `<p>${escapeHtml(args.employeeName)}, your ${escapeHtml(args.timeOffType)} entry has been recorded for ${escapeHtml(
      args.dateRange,
    )}.</p><p>Please update your Outlook out-of-office status for the same date range.</p>`,
  };
}

export function reminderEmail(args: { employeeName: string; reminderType: string }) {
  const subject = titleCase(args.reminderType.replaceAll("_", " "));
  const text = `${args.employeeName}, reminder: ${args.reminderType.replaceAll("_", " ")}.`;

  return {
    subject,
    text,
    html: `<p>${escapeHtml(args.employeeName)}, reminder: ${escapeHtml(args.reminderType.replaceAll("_", " "))}.</p>`,
  };
}

async function sendResend(email: OutboundEmail, fromAddress: string): Promise<EmailResult> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress,
      to: [email.to],
      subject: email.subject,
      text: email.text,
      html: email.html,
      attachments: email.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
      })),
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
  return response.ok
    ? { status: "sent", provider: "resend", providerMessageId: payload.id }
    : { status: "failed", provider: "resend", errorMessage: payload.message ?? response.statusText };
}

async function sendPostmark(email: OutboundEmail, fromAddress: string): Promise<EmailResult> {
  const response = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      "X-Postmark-Server-Token": process.env.POSTMARK_SERVER_TOKEN as string,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      From: extractEmail(fromAddress),
      To: email.to,
      Subject: email.subject,
      TextBody: email.text,
      HtmlBody: email.html,
      Attachments: email.attachments?.map((attachment) => ({
        Name: attachment.filename,
        Content: attachment.content,
        ContentType: attachment.contentType,
      })),
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as { MessageID?: string; Message?: string };
  return response.ok
    ? { status: "sent", provider: "postmark", providerMessageId: payload.MessageID }
    : { status: "failed", provider: "postmark", errorMessage: payload.Message ?? response.statusText };
}

async function sendSendGrid(email: OutboundEmail, fromAddress: string): Promise<EmailResult> {
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: email.to }] }],
      from: { email: extractEmail(fromAddress) },
      subject: email.subject,
      content: [
        { type: "text/plain", value: email.text },
        ...(email.html ? [{ type: "text/html", value: email.html }] : []),
      ],
      attachments: email.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        type: attachment.contentType,
        disposition: "attachment",
      })),
    }),
  });

  return response.ok
    ? { status: "sent", provider: "sendgrid" }
    : { status: "failed", provider: "sendgrid", errorMessage: response.statusText };
}

async function sendSmtp(email: OutboundEmail, cfg: EmailSettings): Promise<EmailResult> {
  const port = cfg.smtpPort;
  const isTls = port === 465;

  const transporter = nodemailer.createTransport({
    host: cfg.smtpHost,
    port,
    // port 465 = implicit TLS; port 587 = STARTTLS (required for Microsoft 365)
    secure: isTls,
    requireTLS: !isTls,          // enforce STARTTLS on port 587
    auth: cfg.smtpUser && cfg.smtpPassword
      ? { user: cfg.smtpUser, pass: cfg.smtpPassword }
      : undefined,
    tls: {
      // Microsoft 365 requires these — do not reject on self-signed certs in dev
      minVersion: "TLSv1.2",
      rejectUnauthorized: process.env.NODE_ENV === "production",
    },
  });

  try {
    const result = await transporter.sendMail({
      from: cfg.emailFrom,
      to: email.to,
      subject: email.subject,
      text: email.text,
      html: email.html,
      attachments: email.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        encoding: "base64",
        contentType: a.contentType,
      })),
    });

    return { status: "sent", provider: "smtp", providerMessageId: result.messageId };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "SMTP send failed";
    console.error("[SMTP]", msg);
    return { status: "failed", provider: "smtp", errorMessage: msg };
  }
}

function extractEmail(value: string) {
  return value.match(/<(.+)>/)?.[1] ?? value;
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
