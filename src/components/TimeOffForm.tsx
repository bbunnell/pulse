"use client";

import { useMemo, useState } from "react";
import { addHours } from "date-fns";
import { CalendarPlus, CheckCircle, Paperclip, Pencil, Trash2 } from "lucide-react";

import type { OrgData, TimeOffEntry, TimeOffType } from "@/lib/types";
import { buildClientIcs, icsFileName } from "@/lib/ics";
import { profileName } from "@/lib/status";
import { buildDateTime, formatShortDate, isoDateOnly } from "@/lib/time";

interface Props {
  data: OrgData;
  currentUserId?: string;
  userRole?: string;
}

export function TimeOffForm({ data, currentUserId, userRole }: Props) {
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<TimeOffEntry | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [listError, setListError] = useState("");
  const [filterUserId, setFilterUserId] = useState("all");

  const canManage = userRole === "admin" || userRole === "manager";

  const profile = data.profiles.find((p) => p.id === userId) ?? data.profiles[0];
  const userEntries = useMemo(
    () =>
      entries
        .filter((e) => e.userId === userId)
        .sort((a, b) => a.startAt.localeCompare(b.startAt)),
    [entries, userId],
  );
  // Only people who actually have entries appear in the filter, so every option
  // returns something rather than silently emptying the list.
  const peopleWithEntries = useMemo(() => {
    const ids = new Set(entries.map((e) => e.userId));
    return data.profiles
      .filter((p) => ids.has(p.id))
      .sort((a, b) => profileName(a).localeCompare(profileName(b)));
  }, [entries, data.profiles]);

  const teamEntries = useMemo(() => {
    const list = filterUserId === "all" ? entries : entries.filter((e) => e.userId === filterUserId);
    return [...list].sort((a, b) => b.startAt.localeCompare(a.startAt));
  }, [entries, filterUserId]);

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

  async function deleteEntry(id: string) {
    setDeletingId(id);
    setListError("");
    try {
      const res = await fetch(`/api/admin/time-off/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setListError(j.error ?? `Could not delete that entry (${res.status}). It is still there.`);
        return;
      }
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch {
      setListError("Network error — the entry was not deleted.");
    } finally {
      setDeletingId(null);
    }
  }

  function startEdit(entry: TimeOffEntry) {
    setEditing(entry);
    setEditError("");
  }

  async function saveEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const fd = new FormData(e.currentTarget);
    const startDate = String(fd.get("startDate"));
    const endDate   = String(fd.get("endDate"));
    if (endDate < startDate) {
      setEditError("The end date cannot be before the start date.");
      return;
    }
    // Build in LOCAL time, matching the create form. Writing a literal
    // `${date}T00:00:00.000Z` pins midnight UTC, which is the PREVIOUS evening
    // anywhere west of UTC — an entry starting Aug 21 rendered as Aug 20. The end
    // date hid the bug because 23:59:59 UTC is still the same local day.
    const startIso = buildDateTime(startDate, "00:00").toISOString();
    const endIso   = buildDateTime(endDate,   "23:59").toISOString();
    setEditSaving(true);
    setEditError("");
    try {
      const res = await fetch(`/api/admin/time-off/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timeOffType: fd.get("timeOffType"),
          startAt: startIso,
          endAt: endIso,
          notes: fd.get("notes") || undefined,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        // Stay open so the edited values survive and can be retried.
        setEditError(j.error ?? `Could not save those changes (${res.status}).`);
        return;
      }
      setEntries((prev) => prev.map((x) => x.id === editing.id ? {
        ...x,
        timeOffType: fd.get("timeOffType") as TimeOffType,
        startAt: startIso,
        endAt: endIso,
        notes: (fd.get("notes") as string) || undefined,
      } : x));
      setEditing(null);
    } catch {
      setEditError("Network error — nothing was saved.");
    } finally {
      setEditSaving(false);
    }
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
            {listError && (
              <div style={{ padding: "0 18px 10px" }}>
                <p className="error-line" style={{ margin: 0 }} role="alert">{listError}</p>
              </div>
            )}
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
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className={`status-badge ${entry.timeOffType === "vacation" ? "blue" : entry.timeOffType === "business_trip" ? "amber" : "red"}`}>
                        {entry.hours}h
                      </span>
                      {/* Own entries are editable regardless of role — plans change.
                          Entries imported from Outlook are not: the next sync would
                          revert the change, so they are corrected at the source. */}
                      {entry.source === "oof_sync" ? (
                        <span className="subtle" style={{ fontSize: 11 }} title="Imported from your Outlook calendar — change it there">
                          from Outlook
                        </span>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="icon-btn"
                            title="Edit entry"
                            aria-label="Edit time off entry"
                            onClick={() => startEdit(entry)}
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            title="Delete entry"
                            aria-label="Delete time off entry"
                            disabled={deletingId === entry.id}
                            onClick={() => deleteEntry(entry.id)}
                            style={{ color: "var(--red)" }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-state">No time off recorded.</div>
              )}
            </div>
          </aside>
        </div>

        {canManage && (
          <div className="panel" style={{ marginTop: 24 }}>
            <div className="panel-header">
              <div>
                <h2>All Team Time Off</h2>
                <p className="subtle">
                  {filterUserId === "all"
                    ? "Manage entries for all employees."
                    : `${teamEntries.length} ${teamEntries.length === 1 ? "entry" : "entries"}`}
                </p>
              </div>
              <select
                className="select"
                aria-label="Filter time off by employee"
                value={filterUserId}
                onChange={(e) => setFilterUserId(e.target.value)}
                style={{ width: "auto", minWidth: 170 }}
              >
                <option value="all">All employees</option>
                {peopleWithEntries.map((p) => (
                  <option key={p.id} value={p.id}>{profileName(p)}</option>
                ))}
              </select>
            </div>
            <div className="settings-list">
              {teamEntries.length === 0 ? (
                <div className="empty-state">
                  {entries.length === 0 ? "No time off entries." : "No entries for that person."}
                </div>
              ) : (
                teamEntries
                  .map((entry) => {
                    const entryProfile = data.profiles.find((p) => p.id === entry.userId);
                    return (
                      <div className="time-off-entry-card" key={entry.id}>
                        <span>
                          <strong style={{ fontSize: 13 }}>
                            {entryProfile ? profileName(entryProfile) : "Unknown"}
                          </strong>
                          <small className="subtle">
                            {entry.timeOffType === "vacation" ? "Vacation" : entry.timeOffType === "business_trip" ? "Business Trip" : "Sick time"}
                            {" · "}
                            {formatShortDate(entry.startAt)} → {formatShortDate(entry.endAt)}
                          </small>
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span className={`status-badge ${entry.timeOffType === "vacation" ? "blue" : entry.timeOffType === "business_trip" ? "amber" : "red"}`}>
                            {entry.hours}h
                          </span>
                          <button
                            type="button"
                            className="icon-btn"
                            title="Delete entry"
                            disabled={deletingId === entry.id}
                            onClick={() => deleteEntry(entry.id)}
                            style={{ color: "var(--red)" }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Edit modal — plans change, so an entry can be corrected rather than
          deleted and re-created. Escape and the overlay both close it. */}
      {editing && (
        <div className="schedule-modal-overlay" onClick={() => setEditing(null)}>
          <div className="schedule-modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}
               role="dialog" aria-modal="true" aria-labelledby="edit-own-timeoff-title">
            <div className="schedule-modal-header">
              <h3 id="edit-own-timeoff-title">Edit Time Off</h3>
              <button className="icon-btn" type="button" aria-label="Close" onClick={() => setEditing(null)}>✕</button>
            </div>
            <form onSubmit={saveEdit}>
              <div className="schedule-modal-body">
                <label className="field-label">Type
                  <select name="timeOffType" defaultValue={editing.timeOffType} className="field-input" style={{ marginTop: 4 }}>
                    <option value="vacation">Vacation</option>
                    <option value="sick">Sick</option>
                    <option value="business_trip">Business Trip</option>
                  </select>
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <label className="field-label">Start date
                    <input name="startDate" type="date" className="field-input" style={{ marginTop: 4 }}
                           defaultValue={editing.startAt.slice(0, 10)} required />
                  </label>
                  <label className="field-label">End date
                    <input name="endDate" type="date" className="field-input" style={{ marginTop: 4 }}
                           defaultValue={editing.endAt.slice(0, 10)} required />
                  </label>
                </div>
                <label className="field-label">Notes
                  <input name="notes" type="text" className="field-input" style={{ marginTop: 4 }}
                         defaultValue={editing.notes ?? ""} placeholder="Optional" />
                </label>
              </div>
              {editError && (
                <div style={{ padding: "0 20px 12px" }}>
                  <p className="error-line" style={{ margin: 0 }} role="alert">{editError}</p>
                </div>
              )}
              <div className="schedule-modal-footer" style={{ padding: "0 20px 20px" }}>
                <button type="button" className="button" onClick={() => setEditing(null)}>Cancel</button>
                <button type="submit" className="button primary" disabled={editSaving}>
                  {editSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
