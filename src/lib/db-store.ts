import bcrypt from "bcryptjs";
import crypto from "crypto";
import type { PoolClient } from "pg";

import { query, withTransaction } from "@/lib/db";
import { isUuid } from "@/lib/uuid";
import { mapProfile, mapReminderRule, mapScheduleRule, mapScheduleTemplate, mapScheduledShift, mapSegment, mapShift, mapTeam, mapTimeOff } from "@/lib/supabase/mappers";
import type { OrgData, Profile, Role, ScheduleRule, ScheduleTemplate, ScheduledShift, Shift, ShiftSegment, Team, TemplateShift, TimeOffEntry } from "@/lib/types";
import type { GeneratedShift, AppliedTemplateShift } from "@/lib/schedule-engine";

export type EmailSettings = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  fromMailbox: string;
};

type UserAuthRow = {
  profile_id: string;
  first_name: string;
  last_name: string;
  role: Role;
  email: string;
  password_hash: string;
  must_set_password: boolean;
};

export async function loadOrgDataFromDb(): Promise<OrgData> {
  const [profilesRes, teamsRes, shiftsRes, segmentsRes, timeOffRes, reminderRes] = await Promise.all([
    query("select * from profiles order by first_name, last_name"),
    query("select * from teams order by name"),
    query("select * from shifts order by punch_in_at desc"),
    query("select * from shift_segments order by start_at desc"),
    query("select * from time_off_entries order by start_at desc"),
    query("select * from reminder_rules order by send_time asc"),
  ]);

  return {
    profiles: profilesRes.rows.map((row) => mapProfile(row)),
    teams: teamsRes.rows.map((row) => mapTeam(row)),
    shifts: shiftsRes.rows.map((row) => mapShift(row)),
    segments: segmentsRes.rows.map((row) => mapSegment(row)),
    timeOff: timeOffRes.rows.map((row) => mapTimeOff(row)),
    reminderRules: reminderRes.rows.map((row) => mapReminderRule(row)),
  };
}

export async function getProfileById(id: string): Promise<Profile | null> {
  if (!isUuid(id)) return null;
  const result = await query("select * from profiles where id = $1 limit 1", [id]);
  return result.rows[0] ? mapProfile(result.rows[0]) : null;
}

export async function findUserAuthByEmail(email: string) {
  const result = await query<UserAuthRow>(
    `select
      p.id as profile_id,
      p.first_name,
      p.last_name,
      p.role,
      p.email,
      u.password_hash,
      u.must_set_password
    from profiles p
    join app_users u on u.profile_id = p.id
    where lower(p.email) = lower($1)
    limit 1`,
    [email],
  );
  return result.rows[0] ?? null;
}

export async function updateUserPassword(profileId: string, plainPassword: string) {
  const passwordHash = bcrypt.hashSync(plainPassword, 10);
  await query("update app_users set password_hash = $2, must_set_password = false where profile_id = $1", [
    profileId,
    passwordHash,
  ]);
}

export async function createPasswordResetToken(profileId: string) {
  const token = crypto.randomBytes(32).toString("hex");
  await query(
    "insert into password_reset_tokens (token, profile_id, expires_at) values ($1, $2, now() + interval '1 hour')",
    [token, profileId],
  );
  return token;
}

export async function validatePasswordResetToken(token: string) {
  const result = await query<{ profile_id: string; first_name: string }>(
    `select p.id as profile_id, p.first_name
     from password_reset_tokens t
     join profiles p on p.id = t.profile_id
     where t.token = $1 and t.used_at is null and t.expires_at > now()
     limit 1`,
    [token],
  );
  return result.rows[0] ?? null;
}

export async function consumePasswordResetToken(token: string) {
  const result = await query<{ profile_id: string }>(
    `update password_reset_tokens
     set used_at = now()
     where token = $1 and used_at is null and expires_at > now()
     returning profile_id`,
    [token],
  );
  return result.rows[0] ?? null;
}

export async function createTeam(name: string, managerId?: string): Promise<Team> {
  const result = await query(
    "insert into teams (name, manager_id) values ($1, $2) returning *",
    [name.trim(), managerId ?? null],
  );
  return mapTeam(result.rows[0]);
}

