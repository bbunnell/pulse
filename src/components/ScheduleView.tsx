"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Copy, Pencil, Plus, RefreshCw, X } from "lucide-react";
import type { Profile, ScheduleRule, ScheduleTemplate, ScheduledShift, TimeOffEntry } from "@/lib/types";
import { profileName } from "@/lib/status";
import { convertShiftTime, tzAbbr } from "@/lib/timezone";
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

// ── Shift card ─────────────────────────────────────────────────────────────────
interface ShiftCardProps {
  shift: ScheduledShift;
  profile: Profile | undefined;
  canEdit: boolean;
  compact: boolean;
  scheduleTz: string;
  hasConflict: boolean;
  onDelete(id: string): void;
  onEdit(shift: ScheduledShift): void;
}

function ShiftCard({ shift, profile, canEdit, compact, scheduleTz, hasConflict, onDelete, onEdit }: ShiftCardProps) {
  const color     = profileColor(shift.profileId);
  const overnight = crossesMidnight(shift.startTime, shift.endTime);
  const initials  = profile ? `${profile.firstName[0]??''}${profile.lastName[0]??''}`.toUpperCase() : "?";
  const name      = profile ? profileName(profile) : "Unknown";
  const empTz     = profile?.timezone;

  // Times are stored in the schedule reference tz. Secondary = the employee's local time.
  const showSecondary = Boolean(empTz && empTz !== scheduleTz);
  const converted = showSecondary ? convertShiftTime(shift.shiftDate, shift.startTime, scheduleTz, empTz!) : null;
  const convertedEnd = showSecondary ? convertShiftTime(
    overnight ? isoDate(addDays(new Date(shift.shiftDate), 1)) : shift.shiftDate,
    shift.endTime, scheduleTz, empTz!
  ) : null;

  return (
    <div className={`shift-card${compact ? " shift-card-compact" : ""}`}
         style={{ borderLeftColor: color.border, background: color.bg }}>
      <span className="shift-card-avatar" style={{ background: color.border, color: "#fff" }}>
        {initials}
      </span>
      <div className="shift-card-body" style={{ color: color.text }}>
        <div className="shift-card-name">
          {name}
          {shift.ruleId && <span className="shift-recurring-dot" title="Recurring">↻</span>}
          {hasConflict && <span className="shift-conflict-dot" title="PTO conflict — shift needs coverage">⚠</span>}
          {shift.isOpen && <span className="shift-open-dot" title="Open shift — needs coverage">OPEN</span>}
        </div>
        {/* Primary time — schedule reference timezone (how the schedule is authored) */}
        <div className="shift-card-time">
          {formatTime(shift.startTime)}–{formatTime(shift.endTime)}
          {overnight && <span className="shift-overnight-badge">+1</span>}
          <span className="shift-tz-label">{tzAbbr(scheduleTz)}</span>
        </div>
        {/* Secondary time — the employee's local timezone */}
        {converted && convertedEnd && !compact && (
          <div className="shift-card-viewer-time">
            {converted.time}–{convertedEnd.time}
            <span className="shift-tz-label">{converted.abbr}</span>
          </div>
        )}
        {shift.label && !compact && <div className="shift-card-label">{shift.label}</div>}
      </div>
      {canEdit && (
        <div className="shift-actions">
          <button className="shift-action-btn" title="Edit" onClick={() => onEdit(shift)} type="button">
            <Pencil size={10}/>
          </button>
          <button className="shift-action-btn" title="Remove" onClick={() => onDelete(shift.id)} type="button">
            <X size={10}/>
          </button>
        </div>
      )}
    </div>
  );
}

// ── Add-shift modal ────────────────────────────────────────────────────────────
const COMMON_LABELS = ["Overnight", "Morning", "Day", "Evening", "On-call"];

interface ModalProps {
  profiles: Profile[];
  defaultDate: string;
  scheduleTz: string;
  onSave(data: Omit<ScheduledShift, "id"|"createdAt"|"updatedAt">): Promise<void>;
  onClose(): void;
}

