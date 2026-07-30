"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Coffee,
  Clock,
  LogIn,
  LogOut,
  Search,
  ShieldAlert,
  TimerReset,
  Utensils,
} from "lucide-react";

import { StatusBadge } from "@/components/StatusBadge";
import { UserAvatar } from "@/components/UserAvatar";
import { DashboardSchedule } from "@/components/DashboardSchedule";
import type {
  AttendanceSnapshot,
  OrgData,
  Role,
  ScheduledShift,
  SegmentType,
  Shift,
  ShiftSegment,
  TimeOffEntry,
} from "@/lib/types";
import { buildAttendanceSnapshots, buildCoverage, buildSummary, profileName, type StaffingRuleLike } from "@/lib/status";
import { InfoTooltip } from "@/components/InfoTooltip";
import { activeSegmentForShift, formatClock, formatDuration, formatShortDate, openShiftForUser } from "@/lib/time";
import { convertShiftTime, tzAbbr } from "@/lib/timezone";

interface StaffingRule extends StaffingRuleLike { id: string; name: string }

interface Props {
  data: OrgData;
  scheduledShifts: ScheduledShift[];
  staffingRules: StaffingRule[];
  currentUserId?: string;
  userRole: Role | null;
  orgTimezone?: string;
}

const POLL_MS = 30_000;

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt12(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suf = h < 12 ? "am" : "pm";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12}${suf}` : `${h12}:${String(m).padStart(2, "0")}${suf}`;
}

function relativeTime(iso: string, now: Date): string {
  const mins = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface ActivityEvent {
  id: string;
  userId: string;
  kind: "punch_in" | "punch_out" | "break_start" | "break_end" | "lunch_start" | "lunch_end";
  at: string;
}

function buildActivity(shifts: Shift[], segments: ShiftSegment[]): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  for (const s of shifts) {
    events.push({ id: `${s.id}-in`, userId: s.userId, kind: "punch_in", at: s.punchInAt });
    if (s.punchOutAt) events.push({ id: `${s.id}-out`, userId: s.userId, kind: "punch_out", at: s.punchOutAt });
  }
  for (const seg of segments) {
    events.push({ id: `${seg.id}-s`, userId: seg.userId, kind: `${seg.segmentType}_start` as ActivityEvent["kind"], at: seg.startAt });
    if (seg.endAt) events.push({ id: `${seg.id}-e`, userId: seg.userId, kind: `${seg.segmentType}_end` as ActivityEvent["kind"], at: seg.endAt });
  }
  return events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

const ACTIVITY_LABEL: Record<ActivityEvent["kind"], string> = {
  punch_in: "punched in",
  punch_out: "punched out",
  break_start: "started a break",
  break_end: "ended break",
  lunch_start: "went to lunch",
  lunch_end: "back from lunch",
};

// ── Component ────────────────────────────────────────────────────────────────────

export function TeamDashboard({ data, scheduledShifts, staffingRules, currentUserId, userRole, orgTimezone = "America/Chicago" }: Props) {
  const [teamId, setTeamId] = useState("all");
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [editingTimeOff,  setEditingTimeOff]  = useState<TimeOffEntry | null>(null);
  const [timeOffSaving,   setTimeOffSaving]   = useState(false);
  const [markingTimeOff,  setMarkingTimeOff]  = useState<AttendanceSnapshot | null>(null);
  const [markTimeOffType, setMarkTimeOffType] = useState<"sick" | "vacation" | "business_trip">("sick");
  const [markTimeOffMode, setMarkTimeOffMode] = useState<"today" | "range">("today");
  const [markStartDate,   setMarkStartDate]   = useState("");
  const [markEndDate,     setMarkEndDate]     = useState("");
  const [markNotes,       setMarkNotes]       = useState("");
  const [markSaving,      setMarkSaving]      = useState(false);

  // Live data — seeded from server props, refreshed by polling without a full reload.
  const [live, setLive] = useState<{
    shifts: Shift[];
    segments: ShiftSegment[];
    timeOff: TimeOffEntry[];
    scheduledShifts: ScheduledShift[];
    staffingRules: StaffingRule[];
  }>({
    shifts: data.shifts,
    segments: data.segments,
    timeOff: data.timeOff,
    scheduledShifts,
    staffingRules,
  });

  // Clock — synced to the server clock so all viewers agree.
  const offsetRef = useRef(0); // serverTime - clientTime (ms)
  const [now, setNow] = useState<Date | null>(null);

  const refreshLive = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/live", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as {
        shifts: Shift[]; segments: ShiftSegment[]; timeOff: TimeOffEntry[];
        scheduledShifts: ScheduledShift[]; staffingRules: StaffingRule[]; serverTime: string;
      };
      offsetRef.current = new Date(json.serverTime).getTime() - Date.now();
      setLive({
        shifts: json.shifts, segments: json.segments,
        timeOff: json.timeOff, scheduledShifts: json.scheduledShifts,
        staffingRules: json.staffingRules ?? [],
      });
    } catch { /* keep last good data */ }
  }, []);

  // Tick the displayed clock every second (cheap, local).
  useEffect(() => {
    setNow(new Date(Date.now() + offsetRef.current));
    const tick = window.setInterval(() => setNow(new Date(Date.now() + offsetRef.current)), 1000);
    return () => window.clearInterval(tick);
  }, []);

  // Poll live data, but only while the tab is visible.
  useEffect(() => {
    let timer: number | undefined;
    const start = () => { timer = window.setInterval(() => { if (!document.hidden) void refreshLive(); }, POLL_MS); };
    const onVis = () => { if (!document.hidden) void refreshLive(); };
    void refreshLive();
    start();
    document.addEventListener("visibilitychange", onVis);
    return () => { if (timer) window.clearInterval(timer); document.removeEventListener("visibilitychange", onVis); };
  }, [refreshLive]);

  const nowSafe = now ?? new Date();

  // Build snapshots for ALL profiles (so the clock widget works even for hidden users).
  const allSnapshots = useMemo(
    () => buildAttendanceSnapshots({
      profiles: data.profiles,
      teams: data.teams,
      shifts: live.shifts,
      segments: live.segments,
      timeOff: live.timeOff,
      scheduledShifts: live.scheduledShifts,
      scheduleTz: orgTimezone,
      now: nowSafe,
    }),
    [data.profiles, data.teams, live, orgTimezone, nowSafe],
  );

  const snapshotById = useMemo(() => {
    const m = new Map<string, AttendanceSnapshot>();
    for (const s of allSnapshots) m.set(s.profile.id, s);
    return m;
  }, [allSnapshots]);

  // Board: only dashboard-visible profiles, after team + search filters.
  const boardSnapshots = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allSnapshots.filter((s) => {
      if (s.profile.showOnDashboard === false) return false;
      if (teamId !== "all" && s.profile.teamId !== teamId) return false;
      if (q && !profileName(s.profile).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allSnapshots, teamId, search]);

  const summary = useMemo(() => buildSummary(boardSnapshots), [boardSnapshots]);

  // Coverage: now-lists from dashboard snapshots; gap detection from ALL scheduled shifts.
  const coverage = useMemo(
    () => buildCoverage(boardSnapshots, live.scheduledShifts, data.profiles, orgTimezone, nowSafe, live.staffingRules),
    [boardSnapshots, live.scheduledShifts, data.profiles, orgTimezone, nowSafe, live.staffingRules],
  );

  const groups = useMemo(() => {
    const working: AttendanceSnapshot[] = [];
    const onBreak: AttendanceSnapshot[] = [];
    const out: AttendanceSnapshot[] = [];
    const late: AttendanceSnapshot[] = [];
    const offToday: AttendanceSnapshot[] = [];
    const notIn: AttendanceSnapshot[] = [];
    for (const s of boardSnapshots) {
      if (s.status === "available") working.push(s);
      else if (s.status === "on_break" || s.status === "at_lunch") onBreak.push(s);
      else if (s.status === "out_sick" || s.status === "on_vacation" || s.status === "on_business_trip") out.push(s);
      else if (s.isLate) {
        // Don't flag "late" for people who should only appear when active
        if (!s.profile.hideWhenNotActive) late.push(s);
      }
      else if (!s.scheduledToday) {
        // Standard workers on non-work days are just off — don't list them
        // Neither are people set to "hide when not active"
        const suppress = s.profile.workScheduleType === "standard"
                      || s.profile.hideWhenNotActive;
        if (!suppress) offToday.push(s);
      }
      else if (!s.profile.hideWhenNotActive) notIn.push(s);
    }
    return { working, onBreak, out, late, offToday, notIn };
  }, [boardSnapshots]);

  const activity = useMemo(() => buildActivity(live.shifts, live.segments).slice(0, 8), [live.shifts, live.segments]);

  // Current user (reliable — no profiles[0] fallback).
  const activeUser = currentUserId ? data.profiles.find((p) => p.id === currentUserId) : undefined;
  const activeSnapshot = activeUser ? snapshotById.get(activeUser.id) : undefined;
  const activeShift = activeUser ? openShiftForUser(live.shifts, activeUser.id) : undefined;
  const activeSegment = activeShift ? activeSegmentForShift(live.segments, activeShift.id) : undefined;
  const canManage = userRole === "admin" || userRole === "manager";

  // Current user's upcoming scheduled shifts (next 7 days).
  const myUpcoming = useMemo(() => {
    if (!activeUser) return [];
    return live.scheduledShifts
      .filter((s) => s.profileId === activeUser.id)
      .sort((a, b) => (a.shiftDate + a.startTime).localeCompare(b.shiftDate + b.startTime))
      .slice(0, 3);
  }, [activeUser, live.scheduledShifts]);

  // ── API helpers ─────────────────────────────────────────────
  async function clockAction(url: string, body: Record<string, string>) {
    setActionLoading(true);
    setActionError("");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) { setActionError(json.error ?? "Request failed"); return null; }
      await refreshLive();
      return json;
    } catch {
      setActionError("Network error");
      return null;
    } finally {
      setActionLoading(false);
    }
  }

  const handlePunchIn  = () => clockAction("/api/time-clock/punch", { action: "punch_in" });
  const handlePunchOut = () => clockAction("/api/time-clock/punch", { action: "punch_out" });
  const handleStartSegment = (t: SegmentType) => clockAction("/api/time-clock/segment", { action: `start_${t}` });
  const handleEndSegment = () => activeSegment && clockAction("/api/time-clock/segment", { action: `end_${activeSegment.segmentType}` });
  const handleForcePunchOut = (profileId: string) => clockAction("/api/time-clock/admin-punch", { profileId, action: "punch_out" });
  const handleForcePunchIn  = (profileId: string) => clockAction("/api/time-clock/admin-punch", { profileId, action: "punch_in" });

  function openMarkTimeOff(snapshot: AttendanceSnapshot) {
    const today = new Date().toISOString().slice(0, 10);
    setMarkingTimeOff(snapshot);
    setMarkTimeOffType("sick");
    setMarkTimeOffMode("today");
    setMarkStartDate(today);
    setMarkEndDate(today);
    setMarkNotes("");
  }

  async function handleMarkTimeOffSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!markingTimeOff) return;
    setMarkSaving(true);
    const start = markTimeOffMode === "today" ? new Date().toISOString().slice(0, 10) : markStartDate;
    const end   = markTimeOffMode === "today" ? start : (markEndDate || start);
    await fetch("/api/admin/time-off", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: markingTimeOff.profile.id,
        timeOffType: markTimeOffType,
        startDate: start,
        endDate: end,
        notes: markNotes || undefined,
      }),
    });
    setMarkSaving(false);
    setMarkingTimeOff(null);
    await refreshLive();
  }

  async function handleDeleteTimeOff(id: string) {
    if (!confirm("Delete this time-off entry?")) return;
    await fetch(`/api/admin/time-off/${id}`, { method: "DELETE" });
    await refreshLive();
  }

  async function handleSaveTimeOff(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingTimeOff) return;
    setTimeOffSaving(true);
    const fd = new FormData(e.currentTarget);
    await fetch(`/api/admin/time-off/${editingTimeOff.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timeOffType: fd.get("timeOffType"),
        startAt: `${fd.get("startDate")}T00:00:00.000Z`,
        endAt: `${fd.get("endDate")}T23:59:59.000Z`,
        notes: fd.get("notes") || undefined,
      }),
    });
    setTimeOffSaving(false);
    setEditingTimeOff(null);
    await refreshLive();
  }

  // ── All roles see the full team board ────────────────────────
  // Employees can see who is working / out across the team.
  // Personal punch-in/out is handled by the My Clock widget in the sidebar.
  // Force-punch buttons are only rendered for managers and admins (canManage).
  function popOutMonitor() {
    window.open(
      "/monitor",
      "teampulse-monitor",
      "width=340,height=580,resizable=yes,scrollbars=yes,menubar=no,toolbar=no,location=no,status=no",
    );
  }

  return (
    <section className="page-shell">
      {/* Summary stat bar + pop-out button */}
      <div className="dash-summary-row" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 0 }}>
        <div className="dash-summary-bar" style={{ flex: 1, marginBottom: 0 }}>
        <SummaryStat label="Scheduled" value={summary.scheduledNow} tone="blue" />
        <SummaryStat label="Clocked In" value={summary.working} tone="green" />
        <SummaryStat label="On break" value={summary.onBreakOrLunch} tone="amber" />
        <SummaryStat label="Out" value={summary.out} tone="red" />
          {canManage && <SummaryStat label="Late" value={summary.late} tone={summary.late > 0 ? "red" : "gray"} />}
          {canManage && <SummaryStat label="Missing punch" value={summary.missingPunches} tone={summary.missingPunches > 0 ? "amber" : "gray"} />}
        </div>
        <button
          type="button"
          className="button secondary monitor-popout-btn"
          onClick={popOutMonitor}
          title="Open compact monitor in a separate window"
        >
          ⧉ Monitor
        </button>
      </div>

      {/* Coverage gap banner */}
      {coverage.gapHours.length > 0 && (
        <div className="coverage-gap-banner">
          <ShieldAlert size={16} />
          <span>
            <strong>Coverage gap{coverage.gapHours.length > 1 ? "s" : ""} today:</strong>{" "}
            {coverage.gapHours.map((h) => fmt12(`${String(h).padStart(2, "0")}:00`)).join(", ")} — no one scheduled.
          </span>
        </div>
      )}

      {/* Understaffed banner (covered but below minimum) */}
      {coverage.understaffed.length > 0 && (
        <div className="coverage-understaffed-banner">
          <ShieldAlert size={16} />
          <span>
            <strong>Below minimum staffing:</strong>{" "}
            {coverage.understaffed
              .map((u) => `${fmt12(`${String(u.hour).padStart(2, "0")}:00`)} (${u.scheduled}/${u.required})`)
              .join(", ")}
          </span>
        </div>
      )}

