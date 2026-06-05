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
      else if (s.status === "out_sick" || s.status === "on_vacation") out.push(s);
      else if (s.isLate) late.push(s);
      else if (!s.scheduledToday) offToday.push(s);
      else notIn.push(s);
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

  // ── All roles see the full team board ────────────────────────
  // Employees can see who is working / out across the team.
  // Personal punch-in/out is handled by the My Clock widget in the sidebar.
  // Force-punch buttons are only rendered for managers and admins (canManage).
  function popOutMonitor() {
    window.open(
      "/monitor",
      "timeboard-monitor",
      "width=340,height=580,resizable=yes,scrollbars=yes,menubar=no,toolbar=no,location=no,status=no",
    );
  }

  return (
    <section className="page-shell">
      {/* Summary stat bar + pop-out button */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 0 }}>
        <div className="dash-summary-bar" style={{ flex: 1, marginBottom: 0 }}>
        <SummaryStat label="On now" value={summary.scheduledNow} tone="blue" />
        <SummaryStat label="Working" value={summary.working} tone="green" />
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
          {/* On Now — coverage */}
          <div className="status-group">
            <div className="status-group-heading">
              <span className="status-dot-lg blue" />
              <h2>On Now <InfoTooltip text="Scheduled to be working right now based on their assigned shift. Cross-reference with 'Working' to spot coverage gaps." /></h2>
              <span className="status-count blue">{coverage.scheduledNow.length}</span>
            </div>
            {coverage.scheduledNow.length > 0 ? (
              <div className="attend-grid">
                {coverage.scheduledNow.map((s) => (
                  <CoverageCard key={s.profile.id} snapshot={s} orgTimezone={orgTimezone}
                    canManage={canManage} actionLoading={actionLoading}
                    onForcePunchIn={handleForcePunchIn} onForcePunchOut={handleForcePunchOut} />
                ))}
              </div>
            ) : (
              <p className="dash-empty">No one is scheduled to be working right now.</p>
            )}
          </div>

          {/* Working (not necessarily scheduled) */}
          <div className="status-group">
            <div className="status-group-heading">
              <span className="status-dot-lg green" />
              <h2>Working <InfoTooltip text="Has clocked in and is actively on the clock. Doesn't require a scheduled shift — anyone punched in appears here." /></h2>
              <span className="status-count green">{groups.working.length}</span>
            </div>
            {groups.working.length > 0 ? (
              <div className="attend-grid">
                {groups.working.map((s) => <AttendCard key={s.profile.id} snapshot={s} orgTimezone={orgTimezone} canManage={canManage} actionLoading={actionLoading} now={nowSafe} onForcePunchOut={handleForcePunchOut} />)}
              </div>
            ) : <p className="dash-empty">No one is currently working.</p>}
          </div>

          {/* On Break / At Lunch */}
          {groups.onBreak.length > 0 && (
            <div className="status-group">
              <div className="status-group-heading">
                <span className="status-dot-lg amber" />
                <h2>On Break <InfoTooltip text="Clocked in but currently on a break or at lunch. The timer shows how long the break has been running." /></h2>
                <span className="status-count amber">{groups.onBreak.length}</span>
              </div>
              <div className="attend-grid">
                {groups.onBreak.map((s) => <AttendCard key={s.profile.id} snapshot={s} orgTimezone={orgTimezone} canManage={canManage} actionLoading={actionLoading} now={nowSafe} />)}
              </div>
            </div>
          )}

          {/* Late / absent — managers and admins only */}
          {canManage && groups.late.length > 0 && (
            <div className="status-group">
              <div className="status-group-heading">
                <span className="status-dot-lg red" />
                <h2>Late / Not Clocked In <InfoTooltip text="Scheduled to work right now but hasn't clocked in. The timer shows how late they are. Use 'Clock in ↩' to log them in manually." /></h2>
                <span className="status-count red">{groups.late.length}</span>
              </div>
              <div className="attend-grid">
                {groups.late.map((s) => <AttendCard key={s.profile.id} snapshot={s} orgTimezone={orgTimezone} canManage={canManage} actionLoading={actionLoading} now={nowSafe} onForcePunchIn={handleForcePunchIn} />)}
              </div>
            </div>
          )}

          {/* Out today */}
          {groups.out.length > 0 && (
            <div className="status-group">
              <div className="status-group-heading">
                <span className="status-dot-lg red" />
                <h2>Out Today <InfoTooltip text="On approved vacation or sick leave today. Their time off is recorded in the system." /></h2>
                <span className="status-count red">{groups.out.length}</span>
              </div>
              <div className="attend-grid">
                {groups.out.map((s) => <AttendCard key={s.profile.id} snapshot={s} orgTimezone={orgTimezone} canManage={canManage} actionLoading={actionLoading} now={nowSafe} />)}
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
              <div className="attend-grid">
                {groups.notIn.map((s) => <AttendCard key={s.profile.id} snapshot={s} orgTimezone={orgTimezone} canManage={canManage} actionLoading={actionLoading} now={nowSafe} onForcePunchIn={handleForcePunchIn} />)}
              </div>
            </div>
          )}

          {/* Off today (not scheduled) — collapsed, low emphasis */}
          {groups.offToday.length > 0 && (
            <div className="status-group">
              <div className="status-group-heading">
                <span className="status-dot-lg gray" />
                <h2>Off Today <InfoTooltip text="Not scheduled to work today. No action needed — shown for full team visibility." /></h2>
                <span className="status-count gray">{groups.offToday.length}</span>
              </div>
              <div className="attend-list">
                {groups.offToday.map((s) => <AttendCardCompact key={s.profile.id} snapshot={s} subtitle="Not scheduled" />)}
              </div>
            </div>
          )}
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

      {/* Time off schedule */}
      <div style={{ marginTop: 32 }}>
        <div className="status-group-heading" style={{ marginBottom: 0 }}>
          <h2 style={{ fontSize: 15 }}>Time Off Schedule</h2>
        </div>
        <DashboardSchedule data={data} />
      </div>
    </section>
  );
}

