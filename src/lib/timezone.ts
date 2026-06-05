/**
 * Timezone utilities for cross-timezone schedule display.
 *
 * Shift times are stored as naive local times in the employee's timezone
 * (e.g. "21:00" means 9pm Manila time for a Manila-based employee).
 * These functions convert them to the viewer's timezone for display.
 */

/** All IANA timezones offered in the UI, grouped by region. */
export const TIMEZONE_OPTIONS: { label: string; value: string }[] = [
  { label: "Philippine Standard Time (PHT, UTC+8)",    value: "Asia/Manila" },
  { label: "Central Time (CT, UTC-5/6)",               value: "America/Chicago" },
  { label: "Eastern Time (ET, UTC-4/5)",               value: "America/New_York" },
  { label: "Mountain Time (MT, UTC-6/7)",              value: "America/Denver" },
  { label: "Pacific Time (PT, UTC-7/8)",               value: "America/Los_Angeles" },
  { label: "UTC (Coordinated Universal Time)",         value: "UTC" },
  { label: "GMT (Greenwich Mean Time)",                value: "Europe/London" },
  { label: "Central European Time (CET, UTC+1/2)",     value: "Europe/Berlin" },
  { label: "India Standard Time (IST, UTC+5:30)",      value: "Asia/Kolkata" },
  { label: "Singapore / Malaysia (SGT, UTC+8)",        value: "Asia/Singapore" },
  { label: "Japan Standard Time (JST, UTC+9)",         value: "Asia/Tokyo" },
  { label: "Australian Eastern Time (AEST, UTC+10/11)", value: "Australia/Sydney" },
];

/** Short abbreviation for a timezone at the current moment, e.g. "PHT", "CDT". */
export function tzAbbr(tz: string): string {
  try {
    return (
      new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
        .formatToParts(new Date())
        .find((p) => p.type === "timeZoneName")?.value ?? tz
    );
  } catch {
    return tz;
  }
}

/**
 * Given a naive "local time in empTz", return how that moment appears in viewerTz.
 *
 * Returns null if:
 *  - empTz === viewerTz (no conversion needed)
 *  - either timezone string is invalid
 *
 * Uses the Intl formatToParts offset-probe technique — no library required,
 * handles DST correctly for US timezones.
 */
export function convertShiftTime(
  shiftDate: string,  // "2026-06-07"
  shiftTime: string,  // "21:00"
  empTz: string,      // "Asia/Manila"
  viewerTz: string,   // "America/Chicago"
): { time: string; dayOffset: number; abbr: string } | null {
  if (!empTz || !viewerTz || empTz === viewerTz) return null;

  try {
    const [y, mo, d] = shiftDate.split("-").map(Number);
    const [h, m]     = shiftTime.split(":").map(Number);

    // Step 1: treat the shift time as UTC momentarily (probe)
    const probe = new Date(Date.UTC(y, mo - 1, d, h, m, 0));

    // Step 2: find the UTC offset for empTz at this probe time
    const empOffset = getOffsetMinutes(probe, empTz);

    // Step 3: actual UTC moment = probe - empOffset
    const utcMs  = probe.getTime() - empOffset * 60_000;
    const utcDate = new Date(utcMs);

    // Step 4: format in viewer's timezone
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: viewerTz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "numeric", minute: "2-digit",
      hour12: true,
    }).formatToParts(utcDate);

    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const hour   = get("hour");
    const minute = get("minute");
    const ampm   = get("dayPeriod").toLowerCase();
    const time   = minute === "00" ? `${hour}${ampm}` : `${hour}:${minute}${ampm}`;

    // Day offset: 0 = same day, +1 = next day, -1 = previous day (rare)
    const viewerDay = Number(get("day"));
    const dayOffset  = viewerDay - d; // simplified; edge cases around month boundaries

    return { time, dayOffset, abbr: tzAbbr(viewerTz) };
  } catch {
    return null;
  }
}

/**
 * Convert a naive wall-clock time in `tz` to an absolute UTC Date.
 * e.g. zonedTimeToUtc("2026-06-03", "21:00", "Asia/Manila") → the instant
 * that is 9:00 PM in Manila on that date. DST-correct.
 */
export function zonedTimeToUtc(dateStr: string, timeStr: string, tz: string): Date {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, m]     = timeStr.split(":").map(Number);
  // Probe: treat the wall-clock as if it were UTC, then subtract the zone offset.
  const probe   = new Date(Date.UTC(y, mo - 1, d, h || 0, m || 0, 0));
  const offset  = getOffsetMinutes(probe, tz);
  return new Date(probe.getTime() - offset * 60_000);
}

/** The local calendar date ("YYYY-MM-DD") in `tz` at instant `now`. */
export function localDateInZone(tz: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}

/** Wall-clock "HH:MM" in `tz` at instant `now`. */
export function localTimeInZone(tz: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${g("hour")}:${g("minute")}`;
}

/** UTC offset in minutes for an IANA timezone at a specific Date (handles DST). */
function getOffsetMinutes(date: Date, tz: string): number {
  const toMs = (d: Date, timezone: string) => {
    const p = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const g = (type: string) => Number(p.find((x) => x.type === type)?.value ?? 0);
    return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  };
  return (toMs(date, tz) - toMs(date, "UTC")) / 60_000;
}
