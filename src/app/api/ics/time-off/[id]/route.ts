import { NextResponse } from "next/server";
import { buildTimeOffIcs, icsFileName } from "@/lib/ics";
import { getSession, getSessionProfileId } from "@/lib/session";
import { getProfileById, getTimeOffEntryById } from "@/lib/db-store";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!getSessionProfileId(session)) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { id } = await context.params;
  const entry = await getTimeOffEntryById(id);
  const profile = entry ? await getProfileById(entry.userId) : undefined;

  if (!entry || !profile) {
    return NextResponse.json({ error: "Time off entry not found." }, { status: 404 });
  }

  const ics = await buildTimeOffIcs(entry, profile);
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${icsFileName(entry, profile)}"`,
    },
  });
}
