import { NextResponse } from "next/server";
import { getSession, getSessionProfileId } from "@/lib/session";
import { getScheduleTemplates, insertAppliedShifts } from "@/lib/db-store";
import { applyTemplate } from "@/lib/schedule-engine";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  const actorId = getSessionProfileId(session);
  if (!actorId || (session.role !== "admin" && session.role !== "manager")) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const { id } = await params;
  const body = (await request.json()) as { weekDate?: string };
  if (!body.weekDate) return NextResponse.json({ error: "weekDate is required." }, { status: 400 });

  const templates = await getScheduleTemplates();
  const template = templates.find((t) => t.id === id);
  if (!template) return NextResponse.json({ error: "Template not found." }, { status: 404 });

  const shifts = applyTemplate(template.shifts, new Date(body.weekDate + "T00:00:00"), actorId);
  const inserted = await insertAppliedShifts(shifts);

  return NextResponse.json({ ok: true, inserted: inserted.length });
}
