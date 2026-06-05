import { NextResponse } from "next/server";
import { buildWeeklyReport } from "@/lib/reports";
import { getSession, getSessionProfileId } from "@/lib/session";
import { loadOrgData } from "@/lib/data";

export async function GET(request: Request) {
  const session = await getSession();
  if (!getSessionProfileId(session)) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const url = new URL(request.url);
  const week = url.searchParams.get("week");
  const anchor = week ? new Date(week) : new Date();

  return NextResponse.json(buildWeeklyReport(await loadOrgData(), anchor));
}
