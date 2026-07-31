"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OrgData, ScheduledShift, Shift, ShiftSegment, TimeOffEntry } from "@/lib/types";
import type { StaffingRule } from "@/lib/db-store";
import { buildAttendanceSnapshots, buildCoverage, profileName, type StaffingRuleLike } from "@/lib/status";
import { formatDuration } from "@/lib/time";

interface Props {
  data: OrgData;
  scheduledShifts: ScheduledShift[];
  staffingRules: (StaffingRuleLike & { id: string; name: string })[];
  orgTimezone: string;
  currentUserId: string;
}

const POLL_MS = 20_000;

const STATUS_DOT: Record<string, string> = {
  available:     "🟢",
  on_break:      "☕",
  at_lunch:      "🍽",
  out_sick:      "🔴",
  on_vacation:   "🔵",
  not_punched_in:"⚪",
  punched_out:   "⚫",
};

const STATUS_LABEL: Record<string, string> = {
  available:     "In",
  on_break:      "Break",
  at_lunch:      "Lunch",
  out_sick:      "Sick",
  on_vacation:   "Vacation",
  not_punched_in:"Not in",
  punched_out:   "Punched out",
};

function relTime(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function fmtClock(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const suf = h < 12 ? "am" : "pm";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m}${suf}`;
}

export function MonitorView({ data, scheduledShifts: initShifts, staffingRules, orgTimezone, currentUserId }: Props) {
  const offsetRef = useRef(0);
  const [now, setNow]   = useState<Date | null>(null);
  const [live, setLive] = useState<{
    shifts: Shift[]; segments: ShiftSegment[]; timeOff: TimeOffEntry[]; scheduledShifts: ScheduledShift[];
  }>({
    shifts: data.shifts, segments: data.segments, timeOff: data.timeOff, scheduledShifts: initShifts,
  });
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Hide the sidebar — we're a pop-out window
  useEffect(() => {
    document.body.classList.add("monitor-mode");
    return () => document.body.classList.remove("monitor-mode");
  }, []);

  // 1-second clock
  useEffect(() => {
    setNow(new Date());
    const t = window.setInterval(() => setNow(new Date(Date.now() + offsetRef.current)), 1000);
    return () => window.clearInterval(t);
  }, []);

  const refreshLive = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/live", { cache: "no-store" });
      if (!res.ok) return;
      const j = (await res.json()) as {
        shifts: Shift[]; segments: ShiftSegment[]; timeOff: TimeOffEntry[];
        scheduledShifts: ScheduledShift[]; serverTime: string;
      };
      offsetRef.current = new Date(j.serverTime).getTime() - Date.now();
      setLive({ shifts: j.shifts, segments: j.segments, timeOff: j.timeOff, scheduledShifts: j.scheduledShifts });
      setLastRefresh(new Date());
    } catch { /* keep last */ }
  }, []);

  useEffect(() => {
    void refreshLive();
    const t = window.setInterval(() => { if (!document.hidden) void refreshLive(); }, POLL_MS);
    const onVis = () => { if (!document.hidden) void refreshLive(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { window.clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [refreshLive]);

  const nowSafe = now ?? new Date();

  const snapshots = buildAttendanceSnapshots({
    profiles: data.profiles.filter(p => p.showOnDashboard !== false),
    teams: data.teams,
    shifts: live.shifts,
    segments: live.segments,
    timeOff: live.timeOff,
    scheduledShifts: live.scheduledShifts,
    scheduleTz: orgTimezone,
    now: nowSafe,
  });

  const coverage = buildCoverage(snapshots, live.scheduledShifts, data.profiles, orgTimezone, nowSafe, staffingRules);

  // Group for display
  const active  = snapshots.filter(s => ["available","on_break","at_lunch"].includes(s.status));
  const out     = snapshots.filter(s => ["out_sick","on_vacation","on_business_trip"].includes(s.status));
  const notIn   = snapshots.filter(s => !["available","on_break","at_lunch","out_sick","on_vacation","on_business_trip"].includes(s.status));

  const hasGap  = coverage.gapHours.length > 0 || coverage.understaffed.length > 0;

  const nowDate = now
    ? now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    : "";
  const nowTime = now
    ? now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : "";

  return (
    <div className="monitor-root">
      {/* Header */}
      <div className="monitor-header">
        <div className="monitor-brand">
          <img src="/team-pulse-app-icon.png" alt="Team Pulse" width={20} height={20} style={{ borderRadius: 4 }} />
          <span>Team Pulse</span>
        </div>
        <div className="monitor-clock" suppressHydrationWarning>
          <span className="monitor-time">{nowTime}</span>
          <span className="monitor-date">{nowDate}</span>
        </div>
      </div>

      {/* Coverage alert */}
      {hasGap && (
        <div className="monitor-alert">
          ⚠ Coverage gap detected
        </div>
      )}

      {/* Summary — 4 tiles, labels explain the dot colors below */}
      <div className="monitor-counts">
        <div className="monitor-count green">
          <span className="monitor-count-num">{active.filter(s => s.status === "available").length}</span>
          <span>Working</span>
        </div>
        <div className="monitor-count amber">
          <span className="monitor-count-num">{active.filter(s => s.status !== "available").length}</span>
          <span>On Break</span>
        </div>
        <div className="monitor-count red">
          <span className="monitor-count-num">{notIn.filter(s => s.isLate).length}</span>
          <span>Late</span>
        </div>
        <div className="monitor-count gray">
          <span className="monitor-count-num">{notIn.filter(s => s.scheduledToday && !s.isLate).length}</span>
          <span>Not In</span>
        </div>
      </div>

      {/* Person list */}
      <div className="monitor-list">
        {/* Working + On Break */}
        {active.map(s => {
          const segSecs = s.activeSegment?.startAt
            ? Math.max(0, Math.floor((nowSafe.getTime() - new Date(s.activeSegment.startAt).getTime()) / 1000))
            : 0;
          const shiftMins = s.clockedInMinutes;
          return (
            <div key={s.profile.id} className={`monitor-row active ${s.status}`}>
              <span className="monitor-dot">{STATUS_DOT[s.status]}</span>
              <span className="monitor-name">{profileName(s.profile)}</span>
              <span className="monitor-meta" suppressHydrationWarning>
                {s.status === "available"
                  ? shiftMins > 0 ? relTime(shiftMins) : s.activeShift ? fmtClock(s.activeShift.punchInAt) : ""
                  : segSecs > 0 ? (segSecs < 60 ? `${segSecs}s` : relTime(Math.floor(segSecs / 60))) : STATUS_LABEL[s.status]}
              </span>
            </div>
          );
        })}

        {/* Divider before missing/late rows */}
        {notIn.some(s => s.isLate || s.scheduledToday) && active.length > 0 && (
          <div className="monitor-divider" />
        )}

        {/* Late */}
        {notIn.filter(s => s.isLate).map(s => (
          <div key={s.profile.id} className="monitor-row late">
            <span className="monitor-dot">🔴</span>
            <span className="monitor-name">{profileName(s.profile)}</span>
            <span className="monitor-meta">Late {relTime(s.minutesLate)}</span>
          </div>
        ))}

        {/* Scheduled but not yet in */}
        {notIn.filter(s => s.scheduledToday && !s.isLate).map(s => (
          <div key={s.profile.id} className="monitor-row not-in">
            <span className="monitor-dot">⚪</span>
            <span className="monitor-name">{profileName(s.profile)}</span>
            <span className="monitor-meta">Not in</span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="monitor-footer" suppressHydrationWarning>
        {lastRefresh
          ? `Updated ${lastRefresh.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}`
          : "Loading…"}
        <button className="monitor-refresh-btn" type="button" onClick={() => void refreshLive()} title="Refresh now">
          ↻
        </button>
      </div>
    </div>
  );
}
