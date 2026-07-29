import { NextRequest, NextResponse } from "next/server";
import { getSsoSettings } from "@/lib/db-store";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";
import type { SessionData } from "@/lib/session";
import { query } from "@/lib/db";
import { storeTeamsToken } from "@/lib/teams-tokens";
import crypto from "crypto";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code       = searchParams.get("code");
  const state      = searchParams.get("state");
  const errorParam = searchParams.get("error");

  const baseUrl  = process.env.BASE_URL ?? request.nextUrl.origin;
  const loginUrl = new URL("/login", baseUrl);

  if (errorParam) {
    loginUrl.searchParams.set("sso_error", "cancelled");
    return NextResponse.redirect(loginUrl);
  }

  if (!code || !state) {
    loginUrl.searchParams.set("sso_error", "invalid");
    return NextResponse.redirect(loginUrl);
  }

  // Decode state — may be base64url-encoded JSON {nonce, teams} or a plain hex string
  let nonce = state;
  let isTeamsPopup = false;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
    nonce = decoded.nonce ?? state;
    isTeamsPopup = decoded.teams === true;
  } catch { /* plain hex state — not a Teams popup */ }

  const storedState = request.cookies.get("ms_oauth_state")?.value;
  if (!storedState || storedState !== nonce) {
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
    const errBody = await tokenRes.json().catch(() => ({}));
    console.error("[SSO] token exchange failed", tokenRes.status, errBody);
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

  if (isTeamsPopup) {
    // Teams popup: don't set the session cookie here — it would be scoped to the popup
    // window and never reach the Teams iframe. Instead generate a short-lived one-time
    // token, redirect to teams-end which passes it back via notifySuccess(), and let
    // the login page exchange it for a session cookie from the iframe context.
    const token = crypto.randomBytes(32).toString("hex");
    storeTeamsToken(token, {
      userId:    profile.id,
      role:      profile.role,
      firstName: profile.first_name,
      lastName:  profile.last_name,
    });
    const teamsEndUrl = new URL("/auth/teams-end", baseUrl);
    teamsEndUrl.searchParams.set("token", token);
    const response = NextResponse.redirect(teamsEndUrl);
    response.cookies.set("ms_oauth_state", "", { maxAge: 0, path: "/" });
    return response;
  }

  // Regular browser: set session cookie and redirect to the app.
  const successUrl = new URL("/", baseUrl);
  const response = NextResponse.redirect(successUrl);
  response.cookies.set("ms_oauth_state", "", { maxAge: 0, path: "/" });

  const session = await getIronSession<SessionData>(request, response, sessionOptions);
  session.userId    = profile.id;
  session.role      = profile.role as SessionData["role"];
  session.firstName = profile.first_name;
  session.lastName  = profile.last_name;
  await session.save();

  return response;
}
