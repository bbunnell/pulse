import { NextResponse } from "next/server";
import { getSession, getSessionProfileId } from "@/lib/session";
import {
  deleteScheduleRule,
  deleteFutureRuleShifts,
  getScheduleRules,
  insertGeneratedShifts,
  updateScheduleRule,
} from "@/lib/db-store";
import { generateShiftsForRule, isoDateStr } from "@/lib/schedule-engine";

const GENERATE_WEEKS = 12;

// PATCH — update a rule and regenerate all future shifts
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  const actorId = getSessionProfileId(session);
  if (!actorId || (session.role !== "admin" && session.role !== "manager")) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }
  const { id } = await params;
  const body = await request.json() as Parameters<typeof updateScheduleRule>[1];

  const rule = await updateScheduleRule(id, body);

  // Regenerate all future shifts from today
  const today = isoDateStr(new Date());
  await deleteFutureRuleShifts(id, today);
  const from = new Date(today + "T00:00:00");
  const to   = new Date(from); to.setDate(to.getDate() + GENERATE_WEEKS * 7);
  const count = await insertGeneratedShifts(generateShiftsForRule(rule, from, to, actorId));

  return NextResponse.json({ ok: true, rule, regenerated: count });
}

// DELETE — remove rule and optionally all future generated shifts
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!getSessionProfileId(session) || (session.role !== "admin" && session.role !== "manager")) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }
  const { id } = await params;
  const { deleteFuture } = (await request.json().catch(() => ({}))) as { deleteFuture?: boolean };

  if (deleteFuture) {
    await deleteFutureRuleShifts(id, isoDateStr(new Date()));
  }
  const removed = await deleteScheduleRule(id);
  if (!removed) return NextResponse.json({ error: "Rule not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
