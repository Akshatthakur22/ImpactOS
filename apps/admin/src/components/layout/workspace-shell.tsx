"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";
import { useAuth } from "@/hooks/use-auth";
import type { Permission } from "@sportdesk/contracts";

type Destination = {
  href: string;
  label: string;
  icon: IconName;
  permissions?: Permission[];
  ownerOnly?: boolean;
  section?: string;
  matches: string[];
};
type NavGroup = { label: string; items: Destination[] };

const groups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: "dashboard",
        permissions: ["admin:dashboard:read"],
        matches: ["/dashboard"],
      },
    ],
  },
  {
    label: "People",
    items: [
      {
        href: "/admissions",
        label: "Admissions",
        icon: "inbox",
        permissions: ["admissions:manage"],
        matches: ["/admissions"],
      },
      {
        href: "/students",
        label: "Students",
        icon: "people",
        permissions: ["students:read"],
        matches: ["/students"],
      },
      {
        href: "/coaches",
        label: "Coaches",
        icon: "whistle",
        permissions: ["coaches:read"],
        matches: ["/coaches"],
      },
      {
        href: "/staff",
        label: "Staff access",
        icon: "shield",
        ownerOnly: true,
        matches: ["/staff"],
      },
    ],
  },
  {
    label: "Academy",
    items: [
      {
        href: "/operations?section=programs",
        label: "Programs & batches",
        icon: "academy",
        section: "programs",
        permissions: ["academy:manage", "students:read", "schedules:read"],
        matches: ["/programs", "/batches"],
      },
      {
        href: "/operations?section=schedule",
        label: "Schedule",
        icon: "calendar",
        section: "schedule",
        permissions: ["schedules:read"],
        matches: ["/schedule"],
      },
      {
        href: "/operations?section=attendance",
        label: "Attendance",
        icon: "check-circle",
        section: "attendance",
        permissions: ["attendance:read"],
        matches: ["/attendance"],
      },
      {
        href: "/operations?section=branches",
        label: "Branches",
        icon: "academy",
        section: "branches",
        permissions: ["settings:manage"],
        matches: [],
      },
    ],
  },
  {
    label: "Finance",
    items: [
      {
        href: "/finance?section=fees",
        label: "Fees & receipts",
        icon: "wallet",
        section: "fees",
        permissions: ["payments:read"],
        matches: ["/fees"],
      },
      {
        href: "/finance?section=expenses",
        label: "Expenses",
        icon: "wallet",
        section: "expenses",
        permissions: ["expenses:manage"],
        matches: ["/expenses"],
      },
    ],
  },
  {
    label: "Insights",
    items: [
      {
        href: "/analytics?section=performance",
        label: "Performance",
        icon: "chart",
        section: "performance",
        permissions: ["reports:read"],
        matches: ["/performance"],
      },
      {
        href: "/analytics?section=reports",
        label: "Reports",
        icon: "chart",
        section: "reports",
        permissions: ["reports:read"],
        matches: ["/reports"],
      },
    ],
  },
  {
    label: "Communication",
    items: [
      {
        href: "/notices",
        label: "Notices",
        icon: "megaphone",
        permissions: ["announcements:manage"],
        matches: ["/notices", "/notifications"],
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        href: "/settings",
        label: "Academy settings",
        icon: "settings",
        permissions: ["settings:manage"],
        matches: ["/settings"],
      },
    ],
  },
];

