import { NextResponse } from "next/server";
import { getSession, getSessionProfileId } from "@/lib/session";
import { loadOrgData, loadScheduleWindow } from "@/lib/data";
import { getStaffingRules } from "@/lib/db-store";

export const dynamic = "force-dynamic";

/**
 * Lightweight live feed for the dashboard. Returns only the data that changes
 * minute-to-minute (shifts, segments, time off, scheduled shifts) plus the
 * authoritative server time, so all clients stay in sync without a full reload.
 */
export async function GET() {
  const session = await getSession();
  if (!getSessionProfileId(session)) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const [org, scheduledShifts, staffingRules] = await Promise.all([
      loadOrgData(), loadScheduleWindow(), getStaffingRules(),
    ]);
    return NextResponse.json({
      shifts: org.shifts,
      segments: org.segments,
      timeOff: org.timeOff,
      scheduledShifts,
      staffingRules,
      serverTime: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ error: "Failed to load live data." }, { status: 503 });
  }
}
