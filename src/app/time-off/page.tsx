import { TimeOffForm } from "@/components/TimeOffForm";
import { getCurrentUserProfile, loadOrgData } from "@/lib/data";
import { getSession } from "@/lib/session";

export default async function TimeOffPage() {
  const [data, currentUser, session] = await Promise.all([loadOrgData(), getCurrentUserProfile(), getSession()]);
  return <TimeOffForm data={data} currentUserId={currentUser?.id} userRole={session.role ?? "employee"} />;
}
