"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";

import type { OrgData } from "@/lib/types";
import { reportFileName, weeklyRowsToCsv } from "@/lib/csv";
import { buildWeeklyReport } from "@/lib/reports";
import { profileName } from "@/lib/status";
import { formatClock, formatShortDate, isoDateOnly, minutesToHours, parseDateInput } from "@/lib/time";

export function WeeklyReports({ data }: { data: OrgData }) {
  const [week, setWeek] = useState(isoDateOnly(new Date()));
  const [teamId, setTeamId] = useState("all");
  const [employeeId, setEmployeeId] = useState("all");

  const report = useMemo(() => buildWeeklyReport(data, parseDateInput(week)), [data, week]);

  const rows = report.rows.filter((row) => {
    const profile = data.profiles.find((p) => p.id === row.employeeId);
    return (teamId === "all" || profile?.teamId === teamId) && (employeeId === "all" || row.employeeId === employeeId);
  });

  const totals = report.totals.filter((total) => {
    const profile = data.profiles.find((p) => p.id === total.employeeId);
    return (teamId === "all" || profile?.teamId === teamId) && (employeeId === "all" || total.employeeId === employeeId);
  });

  const csvHref = `data:text/csv;charset=utf-8,${encodeURIComponent(weeklyRowsToCsv(rows))}`;

  const totalPayable = totals.reduce((s, t) => s + t.payableMinutes, 0);
  const totalVacation = totals.reduce((s, t) => s + t.vacationHours, 0);
  const totalSick = totals.reduce((s, t) => s + t.sickHours, 0);
  const totalWarnings = totals.reduce((s, t) => s + t.warnings, 0);

  return (
    <section className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Payroll review</p>
          <h1>Weekly Reports</h1>
        </div>
        <div className="toolbar">
          <div className="control">
            <label htmlFor="week">Week</label>
            <input className="input" id="week" type="date" value={week} onChange={(e) => setWeek(e.target.value)} />
          </div>
          <div className="control">
            <label htmlFor="rpt-team">Team</label>
            <select className="select" id="rpt-team" value={teamId} onChange={(e) => setTeamId(e.target.value)} style={{ width: 140 }}>
              <option value="all">All teams</option>
              {data.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="control">
            <label htmlFor="rpt-emp">Employee</label>
            <select className="select" id="rpt-emp" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} style={{ width: 155 }}>
              <option value="all">All employees</option>
              {data.profiles.map((p) => <option key={p.id} value={p.id}>{profileName(p)}</option>)}
            </select>
          </div>
          <div style={{ alignSelf: "flex-end" }}>
            <a className="button primary" href={csvHref} download={reportFileName(week)}>
              <Download size={14} /> Export CSV
            </a>
          </div>
        </div>
      </header>

      <div className="summary-bar">
        <div className="metric-card green">
          <strong>{minutesToHours(totalPayable).toFixed(1)}h</strong>
          <span>Payable Hours</span>
        </div>
        <div className="metric-card blue">
          <strong>{totalVacation.toFixed(1)}h</strong>
          <span>Vacation Hours</span>
        </div>
        <div className="metric-card red">
          <strong>{totalSick.toFixed(1)}h</strong>
          <span>Sick Hours</span>
        </div>
        <div className="metric-card amber">
          <strong>{totalWarnings}</strong>
          <span>Warnings</span>
        </div>
      </div>

      <div className="page-content">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Payroll Detail</h2>
              <p className="subtle">{rows.length} employee-day rows</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Date</th>
                  <th>In</th>
                  <th>Out</th>
                  <th>Gross</th>
                  <th>Break</th>
                  <th>Lunch</th>
                  <th>Net (hrs)</th>
                  <th>Vacation</th>
                  <th>Sick</th>
                  <th>Warnings</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const allWarnings = [...row.missingPunchWarnings, ...row.editedWarnings];
                  return (
                    <tr key={`${row.employeeId}-${row.date}`}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{row.employeeName}</div>
                        <div className="subtle">{row.teamName}</div>
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>{formatShortDate(row.date)}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{formatClock(row.punchIn)}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{formatClock(row.punchOut)}</td>
                      <td>{minutesToHours(row.grossMinutes).toFixed(2)}</td>
                      <td className="subtle">{minutesToHours(row.breakMinutes).toFixed(2)}</td>
                      <td className="subtle">{minutesToHours(row.lunchMinutes).toFixed(2)}</td>
                      <td style={{ fontWeight: 600 }}>{minutesToHours(row.payableMinutes).toFixed(2)}</td>
                      <td>{row.vacationHours > 0 ? row.vacationHours.toFixed(2) : "—"}</td>
                      <td>{row.sickHours > 0 ? row.sickHours.toFixed(2) : "—"}</td>
                      <td>
                        {allWarnings.length ? (
                          <span className="warning-line" style={{ padding: "2px 6px" }}>
                            {allWarnings[0]}
                            {allWarnings.length > 1 ? ` +${allWarnings.length - 1}` : ""}
                          </span>
                        ) : (
                          <span className="subtle">Clear</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={11} className="empty-state">No data for the selected filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
