import { getEmailSettings } from "@/lib/db-store";

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

  if (!cfg.tenantId || !cfg.clientId || !cfg.clientSecret || !cfg.fromMailbox) {
    return { status: "queued", provider: "graph" };
  }

  return sendGraph(email, cfg.tenantId, cfg.clientId, cfg.clientSecret, cfg.fromMailbox);
}

async function sendGraph(
  email: OutboundEmail,
  tenantId: string,
  clientId: string,
  clientSecret: string,
  fromMailbox: string,
): Promise<EmailResult> {
  // 1. Acquire access token via client credentials flow
  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        scope:         "https://graph.microsoft.com/.default",
        grant_type:    "client_credentials",
      }),
    },
  );

  const tokenJson = (await tokenRes.json()) as { access_token?: string; error_description?: string };
  if (!tokenRes.ok || !tokenJson.access_token) {
    const msg = tokenJson.error_description ?? `Token request failed (${tokenRes.status})`;
    console.error("[Graph]", msg);
    return { status: "failed", provider: "graph", errorMessage: msg };
  }

  // 2. Send the message
  const body: Record<string, unknown> = {
    message: {
      subject: email.subject,
      body: {
        contentType: email.html ? "HTML" : "Text",
        content:     email.html ?? email.text,
      },
      toRecipients: [{ emailAddress: { address: email.to } }],
      attachments: email.attachments?.map((a) => ({
        "@odata.type":  "#microsoft.graph.fileAttachment",
        name:           a.filename,
        contentType:    a.contentType,
        contentBytes:   a.content,
      })) ?? [],
    },
    saveToSentItems: false,
  };

  const sendRes = await fetch(
    `https://graph.microsoft.com/v1.0/users/${fromMailbox}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenJson.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (sendRes.status === 202) {
    return { status: "sent", provider: "graph" };
  }

  const errJson = (await sendRes.json().catch(() => ({}))) as { error?: { message?: string } };
  const errMsg = errJson.error?.message ?? `Send failed (${sendRes.status})`;
  console.error("[Graph]", errMsg);
  return { status: "failed", provider: "graph", errorMessage: errMsg };
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
    html: `<p>${escapeHtml(args.employeeName)}, your ${escapeHtml(args.timeOffType)} entry has been recorded for ${escapeHtml(args.dateRange)}.</p><p>Please update your Outlook out-of-office status for the same date range.</p>`,
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
