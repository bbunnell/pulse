import { NextResponse } from "next/server";
import { getSession, getSessionProfileId } from "@/lib/session";
import { deleteHoliday, getHolidays, recordAudit, saveHoliday } from "@/lib/db-store";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** GET — any authenticated user can see the holiday calendar. */
export async function GET() {
  const session = await getSession();
  if (!getSessionProfileId(session)) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  try {
    return NextResponse.json({ holidays: await getHolidays() });
  } catch (err) {
    console.error("[holidays] load failed:", err);
    return NextResponse.json({ error: "Could not load holidays." }, { status: 500 });
  }
}

/** POST — create or update. Managers and admins. */
export async function POST(request: Request) {
  const session = await getSession();
  const actorId = getSessionProfileId(session);
  if (!actorId || (session.role !== "admin" && session.role !== "manager")) {
    return NextResponse.json({ error: "Manager or admin access required." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    id?: string; name?: string; startDate?: string; endDate?: string;
    defaultParticipation?: string; notes?: string; exceptionIds?: string[];
  };

  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "Give the holiday a name." }, { status: 400 });
  if (!body.startDate || !DATE.test(body.startDate)) {
    return NextResponse.json({ error: "Pick a start date." }, { status: 400 });
  }
  const endDate = body.endDate && DATE.test(body.endDate) ? body.endDate : body.startDate;
  if (endDate < body.startDate) {
    return NextResponse.json({ error: "The end date cannot be before the start date." }, { status: 400 });
  }
  const defaultParticipation = body.defaultParticipation === "working" ? "working" : "off";

  try {
    const { holiday, entriesWritten } = await saveHoliday({
      id: body.id,
      name,
      startDate: body.startDate,
      endDate,
      defaultParticipation,
      notes: body.notes?.trim() || undefined,
      exceptionIds: Array.isArray(body.exceptionIds) ? body.exceptionIds : [],
      createdBy: actorId,
    });
    await recordAudit({
      actorUserId: actorId,
      entityType:  "holiday",
      entityId:    holiday.id,
      action:      body.id ? "update" : "create",
      summary: `${name} (${holiday.startDate}${holiday.endDate !== holiday.startDate ? ` → ${holiday.endDate}` : ""})`
             + ` — ${defaultParticipation === "off" ? "closed" : "open"}, ${entriesWritten} marked off`,
    });
    return NextResponse.json({ ok: true, holiday, entriesWritten });
  } catch (err) {
    console.error("[holidays] save failed:", err);
    return NextResponse.json({ error: "Could not save the holiday." }, { status: 500 });
  }
}

/** DELETE — removes the holiday and the time off it generated. */
export async function DELETE(request: Request) {
  const session = await getSession();
  const actorId = getSessionProfileId(session);
  if (!actorId || (session.role !== "admin" && session.role !== "manager")) {
    return NextResponse.json({ error: "Manager or admin access required." }, { status: 403 });
  }
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing holiday id." }, { status: 400 });

  try {
    const removed = await deleteHoliday(id);
    if (!removed) return NextResponse.json({ error: "Holiday not found." }, { status: 404 });
    await recordAudit({ actorUserId: actorId, entityType: "holiday", entityId: id,
                       action: "delete", summary: `Removed holiday ${id} and the time off it generated` });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[holidays] delete failed:", err);
    return NextResponse.json({ error: "Could not remove the holiday." }, { status: 500 });
  }
}
