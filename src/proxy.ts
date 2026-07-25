import { getIronSession } from "iron-session";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { SessionData } from "@/lib/session";
import { getSessionProfileId, sessionOptions } from "@/lib/session";

export async function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(request, response, sessionOptions);

  const { pathname } = request.nextUrl;
  const isLoginPage = pathname === "/login";
  const userId = getSessionProfileId(session);
  const hasCookie = !!request.cookies.get("teampulse-session");

  console.log(`[MW] ${request.method} ${pathname} cookie=${hasCookie} userId=${userId ?? "none"}`);

  if (!userId && !isLoginPage) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (userId && isLoginPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon\\.ico|.*\\.png$|.*\\.ico$|.*\\.svg$|.*\\.jpg$|.*\\.jpeg$|.*\\.gif$|.*\\.webp$).*)"],
};
