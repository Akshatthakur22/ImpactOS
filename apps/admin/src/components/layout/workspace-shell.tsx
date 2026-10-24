"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";
import { NotificationPopover } from "@/components/layout/notification-popover";
import { useAuth } from "@/hooks/use-auth";
import type { Permission } from "@sportdesk/contracts";

type SubDestination = {
  href: string;
  label: string;
  section: string;
  icon: IconName;
  permissions?: Permission[];
};

type Destination = {
  href: string;
  label: string;
  icon: IconName;
  permissions?: Permission[];
  ownerOnly?: boolean;
  section?: string;
  matches: string[];
  subItems?: SubDestination[];
};

type NavigationGroup = {
  group: string;
  items: Destination[];
};

const navigationGroups: NavigationGroup[] = [
  {
    group: "Core",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: "dashboard",
        permissions: ["admin:dashboard:read"],
        matches: ["/dashboard"],
      },
      {
        href: "/operations?section=calendar",
        label: "Operations",
        icon: "calendar",
        permissions: ["schedules:read"],
        matches: ["/operations", "/schedule"],
        subItems: [
          {
            href: "/operations?section=calendar",
            label: "Calendar",
            section: "calendar",
            icon: "calendar",
            permissions: ["schedules:read"],
          },
          {
            href: "/operations?section=classes",
            label: "Classes & Batches",
            section: "classes",
            icon: "academy",
            permissions: ["academy:manage", "schedules:read"],
          },
          {
            href: "/operations?section=coaches",
            label: "Coaches",
            section: "coaches",
            icon: "whistle",
            permissions: ["coaches:read"],
          },
          {
            href: "/operations?section=facilities",
            label: "Facilities",
            section: "facilities",
            icon: "academy",
            permissions: ["settings:manage"],
          },
          {
            href: "/operations?section=attendance",
            label: "Attendance",
            section: "attendance",
            icon: "check-circle",
            permissions: ["attendance:read"],
          },
          {
            href: "/operations?section=rules",
            label: "Schedule Rules",
            section: "rules",
            icon: "settings",
            permissions: ["schedules:write"],
          },
          {
            href: "/operations?section=holidays",
            label: "Holidays",
            section: "holidays",
            icon: "calendar",
            permissions: ["settings:manage"],
          },
        ],
      },
    ],
  },
  {
    group: "Directory",
    items: [
      {
        href: "/students",
        label: "Students",
        icon: "people",
        permissions: ["students:read"],
        matches: ["/students", "/admissions"],
      },
      {
        href: "/coaches",
        label: "Coaches",
        icon: "whistle",
        permissions: ["coaches:read"],
        matches: ["/coaches"],
      },
    ],
  },
  {
    group: "Management",
    items: [
      {
        href: "/finance?section=fees",
        label: "Finance",
        icon: "wallet",
        permissions: ["payments:read"],
        matches: ["/finance", "/fees", "/expenses"],
      },
      {
        href: "/notices",
        label: "Communication",
        icon: "megaphone",
        permissions: ["announcements:manage"],
        matches: ["/notices", "/notifications"],
      },
      {
        href: "/analytics?section=reports",
        label: "Reports",
        icon: "chart",
        permissions: ["reports:read"],
        matches: ["/analytics", "/reports", "/performance"],
      },
      {
        href: "/settings",
        label: "Settings",
        icon: "settings",
        permissions: ["settings:manage"],
        matches: ["/settings", "/staff"],
      },
    ],
  },
];

