/**
 * Standard-schedule staff have no `scheduled_shifts` rows — their working hours live
 * on their profile (`expectedStartTime` / `expectedEndTime` / `standardWorkDays`).
 * Historically that meant the schedule board only showed the handful of `shift_based`
 * people, which is why it used to be called "After-Hours".
 *
 * This module derives display-only shifts for standard staff so the board answers
 * "who is actually scheduled", and groups shifts that genuinely overlap.
 *
 * TIMEZONE: profile times are wall-clock in the EMPLOYEE's own zone (this is how
 * status.ts reads them). The board authors and displays in the org's schedule zone.
 * Everything here is normalised to the schedule zone before grouping, so an 8am
 * Chicago start and an 8am Los Angeles start are correctly treated as different
 * windows rather than collapsed into one card that overstates coverage.
 */
import type { Profile, ScheduledShift, TimeOffEntry } from "@/lib/types";
import { localDateInZone, localTimeInZone, zonedTimeToUtc } from "@/lib/timezone";

/** A scheduled shift plus provenance. Derived rows have no database record. */
export type BoardShift = ScheduledShift & {
  /** True when synthesised from a profile's standard hours rather than a real row. */
  derived?: boolean;
};

/** One card: a distinct start/end window on one date, and everyone in it. */
export interface ShiftGroup {
  key: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  /** True only when every member is derived; a mixed group stays editable. */
  allDerived: boolean;
  shifts: BoardShift[];
}

function addDaysIso(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Day of week (0=Sun) for a date string, read in a fixed zone to avoid host-tz drift. */
function dayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

/** Approved time off covering this date for this user. */
function isOffOn(timeOff: TimeOffEntry[], userId: string, dateStr: string): boolean {
  return timeOff.some(
    (t) =>
      t.userId === userId &&
      t.status !== "cancelled" &&
      dateStr >= t.startAt.slice(0, 10) &&
      dateStr <= t.endAt.slice(0, 10),
  );
}

/**
 * Synthesise shifts for standard-schedule staff across `dates`.
 *
 * People on approved time off are dropped rather than shown struck through: the
 * board's job is to say who is actually working, and a name on a card is a claim
 * that they are.
 */
export function deriveStandardShifts(args: {
  profiles: Profile[];
  timeOff: TimeOffEntry[];
  dates: string[];           // schedule-zone calendar dates to cover
  scheduleTz: string;
}): BoardShift[] {
  const { profiles, timeOff, dates, scheduleTz } = args;
  const out: BoardShift[] = [];

  const standard = profiles.filter(
    (p) => p.workScheduleType === "standard" && p.showOnDashboard !== false,
  );

  for (const p of standard) {
    const empTz = p.timezone || scheduleTz;
    const workDays = p.standardWorkDays?.length ? p.standardWorkDays : [1, 2, 3, 4, 5];
    if (!p.expectedStartTime || !p.expectedEndTime) continue;

    // Walk a day either side so a shift whose schedule-zone date shifts backwards or
    // forwards across midnight still lands in the requested range.
    const candidates = new Set<string>();
    for (const d of dates) {
      candidates.add(addDaysIso(d, -1));
      candidates.add(d);
      candidates.add(addDaysIso(d, 1));
    }

    for (const empDate of candidates) {
      const dow = dayOfWeek(empDate);
      if (!workDays.includes(dow)) continue;

      // A day may override the default window (e.g. 12:00-21:00 on Wed/Thu but
      // 10:00-19:00 otherwise). Absent from the map means "use the default".
      const override  = p.workDayHours?.[String(dow)];
      const dayStart  = override?.start || p.expectedStartTime;
      const dayEnd    = override?.end   || p.expectedEndTime;

      const startUtc = zonedTimeToUtc(empDate, dayStart, empTz);
      // end <= start means the shift runs past midnight in the employee's own day
      const endEmpDate = dayEnd <= dayStart ? addDaysIso(empDate, 1) : empDate;
      const endUtc = zonedTimeToUtc(endEmpDate, dayEnd, empTz);

      const schedDate  = localDateInZone(scheduleTz, startUtc);
      if (!dates.includes(schedDate)) continue;      // outside the visible range
      if (isOffOn(timeOff, p.id, schedDate)) continue;

      const schedStart = localTimeInZone(scheduleTz, startUtc);
      const schedEnd   = localTimeInZone(scheduleTz, endUtc);

      out.push({
        id: `derived:${p.id}:${schedDate}`,
        profileId: p.id,
        shiftDate: schedDate,
        startTime: schedStart,
        endTime: schedEnd,
        isOpen: false,
        createdAt: "",
        updatedAt: "",
        derived: true,
      });
    }
  }

  return out;
}

/**
 * Group a day's shifts into one entry per distinct start/end window.
 * Real and derived shifts that genuinely coincide share a card; a group containing
 * any real shift keeps its editing affordances.
 */
export function groupShiftsByWindow(shifts: BoardShift[]): ShiftGroup[] {
  const byKey = new Map<string, ShiftGroup>();

  for (const s of shifts) {
    const key = `${s.shiftDate}|${s.startTime}|${s.endTime}`;
    let g = byKey.get(key);
    if (!g) {
      g = {
        key,
        shiftDate: s.shiftDate,
        startTime: s.startTime,
        endTime: s.endTime,
        allDerived: true,
        shifts: [],
      };
      byKey.set(key, g);
    }
    g.shifts.push(s);
    if (!s.derived) g.allDerived = false;
  }

  return [...byKey.values()].sort(
    (a, b) => a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime),
  );
}
