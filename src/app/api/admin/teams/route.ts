import { NextResponse } from "next/server";
import { getSession, getSessionProfileId } from "@/lib/session";
import { createTeam, deleteTeam, updateTeamHours, recordAudit } from "@/lib/db-store";

// POST — create a new team
export async function POST(request: Request) {
  const session = await getSession();
  const actorId = getSessionProfileId(session);
  if (!actorId || session.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const body = (await request.json()) as { name?: string; managerId?: string };
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Team name is required." }, { status: 400 });
  }

  const team = await createTeam(name, body.managerId);
  await recordAudit({
    actorUserId: actorId, entityType: "team", entityId: team.id,
    action: "create", summary: `Created team "${name}"`,
  });
  return NextResponse.json({ ok: true, team });
}

// PATCH — update team work hours
export async function PATCH(request: Request) {
  const session = await getSession();
  const actorId = getSessionProfileId(session);
  if (!actorId || session.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const body = (await request.json()) as {
    id?: string;
    name?: string;
    defaultWorkDays?: number[];
    defaultStartTime?: string;
    defaultEndTime?: string;
    defaultTimezone?: string;
  };
  if (!body.id) return NextResponse.json({ error: "Team ID required." }, { status: 400 });

  const team = await updateTeamHours(body.id, {
    name:             body.name,
    defaultWorkDays:  body.defaultWorkDays,
    defaultStartTime: body.defaultStartTime,
    defaultEndTime:   body.defaultEndTime,
    defaultTimezone:  body.defaultTimezone,
  });

  await recordAudit({
    actorUserId: actorId, entityType: "team", entityId: team.id,
    action: "update", summary: `Updated work hours for team "${team.name}"`,
  });
  return NextResponse.json({ ok: true, team });
}

// DELETE — remove team
export async function DELETE(request: Request) {
  const session = await getSession();
  const actorId = getSessionProfileId(session);
  if (!actorId || session.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const body = (await request.json()) as { id?: string };
  if (!body.id) {
    return NextResponse.json({ error: "Team ID is required." }, { status: 400 });
  }

  const removed = await deleteTeam(body.id);
  if (!removed) {
    return NextResponse.json({ error: "Team not found or cannot be deleted." }, { status: 404 });
  }

  await recordAudit({
    actorUserId: actorId, entityType: "team", entityId: body.id,
    action: "delete", summary: `Deleted a team`,
  });
  return NextResponse.json({ ok: true });
}
