import { NextResponse } from "next/server";
import { getSession, getSessionProfileId } from "@/lib/session";
import { startSegment, endSegment } from "@/lib/db-store";

type SegmentAction = "start_break" | "end_break" | "start_lunch" | "end_lunch";

export async function POST(request: Request) {
  const session = await getSession();
  const profileId = getSessionProfileId(session);
  if (!profileId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const body = (await request.json()) as { action?: SegmentAction };
  const validActions: SegmentAction[] = ["start_break", "end_break", "start_lunch", "end_lunch"];
  if (!body.action || !validActions.includes(body.action)) {
    return NextResponse.json({ error: "Invalid segment action." }, { status: 400 });
  }

  const [verb, type] = body.action.split("_") as ["start" | "end", "break" | "lunch"];

  if (verb === "start") {
    try {
      const seg = await startSegment(profileId, type);
      if (!seg) return NextResponse.json({ error: "No open shift found." }, { status: 400 });
      return NextResponse.json({ ok: true, segment: seg });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start segment.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const seg = await endSegment(profileId, type);
  if (!seg) return NextResponse.json({ error: "No open segment found." }, { status: 400 });
  return NextResponse.json({ ok: true, segment: seg });
}
