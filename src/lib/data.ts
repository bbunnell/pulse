import { getSession, getSessionProfileId } from "@/lib/session";
import { getProfileById, loadOrgDataFromDb } from "@/lib/db-store";
import type { OrgData, Profile } from "@/lib/types";

export async function loadOrgData(): Promise<OrgData> {
  return loadOrgDataFromDb();
}

export async function getCurrentUserProfile(): Promise<Profile | null> {
  const session = await getSession();
  const profileId = getSessionProfileId(session);
  if (!profileId) return null;
  return getProfileById(profileId);
}
