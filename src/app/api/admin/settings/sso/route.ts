import { NextResponse } from "next/server";
import { getSession, getSessionProfileId } from "@/lib/session";
import { getSsoSettings, saveSsoSettings } from "@/lib/db-store";

export async function GET() {
  const session = await getSession();
  if (!getSessionProfileId(session) || session.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  const s = await getSsoSettings();
  const base = process.env.BASE_URL ?? "https://pulse.nbit.com";
  return NextResponse.json({
    enabled:         s.enabled,
    clientId:        s.clientId,
    tenantId:        s.tenantId,
    hasClientSecret: s.clientSecret.length > 0,
    callbackUrl:     `${base}/api/auth/callback/microsoft-entra-id`,
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!getSessionProfileId(session) || session.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  const body = (await request.json()) as {
    enabled?: boolean;
    clientId?: string;
    clientSecret?: string;
    tenantId?: string;
  };
  const saved = await saveSsoSettings({
    enabled:      body.enabled,
    clientId:     body.clientId?.trim(),
    clientSecret: body.clientSecret?.trim(),
    tenantId:     body.tenantId?.trim(),
  });
  return NextResponse.json({
    ok:              true,
    enabled:         saved.enabled,
    clientId:        saved.clientId,
    tenantId:        saved.tenantId,
    hasClientSecret: saved.clientSecret.length > 0,
  });
}
