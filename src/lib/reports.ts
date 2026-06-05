import { isAfter, isBefore, max, min, startOfDay } from "date-fns";

import type {
  OrgData,
  Profile,
  Shift,
  ShiftSegment,
  Team,
  TimeOffEntry,
  WeeklyEmployeeTotal,
  WeeklyReportRow,
} from "@/lib/types";
import {
  eachDayInWeek,
  expectedStartForDate,
  formatDuration,
  isOnDate,
  isSameLocalDate,
  isoDateOnly,
  minutesBetween,
  segmentMinutesForShift,
} from "@/lib/time";
import { profileName } from "@/lib/status";

export function buildWeeklyReport(
  data: Pick<OrgData, "profiles" | "teams" | "shifts" | "segments" | "timeOff">,
  weekAnchor: Date,
  now = new Date(),
) {
  const rows = data.profiles.flatMap((profile) =>
    eachDayInWeek(weekAnchor).map((date) =>
      buildDailyReportRow(profile, data.teams, data.shifts, data.segments, data.timeOff, date, now),
    ),
  );

  const totals = data.profiles.map<WeeklyEmployeeTotal>((profile) => {
    const employeeRows = rows.filter((row) => row.employeeId === profile.id);
    const team = data.teams.find((item) => item.id === profile.teamId);

    return {
      employeeId: profile.id,
      employeeName: profileName(profile),
      teamName: team?.name ?? "Unassigned",
      payableMinutes: employeeRows.reduce((total, row) => total + row.payableMinutes, 0),
      vacationHours: employeeRows.reduce((total, row) => total + row.vacationHours, 0),
      sickHours: employeeRows.reduce((total, row) => total + row.sickHours, 0),
      warnings: employeeRows.reduce(
        (total, row) => total + row.missingPunchWarnings.length + row.editedWarnings.length,
        0,
      ),
    };
  });

  return {
    rows,
    totals,
  };
}

export function buildDailyReportRow(
  profile: Profile,
  teams: Team[],
  shifts: Shift[],
  segments: ShiftSegment[],
  timeOff: TimeOffEntry[],
  date: Date,
  now = new Date(),
): WeeklyReportRow {
  const dayShifts = shifts.filter((shift) => shift.userId === profile.id && isSameLocalDate(shift.punchInAt, date));
  const team = teams.find((item) => item.id === profile.teamId);
  const grossMinutes = dayShifts.reduce(
    (total, shift) => total + minutesBetween(shift.punchInAt, shift.punchOutAt, now),
    0,
  );
  const breakMinutes = dayShifts.reduce(
    (total, shift) => total + segmentMinutesForShift(segments, shift.id, "break", now),
    0,
  );
  const lunchMinutes = dayShifts.reduce(
    (total, shift) => total + segmentMinutesForShift(segments, shift.id, "lunch", now),
    0,
  );
  const dayTimeOff = timeOff.filter(
    (entry) =>
      entry.userId === profile.id &&
      (entry.status === "approved" || entry.status === "submitted") &&
      isOnDate(date, entry.startAt, entry.endAt),
  );
  const missingPunchWarnings = buildMissingPunchWarnings(profile, dayShifts, dayTimeOff, date, now);
  const editedWarnings = dayShifts
    .filter((shift) => shift.editedAt)
    .map((shift) => `Edited ${formatDuration(minutesBetween(shift.editedAt ?? shift.updatedAt, shift.updatedAt))} after entry`);

  return {
    employeeId: profile.id,
    employeeName: profileName(profile),
    teamName: team?.name ?? "Unassigned",
    date: isoDateOnly(date),
    punchIn: dayShifts.length ? min(dayShifts.map((shift) => new Date(shift.punchInAt))).toISOString() : undefined,
    punchOut:
      dayShifts.length && dayShifts.every((shift) => shift.punchOutAt)
        ? max(dayShifts.map((shift) => new Date(shift.punchOutAt as string))).toISOString()
        : undefined,
    grossMinutes,
    breakMinutes,
    lunchMinutes,
    payableMinutes: Math.max(0, grossMinutes - breakMinutes - lunchMinutes),
    vacationHours: dayTimeOff
      .filter((entry) => entry.timeOffType === "vacation")
      .reduce((total, entry) => total + hoursForEntryOnDate(entry), 0),
    sickHours: dayTimeOff
      .filter((entry) => entry.timeOffType === "sick")
      .reduce((total, entry) => total + hoursForEntryOnDate(entry), 0),
    missingPunchWarnings,
    editedWarnings,
  };
}

function buildMissingPunchWarnings(
  profile: Profile,
  dayShifts: Shift[],
  dayTimeOff: TimeOffEntry[],
  date: Date,
  now: Date,
) {
  const warnings: string[] = [];
  const isPastDay = isBefore(startOfDay(date), startOfDay(now));
  const isTodayPastStart = isSameLocalDate(date, now) && isAfter(now, expectedStartForDate(date, profile.expectedStartTime));

  if (dayTimeOff.length === 0 && dayShifts.length === 0 && (isPastDay || isTodayPastStart)) {
    warnings.push("No punch in by expected start");
  }

  for (const shift of dayShifts) {
    if (!shift.punchOutAt) warnings.push("Missing punch out");
  }

  return warnings;
}

function hoursForEntryOnDate(entry: TimeOffEntry) {
  return entry.fullDay ? Math.min(entry.hours, 8) : entry.hours;
}
