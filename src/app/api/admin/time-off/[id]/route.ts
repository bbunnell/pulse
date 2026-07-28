import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { deleteTimeOffEntry, updateTimeOffEntry } from "@/lib/db-store";

async function requireManager() {
  const session = await getSession();
  if (!session.userId || !["manager", "admin"].includes(session.role ?? "")) {
    return null;
  }
  return session;
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireManager();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  await deleteTimeOffEntry(id);
  return NextResponse.json({ ok: true });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireManager();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = (await req.json()) as {
    timeOffType?: string;
    startAt?: string;
    endAt?: string;
    notes?: string;
  };
  if (!body.timeOffType || !body.startAt || !body.endAt) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  await updateTimeOffEntry(id, {
    timeOffType: body.timeOffType,
    startAt: body.startAt,
    endAt: body.endAt,
    notes: body.notes,
  });
  return NextResponse.json({ ok: true });
}
