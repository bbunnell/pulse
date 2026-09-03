import { MyTimeView } from "@/components/MyTimeView";
import { getCurrentUserProfile, loadOrgData } from "@/lib/data";
import { getNotificationSettings } from "@/lib/db-store";

export default async function MyTimePage() {
  const [data, currentUser] = await Promise.all([loadOrgData(), getCurrentUserProfile()]);
  let scheduleTz = "America/Los_Angeles";
  try { scheduleTz = (await getNotificationSettings()).orgTimezone; } catch { /* default */ }
  return <MyTimeView data={data} currentUserId={currentUser?.id} scheduleTz={scheduleTz} />;
}
