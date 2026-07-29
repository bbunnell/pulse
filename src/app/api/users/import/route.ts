import { NextResponse } from "next/server";
import { getSession, getSessionProfileId } from "@/lib/session";
import { createInvitedUser, findUserAuthByEmail, recordAudit } from "@/lib/db-store";
import type { ImportRow } from "@/components/AdminSettings";

export async function POST(request: Request) {
  const session = await getSession();
  const actorId = getSessionProfileId(session);
  if (!actorId || session.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const body = (await request.json()) as { users?: ImportRow[] };
  const users = body.users ?? [];

  if (!Array.isArray(users) || users.length === 0) {
    return NextResponse.json({ error: "No users provided." }, { status: 400 });
  }

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const u of users) {
    if (!u.firstName || !u.lastName || !u.email) {
      errors.push(`Skipped row: missing name or email`);
      skipped++;
      continue;
    }

    const emailLower = u.email.toLowerCase().trim();

    try {
      const exists = await findUserAuthByEmail(emailLower);
      if (exists) {
        skipped++;
        continue;
      }

      await createInvitedUser({
        firstName:        u.firstName.trim(),
        lastName:         u.lastName.trim(),
        email:            emailLower,
        role:             u.role ?? "employee",
        teamId:           u.teamId,
        timezone:         u.timezone,
        workScheduleType: u.workScheduleType,
        standardWorkDays: u.standardWorkDays,
        expectedStartTime: u.expectedStartTime,
        expectedEndTime:   u.expectedEndTime,
        birthday:          u.birthday || null,
        workAnniversary:   u.workAnniversary || null,
      });

      await recordAudit({
        actorUserId: actorId,
        entityType:  "user",
        action:      "create",
        summary:     `Bulk-imported ${u.role} account for ${u.firstName} ${u.lastName} (${emailLower})`,
      });

      created++;
    } catch (err) {
      errors.push(`${u.email}: ${String(err)}`);
    }
  }

  return NextResponse.json({ created, skipped, errors });
}
