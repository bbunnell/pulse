import { redirect } from "next/navigation";
import { WeeklyReports } from "@/components/WeeklyReports";
import { getCurrentUserProfile, loadOrgData } from "@/lib/data";

export default async function ReportsPage() {
  const currentUser = await getCurrentUserProfile();
  if (!currentUser || currentUser.role === "employee") redirect("/");
  const data = await loadOrgData();
  return <WeeklyReports data={data} />;
}
