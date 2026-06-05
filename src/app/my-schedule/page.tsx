import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/data";
import { getNotificationSettings } from "@/lib/db-store";
import { MyScheduleView } from "@/components/MyScheduleView";

export const dynamic = "force-dynamic";

export default async function MySchedulePage() {
  const profile = await getCurrentUserProfile();
  if (!profile) redirect("/login");
  let scheduleTz = "America/Los_Angeles";
  try { scheduleTz = (await getNotificationSettings()).orgTimezone; } catch { /* default */ }
  return <MyScheduleView profile={profile} scheduleTz={scheduleTz} />;
}
