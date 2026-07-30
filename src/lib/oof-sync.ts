import { getEmailSettings } from "@/lib/db-store";
import { query } from "@/lib/db";

export interface OofSyncResult {
  checkedProfiles: number;
  synced: number;
  removed: number;
  errors: string[];
  at: string;
  permissionsOk: boolean;
  permissionErrors: string[];
}

interface OofPeriod {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  notes: string;
}

// ── Graph helpers ─────────────────────────────────────────────────────────────

async function getGraphToken(tenantId: string, clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        scope:         "https://graph.microsoft.com/.default",
        grant_type:    "client_credentials",
      }),
    },
  );
  const json = (await res.json()) as { access_token?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description ?? `Token request failed (${res.status})`);
  }
  return json.access_token;
}

async function checkOofPermissions(email: string, token: string): Promise<string[]> {
  const missing: string[] = [];
  const headers = { Authorization: `Bearer ${token}` };
  const [mailRes, calRes] = await Promise.all([
    fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}/mailboxSettings/automaticRepliesSetting`, { headers }),
    fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}/calendarView?startDateTime=${new Date().toISOString()}&endDateTime=${new Date().toISOString()}&$top=1`, { headers }),
  ]);
  if (mailRes.status === 403) missing.push("MailboxSettings.Read — not granted or missing admin consent");
  if (calRes.status === 403) missing.push("Calendars.Read — not granted or missing admin consent");
  return missing;
}

async function getOofPeriods(email: string, token: string): Promise<OofPeriod[]> {
  const periods: OofPeriod[] = [];
  const now     = new Date();
  const horizon = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1_000); // 60 days ahead

  // 1. Automatic replies (OOF setting in Outlook)
  try {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}/mailboxSettings/automaticRepliesSetting`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.ok) {
      const d = (await res.json()) as {
        status?: string;
        scheduledStartDateTime?: { dateTime: string; timeZone: string };
        scheduledEndDateTime?:   { dateTime: string; timeZone: string };
      };
      if (d.status === "scheduled" && d.scheduledStartDateTime && d.scheduledEndDateTime) {
        const start = parseGraphDate(d.scheduledStartDateTime);
        const end   = parseGraphDate(d.scheduledEndDateTime);
        if (end > now) {
          periods.push({
            startDate: toDateStr(start < now ? now : start),
            endDate:   toDateStr(end),
            notes:     "Out of office (auto-reply)",
          });
        }
      } else if (d.status === "alwaysEnabled") {
        periods.push({
          startDate: toDateStr(now),
          endDate:   toDateStr(horizon),
          notes:     "Out of office (auto-reply always on)",
        });
      }
    }
  } catch {
    // swallow per-user errors; caller aggregates them
  }

  // 2. Calendar events marked showAs = oof
  try {
    const params = new URLSearchParams({
      startDateTime: now.toISOString(),
      endDateTime:   horizon.toISOString(),
      $filter:       "showAs eq 'oof'",
      $select:       "subject,start,end,showAs",
      $top:          "50",
    });
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}/calendarView?${params}`,
      { headers: { Authorization: `Bearer ${token}`, Prefer: "outlook.timezone=\"UTC\"" } },
    );
    if (res.ok) {
      const d = (await res.json()) as { value?: Array<{ subject?: string; start: { dateTime: string }; end: { dateTime: string } }> };
      for (const ev of d.value ?? []) {
        const start = new Date(ev.start.dateTime.endsWith("Z") ? ev.start.dateTime : ev.start.dateTime + "Z");
        const end   = new Date(ev.end.dateTime.endsWith("Z")   ? ev.end.dateTime   : ev.end.dateTime   + "Z");
        if (end <= now) continue;
        periods.push({
          startDate: toDateStr(start < now ? now : start),
          endDate:   toDateStr(end),
          notes:     `Out of office: ${ev.subject?.trim() || "calendar event"}`,
        });
      }
    }
  } catch {
    // swallow per-user errors
  }

  return dedup(periods);
}

