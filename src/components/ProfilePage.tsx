"use client";

import { useRef, useState } from "react";
import { Camera, CheckCircle, Mail, Shield, Users, Cake, CalendarHeart } from "lucide-react";
import type { Profile } from "@/lib/types";
import { UserAvatar } from "@/components/UserAvatar";
import { MonthDayPicker } from "@/components/MonthDayPicker";
import { AvatarCropper } from "@/components/AvatarCropper";

interface Props {
  user: Profile;
  teamName: string | null;
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrator",
  manager: "Manager",
  employee: "Employee",
};

export function ProfilePage({ user, teamName }: Props) {
  const fileRef    = useRef<HTMLInputElement>(null);
  const [cropSrc,  setCropSrc]   = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [photoSaved, setPhotoSaved] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [version,  setVersion]   = useState(0);

  // Personal dates
  const [birthday,        setBirthday]       = useState(user.birthday ?? "");
  const [workAnniversary, setWorkAnniversary] = useState(user.workAnniversary ?? "");
  const [datesSaving,     setDatesSaving]    = useState(false);
  const [datesSaved,      setDatesSaved]     = useState(false);
  const [datesError,      setDatesError]     = useState("");

  // ── Photo upload ──────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setPhotoError("File must be under 5 MB."); return; }
    setPhotoError(""); setPhotoSaved(false);
    setCropSrc(URL.createObjectURL(file));
  }

  async function handleCropSave(blob: Blob) {
    setUploading(true); setPhotoError("");
    const form = new FormData();
    form.append("avatar", blob, "avatar.jpg");
    const res = await fetch("/api/profile/avatar", { method: "POST", body: form });
    const json = (await res.json()) as { error?: string };
    setUploading(false);
    if (!res.ok) { setPhotoError(json.error ?? "Upload failed."); return; }
    setCropSrc(null); setVersion(Date.now()); setPhotoSaved(true);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleCancelPhoto() {
    setCropSrc(null); setPhotoError(""); setPhotoSaved(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  // ── Personal dates ────────────────────────────────────────────
  async function handleSaveDates(e: React.FormEvent) {
    e.preventDefault();
    setDatesSaving(true); setDatesError(""); setDatesSaved(false);
    const res = await fetch("/api/profile/info", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ birthday: birthday || null, workAnniversary: workAnniversary || null }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    setDatesSaving(false);
    if (json.ok) setDatesSaved(true);
    else setDatesError(json.error ?? "Save failed.");
  }

  return (
    <section className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Account</p>
          <h1>My Profile</h1>
        </div>
      </header>

      <div className="profile-body">
        {/* ── Headshot card ── */}
        <div className="panel profile-avatar-card">

          {cropSrc ? (
            /* Cropper — shown after file selection */
            <AvatarCropper
              src={cropSrc}
              onSave={handleCropSave}
              onCancel={handleCancelPhoto}
              saving={uploading}
            />
          ) : (
            /* Normal avatar display */
            <>
              <div className="profile-avatar-wrap">
                <UserAvatar userId={user.id} firstName={user.firstName} lastName={user.lastName} className="avatar profile-avatar-lg" version={version} />
                <button type="button" className="profile-avatar-overlay" onClick={() => fileRef.current?.click()} title="Change photo">
                  <Camera size={22} />
                </button>
              </div>

              <strong className="profile-avatar-name">{user.firstName} {user.lastName}</strong>
              <span className={`status-badge ${user.role === "admin" ? "blue" : user.role === "manager" ? "green" : "gray"}`}>
                {ROLE_LABEL[user.role]}
              </span>

              <p className="subtle" style={{ fontSize: 11, marginTop: 8, textAlign: "center" }}>
                Click the photo to upload a new headshot.<br />JPG, PNG, or WebP up to 5 MB.
              </p>

              {photoSaved && <p className="profile-upload-status success"><CheckCircle size={13} /> Photo updated</p>}
              {photoError && <p className="error-line" style={{ marginTop: 8 }}>{photoError}</p>}
            </>
          )}

          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: "none" }} onChange={handleFileChange} />
        </div>

        {/* ── Account details ── */}
        <div className="panel profile-info-card">
          <div className="panel-header"><h2>Account Details</h2></div>
          <div className="profile-info-rows">
            <div className="profile-info-row">
              <span className="profile-info-icon"><Mail size={15} /></span>
              <div><p className="profile-info-label">Email</p><p className="profile-info-value">{user.email}</p></div>
            </div>
            <div className="profile-info-row">
              <span className="profile-info-icon"><Shield size={15} /></span>
              <div><p className="profile-info-label">Role</p><p className="profile-info-value">{ROLE_LABEL[user.role]}</p></div>
            </div>
            {teamName && (
              <div className="profile-info-row">
                <span className="profile-info-icon"><Users size={15} /></span>
                <div><p className="profile-info-label">Team</p><p className="profile-info-value">{teamName}</p></div>
              </div>
            )}
          </div>
        </div>

        {/* ── Personal dates ── */}
        <div className="panel profile-info-card" style={{ gridColumn: "1 / -1" }}>
          <div className="panel-header">
            <div>
              <h2>Personal Dates</h2>
              <p className="subtle">Shown on the Team Events calendar so your colleagues can celebrate with you.</p>
            </div>
          </div>
          <form onSubmit={handleSaveDates}>
            <div className="form-grid" style={{ padding: "0 18px 16px" }}>
              <div className="control">
                <label>
                  <Cake size={13} style={{ display: "inline", marginRight: 5, verticalAlign: "middle" }} />
                  Birthday
                </label>
                <MonthDayPicker value={birthday} onChange={setBirthday} />
                <small className="subtle" style={{ fontSize: 11, marginTop: 4, display: "block" }}>Month and day only — year is not stored.</small>
              </div>
              <div className="control">
                <label>
                  <CalendarHeart size={13} style={{ display: "inline", marginRight: 5, verticalAlign: "middle" }} />
                  Work anniversary
                </label>
                <input className="input" type="date" value={workAnniversary} onChange={e => setWorkAnniversary(e.target.value)} />
                <small className="subtle" style={{ fontSize: 11, marginTop: 4, display: "block" }}>Your hire / start date. Years of service calculated automatically.</small>
              </div>
            </div>
            <div style={{ padding: "0 18px 18px", display: "flex", gap: 10, alignItems: "center" }}>
              <button className="button primary" type="submit" disabled={datesSaving}>
                {datesSaving ? "Saving…" : "Save Dates"}
              </button>
              {datesSaved && <span className="smtp-inline-ok"><CheckCircle size={13} /> Saved</span>}
              {datesError && <span className="smtp-inline-error">{datesError}</span>}
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
