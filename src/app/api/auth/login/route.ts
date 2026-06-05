import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSessionForApiRoute } from "@/lib/session";
import { createPasswordResetToken, findUserAuthByEmail } from "@/lib/db-store";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    const emailLower = (body.email ?? "").toLowerCase();

    const user = await findUserAuthByEmail(emailLower);

    if (!user) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    if (!bcrypt.compareSync(body.password ?? "", user.password_hash)) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    if (user.must_set_password) {
      const token = await createPasswordResetToken(user.profile_id);
      return NextResponse.json({ mustSetPassword: true, token }, { status: 200 });
    }

    const jar = new NextResponse(null);
    const session = await getSessionForApiRoute(request, jar);
    session.userId = user.profile_id;
    session.role = user.role;
    session.firstName = user.first_name;
    session.lastName = user.last_name;
    await session.save();

    return NextResponse.json({ ok: true, role: user.role }, { headers: jar.headers });
  } catch (err) {
    console.error("POST /api/auth/login", err);
    const detail =
      process.env.NODE_ENV === "development" && err instanceof Error ? err.message : null;
    return NextResponse.json(
      { error: detail ?? "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
