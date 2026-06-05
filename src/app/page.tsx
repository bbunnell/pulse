import { TeamDashboard } from "@/components/TeamDashboard";
import { getCurrentUserProfile, loadOrgData, loadScheduleWindow } from "@/lib/data";
import { getNotificationSettings, getStaffingRules } from "@/lib/db-store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [data, currentUser, scheduledShifts] = await Promise.all([
    loadOrgData(),
    getCurrentUserProfile(),
    loadScheduleWindow(),
  ]);

  let orgTimezone = "America/Chicago";
  let staffingRules: Awaited<ReturnType<typeof getStaffingRules>> = [];
  try {
    [orgTimezone, staffingRules] = await Promise.all([
      getNotificationSettings().then((s) => s.orgTimezone),
      getStaffingRules(),
    ]);
  } catch { /* defaults */ }

  return (
    <TeamDashboard
      data={data}
      scheduledShifts={scheduledShifts}
      staffingRules={staffingRules}
      currentUserId={currentUser?.id}
      userRole={currentUser?.role ?? null}
      orgTimezone={orgTimezone}
    />
  );
}
