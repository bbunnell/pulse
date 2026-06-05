import { TimeOffForm } from "@/components/TimeOffForm";
import { getCurrentUserProfile, loadOrgData } from "@/lib/data";

export default async function TimeOffPage() {
  const [data, currentUser] = await Promise.all([loadOrgData(), getCurrentUserProfile()]);
  return <TimeOffForm data={data} currentUserId={currentUser?.id} />;
}
