/**
 * POST /api/reminders/send  (also GET for Vercel Cron)
 *
 * Checks scheduled shifts and sends email + Teams reminders when:
 *   - A person's scheduled shift started N minutes ago and they haven't clocked in
 *   - A person's scheduled shift ended N minutes ago and they haven't clocked out
 *
 * Secured by CRON_SECRET env var when set (Vercel Cron passes it automatically).
 * Safe to call repeatedly — uses a unique DB constraint to prevent duplicate sends.
 */

import { NextResponse } from "next/server";
import {
  getEscalationRecipients,
  getLateShiftsForEscalation,
  getNotificationSettings,
  getProfilesDueForCheckIn,
  getProfilesDueForCheckOut,
  getScheduledShifts,
  getShiftsDueForCheckIn,
  getShiftsDueForCheckOut,
  getStaffingRules,
  loadOrgDataFromDb,
  recordCoverageAlert,
  recordEscalation,
  recordProfileReminderSent,
  recordReminderSent,
  wasCoverageAlerted,
  type ProfileDueForReminder,
  type ShiftDueForReminder,
} from "@/lib/db-store";
import { coverageCounts, requiredStaffPerHour } from "@/lib/status";
import { localDateInZone } from "@/lib/timezone";
import { sendTransactionalEmail } from "@/lib/email";
import { sendTeamsMessage } from "@/lib/teams";

// Vercel Cron fires GET; allow POST for manual / test triggers.
export async function GET(request: Request)  { return handler(request); }
export async function POST(request: Request) { return handler(request); }

