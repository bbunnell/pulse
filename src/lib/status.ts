import type {
  AttendanceSnapshot,
  AttendanceStatus,
  CoverageSummary,
  Profile,
  ScheduledShift,
  Shift,
  ShiftSegment,
  Team,
  TimeOffEntry,
} from "@/lib/types";
import {
  activeSegmentForShift,
  activeTimeOffForDate,
  minutesBetween,
  openShiftForUser,
  segmentMinutesForShift,
} from "@/lib/time";
import { localDateInZone, zonedTimeToUtc } from "@/lib/timezone";

export const statusLabels: Record<AttendanceStatus, string> = {
  available: "Available",
  on_break: "On Break",
  at_lunch: "At Lunch",
  not_punched_in: "Not Punched In",
  punched_out: "Punched Out",
  out_sick: "Out Sick",
  on_vacation: "On Vacation",
};

export const statusTone: Record<AttendanceStatus, "green" | "amber" | "red" | "blue" | "gray"> = {
  available: "green",
  on_break: "amber",
  at_lunch: "amber",
  not_punched_in: "gray",
  punched_out: "gray",
  out_sick: "red",
  on_vacation: "blue",
};

/** Minutes past scheduled start before someone counts as "late". Matches the reminder offset. */
export const LATE_GRACE_MINUTES = 5;
/** Open shift longer than this is almost certainly a forgotten punch-out. */
export const FORGOT_PUNCH_HOURS = 16;

export function profileName(profile: Profile) {
  return `${profile.firstName} ${profile.lastName}`;
}

// ── Scheduled-shift time windows (absolute instants, per employee tz) ─────────

interface ScheduledWindow {
  shift: ScheduledShift;
  start: Date;
  end: Date;
}

