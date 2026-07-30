import { NextResponse } from "next/server";
import { getSession, getSessionProfileId } from "@/lib/session";
import { deleteCompanyEvent, recordAudit, updateCompanyEvent, type CompanyEventType } from "@/lib/db-store";

// PATCH — edit event
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  const actorId = getSessionProfileId(session);
  if (!actorId || (session.role !== "admin" && session.role !== "manager")) {
    return NextResponse.json({ error: "Manager or admin access required." }, { status: 403 });
  }
  const { id } = await params;
  const body = (await request.json()) as Partial<{
    title: string; description: string | null; eventType: CompanyEventType;
    startDate: string; endDate: string | null; profileIds: string[];
  }>;
  const event = await updateCompanyEvent(id, body);
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  await recordAudit({
    actorUserId: actorId, entityType: "company_event", entityId: id,
    action: "update", summary: `Updated company event "${event.title}"`,
  });
  return NextResponse.json({ ok: true, event });
}

// DELETE
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  const actorId = getSessionProfileId(session);
  if (!actorId || (session.role !== "admin" && session.role !== "manager")) {
    return NextResponse.json({ error: "Manager or admin access required." }, { status: 403 });
  }
  const { id } = await params;
  const removed = await deleteCompanyEvent(id);
  if (!removed) return NextResponse.json({ error: "Not found." }, { status: 404 });
  await recordAudit({
    actorUserId: actorId, entityType: "company_event", entityId: id,
    action: "delete", summary: "Deleted a company event",
  });
  return NextResponse.json({ ok: true });
}
