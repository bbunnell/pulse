"use client";

import { useRef, useState } from "react";
import { Trash2, X } from "lucide-react";
import type { Profile, ScheduleTemplate, ScheduledShift, TemplateShift } from "@/lib/types";

const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

interface Props {
  profiles: Profile[];
  templates: ScheduleTemplate[];
  currentWeekShifts: ScheduledShift[];   // shifts in the currently visible week
  currentWeekStart: string;              // ISO date of Monday
  onTemplatesChange(t: ScheduleTemplate[]): void;
  onApplied(): void;   // trigger a refresh
  onClose(): void;
}

export function TemplatesModal({ profiles, templates, currentWeekShifts, currentWeekStart, onTemplatesChange, onApplied, onClose }: Props) {
  const [tab, setTab]           = useState<"apply"|"save">("apply");
  const [applyId, setApplyId]   = useState(templates[0]?.id ?? "");
  const [applyWeek, setApplyWeek] = useState(currentWeekStart);
  const [saveName, setSaveName] = useState("");
  const [saveDesc, setSaveDesc] = useState("");
  const [working, setWorking]   = useState(false);
  const [result, setResult]     = useState<{ok?:boolean;error?:string;msg?:string}|null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  async function handleApply(e: React.FormEvent) {
    e.preventDefault();
    setWorking(true); setResult(null);
    const res = await fetch(`/api/schedule/templates/${applyId}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekDate: applyWeek }),
    });
    const json = (await res.json()) as { ok?: boolean; inserted?: number; error?: string };
    if (json.ok) { setResult({ ok: true, msg: `${json.inserted} shifts added.` }); onApplied(); }
    else setResult({ error: json.error });
    setWorking(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!currentWeekShifts.length) { setResult({ error: "No shifts in the current week to save." }); return; }
    setWorking(true); setResult(null);

    // Convert current shifts to template format
    const templateShifts: TemplateShift[] = currentWeekShifts.map(s => ({
      profileId: s.profileId,
      dayOfWeek: new Date(s.shiftDate + "T00:00:00").getDay(),
      startTime: s.startTime,
      endTime: s.endTime,
      label: s.label,
      notes: s.notes,
    }));

    const res = await fetch("/api/schedule/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: saveName, description: saveDesc || undefined, shifts: templateShifts }),
    });
    const json = (await res.json()) as { ok?: boolean; template?: ScheduleTemplate; error?: string };
    if (json.ok && json.template) {
      onTemplatesChange([...templates, json.template]);
      setResult({ ok: true, msg: `Template "${saveName}" saved with ${templateShifts.length} shifts.` });
      setSaveName(""); setSaveDesc("");
    } else setResult({ error: json.error });
    setWorking(false);
  }

  async function handleDeleteTemplate(id: string) {
    await fetch("/api/schedule/templates", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    onTemplatesChange(templates.filter(t => t.id !== id));
  }

  return (
    <div className="schedule-modal-overlay" ref={overlayRef}
         onClick={e => { if (e.target === overlayRef.current) onClose(); }}>
      <div className="schedule-modal" style={{ width: 500 }}>
        <div className="schedule-modal-header">
          <h3>Schedule Templates</h3>
          <button className="icon-btn" type="button" onClick={onClose}><X size={16}/></button>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", borderBottom:"1px solid var(--border)", padding:"0 20px" }}>
          {(["apply","save"] as const).map(t => (
            <button key={t} type="button"
              style={{ padding:"10px 16px", fontWeight: tab===t ? 600 : 400,
                borderBottom: tab===t ? "2px solid var(--primary)" : "2px solid transparent",
                color: tab===t ? "var(--primary)" : "var(--muted)", background:"none", border:"none",
                borderRadius:0, cursor:"pointer", fontSize:13 }}
              onClick={() => setTab(t)}>
              {t === "apply" ? "Apply template" : "Save current week"}
            </button>
          ))}
        </div>

        <div className="schedule-modal-body">
          {tab === "apply" && (
            <>
              {templates.length === 0 ? (
                <p className="subtle" style={{fontSize:13}}>No templates saved yet. Save the current week as a template first.</p>
              ) : (
                <form onSubmit={handleApply}>
                  <div className="control">
                    <label>Template</label>
                    <select className="select" value={applyId} onChange={e=>setApplyId(e.target.value)}>
                      {templates.map(t=><option key={t.id} value={t.id}>{t.name} ({t.shifts.length} shifts)</option>)}
                    </select>
                  </div>
                  {/* Template preview */}
                  {applyId && (() => {
                    const t = templates.find(t=>t.id===applyId);
                    if (!t) return null;
                    return (
                      <div className="template-preview">
                        {t.shifts.map((s,i) => {
                          const p = profiles.find(p=>p.id===s.profileId);
                          return <div key={i} className="template-preview-row">
                            <span>{DAY_NAMES[s.dayOfWeek]}</span>
                            <span>{s.startTime}–{s.endTime}</span>
                            <span>{p ? `${p.firstName} ${p.lastName}` : "?"}</span>
                            {s.label && <span className="rule-label-badge">{s.label}</span>}
                          </div>;
                        })}
                      </div>
                    );
                  })()}
                  <div className="control">
                    <label>Apply to week of</label>
                    <input className="input" type="date" value={applyWeek} onChange={e=>setApplyWeek(e.target.value)} required/>
                  </div>
                  {result?.ok && <p className="success-line">✓ {result.msg}</p>}
                  {result?.error && <p className="error-line">{result.error}</p>}
                  <div className="schedule-modal-footer" style={{marginTop:8}}>
                    <button className="button primary" type="submit" disabled={working}>
                      {working ? "Applying…" : "Apply Template"}
                    </button>
                  </div>
                </form>
              )}
              {templates.length > 0 && (
                <div style={{marginTop:16}}>
                  <p className="subtle" style={{fontSize:12,marginBottom:8}}>Saved templates</p>
                  {templates.map(t=>(
                    <div key={t.id} className="template-list-row">
                      <span style={{flex:1,fontSize:13}}>{t.name}</span>
                      <span className="subtle" style={{fontSize:11}}>{t.shifts.length} shifts</span>
                      <button className="icon-btn danger" type="button" onClick={()=>handleDeleteTemplate(t.id)}>
                        <Trash2 size={12}/>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === "save" && (
            <form onSubmit={handleSave}>
              <p className="subtle" style={{fontSize:13,marginBottom:12}}>
                Save all {currentWeekShifts.length} shift(s) from the current week as a reusable template.
              </p>
              <div className="control">
                <label>Template name</label>
                <input className="input" value={saveName} onChange={e=>setSaveName(e.target.value)}
                       placeholder="e.g. NOC Standard Week" required/>
              </div>
              <div className="control">
                <label>Description <span className="subtle">(optional)</span></label>
                <input className="input" value={saveDesc} onChange={e=>setSaveDesc(e.target.value)}
                       placeholder="Standard 24/7 NOC coverage"/>
              </div>
              {result?.ok && <p className="success-line">✓ {result.msg}</p>}
              {result?.error && <p className="error-line">{result.error}</p>}
              <div className="schedule-modal-footer" style={{marginTop:8}}>
                <button className="button primary" type="submit" disabled={working || !currentWeekShifts.length}>
                  {working ? "Saving…" : "Save as Template"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