function AddShiftModal({ profiles, defaultDate, scheduleTz, onSave, onClose }: ModalProps) {
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "");
  const [shiftDate, setShiftDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime,   setEndTime]   = useState("17:00");
  const [label,     setLabel]     = useState("");
  const [notes,     setNotes]     = useState("");
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");
  const overlayRef = useRef<HTMLDivElement>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profileId || !shiftDate || !startTime || !endTime) { setError("All fields are required."); return; }
    setSaving(true); setError("");
    try {
      await onSave({ profileId, shiftDate, startTime, endTime, isOpen: false,
                     label: label || undefined, notes: notes || undefined, createdBy: undefined });
      onClose();
    } catch { setError("Failed to save. Please try again."); }
    setSaving(false);
  }

  return (
    <div className="schedule-modal-overlay" ref={overlayRef}
         onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}>
      <div className="schedule-modal">
        <div className="schedule-modal-header">
          <h3>Add Shift</h3>
          <button className="icon-btn" onClick={onClose} type="button"><X size={16}/></button>
        </div>
        <form onSubmit={handleSave} className="schedule-modal-body">
          <div className="control">
            <label htmlFor="sm-profile">Person</label>
            <select className="select" id="sm-profile" value={profileId}
                    onChange={(e) => setProfileId(e.target.value)} required>
              {profiles.map((p) => <option key={p.id} value={p.id}>{profileName(p)}</option>)}
            </select>
          </div>
          <div className="control">
            <label htmlFor="sm-date">Date</label>
            <input className="input" id="sm-date" type="date" value={shiftDate}
                   onChange={(e) => setShiftDate(e.target.value)} required/>
          </div>
          <div className="schedule-modal-row">
            <div className="control" style={{ flex: 1 }}>
              <label htmlFor="sm-start">Start</label>
              <input className="input" id="sm-start" type="time" value={startTime}
                     onChange={(e) => setStartTime(e.target.value)} required/>
            </div>
            <div className="control" style={{ flex: 1 }}>
              <label htmlFor="sm-end">End</label>
              <input className="input" id="sm-end" type="time" value={endTime}
                     onChange={(e) => setEndTime(e.target.value)} required/>
            </div>
          </div>
          <p className="subtle" style={{ fontSize: 11, marginTop: -4 }}>
            Times are in <strong>{tzAbbr(scheduleTz)}</strong> (the schedule timezone).
          </p>
          {crossesMidnight(startTime, endTime) && (
            <p className="schedule-midnight-hint">↻ Crosses midnight — ends the following day</p>
          )}
          <div className="control">
            <label>Label <span className="subtle">(optional)</span></label>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:6 }}>
              {COMMON_LABELS.map((l) => (
                <button key={l} type="button"
                        className={`schedule-label-chip${label===l?" selected":""}`}
                        onClick={() => setLabel(label===l?"":l)}>{l}</button>
              ))}
            </div>
            <input className="input" value={label} onChange={(e) => setLabel(e.target.value)}
                   placeholder="e.g. On-call, NOC, Graveyard…"/>
          </div>
          <div className="control">
            <label>Notes <span className="subtle">(optional)</span></label>
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)}
                   placeholder="e.g. CA: 9PM–6AM / Manila: 1PM–10PM"/>
          </div>
          {error && <p className="error-line">{error}</p>}
          <div className="schedule-modal-footer">
            <button className="button secondary" type="button" onClick={onClose}>Cancel</button>
            <button className="button primary" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Add Shift"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Week row ───────────────────────────────────────────────────────────────────
interface WeekRowProps {
  weekStart: Date;
  shifts: ScheduledShift[];
  profiles: Profile[];
  timeOff: TimeOffEntry[];
  today: string;
  canEdit: boolean;
  compact: boolean;
  showWeekLabel: boolean;
  showHeatmap: boolean;
  scheduleTz: string;
  onAddClick(date: string): void;
  onDelete(id: string): void;
  onEdit(shift: ScheduledShift): void;
}

