import { MyTimeView } from "@/components/MyTimeView";
import { getCurrentUserProfile, loadOrgData } from "@/lib/data";

export default async function MyTimePage() {
  const [data, currentUser] = await Promise.all([loadOrgData(), getCurrentUserProfile()]);
  return <MyTimeView data={data} currentUserId={currentUser?.id} />;
}
