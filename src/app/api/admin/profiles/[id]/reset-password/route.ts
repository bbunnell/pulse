import { NextResponse } from "next/server";
import { getSession, getSessionProfileId } from "@/lib/session";
import { adminResetPassword, getProfileById } from "@/lib/db-store";
import { sendTransactionalEmail } from "@/lib/email";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!getSessionProfileId(session) || session.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { id } = await params;
  const body = (await request.json()) as { sendEmail?: boolean };

  const profile = await getProfileById(id);
  if (!profile) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const { tempPassword } = await adminResetPassword(id);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

  if (body.sendEmail) {
    await sendTransactionalEmail({
      to: profile.email,
      subject: "TimeBoard — your password has been reset",
      text: [
        `Hi ${profile.firstName},`,
        ``,
        `An admin has reset your TimeBoard password. Use the temporary password below to sign in,`,
        `then you will be prompted to choose a new password.`,
        ``,
        `  Login:    ${baseUrl}/login`,
        `  Email:    ${profile.email}`,
        `  Password: ${tempPassword}`,
        ``,
        `— TimeBoard`,
      ].join("\n"),
      html: `
        <table style="font-family:sans-serif;font-size:14px;color:#111;max-width:500px">
          <tr><td style="padding-bottom:16px">
            <strong style="font-size:16px">TimeBoard — Password Reset</strong>
          </td></tr>
          <tr><td style="padding-bottom:12px">
            Hi <strong>${profile.firstName}</strong>,<br><br>
            An admin has reset your TimeBoard password. Use the temporary password below to sign in,
            then you will be prompted to choose a new password.
          </td></tr>
          <tr><td style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 18px;margin-bottom:16px">
            <div style="font-size:12px;color:#64748b;margin-bottom:4px">Temporary password</div>
            <div style="font-family:monospace;font-size:20px;font-weight:700;letter-spacing:2px;color:#3730a3;background:#eef2ff;display:inline-block;padding:6px 12px;border-radius:5px">${tempPassword}</div>
          </td></tr>
          <tr><td style="padding-top:12px">
            <a href="${baseUrl}/login" style="background:#4F46E5;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">Sign in to TimeBoard</a>
          </td></tr>
        </table>`,
    });
  }

  return NextResponse.json({ ok: true, tempPassword });
}
