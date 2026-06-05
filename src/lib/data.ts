import { getSession, getSessionProfileId } from "@/lib/session";
import { getProfileById, getScheduledShifts, loadOrgDataFromDb } from "@/lib/db-store";
import type { OrgData, Profile, ScheduledShift } from "@/lib/types";

export async function loadOrgData(): Promise<OrgData> {
  return loadOrgDataFromDb();
}

/**
 * Scheduled shifts spanning yesterday → tomorrow (local), so the dashboard can
 * resolve overnight shifts and per-employee timezone edges correctly.
 */
export async function loadScheduleWindow(now: Date = new Date()): Promise<ScheduledShift[]> {
  const day = (offset: number) => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  try {
    return await getScheduledShifts(day(-1), day(1));
  } catch {
    return [];
  }
}

export async function getCurrentUserProfile(): Promise<Profile | null> {
  const session = await getSession();
  const profileId = getSessionProfileId(session);
  if (!profileId) return null;
  return getProfileById(profileId);
}