// ── Sub-components ───────────────────────────────────────────

const STAT_TIPS: Record<string, string> = {
  "On now":        "Scheduled to be working right now",
  "Working":       "Currently clocked in",
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
          <button className="button btn-xs" type="button" disabled={actionLoading}
                  title="Manager action: clock this person in"
                  onClick={() => onForcePunchIn(snapshot.profile.id)}>
            Clock in ↩
          </button>
        )}
        {canManage && online && snapshot.likelyForgotPunchOut && (
          <button className="button btn-xs danger" type="button" disabled={actionLoading}
                  title="Manager action: close this person's forgotten shift"
                  onClick={() => onForcePunchOut(snapshot.profile.id)}>
            Clock out ↩
          </button>
        )}
      </div>
    </article>
  );
}

function AttendCard({ snapshot, orgTimezone, canManage, actionLoading, now, onForcePunchIn, onForcePunchOut }: {
  snapshot: AttendanceSnapshot; orgTimezone: string; canManage: boolean; actionLoading: boolean;
  now?: Date;
  onForcePunchIn?(id: string): void; onForcePunchOut?(id: string): void;
}) {
  const clockIn  = snapshot.todayShift?.punchInAt ?? snapshot.activeShift?.punchInAt;
  const isOut    = snapshot.status === "out_sick" || snapshot.status === "on_vacation";
  const isWorking = snapshot.status === "available";
  const isOnBreak = snapshot.status === "on_break" || snapshot.status === "at_lunch";

  // Break / lunch duration
  const segStart  = snapshot.activeSegment?.startAt;
  const segSecs   = (segStart && now) ? Math.max(0, Math.floor((now.getTime() - new Date(segStart).getTime()) / 1_000)) : 0;
  function segLabel(secs: number): string {
    return secs < 60 ? `${secs}s` : formatDuration(Math.floor(secs / 60));
  }

  return (
    <article className="attend-card">
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
            <span className={`status-badge ${snapshot.timeOffToday.timeOffType === "vacation" ? "blue" : "red"}`} style={{ fontSize: 11, padding: "2px 7px" }}>
              {snapshot.timeOffToday.timeOffType === "vacation" ? "Vacation" : "Sick"}
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

        {/* Manager-only override actions (↩ symbol indicates manager action, not self-service) */}
        {canManage && snapshot.likelyForgotPunchOut && onForcePunchOut && (
          <button className="button btn-xs danger" type="button" disabled={actionLoading}
                  title="Manager action: close this person's open shift"
                  onClick={() => onForcePunchOut(snapshot.profile.id)}>Clock out ↩</button>
        )}
        {canManage && snapshot.isLate && onForcePunchIn && (
          <button className="button btn-xs" type="button" disabled={actionLoading}
                  title="Manager action: clock this person in"
                  onClick={() => onForcePunchIn(snapshot.profile.id)}>Clock in ↩</button>
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
