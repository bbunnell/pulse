import { NextResponse } from "next/server";
import { getSession, getSessionProfileId } from "@/lib/session";
import { createCompanyEvent, getCompanyEvents, recordAudit, type CompanyEventType } from "@/lib/db-store";

// GET — any authenticated user can view
export async function GET(request: Request) {
  const session = await getSession();
  if (!getSessionProfileId(session)) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ?? new Date().toISOString().slice(0, 10);
  const to   = searchParams.get("to")   ?? new Date(Date.now() + 365 * 86400_000).toISOString().slice(0, 10);

  try {
    const events = await getCompanyEvents(from, to);
    return NextResponse.json({ events });
  } catch {
    return NextResponse.json({ events: [] });
  }
}

// POST — managers and admins only
export async function POST(request: Request) {
  const session = await getSession();
  const actorId = getSessionProfileId(session);
  if (!actorId || (session.role !== "admin" && session.role !== "manager")) {
    return NextResponse.json({ error: "Manager or admin access required." }, { status: 403 });
  }

  const body = (await request.json()) as {
    title?: string; description?: string; eventType?: CompanyEventType;
    startDate?: string; endDate?: string;
  };

  if (!body.title?.trim() || !body.startDate) {
    return NextResponse.json({ error: "title and startDate are required." }, { status: 400 });
  }
  if (body.endDate && body.endDate < body.startDate) {
    return NextResponse.json({ error: "End date must be on or after start date." }, { status: 400 });
  }

  const event = await createCompanyEvent({
    title: body.title.trim(),
    description: body.description,
    eventType: body.eventType ?? "other",
    startDate: body.startDate,
    endDate: body.endDate || undefined,
    createdBy: actorId,
  });

  await recordAudit({
    actorUserId: actorId, entityType: "company_event", entityId: event.id,
    action: "create", summary: `Created company event "${event.title}" on ${event.startDate}`,
  });

  return NextResponse.json({ ok: true, event });
}