function canSeeDestination(
  role: string | undefined,
  permissions: Permission[] | undefined,
  item: { permissions?: Permission[]; ownerOnly?: boolean },
) {
  if (role === "owner") return true;
  if (item.ownerOnly || !item.permissions) return false;
  return item.permissions.some((permission) => permissions?.includes(permission));
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`flex min-w-0 items-center ${compact ? "justify-center" : "gap-2.5"}`}>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#007AFF] to-[#0066D6] text-white shadow-sm shadow-[#007AFF]/25">
        <svg
          className="h-4.5 w-4.5 text-white"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      </span>
      {!compact && (
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-bold tracking-tight text-[#1D1D1F]">
            SportDesk
          </span>
          <span className="block truncate text-[10px] font-medium text-[#8E8E93]">
            Academy Management
          </span>
        </span>
      )}
    </span>
  );
}

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, sessionRestoreError, refreshSession, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [currentSection, setCurrentSection] = useState<string | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [operationsExpanded, setOperationsExpanded] = useState(true);
  const mobileMenuButton = useRef<HTMLButtonElement>(null);
  const mobileDrawer = useRef<HTMLElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  const visibleGroups = useMemo(
    () =>
      navigationGroups
        .map((group) => ({
          ...group,
          items: group.items
            .filter((item) => canSeeDestination(user?.role, user?.permissions, item))
            .map((item) => ({
              ...item,
              subItems: item.subItems?.filter((sub) =>
                canSeeDestination(user?.role, user?.permissions, sub),
              ),
            })),
        }))
        .filter((group) => group.items.length > 0),
    [user?.permissions, user?.role],
  );

  const allVisibleItems = useMemo(
    () => visibleGroups.flatMap((group) => group.items),
    [visibleGroups],
  );

  const activeDestination =
    allVisibleItems.find((item) =>
      item.matches.some((m) => pathname === m || pathname.startsWith(m + "/")),
    ) ??
    allVisibleItems.find((item) => item.href.split("?")[0] === pathname) ??
    allVisibleItems[0];

  const pageLabel = useMemo(() => {
    if (pathname === "/operations") {
      const sec = currentSection || "calendar";
      if (sec === "calendar" || sec === "schedule") return "Calendar";
      if (sec === "classes" || sec === "programs" || sec === "batches") return "Classes & Batches";
      if (sec === "coaches") return "Coaches";
      if (sec === "facilities" || sec === "branches") return "Facilities";
      if (sec === "attendance") return "Attendance";
      if (sec === "rules") return "Schedule Rules";
      if (sec === "holidays") return "Holidays";
      return "Operations";
    }
    return activeDestination?.label ?? "Workspace";
  }, [pathname, currentSection, activeDestination]);

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

  // Handle outside click & ESC key to close account dropdown
  useEffect(() => {
    if (!accountMenuOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    setAccountMenuOpen(false);
  }, [pathname, currentSection]);
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
      className={`flex h-full flex-col border-r border-[#E5E5EA] bg-[#F9F9FB] text-[#1D1D1F] transition-all duration-200 ${
        isMobile
          ? "w-[min(86vw,290px)] px-3.5 py-4 shadow-xl"
          : collapsed
            ? "sticky top-0 h-screen w-[70px] items-center px-2.5 py-4"
            : "sticky top-0 h-screen w-[235px] px-3.5 py-4"
      }`}
    >
      {/* Brand Header */}
      <div
        className={`flex h-11 items-center ${
          collapsed && !isMobile ? "justify-center" : "justify-between px-1"
        }`}
      >
        <Link href="/dashboard" aria-label="SportDesk dashboard">
          <Brand compact={collapsed && !isMobile} />
        </Link>
        {isMobile ? (
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
            className="grid h-8 w-8 place-items-center rounded-lg text-[#8E8E93] hover:bg-[#E5E5EA]/70 hover:text-[#1D1D1F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]"
          >
            <Icon name="close" size={16} />
          </button>
        ) : (
          <button
            type="button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={toggleSidebar}
            className="grid h-7 w-7 place-items-center rounded-lg text-[#8E8E93] hover:bg-[#E5E5EA]/70 hover:text-[#1D1D1F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]"
          >
            <Icon name={collapsed ? "chevron-right" : "chevron-left"} size={14} />
          </button>
        )}
      </div>

      {/* Main Navigation List */}
      <nav
        aria-label="Main navigation"
        className="sd-sidebar-nav mt-4 min-h-0 w-full flex-1 space-y-4 overflow-y-auto pr-0.5"
      >
        {visibleGroups.map((group) => (
          <div key={group.group} className="w-full">
            {(!collapsed || isMobile) && (
              <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#8E8E93]">
                {group.group}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isItemActive =
                  item.matches.some((m) => pathname === m || pathname.startsWith(m + "/")) ||
                  item.href.split("?")[0] === pathname;

                const isOperations = item.label === "Operations";
                const showSubItems = isOperations && operationsExpanded && (!collapsed || isMobile);

                return (
                  <div key={item.label} className="w-full">
                    <div
                      className={`group flex min-h-[36px] items-center rounded-xl text-[13px] font-medium transition-all ${
                        collapsed && !isMobile ? "w-10 justify-center px-0" : "px-2.5"
                      } ${
                        isItemActive
                          ? "bg-[#007AFF] text-white font-semibold shadow-sm shadow-[#007AFF]/25"
                          : "text-[#48484A] hover:bg-[#E5E5EA]/60 hover:text-[#1D1D1F]"
                      }`}
                    >
                      <Link
                        href={item.href}
                        onClick={() => {
                          if (isOperations) {
                            if (isItemActive) {
                              setOperationsExpanded((prev) => !prev);
                            } else {
                              setOperationsExpanded(true);
                              setCurrentSection("calendar");
                              window.dispatchEvent(
                                new CustomEvent("sportdesk:section-change", {
                                  detail: "calendar",
                                }),
                              );
                            }
                          }
                        }}
                        title={collapsed && !isMobile ? item.label : undefined}
                        aria-label={item.label}
                        aria-current={isItemActive ? "page" : undefined}
                        className="flex flex-1 min-w-0 items-center gap-2.5 py-2 focus-visible:outline-none"
                      >
                        <Icon
                          name={item.icon}
                          size={17}
                          strokeWidth={isItemActive ? 2.2 : 1.7}
                          className={isItemActive ? "text-white" : "text-[#8E8E93] group-hover:text-[#1D1D1F]"}
                        />
                        {(!collapsed || isMobile) && (
                          <span className="flex-1 truncate">{item.label}</span>
                        )}
                      </Link>

                      {isOperations && (!collapsed || isMobile) && (
                        <button
                          type="button"
                          aria-label={operationsExpanded ? "Collapse Operations menu" : "Expand Operations menu"}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setOperationsExpanded((prev) => !prev);
                          }}
                          className={`grid h-6 w-6 place-items-center rounded-lg transition-transform focus-visible:outline-none ${
                            isItemActive
                              ? "text-white/80 hover:bg-white/20"
                              : "text-[#8E8E93] hover:bg-black/5 hover:text-[#1D1D1F]"
                          }`}
                        >
                          <Icon
                            name="chevron-down"
                            size={12}
                            className={`transition-transform duration-200 ${operationsExpanded ? "" : "-rotate-90"}`}
                          />
                        </button>
                      )}
                    </div>

                    {/* Sub-navigation for Operations */}
                    {showSubItems && item.subItems && (
                      <div className="mt-1 ml-3.5 space-y-0.5 border-l border-[#E5E5EA] pl-2.5 py-1">
                        {item.subItems.map((sub) => {
                          const isSubActive =
                            isItemActive && (currentSection || "calendar") === sub.section;

                          return (
                            <Link
                              key={sub.section}
                              href={sub.href}
                              onClick={() => {
                                setCurrentSection(sub.section);
                                window.dispatchEvent(
                                  new CustomEvent("sportdesk:section-change", {
                                    detail: sub.section,
                                  }),
                                );
                              }}
                              aria-current={isSubActive ? "page" : undefined}
                              className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                                isSubActive
                                  ? "bg-[#007AFF]/10 text-[#007AFF] font-bold"
                                  : "text-[#6E6E73] hover:bg-[#E5E5EA]/50 hover:text-[#1D1D1F]"
                              }`}
                            >
                              <Icon
                                name={sub.icon}
                                size={14}
                                className={isSubActive ? "text-[#007AFF]" : "text-[#8E8E93]"}
                              />
                              <span className="truncate">{sub.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Academy & User Bottom Profile Card */}
      {(!collapsed || isMobile) ? (
        <div className="mt-3 rounded-2xl border border-[#E5E5EA] bg-white p-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#007AFF] text-xs font-bold text-white shadow-xs">
              {user.academyName.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-[#1D1D1F]">{user.academyName}</p>
              <p className="truncate text-[11px] capitalize text-[#8E8E93]">
                {user.role} workspace
              </p>
            </div>
            <button
              type="button"
              title="Sign out"
              onClick={() => void logout().then(() => router.replace("/login"))}
              className="grid h-7 w-7 place-items-center rounded-lg text-[#8E8E93] hover:bg-[#FF3B30]/10 hover:text-[#FF3B30]"
            >
              <Icon name="arrow-right" size={14} />
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-col items-center gap-2">
          <span
            title={user.academyName}
            className="grid h-8 w-8 place-items-center rounded-full bg-[#007AFF] text-xs font-bold text-white shadow-xs"
          >
            {user.academyName.slice(0, 1).toUpperCase()}
          </span>
        </div>
      )}
    </aside>
  );

  return (
    <div
      className="min-h-screen bg-white text-[#1D1D1F] lg:flex lg:h-screen lg:overflow-hidden"
    >
      <div className="hidden shrink-0 lg:block lg:h-screen lg:overflow-y-auto">{sidebar()}</div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="presentation">
          <button
            type="button"
            aria-label="Close navigation overlay"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 cursor-default bg-black/40 backdrop-blur-[3px]"
          />
          <div className="absolute inset-y-0 left-0">{sidebar(true)}</div>
        </div>
      )}
      <div
        className="flex min-w-0 flex-1 flex-col bg-white lg:h-full lg:min-h-0 lg:overflow-hidden"
      >
        <header className="sticky top-0 z-30 shrink-0 border-b border-[#E5E5EA] bg-white px-4 backdrop-blur-md sm:px-7">
          <div className="flex min-h-[58px] items-center justify-between gap-3">
            {/* Left: Mobile trigger & Page Context */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                ref={mobileMenuButton}
                type="button"
                aria-label="Open navigation"
                aria-expanded={mobileOpen}
                aria-controls="mobile-navigation"
                onClick={() => setMobileOpen(true)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-[#6E6E73] hover:bg-[#F5F5F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF] lg:hidden"
              >
                <Icon name="menu" />
              </button>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h1 id="workspace-header-title" className="truncate text-[16px] font-bold tracking-tight text-[#1D1D1F] sm:text-[17px]">
                    {pathname === "/dashboard" ? `Welcome back, ${user.displayName.split(" ")[0]}` : pageLabel}
                  </h1>
                  <span id="workspace-header-subtitle" className="hidden truncate text-xs text-[#8E8E93] md:inline-block">
                    • {new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date())}
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Merged Page Actions, Notifications & Profile */}
            <div className="flex items-center gap-2.5 sm:gap-3">
              {/* Target for portaled page action buttons */}
              <div id="workspace-header-actions" className="flex items-center gap-2" />

              {/* Dynamic Notification & Notice Popover */}
              <NotificationPopover />

              {/* Account Dropdown */}
              <div ref={accountMenuRef} className="relative">
                <button
                  type="button"
                  aria-label="Account menu"
                  aria-expanded={accountMenuOpen}
                  aria-haspopup="menu"
                  onClick={() => setAccountMenuOpen((prev) => !prev)}
                  className="flex cursor-pointer items-center gap-1 rounded-xl p-0.5 hover:bg-[#F5F5F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF] transition-colors"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-[#007AFF] text-xs font-bold text-white shadow-xs">
                    {user.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <Icon
                    name="chevron-down"
                    size={13}
                    className={`hidden text-[#8E8E93] transition-transform duration-200 sm:block ${
                      accountMenuOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {accountMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full z-50 mt-2 w-56 rounded-2xl border border-[#E5E5EA] bg-white p-2 shadow-[0_16px_42px_rgba(0,0,0,0.08)] animate-in fade-in zoom-in-95 duration-100"
                  >
                    <div className="border-b border-[#E5E5EA] px-3 py-2">
                      <p className="truncate text-xs font-semibold text-[#1D1D1F]">{user.displayName}</p>
                      <p className="mt-0.5 truncate text-[11px] text-[#8E8E93]">{user.email}</p>
                      <p className="mt-0.5 truncate text-[10px] font-medium capitalize text-[#007AFF]">
                        {user.role} workspace
                      </p>
                    </div>
                    {user.role === "owner" || user.permissions?.includes("settings:manage") ? (
                      <Link
                        href="/settings"
                        onClick={() => setAccountMenuOpen(false)}
                        className="mt-1 block rounded-xl px-3 py-2 text-xs font-medium text-[#1D1D1F] hover:bg-[#F5F5F7] transition-colors"
                      >
                        Academy settings
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        void logout().then(() => router.replace("/login"));
                      }}
                      className="w-full rounded-xl px-3 py-2 text-left text-xs font-medium text-[#FF3B30] hover:bg-[#FFF1F0] transition-colors"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Core Main Area */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-white">
          {children}
        </main>

        {/* Apple-Style Micro Status Bar / Footer */}
        <footer className="sticky bottom-0 z-20 shrink-0 border-t border-[#E5E5EA] bg-[#F9F9FB] px-4 text-[11px] text-[#8E8E93] sm:px-6">
          <div className="flex h-7 items-center justify-between gap-3">
            {/* Left: System Status & Timezone */}
            <div className="flex items-center gap-2.5">
              <span className="flex items-center gap-1.5 font-medium text-[#1D1D1F]">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#34C759] opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#34C759]" />
                </span>
                <span>Operational</span>
              </span>
              <span className="text-[#C7C7CC]">•</span>
              <span className="hidden sm:inline">SportDesk OS v1.0</span>
              <span className="hidden text-[#C7C7CC] sm:inline">•</span>
              <span className="hidden md:inline">Asia/Kolkata (IST · UTC+05:30)</span>
            </div>

            {/* Right: Quick Links & Academy Context */}
            <div className="flex items-center gap-3 font-medium">
              <span className="truncate text-[#6E6E73]">{user.academyName}</span>
              <span className="text-[#C7C7CC]">•</span>
              <Link
                href="/settings"
                className="hover:text-[#007AFF] transition-colors"
              >
                Settings
              </Link>
              <span className="text-[#C7C7CC]">•</span>
              <span className="rounded bg-[#E5E5EA] px-1.5 py-0.5 text-[10px] font-semibold text-[#6E6E73]">
                PRO
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