function parseGraphDate(dt: { dateTime: string; timeZone: string }): Date {
  const str = dt.timeZone.toUpperCase() === "UTC"
    ? dt.dateTime.endsWith("Z") ? dt.dateTime : dt.dateTime + "Z"
    : dt.dateTime + "Z"; // treat non-UTC as UTC for simplicity (close enough for date-level sync)
  return new Date(str);
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dedup(periods: OofPeriod[]): OofPeriod[] {
  const seen = new Set<string>();
  return periods.filter((p) => {
    const key = `${p.startDate}|${p.endDate}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function daysBetween(start: string, end: string): number {
  return Math.max(1, Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000));
}

// ── Main sync ─────────────────────────────────────────────────────────────────

export async function runOofSync(): Promise<OofSyncResult> {
  const cfg = await getEmailSettings();

  if (!cfg.tenantId || !cfg.clientId || !cfg.clientSecret) {
    return {
      checkedProfiles: 0, synced: 0, removed: 0,
      errors: ["Microsoft 365 not configured — save Entra credentials in Email Configuration first."],
      at: new Date().toISOString(), permissionsOk: false, permissionErrors: [],
    };
  }

  let token: string;
  try {
    token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret);
  } catch (err) {
    return {
      checkedProfiles: 0, synced: 0, removed: 0,
      errors: [err instanceof Error ? err.message : "Failed to acquire Graph token"],
      at: new Date().toISOString(), permissionsOk: false, permissionErrors: [],
    };
  }

  const profilesRes = await query<{ id: string; email: string }>(
    "SELECT id, email FROM profiles WHERE status = 'active' AND email IS NOT NULL AND email != '' ORDER BY email",
  );

  // Permission probe using the first available profile
  let permissionErrors: string[] = [];
  const probeEmail = profilesRes.rows[0]?.email;
  if (probeEmail) {
    permissionErrors = await checkOofPermissions(probeEmail, token);
    if (permissionErrors.length > 0) {
      return {
        checkedProfiles: 0, synced: 0, removed: 0,
        errors: permissionErrors.map((m) => `Missing permission: ${m}`),
        at: new Date().toISOString(),
        permissionsOk: false,
        permissionErrors,
      };
    }
  }

  let synced   = 0;
  let removed  = 0;
  const errors: string[] = [];

  for (const profile of profilesRes.rows) {
    try {
      const oofPeriods = await getOofPeriods(profile.email, token);

      // Existing oof_sync entries that haven't ended yet
      const existingRes = await query<{ id: string; start_at: string; end_at: string }>(
        `SELECT id,
                to_char(start_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS start_at,
                to_char(end_at   AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS end_at
           FROM time_off_entries
          WHERE user_id = $1 AND source = 'oof_sync' AND end_at >= now()`,
        [profile.id],
      );

      const existingByKey = new Map(existingRes.rows.map((r) => [`${r.start_at}|${r.end_at}`, r.id]));
      const newKeys       = new Set(oofPeriods.map((p) => `${p.startDate}|${p.endDate}`));

      // Insert new OOF periods not already in DB
      for (const period of oofPeriods) {
        const key = `${period.startDate}|${period.endDate}`;
        if (!existingByKey.has(key)) {
          const hours = daysBetween(period.startDate, period.endDate) * 8;
          await query(
            `INSERT INTO time_off_entries
               (user_id, time_off_type, start_at, end_at, full_day, hours, status, notes, source)
             VALUES ($1, 'vacation', $2::date, $3::date + interval '23 hours 59 minutes 59 seconds', true, $4, 'approved', $5, 'oof_sync')`,
            [profile.id, period.startDate, period.endDate, hours, period.notes],
          );
          synced++;
        }
      }

      // Remove stale oof_sync entries that are no longer in Graph
      for (const [key, id] of existingByKey) {
        if (!newKeys.has(key)) {
          await query("DELETE FROM time_off_entries WHERE id = $1", [id]);
          removed++;
        }
      }
    } catch (err) {
      errors.push(`${profile.email}: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  // Persist last-sync metadata
  const at = new Date().toISOString();
  await query(
    `INSERT INTO app_settings (key, value) VALUES ('oof.last_sync_at', $1)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now()`,
    [at],
  );
  await query(
    `INSERT INTO app_settings (key, value) VALUES ('oof.last_sync_stats', $1)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now()`,
    [JSON.stringify({ checkedProfiles: profilesRes.rows.length, synced, removed, errorCount: errors.length })],
  );

  return { checkedProfiles: profilesRes.rows.length, synced, removed, errors, at, permissionsOk: true, permissionErrors: [] };
}
