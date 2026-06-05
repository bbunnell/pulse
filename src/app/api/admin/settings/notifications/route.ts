import { NextResponse } from "next/server";
import { getSession, getSessionProfileId } from "@/lib/session";
import { getNotificationSettings, saveNotificationSettings } from "@/lib/db-store";

export async function GET() {
  const session = await getSession();
  if (!getSessionProfileId(session) || session.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  try {
    const cfg = await getNotificationSettings();
    return NextResponse.json(cfg);
  } catch {
    return NextResponse.json({ error: "DB unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!getSessionProfileId(session) || session.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  const body = (await request.json()) as Partial<{
    teamsWebhookUrl: string;
    orgTimezone: string;
    checkInEnabled: boolean;
    checkOutEnabled: boolean;
    checkInOffsetMinutes: number;
    checkOutOffsetMinutes: number;
    escalationEnabled: boolean;
    escalationMinutes: number;
    understaffAlertEnabled: boolean;
  }>;
  try {
    const saved = await saveNotificationSettings(body);
    return NextResponse.json({ ok: true, ...saved });
  } catch {
    return NextResponse.json({ error: "Failed to save." }, { status: 500 });
  }
}
