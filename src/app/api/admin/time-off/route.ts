import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createTimeOffEntry } from "@/lib/db-store";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session.userId || !["manager", "admin"].includes(session.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    userId?: string;
    timeOffType?: "vacation" | "sick" | "business_trip";
    startDate?: string;
    endDate?: string;
    notes?: string;
  };

  if (!body.userId || !body.timeOffType || !body.startDate || !body.endDate) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  const start = new Date(body.startDate);
  const end   = new Date(body.endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
    return NextResponse.json({ error: "Invalid date range." }, { status: 400 });
  }

  const days  = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000) + 1);
  const hours = days * 8;

  const entry = await createTimeOffEntry({
    userId:      body.userId,
    timeOffType: body.timeOffType,
    startAt:     `${body.startDate}T00:00:00.000Z`,
    endAt:       `${body.endDate}T23:59:59.000Z`,
    fullDay:     true,
    hours,
    notes:       body.notes || undefined,
  });

  return NextResponse.json({ ok: true, timeOff: entry }, { status: 201 });
}
