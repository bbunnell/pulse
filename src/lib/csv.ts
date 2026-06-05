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

export function weeklyRowsToCsv(rows: WeeklyReportRow[]) {
  const csvRows = [
    headers,
    ...rows.map((row) => [
      row.employeeName,
      row.teamName,
      row.date,
      row.punchIn ? formatClock(row.punchIn) : "",
      row.punchOut ? formatClock(row.punchOut) : "",
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
