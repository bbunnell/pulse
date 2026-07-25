import { NextRequest, NextResponse } from "next/server";
import { getSsoSettings } from "@/lib/db-store";
import crypto from "crypto";

export async function GET(request: NextRequest) {
  const sso = await getSsoSettings();
  const baseUrl = process.env.BASE_URL ?? request.nextUrl.origin;

  if (!sso.enabled || !sso.clientId || !sso.tenantId || !sso.clientSecret) {
    return NextResponse.redirect(new URL("/login", baseUrl));
  }

  const state = crypto.randomBytes(16).toString("hex");

  const params = new URLSearchParams({
    client_id:     sso.clientId,
    response_type: "code",
    redirect_uri:  `${baseUrl}/api/auth/callback/microsoft-entra-id`,
    response_mode: "query",
    scope:         "openid profile email",
    state,
  });

  const authUrl = `https://login.microsoftonline.com/${sso.tenantId}/oauth2/v2.0/authorize?${params}`;

  const isTeamsPopup = request.nextUrl.searchParams.get("teams") === "1";

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("ms_oauth_state", state, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "none",
    maxAge:   300,
    path:     "/",
  });
  if (isTeamsPopup) {
    response.cookies.set("ms_oauth_teams_popup", "1", {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "none",
      maxAge:   300,
      path:     "/",
    });
  }
  return response;
}
