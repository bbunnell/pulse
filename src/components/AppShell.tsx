import Link from "next/link";
import { getCurrentUserProfile } from "@/lib/data";
import { TopNav } from "@/components/TopNav";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const currentUser = await getCurrentUserProfile();

  if (!currentUser) {
    return <>{children}</>;
  }

  const navUser = {
    id: currentUser.id,
    firstName: currentUser.firstName,
    lastName: currentUser.lastName,
    role: currentUser.role,
  };

  return (
    <div className="app-frame">
      <header className="topnav">
        <Link className="brand" href="/">
          <img src="/mark-dark-bg.png" alt="Team Pulse" className="brand-logo" />
          <strong>Team Pulse</strong>
        </Link>
        <div className="topnav-divider" />
        <TopNav role={currentUser.role} currentUser={navUser} />
      </header>
      <main className="main-panel">{children}</main>
    </div>
  );
}
