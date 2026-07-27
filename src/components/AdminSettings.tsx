"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bell, Building2, ChevronDown, ChevronUp, Eye, EyeOff, KeyRound, Lock, Mail, MessageSquare, Pencil, Plus, RefreshCw, Save, Shield, Trash2, UserPlus, X } from "lucide-react";

import type { OrgData, Profile, ReminderRule, Role, Team } from "@/lib/types";
import { profileName } from "@/lib/status";
import { TIMEZONE_OPTIONS } from "@/lib/timezone";
import { StaffingRulesPanel } from "@/components/StaffingRulesPanel";
import { MonthDayPicker } from "@/components/MonthDayPicker";

// ── Edit user modal ────────────────────────────────────────────────────────────
interface EditModalProps {
  profile: Profile;
  teams: Team[];
  currentUserId: string;
  onSave(updated: Profile): void;
  onClose(): void;
}

function EditUserModal({ profile, teams, currentUserId, onSave, onClose }: EditModalProps) {
  const [firstName,       setFirstName]       = useState(profile.firstName);
  const [lastName,        setLastName]         = useState(profile.lastName);
  const [email,           setEmail]            = useState(profile.email);
  const [role,            setRole]             = useState<Role>(profile.role);
  const [teamId,          setTeamId]           = useState(profile.teamId ?? "");
  const [startTime,       setStartTime]        = useState(profile.expectedStartTime ?? "08:30");
  const [endTime,         setEndTime]          = useState(profile.expectedEndTime ?? "17:00");
  const [timezone,        setTimezone]         = useState(profile.timezone ?? "America/Chicago");
  const [status,          setStatus]           = useState<"active"|"inactive">(profile.status);
  const [showOnDashboard,   setShowOnDashboard]   = useState(profile.showOnDashboard ?? true);
  const [workScheduleType,  setWorkScheduleType]  = useState<"standard"|"shift_based">(profile.workScheduleType ?? "shift_based");
  const [standardWorkDays,  setStandardWorkDays]  = useState<number[]>(profile.standardWorkDays ?? [1,2,3,4,5]);
  const [hideWhenNotActive, setHideWhenNotActive] = useState(profile.hideWhenNotActive ?? false);
  const [birthday,        setBirthday]         = useState(profile.birthday ?? "");
  const [workAnniversary, setWorkAnniversary]  = useState(profile.workAnniversary ?? "");
  const [saving,          setSaving]           = useState(false);
  const [saveError,       setSaveError]        = useState("");

  // Password reset section
  const [resetSending,    setResetSending]     = useState(false);
  const [resetEmailMe,    setResetEmailMe]     = useState(false);
  const [resetResult,     setResetResult]      = useState<{tempPassword?: string; error?: string} | null>(null);

  // Resend invite
  const [resendSending,   setResendSending]    = useState(false);
  const [resendResult,    setResendResult]     = useState<{ok?: boolean; error?: string} | null>(null);

  const isSelf = profile.id === currentUserId;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setSaveError("");
    const res = await fetch(`/api/admin/profiles/${profile.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName, lastName, email, role, teamId: teamId || null, expectedStartTime: startTime, expectedEndTime: endTime, status, timezone, showOnDashboard, birthday: birthday || null, workAnniversary: workAnniversary || null, workScheduleType, standardWorkDays, hideWhenNotActive }),
    });
    const json = (await res.json()) as { ok?: boolean; profile?: Profile; error?: string };
    if (json.ok) {
      // Build updated profile for local state (API returns it)
      onSave(json.profile ?? { ...profile, firstName, lastName, email, role, teamId, status, expectedStartTime: startTime, expectedEndTime: endTime, updatedAt: new Date().toISOString() });
      onClose();
    } else {
      setSaveError(json.error ?? "Save failed.");
    }
    setSaving(false);
  }

  async function handleReset() {
    setResetSending(true); setResetResult(null);
    const res = await fetch(`/api/admin/profiles/${profile.id}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sendEmail: resetEmailMe }),
    });
    const json = (await res.json()) as { ok?: boolean; tempPassword?: string; error?: string };
    setResetResult({ tempPassword: json.tempPassword, error: json.error });
    setResetSending(false);
  }

  async function handleResend() {
    setResendSending(true); setResendResult(null);
    const res = await fetch(`/api/admin/profiles/${profile.id}/resend-invite`, { method: "POST" });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    setResendResult(json);
    setResendSending(false);
  }

  return (
    <div className="edit-user-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="edit-user-modal">
        {/* Header */}
        <div className="edit-user-header">
          <div>
            <p className="eyebrow" style={{ color: "var(--muted)", marginBottom: 2 }}>Edit user</p>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{profileName(profile)}</h3>
          </div>
          <button className="icon-btn" type="button" onClick={onClose}><X size={16}/></button>
        </div>

        <div className="edit-user-body">
          {/* ── Identity form ── */}
          <form onSubmit={handleSave}>
            <div className="form-grid">
              <div className="control">
                <label htmlFor="eu-first">First name</label>
                <input className="input" id="eu-first" value={firstName} onChange={e => setFirstName(e.target.value)} required />
              </div>
              <div className="control">
                <label htmlFor="eu-last">Last name</label>
                <input className="input" id="eu-last" value={lastName} onChange={e => setLastName(e.target.value)} required />
              </div>
              <div className="control wide">
                <label htmlFor="eu-email">Email address</label>
                <input className="input" id="eu-email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div className="control">
                <label htmlFor="eu-role">Role</label>
                <select className="select" id="eu-role" value={role} onChange={e => setRole(e.target.value as Role)} disabled={isSelf}>
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
                {isSelf && <p className="subtle" style={{fontSize:11,marginTop:4}}>Cannot change your own role.</p>}
              </div>
              <div className="control">
                <label htmlFor="eu-team">Team</label>
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  <select className="select" id="eu-team" value={teamId} onChange={e => setTeamId(e.target.value)} style={{flex:1}}>
                    <option value="">— No team —</option>
                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  {teamId && (() => {
                    const t = teams.find(t => t.id === teamId);
                    if (!t) return null;
                    return (
                      <button type="button" className="button secondary" style={{fontSize:11,padding:"4px 10px",whiteSpace:"nowrap"}}
                        title="Fill work hours, timezone, and work days from this team's defaults"
                        onClick={() => {
                          setStartTime(t.defaultStartTime);
                          setEndTime(t.defaultEndTime);
                          setTimezone(t.defaultTimezone);
                          setStandardWorkDays(t.defaultWorkDays);
                        }}>
                        Fill from team
                      </button>
                    );
                  })()}
                </div>
              </div>
              <div className="control">
                <label htmlFor="eu-start">Work hours</label>
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  <input className="input" id="eu-start" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={{flex:1}} />
                  <span style={{color:"var(--muted)",fontSize:12}}>to</span>
                  <input className="input" id="eu-end" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={{flex:1}} />
                </div>
              </div>

              {workScheduleType === "standard" && (
                <div className="control wide">
                  <label>Work days</label>
                  <div className="day-picker">
                    {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d,i) => (
                      <button key={i} type="button"
                        className={`day-chip${standardWorkDays.includes(i)?" selected":""}`}
                        onClick={() => setStandardWorkDays(prev =>
                          prev.includes(i) ? prev.filter(x=>x!==i) : [...prev,i].sort()
                        )}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="control wide">
                <label htmlFor="eu-tz">Timezone</label>
                <select className="select" id="eu-tz" value={timezone} onChange={e => setTimezone(e.target.value)}>
                  {TIMEZONE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="control wide">
                <label>Account status</label>
                <div style={{display:"flex",gap:8}}>
                  {(["active","inactive"] as const).map(s => (
                    <button key={s} type="button"
                      className={`status-toggle-btn${status===s?" active":""} ${s==="inactive"?" status-toggle-inactive":""}`}
                      onClick={() => !isSelf && setStatus(s)}
                      disabled={isSelf}
                      title={isSelf ? "Cannot deactivate your own account" : undefined}
                    >
                      {s === "active" ? "Active" : "Inactive"}
                    </button>
                  ))}
                </div>
                {status === "inactive" && <p className="subtle" style={{fontSize:11,marginTop:4}}>Inactive users cannot sign in.</p>}
              </div>

              <div className="control wide">
                <label>Dashboard visibility</label>
                <label className="dashboard-toggle-row">
                  <input type="checkbox" checked={showOnDashboard} onChange={e => setShowOnDashboard(e.target.checked)} />
                  <span>
                    <strong>Show on attendance dashboard</strong>
                    <small className="subtle" style={{display:"block",marginTop:2}}>
                      Uncheck for placeholder or system accounts (e.g. NBIT HD) that never clock in.
                    </small>
                  </span>
                </label>
                <label className="dashboard-toggle-row" style={{marginTop:8}}>
                  <input type="checkbox" checked={hideWhenNotActive} onChange={e => setHideWhenNotActive(e.target.checked)} />
                  <span>
                    <strong>Hide from board when not clocked in</strong>
                    <small className="subtle" style={{display:"block",marginTop:2}}>
                      Only show on the dashboard when actively clocked in or on approved leave. Use for people who work infrequently or on irregular schedules.
                    </small>
                  </span>
                </label>
              </div>

              <div className="control wide">
                <label>Work schedule type</label>
                <div style={{display:"flex",gap:8}}>
                  {(["standard","shift_based"] as const).map(t => (
                    <button key={t} type="button"
                      className={`status-toggle-btn${workScheduleType===t?" active":""}`}
                      onClick={() => setWorkScheduleType(t)}>
                      {t === "standard" ? "Standard (M-F)" : "Shift-based"}
                    </button>
                  ))}
                </div>
                <small className="subtle" style={{fontSize:11,marginTop:4,display:"block"}}>
                  {workScheduleType === "standard"
                    ? "Works regular hours — never shown as 'Off Today'. Appears late based on their expected start time."
                    : "Only active when explicitly scheduled (e.g. NOC/after-hours team). Shown as 'Off Today' when no shift is scheduled."}
                </small>
              </div>

              <div className="schedule-modal-row">
                <div className="control" style={{flex:1}}>
                  <label htmlFor="eu-bday">Birthday</label>
                  <MonthDayPicker id="eu-bday" value={birthday} onChange={setBirthday} />
                  <small className="subtle" style={{fontSize:11,marginTop:4,display:"block"}}>Month and day only — year is not stored.</small>
                </div>
                <div className="control" style={{flex:1}}>
                  <label htmlFor="eu-anniv">Work anniversary</label>
                  <input className="input" id="eu-anniv" type="date" value={workAnniversary} onChange={e => setWorkAnniversary(e.target.value)} />
                  <small className="subtle" style={{fontSize:11,marginTop:4,display:"block"}}>Hire / start date. Years of service shown on Events calendar.</small>
                </div>
              </div>
            </div>

            {saveError && <p className="error-line" style={{marginTop:8}}>{saveError}</p>}

            <div className="edit-user-save-row">
              <button className="button primary" type="submit" disabled={saving}>
                <Save size={13}/>{saving ? "Saving…" : "Save Changes"}
              </button>
              <button className="button secondary" type="button" onClick={onClose}>Cancel</button>
            </div>
          </form>

          <hr className="edit-user-divider"/>

          {/* ── Password reset ── */}
          <div className="edit-user-section">
            <p className="edit-user-section-title"><KeyRound size={14}/> Reset password</p>
            <p className="subtle" style={{fontSize:12,marginBottom:10}}>
              Generates a new temporary password. The user must change it on next sign-in.
            </p>
            <label className="edit-user-check-row">
              <input type="checkbox" checked={resetEmailMe} onChange={e => setResetEmailMe(e.target.checked)}/>
              Also email the new password to {profile.firstName}
            </label>
            <button className="button secondary" type="button" onClick={handleReset} disabled={resetSending} style={{marginTop:10}}>
              <RefreshCw size={13}/>{resetSending ? "Resetting…" : "Reset Password"}
            </button>
            {resetResult?.tempPassword && (
              <div className="temp-password-box" style={{marginTop:10}}>
                <p className="temp-password-label">New temporary password:</p>
                <div className="temp-password-value">{resetResult.tempPassword}</div>
                <p className="temp-password-note">Share this with {profile.firstName} — they will set a new password on sign-in.</p>
              </div>
            )}
            {resetResult?.error && <p className="error-line" style={{marginTop:8}}>{resetResult.error}</p>}
          </div>

          <hr className="edit-user-divider"/>

          {/* ── Resend invite ── */}
          <div className="edit-user-section">
            <p className="edit-user-section-title"><Mail size={14}/> Resend welcome email</p>
            <p className="subtle" style={{fontSize:12,marginBottom:10}}>
              Sends a fresh welcome email to <strong>{profile.email}</strong> with a new temporary password and Teams setup instructions.
            </p>
            <button className="button secondary" type="button" onClick={handleResend} disabled={resendSending}>
              <Mail size={13}/>{resendSending ? "Sending…" : "Resend Welcome Email"}
            </button>
            {resendResult?.ok && <p className="success-line" style={{marginTop:8}}>✓ Email sent to {profile.email}</p>}
            {resendResult?.error && <p className="error-line" style={{marginTop:8}}>{resendResult.error}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

interface Props {
  data: OrgData;
  currentUserId: string;
}

export function AdminSettings({ data, currentUserId }: Props) {
  const router = useRouter();

  const [profiles, setProfiles] = useState(data.profiles);
  const [teams, setTeams] = useState<Team[]>(data.teams);
  const [reminderRules, setReminderRules] = useState(data.reminderRules);

  // Add team form
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamManager, setNewTeamManager] = useState("");
  const [teamAdding, setTeamAdding] = useState(false);
  const [teamError, setTeamError] = useState("");

  // Edit team
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [teamEditName, setTeamEditName] = useState("");
  const [teamHoursDays, setTeamHoursDays] = useState<number[]>([1,2,3,4,5]);
  const [teamHoursStart, setTeamHoursStart] = useState("09:00");
  const [teamHoursEnd, setTeamHoursEnd] = useState("17:00");
  const [teamHoursTz, setTeamHoursTz] = useState("America/Chicago");
  const [teamHoursSaving, setTeamHoursSaving] = useState(false);

  function openTeamHours(team: Team) {
    setEditingTeamId(team.id);
    setTeamEditName(team.name);
    setTeamHoursDays(team.defaultWorkDays);
    setTeamHoursStart(team.defaultStartTime);
    setTeamHoursEnd(team.defaultEndTime);
    setTeamHoursTz(team.defaultTimezone);
  }

  async function saveTeamHours(teamId: string) {
    if (!teamEditName.trim()) return;
    setTeamHoursSaving(true);
    const res = await fetch("/api/admin/teams", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: teamId, name: teamEditName.trim(), defaultWorkDays: teamHoursDays, defaultStartTime: teamHoursStart, defaultEndTime: teamHoursEnd, defaultTimezone: teamHoursTz }),
    });
    const json = (await res.json()) as { ok?: boolean; team?: Team };
    if (json.ok && json.team) {
      setTeams(prev => prev.map(t => t.id === teamId ? json.team! : t));
      setEditingTeamId(null);
    }
    setTeamHoursSaving(false);
  }

  async function addTeam(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    setTeamAdding(true);
    setTeamError("");
    const res = await fetch("/api/admin/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newTeamName.trim(), managerId: newTeamManager || undefined }),
    });
    const json = (await res.json()) as { ok?: boolean; team?: Team; error?: string };
    if (json.ok && json.team) {
      setTeams((prev) => [...prev, json.team!]);
      setNewTeamName("");
      setNewTeamManager("");
    } else {
      setTeamError(json.error ?? "Failed to create team.");
    }
    setTeamAdding(false);
  }

  async function deleteTeam(id: string) {
    const res = await fetch("/api/admin/teams", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setTeams((prev) => prev.filter((t) => t.id !== id));
    }
  }

  // ── SMTP settings ─────────────────────────────────────────────────────────
  const [smtpProvider, setSmtpProvider] = useState("smtp");
  const [smtpHost, setSmtpHost]         = useState("smtp.office365.com");
  const [smtpPort, setSmtpPort]         = useState("587");
  const [smtpUser, setSmtpUser]         = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");        // blank = keep existing
  const [hasPassword, setHasPassword]   = useState(false);     // server already has one
  const [showPassword, setShowPassword] = useState(false);
  const [emailFrom, setEmailFrom]       = useState("");
  const [smtpLoaded, setSmtpLoaded]     = useState(false);
  const [smtpSaving, setSmtpSaving]     = useState(false);
  const [smtpSaveResult, setSmtpSaveResult] = useState<{ ok?: boolean; error?: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/settings/email")
      .then((r) => r.json())
      .then((json: {
        provider?: string; smtpHost?: string; smtpPort?: number;
        smtpUser?: string; hasPassword?: boolean; emailFrom?: string;
      }) => {
        if (json.provider)  setSmtpProvider(json.provider);
        if (json.smtpHost)  setSmtpHost(json.smtpHost);
        if (json.smtpPort)  setSmtpPort(String(json.smtpPort));
        if (json.smtpUser)  setSmtpUser(json.smtpUser);
        if (json.emailFrom) setEmailFrom(json.emailFrom);
        setHasPassword(!!json.hasPassword);
        setSmtpLoaded(true);
      })
      .catch(() => setSmtpLoaded(true));
  }, []);

  async function saveSmtpSettings(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSmtpSaving(true);
    setSmtpSaveResult(null);
    const res = await fetch("/api/admin/settings/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider:     smtpProvider,
        smtpHost:     smtpHost.trim(),
        smtpPort:     Number(smtpPort),
        smtpUser:     smtpUser.trim(),
        smtpPassword: smtpPassword,   // empty string = keep existing
        emailFrom:    emailFrom.trim(),
      }),
    });
    const json = (await res.json()) as { ok?: boolean; hasPassword?: boolean; error?: string };
    if (json.ok) {
      setHasPassword(!!json.hasPassword);
      setSmtpPassword("");            // clear the field; server has it now
      setSmtpSaveResult({ ok: true });
    } else {
      setSmtpSaveResult({ error: json.error ?? "Save failed." });
    }
    setSmtpSaving(false);
  }

  // ── SSO settings ──────────────────────────────────────────────────────────
  const [ssoEnabled,         setSsoEnabled]         = useState(false);
  const [ssoClientId,        setSsoClientId]        = useState("");
  const [ssoTenantId,        setSsoTenantId]        = useState("");
  const [ssoClientSecret,    setSsoClientSecret]    = useState("");
  const [ssoHasSecret,       setSsoHasSecret]       = useState(false);
  const [ssoCallbackUrl,     setSsoCallbackUrl]     = useState("");
  const [ssoLoaded,          setSsoLoaded]          = useState(false);
  const [ssoSaving,          setSsoSaving]          = useState(false);
  const [ssoSaveResult,      setSsoSaveResult]      = useState<{ ok?: boolean; error?: string } | null>(null);
  const [showSsoSecret,      setShowSsoSecret]      = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings/sso")
      .then((r) => r.json())
      .then((json: { enabled?: boolean; clientId?: string; tenantId?: string; hasClientSecret?: boolean; callbackUrl?: string }) => {
        if (json.enabled !== undefined) setSsoEnabled(json.enabled);
        if (json.clientId)              setSsoClientId(json.clientId);
        if (json.tenantId)              setSsoTenantId(json.tenantId);
        if (json.callbackUrl)           setSsoCallbackUrl(json.callbackUrl);
        setSsoHasSecret(!!json.hasClientSecret);
        setSsoLoaded(true);
      })
      .catch(() => setSsoLoaded(true));
  }, []);

  async function saveSsoSettings(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSsoSaving(true);
    setSsoSaveResult(null);
    const res = await fetch("/api/admin/settings/sso", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled:      ssoEnabled,
        clientId:     ssoClientId.trim(),
        tenantId:     ssoTenantId.trim(),
        clientSecret: ssoClientSecret.trim(),
      }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string; hasClientSecret?: boolean };
    if (json.ok) {
      setSsoSaveResult({ ok: true });
      setSsoClientSecret("");
      if (json.hasClientSecret) setSsoHasSecret(true);
    } else {
      setSsoSaveResult({ error: json.error ?? "Save failed." });
    }
    setSsoSaving(false);
  }

  // ── Notification settings ──────────────────────────────────────────────────
  const [notifLoaded,      setNotifLoaded]      = useState(false);
  const [teamsWebhook,     setTeamsWebhook]      = useState("");
  const [orgTimezone,      setOrgTimezone]       = useState("America/Chicago");
  const [checkInEnabled,   setCheckInEnabled]    = useState(true);
  const [checkOutEnabled,  setCheckOutEnabled]   = useState(true);
  const [checkInOffset,    setCheckInOffset]     = useState(5);
  const [checkOutOffset,   setCheckOutOffset]    = useState(5);
  const [escalationEnabled, setEscalationEnabled] = useState(true);
  const [escalationMinutes, setEscalationMinutes] = useState(15);
  const [understaffAlert,  setUnderstaffAlert]   = useState(true);
  const [notifSaving,      setNotifSaving]       = useState(false);
  const [notifSaveResult,  setNotifSaveResult]   = useState<{ ok?: boolean; error?: string } | null>(null);
  const [teamsTestResult,  setTeamsTestResult]   = useState<{ ok?: boolean; error?: string } | null>(null);
  const [teamsTestSending, setTeamsTestSending]  = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings/notifications")
      .then((r) => r.json())
      .then((json: {
        teamsWebhookUrl?: string; orgTimezone?: string;
        checkInEnabled?: boolean; checkOutEnabled?: boolean;
        checkInOffsetMinutes?: number; checkOutOffsetMinutes?: number;
        escalationEnabled?: boolean; escalationMinutes?: number; understaffAlertEnabled?: boolean;
      }) => {
        if (json.teamsWebhookUrl  !== undefined) setTeamsWebhook(json.teamsWebhookUrl);
        if (json.orgTimezone      !== undefined) setOrgTimezone(json.orgTimezone);
        if (json.checkInEnabled   !== undefined) setCheckInEnabled(json.checkInEnabled);
        if (json.checkOutEnabled  !== undefined) setCheckOutEnabled(json.checkOutEnabled);
        if (json.checkInOffsetMinutes  !== undefined) setCheckInOffset(json.checkInOffsetMinutes);
        if (json.checkOutOffsetMinutes !== undefined) setCheckOutOffset(json.checkOutOffsetMinutes);
        if (json.escalationEnabled !== undefined) setEscalationEnabled(json.escalationEnabled);
        if (json.escalationMinutes !== undefined) setEscalationMinutes(json.escalationMinutes);
        if (json.understaffAlertEnabled !== undefined) setUnderstaffAlert(json.understaffAlertEnabled);
        setNotifLoaded(true);
      })
      .catch(() => setNotifLoaded(true));
  }, []);

  async function saveNotifSettings(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setNotifSaving(true);
    setNotifSaveResult(null);
    const res = await fetch("/api/admin/settings/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamsWebhookUrl:       teamsWebhook.trim(),
        orgTimezone,
        checkInEnabled,
        checkOutEnabled,
        checkInOffsetMinutes:  checkInOffset,
        checkOutOffsetMinutes: checkOutOffset,
        escalationEnabled,
        escalationMinutes,
        understaffAlertEnabled: understaffAlert,
      }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    setNotifSaveResult({ ok: json.ok, error: json.error });
    setNotifSaving(false);
  }

  async function sendTeamsTest() {
    if (!teamsWebhook.trim()) return;
    setTeamsTestSending(true);
    setTeamsTestResult(null);
    try {
      const res = await fetch("/api/admin/settings/teams-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl: teamsWebhook.trim() }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      setTeamsTestResult(json);
    } catch {
      setTeamsTestResult({ error: "Request failed." });
    }
    setTeamsTestSending(false);
  }

  // ── Email test ─────────────────────────────────────────────────────────────
  const [testTo, setTestTo] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ ok?: boolean; warning?: string; error?: string; messageId?: string } | null>(null);

  async function sendTestEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTestSending(true);
    setTestResult(null);
    const res = await fetch("/api/admin/email-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: testTo }),
    });
    const json = (await res.json()) as { ok?: boolean; warning?: string; error?: string; result?: { providerMessageId?: string } };
    setTestResult({
      ok: json.ok,
      warning: json.warning,
      error: json.error,
      messageId: json.result?.providerMessageId,
    });
    setTestSending(false);
  }

  // Teams instructions panel open/close
  const [showTeamsInstructions, setShowTeamsInstructions] = useState(false);

  // Add user form
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("employee");
  const [teamId, setTeamId] = useState(data.teams[0]?.id ?? "");
  const [newUserTz, setNewUserTz] = useState("America/Chicago");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [oneTimePassword, setOneTimePassword] = useState("");

  async function addUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!firstName || !lastName || !email) return;
    setCreating(true);
    setCreateError("");
    setCreateSuccess("");
    setTempPassword("");

    const payload: Record<string, unknown> = { firstName, lastName, email, role, teamId, timezone: newUserTz };
    const otp = oneTimePassword.trim();
    if (otp) payload.initialPassword = otp;

    const res = await fetch("/api/users/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await res.json()) as { ok?: boolean; tempPassword?: string; error?: string };

    if (res.ok) {
      const ts = new Date().toISOString();
      const profile: Profile = {
        id: crypto.randomUUID(),
        firstName,
        lastName,
        email,
        role,
        teamId,
        status: "active",
        expectedStartTime: "08:30",
        expectedEndTime: "17:00",
        timezone: newUserTz,
        showOnDashboard: true,
        workScheduleType: "shift_based",
        standardWorkDays: [1,2,3,4,5],
        hideWhenNotActive: false,
        createdAt: ts,
        updatedAt: ts,
      };
      setProfiles((prev) => [...prev, profile]);
      setCreateSuccess(`Account created for ${firstName} ${lastName}.`);
      if (json.tempPassword) setTempPassword(json.tempPassword);
      setNewUserTz("America/Chicago");
      setFirstName("");
      setLastName("");
      setEmail("");
      setOneTimePassword("");
      router.refresh();
    } else {
      setCreateError(json.error ?? "Failed to create user.");
    }

    setCreating(false);
  }

  function updateReminder(ruleId: string, patch: Partial<ReminderRule>) {
    setReminderRules((prev) =>
      prev.map((r) => (r.id === ruleId ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r)),
    );
  }

  const roleLabel: Record<Role, string> = { employee: "Employee", manager: "Manager", admin: "Admin" };

  // Edit modal
  const [editProfile, setEditProfile] = useState<Profile | null>(null);

  // Per-user delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting,        setDeleting]        = useState(false);
  const [deleteError,     setDeleteError]     = useState("");

  async function confirmDelete(profileId: string) {
    setDeleting(true);
    setDeleteError("");
    const res = await fetch(`/api/admin/profiles/${profileId}`, { method: "DELETE" });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (json.ok) {
      setProfiles((prev) => prev.filter((p) => p.id !== profileId));
      setDeleteConfirmId(null);
    } else {
      setDeleteError(json.error ?? "Failed to delete user.");
    }
    setDeleting(false);
  }

  // Per-user Teams webhook editing
  const [webhookEditId,  setWebhookEditId]  = useState<string | null>(null);
  const [webhookDraft,   setWebhookDraft]   = useState("");
  const [webhookSaving,  setWebhookSaving]  = useState(false);
  // Track per-user Teams webhook URLs in local state
  const [userWebhooks,   setUserWebhooks]   = useState<Record<string, string>>({});

  async function saveUserWebhook(profileId: string) {
    setWebhookSaving(true);
    const url = webhookDraft.trim();
    await fetch(`/api/admin/profiles/${profileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamsWebhookUrl: url || null }),
    });
    setUserWebhooks((prev) => ({ ...prev, [profileId]: url }));
    setWebhookEditId(null);
    setWebhookSaving(false);
  }

  return (
  <>
    <section className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Admin controls</p>
          <h1>Settings</h1>
        </div>
        <a className="button secondary" href="/admin/audit">
          <Shield size={14} /> Audit Log
        </a>
      </header>

      <div className="page-content">
        {/* Top row: User form, Roles, Teams */}
        <div className="settings-grid">
          {/* Add user */}
          <form className="panel" onSubmit={addUser}>
            <div className="panel-header">
              <div>
                <h2>Invite User</h2>
                <p className="subtle">Send a setup email to a new team member.</p>
              </div>
              <UserPlus size={17} style={{ color: "var(--muted)" }} />
            </div>
            <div className="form-grid">
              <div className="control">
                <label htmlFor="firstName">First name</label>
                <input className="input" id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              </div>
              <div className="control">
                <label htmlFor="lastName">Last name</label>
                <input className="input" id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
              </div>
              <div className="control wide">
                <label htmlFor="email">Email address</label>
                <input className="input" id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="control">
                <label htmlFor="role">Role</label>
                <select className="select" id="role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="control">
                <label htmlFor="team">Team</label>
                <select className="select" id="team" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                  {data.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="control wide">
                <label htmlFor="newUserTz">Timezone</label>
                <select className="select" id="newUserTz" value={newUserTz} onChange={(e) => setNewUserTz(e.target.value)}>
                  {TIMEZONE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="control wide">
                <label htmlFor="oneTimePassword">One-time password (first sign-in)</label>
                <input
                  className="input"
                  id="oneTimePassword"
                  type="password"
                  autoComplete="new-password"
                  value={oneTimePassword}
                  onChange={(e) => setOneTimePassword(e.target.value)}
                  placeholder="Leave blank to auto-generate"
                />
                <p className="subtle" style={{ marginTop: 6, fontSize: 12, lineHeight: 1.4 }}>
                  Optional. Minimum 8 characters. The user sets a new password after first login. If you leave this blank, a random temporary password is created and shown below.
                </p>
              </div>
            </div>
            <div style={{ padding: "0 18px 16px" }}>
              <button className="button primary" type="submit" disabled={creating}>
                <UserPlus size={14} />
                {creating ? "Creating…" : "Create Account"}
              </button>
              {createError && <p className="error-line" style={{ marginTop: 10 }}>{createError}</p>}
              {createSuccess && <p className="success-line" style={{ marginTop: 10 }}>{createSuccess}</p>}
              {tempPassword && (
                <div className="temp-password-box">
                  <p className="temp-password-label">Temporary password — share this with the user:</p>
                  <div className="temp-password-value">{tempPassword}</div>
                  <p className="temp-password-note">The user will be prompted to set a new password on first sign-in.</p>
                </div>
              )}
            </div>

            {/* Teams DM setup instructions */}
            <div className="teams-instructions-wrap">
              <button
                type="button"
                className="teams-instructions-toggle"
                onClick={() => setShowTeamsInstructions((v) => !v)}
              >
                <MessageSquare size={14} />
                Teams direct message setup instructions
                {showTeamsInstructions ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {showTeamsInstructions && (
                <div className="teams-instructions-body">
                  <p className="teams-instructions-intro">
                    These steps are emailed to each new user automatically. Share them manually if needed.
                    Once complete, the user&apos;s webhook URL should be added to their profile in the <strong>Roles</strong> panel.
                  </p>

                  <ol className="teams-instructions-list">
                    <li>
                      Go to{" "}
                      <a href="https://make.powerautomate.com" target="_blank" rel="noreferrer">
                        make.powerautomate.com
                      </a>{" "}
                      and sign in with your NBIT Microsoft account.
                    </li>
                    <li>
                      Click <strong>New flow</strong> → <strong>Instant cloud flow</strong>. Name it{" "}
                      <em>"Team Pulse Reminder"</em>.
                    </li>
                    <li>
                      Choose the trigger: <strong>"When a HTTP request is received"</strong>. Click Create.
                    </li>
                    <li>
                      Click <strong>+ New step</strong> → search for <strong>Microsoft Teams</strong> →
                      select <strong>"Post a message in a chat or channel"</strong>.
                    </li>
                    <li>
                      Configure the action:
                      <table className="teams-instructions-table">
                        <tbody>
                          <tr><td>Post as</td><td>Flow bot</td></tr>
                          <tr><td>Post in</td><td>Chat with Flow bot</td></tr>
                          <tr><td>Recipient</td><td><em>user&apos;s email address</em></td></tr>
                          <tr><td>Message</td><td>Click ⚡ and select <strong>Body</strong> from the trigger step</td></tr>
                        </tbody>
                      </table>
                    </li>
                    <li>
                      <strong>Save</strong> the flow. Click the trigger step and copy the{" "}
                      <strong>HTTP POST URL</strong>.
                    </li>
                    <li>
                      Send the URL to the admin. In the <strong>Roles</strong> panel below, click the{" "}
                      <MessageSquare size={12} style={{ display: "inline", verticalAlign: "middle" }} />{" "}
                      icon next to the user&apos;s name, paste the URL, and click Save.
                    </li>
                  </ol>
                </div>
              )}
            </div>
          </form>

          {/* Roles */}
          <div className="panel">
            <div className="panel-header">
              <div>
                <h2>Roles</h2>
                <p className="subtle">{profiles.length} people</p>
              </div>
              <Shield size={17} style={{ color: "var(--muted)" }} />
            </div>
            <div className="settings-list">
              {profiles.map((profile) => (
                <div key={profile.id} style={{ display: "flex", flexDirection: "column" }}>
                  <div className="setting-row">
                    <div className="person-line" style={{ flex: 1 }}>
                      <span className="avatar" style={{ width: 28, height: 28, fontSize: 11 }}>
                        {(profile.firstName[0] ?? "").toUpperCase()}{(profile.lastName[0] ?? "").toUpperCase()}
                      </span>
                      <span>
                        <strong>{profileName(profile)}</strong>
                        <small className="subtle">{profile.email}</small>
                        {profile.status === "inactive" && (
                          <span className="status-badge" style={{ background:"var(--red-soft)", color:"var(--red-text)", marginLeft:6, fontSize:10 }}>Inactive</span>
                        )}
                      </span>
                    </div>
                    <select
                      className="select"
                      style={{ width: 110 }}
                      value={profile.role}
                      onChange={async (e) => {
                        const newRole = e.target.value as Role;
                        setProfiles((prev) =>
                          prev.map((p) => p.id === profile.id ? { ...p, role: newRole } : p)
                        );
                        await fetch(`/api/admin/profiles/${profile.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ role: newRole }),
                        });
                      }}
                    >
                      {(Object.keys(roleLabel) as Role[]).map((r) => (
                        <option key={r} value={r}>{roleLabel[r]}</option>
                      ))}
                    </select>
                    {/* Edit button */}
                    <button type="button" className="icon-btn" title="Edit user"
                            onClick={() => { setDeleteConfirmId(null); setWebhookEditId(null); setEditProfile(profile); }}>
                      <Pencil size={13}/>
                    </button>
                    {/* Teams DM webhook button */}
                    <button
                      type="button"
                      title={userWebhooks[profile.id] ? "Teams DM configured" : "Set Teams DM webhook"}
                      className={`icon-btn${userWebhooks[profile.id] ? " teams-dm-set" : ""}`}
                      onClick={() => {
                        setDeleteConfirmId(null);
                        setWebhookEditId(webhookEditId === profile.id ? null : profile.id);
                        setWebhookDraft(userWebhooks[profile.id] ?? "");
                      }}
                    >
                      <MessageSquare size={13} />
                    </button>
                    {/* Delete button — hidden for self */}
                    {profile.id !== currentUserId && (
                      <button
                        type="button"
                        className="icon-btn danger"
                        title="Remove user"
                        onClick={() => {
                          setWebhookEditId(null);
                          setDeleteError("");
                          setDeleteConfirmId(
                            deleteConfirmId === profile.id ? null : profile.id
                          );
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  {/* Inline delete confirmation */}
                  {deleteConfirmId === profile.id && (
                    <div className="user-delete-confirm">
                      <p className="user-delete-warning">
                        Remove <strong>{profileName(profile)}</strong>? This deletes their account,
                        all time records, and cannot be undone.
                      </p>
                      {deleteError && <p className="error-line" style={{ marginBottom: 8 }}>{deleteError}</p>}
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="button danger" type="button"
                                disabled={deleting} onClick={() => confirmDelete(profile.id)}>
                          <Trash2 size={13} />
                          {deleting ? "Removing…" : "Yes, remove user"}
                        </button>
                        <button className="button secondary" type="button"
                                onClick={() => { setDeleteConfirmId(null); setDeleteError(""); }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  {/* Inline webhook editor */}
                  {webhookEditId === profile.id && (
                    <div className="user-webhook-editor">
                      <p className="user-webhook-hint">
                        Paste this user&apos;s <strong>Power Automate webhook URL</strong> to send reminder DMs directly to them in Teams.
                        <a href="https://make.powerautomate.com" target="_blank" rel="noreferrer" style={{ marginLeft: 4 }}>
                          Create a flow →
                        </a>
                      </p>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input
                          className="input"
                          style={{ flex: 1 }}
                          type="url"
                          value={webhookDraft}
                          onChange={(e) => setWebhookDraft(e.target.value)}
                          placeholder="https://prod-xx.westus.logic.azure.com/…"
                        />
                        <button className="button primary" type="button"
                                disabled={webhookSaving} onClick={() => saveUserWebhook(profile.id)}>
                          {webhookSaving ? "Saving…" : "Save"}
                        </button>
                        <button className="button secondary" type="button"
                                onClick={() => setWebhookEditId(null)}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Teams */}
          <div className="panel">
            <div className="panel-header">
              <div>
                <h2>Teams</h2>
                <p className="subtle">{teams.length} team{teams.length !== 1 ? "s" : ""}</p>
              </div>
              <Building2 size={17} style={{ color: "var(--muted)" }} />
            </div>
            <div className="settings-list">
              {teams.map((team) => (
                <div key={team.id}>
                  <div className="setting-row">
                    <span style={{ flex: 1 }}>
                      <strong>{team.name}</strong>
                      <small className="subtle">
                        Manager: {profiles.find((p) => p.id === team.managerId)?.firstName ?? "Open"}
                        {" · "}
                        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].filter((_,i) => team.defaultWorkDays.includes(i)).join(", ")}
                        {" · "}
                        {team.defaultStartTime}–{team.defaultEndTime}
                        {" · "}
                        {team.defaultTimezone.split("/").pop()?.replace("_"," ")}
                      </small>
                    </span>
                    <span className="status-badge gray" style={{ marginRight: 6 }}>
                      {profiles.filter((p) => p.teamId === team.id).length} people
                    </span>
                    <button
                      className="icon-btn"
                      title="Edit work hours"
                      onClick={() => editingTeamId === team.id ? setEditingTeamId(null) : openTeamHours(team)}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      className="icon-btn danger"
                      title="Delete team"
                      onClick={() => deleteTeam(team.id)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {editingTeamId === team.id && (
                    <div className="team-hours-editor">
                      <p className="eyebrow" style={{marginBottom:10}}>Edit team</p>
                      <div className="control" style={{marginBottom:10}}>
                        <label>Team name</label>
                        <input className="input" value={teamEditName} onChange={e => setTeamEditName(e.target.value)} required />
                      </div>
                      <div className="control" style={{marginBottom:10}}>
                        <label>Default work days <span className="subtle">(optional — used by "Fill from team")</span></label>
                        <div className="day-picker">
                          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d,i) => (
                            <button key={i} type="button"
                              className={`day-chip${teamHoursDays.includes(i)?" selected":""}`}
                              onClick={() => setTeamHoursDays(prev =>
                                prev.includes(i) ? prev.filter(x=>x!==i) : [...prev,i].sort()
                              )}>
                              {d}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:10}}>
                        <div className="control" style={{flex:1,minWidth:200}}>
                          <label>Work hours</label>
                          <div style={{display:"flex",gap:6,alignItems:"center"}}>
                            <input className="input" type="time" value={teamHoursStart} onChange={e => setTeamHoursStart(e.target.value)} style={{flex:1}} />
                            <span style={{color:"var(--muted)",fontSize:12}}>to</span>
                            <input className="input" type="time" value={teamHoursEnd} onChange={e => setTeamHoursEnd(e.target.value)} style={{flex:1}} />
                          </div>
                        </div>
                        <div className="control" style={{flex:1,minWidth:200}}>
                          <label>Timezone</label>
                          <select className="select" value={teamHoursTz} onChange={e => setTeamHoursTz(e.target.value)}>
                            {TIMEZONE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                      </div>
                      <div style={{display:"flex",gap:8}}>
                        <button className="button primary" type="button" disabled={teamHoursSaving}
                          onClick={() => saveTeamHours(team.id)}>
                          {teamHoursSaving ? "Saving…" : "Save hours"}
                        </button>
                        <button className="button secondary" type="button" onClick={() => setEditingTeamId(null)}>Cancel</button>
                      </div>
                      <p className="subtle" style={{fontSize:11,marginTop:8}}>
                        Default hours are optional — they&apos;re only used when you click <strong>Fill from team</strong> on an employee. Each employee&apos;s own hours always take precedence.
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Add team form */}
            <form className="add-team-form" onSubmit={addTeam}>
              <p className="smtp-test-heading">Add a team</p>
              <div className="control" style={{ marginBottom: 8 }}>
                <label htmlFor="newTeamName">Team name</label>
                <input
                  className="input"
                  id="newTeamName"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="e.g. Engineering"
                  required
                />
              </div>
              <div className="control" style={{ marginBottom: 12 }}>
                <label htmlFor="newTeamManager">Manager (optional)</label>
                <select
                  className="select"
                  id="newTeamManager"
                  value={newTeamManager}
                  onChange={(e) => setNewTeamManager(e.target.value)}
                >
                  <option value="">— No manager —</option>
                  {profiles
                    .filter((p) => p.role === "manager" || p.role === "admin")
                    .map((p) => (
                      <option key={p.id} value={p.id}>{profileName(p)}</option>
                    ))}
                </select>
              </div>
              <button className="button primary" type="submit" disabled={teamAdding}>
                <Plus size={14} />
                {teamAdding ? "Adding…" : "Add Team"}
              </button>
              {teamError && <p className="error-line" style={{ marginTop: 8 }}>{teamError}</p>}
            </form>
          </div>
        </div>

        {/* SSO panel — full width */}
        <form className="panel" onSubmit={saveSsoSettings}>
          <div className="panel-header">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h2>Single sign-on — Microsoft Entra</h2>
              {ssoLoaded && (
                <span style={{
                  fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 12,
                  background: ssoEnabled ? "var(--green-bg, #d1fae5)" : "var(--surface-2)",
                  color: ssoEnabled ? "var(--green, #059669)" : "var(--muted)",
                }}>
                  {ssoEnabled ? "Enabled" : "Disabled"}
                </span>
              )}
            </div>
          </div>

          <div style={{ padding: "0 18px 18px", display: "flex", flexDirection: "column", gap: 16 }}>
            <p className="subtle" style={{ margin: 0 }}>
              Let people sign in with their Microsoft (NBIT) account. Create a <strong>single-tenant</strong> app
              registration in Entra, add the redirect URI below, then paste the three values here.
            </p>

            {/* Redirect URI box */}
            <div style={{
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "10px 14px",
              background: "var(--surface-2)",
              fontSize: 13,
            }}>
              <div className="subtle" style={{ marginBottom: 4 }}>
                Redirect URI — add in Entra → your app → Authentication → Web
              </div>
              <code style={{ wordBreak: "break-all" }}>
                {ssoCallbackUrl || "https://pulse.nbit.com/api/auth/callback/microsoft-entra-id"}
              </code>
            </div>

            <div className="form-grid" style={{ margin: 0 }}>
              <div className="control">
                <label htmlFor="ssoClientId">Application (client) ID</label>
                <input
                  className="input"
                  id="ssoClientId"
                  type="text"
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={ssoClientId}
                  onChange={(e) => setSsoClientId(e.target.value)}
                  disabled={!ssoLoaded}
                />
              </div>

              <div className="control">
                <label htmlFor="ssoTenantId">Directory (tenant) ID</label>
                <input
                  className="input"
                  id="ssoTenantId"
                  type="text"
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={ssoTenantId}
                  onChange={(e) => setSsoTenantId(e.target.value)}
                  disabled={!ssoLoaded}
                />
              </div>

              <div className="control" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="ssoClientSecret">
                  Client secret {ssoHasSecret && !ssoClientSecret && <span className="subtle" style={{ fontWeight: 400 }}>(leave blank to keep the current one)</span>}
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    className="input"
                    id="ssoClientSecret"
                    type={showSsoSecret ? "text" : "password"}
                    placeholder={ssoHasSecret ? "•••••••• unchanged" : "Paste client secret value here"}
                    value={ssoClientSecret}
                    onChange={(e) => setSsoClientSecret(e.target.value)}
                    disabled={!ssoLoaded}
                    style={{ paddingRight: 40 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSsoSecret((v) => !v)}
                    style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 0 }}
                  >
                    {showSsoSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={ssoEnabled}
                onChange={(e) => setSsoEnabled(e.target.checked)}
                disabled={!ssoLoaded}
              />
              <span>Enable &ldquo;Sign in with Microsoft&rdquo; on the login page</span>
            </label>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button className="button primary" type="submit" disabled={ssoSaving || !ssoLoaded}>
                <Save size={14} />
                {ssoSaving ? "Saving…" : "Save SSO settings"}
              </button>
              {ssoSaveResult?.ok && <span className="success-line">✓ Saved</span>}
              {ssoSaveResult?.error && <span className="error-line">{ssoSaveResult.error}</span>}
            </div>

            <p className="subtle" style={{ margin: 0, fontSize: 12 }}>
              Only people listed under Users below can sign in — SSO or password — and their role comes from
              that list. The secret is stored encrypted.
            </p>
          </div>
        </form>

        {/* Bottom row: Reminders + Email config */}
        <div className="grid-2">
          <div className="panel">
            <div className="panel-header">
              <div>
                <h2>Reminder Rules</h2>
                <p className="subtle">Configured send times per rule type.</p>
              </div>
              <Bell size={17} style={{ color: "var(--muted)" }} />
            </div>
            <div className="settings-list">
              {reminderRules.length ? reminderRules.map((rule) => (
                <div className="setting-row" key={rule.id}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flex: 1 }}>
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(e) => updateReminder(rule.id, { enabled: e.target.checked })}
                    />
                    <span>
                      <strong style={{ textTransform: "capitalize" }}>{rule.reminderType.replaceAll("_", " ")}</strong>
                      {rule.teamId && (
                        <small className="subtle">{data.teams.find((t) => t.id === rule.teamId)?.name ?? "Team"}</small>
                      )}
                    </span>
                  </label>
                  <input
                    className="input"
                    type="time"
                    value={rule.sendTime}
                    style={{ width: 100 }}
                    onChange={(e) => updateReminder(rule.id, { sendTime: e.target.value })}
                  />
                </div>
              )) : (
                <div className="empty-state">No reminder rules configured.</div>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <h2>Email Configuration</h2>
                <p className="subtle">SMTP settings and delivery test.</p>
              </div>
              <Mail size={17} style={{ color: "var(--muted)" }} />
            </div>

            {/* ── SMTP settings form ── */}
            <form className="smtp-settings-form" onSubmit={saveSmtpSettings}>
              <div className="form-grid" style={{ padding: "0 18px" }}>
                <div className="control">
                  <label htmlFor="smtpProvider">Provider</label>
                  <select className="select" id="smtpProvider" value={smtpProvider} onChange={(e) => setSmtpProvider(e.target.value)}>
                    <option value="smtp">SMTP (Microsoft 365 / custom)</option>
                    <option value="resend">Resend</option>
                    <option value="postmark">Postmark</option>
                    <option value="sendgrid">SendGrid</option>
                  </select>
                </div>
                <div className="control">
                  <label htmlFor="smtpPort">Port</label>
                  <select className="select" id="smtpPort" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)}>
                    <option value="587">587 — STARTTLS (recommended)</option>
                    <option value="465">465 — Implicit TLS</option>
                    <option value="25">25 — Unencrypted</option>
                  </select>
                </div>
                <div className="control wide">
                  <label htmlFor="smtpHost">SMTP host</label>
                  <input className="input" id="smtpHost" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)}
                    placeholder="smtp.office365.com" />
                </div>
                <div className="control wide">
                  <label htmlFor="smtpUser">Username / mailbox</label>
                  <input className="input" id="smtpUser" type="email" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)}
                    placeholder="teampulse@yourdomain.com" />
                </div>
                <div className="control wide">
                  <label htmlFor="smtpPassword">
                    Password
                    {hasPassword && smtpPassword === "" && (
                      <span className="smtp-password-set"> — password is set</span>
                    )}
                  </label>
                  <div className="smtp-password-wrap">
                    <input
                      className="input"
                      id="smtpPassword"
                      type={showPassword ? "text" : "password"}
                      value={smtpPassword}
                      onChange={(e) => setSmtpPassword(e.target.value)}
                      placeholder={hasPassword ? "Leave blank to keep current password" : "Enter SMTP password"}
                      style={{ flex: 1 }}
                    />
                    <button type="button" className="smtp-eye-btn" onClick={() => setShowPassword((v) => !v)}
                      title={showPassword ? "Hide" : "Show"}>
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
                <div className="control wide">
                  <label htmlFor="emailFrom">From address</label>
                  <input className="input" id="emailFrom" value={emailFrom} onChange={(e) => setEmailFrom(e.target.value)}
                    placeholder='Team Pulse <teampulse@yourdomain.com>' />
                </div>
              </div>

              <div style={{ padding: "12px 18px 0" }}>
                <button className="button primary" type="submit" disabled={smtpSaving || !smtpLoaded}>
                  <Save size={14} />
                  {smtpSaving ? "Saving…" : "Save Settings"}
                </button>
                {smtpSaveResult && (
                  <span className={smtpSaveResult.ok ? "smtp-inline-ok" : "smtp-inline-error"}>
                    {smtpSaveResult.ok ? "✓ Saved" : smtpSaveResult.error}
                  </span>
                )}
              </div>
            </form>

            {/* ── Test email form ── */}
            <form className="smtp-test-form" onSubmit={sendTestEmail}>
              <p className="smtp-test-heading">Send a test message</p>
              <div className="smtp-test-row">
                <input
                  className="input"
                  type="email"
                  placeholder="Recipient email address"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  required
                  style={{ flex: 1 }}
                />
                <button className="button primary" type="submit" disabled={testSending} style={{ whiteSpace: "nowrap" }}>
                  <Mail size={14} />
                  {testSending ? "Sending…" : "Send Test"}
                </button>
              </div>
              {testResult && (
                <div className={`smtp-test-result ${testResult.error ? "smtp-result-error" : testResult.warning ? "smtp-result-warning" : "smtp-result-ok"}`}>
                  {testResult.error && <><strong>Error:</strong> {testResult.error}</>}
                  {testResult.warning && <><strong>Warning:</strong> {testResult.warning}</>}
                  {testResult.ok && <>
                    <strong>✓ Sent successfully</strong>
                    {testResult.messageId && <span className="smtp-message-id"> · ID: {testResult.messageId}</span>}
                  </>}
                </div>
              )}
            </form>
          </div>
        </div>

        {/* Notifications panel — full width */}
        <form className="panel" onSubmit={saveNotifSettings}>
          <div className="panel-header">
            <div>
              <h2>Shift Notifications</h2>
              <p className="subtle">Email and Teams reminders when staff miss a clock-in or clock-out.</p>
            </div>
            <MessageSquare size={17} style={{ color: "var(--muted)" }} />
          </div>

          <div className="notif-settings-grid">
            {/* Left column: triggers */}
            <div>
              <p className="notif-section-label">Reminder triggers</p>

              <div className="notif-toggle-row">
                <label className="notif-toggle-label" htmlFor="notif-checkin">
                  <input id="notif-checkin" type="checkbox" checked={checkInEnabled}
                         onChange={(e) => setCheckInEnabled(e.target.checked)} />
                  <span>
                    <strong>Clock-in reminder</strong>
                    <small className="subtle">Send if not clocked in after shift starts</small>
                  </span>
                </label>
                <div className="notif-offset-wrap">
                  <input className="input notif-offset-input" type="number" min={1} max={60}
                         value={checkInOffset} onChange={(e) => setCheckInOffset(Number(e.target.value))}
                         disabled={!checkInEnabled} />
                  <span className="subtle">min</span>
                </div>
              </div>

              <div className="notif-toggle-row">
                <label className="notif-toggle-label" htmlFor="notif-checkout">
                  <input id="notif-checkout" type="checkbox" checked={checkOutEnabled}
                         onChange={(e) => setCheckOutEnabled(e.target.checked)} />
                  <span>
                    <strong>Clock-out reminder</strong>
                    <small className="subtle">Send if still clocked in after shift ends</small>
                  </span>
                </label>
                <div className="notif-offset-wrap">
                  <input className="input notif-offset-input" type="number" min={1} max={60}
                         value={checkOutOffset} onChange={(e) => setCheckOutOffset(Number(e.target.value))}
                         disabled={!checkOutEnabled} />
                  <span className="subtle">min</span>
                </div>
              </div>

              <div className="notif-toggle-row">
                <label className="notif-toggle-label" htmlFor="notif-escalation">
                  <input id="notif-escalation" type="checkbox" checked={escalationEnabled}
                         onChange={(e) => setEscalationEnabled(e.target.checked)} />
                  <span>
                    <strong>Escalate to manager</strong>
                    <small className="subtle">Notify managers + admins if still not clocked in after</small>
                  </span>
                </label>
                <div className="notif-offset-wrap">
                  <input className="input notif-offset-input" type="number" min={1} max={120}
                         value={escalationMinutes} onChange={(e) => setEscalationMinutes(Number(e.target.value))}
                         disabled={!escalationEnabled} />
                  <span className="subtle">min</span>
                </div>
              </div>

              <div className="notif-toggle-row">
                <label className="notif-toggle-label" htmlFor="notif-understaff">
                  <input id="notif-understaff" type="checkbox" checked={understaffAlert}
                         onChange={(e) => setUnderstaffAlert(e.target.checked)} />
                  <span>
                    <strong>Understaffing alerts</strong>
                    <small className="subtle">Alert managers + admins when coverage drops below the minimum</small>
                  </span>
                </label>
              </div>

              <div className="control" style={{ marginTop: 16 }}>
                <label htmlFor="notif-tz">Schedule timezone</label>
                <select className="select" id="notif-tz" value={orgTimezone}
                        onChange={(e) => setOrgTimezone(e.target.value)}>
                  <option value="America/Chicago">America/Chicago (CT)</option>
                  <option value="America/New_York">America/New_York (ET)</option>
                  <option value="America/Denver">America/Denver (MT)</option>
                  <option value="America/Los_Angeles">America/Los_Angeles (PT)</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
            </div>

            {/* Right column: Teams webhook */}
            <div>
              <p className="notif-section-label">Microsoft Teams</p>
              <div className="control">
                <label htmlFor="teams-webhook">Incoming Webhook URL</label>
                <input className="input" id="teams-webhook" type="url" value={teamsWebhook}
                       onChange={(e) => setTeamsWebhook(e.target.value)}
                       placeholder="https://companyname.webhook.office.com/…" />
                <p className="notif-help-text">
                  In Teams: channel → <strong>Apps</strong> → <strong>Incoming Webhook</strong> → Create → copy URL.
                  Supports both classic Incoming Webhooks and Power Automate Workflow webhooks.
                </p>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                <button type="button" className="button secondary"
                        disabled={!teamsWebhook.trim() || teamsTestSending}
                        onClick={sendTeamsTest}>
                  <MessageSquare size={13} />
                  {teamsTestSending ? "Sending…" : "Send Test Message"}
                </button>
                {teamsTestResult && (
                  <span className={teamsTestResult.ok ? "smtp-inline-ok" : "smtp-inline-error"}>
                    {teamsTestResult.ok ? "✓ Delivered" : teamsTestResult.error}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div style={{ padding: "12px 18px 18px", borderTop: "1px solid var(--border)", marginTop: 16 }}>
            <button className="button primary" type="submit" disabled={notifSaving || !notifLoaded}>
              <Save size={14} />
              {notifSaving ? "Saving…" : "Save Notification Settings"}
            </button>
            {notifSaveResult && (
              <span className={notifSaveResult.ok ? "smtp-inline-ok" : "smtp-inline-error"}>
                {notifSaveResult.ok ? "✓ Saved" : notifSaveResult.error}
              </span>
            )}
          </div>
        </form>

        {/* Coverage requirements (minimum staffing) */}
        <StaffingRulesPanel />

      </div>
    </section>

    {/* Edit user modal */}
    {editProfile && (
      <EditUserModal
        profile={editProfile}
        teams={teams}
        currentUserId={currentUserId}
        onSave={(updated) => {
          setProfiles((prev) => prev.map((p) => p.id === updated.id ? updated : p));
          setEditProfile(null);
        }}
        onClose={() => setEditProfile(null)}
      />
    )}
  </>
  );
}
