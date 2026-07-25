import { NextResponse } from "next/server";
import { getSession, getSessionProfileId } from "@/lib/session";
import { createInvitedUser, findUserAuthByEmail, recordAudit } from "@/lib/db-store";
import { sendTransactionalEmail } from "@/lib/email";

export async function POST(request: Request) {
  const session = await getSession();
  const actorId = getSessionProfileId(session);
  if (!actorId || session.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const body = (await request.json()) as {
    firstName?: string;
    lastName?: string;
    email?: string;
    role?: "employee" | "manager" | "admin";
    teamId?: string;
    timezone?: string;
    initialPassword?: string;
  };

  if (!body.firstName || !body.lastName || !body.email || !body.role) {
    return NextResponse.json({ error: "Missing user fields." }, { status: 400 });
  }

  const initialPw = body.initialPassword?.trim();
  if (initialPw && initialPw.length < 8) {
    return NextResponse.json(
      { error: "One-time password must be at least 8 characters (or leave blank to auto-generate)." },
      { status: 400 },
    );
  }

  const emailLower = body.email.toLowerCase().trim();

  const exists = await findUserAuthByEmail(emailLower);
  if (exists) {
    return NextResponse.json({ error: "A user with that email already exists." }, { status: 409 });
  }

  const { tempPassword } = await createInvitedUser({
    firstName: body.firstName,
    lastName: body.lastName,
    email: body.email.trim(),
    role: body.role,
    teamId: body.teamId,
    timezone: body.timezone,
    initialPassword: initialPw || undefined,
  });

  const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
  const loginUrl = `${baseUrl}/login`;

  const result = await sendTransactionalEmail({
    to: body.email,
    subject: "Welcome to Team Pulse — account details & Teams setup",
    text: buildPlainText(body.firstName, body.email, tempPassword, loginUrl),
    html: buildHtml(body.firstName, body.email, tempPassword, loginUrl),
  });

  if (result.status === "queued") {
    console.log(`\n[Team Pulse] Temp password for ${body.email}: ${tempPassword}\n`);
  }

  await recordAudit({
    actorUserId: actorId,
    entityType: "user",
    action: "create",
    summary: `Created ${body.role} account for ${body.firstName} ${body.lastName} (${emailLower})`,
  });

  return NextResponse.json({ ok: true, tempPassword }, { status: 201 });
}

// ── Email content ─────────────────────────────────────────────────────────────

function buildPlainText(firstName: string, email: string, password: string, loginUrl: string): string {
  return [
    `Hi ${firstName},`,
    ``,
    `Your Team Pulse account has been created. Here's everything you need to get started.`,
    ``,
    `─── STEP 1: Sign in to Team Pulse ───────────────────────────────`,
    ``,
    `  URL:      ${loginUrl}`,
    `  Email:    ${email}`,
    `  Password: ${password}`,
    ``,
    `You will be prompted to set a new password after your first sign-in.`,
    ``,
    `─── STEP 2: Set up Teams reminder notifications (optional) ─────`,
    ``,
    `Team Pulse can send you a direct Teams message when it's time to`,
    `clock in or clock out. To enable this, create a personal webhook`,
    `using Power Automate by following these steps:`,
    ``,
    `  1. Go to https://make.powerautomate.com and sign in with your`,
    `     NBIT Microsoft account.`,
    ``,
    `  2. Click "New flow" → "Instant cloud flow".`,
    `     Give it a name like "Team Pulse Reminder".`,
    ``,
    `  3. Choose the trigger: "When a HTTP request is received".`,
    `     Click Create.`,
    ``,
    `  4. Click "+ New step" and search for "Microsoft Teams".`,
    `     Choose the action: "Post a message in a chat or channel".`,
    ``,
    `  5. Configure the action:`,
    `     • Post as:   Flow bot`,
    `     • Post in:   Chat with Flow bot`,
    `     • Recipient: ${email}`,
    `     • Message:   Click the lightning bolt icon and select`,
    `                  "Body" from the trigger step.`,
    ``,
    `  6. Save the flow. Click on the trigger step ("When a HTTP`,
    `     request is received") and copy the "HTTP POST URL".`,
    ``,
    `  7. Send your webhook URL to your admin so it can be added`,
    `     to your Team Pulse profile. Once added, reminders will`,
    `     be sent directly to you in Teams.`,
    ``,
    `─────────────────────────────────────────────────────────────────`,
    ``,
    `Questions? Reply to this email or contact your Team Pulse admin.`,
    ``,
    `— Team Pulse`,
  ].join("\n");
}

function buildHtml(firstName: string, email: string, password: string, loginUrl: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
  <tr><td align="center">
  <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">

    <!-- Header -->
    <tr><td style="background:#00579D;padding:28px 32px;">
      <p style="margin:0;font-size:20px;font-weight:700;color:#fff;">Welcome to Team Pulse</p>
      <p style="margin:6px 0 0;font-size:14px;color:rgba(255,255,255,.8);">Your account is ready, ${firstName}.</p>
    </td></tr>

    <!-- Step 1: Sign in -->
    <tr><td style="padding:28px 32px 0;">
      <p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#0F172A;">
        <span style="display:inline-block;width:24px;height:24px;background:#00579D;color:#fff;border-radius:50%;font-size:12px;font-weight:700;text-align:center;line-height:24px;margin-right:8px;">1</span>
        Sign in to Team Pulse
      </p>
      <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;width:100%;">
        <tr>
          <td style="font-size:12px;color:#64748b;padding-bottom:6px;width:80px;">URL</td>
          <td style="font-size:13px;color:#0F172A;"><a href="${loginUrl}" style="color:#00579D;">${loginUrl}</a></td>
        </tr>
        <tr>
          <td style="font-size:12px;color:#64748b;padding-bottom:6px;padding-top:6px;">Email</td>
          <td style="font-size:13px;color:#0F172A;">${email}</td>
        </tr>
        <tr>
          <td style="font-size:12px;color:#64748b;padding-top:6px;">Password</td>
          <td>
            <span style="font-family:monospace;font-size:16px;font-weight:700;letter-spacing:2px;background:#E6F0FA;color:#133F62;padding:4px 10px;border-radius:5px;">${password}</span>
          </td>
        </tr>
      </table>
      <p style="margin:10px 0 0;font-size:12px;color:#64748b;">
        You'll be prompted to set a permanent password after your first sign-in.
      </p>
    </td></tr>

    <tr><td style="padding:24px 32px 0;">
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:0;">
    </td></tr>

    <!-- Step 2: Teams -->
    <tr><td style="padding:24px 32px 0;">
      <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#0F172A;">
        <span style="display:inline-block;width:24px;height:24px;background:#00579D;color:#fff;border-radius:50%;font-size:12px;font-weight:700;text-align:center;line-height:24px;margin-right:8px;">2</span>
        Set up Teams reminder notifications <span style="font-size:12px;font-weight:400;color:#64748b;">(optional but recommended)</span>
      </p>
      <p style="margin:0 0 16px;font-size:14px;color:#334155;line-height:1.6;">
        Team Pulse can send you a <strong>direct Teams message</strong> when it's time to clock in or clock out.
        This takes about 2 minutes to set up using Power Automate.
      </p>

      <!-- Steps -->
      ${[
        ["Go to <a href='https://make.powerautomate.com' style='color:#00579D;'>make.powerautomate.com</a> and sign in with your NBIT Microsoft account.", null],
        ["Click <strong>New flow</strong> → <strong>Instant cloud flow</strong>. Name it something like <em>\"Team Pulse Reminder\"</em>.", null],
        ["Choose the trigger: <strong>\"When a HTTP request is received\"</strong>. Click Create.", null],
        ["Click <strong>+ New step</strong> and search for <strong>Microsoft Teams</strong>. Select the action: <strong>\"Post a message in a chat or channel\"</strong>.", null],
        [
          "Configure the action:",
          `<table cellpadding="0" cellspacing="0" style="margin-top:8px;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;width:100%;">
            <tr style="background:#f8fafc;">
              <td style="padding:6px 12px;font-size:12px;color:#64748b;border-bottom:1px solid #e2e8f0;width:100px;">Post as</td>
              <td style="padding:6px 12px;font-size:13px;color:#0F172A;border-bottom:1px solid #e2e8f0;">Flow bot</td>
            </tr>
            <tr style="background:#f8fafc;">
              <td style="padding:6px 12px;font-size:12px;color:#64748b;border-bottom:1px solid #e2e8f0;">Post in</td>
              <td style="padding:6px 12px;font-size:13px;color:#0F172A;border-bottom:1px solid #e2e8f0;">Chat with Flow bot</td>
            </tr>
            <tr style="background:#f8fafc;">
              <td style="padding:6px 12px;font-size:12px;color:#64748b;border-bottom:1px solid #e2e8f0;">Recipient</td>
              <td style="padding:6px 12px;font-size:13px;color:#0F172A;border-bottom:1px solid #e2e8f0;">${email}</td>
            </tr>
            <tr style="background:#f8fafc;">
              <td style="padding:6px 12px;font-size:12px;color:#64748b;">Message</td>
              <td style="padding:6px 12px;font-size:13px;color:#0F172A;">Click the ⚡ icon and select <strong>Body</strong> from the trigger step.</td>
            </tr>
          </table>`,
        ],
        ["<strong>Save</strong> the flow. Click the trigger step and copy the <strong>HTTP POST URL</strong>.", null],
        ["Send that URL to your admin. Once they add it to your profile, you'll receive shift reminders directly in Teams.", null],
      ]
        .map(
          ([text, extra], i) => `
        <table cellpadding="0" cellspacing="0" style="margin-bottom:12px;width:100%;">
          <tr>
            <td style="width:28px;vertical-align:top;padding-top:1px;">
              <span style="display:inline-block;width:20px;height:20px;background:#E6F0FA;color:#00579D;border-radius:50%;font-size:11px;font-weight:700;text-align:center;line-height:20px;">${i + 1}</span>
            </td>
            <td style="font-size:13px;color:#334155;line-height:1.6;">
              ${text}
              ${extra ?? ""}
            </td>
          </tr>
        </table>`,
        )
        .join("")}
    </td></tr>

    <!-- Footer -->
    <tr><td style="padding:24px 32px 28px;">
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 16px;">
      <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">
        Questions? Contact your Team Pulse administrator.<br>
        This is an automated message from Team Pulse — please do not reply directly to this email.
      </p>
    </td></tr>

  </table>
  </td></tr>
</table>
</body>
</html>`;
}
