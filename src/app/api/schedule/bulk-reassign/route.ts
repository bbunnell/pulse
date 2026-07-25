import { NextResponse } from "next/server";
import { getSession, getSessionProfileId } from "@/lib/session";
import { bulkReassignShifts, getProfileById, recordAudit } from "@/lib/db-store";
import { sendTransactionalEmail } from "@/lib/email";
import { sendTeamsMessage } from "@/lib/teams";
import { getNotificationSettings } from "@/lib/db-store";

export async function POST(request: Request) {
  const session = await getSession();
  const actorId = getSessionProfileId(session);
  if (!actorId || (session.role !== "admin" && session.role !== "manager")) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const body = (await request.json()) as {
    fromProfileId?: string; toProfileId?: string;
    fromDate?: string; toDate?: string;
  };

  if (!body.fromProfileId || !body.toProfileId || !body.fromDate || !body.toDate) {
    return NextResponse.json({ error: "fromProfileId, toProfileId, fromDate, toDate are required." }, { status: 400 });
  }
  if (body.fromProfileId === body.toProfileId) {
    return NextResponse.json({ error: "Source and target must be different people." }, { status: 400 });
  }

  const count = await bulkReassignShifts(
    body.fromProfileId, body.toProfileId, body.fromDate, body.toDate,
  );

  // Notify the new assignee
  try {
    const toProfile = await getProfileById(body.toProfileId);
    const fromProfile = await getProfileById(body.fromProfileId);
    const cfg = await getNotificationSettings();
    if (toProfile && toProfile.id !== actorId) {
      const subject = "Team Pulse — shifts reassigned to you";
      const text = `Hi ${toProfile.firstName},\n\n${count} shift(s) from ${fromProfile?.firstName ?? "another engineer"} have been reassigned to you between ${body.fromDate} and ${body.toDate}.\n\nPlease check your schedule in Team Pulse.`;
      await sendTransactionalEmail({ to: toProfile.email, subject, text, html: `<p>${text.replace(/\n/g,"<br>")}</p>` });
      if (cfg.teamsWebhookUrl) {
        await sendTeamsMessage(cfg.teamsWebhookUrl, {
          title: "📋 Shifts Reassigned",
          text: `**${toProfile.firstName} ${toProfile.lastName}** has been assigned ${count} shift(s) previously belonging to ${fromProfile?.firstName ?? "another engineer"} (${body.fromDate} – ${body.toDate}).`,
          actionLabel: "View Schedule", actionUrl: process.env.BASE_URL ?? "http://localhost:3000",
        });
      }
    }
  } catch (err) { console.error("[reassign notify]", err); }

  try {
    const [fromP, toP] = await Promise.all([getProfileById(body.fromProfileId), getProfileById(body.toProfileId)]);
    await recordAudit({
      actorUserId: actorId,
      targetUserId: body.toProfileId,
      entityType: "schedule",
      action: "reassign",
      summary: `Reassigned ${count} shift(s) from ${fromP ? `${fromP.firstName} ${fromP.lastName}` : "?"} to ${toP ? `${toP.firstName} ${toP.lastName}` : "?"} (${body.fromDate} – ${body.toDate})`,
    });
  } catch { /* best effort */ }

  return NextResponse.json({ ok: true, count });
}
