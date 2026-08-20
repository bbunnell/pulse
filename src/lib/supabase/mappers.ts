import type { Profile, ReminderRule, ScheduleRule, ScheduleTemplate, ScheduledShift, Shift, ShiftSegment, Team, TemplateShift, TimeOffEntry } from "@/lib/types";

type DbRow = Record<string, string | number | boolean | null | undefined>;

/**
 * Coerce a PostgreSQL `timestamptz` to an ISO string.
 *
 * pg hands back Date objects, but every consumer treats these fields as strings
 * because that is what the types declare — and after a JSON round-trip they ARE
 * strings. So the same field was a Date on the server-rendered pass and a string
 * after the first poll. That mismatch crashed the dashboard
 * (`startAt.localeCompare is not a function`) and is invisible to typecheck,
 * because the type says string and only the runtime disagrees.
 *
 * Normalising here makes the declared type true everywhere.
 */
function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return v as string;
}

/** Nullable timestamp → ISO string, or undefined. */
function toIsoOpt(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  return toIso(v);
}

/**
 * Convert a PostgreSQL `date` column to "YYYY-MM-DD".
 * pg returns date columns as JavaScript Date objects (midnight UTC);
 * using UTC accessors avoids timezone-offset shifts.
 */
function toIsoDateStr(val: unknown): string | undefined {
  if (!val) return undefined;
  if (val instanceof Date) {
    const y = val.getUTCFullYear();
    const m = String(val.getUTCMonth() + 1).padStart(2, "0");
    const d = String(val.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(val).slice(0, 10);
  return s.length === 10 ? s : undefined;
}

/** Extract "MM-DD" from a DATE column value (year is intentionally discarded for birthdays). */
function toMonthDay(val: unknown): string | undefined {
  const full = toIsoDateStr(val);
  if (!full) return undefined;
  return full.slice(5, 10); // "YYYY-MM-DD" → "MM-DD"
}

export function mapProfile(row: DbRow): Profile {
  return {
    id: row.id as string,
    authUserId: row.auth_user_id as string,
    firstName: row.first_name as string,
    lastName: row.last_name as string,
    email: row.email as string,
    role: row.role as Profile["role"],
    teamId: row.team_id as string,
    status: row.status as Profile["status"],
    expectedStartTime: ((row.expected_start_time as string) ?? "08:30").slice(0, 5),
    expectedEndTime:   ((row.expected_end_time   as string) ?? "17:00").slice(0, 5),
    timezone:        (row.timezone as string) ?? "America/Chicago",
    showOnDashboard:   (row.show_on_dashboard as boolean) ?? true,
    workScheduleType:  (row.work_schedule_type as "standard" | "shift_based") ?? "shift_based",
    standardWorkDays:  (row.standard_work_days as unknown as number[]) ?? [1,2,3,4,5],
    workDayHours:      (row.work_day_hours as unknown as Record<string,{start:string;end:string}>) ?? {},
    hideWhenNotActive: (row.hide_when_not_active as boolean) ?? false,
    birthday:        toMonthDay(row.birthday),
    workAnniversary: toIsoDateStr(row.work_anniversary),
    lastLoginAt:     toIsoOpt(row.last_login_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function mapTeam(row: DbRow): Team {
  return {
    id: row.id as string,
    name: row.name as string,
    managerId: row.manager_id as string | undefined,
    defaultWorkDays:  (row.default_work_days as unknown as number[]) ?? [1,2,3,4,5],
    defaultStartTime: ((row.default_start_time as string) ?? "09:00").slice(0, 5),
    defaultEndTime:   ((row.default_end_time   as string) ?? "17:00").slice(0, 5),
    defaultTimezone:  (row.default_timezone as string) ?? "America/Chicago",
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function mapShift(row: DbRow): Shift {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    punchInAt: toIso(row.punch_in_at),
    punchOutAt: toIsoOpt(row.punch_out_at),
    status: row.status as Shift["status"],
    notes: (row.notes as string | null) ?? undefined,
    editedBy: (row.edited_by as string | null) ?? undefined,
    editedAt: toIsoOpt(row.edited_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function mapSegment(row: DbRow): ShiftSegment {
  return {
    id: row.id as string,
    shiftId: row.shift_id as string,
    userId: row.user_id as string,
    segmentType: row.segment_type as ShiftSegment["segmentType"],
    startAt: toIso(row.start_at),
    endAt: toIsoOpt(row.end_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function mapReminderRule(row: DbRow): ReminderRule {
  return {
    id: row.id as string,
    reminderType: row.reminder_type as ReminderRule["reminderType"],
    enabled: row.enabled as boolean,
    sendTime: row.send_time as string,
    timezone: row.timezone as string,
    teamId: (row.team_id as string | null) ?? undefined,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function mapTimeOff(row: DbRow): TimeOffEntry {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    timeOffType: row.time_off_type as TimeOffEntry["timeOffType"],
    startAt: toIso(row.start_at),
    endAt: toIso(row.end_at),
    fullDay: row.full_day as boolean,
    hours: Number(row.hours),
    status: row.status as TimeOffEntry["status"],
    notes: (row.notes as string | null) ?? undefined,
    approvedBy: (row.approved_by as string | null) ?? undefined,
    approvedAt: toIsoOpt(row.approved_at),
    source: (row.source as string | null) ?? "manual",
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function mapScheduledShift(row: DbRow): ScheduledShift {
  // pg returns TIME as "HH:MM:SS" string — trim to "HH:MM"
  const trimTime = (t: unknown) => String(t).slice(0, 5);

  const shiftDate = toIsoDateStr(row.shift_date) ?? String(row.shift_date).slice(0, 10);

  return {
    id: row.id as string,
    profileId: row.profile_id as string,
    shiftDate,
    startTime: trimTime(row.start_time),
    endTime: trimTime(row.end_time),
    label: (row.label as string | null) ?? undefined,
    notes: (row.notes as string | null) ?? undefined,
    ruleId:    (row.rule_id   as string | null) ?? undefined,
    isOpen:    (row.is_open   as boolean)        ?? false,
    createdBy: (row.created_by as string | null) ?? undefined,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function mapScheduleRule(row: DbRow): ScheduleRule {
  return {
    id:             row.id as string,
    profileId:      row.profile_id as string,
    startTime:      String(row.start_time).slice(0, 5),
    endTime:        String(row.end_time).slice(0, 5),
    label:          (row.label as string | null) ?? undefined,
    notes:          (row.notes as string | null) ?? undefined,
    daysOfWeek:     row.days_of_week as unknown as number[],
    repeatWeeks:    row.repeat_weeks as 1 | 2 | 4,
    effectiveFrom:  toIsoDateStr(row.effective_from) ?? String(row.effective_from).slice(0, 10),
    effectiveUntil: toIsoDateStr(row.effective_until),
    createdBy:  (row.created_by as string | null) ?? undefined,
    createdAt:   toIso(row.created_at),
    updatedAt:   toIso(row.updated_at),
  };
}

export function mapScheduleTemplate(row: DbRow): ScheduleTemplate {
  return {
    id:          row.id as string,
    name:        row.name as string,
    description: (row.description as string | null) ?? undefined,
    shifts:      (row.shifts as unknown as TemplateShift[]) ?? [],
    createdBy:   (row.created_by as string | null) ?? undefined,
    createdAt:   toIso(row.created_at),
    updatedAt:   toIso(row.updated_at),
  };
}
