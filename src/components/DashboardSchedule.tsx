"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays, addWeeks, format, isToday, isTomorrow, startOfWeek } from "date-fns";
import { CalendarDays, List, ChevronLeft, ChevronRight, Plus } from "lucide-react";

import type { OrgData } from "@/lib/types";
import type { CompanyEvent } from "@/lib/db-store";
import { profileName } from "@/lib/status";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type EntryKind = "vacation" | "sick" | "business_trip" | "birthday" | "anniversary" | "company";

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
  vacation:      "event-vacation",
  sick:          "event-sick",
  business_trip: "event-business-trip",
  birthday:      "event-birthday",
  anniversary:   "event-anniversary",
  company:       "event-company",
};

const KIND_EMOJI: Record<EntryKind, string> = {
  vacation:      "🌴",
  sick:          "🤒",
  business_trip: "✈️",
  birthday:      "🎂",
  anniversary:   "🎉",
  company:       "📌",
};

function dayLabel(day: Date): string {
  if (isToday(day)) return "Today";
  if (isTomorrow(day)) return "Tomorrow";
  return format(day, "EEE, MMM d");
}

export function DashboardSchedule({ data }: { data: OrgData }) {
  const [calDate, setCalDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [companyEvents, setCompanyEvents] = useState<CompanyEvent[]>([]);

  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const twoWeeksOut = useMemo(() => addDays(today, 14), [today]);

  useEffect(() => {
    const y = calDate.getFullYear();
    fetch(`/api/company-events?from=${y - 1}-01-01&to=${y + 1}-12-31`)
      .then(r => r.json())
      .then((d: { events?: CompanyEvent[] }) => setCompanyEvents(d.events ?? []))
      .catch(() => {});
  }, [calDate.getFullYear()]); // eslint-disable-line react-hooks/exhaustive-deps

  const year = calDate.getFullYear();

  const entries = useMemo<Entry[]>(() => {
    const all: Entry[] = [];

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

    for (const p of data.profiles) {
      if (!p.birthday || !p.showOnDashboard) continue;
      let d = projectDate(p.birthday, year);
      if (d < today) d = projectDate(p.birthday, year + 1);
      all.push({ id: `bday-${p.id}`, kind: "birthday", label: `🎂 ${p.firstName}'s Birthday`, start: sod(d), end: eod(d) });
    }

    for (const p of data.profiles) {
      if (!p.workAnniversary || !p.showOnDashboard) continue;
      let d = projectDate(p.workAnniversary, year);
      if (d < today) d = projectDate(p.workAnniversary, year + 1);
      const yrs = yearsAgo(p.workAnniversary, d.getFullYear());
      if (yrs < 1) continue;
      all.push({ id: `anniv-${p.id}`, kind: "anniversary", label: `🎉 ${p.firstName}'s ${yrs}yr Work Anniversary`, start: sod(d), end: eod(d) });
    }

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

  // Next-14-days list: group entries by day
  const upcomingDays = useMemo(() => {
    const days: { day: Date; entries: Entry[] }[] = [];
    for (let i = 0; i < 14; i++) {
      const day = addDays(today, i);
      const dayEntries = entriesOnDay(day, entries);
      if (dayEntries.length > 0) days.push({ day, entries: dayEntries });
    }
    return days;
  }, [entries, today]);

  // Calendar 5-week grid
  const weeks = useMemo(() => {
    const start = startOfWeek(calDate, { weekStartsOn: 0 });
    return Array.from({ length: 5 }, (_, wi) => {
      const ws = addWeeks(start, wi);
      return Array.from({ length: 7 }, (__, di) => addDays(ws, di));
    });
  }, [calDate]);

  return (
    <div className="dash-events-wrap">
      <div className="dash-events-header">
        <h2 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "var(--ink)" }}>Team Events</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {viewMode === "calendar" && (
            <>
              <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{format(calDate, "MMMM yyyy")}</span>
              <button type="button" className="sched-nav-btn" onClick={() => setCalDate(d => addWeeks(d, -5))}>
                <ChevronLeft size={12} />
              </button>
              <button type="button" className="sched-today-btn" onClick={() => setCalDate(new Date())} style={{ fontSize: 10, padding: "1px 6px" }}>
                Today
              </button>
              <button type="button" className="sched-nav-btn" onClick={() => setCalDate(d => addWeeks(d, 5))}>
                <ChevronRight size={12} />
              </button>
            </>
          )}
          <div className="dash-events-toggle">
            <button
              type="button"
              className={`dash-events-toggle-btn${viewMode === "list" ? " active" : ""}`}
              onClick={() => setViewMode("list")}
              title="List view"
            >
              <List size={13} />
            </button>
            <button
              type="button"
              className={`dash-events-toggle-btn${viewMode === "calendar" ? " active" : ""}`}
              onClick={() => setViewMode("calendar")}
              title="Calendar view"
            >
              <CalendarDays size={13} />
            </button>
          </div>
        </div>
      </div>

      {viewMode === "list" ? (
        <div className="dash-events-list">
          {upcomingDays.length === 0 ? (
            <p className="dash-events-empty">No events in the next 2 weeks.</p>
          ) : (
            upcomingDays.map(({ day, entries: dayEntries }) => (
              <div key={day.toISOString()} className="dash-events-day">
                <span className={`dash-events-day-label${isToday(day) ? " today" : ""}`}>
                  {dayLabel(day)}
                </span>
                <div className="dash-events-pills">
                  {dayEntries.map(en => (
                    <span key={en.id} className={`dash-events-pill ${KIND_COLOR[en.kind]}`}>
                      {en.label}
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="dash-sched-grid">
          <div className="dash-sched-dow-row">
            {DAY_LABELS.map(d => <span key={d}>{d}</span>)}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="dash-sched-week-row">
              {week.map(day => {
                const dayEntries = entriesOnDay(day, entries);
                const td = isToday(day);
                return (
                  <div key={day.toISOString()} className={`dash-sched-cell${td ? " today" : ""}`}>
                    <span className={`dash-sched-num${td ? " today" : ""}`}>{format(day, "d")}</span>
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
      )}
    </div>
  );
}
