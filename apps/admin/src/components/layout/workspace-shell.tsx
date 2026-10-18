"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import type { Permission } from "@sportdesk/contracts";

const navigation: Array<{
  href: string;
  label: string;
  group: string;
  matches: string[];
  permission?: Permission;
  ownerOnly?: boolean;
}> = [
  {
    href: "/dashboard",
    label: "Dashboard",
    group: "Workspace",
    matches: ["/dashboard"],
    permission: "admin:dashboard:read",
  },
  {
    href: "/admissions",
    label: "Admissions",
    group: "People",
    matches: ["/admissions"],
    permission: "admissions:manage",
  },
  {
    href: "/students",
    label: "Students",
    group: "People",
    matches: ["/students"],
    permission: "students:read",
  },
  {
    href: "/coaches",
    label: "Coaches & classes",
    group: "People",
    matches: ["/coaches"],
    permission: "coaches:read",
  },
  {
    href: "/operations",
    label: "Academy operations",
    group: "Operations",
    matches: ["/operations"],
    permission: "schedules:read",
  },
  {
    href: "/finance",
    label: "Finance",
    group: "Finance & insight",
    matches: ["/finance", "/fees", "/expenses"],
    permission: "payments:read",
  },
  {
    href: "/analytics",
    label: "Analytics",
    group: "Finance & insight",
    matches: ["/analytics"],
    permission: "admin:dashboard:read",
  },
  {
    href: "/notices",
    label: "Notices",
    group: "Communication",
    matches: ["/notices"],
    permission: "announcements:manage",
  },
  {
    href: "/settings",
    label: "Settings",
    group: "Administration",
    matches: ["/settings"],
    permission: "settings:manage",
  },
  {
    href: "/staff",
    label: "Staff access",
    group: "Administration",
    matches: ["/staff"],
    ownerOnly: true,
  },
];

