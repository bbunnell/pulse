import { NextResponse } from "next/server";
import { reportFileName, weeklyRowsToCsv } from "@/lib/csv";
import { buildWeeklyReport } from "@/lib/reports";
import { getSession, getSessionProfileId } from "@/lib/session";
import { loadOrgData } from "@/lib/data";
import { getNotificationSettings } from "@/lib/db-store";

export async function GET(request: Request) {
  const session = await getSession();
  if (!getSessionProfileId(session)) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const url = new URL(request.url);
  const week = url.searchParams.get("week") ?? new Date().toISOString().slice(0, 10);
  const anchor = new Date(week);
  const { rows } = buildWeeklyReport(await loadOrgData(), anchor);

  // Server-side export ran in the SERVER's zone, which is UTC on this host — so
  // every downloaded timesheet showed punch times shifted by the UTC offset.
  let scheduleTz = "America/Los_Angeles";
  try { scheduleTz = (await getNotificationSettings()).orgTimezone; } catch { /* default */ }

  return new NextResponse(weeklyRowsToCsv(rows, scheduleTz), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${reportFileName(week)}"`,
    },
  });
}