function WeekRow({ weekStart, shifts, profiles, timeOff, today, canEdit, compact, showWeekLabel, showHeatmap, scheduleTz, onAddClick, onDelete, onEdit }: WeekRowProps) {
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
          const dayShifts = shifts
            .filter((s) => s.shiftDate === dateStr)
            .sort((a, b) => a.startTime.localeCompare(b.startTime));

          return (
            <div key={dateStr} className={`schedule-day-col${isToday?" is-today":""}`}>
              <div className={`schedule-day-header${isToday?" is-today":""}`}>
                <div className="schedule-day-name">{DAY_NAMES[day.getDay()]}</div>
                <div className={`schedule-day-date${isToday?" is-today":""}`}>{day.getDate()}</div>
                {!compact && <div className="schedule-day-month">{MONTH_NAMES[day.getMonth()]}</div>}
              </div>
              <div className="schedule-day-body">
                {dayShifts.length === 0 && (
                  <div className="schedule-day-empty">No shifts</div>
                )}
                {dayShifts.map((shift) => {
                  const hasConflict = timeOff.some(t =>
                    t.userId === shift.profileId && t.status === "approved" &&
                    dateStr >= t.startAt.slice(0,10) && dateStr <= t.endAt.slice(0,10)
                  );
                  return (
                    <ShiftCard key={shift.id} shift={shift}
                               profile={profiles.find((p) => p.id === shift.profileId)}
                               canEdit={canEdit} compact={compact} scheduleTz={scheduleTz}
                               hasConflict={hasConflict}
                               onDelete={onDelete} onEdit={onEdit}/>
                  );
                })}
              </div>
              {canEdit && (
                <button className="schedule-add-day-btn" type="button"
                        onClick={() => onAddClick(dateStr)}
                        title={`Add shift for ${DAY_NAMES[day.getDay()]} ${day.getDate()}`}>
                  <Plus size={11}/> Add
                </button>
              )}
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
  allShifts:  ScheduledShift[];  // includes yesterday for overnight carry-overs
  profiles:   Profile[];
  timeOff:    TimeOffEntry[];
  canEdit:    boolean;
  scheduleTz:   string;
  onEdit(shift: ScheduledShift): void;
  onDelete(id: string): void;
  onAddClick(date: string): void;
}

function DayTimelineView({
  dayDate, allShifts, profiles, timeOff, canEdit, scheduleTz, onEdit, onDelete, onAddClick,
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
    shift:         ScheduledShift;
    profile:       Profile | undefined;
    startMin:      number;
    endMin:        number;    // capped at 24*60 for tonight-spanning shifts
    isCarryOver:   boolean;
    continuesNext: boolean;
    hasPto:        boolean;
    col:           number;
    totalCols:     number;
  }

  // Build raw blocks
  const raw: Omit<Block, "col" | "totalCols">[] = [
    ...carryoverShifts.map(s => ({
      shift:         s,
      profile:       profiles.find(p => p.id === s.profileId),
      startMin:      0,
      endMin:        toMin(s.endTime),
      isCarryOver:   true,
      continuesNext: false,
      hasPto:        false,
    })),
    ...todayShifts.map(s => {
      const overnight = crossesMidnight(s.startTime, s.endTime);
      return {
        shift:         s,
        profile:       profiles.find(p => p.id === s.profileId),
        startMin:      toMin(s.startTime),
        endMin:        overnight ? 24 * 60 : toMin(s.endTime),
        isCarryOver:   false,
        continuesNext: overnight,
        hasPto:        timeOff.some(t =>
          t.userId === s.profileId && t.status === "approved" &&
          dayDate >= t.startAt.slice(0, 10) && dayDate <= t.endAt.slice(0, 10),
        ),
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

  // Current time indicator
  const now    = new Date();
  const isToday = dayDate === isoDate(now);
  const nowMin  = isToday ? now.getHours() * 60 + now.getMinutes() : -1;

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
          {canEdit && (
            <button className="button primary" type="button" onClick={() => onAddClick(dayDate)}>
              <Plus size={13}/> Add Shift
            </button>
          )}
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
            const color    = profileColor(b.shift.profileId);
            const empTz    = b.profile?.timezone ?? scheduleTz;
            const h        = Math.max((b.endMin - b.startMin) * MIN_PX - 2, 48);
            const wPct     = 100 / b.totalCols;
            const showTz   = empTz !== scheduleTz;

            const srcDate  = b.isCarryOver ? prevDay : b.shift.shiftDate;
            const endDate  = b.continuesNext
              ? isoDate(addDays(new Date(b.shift.shiftDate + "T00:00:00"), 1))
              : b.shift.shiftDate;

            const cvtStart = showTz ? convertShiftTime(srcDate, b.isCarryOver ? "00:00" : b.shift.startTime, scheduleTz, empTz) : null;
            const cvtEnd   = showTz ? convertShiftTime(endDate, b.continuesNext ? "23:59" : b.shift.endTime, scheduleTz, empTz) : null;

            const name = b.profile ? profileName(b.profile) : "Unknown";

            return (
              <div key={b.shift.id}
                className={`day-shift-block${b.isCarryOver ? " carryover" : ""}${b.hasPto ? " pto-conflict" : ""}${b.shift.isOpen ? " open-shift" : ""}`}
                style={{
                  top:             b.startMin * MIN_PX + 1,
                  height:          h,
                  left:            `calc(${b.col * wPct}% + 2px)`,
                  width:           `calc(${wPct}% - 4px)`,
                  borderLeftColor: color.border,
                  background:      color.bg,
                  color:           color.text,
                }}>

                {/* ── Header row: name + action buttons always visible ── */}
                <div className="day-shift-header">
                  <span className="day-shift-name-text" title={name}>{name}</span>
                  {canEdit && (
                    <div className="day-shift-btns">
                      <button type="button" className="day-shift-btn" title="Edit shift"
                              onClick={() => onEdit(b.shift)}>
                        <Pencil size={11}/>
                      </button>
                      <button type="button" className="day-shift-btn" title="Remove shift"
                              onClick={() => onDelete(b.shift.id)}>
                        <X size={11}/>
                      </button>
                    </div>
                  )}
                </div>

                {/* ── Badges (status indicators) ── */}
                <div className="day-shift-badges">
                  {b.shift.ruleId  && <span className="dsb"       title="Recurring shift">↻ Recurring</span>}
                  {b.hasPto        && <span className="dsb pto"   title="Employee has PTO this day">⚠ PTO conflict</span>}
                  {b.shift.isOpen  && <span className="dsb open"  title="This shift needs coverage">OPEN</span>}
                  {b.isCarryOver   && <span className="dsb carry" title="Started previous day">← from prev day</span>}
                  {b.continuesNext && <span className="dsb carry" title="Ends next day">→ continues next day</span>}
                </div>

                {/* ── Primary time (schedule reference timezone) ── */}
                <div className="day-shift-time">
                  <strong>
                    {b.isCarryOver ? "12:00am" : formatTime(b.shift.startTime)}
                    {" – "}
                    {b.continuesNext ? "midnight" : formatTime(b.shift.endTime)}
                  </strong>
                  <span className="shift-tz-label">{tzAbbr(scheduleTz)}</span>
                </div>

                {/* ── Secondary time (employee's local timezone, if different) ── */}
                {showTz && cvtStart && cvtEnd && (
                  <div className="day-shift-viewer-time">
                    {cvtStart.time}–{cvtEnd.time}
                    <span className="shift-tz-label">{cvtStart.abbr}</span>
                  </div>
                )}

                {/* ── Label ── */}
                {b.shift.label && h > 90 && (
                  <div className="day-shift-label">{b.shift.label}</div>
                )}

                {/* ── Notes ── */}
                {b.shift.notes && h > 120 && (
                  <div className="day-shift-notes">{b.shift.notes}</div>
                )}
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
}

export function ScheduleView({ profiles, timeOff, canEdit, scheduleTz }: Props) {
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

  function prevPeriod() {
    setAnchorDate(w => viewMode === "day" ? addDays(w, -1) : addDays(w, -(viewMode as number) * 7));
  }
  function nextPeriod() {
    setAnchorDate(w => viewMode === "day" ? addDays(w, 1) : addDays(w, (viewMode as number) * 7));
  }
  function goToday() {
    setAnchorDate(viewMode === "day" ? new Date() : mondayOf(new Date()));
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
        {canEdit && (
          <button className="button primary" onClick={() => setModalDate(today)} type="button">
            <Plus size={14}/> Add Shift
          </button>
        )}
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
            <button type="button" className={`schedule-tool-btn${showRules?" active":""}`}
                    onClick={()=>{setShowRules(v=>!v);setShowReassign(false);setShowTemplates(false);setShowCopyWeek(false);}}>
              <RefreshCw size={13}/> Recurring Rules {rules.length > 0 && <span className="tool-badge">{rules.length}</span>}
            </button>
            <button type="button" className={`schedule-tool-btn${showCopyWeek?" active":""}`}
                    onClick={()=>{setShowCopyWeek(v=>!v);setShowRules(false);setShowReassign(false);setShowTemplates(false);}}>
              <Copy size={13}/> Copy Week
            </button>
            <button type="button" className="schedule-tool-btn"
                    onClick={()=>{setShowReassign(true);setShowRules(false);setShowTemplates(false);}}>
              Bulk Reassign
            </button>
            <button type="button" className="schedule-tool-btn"
                    onClick={()=>{setShowTemplates(true);setShowRules(false);setShowReassign(false);}}>
              Templates {templates.length > 0 && <span className="tool-badge">{templates.length}</span>}
            </button>
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
          />
        )}

        {/* ── Main view ── */}
        {viewMode === "day" ? (
          <DayTimelineView
            dayDate={isoDate(weekStart)}
            allShifts={shifts}
            profiles={profiles}
            timeOff={timeOff}
            canEdit={canEdit}
            scheduleTz={scheduleTz}
            onEdit={setEditingShift}
            onDelete={handleDelete}
            onAddClick={setModalDate}
          />
        ) : (
          <div className={`schedule-weeks${showRules?" has-side-panel":""}`}>
            {weeks.map((ws) => (
              <WeekRow key={isoDate(ws)} weekStart={ws} shifts={shifts} profiles={profiles}
                       timeOff={timeOff} today={today} canEdit={canEdit} compact={compact}
                       showWeekLabel={(viewMode as number) > 1} showHeatmap={showHeatmap} scheduleTz={scheduleTz}
                       onAddClick={setModalDate} onDelete={handleDelete} onEdit={setEditingShift}/>
            ))}
          </div>
        )}

        {/* ── Legend (week views only) ── */}
        {viewMode !== "day" && profiles.length > 0 && (
          <div className="schedule-legend">
            {profiles.map((p) => {
              const color = profileColor(p.id);
              const count = shifts.filter((s) => s.profileId === p.id).length;
              return (
                <div key={p.id} className="schedule-legend-item">
                  <span className="schedule-legend-dot" style={{ background: color.border }}/>
                  <span style={{ color: color.text, fontWeight: 500 }}>{profileName(p)}</span>
                  {count > 0 && <span className="subtle" style={{ fontSize:11 }}>·&nbsp;{count}</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {modalDate !== null && (
        <AddShiftModal profiles={profiles} defaultDate={modalDate} scheduleTz={scheduleTz}
                       onSave={handleSave} onClose={() => setModalDate(null)}/>
      )}
      {editingShift && (
        <EditShiftModal shift={editingShift} profiles={profiles} scheduleTz={scheduleTz}
                        onSave={handleEditSave} onClose={() => setEditingShift(null)}/>
      )}
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