async function handler(request: Request) {
  // ── Auth ──────────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // ── Settings ──────────────────────────────────────────────────────────────────
  let cfg;
  try {
    cfg = await getNotificationSettings();
  } catch (err) {
    console.error("[reminders] Failed to load notification settings:", err);
    return NextResponse.json({ error: "DB unavailable." }, { status: 503 });
  }

  const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
  const results = {
    checkIn:         { sent: 0, skipped: 0, errors: [] as string[] },
    checkOut:        { sent: 0, skipped: 0, errors: [] as string[] },
    standardCheckIn: { sent: 0, skipped: 0, errors: [] as string[] },
    standardCheckOut:{ sent: 0, skipped: 0, errors: [] as string[] },
    escalation:      { sent: 0, errors: [] as string[] },
    understaffing:   { sent: 0, errors: [] as string[] },
  };

  // ── Check-in reminders ────────────────────────────────────────────────────────
  if (cfg.checkInEnabled) {
    let dueShifts: ShiftDueForReminder[] = [];
    try {
      dueShifts = await getShiftsDueForCheckIn(cfg.orgTimezone, cfg.checkInOffsetMinutes);
    } catch (err) {
      console.error("[reminders] check-in query failed:", err);
    }

    for (const shift of dueShifts) {
      const channelsSent: string[] = [];
      const scheduledTime = fmt12h(shift.startTime);
      const subject = "Team Pulse — Please clock in";
      const body    = buildCheckInBody(shift.firstName, scheduledTime, baseUrl);

      // Email
      try {
        const emailResult = await sendTransactionalEmail({
          to:      shift.email,
          subject,
          text:    body.text,
          html:    body.html,
        });
        if (emailResult.status === "sent") channelsSent.push("email");
        else results.checkIn.errors.push(`email to ${shift.email}: ${emailResult.errorMessage ?? emailResult.status}`);
      } catch (err) {
        results.checkIn.errors.push(`email exception: ${String(err)}`);
      }

      // Teams — personal webhook (DM) takes priority over global channel webhook
      const teamsUrl = shift.teamsWebhookUrl || cfg.teamsWebhookUrl;
      if (teamsUrl) {
        const teamsResult = await sendTeamsMessage(teamsUrl, {
          title:       "⏰ Please Clock In — Team Pulse",
          text:        `Hi **${shift.firstName} ${shift.lastName}** — your shift was scheduled to start at **${scheduledTime}**. Please clock in.`,
          facts:       [
            { name: "Person",     value: `${shift.firstName} ${shift.lastName}` },
            { name: "Scheduled",  value: scheduledTime },
            { name: "Action",     value: "Please clock in" },
          ],
          actionLabel: "Open Team Pulse",
          actionUrl:   baseUrl,
        });
        const label = shift.teamsWebhookUrl ? "teams-dm" : "teams-channel";
        if (teamsResult.ok) channelsSent.push(label);
        else results.checkIn.errors.push(`teams: ${teamsResult.error ?? "unknown"}`);
      }

      if (channelsSent.length > 0) {
        await recordReminderSent(shift.scheduledShiftId, shift.profileId, "check_in", channelsSent);
        results.checkIn.sent++;
      } else {
        results.checkIn.skipped++;
      }
    }
  }

  // ── Check-out reminders ───────────────────────────────────────────────────────
  if (cfg.checkOutEnabled) {
    let dueShifts: ShiftDueForReminder[] = [];
    try {
      dueShifts = await getShiftsDueForCheckOut(cfg.orgTimezone, cfg.checkOutOffsetMinutes);
    } catch (err) {
      console.error("[reminders] check-out query failed:", err);
    }

    for (const shift of dueShifts) {
      const channelsSent: string[] = [];
      const scheduledTime = fmt12h(shift.endTime);
      const subject = "Team Pulse — Please clock out";
      const body    = buildCheckOutBody(shift.firstName, scheduledTime, baseUrl);

      // Email
      try {
        const emailResult = await sendTransactionalEmail({
          to:      shift.email,
          subject,
          text:    body.text,
          html:    body.html,
        });
        if (emailResult.status === "sent") channelsSent.push("email");
        else results.checkOut.errors.push(`email to ${shift.email}: ${emailResult.errorMessage ?? emailResult.status}`);
      } catch (err) {
        results.checkOut.errors.push(`email exception: ${String(err)}`);
      }

      // Teams — personal webhook (DM) takes priority over global channel webhook
      const teamsUrl = shift.teamsWebhookUrl || cfg.teamsWebhookUrl;
      if (teamsUrl) {
        const teamsResult = await sendTeamsMessage(teamsUrl, {
          title:       "⏰ Please Clock Out — Team Pulse",
          text:        `Hi **${shift.firstName} ${shift.lastName}** — your shift was scheduled to end at **${scheduledTime}**. Please clock out.`,
          facts:       [
            { name: "Person",     value: `${shift.firstName} ${shift.lastName}` },
            { name: "Scheduled",  value: scheduledTime },
            { name: "Action",     value: "Please clock out" },
          ],
          actionLabel: "Open Team Pulse",
          actionUrl:   baseUrl,
        });
        const label = shift.teamsWebhookUrl ? "teams-dm" : "teams-channel";
        if (teamsResult.ok) channelsSent.push(label);
        else results.checkOut.errors.push(`teams: ${teamsResult.error ?? "unknown"}`);
      }

      if (channelsSent.length > 0) {
        await recordReminderSent(shift.scheduledShiftId, shift.profileId, "check_out", channelsSent);
        results.checkOut.sent++;
      } else {
        results.checkOut.skipped++;
      }
    }
  }

  // ── Standard-schedule check-in reminders ─────────────────────────────────────
  if (cfg.checkInEnabled) {
    let dueProfiles: ProfileDueForReminder[] = [];
    try {
      dueProfiles = await getProfilesDueForCheckIn(cfg.checkInOffsetMinutes);
    } catch (err) {
      console.error("[reminders] standard check-in query failed:", err);
    }

    for (const p of dueProfiles) {
      const channelsSent: string[] = [];
      const scheduledTime = fmt12h(p.startTime);
      const subject = "Team Pulse — Please clock in";
      const body    = buildCheckInBody(p.firstName, scheduledTime, baseUrl);

      try {
        const emailResult = await sendTransactionalEmail({
          to: p.email, subject, text: body.text, html: body.html,
        });
        if (emailResult.status === "sent") channelsSent.push("email");
        else results.standardCheckIn.errors.push(`email to ${p.email}: ${emailResult.errorMessage ?? emailResult.status}`);
      } catch (err) {
        results.standardCheckIn.errors.push(`email exception: ${String(err)}`);
      }

      const teamsUrl = p.teamsWebhookUrl || cfg.teamsWebhookUrl;
      if (teamsUrl) {
        const teamsResult = await sendTeamsMessage(teamsUrl, {
          title:       "⏰ Please Clock In — Team Pulse",
          text:        `Hi **${p.firstName} ${p.lastName}** — your shift was scheduled to start at **${scheduledTime}**. Please clock in.`,
          facts:       [
            { name: "Person",    value: `${p.firstName} ${p.lastName}` },
            { name: "Scheduled", value: scheduledTime },
            { name: "Action",    value: "Please clock in" },
          ],
          actionLabel: "Open Team Pulse",
          actionUrl:   baseUrl,
        });
        const label = p.teamsWebhookUrl ? "teams-dm" : "teams-channel";
        if (teamsResult.ok) channelsSent.push(label);
        else results.standardCheckIn.errors.push(`teams: ${teamsResult.error ?? "unknown"}`);
      }

      if (channelsSent.length > 0) {
        await recordProfileReminderSent(p.profileId, p.reminderDate, "check_in", channelsSent);
        results.standardCheckIn.sent++;
      } else {
        results.standardCheckIn.skipped++;
      }
    }
  }

  // ── Standard-schedule check-out reminders ─────────────────────────────────────
  if (cfg.checkOutEnabled) {
    let dueProfiles: ProfileDueForReminder[] = [];
    try {
      dueProfiles = await getProfilesDueForCheckOut(cfg.checkOutOffsetMinutes);
    } catch (err) {
      console.error("[reminders] standard check-out query failed:", err);
    }

    for (const p of dueProfiles) {
      const channelsSent: string[] = [];
      const scheduledTime = fmt12h(p.endTime);
      const subject = "Team Pulse — Please clock out";
      const body    = buildCheckOutBody(p.firstName, scheduledTime, baseUrl);

      try {
        const emailResult = await sendTransactionalEmail({
          to: p.email, subject, text: body.text, html: body.html,
        });
        if (emailResult.status === "sent") channelsSent.push("email");
        else results.standardCheckOut.errors.push(`email to ${p.email}: ${emailResult.errorMessage ?? emailResult.status}`);
      } catch (err) {
        results.standardCheckOut.errors.push(`email exception: ${String(err)}`);
      }

      const teamsUrl = p.teamsWebhookUrl || cfg.teamsWebhookUrl;
      if (teamsUrl) {
        const teamsResult = await sendTeamsMessage(teamsUrl, {
          title:       "⏰ Please Clock Out — Team Pulse",
          text:        `Hi **${p.firstName} ${p.lastName}** — your shift was scheduled to end at **${scheduledTime}**. Please clock out.`,
          facts:       [
            { name: "Person",    value: `${p.firstName} ${p.lastName}` },
            { name: "Scheduled", value: scheduledTime },
            { name: "Action",    value: "Please clock out" },
          ],
          actionLabel: "Open Team Pulse",
          actionUrl:   baseUrl,
        });
        const label = p.teamsWebhookUrl ? "teams-dm" : "teams-channel";
        if (teamsResult.ok) channelsSent.push(label);
        else results.standardCheckOut.errors.push(`teams: ${teamsResult.error ?? "unknown"}`);
      }

      if (channelsSent.length > 0) {
        await recordProfileReminderSent(p.profileId, p.reminderDate, "check_out", channelsSent);
        results.standardCheckOut.sent++;
      } else {
        results.standardCheckOut.skipped++;
      }
    }
  }

  // ── Late escalation: notify managers + admins ──────────────────────────────────
  if (cfg.escalationEnabled) {
    try {
      const lateShifts = await getLateShiftsForEscalation(cfg.escalationMinutes, cfg.orgTimezone);
      for (const late of lateShifts) {
        const recipients = await getEscalationRecipients(late.teamId);
        const channels: string[] = [];
        const subject = `Team Pulse — ${late.firstName} ${late.lastName} is ${late.minutesLate}m late`;
        const text = `${late.firstName} ${late.lastName} was scheduled to start at ${fmt12h(late.startTime)} and still hasn't clocked in (${late.minutesLate} minutes late). Coverage may be at risk.`;
        for (const r of recipients) {
          try {
            const res = await sendTransactionalEmail({
              to: r.email, subject, text,
              html: `<p>${text}</p><p><a href="${baseUrl}">Open Team Pulse</a></p>`,
            });
            if (res.status === "sent") channels.push(`email:${r.email}`);
          } catch (e) { results.escalation.errors.push(String(e)); }
        }
        if (cfg.teamsWebhookUrl) {
          const t = await sendTeamsMessage(cfg.teamsWebhookUrl, {
            title: "🚨 Late — Coverage at Risk",
            text: `**${late.firstName} ${late.lastName}** was scheduled at **${fmt12h(late.startTime)}** and is **${late.minutesLate} minutes late** with no clock-in.`,
            facts: [{ name: "Scheduled", value: fmt12h(late.startTime) }, { name: "Late by", value: `${late.minutesLate} min` }],
            actionLabel: "Open Team Pulse", actionUrl: baseUrl,
          });
          if (t.ok) channels.push("teams");
        }
        await recordEscalation(late.scheduledShiftId, late.profileId, channels);
        results.escalation.sent++;
      }
    } catch (err) {
      console.error("[reminders] escalation failed:", err);
      results.escalation.errors.push(String(err));
    }
  }

  // ── Understaffing alert: current hour below minimum ─────────────────────────────
  if (cfg.understaffAlertEnabled) {
    try {
      const rules = await getStaffingRules();
      if (rules.length > 0) {
        const tz = cfg.orgTimezone;
        const todayStr = localDateInZone(tz);
        const nowHour = Number(
          new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hour12: false }).format(new Date()),
        ) % 24;

        // Scheduled window: yesterday→today covers overnight carry-over for the current hour.
        const dayBefore = new Date(); dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
        const scheduled = await getScheduledShifts(dayBefore.toISOString().slice(0, 10), todayStr);
        const org = await loadOrgDataFromDb();

        const counts = coverageCounts(scheduled, org.profiles, tz, todayStr);
        const required = requiredStaffPerHour(todayStr, rules);

        if (required[nowHour] > 0 && counts[nowHour] < required[nowHour] && !(await wasCoverageAlerted(todayStr, nowHour))) {
          const recipients = await getEscalationRecipients(null);
          const label = fmt12h(`${String(nowHour).padStart(2, "0")}:00`);
          const subject = `Team Pulse — understaffed at ${label}`;
          const text = `Coverage at ${label} is ${counts[nowHour]} of ${required[nowHour]} required. Action may be needed to maintain coverage.`;
          for (const r of recipients) {
            try {
              await sendTransactionalEmail({ to: r.email, subject, text, html: `<p>${text}</p><p><a href="${baseUrl}">Open Team Pulse</a></p>` });
            } catch (e) { results.understaffing.errors.push(String(e)); }
          }
          if (cfg.teamsWebhookUrl) {
            await sendTeamsMessage(cfg.teamsWebhookUrl, {
              title: "⚠️ Below Minimum Staffing",
              text: `Coverage at **${label}** is **${counts[nowHour]} of ${required[nowHour]}** required.`,
              actionLabel: "Open Team Pulse", actionUrl: baseUrl,
            });
          }
          await recordCoverageAlert(todayStr, nowHour);
          results.understaffing.sent++;
        }
      }
    } catch (err) {
      console.error("[reminders] understaffing check failed:", err);
      results.understaffing.errors.push(String(err));
    }
  }

  console.log("[reminders]", JSON.stringify(results));
  return NextResponse.json({ ok: true, ...results });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt12h(time: string): string {
  const [hStr, mStr] = time.split(":");
  const h = Number(hStr);
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const min  = mStr && mStr !== "00" ? `:${mStr}` : "";
  return `${h12}${min} ${suffix}`;
}

