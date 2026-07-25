import { NextResponse } from "next/server";
import { createPasswordResetToken, findUserAuthByEmail } from "@/lib/db-store";
import { sendTransactionalEmail } from "@/lib/email";

export async function POST(request: Request) {
  const body = (await request.json()) as { email?: string };
  const email = (body.email ?? "").toLowerCase().trim();

  const user = await findUserAuthByEmail(email);

  // Always return 200 to avoid leaking which emails are registered
  if (!user) {
    return NextResponse.json({ ok: true });
  }

  const token = await createPasswordResetToken(user.profile_id);
  const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
  const resetUrl = `${baseUrl}/login?token=${token}`;

  const isFirstTime = user.must_set_password;
  const subject = isFirstTime ? "Set up your Team Pulse account" : "Reset your Team Pulse password";
  const greeting = isFirstTime
    ? `Hi ${user.first_name}, welcome to Team Pulse! An admin has created your account.`
    : `Hi ${user.first_name}, we received a request to reset your Team Pulse password.`;

  const text = [
    greeting,
    `Click the link below to ${isFirstTime ? "set up" : "reset"} your password. The link expires in 1 hour.`,
    resetUrl,
    "If you didn't request this, you can safely ignore this email.",
  ].join("\n\n");

  const html = `
    <p>${greeting}</p>
    <p>Click the button below to ${isFirstTime ? "set up" : "reset"} your password. The link expires in 1 hour.</p>
    <p><a href="${resetUrl}" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600;">${isFirstTime ? "Set Up Password" : "Reset Password"}</a></p>
    <p style="font-size:12px;color:#666;">Or copy this link: ${resetUrl}</p>
    <p style="font-size:12px;color:#666;">If you didn't request this, you can safely ignore this email.</p>
  `;

  const result = await sendTransactionalEmail({ to: user.email, subject, text, html });

  // In dev with no email provider configured, log the link to the console
  if (result.status === "queued") {
    console.log(`\n[Team Pulse] Password ${isFirstTime ? "setup" : "reset"} link for ${user.email}:\n${resetUrl}\n`);
  }

  return NextResponse.json({ ok: true });
}
