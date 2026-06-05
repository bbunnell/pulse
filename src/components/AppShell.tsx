import Link from "next/link";
import { getCurrentUserProfile } from "@/lib/data";
import { SidebarNav } from "@/components/SidebarNav";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const currentUser = await getCurrentUserProfile();

  if (!currentUser) {
    return <>{children}</>;
  }

  const sidebarUser = {
    id: currentUser.id,
    firstName: currentUser.firstName,
    lastName: currentUser.lastName,
    role: currentUser.role,
  };

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <img src="/logo.png" alt="NBIT logo" className="brand-logo" width={36} height={36} />
          <span>
            <strong>TimeBoard</strong>
            <small>Attendance</small>
          </span>
        </Link>
        <SidebarNav role={currentUser.role} currentUser={sidebarUser} />
      </aside>
      <main className="main-panel">{children}</main>
    </div>
  );
}
