import { NextResponse } from "next/server";
import { getSession, getSessionProfileId } from "@/lib/session";
import { getEmailSettings, saveEmailSettings } from "@/lib/db-store";

export async function GET() {
  const session = await getSession();
  if (!getSessionProfileId(session) || session.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const s = await getEmailSettings();
  return NextResponse.json({
    tenantId:      s.tenantId,
    clientId:      s.clientId,
    hasSecret:     s.clientSecret.length > 0,
    fromMailbox:   s.fromMailbox,
    isConfigured:  !!(s.tenantId && s.clientId && s.clientSecret && s.fromMailbox),
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!getSessionProfileId(session) || session.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const body = (await request.json()) as {
    tenantId?:     string;
    clientId?:     string;
    clientSecret?: string;
    fromMailbox?:  string;
  };

  const saved = await saveEmailSettings({
    tenantId:     body.tenantId,
    clientId:     body.clientId,
    clientSecret: body.clientSecret, // empty = keep existing (handled in store)
    fromMailbox:  body.fromMailbox,
  });

  return NextResponse.json({
    ok:           true,
    tenantId:     saved.tenantId,
    clientId:     saved.clientId,
    hasSecret:    saved.clientSecret.length > 0,
    fromMailbox:  saved.fromMailbox,
    isConfigured: !!(saved.tenantId && saved.clientId && saved.clientSecret && saved.fromMailbox),
  });
}
