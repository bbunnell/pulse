import { NextResponse } from "next/server";
import { getSession, getSessionProfileId } from "@/lib/session";
import {
  createStaffingRule,
  deleteStaffingRule,
  getStaffingRules,
  recordAudit,
  updateStaffingRule,
} from "@/lib/db-store";

export async function GET() {
  const session = await getSession();
  if (!getSessionProfileId(session) || session.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  return NextResponse.json({ rules: await getStaffingRules() });
}

export async function POST(request: Request) {
  const session = await getSession();
  const actorId = getSessionProfileId(session);
  if (!actorId || session.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  const body = (await request.json()) as {
    name?: string; daysOfWeek?: number[]; startTime?: string;
    endTime?: string; minStaff?: number; teamId?: string;
  };
  if (!body.name || !body.daysOfWeek?.length || !body.startTime || !body.endTime || !body.minStaff) {
    return NextResponse.json({ error: "All fields are required." }, { status: 400 });
  }
  const rule = await createStaffingRule({
    name: body.name, daysOfWeek: body.daysOfWeek, startTime: body.startTime,
    endTime: body.endTime, minStaff: body.minStaff, teamId: body.teamId, createdBy: actorId,
  });
  await recordAudit({
    actorUserId: actorId, entityType: "staffing_rule", entityId: rule.id,
    action: "create", summary: `Created staffing rule "${rule.name}" — min ${rule.minStaff}`,
  });
  return NextResponse.json({ ok: true, rule });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  const actorId = getSessionProfileId(session);
  if (!actorId || session.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  const body = (await request.json()) as { id?: string; enabled?: boolean; minStaff?: number; name?: string };
  if (!body.id) return NextResponse.json({ error: "id required." }, { status: 400 });
  const rule = await updateStaffingRule(body.id, body);
  if (!rule) return NextResponse.json({ error: "Not found." }, { status: 404 });
  await recordAudit({
    actorUserId: actorId, entityType: "staffing_rule", entityId: rule.id,
    action: "update", summary: `Updated staffing rule "${rule.name}"${body.enabled !== undefined ? ` (${body.enabled ? "enabled" : "disabled"})` : ""}`,
  });
  return NextResponse.json({ ok: true, rule });
}

export async function DELETE(request: Request) {
  const session = await getSession();
  const actorId = getSessionProfileId(session);
  if (!actorId || session.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  const { id } = (await request.json()) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });
  await deleteStaffingRule(id);
  await recordAudit({
    actorUserId: actorId, entityType: "staffing_rule", entityId: id,
    action: "delete", summary: "Deleted a staffing rule",
  });
  return NextResponse.json({ ok: true });
}
