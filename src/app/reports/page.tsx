import { redirect } from "next/navigation";
import { WeeklyReports } from "@/components/WeeklyReports";
import { getCurrentUserProfile, loadOrgData } from "@/lib/data";
import { getNotificationSettings } from "@/lib/db-store";

export default async function ReportsPage() {
  const currentUser = await getCurrentUserProfile();
  if (!currentUser || currentUser.role === "employee") redirect("/");
  const data = await loadOrgData();
  // Punch times are rendered in the org's schedule zone, not the viewer's device
  // zone — an exported timesheet must not change depending on who exported it.
  let scheduleTz = "America/Los_Angeles";
  try { scheduleTz = (await getNotificationSettings()).orgTimezone; } catch { /* default */ }
  return <WeeklyReports data={data} scheduleTz={scheduleTz} />;
}
