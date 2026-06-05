import { NextResponse } from "next/server";
import { getSession, getSessionProfileId } from "@/lib/session";
import { createTimeOffEntry } from "@/lib/db-store";

export async function POST(request: Request) {
  const session = await getSession();
  const profileId = getSessionProfileId(session);
  if (!profileId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const body = (await request.json()) as {
    timeOffType?: "vacation" | "sick";
    startAt?: string;
    endAt?: string;
    fullDay?: boolean;
    hours?: number;
    notes?: string;
  };

  if (!body.timeOffType || !body.startAt || !body.endAt || !body.hours) {
    return NextResponse.json({ error: "Missing time off fields." }, { status: 400 });
  }

  const entry = await createTimeOffEntry({
    userId: profileId,
    timeOffType: body.timeOffType,
    startAt: body.startAt,
    endAt: body.endAt,
    fullDay: body.fullDay ?? true,
    hours: body.hours,
    notes: body.notes,
  });

  return NextResponse.json({ ok: true, timeOff: entry }, { status: 201 });
}
