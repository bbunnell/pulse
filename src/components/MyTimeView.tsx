"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle } from "lucide-react";

import { StatusBadge } from "@/components/StatusBadge";
import type { OrgData } from "@/lib/types";
import { buildWeeklyReport } from "@/lib/reports";
import { buildAttendanceSnapshots, profileName } from "@/lib/status";
import { formatClock, formatShortDate, minutesToHours } from "@/lib/time";

interface Props {
  data: OrgData;
  currentUserId?: string;
  /** Org schedule zone. Punch times render here, not in the device's zone. */
  scheduleTz?: string;
}

export function MyTimeView({ data, currentUserId, scheduleTz = "America/Los_Angeles" }: Props) {
  const defaultId = currentUserId ?? data.profiles[0]?.id ?? "";
  const [userId] = useState(defaultId);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => { setNow(new Date()); }, []);

  const profile = data.profiles.find((p) => p.id === userId) ?? data.profiles[0];
  const snapshots = useMemo(() => now ? buildAttendanceSnapshots({
    profiles: data.profiles,
    teams: data.teams,
    shifts: data.shifts,
    segments: data.segments,
    timeOff: data.timeOff,
    now,
  }) : [], [data, now]);
  const snapshot = snapshots.find((s) => s.profile.id === profile?.id);
  const report = useMemo(() => buildWeeklyReport(data, now ?? new Date(0)), [data, now]);
  const rows = report.rows.filter((r) => r.employeeId === profile?.id);
  const total = report.totals.find((t) => t.employeeId === profile?.id);
  const timeOff = data.timeOff.filter((e) => e.userId === profile?.id);

  return (
    <section className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Employee view</p>
          <h1>My Time</h1>
        </div>
        <div className="toolbar">
          {profile && snapshot && <StatusBadge status={snapshot.status} />}
        </div>
      </header>

      <div className="summary-bar">
        <div className="metric-card green">
          <strong>{minutesToHours(total?.payableMinutes ?? 0).toFixed(1)}h</strong>
          <span>Payable This Week</span>
        </div>
        <div className="metric-card blue">
          <strong>{(total?.vacationHours ?? 0).toFixed(1)}h</strong>
          <span>Vacation</span>
        </div>
        <div className="metric-card red">
          <strong>{(total?.sickHours ?? 0).toFixed(1)}h</strong>
          <span>Sick Time</span>
        </div>
        <div className="metric-card amber">
          <strong>{total?.warnings ?? 0}</strong>
          <span>Warnings</span>
        </div>
      </div>

      <div className="page-content">
        <div className="grid-2">
          <div className="panel">
            <div className="panel-header">
              <div>
                <h2>This Week's Punches</h2>
                {profile && <p className="subtle">{profileName(profile)}</p>}
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>In</th>
                    <th>Out</th>
                    <th>Break</th>
                    <th>Lunch</th>
                    <th>Net (hrs)</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${row.employeeId}-${row.date}`}>
                      <td style={{ fontWeight: 500 }}>{formatShortDate(row.date)}</td>
                      <td>{formatClock(row.punchIn, scheduleTz)}</td>
                      <td>{formatClock(row.punchOut, scheduleTz)}</td>
                      <td className="subtle">{minutesToHours(row.breakMinutes).toFixed(2)}</td>
                      <td className="subtle">{minutesToHours(row.lunchMinutes).toFixed(2)}</td>
                      <td style={{ fontWeight: 600 }}>{minutesToHours(row.payableMinutes).toFixed(2)}</td>
                      <td>
                        {row.missingPunchWarnings.length ? (
                          <span className="warning-line" style={{ padding: "2px 6px" }}>
                            <AlertTriangle size={12} />
                            {row.missingPunchWarnings[0]}
                          </span>
                        ) : (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--green)", fontSize: 12 }}>
                            <CheckCircle size={13} /> Clear
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="empty-state">No records for this week.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="panel">
            <div className="panel-header">
              <div>
                <h2>Scheduled Time Off</h2>
                <p className="subtle">{profile ? profileName(profile) : "—"}</p>
              </div>
            </div>
            <div className="settings-list">
              {timeOff.length ? (
                timeOff.map((entry) => (
                  <div className="time-off-entry-card" key={entry.id}>
                    <span>
                      <strong style={{ fontSize: 13 }}>
                        {entry.timeOffType === "vacation" ? "Vacation" : entry.timeOffType === "business_trip" ? "Business Trip" : "Sick time"}
                      </strong>
                      <small className="subtle">
                        {formatShortDate(entry.startAt)} → {formatShortDate(entry.endAt)}
                      </small>
                    </span>
                    <span className={`status-badge ${entry.timeOffType === "vacation" ? "blue" : entry.timeOffType === "business_trip" ? "amber" : "red"}`}>
                      {entry.hours}h
                    </span>
                  </div>
                ))
              ) : (
                <div className="empty-state">No time off recorded.</div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
