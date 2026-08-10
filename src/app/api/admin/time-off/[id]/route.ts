import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { deleteTimeOffEntry, getTimeOffEntryById, updateTimeOffEntry } from "@/lib/db-store";
import { getSessionProfileId } from "@/lib/session";

/**
 * Managers and admins may act on anyone's entry; everyone else only on their own.
 * Ownership is re-checked against the stored row rather than trusted from the
 * request, so a caller cannot edit someone else's entry by guessing an id.
 *
 * Entries created by the Exchange sync are excluded from self-service: the next
 * sync would overwrite or re-create them, so an edit would silently revert.
 */
async function authorize(entryId: string): Promise<
  { ok: true; isManager: boolean } | { ok: false; status: number; error: string }
> {
  const session = await getSession();
  const profileId = getSessionProfileId(session);
  if (!profileId) return { ok: false, status: 401, error: "Not signed in." };

  const isManager = ["manager", "admin"].includes(session.role ?? "");
  const entry = await getTimeOffEntryById(entryId);
  if (!entry) return { ok: false, status: 404, error: "That time-off entry no longer exists." };

  if (!isManager) {
    if (entry.userId !== profileId) {
      return { ok: false, status: 403, error: "You can only change your own time off." };
    }
    if (entry.source === "oof_sync") {
      return {
        ok: false, status: 409,
        error: "This came from your Outlook calendar. Change it there and it will update here.",
      };
    }
  }
  return { ok: true, isManager };
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await authorize(id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  await deleteTimeOffEntry(id);
  return NextResponse.json({ ok: true });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await authorize(id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
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
