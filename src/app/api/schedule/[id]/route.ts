import { NextResponse } from "next/server";
import { getSession, getSessionProfileId } from "@/lib/session";
import { deleteScheduledShift, patchScheduledShift } from "@/lib/db-store";

// PATCH — edit a single shift (optionally detach from its rule)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!getSessionProfileId(session) || (session.role !== "admin" && session.role !== "manager")) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }
  const { id } = await params;
  const body = (await request.json()) as {
    startTime?: string; endTime?: string; label?: string;
    notes?: string; isOpen?: boolean; profileId?: string; detachFromRule?: boolean;
  };

  const shift = await patchScheduledShift(id, body, body.detachFromRule ?? false);
  if (!shift) return NextResponse.json({ error: "Shift not found." }, { status: 404 });
  return NextResponse.json({ ok: true, shift });
}

// DELETE — remove a single shift
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!getSessionProfileId(session) || (session.role !== "admin" && session.role !== "manager")) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }
  const { id } = await params;
  const removed = await deleteScheduledShift(id);
  if (!removed) return NextResponse.json({ error: "Shift not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
