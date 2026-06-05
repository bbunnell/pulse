import { createEvent } from "ics";

import type { Profile, TimeOffEntry } from "@/lib/types";
import { profileName } from "@/lib/status";

export async function buildTimeOffIcs(entry: TimeOffEntry, profile: Profile) {
  const title = `${entry.timeOffType === "vacation" ? "Vacation" : "Sick Time"} - ${profileName(profile)}`;
  const start = toIcsDateArray(entry.startAt);
  const end = toIcsDateArray(entry.endAt);

  return new Promise<string>((resolve, reject) => {
    createEvent(
      {
        uid: `${entry.id}@time-attendance.local`,
        title,
        start,
        end,
        productId: "time-attendance-app",
        description: [
          `Type: ${entry.timeOffType}`,
          `Status: ${entry.status}`,
          entry.notes ? `Notes: ${entry.notes}` : "",
          "Reminder: update Outlook out-of-office status as needed.",
        ]
          .filter(Boolean)
          .join("\\n"),
        organizer: {
          name: "Time Attendance",
          email: process.env.EMAIL_FROM?.match(/<(.+)>/)?.[1] ?? "no-reply@example.com",
        },
        status: entry.status === "cancelled" ? "CANCELLED" : "CONFIRMED",
        busyStatus: "OOF",
      },
      (error, value) => {
        if (error || !value) {
          reject(error ?? new Error("ICS generation failed"));
          return;
        }
        resolve(value);
      },
    );
  });
}

export function icsFileName(entry: TimeOffEntry, profile: Profile) {
  const type = entry.timeOffType === "vacation" ? "vacation" : "sick-time";
  return `${type}-${profile.firstName.toLowerCase()}-${profile.lastName.toLowerCase()}.ics`;
}

export function buildClientIcs(entry: TimeOffEntry, profile: Profile) {
  const title = `${entry.timeOffType === "vacation" ? "Vacation" : "Sick Time"} - ${profileName(profile)}`;
  const uid = `${entry.id}@time-attendance.local`;
  const now = formatIcsDate(new Date());
  const start = formatIcsDate(new Date(entry.startAt));
  const end = formatIcsDate(new Date(entry.endAt));

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Time Attendance App//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeIcsText(title)}`,
    `DESCRIPTION:${escapeIcsText(`Type: ${entry.timeOffType}\\nStatus: ${entry.status}`)}`,
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function toIcsDateArray(value: string): [number, number, number, number, number] {
  const date = new Date(value);
  return [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes()];
}

function formatIcsDate(date: Date) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function escapeIcsText(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll(",", "\\,").replaceAll(";", "\\;").replaceAll("\n", "\\n");
}
