"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays, addWeeks, format, isToday, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { OrgData } from "@/lib/types";
import type { CompanyEvent } from "@/lib/db-store";
import { profileName } from "@/lib/status";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type EntryKind = "vacation" | "sick" | "birthday" | "anniversary" | "company";

interface Entry {
  id: string;
  kind: EntryKind;
  label: string;
  start: Date;
  end: Date;
}

function projectDate(isoDate: string, year: number): Date {
  const parts = isoDate.split("-");
  const mm = parts.length === 2 ? parts[0] : parts[1];
  const dd = parts.length === 2 ? parts[1] : parts[2];
  return new Date(year, Number(mm) - 1, Number(dd));
}

function yearsAgo(isoDate: string, year: number): number {
  return year - Number(isoDate.split("-")[0]);
}

function sod(d: Date) { const c = new Date(d); c.setHours(0,0,0,0); return c; }
function eod(d: Date) { const c = new Date(d); c.setHours(23,59,59,999); return c; }

function entriesOnDay(day: Date, entries: Entry[]): Entry[] {
  const s = sod(day); const e = eod(day);
  return entries.filter(en => en.start <= e && en.end >= s);
}

const KIND_COLOR: Record<EntryKind, string> = {
  vacation:    "event-vacation",
  sick:        "event-sick",
  birthday:    "event-birthday",
  anniversary: "event-anniversary",
  company:     "event-company",
};

const KIND_EMOJI: Record<EntryKind, string> = {
  vacation:    "🌴",
  sick:        "🤒",
  birthday:    "🎂",
  anniversary: "🎉",
  company:     "📌",
};

export function DashboardSchedule({ data }: { data: OrgData }) {
  const [date, setDate] = useState(() => new Date());
  const [companyEvents, setCompanyEvents] = useState<CompanyEvent[]>([]);

  // Fetch company events for the visible year
  useEffect(() => {
    const y = date.getFullYear();
    fetch(`/api/company-events?from=${y}-01-01&to=${y}-12-31`)
      .then(r => r.json())
      .then((d: { events?: CompanyEvent[] }) => setCompanyEvents(d.events ?? []))
      .catch(() => {});
  }, [date.getFullYear()]);  // eslint-disable-line react-hooks/exhaustive-deps

  const year = date.getFullYear();

  const entries = useMemo<Entry[]>(() => {
    const all: Entry[] = [];

    // Vacation / Sick
    for (const t of data.timeOff) {
      if (t.status === "cancelled") continue;
      const profile = data.profiles.find(p => p.id === t.userId);
      const name = profile ? profileName(profile) : "Employee";
      all.push({
        id: t.id,
        kind: t.timeOffType as EntryKind,
        label: `${KIND_EMOJI[t.timeOffType as EntryKind]} ${name}`,
        start: sod(new Date(t.startAt)),
        end:   eod(new Date(t.endAt)),
      });
    }

    // Birthdays (month/day only — project to current year)
    for (const p of data.profiles) {
      if (!p.birthday || !p.showOnDashboard) continue;
      const d = projectDate(p.birthday, year);
      all.push({ id: `bday-${p.id}`, kind: "birthday", label: `🎂 ${p.firstName}'s Birthday`, start: sod(d), end: eod(d) });
    }

    // Work anniversaries
    for (const p of data.profiles) {
      if (!p.workAnniversary || !p.showOnDashboard) continue;
      const d = projectDate(p.workAnniversary, year);
      const yrs = yearsAgo(p.workAnniversary, year);
      if (yrs < 1) continue;
      all.push({ id: `anniv-${p.id}`, kind: "anniversary", label: `🎉 ${p.firstName} — ${yrs}yr`, start: sod(d), end: eod(d) });
    }

    // Company events
    for (const ce of companyEvents) {
      all.push({
        id: ce.id,
        kind: "company",
        label: `📌 ${ce.title}`,
        start: sod(new Date(ce.startDate + "T00:00:00")),
        end:   eod(new Date((ce.endDate ?? ce.startDate) + "T00:00:00")),
      });
    }

    return all;
  }, [data.profiles, data.timeOff, companyEvents, year]);

  // Build 5-week grid starting from the Sunday before the anchor week
  const weeks = useMemo(() => {
    const start = startOfWeek(date, { weekStartsOn: 0 });
    return Array.from({ length: 5 }, (_, wi) => {
      const ws = addWeeks(start, wi);
      return Array.from({ length: 7 }, (__, di) => addDays(ws, di));
    });
  }, [date]);

  const title = format(date, "MMMM yyyy");

  return (
    <div className="dash-sched-wrap panel">
      {/* Compact header */}
      <div className="dash-sched-header">
        <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Team Events</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-2)" }}>{title}</span>
          <button type="button" className="sched-nav-btn" onClick={() => setDate(d => addWeeks(d, -5))}>
            <ChevronLeft size={13} />
          </button>
          <button type="button" className="sched-today-btn" onClick={() => setDate(new Date())} style={{ fontSize: 11, padding: "2px 7px" }}>
            Today
          </button>
          <button type="button" className="sched-nav-btn" onClick={() => setDate(d => addWeeks(d, 5))}>
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* Compact month grid */}
      <div className="dash-sched-grid">
        {/* Day headers */}
        <div className="dash-sched-dow-row">
          {DAY_LABELS.map(d => <span key={d}>{d}</span>)}
        </div>

        {/* Weeks */}
        {weeks.map((week, wi) => (
          <div key={wi} className="dash-sched-week-row">
            {week.map(day => {
              const dayEntries = entriesOnDay(day, entries);
              const today = isToday(day);
              return (
                <div key={day.toISOString()} className={`dash-sched-cell${today ? " today" : ""}`}>
                  <span className={`dash-sched-num${today ? " today" : ""}`}>{format(day, "d")}</span>
                  <div className="dash-sched-pills">
                    {dayEntries.slice(0, 2).map(en => (
                      <span key={en.id} className={`dash-sched-pill ${KIND_COLOR[en.kind]}`} title={en.label}>
                        {en.label}
                      </span>
                    ))}
                    {dayEntries.length > 2 && (
                      <span className="dash-sched-pill-more">+{dayEntries.length - 2}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