export async function deleteTeam(id: string): Promise<boolean> {
  const result = await query("delete from teams where id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function updateTeamHours(id: string, patch: {
  name?: string;
  defaultWorkDays?: number[];
  defaultStartTime?: string;
  defaultEndTime?: string;
  defaultTimezone?: string;
}): Promise<Team> {
  const result = await query(
    `UPDATE teams SET
       name               = COALESCE($2, name),
       default_work_days  = COALESCE($3, default_work_days),
       default_start_time = COALESCE($4::time, default_start_time),
       default_end_time   = COALESCE($5::time, default_end_time),
       default_timezone   = COALESCE($6, default_timezone),
       updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id, patch.name ?? null, patch.defaultWorkDays ?? null, patch.defaultStartTime ?? null, patch.defaultEndTime ?? null, patch.defaultTimezone ?? null],
  );
  return mapTeam(result.rows[0]);
}

export async function createInvitedUser(input: {
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  teamId?: string;
  timezone?: string;
  /** If set (≥8 chars), used as the one-time password; otherwise a random temp password is generated. */
  initialPassword?: string;
}) {
  const custom = input.initialPassword?.trim();
  const tempPassword = custom && custom.length >= 8 ? custom : generateTempPassword();
  const passwordHash = bcrypt.hashSync(tempPassword, 10);

  const result = await withTransaction(async (client) => {
    const profile = await client.query(
      `insert into profiles (first_name, last_name, email, role, team_id, status, expected_start_time, timezone)
       values ($1, $2, $3, $4, $5, 'active', '08:30', $6)
       returning *`,
      [input.firstName, input.lastName, input.email.toLowerCase().trim(), input.role, input.teamId ?? null, input.timezone ?? "America/Chicago"],
    );

    await client.query("insert into app_users (profile_id, password_hash, must_set_password) values ($1, $2, true)", [
      profile.rows[0].id,
      passwordHash,
    ]);

    return mapProfile(profile.rows[0]);
  });

  return { profile: result, tempPassword };
}

export async function punchIn(profileId: string): Promise<Shift> {
  const result = await query(
    "insert into shifts (user_id, punch_in_at, status) values ($1, now(), 'open') returning *",
    [profileId],
  );
  return mapShift(result.rows[0]);
}

export async function punchOut(profileId: string): Promise<Shift | null> {
  const result = await query(
    `update shifts
     set punch_out_at = now(), status = 'closed'
     where id = (
       select id from shifts where user_id = $1 and status = 'open' order by punch_in_at desc limit 1
     )
     returning *`,
    [profileId],
  );
  return result.rows[0] ? mapShift(result.rows[0]) : null;
}

export async function startSegment(profileId: string, segmentType: ShiftSegment["segmentType"]) {
  return withTransaction(async (client) => {
    const openShift = await client.query<{ id: string }>(
      "select id from shifts where user_id = $1 and status = 'open' order by punch_in_at desc limit 1",
      [profileId],
    );
    if (!openShift.rows[0]) return null;

    await ensureNoOpenSegment(client, openShift.rows[0].id);

    const created = await client.query(
      `insert into shift_segments (shift_id, user_id, segment_type, start_at)
       values ($1, $2, $3, now())
       returning *`,
      [openShift.rows[0].id, profileId, segmentType],
    );
    return mapSegment(created.rows[0]);
  });
}

export async function endSegment(profileId: string, segmentType: ShiftSegment["segmentType"]) {
  const result = await query(
    `update shift_segments
     set end_at = now()
     where id = (
       select id from shift_segments
       where user_id = $1 and segment_type = $2 and end_at is null
       order by start_at desc
       limit 1
     )
     returning *`,
    [profileId, segmentType],
  );
  return result.rows[0] ? mapSegment(result.rows[0]) : null;
}

export async function createTimeOffEntry(input: {
  userId: string;
  timeOffType: TimeOffEntry["timeOffType"];
  startAt: string;
  endAt: string;
  fullDay: boolean;
  hours: number;
  notes?: string;
}) {
  const result = await query(
    `insert into time_off_entries (user_id, time_off_type, start_at, end_at, full_day, hours, status, notes)
     values ($1, $2, $3, $4, $5, $6, 'approved', $7)
     returning *`,
    [input.userId, input.timeOffType, input.startAt, input.endAt, input.fullDay, input.hours, input.notes ?? null],
  );
  return mapTimeOff(result.rows[0]);
}

export async function getTimeOffEntryById(id: string) {
  const result = await query("select * from time_off_entries where id = $1 limit 1", [id]);
  return result.rows[0] ? mapTimeOff(result.rows[0]) : null;
}

export async function getEmailSettings(): Promise<EmailSettings> {
  const result = await query<{ key: string; value: string }>(
    "select key, value from app_settings where key = any($1::text[])",
    [["email.tenant_id", "email.client_id", "email.client_secret", "email.from_mailbox"]],
  );
  const values = new Map(result.rows.map((row) => [row.key, row.value]));

  return {
    tenantId:     values.get("email.tenant_id")     ?? "",
    clientId:     values.get("email.client_id")     ?? "",
    clientSecret: values.get("email.client_secret") ?? "",
    fromMailbox:  values.get("email.from_mailbox")  ?? "",
  };
}

export async function saveEmailSettings(updates: Partial<EmailSettings>) {
  const current = await getEmailSettings();
  const next: EmailSettings = {
    tenantId:     updates.tenantId     ?? current.tenantId,
    clientId:     updates.clientId     ?? current.clientId,
    clientSecret: updates.clientSecret ? updates.clientSecret : current.clientSecret,
    fromMailbox:  updates.fromMailbox  ?? current.fromMailbox,
  };

  await withTransaction(async (client) => {
    await upsertSetting(client, "email.tenant_id",     next.tenantId);
    await upsertSetting(client, "email.client_id",     next.clientId);
    await upsertSetting(client, "email.client_secret", next.clientSecret);
    await upsertSetting(client, "email.from_mailbox",  next.fromMailbox);
  });

  return next;
}

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pw = chars[Math.floor(Math.random() * 26)];
  for (let i = 0; i < 7; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

async function ensureNoOpenSegment(client: PoolClient, shiftId: string) {
  const active = await client.query("select id from shift_segments where shift_id = $1 and end_at is null limit 1", [shiftId]);
  if (active.rows[0]) {
    throw new Error("An active segment already exists.");
  }
}

async function upsertSetting(client: PoolClient, key: string, value: string) {
  await client.query(
    `insert into app_settings (key, value)
     values ($1, $2)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [key, value],
  );
}

// ── SSO settings ──────────────────────────────────────────────────────────────

export type SsoSettings = {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  tenantId: string;
};

