import { NextResponse } from "next/server";
import { getSession, getSessionProfileId } from "@/lib/session";
import { updateProfile } from "@/lib/db-store";

/** PATCH — lets the current user update their own birthday and work anniversary. */
export async function PATCH(request: Request) {
  const session = await getSession();
  const profileId = getSessionProfileId(session);
  if (!profileId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const body = (await request.json()) as {
    birthday?: string | null;
    workAnniversary?: string | null;
  };

  try {
    const updated = await updateProfile(profileId, {
      birthday: body.birthday !== undefined ? (body.birthday || null) : undefined,
      workAnniversary: body.workAnniversary !== undefined ? (body.workAnniversary || null) : undefined,
    });
    return NextResponse.json({ ok: true, profile: updated });
  } catch {
    return NextResponse.json({ error: "Failed to save." }, { status: 500 });
  }
}
