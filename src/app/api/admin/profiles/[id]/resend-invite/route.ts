import { NextResponse } from "next/server";
import { getSession, getSessionProfileId } from "@/lib/session";
import { adminResetPassword, getProfileById } from "@/lib/db-store";
import { sendTransactionalEmail } from "@/lib/email";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!getSessionProfileId(session) || session.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { id } = await params;

  const profile = await getProfileById(id);
  if (!profile) return NextResponse.json({ error: "User not found." }, { status: 404 });

  // Generate fresh temp password so the invite is usable
  const { tempPassword } = await adminResetPassword(id);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const loginUrl = `${baseUrl}/login`;

  const result = await sendTransactionalEmail({
    to: profile.email,
    subject: "Welcome to TimeBoard — account details & Teams setup",
    text: buildPlainText(profile.firstName, profile.email, tempPassword, loginUrl),
    html: buildHtml(profile.firstName, profile.email, tempPassword, loginUrl),
  });

  return NextResponse.json({ ok: true, emailStatus: result.status });
}

function buildPlainText(firstName: string, email: string, password: string, loginUrl: string) {
  return [
    `Hi ${firstName},`,
    ``,
    `Here are your TimeBoard account details${password ? " (your password has been reset)" : ""}.`,
    ``,
    `  Login:    ${loginUrl}`,
    `  Email:    ${email}`,
    `  Password: ${password}`,
    ``,
    `You will be prompted to set a new password after signing in.`,
    ``,
    `─── Set up Teams notifications ─────────────────────────────────`,
    ``,
    `  1. Go to https://make.powerautomate.com and sign in.`,
    `  2. Create an Instant cloud flow — trigger: "When a HTTP request is received".`,
    `  3. Add step: Teams → "Post a message in a chat or channel".`,
    `     Post as: Flow bot | Post in: Chat with Flow bot | Recipient: ${email}`,
    `     Message: Body (dynamic content from trigger).`,
    `  4. Save the flow and copy the HTTP POST URL.`,
    `  5. Share the URL with your admin to enable Teams reminders.`,
    ``,
    `— TimeBoard`,
  ].join("\n");
}

function buildHtml(firstName: string, email: string, password: string, loginUrl: string) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
  <tr><td style="background:#4F46E5;padding:28px 32px;">
    <p style="margin:0;font-size:20px;font-weight:700;color:#fff;">Welcome to TimeBoard</p>
    <p style="margin:6px 0 0;font-size:14px;color:rgba(255,255,255,.8);">Hi ${firstName} — here are your account details.</p>
  </td></tr>
  <tr><td style="padding:28px 32px 0;">
    <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#0F172A;">
      <span style="display:inline-block;width:24px;height:24px;background:#4F46E5;color:#fff;border-radius:50%;font-size:12px;font-weight:700;text-align:center;line-height:24px;margin-right:8px;">1</span>
      Sign in to TimeBoard
    </p>
    <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;width:100%;">
      <tr>
        <td style="font-size:12px;color:#64748b;padding-bottom:6px;width:80px;">URL</td>
        <td style="font-size:13px;"><a href="${loginUrl}" style="color:#4F46E5;">${loginUrl}</a></td>
      </tr>
      <tr>
        <td style="font-size:12px;color:#64748b;padding-bottom:6px;padding-top:6px;">Email</td>
        <td style="font-size:13px;color:#0F172A;">${email}</td>
      </tr>
      <tr>
        <td style="font-size:12px;color:#64748b;padding-top:6px;">Password</td>
        <td><span style="font-family:monospace;font-size:16px;font-weight:700;letter-spacing:2px;background:#EEF2FF;color:#3730A3;padding:4px 10px;border-radius:5px;">${password}</span></td>
      </tr>
    </table>
    <p style="margin:10px 0 0;font-size:12px;color:#64748b;">You'll be prompted to set a permanent password after sign-in.</p>
  </td></tr>
  <tr><td style="padding:20px 32px 0;"><hr style="border:none;border-top:1px solid #e2e8f0;margin:0;"></td></tr>
  <tr><td style="padding:20px 32px 0;">
    <p style="margin:0 0 12px;font-size:16px;font-weight:700;color:#0F172A;">
      <span style="display:inline-block;width:24px;height:24px;background:#4F46E5;color:#fff;border-radius:50%;font-size:12px;font-weight:700;text-align:center;line-height:24px;margin-right:8px;">2</span>
      Set up Teams reminders <span style="font-size:12px;font-weight:400;color:#64748b;">(optional)</span>
    </p>
    <ol style="margin:0;padding-left:18px;font-size:13px;color:#334155;line-height:1.7;">
      <li>Go to <a href="https://make.powerautomate.com" style="color:#4F46E5;">make.powerautomate.com</a> and sign in with your NBIT account.</li>
      <li>Click <strong>New flow → Instant cloud flow</strong>. Name it <em>"TimeBoard Reminder"</em>.</li>
      <li>Trigger: <strong>"When a HTTP request is received"</strong>.</li>
      <li>Add step: <strong>Teams → "Post a message in a chat or channel"</strong>.</li>
      <li>Set <strong>Post as: Flow bot</strong> · <strong>Post in: Chat with Flow bot</strong> · <strong>Recipient: ${email}</strong> · <strong>Message: Body</strong> (from trigger).</li>
      <li>Save the flow. Copy the <strong>HTTP POST URL</strong> from the trigger step.</li>
      <li>Send the URL to your admin to activate Teams reminders.</li>
    </ol>
  </td></tr>
  <tr><td style="padding:24px 32px 28px;">
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 16px;">
    <p style="margin:0;font-size:12px;color:#94a3b8;">This is an automated message from TimeBoard.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}
