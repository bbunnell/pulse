import { redirect } from "next/navigation";
import { AdminSettings } from "@/components/AdminSettings";
import { getCurrentUserProfile, loadOrgData } from "@/lib/data";

export default async function AdminPage() {
  const currentUser = await getCurrentUserProfile();
  if (currentUser?.role !== "admin") redirect("/");
  const data = await loadOrgData();
  return <AdminSettings data={data} currentUserId={currentUser.id} />;
}
