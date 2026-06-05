import { redirect } from "next/navigation";
import { getCurrentUserProfile, loadOrgData, loadScheduleWindow } from "@/lib/data";
import { getNotificationSettings, getStaffingRules } from "@/lib/db-store";
import { MonitorView } from "@/components/MonitorView";

export const dynamic = "force-dynamic";

export default async function MonitorPage() {
  const currentUser = await getCurrentUserProfile();
  if (!currentUser) redirect("/login");

  const [data, scheduledShifts] = await Promise.all([loadOrgData(), loadScheduleWindow()]);

  let orgTimezone = "America/Los_Angeles";
  let staffingRules: Awaited<ReturnType<typeof getStaffingRules>> = [];
  try {
    [orgTimezone, staffingRules] = await Promise.all([
      getNotificationSettings().then((s) => s.orgTimezone),
      getStaffingRules(),
    ]);
  } catch { /* defaults */ }

  return (
    <MonitorView
      data={data}
      scheduledShifts={scheduledShifts}
      staffingRules={staffingRules}
      orgTimezone={orgTimezone}
      currentUserId={currentUser.id}
    />
  );
}
