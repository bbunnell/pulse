/**
 * Schedule rule engine — converts recurring rule definitions into concrete
 * ScheduledShift records ready for DB insertion.
 */

import type { ScheduleRule, TemplateShift } from "@/lib/types";

// ── Date helpers ──────────────────────────────────────────────────────────────

export function isoDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

/** Monday of the week containing d (handles Sunday = day 0). */
function mondayOf(d: Date): Date {
  const c = new Date(d);
  const dow = c.getDay();
  c.setDate(c.getDate() + (dow === 0 ? -6 : 1 - dow));
  c.setHours(0, 0, 0, 0);
  return c;
}

/**
 * True if `date` falls on an "active" week for the given rule.
 * The reference point is the Monday of `effectiveFrom`.
 * With repeatWeeks=2 every other week from the reference is active.
 */
function isActiveWeek(date: Date, effectiveFrom: Date, repeatWeeks: number): boolean {
  const refMonday  = mondayOf(effectiveFrom);
  const curMonday  = mondayOf(date);
  const daysDiff   = Math.round((curMonday.getTime() - refMonday.getTime()) / 86_400_000);
  const weeksDiff  = daysDiff / 7;
  return weeksDiff >= 0 && weeksDiff % repeatWeeks === 0;
}

// ── Shift record produced by the engine ───────────────────────────────────────

export interface GeneratedShift {
  profileId:  string;
  shiftDate:  string;
  startTime:  string;
  endTime:    string;
  label:      string | null;
  notes:      string | null;
  ruleId:     string;
  createdBy:  string | null;
}

// ── Core generator ────────────────────────────────────────────────────────────

/**
 * Generate concrete shift records for a rule over [fromDate, toDate].
 * Skips dates that already have a shift for this rule (caller de-dups via
 * the ON CONFLICT clause in the INSERT).
 */
export function generateShiftsForRule(
  rule: ScheduleRule,
  fromDate: Date,
  toDate:   Date,
  createdBy: string | null,
): GeneratedShift[] {
  const shifts: GeneratedShift[] = [];
  const effectiveFrom = new Date(rule.effectiveFrom + "T00:00:00");
  const effectiveUntil = rule.effectiveUntil
    ? new Date(rule.effectiveUntil + "T00:00:00")
    : null;

  const start  = fromDate < effectiveFrom ? effectiveFrom : fromDate;
  const end    = effectiveUntil && effectiveUntil < toDate ? effectiveUntil : toDate;

  let current = new Date(start);
  while (current <= end) {
    const dow = current.getDay();
    if (
      rule.daysOfWeek.includes(dow) &&
      isActiveWeek(current, effectiveFrom, rule.repeatWeeks)
    ) {
      shifts.push({
        profileId: rule.profileId,
        shiftDate: isoDateStr(current),
        startTime: rule.startTime,
        endTime:   rule.endTime,
        label:     rule.label ?? null,
        notes:     rule.notes ?? null,
        ruleId:    rule.id,
        createdBy,
      });
    }
    current = addDays(current, 1);
  }
  return shifts;
}

// ── Template application ──────────────────────────────────────────────────────

export interface AppliedTemplateShift {
  profileId: string;
  shiftDate: string;
  startTime: string;
  endTime:   string;
  label:     string | null;
  notes:     string | null;
  createdBy: string | null;
}

/**
 * Apply a template to a target week (identified by any date within it).
 * Returns one shift per template entry, anchored to the Monday of `weekDate`.
 */
export function applyTemplate(
  templateShifts: TemplateShift[],
  weekDate: Date,
  createdBy: string | null,
): AppliedTemplateShift[] {
  const monday = mondayOf(weekDate);
  return templateShifts.map((ts) => {
    // Template dayOfWeek 0=Sun … 6=Sat → offset from Monday
    const offset = ts.dayOfWeek === 0 ? 6 : ts.dayOfWeek - 1; // Mon=0 offset
    const date   = addDays(monday, offset);
    return {
      profileId: ts.profileId,
      shiftDate: isoDateStr(date),
      startTime: ts.startTime,
      endTime:   ts.endTime,
      label:     ts.label ?? null,
      notes:     ts.notes ?? null,
      createdBy,
    };
  });
}

// ── Copy-week helper ──────────────────────────────────────────────────────────

/**
 * Given shifts from a source week, produce copies offset by `weeksForward` weeks.
 * Strips rule_id so copies are standalone.
 */
export function copyWeekShifts(
  sourceShifts: { profileId: string; startTime: string; endTime: string; label?: string; notes?: string; shiftDate: string }[],
  weeksForward: number,
  createdBy: string | null,
): AppliedTemplateShift[] {
  return sourceShifts.map((s) => {
    const d = new Date(s.shiftDate + "T00:00:00");
    d.setDate(d.getDate() + weeksForward * 7);
    return {
      profileId: s.profileId,
      shiftDate: isoDateStr(d),
      startTime: s.startTime,
      endTime:   s.endTime,
      label:     s.label ?? null,
      notes:     s.notes ?? null,
      createdBy,
    };
  });
}
