import { NextResponse } from "next/server";
import { getSession, getSessionProfileId } from "@/lib/session";
import { getMySchedule } from "@/lib/db-store";

export async function GET(request: Request) {
  const session = await getSession();
  const profileId = getSessionProfileId(session);
  if (!profileId) return NextResponse.json({ error: "Auth required." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to   = searchParams.get("to");
  if (!from || !to) return NextResponse.json({ error: "from and to are required." }, { status: 400 });

  const shifts = await getMySchedule(profileId, from, to);
  return NextResponse.json({ shifts });
}
