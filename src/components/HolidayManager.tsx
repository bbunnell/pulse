"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarHeart, Loader2, Plus, Trash2, X } from "lucide-react";

import type { Profile } from "@/lib/types";
import { profileName } from "@/lib/status";
import { formatShortDate } from "@/lib/time";

export interface Holiday {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  defaultParticipation: "off" | "working";
  notes?: string;
  exceptionIds: string[];
}

type Draft = Omit<Holiday, "id"> & { id?: string };

const BLANK: Draft = {
  name: "",
  startDate: "",
  endDate: "",
  defaultParticipation: "off",
  exceptionIds: [],
};

/**
 * Holidays, with per-person participation.
 *
 * One exception list serves both directions rather than two separate concepts.
 * A holiday is either a closed day with a skeleton crew, or a normal working day
 * a few people take off — so the list's meaning flips with the default and the
 * heading says which it currently is. Two lists ("who is off" and "who is
 * working") would let someone appear on both.
 */
export function HolidayManager({ profiles, holidays }: { profiles: Profile[]; holidays: Holiday[] }) {
  const router = useRouter();
  const [draft, setDraft]       = useState<Draft | null>(null);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");
  const [confirmDelete, setConfirmDelete] = useState<Holiday | null>(null);

  const staff = useMemo(
    () => profiles
      .filter((p) => p.status === "active" && p.showOnDashboard !== false)
      .sort((a, b) => profileName(a).localeCompare(profileName(b))),
    [profiles],
  );

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError("");
    try {
      const res  = await fetch("/api/admin/holidays", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ ...draft, endDate: draft.endDate || draft.startDate }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) { setError(json.error ?? "Could not save the holiday."); return; }
      setDraft(null);
      router.refresh();
    } catch {
      setError("Network error — nothing was saved.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(h: Holiday) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/holidays?id=${encodeURIComponent(h.id)}`, { method: "DELETE" });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error ?? "Could not remove the holiday.");
        return;
      }
      setConfirmDelete(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  /** How many people the current draft would mark off. */
  function offCount(d: Draft): number {
    return d.defaultParticipation === "off"
      ? staff.length - d.exceptionIds.length
      : d.exceptionIds.length;
  }

  function summarise(h: Holiday): string {
    const others = staff.length - h.exceptionIds.length;
    return h.defaultParticipation === "off"
      ? `Closed — ${others} off, ${h.exceptionIds.length} working`
      : `Open — ${h.exceptionIds.length} off, ${others} working`;
  }

  function dateRange(h: Holiday): string {
    return h.endDate && h.endDate !== h.startDate
      ? `${formatShortDate(h.startDate)} → ${formatShortDate(h.endDate)}`
      : formatShortDate(h.startDate);
  }

  const exceptionHeading = draft?.defaultParticipation === "off"
    ? "Who is working?"
    : "Who is taking it off?";
  const exceptionHint = draft?.defaultParticipation === "off"
    ? "Everyone else is marked off. Pick the people covering."
    : "Everyone else works as normal. Pick the people who are off.";

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2>Holidays</h2>
          <p className="subtle">
            Marks people off for the day, so nobody is chased to clock in and coverage
            reflects who is actually covering.
          </p>
        </div>
        <CalendarHeart size={17} style={{ color: "var(--muted)" }} aria-hidden="true" />
      </div>

      {error && (
        <div className="form-error" role="alert" style={{ margin: "0 16px 12px" }}>
          {error}
        </div>
      )}

      <div className="settings-list">
        {holidays.length === 0 && !draft ? (
          <div className="setting-row">
            <span className="subtle">No holidays yet. Add one and the team is marked off automatically.</span>
          </div>
        ) : (
          holidays.map((h) => (
            <div key={h.id} className="setting-row">
              <div style={{ minWidth: 0 }}>
                <strong>{h.name}</strong>
                <p className="subtle" style={{ marginTop: 2 }}>
                  {dateRange(h)} · {summarise(h)}
                </p>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button type="button" className="button btn-xs"
                        onClick={() => setDraft({ ...h })}>Edit</button>
                <button type="button" className="button btn-xs danger"
                        aria-label={`Remove ${h.name}`}
                        onClick={() => setConfirmDelete(h)}>
                  <Trash2 size={12} aria-hidden="true" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {draft ? (
        <form
          className="settings-list"
          onSubmit={(e) => { e.preventDefault(); void save(); }}
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <div className="setting-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 12 }}>
            <div className="field">
              <label htmlFor="hol-name">Name</label>
              <input id="hol-name" className="field-input" value={draft.name} required autoFocus
                     placeholder="e.g. Labor Day, Thanksgiving"
                     onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div className="field" style={{ flex: 1, minWidth: 140 }}>
                <label htmlFor="hol-start">First day</label>
                <input id="hol-start" type="date" className="field-input" value={draft.startDate} required
                       onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} />
              </div>
              <div className="field" style={{ flex: 1, minWidth: 140 }}>
                <label htmlFor="hol-end">Last day</label>
                <input id="hol-end" type="date" className="field-input"
                       value={draft.endDate || draft.startDate}
                       min={draft.startDate}
                       onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} />
              </div>
            </div>

            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="field-label" style={{ marginBottom: 6 }}>Is the company open?</legend>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                  <input type="radio" name="hol-default" checked={draft.defaultParticipation === "off"}
                         onChange={() => setDraft({ ...draft, defaultParticipation: "off", exceptionIds: [] })} />
                  Closed — everyone off
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                  <input type="radio" name="hol-default" checked={draft.defaultParticipation === "working"}
                         onChange={() => setDraft({ ...draft, defaultParticipation: "working", exceptionIds: [] })} />
                  Open — normal working day
                </label>
              </div>
            </fieldset>

            <div>
              <div className="field-label" style={{ marginBottom: 2 }}>{exceptionHeading}</div>
              <p className="subtle" style={{ margin: "0 0 8px" }}>{exceptionHint}</p>
              <div className="holiday-people">
                {staff.map((p) => {
                  const picked = draft.exceptionIds.includes(p.id);
                  return (
                    <label key={p.id} className={`holiday-person${picked ? " picked" : ""}`}>
                      <input type="checkbox" checked={picked}
                             onChange={(e) => setDraft({
                               ...draft,
                               exceptionIds: e.target.checked
                                 ? [...draft.exceptionIds, p.id]
                                 : draft.exceptionIds.filter((id) => id !== p.id),
                             })} />
                      {profileName(p)}
                    </label>
                  );
                })}
              </div>
            </div>

            <p className="subtle" style={{ margin: 0 }}>
              {offCount(draft)} of {staff.length} will be marked off
              {draft.startDate ? ` on ${formatShortDate(draft.startDate)}` : ""}.
            </p>

            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" className="button primary" disabled={saving}>
                {saving ? <><Loader2 size={13} className="spin" aria-hidden="true" /> Saving…</> : "Save holiday"}
              </button>
              <button type="button" className="button" onClick={() => { setDraft(null); setError(""); }}>
                Cancel
              </button>
            </div>
          </div>
        </form>
      ) : (
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
          <button type="button" className="button" onClick={() => setDraft({ ...BLANK })}>
            <Plus size={13} aria-hidden="true" /> Add holiday
          </button>
        </div>
      )}

      {confirmDelete && (
        <div className="schedule-modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="schedule-modal" style={{ maxWidth: 380 }} tabIndex={-1}
               role="dialog" aria-modal="true" aria-labelledby="hol-del-title"
               onClick={(e) => e.stopPropagation()}>
            <div className="schedule-modal-header">
              <h3 id="hol-del-title">Remove {confirmDelete.name}?</h3>
              <button type="button" className="icon-btn" aria-label="Close"
                      onClick={() => setConfirmDelete(null)}>
                <X size={15} aria-hidden="true" />
              </button>
            </div>
            <div className="schedule-modal-body">
              <p style={{ margin: 0, fontSize: 13, color: "var(--ink-2)" }}>
                This also removes the time off it created, so everyone goes back to their
                normal schedule for {dateRange(confirmDelete)}. Time off people entered
                themselves is not touched.
              </p>
            </div>
            <div className="schedule-modal-footer" style={{ padding: "0 20px 20px" }}>
              <button type="button" className="button" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button type="button" className="button danger" disabled={saving}
                      onClick={() => void remove(confirmDelete)}>
                {saving ? "Removing…" : "Remove holiday"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