export async function getSsoSettings(): Promise<SsoSettings> {
  const result = await query<{ key: string; value: string }>(
    "select key, value from app_settings where key = any($1::text[])",
    [["sso.enabled", "sso.client_id", "sso.client_secret", "sso.tenant_id"]],
  );
  const values = new Map(result.rows.map((r) => [r.key, r.value]));
  return {
    enabled:      values.get("sso.enabled") === "true",
    clientId:     values.get("sso.client_id") ?? "",
    clientSecret: values.get("sso.client_secret") ?? "",
    tenantId:     values.get("sso.tenant_id") ?? "",
  };
}

export async function saveSsoSettings(updates: Partial<SsoSettings>): Promise<SsoSettings> {
  const current = await getSsoSettings();
  const next: SsoSettings = {
    enabled:      updates.enabled ?? current.enabled,
    clientId:     updates.clientId ?? current.clientId,
    clientSecret: updates.clientSecret ? updates.clientSecret : current.clientSecret,
    tenantId:     updates.tenantId ?? current.tenantId,
  };
  await withTransaction(async (client) => {
    await upsertSetting(client, "sso.enabled",       String(next.enabled));
    await upsertSetting(client, "sso.client_id",     next.clientId);
    await upsertSetting(client, "sso.client_secret", next.clientSecret);
    await upsertSetting(client, "sso.tenant_id",     next.tenantId);
  });
  return next;
}

// ── Notification settings ─────────────────────────────────────────────────────

export interface NotificationSettings {
  teamsWebhookUrl: string;
  orgTimezone: string;
  checkInEnabled: boolean;
  checkOutEnabled: boolean;
  checkInOffsetMinutes: number;
  checkOutOffsetMinutes: number;
  escalationEnabled: boolean;
  escalationMinutes: number;
  understaffAlertEnabled: boolean;
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const result = await query<{ key: string; value: string }>(
    "select key, value from app_settings where key like 'notif.%'",
  );
  const m = new Map(result.rows.map((r) => [r.key, r.value]));
  return {
    teamsWebhookUrl:       m.get("notif.teams_webhook_url")     ?? "",
    orgTimezone:           m.get("notif.org_timezone")          ?? "America/Chicago",
    checkInEnabled:        (m.get("notif.checkin_enabled")      ?? "true") === "true",
    checkOutEnabled:       (m.get("notif.checkout_enabled")     ?? "true") === "true",
    checkInOffsetMinutes:  Number(m.get("notif.checkin_offset_minutes")  ?? "5"),
    checkOutOffsetMinutes: Number(m.get("notif.checkout_offset_minutes") ?? "5"),
    escalationEnabled:     (m.get("notif.escalation_enabled")   ?? "true") === "true",
    escalationMinutes:     Number(m.get("notif.escalation_minutes") ?? "15"),
    understaffAlertEnabled:(m.get("notif.understaff_alert_enabled") ?? "true") === "true",
  };
}

export async function saveNotificationSettings(s: Partial<NotificationSettings>): Promise<NotificationSettings> {
  const current = await getNotificationSettings();
  const next: NotificationSettings = { ...current, ...s };

  await withTransaction(async (client) => {
    const pairs: Array<[string, string]> = [
      ["notif.teams_webhook_url",      next.teamsWebhookUrl],
      ["notif.org_timezone",           next.orgTimezone],
      ["notif.checkin_enabled",        String(next.checkInEnabled)],
      ["notif.checkout_enabled",       String(next.checkOutEnabled)],
      ["notif.checkin_offset_minutes", String(next.checkInOffsetMinutes)],
      ["notif.checkout_offset_minutes", String(next.checkOutOffsetMinutes)],
      ["notif.escalation_enabled",     String(next.escalationEnabled)],
      ["notif.escalation_minutes",     String(next.escalationMinutes)],
      ["notif.understaff_alert_enabled", String(next.understaffAlertEnabled)],
    ];
    for (const [key, value] of pairs) {
      await upsertSetting(client, key, value);
    }
  });

  return next;
}

// ── Shift reminder checks ──────────────────────────────────────────────────────

export interface ShiftDueForReminder {
  scheduledShiftId: string;
  profileId: string;
  email: string;
  firstName: string;
  lastName: string;
  timezone: string;                 // employee's IANA timezone
  shiftDate: string;
  startTime: string;
  endTime: string;
  label: string | null;
  teamsWebhookUrl: string | null;   // personal Power Automate webhook, if set
}