function buildCheckInBody(firstName: string, scheduledTime: string, baseUrl: string) {
  const text = [
    `Hi ${firstName},`,
    ``,
    `Your shift was scheduled to start at ${scheduledTime}. If you're working, please clock in now.`,
    ``,
    `Clock in here: ${baseUrl}`,
    ``,
    `— Team Pulse`,
  ].join("\n");

  const html = `
    <table style="font-family:sans-serif;font-size:14px;color:#111;max-width:500px">
      <tr><td style="padding-bottom:16px">
        <strong style="font-size:16px">⏰ Team Pulse — Please Clock In</strong>
      </td></tr>
      <tr><td style="padding-bottom:12px">
        Hi <strong>${firstName}</strong>,<br><br>
        Your shift was scheduled to start at <strong>${scheduledTime}</strong>.
        If you're working, please clock in now.
      </td></tr>
      <tr><td style="padding-bottom:16px">
        <a href="${baseUrl}" style="background:#00579D;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
          Clock In Now
        </a>
      </td></tr>
      <tr><td style="font-size:12px;color:#64748B">
        This is an automated reminder from Team Pulse. If you've already clocked in, you can ignore this message.
      </td></tr>
    </table>`;

  return { text, html };
}

function buildCheckOutBody(firstName: string, scheduledTime: string, baseUrl: string) {
  const text = [
    `Hi ${firstName},`,
    ``,
    `Your shift was scheduled to end at ${scheduledTime}. If you're done, please clock out now.`,
    ``,
    `Clock out here: ${baseUrl}`,
    ``,
    `— Team Pulse`,
  ].join("\n");

  const html = `
    <table style="font-family:sans-serif;font-size:14px;color:#111;max-width:500px">
      <tr><td style="padding-bottom:16px">
        <strong style="font-size:16px">⏰ Team Pulse — Please Clock Out</strong>
      </td></tr>
      <tr><td style="padding-bottom:12px">
        Hi <strong>${firstName}</strong>,<br><br>
        Your shift was scheduled to end at <strong>${scheduledTime}</strong>.
        If you're finished, please clock out now.
      </td></tr>
      <tr><td style="padding-bottom:16px">
        <a href="${baseUrl}" style="background:#00579D;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
          Clock Out Now
        </a>
      </td></tr>
      <tr><td style="font-size:12px;color:#64748B">
        This is an automated reminder from Team Pulse. If you've already clocked out, you can ignore this message.
      </td></tr>
    </table>`;

  return { text, html };
}
