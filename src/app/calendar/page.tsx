import { TeamCalendar } from "@/components/TeamCalendar";
import { getCurrentUserProfile, loadOrgData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const [data, currentUser] = await Promise.all([loadOrgData(), getCurrentUserProfile()]);
  const canManage = currentUser?.role === "admin" || currentUser?.role === "manager";
  return <TeamCalendar data={data} canManage={canManage} />;
}
