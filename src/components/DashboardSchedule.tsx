"use client";

import { useMemo, useState } from "react";
import {
  addDays,
  addWeeks,
  endOfDay,
  endOfWeek,
  format,
  isSameDay,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subWeeks,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { OrgData, Profile } from "@/lib/types";
import { profileName } from "@/lib/status";
import { UserAvatar } from "@/components/UserAvatar";

type ScheduleView = "month" | "week" | "day";

interface ScheduleEntry {
  id: string;
  userId: string;
  type: "vacation" | "sick";
  start: Date;
  end: Date;
  hours: number;
  notes?: string;
}

// Returns entries that overlap the given day
function entriesOnDay(day: Date, entries: ScheduleEntry[]): ScheduleEntry[] {
  const s = startOfDay(day);
  const e = endOfDay(day);
  return entries.filter((en) => en.start <= e && en.end >= s);
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function DashboardSchedule({ data }: { data: OrgData }) {
  const [view, setView] = useState<ScheduleView>("month");
  const [date, setDate] = useState(() => new Date());

  const entries = useMemo<ScheduleEntry[]>(() =>
    data.timeOff
      .filter((t) => t.status !== "cancelled")
      .map((t) => ({
        id: t.id,
        userId: t.userId,
        type: t.timeOffType,
        start: startOfDay(new Date(t.startAt)),
        end: endOfDay(new Date(t.endAt)),
        hours: t.hours,
        notes: t.notes,
      })),
    [data.timeOff],
  );

  const profileMap = useMemo(() => {
    const m: Record<string, Profile> = {};
    for (const p of data.profiles) m[p.id] = p;
    return m;
  }, [data.profiles]);

  // ─── Navigation ──────────────────────────────────────────────
  function prev() {
    if (view === "month") setDate((d) => addWeeks(d, -5));
    else if (view === "week") setDate((d) => subWeeks(d, 1));
    else setDate((d) => addDays(d, -1));
  }
  function next() {
    if (view === "month") setDate((d) => addWeeks(d, 5));
    else if (view === "week") setDate((d) => addWeeks(d, 1));
    else setDate((d) => addDays(d, 1));
  }
  function today() { setDate(new Date()); }

  function title() {
    if (view === "month") {
      const ws = startOfWeek(date, { weekStartsOn: 0 });
      const we = addDays(addWeeks(ws, 5), -1);
      return `${format(ws, "MMM d")} – ${format(we, "MMM d, yyyy")}`;
    }
    if (view === "week") {
      const ws = startOfWeek(date, { weekStartsOn: 0 });
      const we = endOfWeek(date, { weekStartsOn: 0 });
      return `${format(ws, "MMM d")} – ${format(we, "MMM d, yyyy")}`;
    }
    return format(date, "EEEE, MMMM d, yyyy");
  }

  function jumpToDay(d: Date) {
    setDate(d);
    setView("day");
  }

  return (
    <div className="sched-panel panel">
      {/* Toolbar */}
      <div className="sched-header">
        <div className="sched-nav">
          <button type="button" className="sched-nav-btn" onClick={prev} aria-label="Previous">
            <ChevronLeft size={14} />
          </button>
          <button type="button" className="sched-today-btn" onClick={today}>Today</button>
          <button type="button" className="sched-nav-btn" onClick={next} aria-label="Next">
            <ChevronRight size={14} />
          </button>
          <span className="sched-title">{title()}</span>
        </div>
        <div className="sched-view-toggle">
          {(["month", "week", "day"] as ScheduleView[]).map((v) => (
            <button
              key={v}
              type="button"
              className={`sched-view-btn${view === v ? " active" : ""}`}
              onClick={() => setView(v)}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      {view === "month" && (
        <MonthView date={date} entries={entries} profileMap={profileMap} onDayClick={jumpToDay} />
      )}
      {view === "week" && (
        <WeekView date={date} entries={entries} profileMap={profileMap} onDayClick={jumpToDay} />
      )}
      {view === "day" && (
        <DayView date={date} entries={entries} profileMap={profileMap} />
      )}
    </div>
  );
}

// ─── Month view ───────────────────────────────────────────────

function MonthView({ date, entries, profileMap, onDayClick }: {
  date: Date;
  entries: ScheduleEntry[];
  profileMap: Record<string, Profile>;
  onDayClick: (d: Date) => void;
}) {
  const weeks = useMemo(() => {
    const start = startOfWeek(date, { weekStartsOn: 0 });
    return Array.from({ length: 5 }, (_, wi) => {
      const weekStart = addWeeks(start, wi);
      return Array.from({ length: 7 }, (__, di) => addDays(weekStart, di));
    });
  }, [date]);

  return (
    <div className="sched-month">
      {/* Day-of-week headers */}
      <div className="sched-month-head">
        {DAY_LABELS.map((d) => <span key={d}>{d}</span>)}
      </div>
      {/* Weeks */}
      {weeks.map((week, wi) => (
        <div key={wi} className="sched-month-row">
          {week.map((day) => {
            const dayEntries = entriesOnDay(day, entries);
            const todayClass = isToday(day) ? " today" : "";
            const outClass = "";
            return (
              <div
                key={day.toISOString()}
                className={`sched-month-cell${todayClass}${outClass}`}
                onClick={() => onDayClick(day)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && onDayClick(day)}
              >
                <span className="sched-month-num">{format(day, "d")}</span>
                <div className="sched-month-pills">
                  {dayEntries.slice(0, 2).map((en) => {
                    const p = profileMap[en.userId];
                    return (
                      <span key={en.id} className={`sched-pill ${en.type}`}>
                        {p ? `${p.firstName} ${p.lastName[0]}.` : "—"}
                      </span>
                    );
                  })}
                  {dayEntries.length > 2 && (
                    <span className="sched-pill-more">+{dayEntries.length - 2}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── Week view ────────────────────────────────────────────────

function WeekView({ date, entries, profileMap, onDayClick }: {
  date: Date;
  entries: ScheduleEntry[];
  profileMap: Record<string, Profile>;
  onDayClick: (d: Date) => void;
}) {
  const days = useMemo(() => {
    const start = startOfWeek(date, { weekStartsOn: 0 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [date]);

  return (
    <div className="sched-week">
      {days.map((day) => {
        const dayEntries = entriesOnDay(day, entries);
        const todayClass = isToday(day) ? " today" : "";
        return (
          <div key={day.toISOString()} className={`sched-week-col${todayClass}`}>
            <button
              type="button"
              className="sched-week-head"
              onClick={() => onDayClick(day)}
            >
              <span className="sched-week-dow">{format(day, "EEE")}</span>
              <span className={`sched-week-num${isToday(day) ? " today" : ""}`}>{format(day, "d")}</span>
            </button>
            <div className="sched-week-body">
              {dayEntries.length === 0 && (
                <span className="sched-week-empty">—</span>
              )}
              {dayEntries.map((en) => {
                const p = profileMap[en.userId];
                return (
                  <div key={en.id} className={`sched-week-entry ${en.type}`}>
                    {p && (
                      <UserAvatar
                        userId={p.id}
                        firstName={p.firstName}
                        lastName={p.lastName}
                        className="sched-week-avatar"
                      />
                    )}
                    <div className="sched-week-entry-info">
                      <span className="sched-week-name">
                        {p ? profileName(p) : "Employee"}
                      </span>
                      <span className={`sched-type-dot ${en.type}`} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Day view ─────────────────────────────────────────────────

function DayView({ date, entries, profileMap }: {
  date: Date;
  entries: ScheduleEntry[];
  profileMap: Record<string, Profile>;
}) {
  const dayEntries = useMemo(() => entriesOnDay(date, entries), [date, entries]);

  if (dayEntries.length === 0) {
    return (
      <div className="sched-day-empty">
        No time off recorded for {format(date, "MMMM d, yyyy")}.
      </div>
    );
  }

  return (
    <div className="sched-day-list">
      {dayEntries.map((en) => {
        const p = profileMap[en.userId];
        const isVacation = en.type === "vacation";
        const sameDay = isSameDay(en.start, en.end);
        const span = sameDay
          ? format(en.start, "MMM d, yyyy")
          : `${format(en.start, "MMM d")} – ${format(en.end, "MMM d, yyyy")}`;

        return (
          <div key={en.id} className={`sched-day-row ${en.type}`}>
            {p ? (
              <UserAvatar userId={p.id} firstName={p.firstName} lastName={p.lastName} className="avatar sched-day-avatar" />
            ) : (
              <span className="avatar sched-day-avatar">?</span>
            )}
            <div className="sched-day-detail">
              <div className="sched-day-top">
                <strong className="sched-day-name">{p ? profileName(p) : "Employee"}</strong>
                <span className={`status-badge ${isVacation ? "blue" : "red"}`}>
                  {isVacation ? "Vacation" : "Sick"}
                </span>
              </div>
              <div className="sched-day-meta-row">
                <span className="sched-day-meta-item">
                  <span className="sched-day-label">Period</span>
                  {span}
                </span>
                <span className="sched-day-meta-item">
                  <span className="sched-day-label">Hours</span>
                  {en.hours}h
                </span>
                {p && (
                  <span className="sched-day-meta-item">
                    <span className="sched-day-label">Role</span>
                    {p.role.charAt(0).toUpperCase() + p.role.slice(1)}
                  </span>
                )}
              </div>
              {en.notes && (
                <p className="sched-day-notes">{en.notes}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
