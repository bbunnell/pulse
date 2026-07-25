import { NextResponse } from "next/server";
import { getSsoSettings } from "@/lib/db-store";

export async function GET() {
  const s = await getSsoSettings();
  return NextResponse.json({
    enabled: s.enabled && s.clientId.length > 0 && s.tenantId.length > 0 && s.clientSecret.length > 0,
  });
}
