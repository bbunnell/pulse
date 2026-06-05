import { redirect } from "next/navigation";
import { getCurrentUserProfile, loadOrgData } from "@/lib/data";
import { ProfilePage } from "@/components/ProfilePage";

export default async function ProfileRoute() {
  const [currentUser, data] = await Promise.all([getCurrentUserProfile(), loadOrgData()]);
  if (!currentUser) redirect("/login");

  const team = data.teams.find((t) => t.id === currentUser.teamId);

  return <ProfilePage user={currentUser} teamName={team?.name ?? null} />;
}
