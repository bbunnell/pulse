"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, SlidersHorizontal, X } from "lucide-react";
import type { Profile, ScheduleRule, ScheduleTemplate, ScheduledShift, TimeOffEntry } from "@/lib/types";
import { profileName } from "@/lib/status";
import { localDateInZone, localTimeInZone, tzAbbr } from "@/lib/timezone";
import { deriveStandardShifts, groupShiftsByWindow, type BoardShift, type ShiftGroup } from "@/lib/derived-shifts";
import { CoverageHeatmap } from "@/components/schedule/CoverageHeatmap";
import { RecurringRulePanel } from "@/components/schedule/RecurringRulePanel";
import { BulkReassignModal } from "@/components/schedule/BulkReassignModal";
import { TemplatesModal } from "@/components/schedule/TemplatesModal";

// ── Colour palette (NBIT brand-derived) ────────────────────────────────────────
const PALETTE = [
  { bg: "#E6F0FA", border: "#00579D", text: "#133F62" },  // Royal Blue
  { bg: "#E8F6FD", border: "#59BFEF", text: "#0C3A52" },  // Sky Blue
  { bg: "#ECFDF5", border: "#059669", text: "#065F46" },  // Green
  { bg: "#FFF8E1", border: "#FFBF1D", text: "#7A5800" },  // Yellow accent
  { bg: "#FEF2F2", border: "#E23A39", text: "#7F1D1D" },  // Red
  { bg: "#F0F9FF", border: "#2D81B5", text: "#133F62" },  // Mid blue
  { bg: "#FFF7ED", border: "#D97706", text: "#7C2D12" },  // Amber
  { bg: "#F0FDF4", border: "#34D399", text: "#14532D" },  // Teal
];

function profileColor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

