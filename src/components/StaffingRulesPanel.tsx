"use client";

import { useEffect, useState } from "react";
import { Plus, ShieldCheck, Trash2 } from "lucide-react";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface StaffingRule {
  id: string;
  name: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  minStaff: number;
  enabled: boolean;
}

function fmt12(t: string) {
  const [h] = t.split(":").map(Number);
  const suf = h < 12 ? "am" : "pm";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}${suf}`;
}

export function StaffingRulesPanel() {
  const [rules, setRules] = useState<StaffingRule[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // form
  const [name, setName] = useState("");
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [startTime, setStartTime] = useState("00:00");
  const [endTime, setEndTime] = useState("00:00");
  const [minStaff, setMinStaff] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/staffing-rules")
      .then((r) => r.json())
      .then((d: { rules?: StaffingRule[] }) => { setRules(d.rules ?? []); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  function toggleDay(d: number) {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  async function addRule(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !days.length) { setError("Name and at least one day are required."); return; }
    setSaving(true); setError("");
    const res = await fetch("/api/admin/staffing-rules", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), daysOfWeek: days, startTime, endTime, minStaff }),
    });
    const json = (await res.json()) as { ok?: boolean; rule?: StaffingRule; error?: string };
    if (json.ok && json.rule) {
      setRules((prev) => [...prev, json.rule!]);
      setShowForm(false); setName("");
    } else setError(json.error ?? "Failed to save.");
    setSaving(false);
  }

  async function toggleEnabled(rule: StaffingRule) {
    const res = await fetch("/api/admin/staffing-rules", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rule.id, enabled: !rule.enabled }),
    });
    if (res.ok) setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
  }

  async function remove(id: string) {
    const res = await fetch("/api/admin/staffing-rules", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) setRules((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2>Coverage Requirements</h2>
          <p className="subtle">Minimum staffing the dashboard and alerts watch for.</p>
        </div>
        <ShieldCheck size={17} style={{ color: "var(--muted)" }} />
      </div>

      <div className="settings-list">
        {loaded && rules.length === 0 && (
          <div className="empty-state">No coverage requirements defined.</div>
        )}
        {rules.map((rule) => {
          const allDay = rule.startTime === rule.endTime;
          const window = allDay ? "24 hours" : `${fmt12(rule.startTime)}–${fmt12(rule.endTime)}`;
          const dayStr = rule.daysOfWeek.length === 7
            ? "Every day"
            : [...rule.daysOfWeek].sort((a, b) => a - b).map((d) => DAY_LABELS[d]).join(", ");
          return (
            <div className="setting-row" key={rule.id}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flex: 1 }}>
                <input type="checkbox" checked={rule.enabled} onChange={() => toggleEnabled(rule)} />
                <span>
                  <strong>{rule.name}</strong>
                  <small className="subtle">{dayStr} · {window} · min {rule.minStaff}</small>
                </span>
              </label>
              <button className="icon-btn danger" type="button" title="Delete" onClick={() => remove(rule.id)}>
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
      </div>

      {showForm ? (
        <form className="add-team-form" onSubmit={addRule}>
          <p className="smtp-test-heading">New requirement</p>
          <div className="control" style={{ marginBottom: 8 }}>
            <label>Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Overnight minimum" required />
          </div>
          <div className="control" style={{ marginBottom: 8 }}>
            <label>Days</label>
            <div className="day-picker">
              {DAY_LABELS.map((d, i) => (
                <button key={i} type="button" className={`day-chip${days.includes(i) ? " selected" : ""}`} onClick={() => toggleDay(i)}>{d}</button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <div className="control" style={{ flex: 1 }}>
              <label>Start</label>
              <input className="input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="control" style={{ flex: 1 }}>
              <label>End</label>
              <input className="input" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
            <div className="control" style={{ width: 90 }}>
              <label>Min staff</label>
              <input className="input" type="number" min={1} value={minStaff} onChange={(e) => setMinStaff(Number(e.target.value))} />
            </div>
          </div>
          <p className="subtle" style={{ fontSize: 11, marginBottom: 10 }}>Tip: set Start = End for a 24-hour window.</p>
          {error && <p className="error-line">{error}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="button primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Add Requirement"}</button>
            <button className="button secondary" type="button" onClick={() => { setShowForm(false); setError(""); }}>Cancel</button>
          </div>
        </form>
      ) : (
        <div style={{ padding: "0 18px 16px" }}>
          <button className="button secondary" type="button" onClick={() => setShowForm(true)}>
            <Plus size={14} /> Add Requirement
          </button>
        </div>
      )}
    </div>
  );
}
