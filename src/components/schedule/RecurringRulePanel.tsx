"use client";

import { useState } from "react";
import { Plus, RefreshCw, Trash2, X } from "lucide-react";
import type { Profile, ScheduleRule } from "@/lib/types";
import { profileName } from "@/lib/status";

const DAY_LABELS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

interface Props {
  profiles: Profile[];
  rules: ScheduleRule[];
  onRulesChange(rules: ScheduleRule[]): void;
  onClose(): void;
}

export function RecurringRulePanel({ profiles, rules, onRulesChange, onClose }: Props) {
  const [showForm, setShowForm]     = useState(false);
  const [profileId, setProfileId]   = useState(profiles[0]?.id ?? "");
  const [startTime, setStartTime]   = useState("09:00");
  const [endTime, setEndTime]       = useState("17:00");
  const [label, setLabel]           = useState("");
  const [days, setDays]             = useState<number[]>([1,2,3,4,5]);
  const [repeatWeeks, setRepeat]    = useState<1|2|4>(1);
  const [effectiveFrom, setFrom]    = useState(new Date().toISOString().slice(0,10));
  const [effectiveUntil, setUntil]  = useState("");
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState("");

  function toggleDay(d: number) {
    setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!days.length) { setError("Select at least one day."); return; }
    setSaving(true); setError("");
    const res = await fetch("/api/schedule/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId, startTime, endTime, label: label||undefined, daysOfWeek: days, repeatWeeks, effectiveFrom, effectiveUntil: effectiveUntil||undefined }),
    });
    const json = (await res.json()) as { ok?: boolean; rule?: ScheduleRule; generated?: number; error?: string };
    if (json.ok && json.rule) {
      onRulesChange([...rules, json.rule]);
      setShowForm(false);
      setLabel(""); setDays([1,2,3,4,5]);
    } else { setError(json.error ?? "Failed to create rule."); }
    setSaving(false);
  }

  async function handleDelete(rule: ScheduleRule) {
    if (!confirm(`Delete this recurring rule?\n\nThis will also remove all future generated shifts for ${profileName(profiles.find(p=>p.id===rule.profileId) ?? {firstName:"?",lastName:""} as Profile)}.`)) return;
    const res = await fetch(`/api/schedule/rules/${rule.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deleteFuture: true }),
    });
    if ((await res.json() as {ok?:boolean}).ok) {
      onRulesChange(rules.filter(r => r.id !== rule.id));
    }
  }

  async function handleRegenerate(rule: ScheduleRule) {
    await fetch(`/api/schedule/rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    alert("Shifts regenerated for the next 12 weeks.");
  }

  const repeatLabel = { 1: "Every week", 2: "Every 2 weeks", 4: "Every 4 weeks" };

  return (
    <div className="side-panel">
      <div className="side-panel-header">
        <h3>Recurring Rules</h3>
        <button className="icon-btn" type="button" onClick={onClose}><X size={16}/></button>
      </div>

      <div className="side-panel-body">
        {rules.length === 0 && !showForm && (
          <p className="subtle" style={{fontSize:13,padding:"16px 0"}}>No recurring rules. Create one to auto-generate shifts.</p>
        )}

        {rules.map((rule) => {
          const profile = profiles.find(p => p.id === rule.profileId);
          const dayStr = rule.daysOfWeek.sort((a,b)=>a-b).map(d=>DAY_LABELS[d]).join(", ");
          return (
            <div key={rule.id} className="rule-card">
              <div className="rule-card-header">
                <strong>{profile ? profileName(profile) : "Unknown"}</strong>
                <div style={{display:"flex",gap:4}}>
                  <button className="icon-btn" title="Regenerate next 12 weeks" type="button" onClick={() => handleRegenerate(rule)}>
                    <RefreshCw size={13}/>
                  </button>
                  <button className="icon-btn danger" title="Delete rule" type="button" onClick={() => handleDelete(rule)}>
                    <Trash2 size={13}/>
                  </button>
                </div>
              </div>
              <div className="rule-card-detail">
                <span>{rule.startTime}–{rule.endTime}</span>
                {rule.label && <span className="rule-label-badge">{rule.label}</span>}
              </div>
              <div className="rule-card-detail">{dayStr}</div>
              <div className="rule-card-detail subtle">{repeatLabel[rule.repeatWeeks]} · from {rule.effectiveFrom}{rule.effectiveUntil ? ` to ${rule.effectiveUntil}` : ""}</div>
            </div>
          );
        })}

        {showForm ? (
          <form className="rule-form" onSubmit={handleCreate}>
            <p className="side-panel-section-title">New recurring shift</p>

            <div className="control">
              <label>Person</label>
              <select className="select" value={profileId} onChange={e=>setProfileId(e.target.value)} required>
                {profiles.map(p=><option key={p.id} value={p.id}>{profileName(p)}</option>)}
              </select>
            </div>

            <div style={{display:"flex",gap:8}}>
              <div className="control" style={{flex:1}}>
                <label>Start</label>
                <input className="input" type="time" value={startTime} onChange={e=>setStartTime(e.target.value)} required/>
              </div>
              <div className="control" style={{flex:1}}>
                <label>End</label>
                <input className="input" type="time" value={endTime} onChange={e=>setEndTime(e.target.value)} required/>
              </div>
            </div>

            <div className="control">
              <label>Label (optional)</label>
              <input className="input" value={label} onChange={e=>setLabel(e.target.value)} placeholder="Overnight, Day, Evening…"/>
            </div>

            <div className="control">
              <label>Days of week</label>
              <div className="day-picker">
                {DAY_LABELS.map((d,i)=>(
                  <button key={i} type="button"
                    className={`day-chip${days.includes(i)?" selected":""}`}
                    onClick={()=>toggleDay(i)}>
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div className="control">
              <label>Repeats</label>
              <select className="select" value={repeatWeeks} onChange={e=>setRepeat(Number(e.target.value) as 1|2|4)}>
                <option value={1}>Every week</option>
                <option value={2}>Every 2 weeks</option>
                <option value={4}>Every 4 weeks</option>
              </select>
            </div>

            <div style={{display:"flex",gap:8}}>
              <div className="control" style={{flex:1}}>
                <label>Start date</label>
                <input className="input" type="date" value={effectiveFrom} onChange={e=>setFrom(e.target.value)} required/>
              </div>
              <div className="control" style={{flex:1}}>
                <label>End date <span className="subtle">(opt)</span></label>
                <input className="input" type="date" value={effectiveUntil} onChange={e=>setUntil(e.target.value)}/>
              </div>
            </div>

            {error && <p className="error-line">{error}</p>}
            <div style={{display:"flex",gap:8,marginTop:4}}>
              <button className="button primary" type="submit" disabled={saving}>
                {saving ? "Creating…" : "Create Rule"}
              </button>
              <button className="button secondary" type="button" onClick={()=>{setShowForm(false);setError("");}}>Cancel</button>
            </div>
          </form>
        ) : (
          <button className="button secondary" type="button" style={{marginTop:12}} onClick={()=>setShowForm(true)}>
            <Plus size={14}/> New Recurring Rule
          </button>
        )}
      </div>
    </div>
  );
}