export async function updateProfile(
  profileId: string,
  patch: Partial<{
    firstName: string;
    lastName: string;
    email: string;
    role: Role;
    teamId: string | null;
    expectedStartTime: string;
    expectedEndTime: string;
    status: "active" | "inactive";
    timezone: string;
    showOnDashboard: boolean;
    birthday: string | null;
    workAnniversary: string | null;
    workScheduleType: "standard" | "shift_based";
    standardWorkDays: number[];
    hideWhenNotActive: boolean;
  }>,
): Promise<Profile> {
  const result = await query(
    `UPDATE profiles SET
       first_name           = COALESCE($2, first_name),
       last_name            = COALESCE($3, last_name),
       email                = COALESCE($4, email),
       role                 = COALESCE($5::app_role, role),
       team_id              = COALESCE($6, team_id),
       expected_start_time  = COALESCE($7::time, expected_start_time),
       status               = COALESCE($8::profile_status, status),
       timezone             = COALESCE($9, timezone),
       show_on_dashboard    = COALESCE($10, show_on_dashboard),
       birthday             = CASE WHEN $11::text IS NOT NULL THEN ('2000-' || $11::text)::date ELSE birthday END,
       work_anniversary     = CASE WHEN $12::text IS NOT NULL THEN $12::date ELSE work_anniversary END,
       work_schedule_type   = COALESCE($13::text, work_schedule_type),
       standard_work_days   = COALESCE($14, standard_work_days),
       hide_when_not_active = COALESCE($15, hide_when_not_active),
       expected_end_time    = COALESCE($16::time, expected_end_time)
     WHERE id = $1
     RETURNING *`,
    [
      profileId,
      patch.firstName  ?? null,
      patch.lastName   ?? null,
      patch.email      ?? null,
      patch.role       ?? null,
      patch.teamId     !== undefined ? patch.teamId : null,
      patch.expectedStartTime ?? null,
      patch.status     ?? null,
      patch.timezone   ?? null,
      patch.showOnDashboard ?? null,
      patch.birthday !== undefined ? patch.birthday : null,
      patch.workAnniversary !== undefined ? patch.workAnniversary : null,
      patch.workScheduleType ?? null,
      patch.standardWorkDays ?? null,
      patch.hideWhenNotActive ?? null,
      patch.expectedEndTime ?? null,
    ],
  );
  return mapProfile(result.rows[0]);
}

export async function updateProfileTeamsWebhook(profileId: string, url: string | null): Promise<void> {
  await query("UPDATE profiles SET teams_webhook_url = $2 WHERE id = $1", [profileId, url || null]);
}

export async function adminResetPassword(profileId: string): Promise<{ tempPassword: string }> {
  const tempPassword = generateTempPassword();
  const passwordHash = bcrypt.hashSync(tempPassword, 10);
  await query(
    `INSERT INTO app_users (profile_id, password_hash, must_set_password)
     VALUES ($1, $2, true)
     ON CONFLICT (profile_id) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           must_set_password = true`,
    [profileId, passwordHash],
  );
  return { tempPassword };
}

