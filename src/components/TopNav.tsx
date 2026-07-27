"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { CalendarCheck, CalendarDays, CalendarRange, ClipboardList, LayoutDashboard, LogOut, Settings, ShieldCheck, UserRound } from "lucide-react";
import type { Role } from "@/lib/types";
import { UserAvatar } from "@/components/UserAvatar";
import { ThemeToggle } from "@/components/ThemeToggle";

const navItems = [
  { href: "/",            label: "Dashboard",      icon: LayoutDashboard, minRole: "employee" as Role },
  { href: "/my-time",     label: "My Time",         icon: UserRound,       minRole: "employee" as Role },
  { href: "/my-schedule", label: "My Schedule",     icon: CalendarCheck,   minRole: "employee" as Role },
  { href: "/schedule",    label: "After-Hours",     icon: CalendarRange,   minRole: "employee" as Role },
  { href: "/time-off",    label: "Time Off",        icon: ShieldCheck,     minRole: "employee" as Role },
  { href: "/calendar",    label: "Events",          icon: CalendarDays,    minRole: "employee" as Role },
  { href: "/reports",     label: "Reports",         icon: ClipboardList,   minRole: "manager"  as Role },
  { href: "/admin",       label: "Admin",           icon: Settings,        minRole: "admin"    as Role },
];

const roleLevel: Record<Role, number> = { employee: 1, manager: 2, admin: 3 };

function canAccess(userRole: Role | null, minRole: Role): boolean {
  if (!userRole) return false;
  return roleLevel[userRole] >= roleLevel[minRole];
}

interface NavUser {
  id: string;
  firstName: string;
  lastName: string;
  role: Role;
}

interface Props {
  role: Role | null;
  currentUser: NavUser | null;
}

export function TopNav({ role, currentUser }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <nav className="topnav-links" aria-label="Primary navigation">
        {navItems
          .filter((item) => canAccess(role, item.minRole))
          .map((item) => {
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className={`nav-link${isActive ? " active" : ""}`}>
                {item.label}
              </Link>
            );
          })}
      </nav>

      <div className="topnav-end">
        {currentUser ? (
          <>
            <Link href="/profile" className="sidebar-user-link" title="My profile">
              <UserAvatar
                userId={currentUser.id}
                firstName={currentUser.firstName}
                lastName={currentUser.lastName}
                className="sidebar-user-avatar"
              />
              <span className="sidebar-user-name">
                {currentUser.firstName}
              </span>
            </Link>
            <ThemeToggle />
            <button type="button" className="sidebar-action-btn" title="Sign out" onClick={handleSignOut} suppressHydrationWarning>
              <LogOut size={14} />
            </button>
          </>
        ) : null}
      </div>
    </>
  );
}