<div className="dash-body">
        <div className="dash-main">
          {/* Scheduled Now — only people scheduled this moment who have NOT clocked in */}
          {(() => {
            const scheduledNotIn = coverage.scheduledNow.filter(s =>
              s.status !== "available" && s.status !== "on_break" && s.status !== "at_lunch"
              && s.status !== "out_sick" && s.status !== "on_vacation" && s.status !== "on_business_trip"
            );
            if (!scheduledNotIn.length) return null;
            return (
              <div className="status-group">
                <div className="status-group-heading">
                  <span className="status-dot-lg blue" />
                  <h2>Scheduled Now <InfoTooltip text="People whose shift window covers this moment but who haven't clocked in yet." /></h2>
                  <span className="status-count blue">{scheduledNotIn.length}</span>
                </div>
                <div className="attend-grid list-view">
                  {scheduledNotIn.map((s) => (
                    <AttendCard key={s.profile.id} snapshot={s} orgTimezone={orgTimezone}
                      canManage={canManage} actionLoading={actionLoading} now={nowSafe}
                      onForcePunchIn={handleForcePunchIn} onForcePunchOut={handleForcePunchOut}
                      onMarkTimeOff={openMarkTimeOff} />
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Clocked In — everyone actively on the clock, including on break/lunch */}
          {(groups.working.length > 0 || groups.onBreak.length > 0) && (
            <div className="status-group">
              <div className="status-group-heading">
                <span className="status-dot-lg green" />
                <h2>Clocked In <InfoTooltip text="Everyone actively on the clock right now. Break and lunch status shown inline." /></h2>
                <span className="status-count green">{groups.working.length + groups.onBreak.length}</span>
              </div>
              <div className="attend-grid list-view">
                {[...groups.working, ...groups.onBreak]
                  .sort((a, b) => {
                    const na = `${a.profile.lastName} ${a.profile.firstName}`.toLowerCase();
                    const nb = `${b.profile.lastName} ${b.profile.firstName}`.toLowerCase();
                    return na.localeCompare(nb);
                  })
                  .map((s) => (
                  <AttendCard key={s.profile.id} snapshot={s} orgTimezone={orgTimezone} canManage={canManage} actionLoading={actionLoading} now={nowSafe} onForcePunchOut={handleForcePunchOut} />
                ))}
              </div>
            </div>
          )}

          {/* Late / Not Clocked In — exclude anyone already shown in Scheduled Now */}
          {(() => {
            const scheduledNowIds = new Set(coverage.scheduledNow.map(s => s.profile.id));
            const lateNotScheduled = groups.late.filter(s => !scheduledNowIds.has(s.profile.id));
            if (!canManage || !lateNotScheduled.length) return null;
            return (
              <div className="status-group">
                <div className="status-group-heading">
                  <span className="status-dot-lg red" />
                  <h2>Late / Not Clocked In <InfoTooltip text="Overdue to clock in but outside a scheduled shift window. Use 'Clock in ↩' to log them in manually." /></h2>
                  <span className="status-count red">{lateNotScheduled.length}</span>
                </div>
                <div className="attend-grid list-view">
                  {lateNotScheduled.map((s) => <AttendCard key={s.profile.id} snapshot={s} orgTimezone={orgTimezone} canManage={canManage} actionLoading={actionLoading} now={nowSafe} onForcePunchIn={handleForcePunchIn} onMarkTimeOff={openMarkTimeOff} />)}
                </div>
              </div>
            );
          })()}

          {/* Out today */}
          {groups.out.length > 0 && (
            <div className="status-group">
              <div className="status-group-heading">
                <span className="status-dot-lg red" />
                <h2>Out Today <InfoTooltip text="On approved vacation or sick leave today. Their time off is recorded in the system." /></h2>
                <span className="status-count red">{groups.out.length}</span>
              </div>
              <div className="attend-grid list-view">
                {groups.out.map((s) => <AttendCard key={s.profile.id} snapshot={s} orgTimezone={orgTimezone} canManage={canManage} actionLoading={actionLoading} now={nowSafe}
                  onDeleteTimeOff={handleDeleteTimeOff} onEditTimeOff={setEditingTimeOff} />)}
              </div>
            </div>
          )}

          {/* Not in (scheduled today, not yet on) */}
          {groups.notIn.length > 0 && (
            <div className="status-group">
              <div className="status-group-heading">
                <span className="status-dot-lg gray" />
                <h2>Not In Yet <InfoTooltip text="Has a scheduled shift today but hasn't clocked in yet. They may not have started their shift window or are about to arrive." /></h2>
                <span className="status-count gray">{groups.notIn.length}</span>
              </div>
              <div className="attend-grid list-view">
                {groups.notIn.map((s) => <AttendCard key={s.profile.id} snapshot={s} orgTimezone={orgTimezone} canManage={canManage} actionLoading={actionLoading} now={nowSafe} onForcePunchIn={handleForcePunchIn} onMarkTimeOff={openMarkTimeOff} />)}
              </div>
            </div>
          )}

          {/* Off today — compact inline chips */}
          {groups.offToday.length > 0 && (
            <div className="status-group">
              <div className="status-group-heading">
                <span className="status-dot-lg gray" />
                <h2>Off Today <InfoTooltip text="Not scheduled to work today. No action needed — shown for full team visibility." /></h2>
                <span className="status-count gray">{groups.offToday.length}</span>
              </div>
              <div className="off-today-chips">
                {groups.offToday.map((s) => (
                  <div key={s.profile.id} className="off-today-chip">
                    <UserAvatar
                      userId={s.profile.id}
                      firstName={s.profile.firstName}
                      lastName={s.profile.lastName}
                      className="avatar off-today-avatar"
                    />
                    <span>{profileName(s.profile)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Team Events */}
          <DashboardSchedule data={data} />
        </div>

        {/* Sidebar */}
        <aside className="dash-sidebar">
          <div className="dash-sidebar-controls">
            {now && (
              <div className="dash-sidebar-datetime">
                <Clock size={13} />
                <span>{formatClock(now)}</span>
                <span className="dash-sidebar-date">
                  {now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </span>
              </div>
            )}
            <div className="dash-search">
              <Search size={13} />
              <input className="dash-search-input" placeholder="Search people…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className="select dash-filter-select" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="all">All teams</option>
              {data.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          {/* Clock widget */}
          {activeUser && (
            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2>My Clock</h2>
                  {activeSnapshot && <StatusBadge status={activeSnapshot.status} />}
                </div>
              </div>
              <div className="clock-mini-body">
                <div className="clock-mini-user">
                  <UserAvatar userId={activeUser.id} firstName={activeUser.firstName} lastName={activeUser.lastName} />
                  <div>
                    <strong style={{ fontSize: 13, fontWeight: 600 }}>{profileName(activeUser)}</strong>
                    <small style={{ fontSize: 11, color: "var(--muted)", display: "block" }}>
                      {activeShift ? `In since ${formatClock(activeShift.punchInAt)}` : "Not clocked in"}
                    </small>
                  </div>
                </div>
                <div className="clock-mini-stats">
                  <div className="clock-mini-stat"><span>Break</span><strong>{formatDuration(activeSnapshot?.todayBreakMinutes ?? 0)}</strong></div>
                  <div className="clock-mini-stat"><span>Lunch</span><strong>{formatDuration(activeSnapshot?.todayLunchMinutes ?? 0)}</strong></div>
                </div>
                <div className="clock-mini-actions">
                  {!activeShift ? (
                    <button className="button primary" style={{ width: "100%" }} type="button" onClick={handlePunchIn} disabled={actionLoading}><LogIn size={14} /> Punch In</button>
                  ) : (
                    <>
                      <button className="button danger" style={{ width: "100%" }} type="button" onClick={handlePunchOut} disabled={Boolean(activeSegment) || actionLoading}><LogOut size={14} /> Punch Out</button>
                      {!activeSegment ? (
                        <div className="clock-mini-row">
                          <button className="button" type="button" onClick={() => handleStartSegment("break")} disabled={actionLoading}><Coffee size={13} /> Break</button>
                          <button className="button" type="button" onClick={() => handleStartSegment("lunch")} disabled={actionLoading}><Utensils size={13} /> Lunch</button>
                        </div>
                      ) : (
                        <button className="button warning" style={{ width: "100%" }} type="button" onClick={handleEndSegment} disabled={actionLoading}><TimerReset size={14} /> End {activeSegment.segmentType}</button>
                      )}
                    </>
                  )}
                  {actionError && <p className="error-line" style={{ margin: 0 }}>{actionError}</p>}
                  {activeSegment && <p className="warning-pill" style={{ justifyContent: "center" }}><AlertTriangle size={12} /> On {activeSegment.segmentType}</p>}
                </div>
              </div>
            </div>
          )}

          {/* Recent activity */}
          <div className="status-group">
            <div className="status-group-heading">
              <span className="status-dot-lg gray" />
              <h2>Recent Activity</h2>
            </div>
            {activity.length > 0 ? (
              <div className="activity-feed">
                {activity.map((ev) => {
                  const p = data.profiles.find((x) => x.id === ev.userId);
                  if (!p) return null;
                  return (
                    <div key={ev.id} className="activity-row">
                      <UserAvatar userId={p.id} firstName={p.firstName} lastName={p.lastName} className="activity-avatar" />
                      <span className="activity-text"><strong>{p.firstName}</strong> {ACTIVITY_LABEL[ev.kind]}</span>
                      <span className="activity-time" suppressHydrationWarning>{relativeTime(ev.at, nowSafe)}</span>
                    </div>
                  );
                })}
              </div>
            ) : <p className="dash-empty">No recent activity.</p>}
          </div>
        </aside>
      </div>

      {/* Mark time off modal */}
      {markingTimeOff && (
        <div className="schedule-modal-overlay" onClick={() => setMarkingTimeOff(null)}>
          <div className="schedule-modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div className="schedule-modal-header">
              <h3>Mark Time Off — {markingTimeOff.profile.firstName} {markingTimeOff.profile.lastName}</h3>
              <button className="icon-btn" type="button" onClick={() => setMarkingTimeOff(null)}>✕</button>
            </div>
            <form onSubmit={handleMarkTimeOffSubmit}>
              <div className="schedule-modal-body">
                <label className="field-label">Type
                  <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                    {(["sick", "vacation", "business_trip"] as const).map(t => (
                      <button key={t} type="button"
                        onClick={() => setMarkTimeOffType(t)}
                        style={{
                          flex: 1, padding: "7px 0", borderRadius: 6, fontSize: 13, fontWeight: 500,
                          border: "1px solid var(--border)", cursor: "pointer",
                          background: markTimeOffType === t ? "var(--blue)" : "var(--surface)",
                          color: markTimeOffType === t ? "#fff" : "var(--ink)",
                        }}>
                        {t === "sick" ? "🤒 Sick" : t === "vacation" ? "🏖 Vacation" : "✈️ Business Trip"}
                      </button>
                    ))}
                  </div>
                </label>
                <label className="field-label">Duration
                  <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                    {(["today", "range"] as const).map(m => (
                      <button key={m} type="button"
                        onClick={() => setMarkTimeOffMode(m)}
                        style={{
                          flex: 1, padding: "7px 0", borderRadius: 6, fontSize: 13, fontWeight: 500,
                          border: "1px solid var(--border)", cursor: "pointer",
                          background: markTimeOffMode === m ? "var(--blue)" : "var(--surface)",
                          color: markTimeOffMode === m ? "#fff" : "var(--ink)",
                        }}>
                        {m === "today" ? "Today only" : "Date range"}
                      </button>
                    ))}
                  </div>
                </label>
                {markTimeOffMode === "range" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <label className="field-label">Start date
                      <input type="date" className="field-input" style={{ marginTop: 4 }}
                             value={markStartDate} onChange={e => setMarkStartDate(e.target.value)} required />
                    </label>
                    <label className="field-label">End date
                      <input type="date" className="field-input" style={{ marginTop: 4 }}
                             value={markEndDate} min={markStartDate}
                             onChange={e => setMarkEndDate(e.target.value)} required />
                    </label>
                  </div>
                )}
                <label className="field-label">Notes
                  <input type="text" className="field-input" style={{ marginTop: 4 }}
                         value={markNotes} onChange={e => setMarkNotes(e.target.value)}
                         placeholder="Optional reason…" />
                </label>
              </div>
              <div className="schedule-modal-footer" style={{ padding: "0 20px 20px" }}>
                <button type="button" className="button" onClick={() => setMarkingTimeOff(null)}>Cancel</button>
                <button type="submit" className="button primary" disabled={markSaving}>
                  {markSaving ? "Saving…" : "Mark Out"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Time-off edit modal */}
      {editingTimeOff && (
        <div className="schedule-modal-overlay" onClick={() => setEditingTimeOff(null)}>
          <div className="schedule-modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className="schedule-modal-header">
              <h3>Edit Time Off</h3>
              <button className="icon-btn" type="button" onClick={() => setEditingTimeOff(null)}>✕</button>
            </div>
            <form onSubmit={handleSaveTimeOff}>
              <div className="schedule-modal-body">
                <label className="field-label">Type
                  <select name="timeOffType" defaultValue={editingTimeOff.timeOffType} className="field-input" style={{ marginTop: 4 }}>
                    <option value="vacation">Vacation</option>
                    <option value="sick">Sick</option>
                    <option value="business_trip">Business Trip</option>
                  </select>
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <label className="field-label">Start date
                    <input name="startDate" type="date" className="field-input" style={{ marginTop: 4 }}
                      defaultValue={editingTimeOff.startAt.slice(0, 10)} required />
                  </label>
                  <label className="field-label">End date
                    <input name="endDate" type="date" className="field-input" style={{ marginTop: 4 }}
                      defaultValue={editingTimeOff.endAt.slice(0, 10)} required />
                  </label>
                </div>
                <label className="field-label">Notes
                  <input name="notes" type="text" className="field-input" style={{ marginTop: 4 }}
                    defaultValue={editingTimeOff.notes ?? ""} placeholder="Optional" />
                </label>
              </div>
              <div className="schedule-modal-footer" style={{ padding: "0 20px 20px" }}>
                <button type="button" className="button" onClick={() => setEditingTimeOff(null)}>Cancel</button>
                <button type="submit" className="button primary" disabled={timeOffSaving}>
                  {timeOffSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Sub-components ───────────────────────────────────────────

const STAT_TIPS: Record<string, string> = {
  "Scheduled":     "Has a shift scheduled for this moment",
  "Clocked In":    "Has punched in and is actively on the clock",
  "On break":      "Clocked in, currently on break or lunch",
  "Out":           "On vacation or sick leave today",
  "Late":          "Scheduled now but not yet clocked in",
  "Missing punch": "Open shift older than 16h or scheduled but overdue",
};

function SummaryStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  const tip = STAT_TIPS[label];
  return (
    <div className="dash-summary-stat" title={tip}>
      <span className={`dash-summary-value ${tone}`}>{value}</span>
      <span className="dash-summary-label">{label}</span>
    </div>
  );
}

/**
 * Render a scheduled window in the schedule reference tz, with the employee's local
 * time as a secondary hint (mirrors the Excel's "CA … / Manila …" dual display).
 * Times are STORED in the schedule reference tz.
 */
function ScheduledTime({ snapshot, scheduleTz }: { snapshot: AttendanceSnapshot; scheduleTz: string }) {
  if (!snapshot.scheduledNow) return null;
  const s = snapshot.scheduledNow;
  const empTz = snapshot.profile.timezone ?? scheduleTz;
  const primary = `${fmt12(s.startTime)}–${fmt12(s.endTime)}`;

  let secondary: string | null = null;
  if (empTz !== scheduleTz) {
    const cs = convertShiftTime(s.shiftDate, s.startTime, scheduleTz, empTz);
    const overnight = s.endTime <= s.startTime;
    const endDate = overnight
      ? new Date(new Date(s.shiftDate + "T00:00:00").getTime() + 86_400_000).toISOString().slice(0, 10)
      : s.shiftDate;
    const ce = convertShiftTime(endDate, s.endTime, scheduleTz, empTz);
    if (cs && ce) secondary = `${cs.time}–${ce.time} ${cs.abbr}`;
  }

  return (
    <span className="scheduled-time-block">
      <span>{primary} <span className="shift-tz-label">{tzAbbr(scheduleTz)}</span></span>
      {secondary && <span className="shift-tz-secondary">{secondary}</span>}
    </span>
  );
}

function CoverageCard({ snapshot, orgTimezone, canManage, actionLoading, onForcePunchIn, onForcePunchOut }: {
  snapshot: AttendanceSnapshot; orgTimezone: string; canManage: boolean; actionLoading: boolean;
  onForcePunchIn(id: string): void; onForcePunchOut(id: string): void;
}) {
  const online = snapshot.status === "available" || snapshot.status === "on_break" || snapshot.status === "at_lunch";
  return (
    <article className={`attend-card coverage-card ${online ? "online" : "absent"}`}>
      <div className="attend-card-top">
        <UserAvatar userId={snapshot.profile.id} firstName={snapshot.profile.firstName} lastName={snapshot.profile.lastName} />
        <div className="attend-card-info">
          <strong>{profileName(snapshot.profile)}</strong>
          <ScheduledTime snapshot={snapshot} scheduleTz={orgTimezone} />
        </div>
        <span className={`coverage-dot ${online ? "online" : "absent"}`} title={online ? "Online" : "Not clocked in"} />
      </div>
      <div className="attend-card-footer">
        {online ? (
          <span className="coverage-status online">● On — {formatDuration(snapshot.clockedInMinutes)}{snapshot.overtimeMinutes > 0 ? ` · +${formatDuration(snapshot.overtimeMinutes)} OT` : ""}</span>
        ) : (
          <span className="coverage-status absent">
            {/* Only managers see the "Late Xh Xm" detail; employees see "Not clocked in" */}
            ● {canManage && snapshot.minutesLate > 0 ? `Late ${formatDuration(snapshot.minutesLate)}` : "Not clocked in"}
          </span>
        )}
        {canManage && !online && (
          <button className="btn-punch" type="button" disabled={actionLoading}
                  title="Clock in (manager action)"
                  onClick={() => onForcePunchIn(snapshot.profile.id)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
            </svg>
          </button>
        )}
        {canManage && online && snapshot.likelyForgotPunchOut && (
          <button className="btn-punch danger" type="button" disabled={actionLoading}
                  title="Clock out (manager action)"
                  onClick={() => onForcePunchOut(snapshot.profile.id)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        )}
      </div>
    </article>
  );
}

function AttendCard({ snapshot, orgTimezone, canManage, actionLoading, now, onForcePunchIn, onForcePunchOut, onDeleteTimeOff, onEditTimeOff, onMarkTimeOff }: {
  snapshot: AttendanceSnapshot; orgTimezone: string; canManage: boolean; actionLoading: boolean;
  now?: Date;
  onForcePunchIn?(id: string): void; onForcePunchOut?(id: string): void;
  onDeleteTimeOff?(id: string): void; onEditTimeOff?(entry: TimeOffEntry): void;
  onMarkTimeOff?(snapshot: AttendanceSnapshot): void;
}) {
  const clockIn  = snapshot.todayShift?.punchInAt ?? snapshot.activeShift?.punchInAt;
  const isOut    = snapshot.status === "out_sick" || snapshot.status === "on_vacation" || snapshot.status === "on_business_trip";
  const isWorking = snapshot.status === "available";
  const isOnBreak = snapshot.status === "on_break" || snapshot.status === "at_lunch";

  // Break / lunch duration
  const segStart  = snapshot.activeSegment?.startAt;
  const segSecs   = (segStart && now) ? Math.max(0, Math.floor((now.getTime() - new Date(segStart).getTime()) / 1_000)) : 0;
  function segLabel(secs: number): string {
    return secs < 60 ? `${secs}s` : formatDuration(Math.floor(secs / 60));
  }

  return (
    <article className={`attend-card${isOnBreak ? " on-break-row" : ""}`}>
      <div className="attend-card-top">
        <UserAvatar userId={snapshot.profile.id} firstName={snapshot.profile.firstName} lastName={snapshot.profile.lastName} />
        <div className="attend-card-info">
          <strong>{profileName(snapshot.profile)}</strong>
          <small suppressHydrationWarning>
            {isOut ? (snapshot.timeOffToday ? formatShortDate(snapshot.timeOffToday.startAt) : "—") : formatClock(clockIn)}
          </small>
        </div>
        {snapshot.missingPunch && (
          <span title="Missing / late punch" style={{ color: "var(--amber)", flexShrink: 0 }}><AlertTriangle size={14} /></span>
        )}
      </div>

      {/* Scheduled shift line */}
      {snapshot.scheduledNow && !isOut && (
        <div className="attend-card-sched">
          Scheduled <ScheduledTime snapshot={snapshot} scheduleTz={orgTimezone} />
        </div>
      )}

      <div className="attend-card-footer">
        {isOut && snapshot.timeOffToday ? (
          <div className="attend-card-tags">
            <span className={`status-badge ${snapshot.timeOffToday.timeOffType === "vacation" ? "blue" : snapshot.timeOffToday.timeOffType === "business_trip" ? "amber" : "red"}`} style={{ fontSize: 11, padding: "2px 7px" }}>
              {snapshot.timeOffToday.timeOffType === "vacation" ? "Vacation" : snapshot.timeOffToday.timeOffType === "business_trip" ? "Business Trip" : "Sick"}
            </span>
          </div>
        ) : isWorking ? (
          <div className="attend-card-meta">
            <span className="attend-label">On for</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-2)" }}>
              {formatDuration(snapshot.clockedInMinutes)}
              {snapshot.overtimeMinutes > 0 && <span className="ot-badge"> +{formatDuration(snapshot.overtimeMinutes)} OT</span>}
            </span>
          </div>
        ) : isOnBreak ? (
          <div className="attend-card-meta">
            <span className="attend-label">{snapshot.status === "at_lunch" ? "Lunch" : "Break"}</span>
            <span className="segment-timer" suppressHydrationWarning>
              {segStart ? segLabel(segSecs) : "—"}
            </span>
          </div>
        ) : snapshot.isLate ? (
          <div className="attend-card-meta">
            <span className="late-badge">Late {formatDuration(snapshot.minutesLate)}</span>
          </div>
        ) : (
          <div className="attend-card-meta">
            <span className="attend-label">Team</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-2)" }}>{snapshot.team?.name ?? "—"}</span>
          </div>
        )}

        {/* Manager-only override actions */}
        {canManage && (isWorking || isOnBreak) && onForcePunchOut && (
          <button className="btn-punch danger" type="button" disabled={actionLoading}
                  title="Clock out (manager action)"
                  onClick={() => onForcePunchOut(snapshot.profile.id)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        )}
        {canManage && snapshot.isLate && onForcePunchIn && (
          <button className="btn-punch" type="button" disabled={actionLoading}
                  title="Clock in (manager action)"
                  onClick={() => onForcePunchIn(snapshot.profile.id)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
            </svg>
          </button>
        )}
        {canManage && !isOut && onMarkTimeOff && (
          <button className="btn-punch" type="button" disabled={actionLoading}
                  title="Mark sick / time off"
                  onClick={() => onMarkTimeOff(snapshot)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="12" y1="14" x2="12" y2="18"/><line x1="10" y1="16" x2="14" y2="16"/>
            </svg>
          </button>
        )}
        {canManage && isOut && snapshot.timeOffToday && (
          <div className="timeoff-actions">
            {onEditTimeOff && (
              <button className="btn-punch" type="button" title="Edit time off"
                      onClick={() => onEditTimeOff(snapshot.timeOffToday!)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
            )}
            {onDeleteTimeOff && (
              <button className="btn-punch danger" type="button" title="Delete time off"
                      onClick={() => onDeleteTimeOff(snapshot.timeOffToday!.id)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function AttendCardCompact({ snapshot, subtitle, now }: {
  snapshot: AttendanceSnapshot;
  subtitle: string;
  now?: Date;
}) {
  const segStart = snapshot.activeSegment?.startAt;

  // Total elapsed time for the active segment in seconds (for sub-minute accuracy)
  const segSecs = (segStart && now)
    ? Math.max(0, Math.floor((now.getTime() - new Date(segStart).getTime()) / 1_000))
    : 0;

  // Format: show seconds for first minute, then switch to h/m format
  function segLabel(secs: number): string {
    if (secs < 60) return `${secs}s`;
    return formatDuration(Math.floor(secs / 60));
  }

  return (
    <div className="attend-card-compact">
      <UserAvatar userId={snapshot.profile.id} firstName={snapshot.profile.firstName} lastName={snapshot.profile.lastName} />
      <div className="attend-card-compact-info">
        <strong>{profileName(snapshot.profile)}</strong>
        <small>
          {subtitle}
          {segStart && (
            <span className="segment-timer" suppressHydrationWarning>
              {" "}· {segLabel(segSecs)}
            </span>
          )}
        </small>
      </div>
    </div>
  );
}
