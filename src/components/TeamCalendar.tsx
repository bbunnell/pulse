"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, dateFnsLocalizer, type Event, type View } from "react-big-calendar";
import { format, getDay, parse, startOfWeek } from "date-fns";
import { enUS } from "date-fns/locale/en-US";
import { Plus, Pencil, Trash2, X } from "lucide-react";

import type { OrgData } from "@/lib/types";
import type { CompanyEvent, CompanyEventType } from "@/lib/db-store";
import { profileName } from "@/lib/status";

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 1 }),
  getDay,
  locales: { "en-US": enUS },
});

type EventKind = "vacation" | "sick" | "birthday" | "anniversary" | "company";

interface TeamEvent extends Event {
  resource: { kind: EventKind; userId?: string; teamId?: string; companyEventId?: string };
}

const KIND_LABELS: Record<EventKind, string> = {
  vacation: "Vacation",
  sick: "Sick",
  birthday: "Birthday",
  anniversary: "Work Anniversary",
  company: "Company Event",
};

const EVENT_TYPE_LABELS: Record<CompanyEventType, string> = {
  party: "🎉 Party",
  outing: "🏕️ Outing",
  social: "🤝 Social",
  team_building: "🏆 Team Building",
  meeting: "📅 Meeting",
  other: "📌 Other",
};

const EVENT_TYPE_EMOJI: Record<CompanyEventType, string> = {
  party: "🎉",
  outing: "🏕️",
  social: "🤝",
  team_building: "🏆",
  meeting: "📅",
  other: "📌",
};

function projectDate(isoDate: string, year: number): Date {
  const parts = isoDate.split("-");
  const mm = parts.length === 2 ? parts[0] : parts[1];
  const dd = parts.length === 2 ? parts[1] : parts[2];
  return new Date(year, Number(mm) - 1, Number(dd));
}

function yearsAgo(isoDate: string, now: Date): number {
  return now.getFullYear() - Number(isoDate.split("-")[0]);
}

// ── Add / Edit event modal ────────────────────────────────────────────────────
interface EventModalProps {
  existing?: CompanyEvent;
  defaultDate?: string;
  profiles: OrgData["profiles"];
  onSave(event: CompanyEvent): void;
  onDelete?(id: string): void;
  onClose(): void;
}

function EventModal({ existing, defaultDate, profiles, onSave, onDelete, onClose }: EventModalProps) {
  const [title,      setTitle]      = useState(existing?.title ?? "");
  const [type,       setType]       = useState<CompanyEventType>(existing?.eventType ?? "other");
  const [startDate,  setStartDate]  = useState(existing?.startDate ?? defaultDate ?? "");
  const [endDate,    setEndDate]    = useState(existing?.endDate ?? "");
  const [desc,       setDesc]       = useState(existing?.description ?? "");
  const [profileIds, setProfileIds] = useState<string[]>(existing?.profileIds ?? []);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState("");
  const overlayRef = useRef<HTMLDivElement>(null);

  const sortedProfiles = [...profiles].sort((a, b) =>
    `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)
  );

  function toggleProfile(id: string) {
    setProfileIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !startDate) { setError("Title and start date are required."); return; }
    if (endDate && endDate < startDate) { setError("End date must be on or after start date."); return; }
    setSaving(true); setError("");

    const body = {
      title: title.trim(), eventType: type, startDate,
      endDate: endDate || undefined, description: desc || undefined,
      profileIds,
    };

    const res = existing
      ? await fetch(`/api/company-events/${existing.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        })
      : await fetch("/api/company-events", {
          method: "POST",  headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });

    const json = (await res.json()) as { ok?: boolean; event?: CompanyEvent; error?: string };
    setSaving(false);
    if (json.ok && json.event) { onSave(json.event); onClose(); }
    else setError(json.error ?? "Save failed.");
  }

  async function handleDelete() {
    if (!existing || !onDelete) return;
    if (!confirm(`Delete "${existing.title}"?`)) return;
    await fetch(`/api/company-events/${existing.id}`, { method: "DELETE" });
    onDelete(existing.id);
    onClose();
  }

  return (
    <div className="schedule-modal-overlay" ref={overlayRef}
         onClick={e => { if (e.target === overlayRef.current) onClose(); }}>
      <div className="schedule-modal" style={{ maxWidth: 520 }}>
        <div className="schedule-modal-header">
          <h3>{existing ? "Edit Event" : "Add Company Event"}</h3>
          <button className="icon-btn" type="button" onClick={onClose}><X size={16}/></button>
        </div>
        <form className="schedule-modal-body" onSubmit={handleSave}>
          <div className="control">
            <label>Event name</label>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)}
                   placeholder="e.g. Summer Cookout, Holiday Party…" required autoFocus />
          </div>

          <div className="control">
            <label>Type</label>
            <select className="select" value={type} onChange={e => setType(e.target.value as CompanyEventType)}>
              {Object.entries(EVENT_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          <div className="schedule-modal-row">
            <div className="control" style={{ flex: 1 }}>
              <label>Start date</label>
              <input className="input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
            </div>
            <div className="control" style={{ flex: 1 }}>
              <label>End date <span className="subtle">(optional)</span></label>
              <input className="input" type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                     min={startDate} />
            </div>
          </div>

          <div className="control">
            <label>Description <span className="subtle">(optional)</span></label>
            <input className="input" value={desc} onChange={e => setDesc(e.target.value)}
                   placeholder="Location, details, RSVP instructions…" />
          </div>

          <div className="control">
            <label style={{ display: "flex", justifyContent: "space-between" }}>
              <span>People <span className="subtle">(optional — leave blank for whole team)</span></span>
              {profileIds.length > 0 && (
                <button type="button" className="link-btn" style={{ fontSize: 12 }}
                        onClick={() => setProfileIds([])}>Clear all</button>
              )}
            </label>
            <div style={{
              border: "1px solid var(--border)", borderRadius: 6,
              maxHeight: 180, overflowY: "auto", marginTop: 4,
            }}>
              {sortedProfiles.map(p => (
                <label key={p.id} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 10px", cursor: "pointer",
                  background: profileIds.includes(p.id) ? "var(--surface-2)" : "transparent",
                  borderBottom: "1px solid var(--border)",
                }}>
                  <input type="checkbox" checked={profileIds.includes(p.id)}
                         onChange={() => toggleProfile(p.id)} />
                  <span style={{ fontSize: 13 }}>{p.lastName}, {p.firstName}</span>
                </label>
              ))}
            </div>
            {profileIds.length > 0 && (
              <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                {profileIds.length} {profileIds.length === 1 ? "person" : "people"} selected
              </p>
            )}
          </div>

          {error && <p className="error-line">{error}</p>}

          <div className="schedule-modal-footer">
            {existing && onDelete && (
              <button type="button" className="button danger" onClick={handleDelete}>
                <Trash2 size={13}/> Delete
              </button>
            )}
            <div style={{ flex: 1 }} />
            <button className="button secondary" type="button" onClick={onClose}>Cancel</button>
            <button className="button primary" type="submit" disabled={saving}>
              {saving ? "Saving…" : existing ? "Save Changes" : "Add Event"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  data: OrgData;
  canManage: boolean;
}

