import { NextResponse } from "next/server";
import { getSession, getSessionProfileId } from "@/lib/session";
import { getEmailSettings, saveEmailSettings } from "@/lib/db-store";

// GET — returns current settings; password is never sent to the client
export async function GET() {
  const session = await getSession();
  if (!getSessionProfileId(session) || session.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const s = await getEmailSettings();
  return NextResponse.json({
    provider:    s.provider,
    smtpHost:    s.smtpHost,
    smtpPort:    s.smtpPort,
    smtpUser:    s.smtpUser,
    hasPassword: s.smtpPassword.length > 0,
    emailFrom:   s.emailFrom,
  });
}

// POST — saves updated settings; empty smtpPassword keeps the existing value
export async function POST(request: Request) {
  const session = await getSession();
  if (!getSessionProfileId(session) || session.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const body = (await request.json()) as {
    provider?: string;
    smtpHost?: string;
    smtpPort?: number;
    smtpUser?: string;
    smtpPassword?: string;
    emailFrom?: string;
  };

  const saved = await saveEmailSettings({
    provider:     body.provider,
    smtpHost:     body.smtpHost,
    smtpPort:     body.smtpPort !== undefined ? Number(body.smtpPort) : undefined,
    smtpUser:     body.smtpUser,
    smtpPassword: body.smtpPassword,  // empty = keep existing (handled in store)
    emailFrom:    body.emailFrom,
  });

  return NextResponse.json({
    ok:          true,
    provider:    saved.provider,
    smtpHost:    saved.smtpHost,
    smtpPort:    saved.smtpPort,
    smtpUser:    saved.smtpUser,
    hasPassword: saved.smtpPassword.length > 0,
    emailFrom:   saved.emailFrom,
  });
}
