import { NextResponse } from "next/server";
import { getSession, getSessionProfileId } from "@/lib/session";
import { createScheduledShift, getScheduledShifts } from "@/lib/db-store";

// GET /api/schedule?from=2026-06-02&to=2026-06-08
export async function GET(request: Request) {
  const session = await getSession();
  if (!getSessionProfileId(session)) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json({ error: "from and to query params are required." }, { status: 400 });
  }

  try {
    const shifts = await getScheduledShifts(from, to);
    return NextResponse.json({ shifts });
  } catch (err) {
    console.error("[schedule GET]", err);
    return NextResponse.json({ shifts: [] });
  }
}

// POST /api/schedule
export async function POST(request: Request) {
  const session = await getSession();
  const profileId = getSessionProfileId(session);
  if (!profileId || (session.role !== "admin" && session.role !== "manager")) {
    return NextResponse.json({ error: "Manager or admin access required." }, { status: 403 });
  }

  const body = (await request.json()) as {
    profileId?: string;
    shiftDate?: string;
    startTime?: string;
    endTime?: string;
    label?: string;
    notes?: string;
  };

  if (!body.profileId || !body.shiftDate || !body.startTime || !body.endTime) {
    return NextResponse.json({ error: "profileId, shiftDate, startTime, and endTime are required." }, { status: 400 });
  }

  try {
    const shift = await createScheduledShift({
      profileId: body.profileId,
      shiftDate: body.shiftDate,
      startTime: body.startTime,
      endTime: body.endTime,
      label: body.label,
      notes: body.notes,
      createdBy: profileId,
    });
    return NextResponse.json({ ok: true, shift });
  } catch (err) {
    console.error("[schedule POST]", err);
    return NextResponse.json({ error: "Failed to create shift." }, { status: 500 });
  }
}
