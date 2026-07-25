import { NextResponse } from "next/server";
import { getSsoSettings } from "@/lib/db-store";
import crypto from "crypto";

export async function GET() {
  const sso = await getSsoSettings();
  if (!sso.enabled || !sso.clientId || !sso.tenantId || !sso.clientSecret) {
    return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_BASE_URL ?? "https://pulse.nbit.com"));
  }

  const state = crypto.randomBytes(16).toString("hex");
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://pulse.nbit.com";

  const params = new URLSearchParams({
    client_id:     sso.clientId,
    response_type: "code",
    redirect_uri:  `${baseUrl}/api/auth/callback/microsoft-entra-id`,
    response_mode: "query",
    scope:         "openid profile email",
    state,
  });

  const authUrl = `https://login.microsoftonline.com/${sso.tenantId}/oauth2/v2.0/authorize?${params}`;

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("ms_oauth_state", state, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge:   300,
    path:     "/",
  });
  return response;
}
