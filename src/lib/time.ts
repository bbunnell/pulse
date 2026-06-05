import {
  addDays,
  differenceInMinutes,
  endOfDay,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isEqual,
  isWithinInterval,
  parse,
  startOfDay,
  startOfWeek,
} from "date-fns";

import type { Shift, ShiftSegment, TimeOffEntry } from "@/lib/types";

export const appTimeZone = process.env.DEFAULT_TIMEZONE ?? "America/Chicago";

export function minutesBetween(startAt: string, endAt?: string, fallback = new Date()) {
  const start = new Date(startAt);
  const end = endAt ? new Date(endAt) : fallback;
  return Math.max(0, differenceInMinutes(end, start));
}

export function minutesToHours(minutes: number) {
  return Math.round((minutes / 60) * 100) / 100;
}

export function formatDuration(minutes: number) {
  const sign = minutes < 0 ? "-" : "";
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60);
  const mins = absolute % 60;
  return `${sign}${hours}h ${mins.toString().padStart(2, "0")}m`;
}

export function formatShortDate(date: string | Date) {
  return format(new Date(date), "EEE, MMM d");
}

export function formatClock(date?: string | Date) {
  if (!date) return "Missing";
  return format(new Date(date), "h:mm a");
}

export function todayInterval(now = new Date()) {
  return {
    start: startOfDay(now),
    end: endOfDay(now),
  };
}

export function weekInterval(anchor: Date, weekStartsOn: 0 | 1 = 1) {
  return {
    start: startOfWeek(anchor, { weekStartsOn }),
    end: endOfWeek(anchor, { weekStartsOn }),
  };
}

export function isoDateOnly(date: Date | string) {
  return format(new Date(date), "yyyy-MM-dd");
}

export function eachDayInWeek(anchor: Date, weekStartsOn: 0 | 1 = 1) {
  const { start } = weekInterval(anchor, weekStartsOn);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function isSameLocalDate(left: string | Date, right: string | Date) {
  return isoDateOnly(left) === isoDateOnly(right);
}

export function isOnDate(date: Date, startAt: string, endAt: string) {
  const interval = {
    start: startOfDay(new Date(startAt)),
    end: endOfDay(new Date(endAt)),
  };
  return isWithinInterval(date, interval);
}

export function overlapsInterval(
  startAt: string,
  endAt: string | undefined,
  intervalStart: Date,
  intervalEnd: Date,
) {
  const start = new Date(startAt);
  const end = endAt ? new Date(endAt) : intervalEnd;
  return (
    isWithinInterval(start, { start: intervalStart, end: intervalEnd }) ||
    isWithinInterval(end, { start: intervalStart, end: intervalEnd }) ||
    (isBefore(start, intervalStart) && isAfter(end, intervalEnd)) ||
    isEqual(start, intervalStart) ||
    isEqual(end, intervalEnd)
  );
}

export function shiftForDate(shifts: Shift[], userId: string, date: Date) {
  return shifts.find((shift) => shift.userId === userId && isSameLocalDate(shift.punchInAt, date));
}

export function shiftsForDate(shifts: Shift[], userId: string, date: Date) {
  return shifts.filter((shift) => shift.userId === userId && isSameLocalDate(shift.punchInAt, date));
}

export function openShiftForUser(shifts: Shift[], userId: string) {
  return shifts.find((shift) => shift.userId === userId && !shift.punchOutAt);
}

export function activeSegmentForShift(segments: ShiftSegment[], shiftId: string) {
  return segments.find((segment) => segment.shiftId === shiftId && !segment.endAt);
}

export function segmentMinutesForShift(
  segments: ShiftSegment[],
  shiftId: string,
  segmentType: ShiftSegment["segmentType"],
  fallback = new Date(),
) {
  return segments
    .filter((segment) => segment.shiftId === shiftId && segment.segmentType === segmentType)
    .reduce((total, segment) => total + minutesBetween(segment.startAt, segment.endAt, fallback), 0);
}

export function activeTimeOffForDate(timeOff: TimeOffEntry[], userId: string, date: Date) {
  return timeOff.find(
    (entry) =>
      entry.userId === userId &&
      (entry.status === "approved" || entry.status === "submitted") &&
      isOnDate(date, entry.startAt, entry.endAt),
  );
}

export function parseDateInput(value: string) {
  return parse(value, "yyyy-MM-dd", new Date());
}

export function buildDateTime(date: string, time = "00:00") {
  const [hour = "00", minute = "00"] = time.split(":");
  const parsed = parseDateInput(date);
  parsed.setHours(Number(hour), Number(minute), 0, 0);
  return parsed;
}

export function expectedStartForDate(date: Date, expectedStartTime: string) {
  const dateOnly = isoDateOnly(date);
  return buildDateTime(dateOnly, expectedStartTime);
}

export function hasOpenShiftFromPreviousDay(shifts: Shift[], userId: string, now = new Date()) {
  return shifts.some(
    (shift) => shift.userId === userId && !shift.punchOutAt && !isSameLocalDate(shift.punchInAt, now),
  );
}
