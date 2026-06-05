import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSessionForApiRoute } from "@/lib/session";

export async function POST(request: NextRequest) {
  const jar = new NextResponse(null);
  const session = await getSessionForApiRoute(request, jar);
  session.destroy();
  return NextResponse.json({ ok: true }, { headers: jar.headers });
}
