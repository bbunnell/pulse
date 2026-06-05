import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSessionForApiRoute } from "@/lib/session";
import { consumePasswordResetToken, getProfileById, updateUserPassword, validatePasswordResetToken } from "@/lib/db-store";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { token?: string; password?: string };

  if (!body.token || !body.password) {
    return NextResponse.json({ error: "Missing token or password." }, { status: 400 });
  }

  if (body.password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const entry = await consumePasswordResetToken(body.token);
  if (!entry) {
    return NextResponse.json({ error: "This link has expired or already been used." }, { status: 400 });
  }

  const user = await getProfileById(entry.profile_id);
  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 400 });
  }

  await updateUserPassword(user.id, body.password);

  const jar = new NextResponse(null);
  const session = await getSessionForApiRoute(request, jar);
  session.userId = user.id;
  session.role = user.role;
  session.firstName = user.firstName;
  session.lastName = user.lastName;
  await session.save();

  return NextResponse.json({ ok: true }, { headers: jar.headers });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token") ?? "";

  // Import validate without consuming so the page can show user's name
  const entry = await validatePasswordResetToken(token);

  if (!entry) {
    return NextResponse.json({ valid: false });
  }

  return NextResponse.json({ valid: true, firstName: entry.first_name ?? "" });
}
