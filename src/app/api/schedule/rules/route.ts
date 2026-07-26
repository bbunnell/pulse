import { NextResponse } from "next/server";
import { getSession, getSessionProfileId } from "@/lib/session";
import {
  createScheduleRule,
  deleteFutureRuleShifts,
  getScheduleRules,
  insertGeneratedShifts,
} from "@/lib/db-store";
import { generateShiftsForRule } from "@/lib/schedule-engine";
import { sendTransactionalEmail } from "@/lib/email";
import { sendTeamsMessage } from "@/lib/teams";
import { getNotificationSettings, getProfileById } from "@/lib/db-store";

const GENERATE_WEEKS = 104; // ~24 months

export async function GET() {
  const session = await getSession();
  if (!getSessionProfileId(session)) return NextResponse.json({ error: "Auth required." }, { status: 401 });
  const rules = await getScheduleRules();
  return NextResponse.json({ rules });
}

export async function POST(request: Request) {
  const session = await getSession();
  const actorId = getSessionProfileId(session);
  if (!actorId || (session.role !== "admin" && session.role !== "manager")) {
    return NextResponse.json({ error: "Manager or admin access required." }, { status: 403 });
  }

  const body = (await request.json()) as {
    profileId?: string;
    startTime?: string;
    endTime?: string;
    label?: string;
    notes?: string;
    daysOfWeek?: number[];
    repeatWeeks?: 1 | 2 | 4;
    effectiveFrom?: string;
    effectiveUntil?: string;
  };

  if (!body.profileId || !body.startTime || !body.endTime || !body.daysOfWeek?.length || !body.effectiveFrom) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  const rule = await createScheduleRule({
    profileId:      body.profileId,
    startTime:      body.startTime,
    endTime:        body.endTime,
    label:          body.label,
    notes:          body.notes,
    daysOfWeek:     body.daysOfWeek,
    repeatWeeks:    body.repeatWeeks ?? 1,
    effectiveFrom:  body.effectiveFrom,
    effectiveUntil: body.effectiveUntil,
    createdBy:      actorId,
  });

  // Generate shifts for the next GENERATE_WEEKS weeks
  const from = new Date(rule.effectiveFrom + "T00:00:00");
  const to   = new Date(from);
  to.setDate(to.getDate() + GENERATE_WEEKS * 7);

  const generated = generateShiftsForRule(rule, from, to, actorId);
  const count = await insertGeneratedShifts(generated);

  // Assignment notification
  try {
    const profile = await getProfileById(body.profileId);
    const cfg = await getNotificationSettings();
    if (profile && profile.id !== actorId) {
      const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
      const dayNames = rule.daysOfWeek.map(d => days[d]).join(", ");
      const subject = "Team Pulse — recurring shift assigned";
      const text = `Hi ${profile.firstName},\n\nA recurring shift has been assigned to you:\n  Days: ${dayNames}\n  Time: ${rule.startTime}–${rule.endTime}\n  Starting: ${rule.effectiveFrom}\n  Repeats every ${rule.repeatWeeks} week(s)\n\n${count} shifts have been generated.`;
      await sendTransactionalEmail({ to: profile.email, subject, text, html: `<p>${text.replace(/\n/g,"<br>")}</p>` });
      if (cfg.teamsWebhookUrl) {
        await sendTeamsMessage(cfg.teamsWebhookUrl, {
          title: "⏰ Recurring Shift Assigned",
          text: `Hi **${profile.firstName} ${profile.lastName}** — a recurring shift has been added: **${dayNames}**, ${rule.startTime}–${rule.endTime}, starting ${rule.effectiveFrom}. ${count} shifts generated.`,
          actionLabel: "View Schedule", actionUrl: process.env.BASE_URL ?? "http://localhost:3000",
        });
      }
    }
  } catch (err) { console.error("[rule notify]", err); }

  return NextResponse.json({ ok: true, rule, generated: count });
}
