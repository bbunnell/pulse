import { NextResponse } from "next/server";
import { getSession, getSessionProfileId } from "@/lib/session";
import { punchIn, punchOut } from "@/lib/db-store";

type PunchAction = "punch_in" | "punch_out";

export async function POST(request: Request) {
  const session = await getSession();
  const profileId = getSessionProfileId(session);
  if (!profileId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const body = (await request.json()) as { action?: PunchAction };
  if (body.action !== "punch_in" && body.action !== "punch_out") {
    return NextResponse.json({ error: "Invalid punch action." }, { status: 400 });
  }

  if (body.action === "punch_in") {
    const shift = await punchIn(profileId);
    return NextResponse.json({ ok: true, shift });
  }

  const shift = await punchOut(profileId);
  if (!shift) {
    return NextResponse.json({ error: "No open shift found." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, shift });
}
