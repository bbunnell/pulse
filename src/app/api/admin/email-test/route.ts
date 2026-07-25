import { NextResponse } from "next/server";
import { getSession, getSessionProfileId } from "@/lib/session";
import { sendTransactionalEmail } from "@/lib/email";
import { getEmailSettings } from "@/lib/db-store";

export async function POST(request: Request) {
  const session = await getSession();
  if (!getSessionProfileId(session) || session.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const body = (await request.json()) as { to?: string };
  const to = body.to?.trim();
  if (!to || !to.includes("@")) {
    return NextResponse.json({ error: "A valid recipient email is required." }, { status: 400 });
  }

  const cfg = await getEmailSettings();
  const sent = new Date().toLocaleString("en-US", { timeZone: "America/Chicago" });

  const result = await sendTransactionalEmail({
    to,
    subject: "Team Pulse — email test",
    text: [
      "This is a test message from Team Pulse.",
      "If you received this, your Microsoft 365 SMTP configuration is working correctly.",
      `Sent: ${sent} CT`,
      `Provider: ${cfg.provider}`,
      `Host: ${cfg.smtpHost}:${cfg.smtpPort}`,
      `From: ${cfg.emailFrom}`,
    ].join("\n"),
    html: `
      <table style="font-family:sans-serif;font-size:14px;color:#111;max-width:480px">
        <tr><td style="padding-bottom:16px">
          <strong style="font-size:16px">Team Pulse — email test</strong>
        </td></tr>
        <tr><td style="padding-bottom:12px">
          This is a test message from Team Pulse. If you received this, your
          Microsoft 365 SMTP configuration is working correctly.
        </td></tr>
        <tr><td style="background:#f4f4f5;border-radius:6px;padding:12px;font-size:12px;font-family:monospace">
          Sent: ${sent} CT<br>
          Provider: ${cfg.provider}<br>
          Host: ${cfg.smtpHost}:${cfg.smtpPort}<br>
          From: ${cfg.emailFrom}
        </td></tr>
      </table>
    `,
  });

  if (result.status === "failed") {
    return NextResponse.json({ error: result.errorMessage ?? "Send failed." }, { status: 502 });
  }

  if (result.status === "queued") {
    return NextResponse.json({
      warning: "No email provider is configured. Save your SMTP settings and try again.",
      result,
    });
  }

  return NextResponse.json({ ok: true, result });
}
