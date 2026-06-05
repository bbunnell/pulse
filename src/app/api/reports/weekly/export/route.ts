import { NextResponse } from "next/server";
import { reportFileName, weeklyRowsToCsv } from "@/lib/csv";
import { buildWeeklyReport } from "@/lib/reports";
import { getSession, getSessionProfileId } from "@/lib/session";
import { loadOrgData } from "@/lib/data";

export async function GET(request: Request) {
  const session = await getSession();
  if (!getSessionProfileId(session)) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const url = new URL(request.url);
  const week = url.searchParams.get("week") ?? new Date().toISOString().slice(0, 10);
  const anchor = new Date(week);
  const { rows } = buildWeeklyReport(await loadOrgData(), anchor);

  return new NextResponse(weeklyRowsToCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${reportFileName(week)}"`,
    },
  });
}
