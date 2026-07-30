"use client";

import { useMemo, useState } from "react";
import { addHours } from "date-fns";
import { CalendarPlus, CheckCircle, Paperclip } from "lucide-react";

import type { OrgData, TimeOffEntry, TimeOffType } from "@/lib/types";
import { buildClientIcs, icsFileName } from "@/lib/ics";
import { profileName } from "@/lib/status";
import { buildDateTime, formatShortDate, isoDateOnly } from "@/lib/time";

interface Props {
  data: OrgData;
  currentUserId?: string;
}

export function TimeOffForm({ data, currentUserId }: Props) {
  const defaultId = currentUserId ?? data.profiles[0]?.id ?? "";

  const [entries, setEntries] = useState(data.timeOff);
  const [userId] = useState(defaultId);
  const [timeOffType, setTimeOffType] = useState<TimeOffType>("vacation");
  const [startDate, setStartDate] = useState(isoDateOnly(new Date()));
  const [endDate, setEndDate] = useState(isoDateOnly(new Date()));
  const [fullDay, setFullDay] = useState(true);
  const [startTime, setStartTime] = useState("09:00");
  const [hours, setHours] = useState(8);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [createdEntryId, setCreatedEntryId] = useState<string | null>(null);

  const profile = data.profiles.find((p) => p.id === userId) ?? data.profiles[0];
  const userEntries = useMemo(
    () =>
      entries
        .filter((e) => e.userId === userId)
        .sort((a, b) => a.startAt.localeCompare(b.startAt)),
    [entries, userId],
  );
  const createdEntry = entries.find((e) => e.id === createdEntryId);
  const icsHref =
    createdEntry && profile
      ? `data:text/calendar;charset=utf-8,${encodeURIComponent(buildClientIcs(createdEntry, profile))}`
      : undefined;

  async function submitEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    setSubmitting(true);
    setError("");
    setCreatedEntryId(null);

    const start = fullDay ? buildDateTime(startDate, "00:00") : buildDateTime(startDate, startTime);
    const end = fullDay ? buildDateTime(endDate, "23:59") : addHours(start, hours);

    const res = await fetch("/api/time-off", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timeOffType,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        fullDay,
        hours: fullDay ? 8 : hours,
        notes: notes.trim() || undefined,
      }),
    });

    const json = (await res.json()) as { error?: string; timeOff?: TimeOffEntry };

    if (!res.ok) {
      setError(json.error ?? "Submission failed.");
      setSubmitting(false);
      return;
    }

    const entry = json.timeOff;
    if (!entry) {
      setError("Submission failed.");
      setSubmitting(false);
      return;
    }
    setEntries((prev) => [...prev, entry]);
    setCreatedEntryId(entry.id);

    setNotes("");
    setSubmitting(false);
  }

  return (
    <section className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Auto-approved · v1 workflow</p>
          <h1>Time Off Entry</h1>
        </div>
      </header>

      <div className="page-content">
        <div className="grid-2">
          <form className="panel" onSubmit={submitEntry}>
            <div className="panel-header">
              <div>
                <h2>Vacation or Sick Time</h2>
                <p className="subtle">Entries are auto-approved and generate an ICS file.</p>
              </div>
              <CalendarPlus size={18} style={{ color: "var(--muted)" }} />
            </div>

            <div className="form-grid">
              <div className="control">
                <label htmlFor="type">Type</label>
                <select
                  className="select"
                  id="type"
                  value={timeOffType}
                  onChange={(e) => setTimeOffType(e.target.value as TimeOffType)}
                >
                  <option value="vacation">Vacation</option>
                  <option value="sick">Sick Time</option>
                </select>
              </div>
              <div />
              <div className="control">
                <label htmlFor="startDate">Start Date</label>
                <input
                  className="input"
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="control">
                <label htmlFor="endDate">End Date</label>
                <input
                  className="input"
                  id="endDate"
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>

              <label className="setting-row wide" style={{ padding: "6px 0", border: "none", cursor: "pointer" }}>
                <span>
                  <strong style={{ fontSize: 13 }}>Full day</strong>
                  <small className="subtle">Uncheck for partial-day entry.</small>
                </span>
                <input type="checkbox" checked={fullDay} onChange={(e) => setFullDay(e.target.checked)} />
              </label>

              {!fullDay && (
                <>
                  <div className="control">
                    <label htmlFor="startTime">Start Time</label>
                    <input
                      className="input"
                      id="startTime"
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                    />
                  </div>
                  <div className="control">
                    <label htmlFor="hours">Hours</label>
                    <input
                      className="input"
                      id="hours"
                      type="number"
                      min="0.25"
                      max="12"
                      step="0.25"
                      value={hours}
                      onChange={(e) => setHours(Number(e.target.value))}
                    />
                  </div>
                </>
              )}

              <div className="control wide">
                <label htmlFor="notes">Notes (optional)</label>
                <textarea
                  className="textarea"
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="toolbar" style={{ padding: "0 18px 18px" }}>
              <button className="button primary" type="submit" disabled={submitting}>
                <CalendarPlus size={14} />
                {submitting ? "Submitting…" : "Submit Entry"}
              </button>
              {createdEntry && profile && icsHref && (
                <a className="button" href={icsHref} download={icsFileName(createdEntry, profile)}>
                  <Paperclip size={14} /> Download ICS
                </a>
              )}
            </div>

            {error && <div style={{ padding: "0 18px 14px" }}><p className="error-line">{error}</p></div>}
            {createdEntry && !error && (
              <div style={{ padding: "0 18px 14px" }}>
                <p className="success-line">
                  <CheckCircle size={14} /> Entry recorded successfully.
                </p>
              </div>
            )}
          </form>

          <aside className="panel">
            <div className="panel-header">
              <div>
                <h2>Recorded Time Off</h2>
                <p className="subtle">{profile ? profileName(profile) : "—"}</p>
              </div>
            </div>
            <div className="settings-list">
              {userEntries.length ? (
                userEntries.map((entry) => (
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
