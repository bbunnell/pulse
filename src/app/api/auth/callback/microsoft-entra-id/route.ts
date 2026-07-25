import { NextRequest, NextResponse } from "next/server";
import { getSsoSettings } from "@/lib/db-store";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import type { SessionData } from "@/lib/session";
import { query } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code       = searchParams.get("code");
  const state      = searchParams.get("state");
  const errorParam = searchParams.get("error");

  const baseUrl  = request.nextUrl.origin;
  const loginUrl = new URL("/login", baseUrl);

  if (errorParam) {
    loginUrl.searchParams.set("sso_error", "cancelled");
    return NextResponse.redirect(loginUrl);
  }

  if (!code || !state) {
    loginUrl.searchParams.set("sso_error", "invalid");
    return NextResponse.redirect(loginUrl);
  }

  const storedState = request.cookies.get("ms_oauth_state")?.value;
  if (!storedState || storedState !== state) {
    loginUrl.searchParams.set("sso_error", "state");
    return NextResponse.redirect(loginUrl);
  }

  const sso = await getSsoSettings();

  // Exchange code for tokens
  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${sso.tenantId}/oauth2/v2.0/token`,
    {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    new URLSearchParams({
        client_id:     sso.clientId,
        client_secret: sso.clientSecret,
        grant_type:    "authorization_code",
        code,
        redirect_uri:  `${baseUrl}/api/auth/callback/microsoft-entra-id`,
      }),
    },
  );

  if (!tokenRes.ok) {
    loginUrl.searchParams.set("sso_error", "token");
    return NextResponse.redirect(loginUrl);
  }

  const tokens = (await tokenRes.json()) as { access_token?: string };
  if (!tokens.access_token) {
    loginUrl.searchParams.set("sso_error", "token");
    return NextResponse.redirect(loginUrl);
  }

  // Fetch user info from Graph
  const userRes = await fetch("https://graph.microsoft.com/oidc/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userRes.ok) {
    loginUrl.searchParams.set("sso_error", "userinfo");
    return NextResponse.redirect(loginUrl);
  }

  const userInfo = (await userRes.json()) as {
    email?: string;
    preferred_username?: string;
    name?: string;
    given_name?: string;
    family_name?: string;
  };

  const email = (userInfo.email ?? userInfo.preferred_username ?? "").toLowerCase();
  if (!email) {
    loginUrl.searchParams.set("sso_error", "noemail");
    return NextResponse.redirect(loginUrl);
  }

  // Match profile by email
  const result = await query<{ id: string; role: string; first_name: string; last_name: string }>(
    "select id, role, first_name, last_name from profiles where lower(email) = $1 limit 1",
    [email],
  );

  if (!result.rows[0]) {
    loginUrl.searchParams.set("sso_error", "noaccount");
    return NextResponse.redirect(loginUrl);
  }

  const profile = result.rows[0];

  const response = NextResponse.redirect(new URL("/", baseUrl));
  // Clear state cookie
  response.cookies.set("ms_oauth_state", "", { maxAge: 0, path: "/" });

  const session = await getIronSession<SessionData>(request, response, sessionOptions);
  session.userId    = profile.id;
  session.role      = profile.role as SessionData["role"];
  session.firstName = profile.first_name;
  session.lastName  = profile.last_name;
  await session.save();

  return response;
}