function nextDateStr(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Resolve a scheduled shift to its absolute [start, end) instants in the employee's tz. */
function windowFor(shift: ScheduledShift, tz: string): ScheduledWindow {
  const start = zonedTimeToUtc(shift.shiftDate, shift.startTime, tz);
  const overnight = shift.endTime <= shift.startTime;
  const end = overnight
    ? zonedTimeToUtc(nextDateStr(shift.shiftDate), shift.endTime, tz)
    : zonedTimeToUtc(shift.shiftDate, shift.endTime, tz);
  return { shift, start, end };
}

function windowsForProfile(profileId: string, scheduled: ScheduledShift[], tz: string): ScheduledWindow[] {
  return scheduled
    .filter((s) => s.profileId === profileId)
    .map((s) => windowFor(s, tz));
}

// ── Status ────────────────────────────────────────────────────────────────────

export function attendanceStatusFromState(
  profile: Profile,
  shifts: Shift[],
  segments: ShiftSegment[],
  timeOff: TimeOffEntry[],
  now = new Date(),
): AttendanceStatus {
  // Active shift takes priority — a clocked-in person is always shown as working
  const activeShift = openShiftForUser(shifts, profile.id);
  if (activeShift) {
    const activeSegment = activeSegmentForShift(segments, activeShift.id);
    if (activeSegment?.segmentType === "break") return "on_break";
    if (activeSegment?.segmentType === "lunch") return "at_lunch";
    return "available";
  }

  const timeOffToday = activeTimeOffForDate(timeOff, profile.id, now);
  if (timeOffToday?.timeOffType === "sick") return "out_sick";
  if (timeOffToday?.timeOffType === "vacation") return "on_vacation";

  // Did they work earlier in their local day and punch out?
  const todayShift = shiftForLocalToday(shifts, profile.id, profile.timezone, now);
  return todayShift?.punchOutAt ? "punched_out" : "not_punched_in";
}

/** Shift that started during the employee's local "today" (timezone-aware). */
function shiftForLocalToday(shifts: Shift[], userId: string, tz: string, now: Date): Shift | undefined {
  const todayStr = localDateInZone(tz, now);
  return shifts.find(
    (s) => s.userId === userId && localDateInZone(tz, new Date(s.punchInAt)) === todayStr,
  );
}

// ── Snapshot builder ───────────────────────────────────────────────────────────

export function buildAttendanceSnapshots(args: {
  profiles: Profile[];
  teams: Team[];
  shifts: Shift[];
  segments: ShiftSegment[];
  timeOff: TimeOffEntry[];
  scheduledShifts?: ScheduledShift[];
  /** The timezone shift times are authored/stored in (e.g. Pacific). Anchors all schedule math. */
  scheduleTz?: string;
  now?: Date;
}): AttendanceSnapshot[] {
  const now = args.now ?? new Date();
  const scheduled = args.scheduledShifts ?? [];
  const scheduleTz = args.scheduleTz ?? "America/Los_Angeles";

  return args.profiles.map<AttendanceSnapshot>((profile) => {
    const tz = profile.timezone ?? "America/Chicago";  // employee's own tz (for "today" of their punch shifts)
    const activeShift = openShiftForUser(args.shifts, profile.id);
    const todayShift = shiftForLocalToday(args.shifts, profile.id, tz, now);
    const activeSegment = activeShift ? activeSegmentForShift(args.segments, activeShift.id) : undefined;
    const shiftForTotals = todayShift ?? activeShift;
    const todayBreakMinutes = shiftForTotals
      ? segmentMinutesForShift(args.segments, shiftForTotals.id, "break", now)
      : 0;
    const todayLunchMinutes = shiftForTotals
      ? segmentMinutesForShift(args.segments, shiftForTotals.id, "lunch", now)
      : 0;

    // ── Schedule integration (anchored to the schedule reference tz, NOT employee tz) ──
    const windows = windowsForProfile(profile.id, scheduled, scheduleTz);
    const todayStr = localDateInZone(scheduleTz, now);
    let scheduledToday = windows.some(
      (w) => w.shift.shiftDate === todayStr || (w.start <= now && now < w.end),
    );
    const activeWindow = windows.find((w) => w.start <= now && now < w.end);
    let isScheduledNow = Boolean(activeWindow);

    // Also treat employees within their configured work hours as "scheduled now",
    // regardless of whether they have an explicit shift record.
    if (!isScheduledNow && profile.expectedStartTime && profile.expectedEndTime) {
      const workDays = profile.standardWorkDays ?? [1, 2, 3, 4, 5];
      const empTodayStr = localDateInZone(tz, now);
      // noon UTC on that date — safe proxy for day-of-week across all tz offsets
      const empDow = new Date(empTodayStr + "T12:00:00Z").getDay();
      if (workDays.includes(empDow)) {
        const workStart = zonedTimeToUtc(empTodayStr, profile.expectedStartTime, tz);
        const workEnd   = zonedTimeToUtc(empTodayStr, profile.expectedEndTime, tz);
        if (now >= workStart && now < workEnd) {
          isScheduledNow = true;
          scheduledToday = true;
        }
      }
    }

    const clockedInMinutes = activeShift
      ? minutesBetween(activeShift.punchInAt, undefined, now)
      : 0;

    // Late: scheduled now, not clocked in, past the grace period
    let minutesLate = 0;
    if (activeWindow && !activeShift) {
      minutesLate = Math.max(0, Math.floor((now.getTime() - activeWindow.start.getTime()) / 60_000));
    }
    let isLate = minutesLate >= LATE_GRACE_MINUTES;

    // ── Standard work schedule (e.g. Mon-Fri office staff) ────────────────────
    // These people are never "Off Today" — they just work regular hours.
    // On their work days, treat them as implicitly scheduled and check lateness
    // against their expectedStartTime rather than an explicit shift window.
    if (profile.workScheduleType === "standard" && !activeWindow) {
      const workDays = profile.standardWorkDays ?? [1, 2, 3, 4, 5];
      // Use employee's own timezone to determine their day of week
      const empTodayStr = localDateInZone(tz, now);
      const empDow = new Date(empTodayStr + "T12:00:00").getDay();

      if (workDays.includes(empDow)) {
        scheduledToday = true;

        if (!activeShift) {
          // Late if past their expectedStartTime + grace
          const [h, m] = (profile.expectedStartTime ?? "08:30").split(":").map(Number);
          const expectedStart = zonedTimeToUtc(
            empTodayStr,
            `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
            tz,
          );
          if (now > expectedStart) {
            minutesLate = Math.max(0, Math.floor((now.getTime() - expectedStart.getTime()) / 60_000));
            isLate = minutesLate >= LATE_GRACE_MINUTES;
          }
        }
      }
      // If not a work day, leave scheduledToday as false — the dashboard will
      // suppress them from "Off Today" based on workScheduleType.
    }

    // Overtime: still clocked in past the scheduled end of the shift they punched into.
    // "Owning" window = the scheduled window whose start is nearest to (within 3h before/after) punch-in.
    let overtimeMinutes = 0;
    if (activeShift) {
      const punchInMs = new Date(activeShift.punchInAt).getTime();
      const owning = windows
        .filter((w) => Math.abs(w.start.getTime() - punchInMs) <= 3 * 3600_000)
        .sort((a, b) => Math.abs(a.start.getTime() - punchInMs) - Math.abs(b.start.getTime() - punchInMs))[0];
      if (owning && owning.end < now) {
        overtimeMinutes = Math.floor((now.getTime() - owning.end.getTime()) / 60_000);
      }
    }

    const likelyForgotPunchOut = Boolean(activeShift) && clockedInMinutes > FORGOT_PUNCH_HOURS * 60;

    const timeOffToday = activeTimeOffForDate(args.timeOff, profile.id, now);

    // Missing punch = scheduled now & not clocked in past grace, OR a stale overnight shift.
    const missingPunch = (isLate && !timeOffToday) || likelyForgotPunchOut;

    return {
      profile,
      team: args.teams.find((team) => team.id === profile.teamId),
      status: attendanceStatusFromState(profile, args.shifts, args.segments, args.timeOff, now),
      activeShift,
      activeSegment,
      todayShift,
      todayBreakMinutes,
      todayLunchMinutes,
      missingPunch,
      timeOffToday,
      scheduledNow: activeWindow?.shift,
      isScheduledNow,
      minutesLate,
      isLate,
      scheduledToday,
      clockedInMinutes,
      likelyForgotPunchOut,
      overtimeMinutes,
    };
  });
}

/** Minimal staffing-rule shape for coverage evaluation. */
export interface StaffingRuleLike {
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  minStaff: number;
  enabled: boolean;
}

/**
 * Count of people scheduled during each hour (0–23) of `dateStr` in org tz.
 * Accounts for per-employee timezone and overnight shifts.
 */
export function coverageCounts(
  scheduled: ScheduledShift[],
  _profiles: Profile[],
  scheduleTz: string,
  dateStr: string,
): number[] {
  const covered = new Array<number>(24).fill(0);
  for (const s of scheduled) {
    const start = zonedTimeToUtc(s.shiftDate, s.startTime, scheduleTz);
    const overnight = s.endTime <= s.startTime;
    const end = overnight
      ? zonedTimeToUtc(nextDateStr(s.shiftDate), s.endTime, scheduleTz)
      : zonedTimeToUtc(s.shiftDate, s.endTime, scheduleTz);
    for (let h = 0; h < 24; h++) {
      const hourStart = zonedTimeToUtc(dateStr, `${String(h).padStart(2, "0")}:00`, scheduleTz);
      const hourEnd = new Date(hourStart.getTime() + 3600_000);
      if (start < hourEnd && end > hourStart) covered[h]++;
    }
  }
  return covered;
}

/**
 * Required staff for each hour (0–23) of `dateStr` in org tz, given staffing rules.
 * A rule with startTime === endTime is treated as all-day (24h).
 */
export function requiredStaffPerHour(dateStr: string, rules: StaffingRuleLike[]): number[] {
  const dow = new Date(dateStr + "T00:00:00Z").getUTCDay();
  const required = new Array<number>(24).fill(0);
  for (const rule of rules) {
    if (!rule.enabled || !rule.daysOfWeek.includes(dow)) continue;
    const startH = parseInt(rule.startTime.split(":")[0], 10);
    const endH   = parseInt(rule.endTime.split(":")[0], 10);
    const allDay = rule.startTime === rule.endTime;
    for (let h = 0; h < 24; h++) {
      const inWindow = allDay
        ? true
        : startH < endH
          ? h >= startH && h < endH
          : h >= startH || h < endH; // overnight window
      if (inWindow) required[h] = Math.max(required[h], rule.minStaff);
    }
  }
  return required;
}

// ── Coverage summary (org-wide "who's on now" + gaps) ──────────────────────────

export function buildCoverage(
  snapshots: AttendanceSnapshot[],
  scheduledArg: ScheduledShift[] | undefined,
  profiles: Profile[],
  orgTz: string,
  now = new Date(),
  staffingRules: StaffingRuleLike[] = [],
): CoverageSummary {
  const scheduled = scheduledArg ?? [];
  const scheduledNow = snapshots.filter((s) => s.isScheduledNow);
  const onlineNow = scheduledNow.filter(
    (s) => s.status === "available" || s.status === "on_break" || s.status === "at_lunch",
  );
  const absentNow = scheduledNow.filter((s) => !onlineNow.includes(s));

  // Coverage gaps across today's 24 hours (org reference timezone)
  const todayStr = localDateInZone(orgTz, now);
  const covered = coverageCounts(scheduled, profiles, orgTz, todayStr);

  const gapHours = covered.map((c, h) => (c === 0 ? h : -1)).filter((h) => h >= 0);

  // Understaffed = PARTIALLY covered but below the required minimum.
  // (Zero-coverage hours are already reported as gaps, so exclude them here.)
  const required = requiredStaffPerHour(todayStr, staffingRules);
  const understaffed = covered
    .map((c, h) => ({ hour: h, required: required[h], scheduled: c }))
    .filter((x) => x.required > 0 && x.scheduled > 0 && x.scheduled < x.required);

  return { scheduledNow, onlineNow, absentNow, gapHours, understaffed };
}

// ── Summary stats ──────────────────────────────────────────────────────────────

export function buildSummary(snapshots: AttendanceSnapshot[]) {
  return {
    total: snapshots.length,
    working: snapshots.filter((s) => ["available", "on_break", "at_lunch"].includes(s.status)).length,
    available: snapshots.filter((s) => s.status === "available").length,
    onBreakOrLunch: snapshots.filter((s) => ["on_break", "at_lunch"].includes(s.status)).length,
    out: snapshots.filter((s) => ["out_sick", "on_vacation"].includes(s.status)).length,
    scheduledNow: snapshots.filter((s) => s.isScheduledNow).length,
    late: snapshots.filter((s) => s.isLate).length,
    missingPunches: snapshots.filter((s) => s.missingPunch).length,
  };
}
