import type { WeeklyReportRow } from "@/lib/types";
import { formatClock, formatDuration, minutesToHours } from "@/lib/time";

const headers = [
  "Employee",
  "Team",
  "Date",
  "Punch In",
  "Punch Out",
  "Total Worked Hours",
  "Break Hours",
  "Lunch Hours",
  "Net Payable Hours",
  "Vacation Hours",
  "Sick Hours",
  "Missing Punch Warnings",
  "Edited Warnings",
];

/**
 * `scheduleTz` is required in practice: an exported timesheet whose punch times
 * depend on the exporter's device zone is not a payroll record. Two managers in
 * different zones exporting the same week would produce different times for the
 * same shift.
 */
export function weeklyRowsToCsv(rows: WeeklyReportRow[], scheduleTz = "America/Los_Angeles") {
  const csvRows = [
    headers,
    ...rows.map((row) => [
      row.employeeName,
      row.teamName,
      row.date,
      row.punchIn ? formatClock(row.punchIn, scheduleTz) : "",
      row.punchOut ? formatClock(row.punchOut, scheduleTz) : "",
      minutesToHours(row.grossMinutes).toFixed(2),
      minutesToHours(row.breakMinutes).toFixed(2),
      minutesToHours(row.lunchMinutes).toFixed(2),
      minutesToHours(row.payableMinutes).toFixed(2),
      row.vacationHours.toFixed(2),
      row.sickHours.toFixed(2),
      row.missingPunchWarnings.join("; "),
      row.editedWarnings.join("; "),
    ]),
  ];

  return csvRows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
}

function escapeCsvValue(value: string) {
  if (!/[",\n]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

export function reportFileName(week: string) {
  return `weekly-time-report-${week}.csv`;
}

export function reportSummary(rows: WeeklyReportRow[]) {
  return rows
    .filter((row) => row.payableMinutes || row.vacationHours || row.sickHours || row.missingPunchWarnings.length)
    .map(
      (row) =>
        `${row.employeeName} ${row.date}: ${formatDuration(row.payableMinutes)} payable, ${row.vacationHours} vacation, ${row.sickHours} sick`,
    );
}
