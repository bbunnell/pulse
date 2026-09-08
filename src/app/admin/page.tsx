import { redirect } from "next/navigation";
import { AdminSettings } from "@/components/AdminSettings";
import { getCurrentUserProfile, loadOrgData } from "@/lib/data";
import { getHolidays } from "@/lib/db-store";

export default async function AdminPage() {
  const currentUser = await getCurrentUserProfile();
  if (currentUser?.role !== "admin") redirect("/");
  const data = await loadOrgData();
  // Server-rendered rather than fetched on mount: no spinner, no client
  // round-trip, and mutations refresh through the router like the rest of admin.
  let holidays: Awaited<ReturnType<typeof getHolidays>> = [];
  try { holidays = await getHolidays(); } catch { /* table may predate migration */ }
  return <AdminSettings data={data} currentUserId={currentUser.id} holidays={holidays} />;
}
