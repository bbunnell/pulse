import { NextResponse } from "next/server";
import { getSession, getSessionProfileId } from "@/lib/session";
import { getNotificationSettings, loadOrgDataFromDb } from "@/lib/db-store";
import { deriveStandardShifts } from "@/lib/derived-shifts";

/**
 * A person's own working days for a date range.
 *
 * Derived from their profile hours (with per-weekday overrides and time off
 * applied), the same source the schedule board and dashboard read. This used
 * to query `scheduled_shifts`, which by the end held only stale rows for five
 * people — so most of the team saw an empty schedule and the rest saw hours
 * they no longer worked.
 */
export async function GET(request: Request) {
  const session = await getSession();
  const profileId = getSessionProfileId(session);
  if (!profileId) return NextResponse.json({ error: "Auth required." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to   = searchParams.get("to");
  if (!from || !to) return NextResponse.json({ error: "from and to are required." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    return NextResponse.json({ error: "Invalid date range." }, { status: 400 });
  }

  const dates: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
    if (dates.length > 400) break;   // guard against an absurd range
  }

  const [org, cfg] = await Promise.all([loadOrgDataFromDb(), getNotificationSettings()]);
  const shifts = deriveStandardShifts({
    profiles:   org.profiles.filter((p) => p.id === profileId),
    timeOff:    org.timeOff,
    dates,
    scheduleTz: cfg.orgTimezone,
  });

  return NextResponse.json({ shifts });
}
