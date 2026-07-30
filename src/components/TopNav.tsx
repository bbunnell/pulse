"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { CalendarCheck, CalendarDays, CalendarRange, ClipboardList, LayoutDashboard, LogOut, Menu, Settings, ShieldCheck, UserRound, X } from "lucide-react";
import { useState } from "react";
import type { Role } from "@/lib/types";
import { UserAvatar } from "@/components/UserAvatar";
import { ThemeToggle } from "@/components/ThemeToggle";

const navItems = [
  { href: "/",            label: "Dashboard",   icon: LayoutDashboard, minRole: "employee" as Role },
  { href: "/my-time",     label: "My Time",      icon: UserRound,       minRole: "employee" as Role },
  { href: "/my-schedule", label: "My Schedule",  icon: CalendarCheck,   minRole: "employee" as Role },
  { href: "/schedule",    label: "After-Hours",  icon: CalendarRange,   minRole: "employee" as Role },
  { href: "/time-off",    label: "Time Off",     icon: ShieldCheck,     minRole: "employee" as Role },
  { href: "/calendar",    label: "Events",       icon: CalendarDays,    minRole: "employee" as Role },
  { href: "/reports",     label: "Reports",      icon: ClipboardList,   minRole: "manager"  as Role },
  { href: "/admin",       label: "Admin",        icon: Settings,        minRole: "admin"    as Role },
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
  const [open, setOpen] = useState(false);

  const visibleItems = navItems.filter((item) => canAccess(role, item.minRole));

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const activeLabel = visibleItems.find((item) =>
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
  )?.label ?? "Menu";

  return (
    <>
      {/* Desktop nav links */}
      <nav className="topnav-links" aria-label="Primary navigation">
        {visibleItems.map((item) => {
          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} className={`nav-link${isActive ? " active" : ""}`}>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Desktop user controls */}
      <div className="topnav-end">
        {currentUser ? (
          <>
            <Link href="/profile" className="sidebar-user-link" title="My profile">
              <UserAvatar userId={currentUser.id} firstName={currentUser.firstName} lastName={currentUser.lastName} className="sidebar-user-avatar" />
              <span className="sidebar-user-name">{currentUser.firstName}</span>
            </Link>
            <ThemeToggle />
            <button type="button" className="sidebar-action-btn" title="Sign out" onClick={handleSignOut} suppressHydrationWarning>
              <LogOut size={14} />
            </button>
          </>
        ) : null}
      </div>

      {/* Mobile: active page label + hamburger */}
      <div className="mobile-nav-controls">
        <span className="mobile-nav-label">{activeLabel}</span>
        <button
          type="button"
          className="mobile-menu-btn"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="mobile-nav-dropdown" onClick={() => setOpen(false)}>
          <nav>
            {visibleItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`mobile-nav-item${isActive ? " active" : ""}`}
                  onClick={() => setOpen(false)}
                >
                  <Icon size={18} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mobile-nav-footer">
            {currentUser && (
              <Link href="/profile" className="mobile-nav-user" onClick={() => setOpen(false)}>
                <UserAvatar userId={currentUser.id} firstName={currentUser.firstName} lastName={currentUser.lastName} />
                <span>{currentUser.firstName} {currentUser.lastName}</span>
              </Link>
            )}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <ThemeToggle />
              <button type="button" className="sidebar-action-btn" title="Sign out" onClick={handleSignOut} suppressHydrationWarning>
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
