"use client";

import { useEffect, useState } from "react";
import type { Profile, ScheduledShift } from "@/lib/types";
import { profileName } from "@/lib/status";
import { convertShiftTime, tzAbbr } from "@/lib/timezone";

interface Props {
  profile: Profile;
  scheduleTz: string;   // tz shift times are authored in (e.g. Pacific)
}

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_NAMES   = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function addDays(d: Date, n: number) {
  const c = new Date(d); c.setDate(c.getDate() + n); return c;
}

function fmt12(t: string) {
  const [h, m] = t.split(":").map(Number);
  const suf = h < 12 ? "am" : "pm";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12}${suf}` : `${h12}:${String(m).padStart(2,"0")}${suf}`;
}

function isOvernght(s: string, e: string) { return e <= s; }

function groupByWeek(shifts: ScheduledShift[]): Map<string, ScheduledShift[]> {
  const map = new Map<string, ScheduledShift[]>();
  for (const s of shifts) {
    const d   = new Date(s.shiftDate + "T00:00:00");
    const dow = d.getDay();
    const mon = new Date(d);
    mon.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
    const key = isoDate(mon);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }
  return map;
}

export function MyScheduleView({ profile, scheduleTz }: Props) {
  const [shifts, setShifts] = useState<ScheduledShift[]>([]);
  const [loading, setLoading] = useState(true);

  const today  = new Date();
  const from   = isoDate(today);
  const to     = isoDate(addDays(today, 27)); // 4 weeks

  useEffect(() => {
    fetch(`/api/my-schedule?from=${from}&to=${to}`)
      .then(r => r.json())
      .then((d: { shifts?: ScheduledShift[] }) => { setShifts(d.shifts ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [from, to]);

  const weekGroups = groupByWeek(shifts);
  const weekKeys   = [...weekGroups.keys()].sort();
  const empTz      = profile.timezone ?? "America/Chicago";
  const todayStr   = from;

  return (
    <section className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">My upcoming shifts</p>
          <h1>My Schedule</h1>
        </div>
        <div className="subtle" style={{fontSize:13}}>
          {profileName(profile)} · {tzAbbr(empTz)}
        </div>
      </header>

      <div className="page-content">
        {loading && <p className="subtle">Loading…</p>}

        {!loading && shifts.length === 0 && (
          <div className="panel" style={{padding:32,textAlign:"center"}}>
            <p style={{fontSize:16,fontWeight:600,marginBottom:8}}>No upcoming shifts</p>
            <p className="subtle">You have no shifts scheduled in the next 4 weeks.</p>
          </div>
        )}

        {weekKeys.map(weekStart => {
          const weekEnd  = addDays(new Date(weekStart + "T00:00:00"), 6);
          const weekShifts = weekGroups.get(weekStart)!;
          const label = `${MONTH_NAMES[new Date(weekStart+"T00:00:00").getMonth()]} ${new Date(weekStart+"T00:00:00").getDate()} – ${MONTH_NAMES[weekEnd.getMonth()]} ${weekEnd.getDate()}`;

          return (
            <div key={weekStart} className="my-schedule-week">
              <p className="my-schedule-week-label">{label}</p>
              <div className="panel" style={{padding:0,overflow:"hidden"}}>
                {weekShifts.sort((a,b) => a.shiftDate.localeCompare(b.shiftDate)).map(shift => {
                  const d      = new Date(shift.shiftDate + "T00:00:00");
                  const isToday = shift.shiftDate === todayStr;
                  const overnight = isOvernght(shift.startTime, shift.endTime);
                  return (
                    <div key={shift.id} className={`my-shift-row${isToday ? " is-today" : ""}${shift.isOpen ? " is-open" : ""}`}>
                      <div className="my-shift-date">
                        <div className="my-shift-day">{DAY_NAMES[d.getDay()].slice(0,3)}</div>
                        <div className={`my-shift-num${isToday ? " is-today" : ""}`}>{d.getDate()}</div>
                        <div className="my-shift-month">{MONTH_NAMES[d.getMonth()]}</div>
                      </div>
                      <div className="my-shift-body">
                        {(() => {
                          // Stored times are in scheduleTz; show the employee's own local time as primary.
                          const showLocal = empTz !== scheduleTz;
                          const endDate = overnight ? isoDate(addDays(d, 1)) : shift.shiftDate;
                          const ls = showLocal ? convertShiftTime(shift.shiftDate, shift.startTime, scheduleTz, empTz) : null;
                          const le = showLocal ? convertShiftTime(endDate, shift.endTime, scheduleTz, empTz) : null;
                          return (
                            <>
                              <div className="my-shift-time">
                                {ls && le
                                  ? <>{ls.time} – {le.time}<span className="shift-tz-label">{ls.abbr}</span></>
                                  : <>{fmt12(shift.startTime)} – {fmt12(shift.endTime)}{overnight && <span className="shift-overnight-badge">+1</span>}<span className="shift-tz-label">{tzAbbr(scheduleTz)}</span></>}
                              </div>
                              {showLocal && (
                                <div className="my-shift-label" style={{ fontStyle: "normal" }}>
                                  {fmt12(shift.startTime)} – {fmt12(shift.endTime)} {tzAbbr(scheduleTz)} (schedule)
                                </div>
                              )}
                            </>
                          );
                        })()}
                        {shift.label && <div className="my-shift-label">{shift.label}</div>}
                        {shift.notes && <div className="my-shift-notes">{shift.notes}</div>}
                        {shift.isOpen && (
                          <div className="my-shift-open-badge">⚠ Needs coverage — contact your manager</div>
                        )}
                      </div>
                      {shift.ruleId && (
                        <div className="my-shift-recurring-badge" title="Recurring shift">↻</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