export function TeamCalendar({ data, canManage }: Props) {
  const [date, setDate]             = useState(new Date());
  const [view, setView]             = useState<View>("month");
  const [teamId, setTeamId]         = useState("all");
  const [employeeId, setEmployeeId] = useState("all");
  const [kind, setKind]             = useState<EventKind | "all">("all");
  const [companyEvents, setCompanyEvents] = useState<CompanyEvent[]>([]);
  const [showModal, setShowModal]   = useState(false);
  const [editingEvent, setEditingEvent] = useState<CompanyEvent | null>(null);
  const [defaultDate, setDefaultDate] = useState("");

  // Fetch company events for the current view window (±1 year to cover navigation)
  useEffect(() => {
    const year = date.getFullYear();
    fetch(`/api/company-events?from=${year - 1}-01-01&to=${year + 1}-12-31`)
      .then(r => r.json())
      .then((d: { events?: CompanyEvent[] }) => setCompanyEvents(d.events ?? []))
      .catch(() => {});
  }, [date]);

  const events = useMemo<TeamEvent[]>(() => {
    const year = date.getFullYear();
    const all: TeamEvent[] = [];

    // Vacation / Sick
    for (const entry of data.timeOff) {
      if (entry.status === "cancelled") continue;
      const profile = data.profiles.find((p) => p.id === entry.userId);
      all.push({
        title: `${entry.timeOffType === "vacation" ? "🌴 Vacation" : entry.timeOffType === "business_trip" ? "✈️ Business Trip" : "🤒 Sick"} – ${profile ? profileName(profile) : "Employee"}`,
        start: new Date(entry.startAt),
        end: new Date(entry.endAt),
        resource: { kind: entry.timeOffType as EventKind, userId: entry.userId, teamId: profile?.teamId ?? "" },
      });
    }

    // Birthdays
    for (const profile of data.profiles) {
      if (!profile.birthday || !profile.showOnDashboard) continue;
      const bday = projectDate(profile.birthday, year);
      all.push({
        title: `🎂 ${profile.firstName}'s Birthday`,
        start: bday, end: bday, allDay: true,
        resource: { kind: "birthday", userId: profile.id, teamId: profile.teamId ?? "" },
      });
    }

    // Work anniversaries
    for (const profile of data.profiles) {
      if (!profile.workAnniversary || !profile.showOnDashboard) continue;
      const annivDate = projectDate(profile.workAnniversary, year);
      const years = yearsAgo(profile.workAnniversary, new Date(year, annivDate.getMonth(), annivDate.getDate()));
      if (years < 1) continue;
      all.push({
        title: `🎉 ${profile.firstName}'s ${years}-Year Anniversary`,
        start: annivDate, end: annivDate, allDay: true,
        resource: { kind: "anniversary", userId: profile.id, teamId: profile.teamId ?? "" },
      });
    }

    // Company events
    for (const ce of companyEvents) {
      const emoji = EVENT_TYPE_EMOJI[ce.eventType];
      all.push({
        title: `${emoji} ${ce.title}`,
        start: new Date(ce.startDate + "T00:00:00"),
        end:   new Date((ce.endDate ?? ce.startDate) + "T23:59:59"),
        allDay: true,
        resource: { kind: "company", companyEventId: ce.id },
      });
    }

    // Filters
    return all.filter(e => {
      if (teamId !== "all" && e.resource.teamId && e.resource.teamId !== teamId) return false;
      if (employeeId !== "all" && e.resource.userId && e.resource.userId !== employeeId) return false;
      if (kind !== "all" && e.resource.kind !== kind) return false;
      return true;
    });
  }, [data.profiles, data.timeOff, companyEvents, date, employeeId, kind, teamId]);

  function handleSelectEvent(event: object) {
    const e = event as TeamEvent;
    if (e.resource.kind === "company" && e.resource.companyEventId && canManage) {
      const ce = companyEvents.find(c => c.id === e.resource.companyEventId);
      if (ce) { setEditingEvent(ce); setShowModal(true); }
    }
  }

  function handleSelectSlot({ start }: { start: Date }) {
    if (!canManage) return;
    const d = new Date(start);
    setDefaultDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`);
    setEditingEvent(null);
    setShowModal(true);
  }

  function handleEventSaved(event: CompanyEvent) {
    setCompanyEvents(prev => {
      const idx = prev.findIndex(e => e.id === event.id);
      return idx >= 0 ? prev.map((e, i) => i === idx ? event : e) : [...prev, event];
    });
  }

  function handleEventDeleted(id: string) {
    setCompanyEvents(prev => prev.filter(e => e.id !== id));
  }

  return (
    <section className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Vacations · Birthdays · Anniversaries · Company Events</p>
          <h1>Team Events</h1>
        </div>
        {canManage && (
          <button className="button primary" type="button"
                  onClick={() => { setEditingEvent(null); setDefaultDate(""); setShowModal(true); }}>
            <Plus size={14} /> Add Company Event
          </button>
        )}
      </header>

      <div className="toolbar" style={{ marginBottom: 12 }}>
        <div className="control">
          <label htmlFor="cal-team">Team</label>
          <select className="select" id="cal-team" value={teamId} onChange={e => setTeamId(e.target.value)} style={{ width: 140 }}>
            <option value="all">All teams</option>
            {data.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="control">
          <label htmlFor="cal-employee">Employee</label>
          <select className="select" id="cal-employee" value={employeeId} onChange={e => setEmployeeId(e.target.value)} style={{ width: 150 }}>
            <option value="all">All employees</option>
            {data.profiles.filter(p => p.showOnDashboard).map(p => <option key={p.id} value={p.id}>{profileName(p)}</option>)}
          </select>
        </div>
        <div className="control">
          <label htmlFor="cal-kind">Type</label>
          <select className="select" id="cal-kind" value={kind} onChange={e => setKind(e.target.value as EventKind | "all")} style={{ width: 160 }}>
            <option value="all">All types</option>
            <option value="vacation">🌴 Vacation</option>
            <option value="sick">🤒 Sick</option>
            <option value="birthday">🎂 Birthdays</option>
            <option value="anniversary">🎉 Anniversaries</option>
            <option value="company">📌 Company Events</option>
          </select>
        </div>
      </div>

      <div className="calendar-legend">
        {(["vacation","sick","birthday","anniversary","company"] as EventKind[]).map(k => (
          <span key={k} className={`cal-legend-chip event-${k}`}>{KIND_LABELS[k]}</span>
        ))}
        {canManage && <span className="subtle" style={{ fontSize: 11, marginLeft: 4, alignSelf: "center" }}>Click a date or company event to edit</span>}
      </div>

      <div className="calendar-shell">
        <Calendar
          date={date}
          defaultView="month"
          selectable={canManage}
          eventPropGetter={event => ({ className: `event-${(event as TeamEvent).resource.kind}` })}
          events={events}
          localizer={localizer}
          onNavigate={newDate => setDate(newDate)}
          onView={setView}
          onSelectEvent={handleSelectEvent}
          onSelectSlot={handleSelectSlot}
          popup
          startAccessor="start"
          endAccessor="end"
          style={{ height: 680 }}
          view={view}
          views={["day", "week", "month"]}
        />
      </div>

      {showModal && (
        <EventModal
          existing={editingEvent ?? undefined}
          defaultDate={defaultDate || undefined}
          profiles={data.profiles}
          onSave={handleEventSaved}
          onDelete={editingEvent ? handleEventDeleted : undefined}
          onClose={() => { setShowModal(false); setEditingEvent(null); setDefaultDate(""); }}
        />
      )}
    </section>
  );
}
