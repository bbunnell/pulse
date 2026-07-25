import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { isUuid } from "@/lib/uuid";
import type { Role } from "@/lib/types";

const FALLBACK_SESSION_SECRET = "teampulse-dev-secret-key-at-least-32-chars!!";

/** iron-session requires ≥32 chars; `SESSION_SECRET=` in .env is "" and would bypass `??` and crash login. */
function resolveSessionPassword(): string {
  const fromEnv = process.env.SESSION_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 32) return fromEnv;
  return FALLBACK_SESSION_SECRET;
}

export interface SessionData {
  userId?: string;
  role?: Role;
  firstName?: string;
  lastName?: string;
}

export const sessionOptions = {
  get password() {
    return resolveSessionPassword();
  },
  cookieName: "teampulse-session",
  cookieOptions: {
    path: "/",
    sameSite: "lax" as const,
    httpOnly: true,
    /** Chrome will not store Secure cookies on http:// — keep false outside production. */
    secure: process.env.NODE_ENV === "production",
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

/** Route handlers that call session.save()/destroy() must use this so Set-Cookie attaches to the returned Response (Next.js App Router). */
export async function getSessionForApiRoute(request: NextRequest, response: NextResponse) {
  return getIronSession<SessionData>(request, response, sessionOptions);
}

/** Profile id from session, or null if missing / malformed (e.g. stale cookie from an old demo build). */
export function getSessionProfileId(session: SessionData): string | null {
  const id = session.userId;
  if (!id || !isUuid(id)) return null;
  return id;
}
