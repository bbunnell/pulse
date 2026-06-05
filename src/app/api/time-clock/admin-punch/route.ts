import { NextResponse } from "next/server";
import { getSession, getSessionProfileId } from "@/lib/session";
import { getProfileById, punchIn, punchOut, recordAudit } from "@/lib/db-store";

type Action = "punch_in" | "punch_out";

/**
 * Manager/admin force-punch on behalf of another employee — used to correct a
 * missed punch-in or force a punch-out for someone who forgot.
 */
export async function POST(request: Request) {
  const session = await getSession();
  const actorId = getSessionProfileId(session);
  if (!actorId || (session.role !== "admin" && session.role !== "manager")) {
    return NextResponse.json({ error: "Manager or admin access required." }, { status: 403 });
  }

  const body = (await request.json()) as { profileId?: string; action?: Action };
  if (!body.profileId || (body.action !== "punch_in" && body.action !== "punch_out")) {
    return NextResponse.json({ error: "profileId and a valid action are required." }, { status: 400 });
  }
  // Managers/admins use the normal /punch endpoint for themselves.
  if (body.profileId === actorId) {
    return NextResponse.json({ error: "Use the standard punch endpoint for your own clock." }, { status: 400 });
  }

  try {
    const target = await getProfileById(body.profileId);
    const targetName = target ? `${target.firstName} ${target.lastName}` : "an employee";

    if (body.action === "punch_in") {
      const shift = await punchIn(body.profileId);
      await recordAudit({
        actorUserId: actorId, targetUserId: body.profileId, entityType: "timeclock",
        entityId: shift.id, action: "force_punch_in",
        summary: `Force-punched IN ${targetName}`,
      });
      return NextResponse.json({ ok: true, shift });
    }
    const shift = await punchOut(body.profileId);
    if (!shift) return NextResponse.json({ error: "That person has no open shift." }, { status: 400 });
    await recordAudit({
      actorUserId: actorId, targetUserId: body.profileId, entityType: "timeclock",
      entityId: shift.id, action: "force_punch_out",
      summary: `Force-punched OUT ${targetName}`,
    });
    return NextResponse.json({ ok: true, shift });
  } catch {
    return NextResponse.json({ error: "Action failed." }, { status: 500 });
  }
}
