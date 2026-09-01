import { getEmailSettings } from "@/lib/db-store";
import { query } from "@/lib/db";
import { zonedTimeToUtc } from "@/lib/timezone";

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

async function getOofPeriods(email: string, token: string, tz: string): Promise<OofPeriod[]> {
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
        const start = parseGraphDate(d.scheduledStartDateTime, tz);
        const end   = parseGraphDate(d.scheduledEndDateTime, tz);
        if (end > now) {
          // The scheduled end is the moment the auto-reply STOPS — the moment
          // they are back — not the last day away. Someone off Wednesday and
          // Thursday sets the window to end Friday 00:00. Backing off one second
          // gives the last day actually covered, so Friday is not booked as
          // leave. A window ending mid-afternoon still counts that day.
          const lastCovered = new Date(end.getTime() - 1000);
          const startDate = toDateStr(start < now ? now : start, tz);
          const endDate   = toDateStr(lastCovered, tz);
          if (endDate >= startDate) {
            periods.push({ startDate, endDate, notes: "Out of office (auto-reply)" });
          }
        }
      }
      // status === "alwaysEnabled" is deliberately ignored. An auto-reply with no
      // end date carries no date information, so this used to invent one 60 days
      // out and book the person a two-month vacation. Plenty of people leave an
      // auto-reply on indefinitely ("I check email twice a day") without being
      // away at all. Only a SCHEDULED auto-reply, which has real start and end
      // dates the person chose, becomes time off.
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
      $select:       "subject,start,end,showAs,isAllDay,isCancelled,responseStatus",
      $top:          "50",
    });
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}/calendarView?${params}`,
      { headers: { Authorization: `Bearer ${token}`, Prefer: "outlook.timezone=\"UTC\"" } },
    );
    if (res.ok) {
      const d = (await res.json()) as { value?: Array<{
        subject?: string; start: { dateTime: string }; end: { dateTime: string };
        isAllDay?: boolean; isCancelled?: boolean; responseStatus?: { response?: string };
      }> };
      for (const ev of d.value ?? []) {
        // calendarView returns events the user cancelled or declined; those are not
        // time off. Without this a stale or rejected invite keeps someone "out"
        // indefinitely, and re-creates itself on every sync if deleted by hand.
        if (ev.isCancelled) continue;
        const resp = ev.responseStatus?.response;
        if (resp === "declined") continue;
        const todayLocal = toDateStr(now, tz);
        let startDate: string;
        let endDate: string;

        if (ev.isAllDay) {
          // An all-day event carries FLOATING dates, not instants — "Sep 2" means
          // the 2nd wherever you are. Converting it to a zone is what broke this:
          // Sep 2 00:00 read as UTC lands on Sep 1 in Chicago, so a Wednesday
          // start showed as Tuesday. Take the date part as written.
          //
          // Its end is exclusive: Wednesday and Thursday off is stored Sep 2 ->
          // Sep 4, so the last day off is the day before the end.
          startDate = ev.start.dateTime.slice(0, 10);
          endDate   = addDaysIso(ev.end.dateTime.slice(0, 10), -1);
        } else {
          // A timed event is a real instant, so the employee's zone decides which
          // calendar day it falls on. One second back off the end keeps a window
          // that stops at midnight from claiming the next day.
          const start = new Date(ev.start.dateTime.endsWith("Z") ? ev.start.dateTime : ev.start.dateTime + "Z");
          const end   = new Date(ev.end.dateTime.endsWith("Z")   ? ev.end.dateTime   : ev.end.dateTime   + "Z");
          if (end <= now) continue;
          startDate = toDateStr(start, tz);
          endDate   = toDateStr(new Date(end.getTime() - 1000), tz);
        }

        if (endDate < todayLocal) continue;              // wholly in the past
        if (startDate < todayLocal) startDate = todayLocal;  // already under way
        if (endDate < startDate) continue;
        periods.push({
          startDate,
          endDate,
          notes: `Out of office: ${ev.subject?.trim() || "calendar event"}`,
        });
      }
    }
  } catch {
    // swallow per-user errors
  }

  return dedup(periods);
}

/**
 * Graph returns the auto-reply window as a naive wall-clock string plus a
 * WINDOWS timezone name ("Central Standard Time"), which Node cannot parse.
 *
 * This used to append "Z" and call it "close enough for date-level sync". It is
 * not: for anyone west of UTC that shifts the instant back 5-8 hours, and since
 * people set out-of-office windows to start at midnight, it lands on the
 * previous day. Armando set Wed-Thu and the board showed him away from Tuesday.
 *
 * The employee's IANA timezone on their profile is the reliable source — the
 * window was set by them, in their own mailbox. A window Graph explicitly marks
 * UTC is still honoured as UTC.
 */
function parseGraphDate(dt: { dateTime: string; timeZone: string }, tz: string): Date {
  const raw = dt.dateTime.replace(/Z$/, "");
  if (dt.timeZone.toUpperCase() === "UTC") return new Date(raw + "Z");
  const [datePart, timePart = "00:00:00"] = raw.split("T");
  return zonedTimeToUtc(datePart, timePart.slice(0, 8), tz);
}

/** Shift a YYYY-MM-DD string by whole days without touching timezones. */
function addDaysIso(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Calendar date of an instant, read in the employee's own zone. */
function toDateStr(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
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

/**
 * Days covered, counting both ends. `endDate` is the last day away, so Wed->Thu
 * is two days. The previous version treated the end as exclusive while the row
 * it wrote treated it as inclusive, so a record could claim 16 hours of leave
 * across a three-day span and disagree with itself.
 */
function daysBetween(start: string, end: string): number {
  const ms = new Date(end + "T00:00:00Z").getTime() - new Date(start + "T00:00:00Z").getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
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

  const profilesRes = await query<{ id: string; email: string; timezone: string }>(
    "SELECT id, email, timezone FROM profiles WHERE status = 'active' AND email IS NOT NULL AND email != '' ORDER BY email",
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
      const ptz = profile.timezone || "America/Chicago";
      const oofPeriods = await getOofPeriods(profile.email, token, ptz);

      // Existing oof_sync entries that haven't ended yet
      const existingRes = await query<{ id: string; start_at: string; end_at: string }>(
        // Read back in the employee's zone, matching how these are now written.
        // Reading at UTC while writing at local midnight would make every row
        // look like a mismatch and churn a delete + insert on every run.
        `SELECT id,
                to_char(start_at AT TIME ZONE $2, 'YYYY-MM-DD') AS start_at,
                to_char(end_at   AT TIME ZONE $2, 'YYYY-MM-DD') AS end_at
           FROM time_off_entries
          WHERE user_id = $1 AND source = 'oof_sync' AND end_at >= now()`,
        [profile.id, profile.timezone || "America/Chicago"],
      );

      const existingByKey = new Map(existingRes.rows.map((r) => [`${r.start_at}|${r.end_at}`, r.id]));
      const newKeys       = new Set(oofPeriods.map((p) => `${p.startDate}|${p.endDate}`));

      // Insert new OOF periods not already in DB
      for (const period of oofPeriods) {
        const key = `${period.startDate}|${period.endDate}`;
        if (!existingByKey.has(key)) {
          const hours = daysBetween(period.startDate, period.endDate) * 8;
          await query(
            // Anchored to midnight in the EMPLOYEE's zone. Casting a date
            // straight into a timestamptz column resolves at the server zone,
            // which is UTC here, so a Chicago employee's day began at 7pm the
            // evening before and the board showed them off a day early.
            `INSERT INTO time_off_entries
               (user_id, time_off_type, start_at, end_at, full_day, hours, status, notes, source)
             VALUES ($1, 'vacation', $2, $3, true, $4, 'approved', $5, 'oof_sync')`,
            [
              profile.id,
              zonedTimeToUtc(period.startDate, "00:00", ptz),
              zonedTimeToUtc(period.endDate, "23:59:59", ptz),
              hours,
              period.notes,
            ],
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