export async function deleteProfile(profileId: string): Promise<boolean> {
  // Cascade deletes app_users, shifts, segments, time_off_entries, etc. via FK constraints
  const result = await query("DELETE FROM profiles WHERE id = $1", [profileId]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Returns scheduled shifts whose START TIME was `offsetMinutes` ago (±2 min window),
 * anchored to the schedule reference timezone (the tz shift times are authored in).
 * Person must NOT have punched in yet.
 */
export async function getShiftsDueForCheckIn(
  scheduleTz: string,
  offsetMinutes: number,
): Promise<ShiftDueForReminder[]> {
  const result = await query<{
    id: string; profile_id: string; email: string;
    first_name: string; last_name: string; timezone: string;
    shift_date: unknown; start_time: string; end_time: string; label: string | null;
    teams_webhook_url: string | null;
  }>(
    `SELECT
       ss.id, ss.profile_id, ss.start_time, ss.end_time, ss.label,
       ss.shift_date,
       p.email, p.first_name, p.last_name, p.timezone, p.teams_webhook_url
     FROM scheduled_shifts ss
     JOIN profiles p ON p.id = ss.profile_id
     WHERE NOT EXISTS (
       SELECT 1 FROM shift_reminders sr
       WHERE sr.scheduled_shift_id = ss.id AND sr.reminder_type = 'check_in'
     )
     -- anchor to the schedule reference timezone
     AND (ss.shift_date::timestamp + ss.start_time) AT TIME ZONE $2
           BETWEEN now() - make_interval(mins => $1 + 2)
               AND now() - make_interval(mins => $1 - 2)
     AND NOT EXISTS (
       SELECT 1 FROM shifts sh
       WHERE sh.user_id = ss.profile_id
         AND sh.punch_in_at >= (ss.shift_date::timestamp + ss.start_time) AT TIME ZONE $2
                               - interval '30 minutes'
         AND sh.punch_out_at IS NULL
     )`,
    [offsetMinutes, scheduleTz],
  );

  return result.rows.map((r) => ({
    scheduledShiftId: r.id,
    profileId:        r.profile_id,
    email:            r.email,
    firstName:        r.first_name,
    lastName:         r.last_name,
    timezone:         r.timezone,
    shiftDate:        String(r.shift_date).slice(0, 10),
    startTime:        String(r.start_time).slice(0, 5),
    endTime:          String(r.end_time).slice(0, 5),
    label:            r.label,
    teamsWebhookUrl:  r.teams_webhook_url ?? null,
  }));
}

/**
 * Returns scheduled shifts whose END TIME was `offsetMinutes` ago (±2 min window),
 * anchored to the schedule reference timezone. Person must still have an open shift.
 */
export async function getShiftsDueForCheckOut(
  scheduleTz: string,
  offsetMinutes: number,
): Promise<ShiftDueForReminder[]> {
  const result = await query<{
    id: string; profile_id: string; email: string;
    first_name: string; last_name: string; timezone: string;
    shift_date: unknown; start_time: string; end_time: string; label: string | null;
    teams_webhook_url: string | null;
  }>(
    `SELECT
       ss.id, ss.profile_id, ss.start_time, ss.end_time, ss.label,
       ss.shift_date,
       p.email, p.first_name, p.last_name, p.timezone, p.teams_webhook_url
     FROM scheduled_shifts ss
     JOIN profiles p ON p.id = ss.profile_id
     WHERE NOT EXISTS (
       SELECT 1 FROM shift_reminders sr
       WHERE sr.scheduled_shift_id = ss.id AND sr.reminder_type = 'check_out'
     )
     -- overnight shifts (end_time < start_time) end the following calendar day
     AND CASE
           WHEN ss.end_time > ss.start_time
           THEN (ss.shift_date::timestamp + ss.end_time) AT TIME ZONE $2
           ELSE ((ss.shift_date::timestamp + interval '1 day') + ss.end_time) AT TIME ZONE $2
         END
         BETWEEN now() - make_interval(mins => $1 + 2)
             AND now() - make_interval(mins => $1 - 2)
     AND EXISTS (
       SELECT 1 FROM shifts sh
       WHERE sh.user_id = ss.profile_id
         AND sh.punch_out_at IS NULL
     )`,
    [offsetMinutes, scheduleTz],
  );

  return result.rows.map((r) => ({
    scheduledShiftId: r.id,
    profileId:        r.profile_id,
    email:            r.email,
    firstName:        r.first_name,
    lastName:         r.last_name,
    timezone:         r.timezone,
    shiftDate:        String(r.shift_date).slice(0, 10),
    startTime:        String(r.start_time).slice(0, 5),
    endTime:          String(r.end_time).slice(0, 5),
    label:            r.label,
    teamsWebhookUrl:  r.teams_webhook_url ?? null,
  }));
}

export async function recordReminderSent(
  scheduledShiftId: string,
  profileId: string,
  reminderType: "check_in" | "check_out",
  channelsSent: string[],
): Promise<void> {
  await query(
    `INSERT INTO shift_reminders (scheduled_shift_id, profile_id, reminder_type, channels_sent)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (scheduled_shift_id, reminder_type) DO NOTHING`,
    [scheduledShiftId, profileId, reminderType, channelsSent],
  );
}

// ── Schedule rules ────────────────────────────────────────────────────────────

export async function getScheduleRules(): Promise<ScheduleRule[]> {
  const r = await query("SELECT * FROM schedule_rules ORDER BY effective_from, profile_id");
  return r.rows.map((row) => mapScheduleRule(row));
}

export async function createScheduleRule(input: Omit<ScheduleRule, "id" | "createdAt" | "updatedAt">): Promise<ScheduleRule> {
  const r = await query(
    `INSERT INTO schedule_rules
       (profile_id, start_time, end_time, label, notes, days_of_week, repeat_weeks,
        effective_from, effective_until, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [
      input.profileId, input.startTime, input.endTime,
      input.label ?? null, input.notes ?? null,
      input.daysOfWeek, input.repeatWeeks,
      input.effectiveFrom, input.effectiveUntil ?? null,
      input.createdBy ?? null,
    ],
  );
  return mapScheduleRule(r.rows[0]);
}

export async function updateScheduleRule(id: string, patch: Partial<Omit<ScheduleRule, "id" | "createdAt" | "updatedAt">>): Promise<ScheduleRule> {
  const r = await query(
    `UPDATE schedule_rules SET
       profile_id      = COALESCE($2, profile_id),
       start_time      = COALESCE($3::time, start_time),
       end_time        = COALESCE($4::time, end_time),
       label           = COALESCE($5, label),
       notes           = COALESCE($6, notes),
       days_of_week    = COALESCE($7, days_of_week),
       repeat_weeks    = COALESCE($8, repeat_weeks),
       effective_from  = COALESCE($9::date, effective_from),
       effective_until = $10
     WHERE id = $1 RETURNING *`,
    [id,
      patch.profileId ?? null, patch.startTime ?? null, patch.endTime ?? null,
      patch.label ?? null, patch.notes ?? null,
      patch.daysOfWeek ?? null, patch.repeatWeeks ?? null,
      patch.effectiveFrom ?? null, patch.effectiveUntil ?? null,
    ],
  );
  return mapScheduleRule(r.rows[0]);
}

export async function deleteScheduleRule(id: string): Promise<boolean> {
  const r = await query("DELETE FROM schedule_rules WHERE id = $1", [id]);
  return (r.rowCount ?? 0) > 0;
}

/** Delete all future generated shifts for a rule (on or after fromDate). */
export async function deleteFutureRuleShifts(ruleId: string, fromDate: string): Promise<number> {
  const r = await query(
    "DELETE FROM scheduled_shifts WHERE rule_id = $1 AND shift_date >= $2",
    [ruleId, fromDate],
  );
  return r.rowCount ?? 0;
}

/** Bulk-insert generated shifts (skips duplicates by profile+date+start). */
export async function insertGeneratedShifts(shifts: GeneratedShift[]): Promise<number> {
  if (shifts.length === 0) return 0;
  let inserted = 0;
  for (const s of shifts) {
    const r = await query(
      `INSERT INTO scheduled_shifts
         (profile_id, shift_date, start_time, end_time, label, notes, rule_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT DO NOTHING`,
      [s.profileId, s.shiftDate, s.startTime, s.endTime, s.label, s.notes, s.ruleId, s.createdBy],
    );
    inserted += r.rowCount ?? 0;
  }
  return inserted;
}

/** Bulk-insert applied-template or copy-week shifts. */
export async function insertAppliedShifts(shifts: AppliedTemplateShift[]): Promise<ScheduledShift[]> {
  const result: ScheduledShift[] = [];
  for (const s of shifts) {
    const r = await query(
      `INSERT INTO scheduled_shifts
         (profile_id, shift_date, start_time, end_time, label, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT DO NOTHING RETURNING *`,
      [s.profileId, s.shiftDate, s.startTime, s.endTime, s.label, s.notes, s.createdBy],
    );
    if (r.rows[0]) result.push(mapScheduledShift(r.rows[0]));
  }
  return result;
}

// ── Bulk operations ───────────────────────────────────────────────────────────

export async function bulkReassignShifts(
  fromProfileId: string,
  toProfileId:   string,
  fromDate:      string,
  toDate:        string,
): Promise<number> {
  const r = await query(
    `UPDATE scheduled_shifts
     SET profile_id = $2
     WHERE profile_id = $1 AND shift_date >= $3 AND shift_date <= $4`,
    [fromProfileId, toProfileId, fromDate, toDate],
  );
  return r.rowCount ?? 0;
}

// ── Update a single shift ─────────────────────────────────────────────────────

export async function patchScheduledShift(
  id: string,
  patch: Partial<Pick<ScheduledShift, "startTime" | "endTime" | "label" | "notes" | "isOpen" | "profileId">>,
  detachFromRule = false,
): Promise<ScheduledShift | null> {
  const r = await query(
    `UPDATE scheduled_shifts SET
       start_time  = COALESCE($2::time, start_time),
       end_time    = COALESCE($3::time, end_time),
       label       = COALESCE($4, label),
       notes       = COALESCE($5, notes),
       is_open     = COALESCE($6, is_open),
       profile_id  = COALESCE($7, profile_id),
       rule_id     = CASE WHEN $8 THEN NULL ELSE rule_id END
     WHERE id = $1 RETURNING *`,
    [
      id,
      patch.startTime  ?? null,
      patch.endTime    ?? null,
      patch.label      ?? null,
      patch.notes      ?? null,
      patch.isOpen     ?? null,
      patch.profileId  ?? null,
      detachFromRule,
    ],
  );
  return r.rows[0] ? mapScheduledShift(r.rows[0]) : null;
}

// ── Schedule templates ────────────────────────────────────────────────────────

export async function getScheduleTemplates(): Promise<ScheduleTemplate[]> {
  const r = await query("SELECT * FROM schedule_templates ORDER BY name");
  return r.rows.map((row) => mapScheduleTemplate(row));
}

export async function createScheduleTemplate(input: {
  name: string; description?: string; shifts: TemplateShift[]; createdBy?: string;
}): Promise<ScheduleTemplate> {
  const r = await query(
    "INSERT INTO schedule_templates (name, description, shifts, created_by) VALUES ($1,$2,$3,$4) RETURNING *",
    [input.name, input.description ?? null, JSON.stringify(input.shifts), input.createdBy ?? null],
  );
  return mapScheduleTemplate(r.rows[0]);
}

export async function deleteScheduleTemplate(id: string): Promise<boolean> {
  const r = await query("DELETE FROM schedule_templates WHERE id = $1", [id]);
  return (r.rowCount ?? 0) > 0;
}

// ── My schedule ───────────────────────────────────────────────────────────────

export async function getMySchedule(profileId: string, from: string, to: string): Promise<ScheduledShift[]> {
  const r = await query(
    "SELECT * FROM scheduled_shifts WHERE profile_id = $1 AND shift_date >= $2 AND shift_date <= $3 ORDER BY shift_date, start_time",
    [profileId, from, to],
  );
  return r.rows.map((row) => mapScheduledShift(row));
}

// ── Scheduled shifts ──────────────────────────────────────────────────────────

export async function getScheduledShifts(from: string, to: string): Promise<ScheduledShift[]> {
  const result = await query(
    `select * from scheduled_shifts
     where shift_date >= $1 and shift_date <= $2
     order by shift_date asc, start_time asc`,
    [from, to],
  );
  return result.rows.map((row) => mapScheduledShift(row));
}

export async function createScheduledShift(input: {
  profileId: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  label?: string;
  notes?: string;
  createdBy?: string;
}): Promise<ScheduledShift> {
  const result = await query(
    `insert into scheduled_shifts
       (profile_id, shift_date, start_time, end_time, label, notes, created_by)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning *`,
    [
      input.profileId,
      input.shiftDate,
      input.startTime,
      input.endTime,
      input.label ?? null,
      input.notes ?? null,
      input.createdBy ?? null,
    ],
  );
  return mapScheduledShift(result.rows[0]);
}

export async function deleteScheduledShift(id: string): Promise<boolean> {
  const result = await query("delete from scheduled_shifts where id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function updateScheduledShift(
  id: string,
  patch: Partial<Pick<ScheduledShift, "startTime" | "endTime" | "label" | "notes">>,
): Promise<ScheduledShift | null> {
  const result = await query(
    `update scheduled_shifts
     set start_time = coalesce($2, start_time),
         end_time   = coalesce($3, end_time),
         label      = coalesce($4, label),
         notes      = coalesce($5, notes)
     where id = $1
     returning *`,
    [id, patch.startTime ?? null, patch.endTime ?? null, patch.label ?? null, patch.notes ?? null],
  );
  return result.rows[0] ? mapScheduledShift(result.rows[0]) : null;
}

// ── Company events ────────────────────────────────────────────────────────────

export type CompanyEventType = "party" | "outing" | "social" | "team_building" | "meeting" | "other";

export interface CompanyEvent {
  id: string;
  title: string;
  description?: string;
  eventType: CompanyEventType;
  startDate: string;   // "YYYY-MM-DD"
  endDate?: string;    // "YYYY-MM-DD" or undefined for single-day
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

function mapCompanyEvent(row: Record<string, unknown>): CompanyEvent {
  const toDs = (v: unknown) => v instanceof Date
    ? `${v.getUTCFullYear()}-${String(v.getUTCMonth()+1).padStart(2,"0")}-${String(v.getUTCDate()).padStart(2,"0")}`
    : v ? String(v).slice(0, 10) : undefined;
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string | null) ?? undefined,
    eventType: row.event_type as CompanyEventType,
    startDate: toDs(row.start_date)!,
    endDate: toDs(row.end_date) ?? undefined,
    createdBy: (row.created_by as string | null) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function getCompanyEvents(from: string, to: string): Promise<CompanyEvent[]> {
  const r = await query(
    `SELECT * FROM company_events
     WHERE start_date <= $2 AND COALESCE(end_date, start_date) >= $1
     ORDER BY start_date`,
    [from, to],
  );
  return r.rows.map(mapCompanyEvent);
}

export async function createCompanyEvent(input: {
  title: string; description?: string; eventType: CompanyEventType;
  startDate: string; endDate?: string; createdBy?: string;
}): Promise<CompanyEvent> {
  const r = await query(
    `INSERT INTO company_events (title, description, event_type, start_date, end_date, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [input.title, input.description ?? null, input.eventType, input.startDate, input.endDate ?? null, input.createdBy ?? null],
  );
  return mapCompanyEvent(r.rows[0]);
}

export async function updateCompanyEvent(id: string, patch: Partial<{
  title: string; description: string | null; eventType: CompanyEventType;
  startDate: string; endDate: string | null;
}>): Promise<CompanyEvent | null> {
  const r = await query(
    `UPDATE company_events SET
       title       = COALESCE($2, title),
       description = COALESCE($3, description),
       event_type  = COALESCE($4::text, event_type),
       start_date  = COALESCE($5::date, start_date),
       end_date    = CASE WHEN $6::boolean THEN $7::date ELSE end_date END
     WHERE id = $1 RETURNING *`,
    [id, patch.title ?? null, patch.description ?? null, patch.eventType ?? null,
     patch.startDate ?? null,
     patch.endDate !== undefined,   // $6 — whether to update end_date
     patch.endDate ?? null],        // $7 — the new end_date value (may be null to clear)
  );
  return r.rows[0] ? mapCompanyEvent(r.rows[0]) : null;
}

export async function deleteCompanyEvent(id: string): Promise<boolean> {
  const r = await query("DELETE FROM company_events WHERE id = $1", [id]);
  return (r.rowCount ?? 0) > 0;
}


// ── Audit log ───────────────────────────────────────────────────────────────

export interface AuditEntry {
  actorUserId?: string | null;
  targetUserId?: string | null;
  entityType: string;             // "user" | "team" | "schedule_rule" | "schedule" | "timeclock" | "staffing_rule"
  entityId?: string | null;
  action: string;                 // "create" | "update" | "delete" | "reassign" | ...
  summary: string;                // human-readable one-liner for the viewer
  before?: unknown;
  after?: unknown;
}

/** Best-effort audit write — never throws, so it can't break the action it records. */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await query(
      `insert into audit_logs
         (actor_user_id, target_user_id, entity_type, entity_id, action, summary, before_data, after_data)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)`,
      [
        entry.actorUserId ?? null,
        entry.targetUserId ?? null,
        entry.entityType,
        entry.entityId ?? null,
        entry.action,
        entry.summary,
        entry.before !== undefined ? JSON.stringify(entry.before) : null,
        entry.after !== undefined ? JSON.stringify(entry.after) : null,
      ],
    );
  } catch (err) {
    console.error("[audit] failed to record:", err);
  }
}

export interface AuditRow {
  id: string;
  actorName: string | null;
  targetName: string | null;
  entityType: string;
  action: string;
  summary: string | null;
  createdAt: string;
}

export async function getAuditLogs(limit = 100): Promise<AuditRow[]> {
  const result = await query<{
    id: string; entity_type: string; action: string; summary: string | null; created_at: string;
    actor_first: string | null; actor_last: string | null;
    target_first: string | null; target_last: string | null;
  }>(
    `select a.id, a.entity_type, a.action, a.summary, a.created_at,
            actor.first_name as actor_first, actor.last_name as actor_last,
            target.first_name as target_first, target.last_name as target_last
     from audit_logs a
     left join profiles actor  on actor.id  = a.actor_user_id
     left join profiles target on target.id = a.target_user_id
     order by a.created_at desc
     limit $1`,
    [limit],
  );
  return result.rows.map((r) => ({
    id: r.id,
    actorName:  r.actor_first  ? `${r.actor_first} ${r.actor_last ?? ""}`.trim()   : null,
    targetName: r.target_first ? `${r.target_first} ${r.target_last ?? ""}`.trim() : null,
    entityType: r.entity_type,
    action: r.action,
    summary: r.summary,
    createdAt: r.created_at,
  }));
}

// ── Staffing rules ────────────────────────────────────────────────────────────

export interface StaffingRule {
  id: string;
  name: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  minStaff: number;
  teamId?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

function mapStaffingRule(row: Record<string, unknown>): StaffingRule {
  return {
    id: row.id as string,
    name: row.name as string,
    daysOfWeek: row.days_of_week as unknown as number[],
    startTime: String(row.start_time).slice(0, 5),
    endTime: String(row.end_time).slice(0, 5),
    minStaff: Number(row.min_staff),
    teamId: (row.team_id as string | null) ?? undefined,
    enabled: row.enabled as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function getStaffingRules(): Promise<StaffingRule[]> {
  const r = await query("select * from staffing_rules order by start_time");
  return r.rows.map(mapStaffingRule);
}

export async function createStaffingRule(input: {
  name: string; daysOfWeek: number[]; startTime: string; endTime: string;
  minStaff: number; teamId?: string; createdBy?: string;
}): Promise<StaffingRule> {
  const r = await query(
    `insert into staffing_rules (name, days_of_week, start_time, end_time, min_staff, team_id, created_by)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [input.name, input.daysOfWeek, input.startTime, input.endTime, input.minStaff, input.teamId ?? null, input.createdBy ?? null],
  );
  return mapStaffingRule(r.rows[0]);
}

export async function updateStaffingRule(id: string, patch: Partial<{ enabled: boolean; minStaff: number; name: string }>): Promise<StaffingRule | null> {
  const r = await query(
    `update staffing_rules set
       enabled   = coalesce($2, enabled),
       min_staff = coalesce($3, min_staff),
       name      = coalesce($4, name)
     where id = $1 returning *`,
    [id, patch.enabled ?? null, patch.minStaff ?? null, patch.name ?? null],
  );
  return r.rows[0] ? mapStaffingRule(r.rows[0]) : null;
}

export async function deleteStaffingRule(id: string): Promise<boolean> {
  const r = await query("delete from staffing_rules where id = $1", [id]);
  return (r.rowCount ?? 0) > 0;
}

export interface LateShift {
  scheduledShiftId: string;
  profileId: string;
  firstName: string;
  lastName: string;
  teamId: string | null;
  startTime: string;
  minutesLate: number;
}

/**
 * Scheduled shifts where the person is at least `thresholdMinutes` late, the shift
 * is still ongoing, they never clocked in, and no escalation has fired yet.
 * Bounded to shifts started within the last 6h so historical data can't spam.
 */
export async function getLateShiftsForEscalation(thresholdMinutes: number, scheduleTz: string): Promise<LateShift[]> {
  const result = await query<{
    id: string; profile_id: string; first_name: string; last_name: string;
    team_id: string | null; start_time: string; minutes_late: string;
  }>(
    `SELECT ss.id, ss.profile_id, ss.start_time, p.first_name, p.last_name, p.team_id,
            floor(extract(epoch from (now() - ((ss.shift_date::timestamp + ss.start_time) AT TIME ZONE $2))) / 60) as minutes_late
     FROM scheduled_shifts ss
     JOIN profiles p ON p.id = ss.profile_id
     WHERE p.show_on_dashboard = true
       AND NOT EXISTS (
         SELECT 1 FROM shift_reminders sr
         WHERE sr.scheduled_shift_id = ss.id AND sr.reminder_type = 'late_escalation'
       )
       AND (ss.shift_date::timestamp + ss.start_time) AT TIME ZONE $2
             between now() - interval '6 hours' and now() - make_interval(mins => $1)
       AND CASE WHEN ss.end_time > ss.start_time
                THEN (ss.shift_date::timestamp + ss.end_time) AT TIME ZONE $2
                ELSE ((ss.shift_date::timestamp + interval '1 day') + ss.end_time) AT TIME ZONE $2
           END > now()
       AND NOT EXISTS (
         SELECT 1 FROM shifts sh
         WHERE sh.user_id = ss.profile_id
           AND sh.punch_in_at >= (ss.shift_date::timestamp + ss.start_time) AT TIME ZONE $2 - interval '30 minutes'
       )`,
    [thresholdMinutes, scheduleTz],
  );
  return result.rows.map((r) => ({
    scheduledShiftId: r.id,
    profileId: r.profile_id,
    firstName: r.first_name,
    lastName: r.last_name,
    teamId: r.team_id,
    startTime: String(r.start_time).slice(0, 5),
    minutesLate: Number(r.minutes_late),
  }));
}

export async function recordEscalation(scheduledShiftId: string, profileId: string, channels: string[]): Promise<void> {
  await query(
    `INSERT INTO shift_reminders (scheduled_shift_id, profile_id, reminder_type, channels_sent)
     VALUES ($1, $2, 'late_escalation', $3)
     ON CONFLICT (scheduled_shift_id, reminder_type) DO NOTHING`,
    [scheduledShiftId, profileId, channels],
  );
}

export async function wasCoverageAlerted(date: string, hour: number): Promise<boolean> {
  const r = await query("select 1 from coverage_alerts where shift_date = $1 and hour = $2", [date, hour]);
  return (r.rowCount ?? 0) > 0;
}

export async function recordCoverageAlert(date: string, hour: number): Promise<void> {
  await query(
    "insert into coverage_alerts (shift_date, hour) values ($1, $2) on conflict do nothing",
    [date, hour],
  );
}

/** Managers + admins for a team (for late escalation). Admins always included. */
export async function getEscalationRecipients(teamId?: string | null): Promise<Profile[]> {
  const result = await query(
    `select distinct p.* from profiles p
     where p.status = 'active'
       and (
         p.role = 'admin'
         or (p.role = 'manager' and ($1::uuid is null or p.team_id = $1))
       )`,
    [teamId ?? null],
  );
  return result.rows.map((row) => mapProfile(row));
}
