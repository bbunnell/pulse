import { NextResponse } from "next/server";
import { getSession, getSessionProfileId } from "@/lib/session";
import {
  deleteProfile,
  getProfileById,
  recordAudit,
  updateProfile,
  updateProfileTeamsWebhook,
} from "@/lib/db-store";
import type { Role } from "@/lib/types";

// PATCH — update any profile fields
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  const actorId = getSessionProfileId(session);
  if (!actorId || session.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { id } = await params;
  const body = (await request.json()) as {
    firstName?: string;
    lastName?: string;
    email?: string;
    role?: Role;
    teamId?: string | null;
    expectedStartTime?: string;
    status?: "active" | "inactive";
    timezone?: string;
    showOnDashboard?: boolean;
    teamsWebhookUrl?: string | null;
    birthday?: string | null;
    workAnniversary?: string | null;
    workScheduleType?: "standard" | "shift_based";
    standardWorkDays?: number[];
  };

  try {
    const before = await getProfileById(id);

    // Teams webhook is stored on the same row — handle alongside other fields
    if (body.teamsWebhookUrl !== undefined) {
      await updateProfileTeamsWebhook(id, body.teamsWebhookUrl);
    }

    const { teamsWebhookUrl: _w, ...profilePatch } = body;
    const hasProfilePatch = Object.values(profilePatch).some((v) => v !== undefined);

    if (hasProfilePatch) {
      const updated = await updateProfile(id, profilePatch);
      // Build a concise change summary
      const changed: string[] = [];
      if (before) {
        if (body.role && body.role !== before.role) changed.push(`role ${before.role}→${body.role}`);
        if (body.status && body.status !== before.status) changed.push(`status ${before.status}→${body.status}`);
        if (body.timezone && body.timezone !== before.timezone) changed.push(`timezone→${body.timezone}`);
        if (body.showOnDashboard !== undefined && body.showOnDashboard !== before.showOnDashboard) changed.push(`dashboard ${body.showOnDashboard ? "shown" : "hidden"}`);
        if (body.email && body.email !== before.email) changed.push("email");
        if (body.firstName || body.lastName) changed.push("name");
        if (body.teamId !== undefined) changed.push("team");
        if (body.expectedStartTime) changed.push("start time");
      }
      await recordAudit({
        actorUserId: actorId,
        targetUserId: id,
        entityType: "user",
        entityId: id,
        action: "update",
        summary: `Updated ${updated.firstName} ${updated.lastName}${changed.length ? ` (${changed.join(", ")})` : ""}`,
        before: before ? { role: before.role, status: before.status, timezone: before.timezone } : undefined,
        after: { role: updated.role, status: updated.status, timezone: updated.timezone },
      });
      return NextResponse.json({ ok: true, profile: updated });
    }

    if (body.teamsWebhookUrl !== undefined) {
      await recordAudit({
        actorUserId: actorId, targetUserId: id, entityType: "user", entityId: id,
        action: "update", summary: `Updated Teams webhook for ${before ? before.firstName + " " + before.lastName : "user"}`,
      });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to update profile." }, { status: 500 });
  }
}

// DELETE — remove a user and all their data
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  const actorId = getSessionProfileId(session);
  if (!actorId || session.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { id } = await params;

  if (id === actorId) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }

  try {
    const before = await getProfileById(id);
    const removed = await deleteProfile(id);
    if (!removed) return NextResponse.json({ error: "User not found." }, { status: 404 });
    await recordAudit({
      actorUserId: actorId,
      targetUserId: id,
      entityType: "user",
      entityId: id,
      action: "delete",
      summary: `Deleted user ${before ? `${before.firstName} ${before.lastName} (${before.email})` : id}`,
      before: before ? { email: before.email, role: before.role } : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete user." }, { status: 500 });
  }
}

// GET — fetch a single profile (used after save to refresh state)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!getSessionProfileId(session) || session.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { id } = await params;
  const profile = await getProfileById(id);
  if (!profile) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ profile });
}
