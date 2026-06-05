import { NextResponse } from "next/server";
import { getSession, getSessionProfileId } from "@/lib/session";
import { getScheduledShifts, insertAppliedShifts } from "@/lib/db-store";
import { copyWeekShifts, isoDateStr } from "@/lib/schedule-engine";

export async function POST(request: Request) {
  const session = await getSession();
  const actorId = getSessionProfileId(session);
  if (!actorId || (session.role !== "admin" && session.role !== "manager")) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const body = (await request.json()) as {
    sourceWeekStart?: string;  // ISO date (Monday of source week)
    targetWeeks?: number[];    // [1, 2, 3] = copy to 1, 2, 3 weeks forward
  };

  if (!body.sourceWeekStart || !body.targetWeeks?.length) {
    return NextResponse.json({ error: "sourceWeekStart and targetWeeks are required." }, { status: 400 });
  }

  // Load source week (Mon–Sun)
  const srcStart = body.sourceWeekStart;
  const srcEnd   = isoDateStr(new Date(new Date(srcStart + "T00:00:00").getTime() + 6 * 86_400_000));
  const sourceShifts = await getScheduledShifts(srcStart, srcEnd);

  if (sourceShifts.length === 0) {
    return NextResponse.json({ error: "No shifts in the source week to copy." }, { status: 400 });
  }

  let total = 0;
  for (const weeks of body.targetWeeks) {
    const copies = copyWeekShifts(sourceShifts, weeks, actorId);
    const inserted = await insertAppliedShifts(copies);
    total += inserted.length;
  }

  return NextResponse.json({ ok: true, inserted: total });
}
