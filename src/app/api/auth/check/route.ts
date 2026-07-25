import { NextResponse } from "next/server";
import { getSession, getSessionProfileId } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  const userId = getSessionProfileId(session);
  return NextResponse.json({ loggedIn: !!userId, userId: userId ?? null });
}