// ── Date helpers ───────────────────────────────────────────────────────────────
const DAY_NAMES   = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function mondayOf(d: Date): Date {
  const copy = new Date(d);
  const dow  = copy.getDay();
  copy.setDate(copy.getDate() + (dow === 0 ? -6 : 1 - dow));
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function fmtMonthDay(d: Date) {
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}

function formatTime(t: string): string {
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const min  = mStr && mStr !== "00" ? `:${mStr}` : "";
  return `${h12}${min}${suffix}`;
}

function crossesMidnight(start: string, end: string) { return end <= start; }

// ── Week-view day timeline ─────────────────────────────────────────────────────
// A compact vertical timeline per day column: blocks sit at their real position on
// an hour axis, concurrent windows sit side by side, and today carries a red
// now-line. This is what makes overlap legible without opening the day view.
const WEEK_TL_START = 5;                       // first hour shown (5am)
const WEEK_TL_END   = 24;                      // through midnight
const WEEK_TL_HOURS = WEEK_TL_END - WEEK_TL_START;

function WeekDayTimeline({
  dateStr, groups, profiles, scheduleTz, compact, nowMin, onEditProfile,
}: {
  dateStr: string;
  groups: ShiftGroup[];
  profiles: Profile[];
  scheduleTz: string;
  compact: boolean;
  /** Minutes past midnight in the schedule zone, or -1 when this is not today. */
  nowMin: number;
  onEditProfile?: (profileId: string) => void;
}) {
  const H = compact ? 150 : 230;                       // timeline height in px
  const pxPerMin = H / (WEEK_TL_HOURS * 60);
  const clampTop = (min: number) => Math.max(0, (min - WEEK_TL_START * 60) * pxPerMin);

  // Greedy column packing so concurrent windows sit side by side rather than stacked.
  interface Lane { group: ShiftGroup; top: number; height: number; col: number }
  const laneEnds: number[] = [];
  const lanes: Lane[] = groups.map((g) => {
    const s = toMin(g.startTime);
    const overnight = crossesMidnight(g.startTime, g.endTime);
    const e = overnight ? WEEK_TL_END * 60 : toMin(g.endTime);
    let col = laneEnds.findIndex((end) => end <= s);
    if (col === -1) col = laneEnds.length;
    laneEnds[col] = e;
    return { group: g, top: clampTop(s), height: Math.max((e - s) * pxPerMin, 20), col };
  });
  const cols = Math.max(1, laneEnds.length);

  return (
    <div className="wk-tl" style={{ height: H }}>
      {/* Hour gridlines, labelled every 3h so the axis stays readable when narrow */}
      {Array.from({ length: WEEK_TL_HOURS + 1 }, (_, i) => {
        const hour = WEEK_TL_START + i;
        const label = hour % 3 === 0 && hour < 24;
        return (
          <div key={hour} className={`wk-tl-line${label ? " labelled" : ""}`}
               style={{ top: i * 60 * pxPerMin }}>
            {label && !compact && <span className="wk-tl-hour">{formatTime(`${String(hour).padStart(2,"0")}:00`)}</span>}
          </div>
        );
      })}

      {lanes.map(({ group, top, height, col }) => {
        const single = group.shifts.length === 1;
        const color  = single ? profileColor(group.shifts[0].profileId) : null;
        const wPct   = 100 / cols;
        const names  = group.shifts
          .map((s) => profiles.find((p) => p.id === s.profileId))
          .filter(Boolean)
          .map((p) => profileName(p as Profile))
          .sort((a, b) => a.localeCompare(b));
        const fits = Math.max(0, Math.floor((height - 16) / 13));
        const shown = names.slice(0, fits);

        return (
          <div key={group.key} className={`wk-tl-block${single ? "" : " is-group"}`}
               title={`${formatTime(group.startTime)}–${formatTime(group.endTime)} ${tzAbbr(scheduleTz)}\n${names.join("\n")}`}
               style={{
                 top, height,
                 left:  `calc(${col * wPct}% + 1px)`,
                 width: `calc(${wPct}% - 2px)`,
                 ...(color ? { borderColor: color.border, background: color.bg, color: color.text } : {}),
               }}
               onClick={onEditProfile && single ? () => onEditProfile(group.shifts[0].profileId) : undefined}>
            <span className="wk-tl-time">
              {formatTime(group.startTime)}
              {!single && <span className="wk-tl-count">{group.shifts.length}</span>}
            </span>
            {shown.map((n) => <span key={n} className="wk-tl-name">{n}</span>)}
            {names.length > shown.length && (
              <span className="wk-tl-name wk-tl-rest">+{names.length - shown.length}</span>
            )}
          </div>
        );
      })}

      {nowMin >= 0 && (
        <div className="wk-tl-now" style={{ top: clampTop(nowMin) }} aria-label="Current time" />
      )}
    </div>
  );
}

// ── Week row ───────────────────────────────────────────────────────────────────
interface WeekRowProps {
  weekStart: Date;
  shifts: BoardShift[];
  profiles: Profile[];
  timeOff: TimeOffEntry[];
  today: string;
  canEdit: boolean;
  canEditProfiles: boolean;
  compact: boolean;
  showWeekLabel: boolean;
  showHeatmap: boolean;
  scheduleTz: string;
  onAddClick(date: string): void;
  onDelete(id: string): void;
  onEdit(shift: ScheduledShift): void;
  onEditProfile(profileId: string): void;
  nowDateStr: string | null;
  nowMinutes: number;
}

function WeekRow({ weekStart, shifts, profiles, timeOff, today, canEdit, canEditProfiles, compact, showWeekLabel, showHeatmap, scheduleTz, onAddClick, onDelete, onEdit, onEditProfile, nowDateStr, nowMinutes }: WeekRowProps) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEnd = addDays(weekStart, 6);
  const label = `${fmtMonthDay(weekStart)} – ${fmtMonthDay(weekEnd)}`;

  return (
    <div className="schedule-week-block">
      {showWeekLabel && (
        <div className="schedule-week-label">{label}</div>
      )}
      <div className="schedule-grid">
        {days.map((day) => {
          const dateStr   = isoDate(day);
          const isToday   = dateStr === today;
          const dayGroups = groupShiftsByWindow(shifts.filter((s) => s.shiftDate === dateStr));

          return (
            <div key={dateStr} className={`schedule-day-col${isToday?" is-today":""}`}>
              <div className={`schedule-day-header${isToday?" is-today":""}`}>
                <div className="schedule-day-name">{DAY_NAMES[day.getDay()]}</div>
                <div className={`schedule-day-date${isToday?" is-today":""}`}>{day.getDate()}</div>
                {!compact && <div className="schedule-day-month">{MONTH_NAMES[day.getMonth()]}</div>}
              </div>
              <div className="schedule-day-body">
                {dayGroups.length === 0 ? (
                  <div className="schedule-day-empty">No one scheduled</div>
                ) : (
                  <WeekDayTimeline
                    dateStr={dateStr}
                    groups={dayGroups}
                    profiles={profiles}
                    scheduleTz={scheduleTz}
                    compact={compact}
                    nowMin={dateStr === nowDateStr ? nowMinutes : -1}
                    onEditProfile={canEditProfiles ? onEditProfile : undefined}
                  />
                )}
              </div>
              {showHeatmap && <CoverageHeatmap dayDate={dateStr} allShifts={shifts}/>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Edit shift modal ─────────────────────────────────────────────────────────
interface EditShiftProps {
  shift: ScheduledShift;
  profiles: Profile[];
  scheduleTz: string;
  onSave(updated: ScheduledShift): void;
  onClose(): void;
}

function EditShiftModal({ shift, profiles, scheduleTz, onSave, onClose }: EditShiftProps) {
  const [profileId, setProfileId] = useState(shift.profileId);
  const [startTime, setStartTime] = useState(shift.startTime);
  const [endTime,   setEndTime]   = useState(shift.endTime);
  const [label,     setLabel]     = useState(shift.label ?? "");
  const [notes,     setNotes]     = useState(shift.notes ?? "");
  const [isOpen,    setIsOpen]    = useState(shift.isOpen);
  const [detach,    setDetach]    = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");
  const overlayRef = useRef<HTMLDivElement>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError("");
    const res = await fetch(`/api/schedule/${shift.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId, startTime, endTime, label: label||undefined, notes: notes||undefined, isOpen, detachFromRule: detach }),
    });
    const json = (await res.json()) as { ok?: boolean; shift?: ScheduledShift; error?: string };
    if (json.ok && json.shift) { onSave(json.shift); onClose(); }
    else { setError(json.error ?? "Save failed."); }
    setSaving(false);
  }

  return (
    <div className="schedule-modal-overlay" ref={overlayRef}
         onClick={e => { if (e.target === overlayRef.current) onClose(); }}>
      <div className="schedule-modal">
        <div className="schedule-modal-header">
          <h3>Edit Shift — {shift.shiftDate}</h3>
          <button className="icon-btn" type="button" onClick={onClose}><X size={16}/></button>
        </div>
        <form className="schedule-modal-body" onSubmit={handleSave}>
          <div className="control">
            <label>Person</label>
            <select className="select" value={profileId} onChange={e=>setProfileId(e.target.value)}>
              {profiles.map(p=><option key={p.id} value={p.id}>{profileName(p)}</option>)}
            </select>
          </div>
          <div className="schedule-modal-row">
            <div className="control" style={{flex:1}}>
              <label>Start time</label>
              <input className="input" type="time" value={startTime} onChange={e=>setStartTime(e.target.value)} required/>
            </div>
            <div className="control" style={{flex:1}}>
              <label>End time</label>
              <input className="input" type="time" value={endTime} onChange={e=>setEndTime(e.target.value)} required/>
            </div>
          </div>
          <p className="subtle" style={{ fontSize: 11, marginTop: -4 }}>
            Times are in <strong>{tzAbbr(scheduleTz)}</strong> (the schedule timezone).
          </p>
          <div className="control">
            <label>Label</label>
            <input className="input" value={label} onChange={e=>setLabel(e.target.value)} placeholder="Overnight, Day, Evening…"/>
          </div>
          <div className="control">
            <label>Notes</label>
            <input className="input" value={notes} onChange={e=>setNotes(e.target.value)}/>
          </div>
          <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,cursor:"pointer"}}>
            <input type="checkbox" checked={isOpen} onChange={e=>setIsOpen(e.target.checked)}/>
            Mark as open (needs coverage)
          </label>
          {shift.ruleId && (
            <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,cursor:"pointer"}}>
              <input type="checkbox" checked={detach} onChange={e=>setDetach(e.target.checked)}/>
              Edit this occurrence only (detach from recurring rule)
            </label>
          )}
          {error && <p className="error-line">{error}</p>}
          <div className="schedule-modal-footer">
            <button className="button secondary" type="button" onClick={onClose}>Cancel</button>
            <button className="button primary" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
type ViewMode = "day" | 1 | 2 | 4;

// ── Day timeline view ─────────────────────────────────────────────────────────
const HOUR_PX = 56;     // pixels per hour
const MIN_PX  = HOUR_PX / 60;

function toMin(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

interface DayTimelineProps {
  dayDate:    string;
  allShifts:  BoardShift[];  // includes yesterday for overnight carry-overs
  profiles:   Profile[];
  timeOff:    TimeOffEntry[];
  canEdit:    boolean;
  canEditProfiles: boolean;
  scheduleTz:   string;
  onEdit(shift: ScheduledShift): void;
  onDelete(id: string): void;
  onAddClick(date: string): void;
  onEditProfile(profileId: string): void;
  /** Ticking clock from the parent; null until mounted, to keep SSR markup stable. */
  nowTick: Date | null;
}

function DayTimelineView({
  dayDate, allShifts, profiles, timeOff, canEdit, canEditProfiles, scheduleTz, onEdit, onDelete, onAddClick, onEditProfile, nowTick,
}: DayTimelineProps) {
  const d       = new Date(dayDate + "T00:00:00");
  const prevDay = isoDate(addDays(d, -1));
  const DAY_FULL = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

  // Shifts starting today + overnight carry-overs from yesterday
  const todayShifts    = allShifts.filter(s => s.shiftDate === dayDate);
  const carryoverShifts = allShifts.filter(
    s => s.shiftDate === prevDay && crossesMidnight(s.startTime, s.endTime),
  );

  interface Block {
    group:         ShiftGroup;
    startMin:      number;
    endMin:        number;    // capped at 24*60 for tonight-spanning shifts
    isCarryOver:   boolean;
    continuesNext: boolean;
    hasPto:        boolean;
    col:           number;
    totalCols:     number;
  }

  // Group first, then lay out: one block per distinct window rather than per person,
  // so thirteen people on 8am-5pm occupy one column instead of thirteen.
  const raw: Omit<Block, "col" | "totalCols">[] = [
    ...groupShiftsByWindow(carryoverShifts).map(g => ({
      group:         g,
      startMin:      0,
      endMin:        toMin(g.endTime),
      isCarryOver:   true,
      continuesNext: false,
      hasPto:        false,
    })),
    ...groupShiftsByWindow(todayShifts).map(g => {
      const overnight = crossesMidnight(g.startTime, g.endTime);
      return {
        group:         g,
        startMin:      toMin(g.startTime),
        endMin:        overnight ? 24 * 60 : toMin(g.endTime),
        isCarryOver:   false,
        continuesNext: overnight,
        hasPto:        g.shifts.some(s => timeOff.some(t =>
          t.userId === s.profileId && t.status === "approved" &&
          dayDate >= t.startAt.slice(0, 10) && dayDate <= t.endAt.slice(0, 10),
        )),
      };
    }),
  ].sort((a, b) => a.startMin - b.startMin);

  // Greedy column assignment
  const colEnds: number[] = [];
  const blocks: Block[] = raw.map(b => {
    let col = colEnds.findIndex(e => e <= b.startMin);
    if (col === -1) col = colEnds.length;
    colEnds[col] = b.endMin;
    return { ...b, col, totalCols: 0 };
  });
  const totalCols = Math.max(1, colEnds.length);
  blocks.forEach(b => { b.totalCols = totalCols; });

  // Current time indicator. Read in the schedule timezone, not the viewer's: blocks
  // are positioned from schedule-zone times, so a Chicago viewer on a Pacific
  // schedule would otherwise see the line sitting two hours off the blocks it marks.
  const isToday = nowTick ? localDateInZone(scheduleTz, nowTick) === dayDate : false;
  const nowMin  = isToday && nowTick ? toMin(localTimeInZone(scheduleTz, nowTick)) : -1;

  return (
    <div className="day-timeline-wrap">
      {/* Date header */}
      <div className="day-timeline-date-header">
        <div>
          <p className="day-timeline-weekday">{DAY_FULL[d.getDay()]}</p>
          <p className="day-timeline-fulldate">
            {MONTH_NAMES[d.getMonth()]} {d.getDate()}, {d.getFullYear()}
          </p>
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <span className="subtle" style={{fontSize:13}}>
            {blocks.length} shift{blocks.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Timeline grid */}
      <div className="day-timeline-grid">
        {/* Hour labels */}
        <div className="day-timeline-hours">
          {Array.from({length: 25}, (_, h) => (
            <div key={h} className="day-hour-label" style={{top: h * HOUR_PX}}>
              {h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h-12}pm`}
            </div>
          ))}
        </div>

        {/* Shifts body */}
        <div className="day-timeline-body" style={{height: 24 * HOUR_PX}}>
          {/* Hour grid lines */}
          {Array.from({length: 25}, (_, h) => (
            <div key={h} className={`day-hour-line${h % 6 === 0 ? " major" : ""}`}
                 style={{top: h * HOUR_PX}}/>
          ))}

          {/* "Now" indicator */}
          {nowMin >= 0 && (
            <div className="day-now-line" style={{top: nowMin * MIN_PX}}>
              <span className="day-now-dot"/>
            </div>
          )}

          {/* Shift blocks */}
          {blocks.map(b => {
            const g        = b.group;
            const single   = g.shifts.length === 1;
            const lead     = g.shifts[0];
            const color    = single ? profileColor(lead.profileId) : null;
            const h        = Math.max((b.endMin - b.startMin) * MIN_PX - 2, 48);
            const wPct     = 100 / b.totalCols;
            // How many names fit before the block runs out of vertical room.
            const nameCap  = Math.max(1, Math.floor((h - 74) / 18));

            const members = g.shifts
              .map(s => ({ shift: s, profile: profiles.find(p => p.id === s.profileId) }))
              .sort((a, z) => {
                const na = a.profile ? `${a.profile.lastName} ${a.profile.firstName}` : "";
                const nz = z.profile ? `${z.profile.lastName} ${z.profile.firstName}` : "";
                return na.toLowerCase().localeCompare(nz.toLowerCase());
              });
            const shown  = members.slice(0, nameCap);
            const hidden = members.length - shown.length;

            const anyOpen      = g.shifts.some(s => s.isOpen);
            const anyRecurring = g.shifts.some(s => s.ruleId);

            return (
              <div key={g.key}
                className={`day-shift-block${b.isCarryOver ? " carryover" : ""}${b.hasPto ? " pto-conflict" : ""}${anyOpen ? " open-shift" : ""}`}
                style={{
                  top:             b.startMin * MIN_PX + 1,
                  height:          h,
                  left:            `calc(${b.col * wPct}% + 2px)`,
                  width:           `calc(${wPct}% - 4px)`,
                  ...(color ? { borderColor: color.border, background: color.bg, color: color.text } : {}),
                }}>

                {/* ── Time leads: it is what everyone in this block shares ── */}
                <div className="day-shift-time">
                  <strong>
                    {b.isCarryOver ? "12:00am" : formatTime(g.startTime)}
                    {" – "}
                    {b.continuesNext ? "midnight" : formatTime(g.endTime)}
                  </strong>
                  <span className="shift-tz-label">{tzAbbr(scheduleTz)}</span>
                  {!single && <span className="shift-group-count">{members.length}</span>}
                </div>

                {/* ── Badges ── */}
                <div className="day-shift-badges">
                  {anyRecurring    && <span className="dsb"       title="Recurring shift">↻ Recurring</span>}
                  {b.hasPto        && <span className="dsb pto"   title="Someone here has time off this day">⚠ Time-off conflict</span>}
                  {anyOpen         && <span className="dsb open"  title="Needs coverage">OPEN</span>}
                  {b.isCarryOver   && <span className="dsb carry" title="Started previous day">← from prev day</span>}
                  {b.continuesNext && <span className="dsb carry" title="Ends next day">→ continues next day</span>}
                </div>

                {/* ── Who is working this window ── */}
                <div className="day-shift-people">
                  {shown.map(({ shift, profile }) => {
                    const name = profile ? profileName(profile) : "Unknown";
                    const mColor = profileColor(shift.profileId);
                    return (
                      <span key={shift.id} className="day-shift-person" title={name}>
                        <span className="shift-group-swatch" style={{ background: mColor.border }} aria-hidden="true" />
                        <span className="day-shift-person-name">{name}</span>
                        {canEdit && !shift.derived && (
                          <span className="day-shift-btns">
                            <button type="button" className="day-shift-btn"
                                    aria-label={`Edit ${name}'s shift`} title="Edit shift"
                                    onClick={() => onEdit(shift)}><Pencil size={11}/></button>
                            <button type="button" className="day-shift-btn"
                                    aria-label={`Remove ${name}'s shift`} title="Remove shift"
                                    onClick={() => onDelete(shift.id)}><X size={11}/></button>
                          </span>
                        )}
                        {canEditProfiles && shift.derived && (
                          <span className="day-shift-btns">
                            <button type="button" className="day-shift-btn"
                                    aria-label={`Edit ${name}'s regular hours`}
                                    title="Regular hours — edit on their profile"
                                    onClick={() => onEditProfile(shift.profileId)}>
                              <SlidersHorizontal size={11}/>
                            </button>
                          </span>
                        )}
                      </span>
                    );
                  })}
                  {hidden > 0 && (
                    <span className="day-shift-more" title={members.slice(nameCap).map(m => m.profile ? profileName(m.profile) : "Unknown").join(", ")}>
                      +{hidden} more
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface Props {
  profiles: Profile[];
  timeOff: TimeOffEntry[];
  canEdit: boolean;
  scheduleTz: string;
  /** Only admins can reach /admin, so only they get the "edit regular hours" jump. */
  isAdmin?: boolean;
}

export function ScheduleView({ profiles, timeOff, canEdit, scheduleTz, isAdmin = false }: Props) {
  const [viewMode,        setViewMode]        = useState<ViewMode>(2);
  const [anchorDate,      setAnchorDate]      = useState<Date>(() => mondayOf(new Date()));
  const [shifts,          setShifts]          = useState<ScheduledShift[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [modalDate,       setModalDate]       = useState<string | null>(null);
  const [editingShift,    setEditingShift]    = useState<ScheduledShift | null>(null);
  const [showHeatmap,     setShowHeatmap]     = useState(true);
  const [showRules,       setShowRules]       = useState(false);
  const [showReassign,    setShowReassign]    = useState(false);
  const [showTemplates,   setShowTemplates]   = useState(false);
  const [showCopyWeek,    setShowCopyWeek]    = useState(false);
  const [rules,           setRules]           = useState<ScheduleRule[]>([]);
  const [templates,       setTemplates]       = useState<ScheduleTemplate[]>([]);
  const [copyWeeksAhead,  setCopyWeeksAhead]  = useState(1);
  const [copying,         setCopying]         = useState(false);

  // "weekStart" alias — in day mode this is the selected day
  const weekStart = anchorDate;

  // The now-line has to advance on its own; previously `new Date()` was read once at
  // render, so the marker sat wherever the last unrelated re-render left it.
  // Starts null so server and first client render agree, then ticks each half minute.
  const [nowTick, setNowTick] = useState<Date | null>(null);
  useEffect(() => {
    setNowTick(new Date());
    const t = window.setInterval(() => setNowTick(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  // Load rules and templates once
  useEffect(() => {
    fetch("/api/schedule/rules").then(r=>r.json()).then((d:{rules?:ScheduleRule[]})=>setRules(d.rules??[])).catch(()=>{});
    fetch("/api/schedule/templates").then(r=>r.json()).then((d:{templates?:ScheduleTemplate[]})=>setTemplates(d.templates??[])).catch(()=>{});
  }, []);

  const today    = isoDate(new Date());

  // Compute fetch range depending on view mode
  const fetchFrom = viewMode === "day"
    ? isoDate(addDays(weekStart, -1))          // -1 day for overnight carry-overs
    : isoDate(weekStart);
  const fetchTo   = viewMode === "day"
    ? isoDate(addDays(weekStart, 1))
    : isoDate(addDays(weekStart, viewMode * 7 - 1));

  const rangeEnd  = viewMode === "day" ? weekStart : addDays(weekStart, viewMode * 7 - 1);

  const fetchShifts = useCallback(async (from: string, to: string) => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/schedule?from=${from}&to=${to}`);
      const json = (await res.json()) as { shifts?: ScheduledShift[] };
      setShifts(json.shifts ?? []);
    } catch { setShifts([]); }
    setLoading(false);
  }, []);

  useEffect(() => { void fetchShifts(fetchFrom, fetchTo); }, [fetchFrom, fetchTo, fetchShifts]);

  // Standard-schedule staff have no shift rows; their hours live on their profile.
  // Derive display-only shifts for them so the board shows everyone actually
  // scheduled, not just the shift_based team.
  const boardShifts = useMemo<BoardShift[]>(() => {
    const dates: string[] = [];
    for (let d = new Date(fetchFrom + "T12:00:00Z"); isoDate(d) <= fetchTo; d = addDays(d, 1)) {
      dates.push(isoDate(d));
    }
    const derived = deriveStandardShifts({ profiles, timeOff, dates, scheduleTz });
    // Shifts are no longer a concept: everyone's hours come from their profile.
    // Legacy scheduled_shifts rows are deliberately ignored rather than merged,
    // so the board has exactly one source of truth.
    return derived;
  }, [shifts, profiles, timeOff, fetchFrom, fetchTo, scheduleTz]);

  function prevPeriod() {
    setAnchorDate(w => viewMode === "day" ? addDays(w, -1) : addDays(w, -(viewMode as number) * 7));
  }
  function nextPeriod() {
    setAnchorDate(w => viewMode === "day" ? addDays(w, 1) : addDays(w, (viewMode as number) * 7));
  }
  function goToday() {
    setAnchorDate(viewMode === "day" ? new Date() : mondayOf(new Date()));
  }

  // Derived rows have no shift record: their hours are profile settings, so send the
  // manager to the one place that owns them rather than forking a per-day copy.
  function handleEditProfile(profileId: string) {
    window.location.href = `/admin?profile=${encodeURIComponent(profileId)}`;
  }
  function changeMode(m: ViewMode) {
    setViewMode(m);
    // When switching to day view, snap to today; when switching to week, use Monday
    setAnchorDate(m === "day" ? new Date() : mondayOf(new Date()));
  }

  async function handleSave(data: Omit<ScheduledShift, "id"|"createdAt"|"updatedAt">) {
    const res  = await fetch("/api/schedule", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = (await res.json()) as { shift?: ScheduledShift; error?: string };
    if (!res.ok) throw new Error(json.error ?? "Failed to save.");
    if (json.shift) setShifts((prev) => [...prev, json.shift!]);
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/schedule/${id}`, { method: "DELETE" });
    if (res.ok) setShifts((prev) => prev.filter((s) => s.id !== id));
  }

  function handleEditSave(updated: ScheduledShift) {
    setShifts(prev => prev.map(s => s.id === updated.id ? updated : s));
  }

  async function handleCopyWeek() {
    setCopying(true);
    const srcStart = isoDate(viewMode === "day" ? mondayOf(weekStart) : weekStart);
    const targetWeeks = Array.from({ length: copyWeeksAhead }, (_, i) => i + 1);
    await fetch("/api/schedule/copy-week", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceWeekStart: srcStart, targetWeeks }),
    });
    await fetchShifts(fetchFrom, fetchTo);
    setShowCopyWeek(false);
    setCopying(false);
  }

  // Range label
  const DAY_LONG = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const rangeLabel = viewMode === "day"
    ? `${DAY_LONG[weekStart.getDay()]}, ${fmtMonthDay(weekStart)} ${weekStart.getFullYear()}`
    : weekStart.getFullYear() === rangeEnd.getFullYear()
      ? `${fmtMonthDay(weekStart)} – ${fmtMonthDay(rangeEnd)}, ${weekStart.getFullYear()}`
      : `${fmtMonthDay(weekStart)}, ${weekStart.getFullYear()} – ${fmtMonthDay(rangeEnd)}, ${rangeEnd.getFullYear()}`;

  const weeks   = viewMode !== "day"
    ? Array.from({ length: viewMode as number }, (_, i) => addDays(weekStart, i * 7))
    : [];
  const compact = viewMode === 4;
  const activeIds = new Set(shifts.map((s) => s.profileId));

  return (
    <section className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Team coverage</p>
          <h1>Schedule</h1>
        </div>
        {/* No "Add Shift": hours come from the profile now, so a shift row would be
            written and then ignored. Regular hours are edited in Admin. */}
      </header>

      <div className="page-content">
        {/* ── Controls bar ── */}
        <div className="schedule-nav">
          {/* View mode selector */}
          <div className="schedule-view-toggle">
            {(["day", 1, 2, 4] as ViewMode[]).map((m) => (
              <button key={String(m)} type="button"
                      className={`schedule-view-btn${viewMode===m?" active":""}`}
                      onClick={() => changeMode(m)}>
                {m === "day" ? "Day" : m === 1 ? "1 Week" : m === 2 ? "2 Weeks" : "4 Weeks"}
              </button>
            ))}
          </div>

          {/* Navigation */}
          <div className="schedule-nav-controls">
            <button className="button secondary icon-only" onClick={prevPeriod} type="button" title="Previous">
              <ChevronLeft size={16}/>
            </button>
            <span className="schedule-nav-label">{rangeLabel}</span>
            <button className="button secondary icon-only" onClick={nextPeriod} type="button" title="Next">
              <ChevronRight size={16}/>
            </button>
          </div>

          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {loading && <span className="schedule-loading">Loading…</span>}
            <span className="schedule-viewer-tz" title={scheduleTz}>{tzAbbr(scheduleTz)}</span>
            <button className="button secondary" onClick={goToday} type="button">Today</button>
          </div>
        </div>

        {/* ── Actions toolbar (managers/admins only) ── */}
        {canEdit && (
          <div className="schedule-toolbar">
            {/* Recurring rules, copy-week, bulk reassign and templates all authored
                scheduled_shifts rows. Hours now live on the profile and the board no
                longer reads those rows, so these controls would appear to work while
                changing nothing. Removed rather than left as traps. */}
            <button type="button" className={`schedule-tool-btn${showHeatmap?" active":""}`}
                    onClick={()=>setShowHeatmap(v=>!v)}>
              Coverage
            </button>
          </div>
        )}

        {/* ── Copy week inline panel ── */}
        {showCopyWeek && (
          <div className="schedule-inline-panel">
            <p className="subtle" style={{fontSize:13}}>
              Copy all {shifts.filter(s=>weeks.some(w=>{const end=addDays(w,6); return s.shiftDate>=isoDate(w)&&s.shiftDate<=isoDate(end);})).length} shifts from the current view to:
            </p>
            <div style={{display:"flex",gap:8,alignItems:"center",marginTop:8}}>
              <select className="select" style={{width:180}} value={copyWeeksAhead} onChange={e=>setCopyWeeksAhead(Number(e.target.value))}>
                <option value={1}>Next 1 week forward</option>
                <option value={2}>Next 2 weeks forward</option>
                <option value={4}>Next 4 weeks forward</option>
              </select>
              <button className="button primary" type="button" disabled={copying} onClick={handleCopyWeek}>
                {copying ? "Copying…" : "Copy"}
              </button>
              <button className="button secondary" type="button" onClick={()=>setShowCopyWeek(false)}>Cancel</button>
            </div>
          </div>
        )}

        {/* ── Recurring rules side panel ── */}
        {showRules && (
          <RecurringRulePanel
            profiles={profiles} rules={rules}
            onRulesChange={setRules}
            onClose={()=>setShowRules(false)}
            scheduleTz={scheduleTz}
          />
        )}

        {/* ── Main view ── */}
        {viewMode === "day" ? (
          <DayTimelineView
            dayDate={isoDate(weekStart)}
            allShifts={boardShifts}
            profiles={profiles}
            timeOff={timeOff}
            canEdit={canEdit}
            canEditProfiles={isAdmin}
            scheduleTz={scheduleTz}
            onEdit={setEditingShift}
            onDelete={handleDelete}
            onAddClick={setModalDate}
            onEditProfile={handleEditProfile}
            nowTick={nowTick}
          />
        ) : (
          <div className={`schedule-weeks${showRules?" has-side-panel":""}`}>
            {weeks.map((ws) => (
              <WeekRow key={isoDate(ws)} weekStart={ws} shifts={boardShifts} profiles={profiles}
                       timeOff={timeOff} today={today} canEdit={canEdit} canEditProfiles={isAdmin} compact={compact}
                       showWeekLabel={(viewMode as number) > 1} showHeatmap={showHeatmap} scheduleTz={scheduleTz}
                       onAddClick={setModalDate} onDelete={handleDelete} onEdit={setEditingShift}
                       onEditProfile={handleEditProfile}
                       nowDateStr={nowTick ? localDateInZone(scheduleTz, nowTick) : null}
                       nowMinutes={nowTick ? toMin(localTimeInZone(scheduleTz, nowTick)) : -1}/>
            ))}
          </div>
        )}

      </div>

      {/* ── Modals ── */}
      {showReassign && (
        <BulkReassignModal profiles={profiles}
                           onDone={() => { void fetchShifts(fetchFrom, fetchTo); }}
                           onClose={() => setShowReassign(false)}/>
      )}
      {showTemplates && (
        <TemplatesModal
          profiles={profiles} templates={templates}
          currentWeekShifts={shifts.filter(s => {
            const ws = weeks[0]; if (!ws) return false;
            const we = addDays(ws, 6);
            return s.shiftDate >= isoDate(ws) && s.shiftDate <= isoDate(we);
          })}
          currentWeekStart={isoDate(weekStart)}
          onTemplatesChange={setTemplates}
          onApplied={() => { void fetchShifts(fetchFrom, fetchTo); }}
          onClose={() => setShowTemplates(false)}
        />
      )}
    </section>
  );
}
