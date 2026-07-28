import { NextResponse } from "next/server";
import { getSession, getSessionProfileId } from "@/lib/session";
import { query } from "@/lib/db";
import { runOofSync } from "@/lib/oof-sync";

function isCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("x-cron-secret") === secret;
}

// POST — run the sync (admin session or cron secret)
export async function POST(request: Request) {
  if (!isCronRequest(request)) {
    const session = await getSession();
    if (!getSessionProfileId(session) || session.role !== "admin") {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }
  }

  const result = await runOofSync();
  return NextResponse.json({ ok: true, result });
}

// GET — last sync status (admin only)
export async function GET() {
  const session = await getSession();
  if (!getSessionProfileId(session) || session.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const res = await query<{ key: string; value: string }>(
    "SELECT key, value FROM app_settings WHERE key IN ('oof.last_sync_at', 'oof.last_sync_stats')",
  );
  const map = new Map(res.rows.map((r) => [r.key, r.value]));
  const lastSyncAt    = map.get("oof.last_sync_at") ?? null;
  const statsRaw      = map.get("oof.last_sync_stats");
  const lastSyncStats = statsRaw ? JSON.parse(statsRaw) : null;

  return NextResponse.json({ lastSyncAt, lastSyncStats });
}