function canSeeDestination(
  role: string | undefined,
  permissions: Permission[] | undefined,
  item: Destination,
) {
  if (role === "owner") return true;
  if (item.ownerOnly || !item.permissions) return false;
  return item.permissions.some((permission) => permissions?.includes(permission));
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`flex min-w-0 items-center ${compact ? "justify-center" : "gap-3"}`}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-[#123e3a] text-[11px] font-bold tracking-wide text-white shadow-sm">
        SD
      </span>
      {!compact && (
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-semibold tracking-[-0.02em] text-[#1b292d]">
            SportDesk
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-[#89938f]">
            Academy workspace
          </span>
        </span>
      )}
    </span>
  );
}

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const compactStudentsPage = pathname === "/students";
  const { user, loading, sessionRestoreError, refreshSession, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [currentSection, setCurrentSection] = useState<string | null>(null);
  const mobileMenuButton = useRef<HTMLButtonElement>(null);
  const mobileDrawer = useRef<HTMLElement>(null);
  const visibleGroups = useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) =>
            canSeeDestination(user?.role, user?.permissions, item),
          ),
        }))
        .filter((group) => group.items.length),
    [user?.permissions, user?.role],
  );
  const destinations = visibleGroups.flatMap((group) => group.items);
  const activeDestination =
    destinations.find((item) => item.matches.includes(pathname)) ??
    destinations.find(
      (item) =>
        item.href.split("?")[0] === pathname && (!item.section || item.section === currentSection),
    ) ??
    destinations.find((item) => item.href.split("?")[0] === pathname);
  const pageLabel =
    activeDestination?.section === "programs"
      ? "Programs & batches"
      : activeDestination?.section === "schedule"
        ? "Schedule"
        : activeDestination?.section === "attendance"
          ? "Attendance"
          : activeDestination?.section === "branches"
            ? "Branches"
            : activeDestination?.section === "fees"
              ? "Fees & receipts"
              : activeDestination?.section === "expenses"
                ? "Expenses"
                : activeDestination?.section === "performance"
                  ? "Performance"
                  : activeDestination?.section === "reports"
                    ? "Reports"
                    : (activeDestination?.label ?? "Workspace");

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem("sportdesk-admin-sidebar-collapsed") === "true");
    } catch {
      /* Storage can be unavailable in private browsing. */
    }
  }, []);
  useEffect(() => {
    if (!loading && !user && !sessionRestoreError) router.replace("/login");
  }, [loading, user, sessionRestoreError, router]);
  useEffect(() => {
    const syncSection = (event?: Event) =>
      setCurrentSection(
        event instanceof CustomEvent && typeof event.detail === "string"
          ? event.detail
          : new URLSearchParams(window.location.search).get("section"),
      );
    syncSection();
    window.addEventListener("popstate", syncSection);
    window.addEventListener("sportdesk:section-change", syncSection);
    return () => {
      window.removeEventListener("popstate", syncSection);
      window.removeEventListener("sportdesk:section-change", syncSection);
    };
  }, [pathname]);
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, currentSection]);
  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      mobileDrawer.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
    requestAnimationFrame(() => focusable()?.[0]?.focus());
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items?.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      requestAnimationFrame(() => mobileMenuButton.current?.focus());
    };
  }, [mobileOpen]);

  function toggleSidebar() {
    setCollapsed((value) => {
      const next = !value;
      try {
        window.localStorage.setItem("sportdesk-admin-sidebar-collapsed", String(next));
      } catch {
        /* Keep the control usable without storage. */
      }
      return next;
    });
  }

  if (loading || !user) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f6f7f5] px-6 text-sm text-[#65716d]">
        {sessionRestoreError && !user ? (
          <div className="w-full max-w-md rounded-3xl border border-[#e5e9e6] bg-white p-8 text-center shadow-[0_12px_36px_rgba(31,49,43,.06)]">
            <Brand compact />
            <h1 className="mt-5 text-xl font-semibold text-[#1b292d]">
              Could not restore your session
            </h1>
            <p className="mt-2 leading-6">{sessionRestoreError}</p>
            <Button
              className="mt-6 w-full"
              onClick={() => void refreshSession().catch(() => undefined)}
            >
              Try again
            </Button>
            <Button
              className="mt-3 w-full"
              variant="outline"
              onClick={() => router.replace("/login")}
            >
              Go to sign in
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#176e67]" />
            Loading your workspace…
          </div>
        )}
      </main>
    );
  }

  if (user.role !== "owner" && user.role !== "staff") {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f6f7f5] px-6">
        <div className="w-full max-w-md rounded-3xl border border-[#e5e9e6] bg-white p-8 text-center shadow-[0_12px_36px_rgba(31,49,43,.06)]">
          <Brand compact />
          <h1 className="mt-5 text-xl font-semibold text-[#1b292d]">Admin access is not enabled</h1>
          <p className="mt-2 text-sm leading-6 text-[#65716d]">
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

  const sidebar = (isMobile = false) => (
    <aside
      id={isMobile ? "mobile-navigation" : undefined}
      ref={isMobile ? mobileDrawer : undefined}
      role={isMobile ? "dialog" : undefined}
      aria-modal={isMobile ? true : undefined}
      aria-label={isMobile ? "Main navigation" : undefined}
      data-collapsed={collapsed && !isMobile}
      className={`flex h-full flex-col border-r border-[#e8ece9] bg-white ${isMobile ? "w-[min(86vw,300px)] px-4 py-5 shadow-2xl" : collapsed ? "sticky top-0 h-screen w-[76px] items-center px-3 py-5" : "sticky top-0 h-screen w-[248px] px-4 py-5"}`}
    >
      <div
        className={`flex h-12 items-center ${collapsed && !isMobile ? "justify-center" : "justify-between px-1"}`}
      >
        <Link href="/dashboard" aria-label="SportDesk dashboard">
          <Brand compact={collapsed && !isMobile} />
        </Link>
        {isMobile ? (
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
            className="grid h-9 w-9 place-items-center rounded-xl text-[#64716d] hover:bg-[#f4f6f4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176e67]"
          >
            <Icon name="close" />
          </button>
        ) : (
          <button
            type="button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={toggleSidebar}
            className="grid h-8 w-8 place-items-center rounded-lg text-[#77827e] hover:bg-[#f4f6f4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176e67]"
          >
            <Icon name={collapsed ? "chevron-right" : "chevron-left"} size={16} />
          </button>
        )}
      </div>
      <nav
        aria-label="Main navigation"
        className="sd-sidebar-nav mt-8 min-h-0 w-full flex-1 space-y-6 overflow-y-auto pb-4"
      >
        {visibleGroups.map((group) => (
          <section key={group.label} aria-label={group.label}>
            {(!collapsed || isMobile) && (
              <h2 className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#929c98]">
                {group.label}
              </h2>
            )}
            <div className="space-y-1">
              {group.items.map((item) => {
                const active = item.section
                  ? item.href.split("?")[0] === pathname &&
                    item.section ===
                      (currentSection ??
                        (pathname === "/operations"
                          ? "programs"
                          : pathname === "/analytics"
                            ? "performance"
                            : pathname === "/finance"
                              ? "fees"
                              : null))
                  : item.matches.includes(pathname);
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent("sportdesk:section-change", {
                          detail: item.section ?? null,
                        }),
                      )
                    }
                    title={collapsed && !isMobile ? item.label : undefined}
                    aria-label={item.label}
                    aria-current={active ? "page" : undefined}
                    className={`group flex min-h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176e67] ${collapsed && !isMobile ? "w-11 justify-center px-0" : ""} ${active ? "bg-[#eaf3ef] text-[#176e67]" : "text-[#56645f] hover:bg-[#f5f7f5] hover:text-[#24332e]"}`}
                  >
                    <Icon name={item.icon} size={18} strokeWidth={active ? 2 : 1.7} />
                    {(!collapsed || isMobile) && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </nav>
      {(!collapsed || isMobile) && (
        <div className="rounded-2xl bg-[#f5f7f5] p-3.5">
          <p className="truncate text-xs font-semibold text-[#283630]">{user.academyName}</p>
          <p className="mt-1 text-[11px] leading-4 text-[#77827e]">Your academy workspace</p>
        </div>
      )}
    </aside>
  );

  return (
    <div
      className={`${compactStudentsPage ? "students-fixed-shell" : "min-h-screen"} bg-[#f6f7f5] text-[#1b292d] lg:flex`}
    >
      <div className="hidden shrink-0 lg:block">{sidebar()}</div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="presentation">
          <button
            type="button"
            aria-label="Close navigation overlay"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 cursor-default bg-[#15211d]/35 backdrop-blur-[2px]"
          />
          <div className="absolute inset-y-0 left-0">{sidebar(true)}</div>
        </div>
      )}
      <div
        className={`${compactStudentsPage ? "h-full min-h-0" : "min-h-screen"} flex min-w-0 flex-1 flex-col`}
      >
        <header className="sticky top-0 z-30 shrink-0 border-b border-[#e8ece9] bg-white/95 px-4 backdrop-blur-md sm:px-7">
          <div className="flex min-h-[68px] items-center gap-3">
            <button
              ref={mobileMenuButton}
              type="button"
              aria-label="Open navigation"
              aria-expanded={mobileOpen}
              aria-controls="mobile-navigation"
              onClick={() => setMobileOpen(true)}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[#56645f] hover:bg-[#f4f6f4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176e67] lg:hidden"
            >
              <Icon name="menu" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="hidden items-center gap-2 text-[11px] text-[#8a9591] sm:flex">
                <span>{user.academyName}</span>
                <span aria-hidden="true">/</span>
                <span className="text-[#54625d]">
                  {user.role === "owner" ? "Owner workspace" : "Staff workspace"}
                </span>
              </div>
              <div className="truncate text-[15px] font-semibold tracking-[-0.015em] sm:mt-0.5">
                {pageLabel}
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="hidden text-right sm:block">
                <span className="block max-w-40 truncate text-xs font-semibold">
                  {user.displayName}
                </span>
                <span className="mt-0.5 block text-[11px] capitalize text-[#8a9591]">
                  {user.role}
                </span>
              </span>
              <details className="relative">
                <summary
                  aria-label="Account menu"
                  className="flex cursor-pointer list-none items-center gap-2 rounded-xl p-1.5 hover:bg-[#f4f6f4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176e67]"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-[#e1eee9] text-sm font-semibold text-[#176e67]">
                    {user.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <Icon name="chevron-down" size={14} className="hidden text-[#78837f] sm:block" />
                </summary>
                <div className="absolute right-0 top-full z-40 mt-2 w-56 rounded-2xl border border-[#e5e9e6] bg-white p-2 shadow-[0_16px_42px_rgba(24,39,32,.14)]">
                  <div className="border-b border-[#edf0ed] px-3 py-2">
                    <p className="truncate text-xs font-semibold">{user.displayName}</p>
                    <p className="mt-1 truncate text-[11px] text-[#7d8883]">{user.email}</p>
                  </div>
                  {user.role === "owner" || user.permissions?.includes("settings:manage") ? (
                    <Link
                      href="/settings"
                      className="mt-1 block rounded-xl px-3 py-2.5 text-sm text-[#4d5a55] hover:bg-[#f4f6f4]"
                    >
                      Academy settings
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void logout().then(() => router.replace("/login"))}
                    className="w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[#a04438] hover:bg-[#fff4f1]"
                  >
                    Sign out
                  </button>
                </div>
              </details>
            </div>
          </div>
        </header>
        <main
          className={`${compactStudentsPage ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" : "min-w-0 flex-1"}`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
