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
          <img src="/mark-dark-bg.png" alt="Team Pulse" className="brand-logo" style={{ width: 40, height: 40, objectFit: "contain", flexShrink: 0 }} />
          <strong style={{ fontSize: 14, fontWeight: 700, color: "#fff", letterSpacing: "0.01em" }}>Team Pulse</strong>
        </Link>
        <SidebarNav role={currentUser.role} currentUser={sidebarUser} />
      </aside>
      <main className="main-panel">{children}</main>
    </div>
  );
}
