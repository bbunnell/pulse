import { NextResponse } from "next/server";
import { getSession, getSessionProfileId } from "@/lib/session";
import { createScheduleTemplate, deleteScheduleTemplate, getScheduleTemplates } from "@/lib/db-store";
import type { TemplateShift } from "@/lib/types";

export async function GET() {
  const session = await getSession();
  if (!getSessionProfileId(session)) return NextResponse.json({ error: "Auth required." }, { status: 401 });
  const templates = await getScheduleTemplates();
  return NextResponse.json({ templates });
}

export async function POST(request: Request) {
  const session = await getSession();
  const actorId = getSessionProfileId(session);
  if (!actorId || (session.role !== "admin" && session.role !== "manager")) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const body = (await request.json()) as { name?: string; description?: string; shifts?: TemplateShift[] };
  if (!body.name || !body.shifts?.length) {
    return NextResponse.json({ error: "name and shifts are required." }, { status: 400 });
  }

  const template = await createScheduleTemplate({ name: body.name, description: body.description, shifts: body.shifts, createdBy: actorId });
  return NextResponse.json({ ok: true, template });
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!getSessionProfileId(session) || (session.role !== "admin" && session.role !== "manager")) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }
  const { id } = (await request.json()) as { id?: string };
  if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });
  await deleteScheduleTemplate(id);
  return NextResponse.json({ ok: true });
}
