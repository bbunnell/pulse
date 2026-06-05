"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";
import type { Profile } from "@/lib/types";
import { profileName } from "@/lib/status";

interface Props {
  profiles: Profile[];
  defaultFrom?: string;
  defaultTo?: string;
  onDone(): void;
  onClose(): void;
}

export function BulkReassignModal({ profiles, defaultFrom, defaultTo, onDone, onClose }: Props) {
  const [fromId, setFromId]     = useState(profiles[0]?.id ?? "");
  const [toId, setToId]         = useState(profiles[1]?.id ?? "");
  const [fromDate, setFromDate] = useState(defaultFrom ?? new Date().toISOString().slice(0,10));
  const [toDate, setToDate]     = useState(defaultTo ?? "");
  const [saving, setSaving]     = useState(false);
  const [result, setResult]     = useState<{count?:number; error?:string} | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (fromId === toId) { setResult({ error: "Source and target must be different." }); return; }
    setSaving(true); setResult(null);
    const res = await fetch("/api/schedule/bulk-reassign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromProfileId: fromId, toProfileId: toId, fromDate, toDate }),
    });
    const json = (await res.json()) as { ok?: boolean; count?: number; error?: string };
    setResult({ count: json.count, error: json.error });
    setSaving(false);
    if (json.ok) onDone();
  }

  return (
    <div className="schedule-modal-overlay" ref={overlayRef}
         onClick={e => { if (e.target === overlayRef.current) onClose(); }}>
      <div className="schedule-modal">
        <div className="schedule-modal-header">
          <h3>Bulk Reassign Shifts</h3>
          <button className="icon-btn" type="button" onClick={onClose}><X size={16}/></button>
        </div>
        <form className="schedule-modal-body" onSubmit={handleSubmit}>
          <p className="subtle" style={{fontSize:13}}>
            Reassign all shifts in a date range from one engineer to another.
            Rule-linked shifts will be detached from their rules after reassignment.
          </p>

          <div className="control">
            <label>From (current engineer)</label>
            <select className="select" value={fromId} onChange={e=>setFromId(e.target.value)} required>
              {profiles.map(p=><option key={p.id} value={p.id}>{profileName(p)}</option>)}
            </select>
          </div>

          <div className="control">
            <label>To (replacement engineer)</label>
            <select className="select" value={toId} onChange={e=>setToId(e.target.value)} required>
              {profiles.map(p=><option key={p.id} value={p.id}>{profileName(p)}</option>)}
            </select>
          </div>

          <div className="schedule-modal-row">
            <div className="control" style={{flex:1}}>
              <label>From date</label>
              <input className="input" type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)} required/>
            </div>
            <div className="control" style={{flex:1}}>
              <label>To date</label>
              <input className="input" type="date" value={toDate} onChange={e=>setToDate(e.target.value)} required/>
            </div>
          </div>

          {result?.error && <p className="error-line">{result.error}</p>}
          {result?.count !== undefined && (
            <p className="success-line">✓ {result.count} shift{result.count !== 1 ? "s" : ""} reassigned.</p>
          )}

          <div className="schedule-modal-footer">
            <button className="button secondary" type="button" onClick={onClose}>Cancel</button>
            <button className="button primary" type="submit" disabled={saving}>
              {saving ? "Reassigning…" : "Reassign Shifts"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
