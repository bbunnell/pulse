import { redirect } from "next/navigation";
import { getCurrentUserProfile, loadOrgData } from "@/lib/data";
import { getNotificationSettings } from "@/lib/db-store";
import { ScheduleView } from "@/components/ScheduleView";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const currentUser = await getCurrentUserProfile();
  if (!currentUser) redirect("/login");

  let profiles: Profile[] = [];
  let timeOff: import("@/lib/types").TimeOffEntry[] = [];
  let scheduleTz = "America/Los_Angeles";
  try {
    const org = await loadOrgData();
    profiles = org.profiles;
    timeOff  = org.timeOff;
    scheduleTz = (await getNotificationSettings()).orgTimezone;
  } catch {
    profiles = []; timeOff = [];
  }

  const canEdit = currentUser.role === "admin" || currentUser.role === "manager";

  return <ScheduleView profiles={profiles} timeOff={timeOff} canEdit={canEdit} scheduleTz={scheduleTz} />;
}