function isNavigationActive(pathname: string, matches: string[]) {
  return matches.some((match) => pathname === match || pathname.startsWith(`${match}/`));
}

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, sessionRestoreError, refreshSession, logout } = useAuth();
  const visibleNavigation = navigation.filter(
    (item) =>
      user?.role === "owner" ||
      (!item.ownerOnly && item.permission && user?.permissions?.includes(item.permission)),
  );
  const primaryMobileNavigation = visibleNavigation.slice(0, 5);
  const secondaryMobileNavigation = visibleNavigation.slice(5);

  useEffect(() => {
    if (!loading && !user && !sessionRestoreError) router.replace("/login");
  }, [loading, user, sessionRestoreError, router]);

  if (loading || !user) {
    return (
      <main className="grid min-h-screen place-items-center px-6 text-sm text-muted">
        {sessionRestoreError && !user ? (
          <div className="max-w-md rounded-2xl border border-line bg-white p-8 text-center shadow-sm">
            <p className="text-sm font-semibold text-accent">Impact Academy</p>
            <h1 className="mt-3 text-xl font-semibold">Could not restore your session</h1>
            <p className="mt-2 leading-6">{sessionRestoreError}</p>
            <Button className="mt-6" onClick={() => void refreshSession().catch(() => undefined)}>
              Try again
            </Button>
            <Button className="mt-3" variant="outline" onClick={() => router.replace("/login")}>
              Go to sign in
            </Button>
          </div>
        ) : (
          "Loading workspace…"
        )}
      </main>
    );
  }

  if (user.role !== "owner" && user.role !== "staff") {
    return (
      <main className="grid min-h-screen place-items-center px-6">
        <div className="max-w-md rounded-2xl border border-line bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-semibold text-accent">Impact Academy</p>
          <h1 className="mt-3 text-xl font-semibold">Admin access is not enabled</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            Your account does not have access to the admin workspace.
          </p>
          <Button
            className="mt-6"
            variant="outline"
            onClick={() => void logout().then(() => router.replace("/login"))}
          >
            Sign out
          </Button>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="hidden border-r border-line bg-white px-5 py-6 lg:flex lg:flex-col">
        <Link href="/dashboard" className="flex items-center gap-3 px-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#133c3b] text-xs font-black text-white">
            IA
          </span>
          <span>
            <span className="block text-sm font-bold tracking-tight">Impact Academy</span>
            <span className="block text-[11px] text-muted">AthletixOS · Admin</span>
          </span>
        </Link>
        <nav className="mt-10 space-y-6" aria-label="Main navigation">
          {[...new Set(visibleNavigation.map((item) => item.group))].map((group) => (
            <div key={group}>
              <div className="px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#98a3aa]">
                {group}
              </div>
              <div className="mt-2 space-y-1">
                {visibleNavigation
                  .filter((item) => item.group === group)
                  .map((item) => {
                    const active = isNavigationActive(pathname, item.matches);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={`block rounded-xl px-3 py-2.5 text-sm font-medium ${
                          active
                            ? "bg-accent-soft font-semibold text-accent"
                            : "text-muted hover:bg-[#f5f7f7]"
                        }`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
              </div>
            </div>
          ))}
        </nav>
        <div className="mt-auto rounded-2xl bg-[#f5f7f7] p-4">
          <p className="text-xs font-semibold">Built around your academy</p>
          <p className="mt-1.5 text-xs leading-5 text-muted">
            Academy records are managed through the authenticated operations service.
          </p>
        </div>
      </aside>

      <main className="min-w-0">
        <header className="border-b border-line bg-white px-5 sm:px-8">
          <div className="flex min-h-[72px] items-center justify-between">
            <div className="flex items-center gap-3 lg:hidden">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#133c3b] text-xs font-black text-white">
                IA
              </span>
              <span className="text-sm font-bold">Impact Academy</span>
            </div>
            <div className="hidden text-sm text-muted lg:block">
              {user.academyName} <span className="px-2 text-[#bdc6cb]">/</span>
              <span className="font-medium text-foreground">
                {user.role === "owner" ? "Owner workspace" : "Staff workspace"}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <div className="text-xs font-semibold">{user.displayName}</div>
                <div className="mt-0.5 text-[11px] capitalize text-muted">{user.role}</div>
              </div>
              <div className="grid h-9 w-9 place-items-center rounded-full bg-[#dcece8] text-xs font-bold text-accent">
                {user.displayName.slice(0, 1).toUpperCase()}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void logout().then(() => router.replace("/login"))}
              >
                Sign out
              </Button>
            </div>
          </div>
          <nav
            className="flex items-center gap-1 overflow-x-auto pb-2 lg:hidden"
            aria-label="Main navigation"
          >
            {primaryMobileNavigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-lg px-2.5 py-2 text-xs ${
                  isNavigationActive(pathname, item.matches)
                    ? "bg-accent-soft font-semibold text-accent"
                    : "text-muted"
                }`}
              >
                {item.label}
              </Link>
            ))}
            <details className="relative shrink-0">
              <summary
                className={`cursor-pointer list-none rounded-lg px-2.5 py-2 text-xs font-medium ${
                  secondaryMobileNavigation.some((item) =>
                    isNavigationActive(pathname, item.matches),
                  )
                    ? "bg-accent-soft text-accent"
                    : "text-muted hover:bg-[#f5f7f7]"
                }`}
              >
                More
              </summary>
              <div className="absolute right-0 top-full z-20 mt-1 min-w-44 rounded-xl border border-line bg-white p-1 shadow-lg">
                {secondaryMobileNavigation.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`block rounded-lg px-3 py-2.5 text-sm ${
                      isNavigationActive(pathname, item.matches)
                        ? "bg-accent-soft font-semibold text-accent"
                        : "text-muted hover:bg-[#f5f7f7]"
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </details>
          </nav>
        </header>
        {children}
      </main>
    </div>
  );
}
