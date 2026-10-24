"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type {
  AcademyCatalog,
  AdminOverview,
  AdminOverviewSession,
  FinanceSummary,
  Permission,
} from "@sportdesk/contracts";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { Icon, type IconName } from "@/components/ui/icon";
import { StatusBadge } from "@/components/ui/status-badge";
import { ApiRequestError, getAdminOverview } from "@/lib/auth-api";
import { getAcademyCatalog } from "@/lib/academy-api";
import { getFinanceSummary } from "@/lib/finance-api";
import { useAuth } from "@/hooks/use-auth";

const shortcuts: Array<{
  href: string;
  label: string;
  description: string;
  icon: IconName;
  iconColor: string;
  iconBg: string;
  permission: Permission;
}> = [
  {
    href: "/students",
    label: "Register Student",
    description: "New enrollment & guardian",
    icon: "people",
    iconColor: "text-[#007AFF]",
    iconBg: "bg-[#007AFF]/10",
    permission: "students:write",
  },
  {
    href: "/operations?section=calendar",
    label: "Create Session",
    description: "Schedule batch training",
    icon: "calendar",
    iconColor: "text-[#FF9500]",
    iconBg: "bg-[#FF9500]/10",
    permission: "schedules:write",
  },
  {
    href: "/operations?section=attendance",
    label: "Take Attendance",
    description: "Verify check-in marks",
    icon: "check-circle",
    iconColor: "text-[#34C759]",
    iconBg: "bg-[#34C759]/10",
    permission: "attendance:read",
  },
  {
    href: "/finance",
    label: "Issue Invoice",
    description: "Record fee or payment",
    icon: "wallet",
    iconColor: "text-[#5856D6]",
    iconBg: "bg-[#5856D6]/10",
    permission: "payments:read",
  },
];

const attendanceLabels = [
  { key: "present", label: "Present", color: "bg-[#34C759]", text: "text-[#15803D]", bg: "bg-[#F0FDF4]", border: "border-[#BBF7D0]" },
  { key: "late", label: "Late", color: "bg-[#FF9500]", text: "text-[#A16207]", bg: "bg-[#FEFCE8]", border: "border-[#FEF08A]" },
  { key: "absent", label: "Absent", color: "bg-[#FF3B30]", text: "text-[#B91C1C]", bg: "bg-[#FEF2F2]", border: "border-[#FECACA]" },
  { key: "excused", label: "Excused", color: "bg-[#5856D6]", text: "text-[#581C87]", bg: "bg-[#F5F0FF]", border: "border-[#E9D5FF]" },
] as const;

const sessionStatusLabels: Record<AdminOverviewSession["status"], string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
};

function formatTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

function formatDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(new Date(value));
}

function formatCurrency(amountPaise: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountPaise / 100);
}

function getSportColor(sport: string = "") {
  const s = sport.toLowerCase();
  if (s.includes("cricket")) return "bg-[#EAF7EE] text-[#15803D] border-[#BBF7D0]";
  if (s.includes("football")) return "bg-[#EDF5FF] text-[#1D4ED8] border-[#BFDBFE]";
  if (s.includes("yoga") || s.includes("fitness")) return "bg-[#F5F0FF] text-[#7E22CE] border-[#E9D5FF]";
  if (s.includes("swim")) return "bg-[#ECFEFF] text-[#0E7490] border-[#A5F3FC]";
  if (s.includes("gymnastic")) return "bg-[#FFF7ED] text-[#C2410C] border-[#FED7AA]";
  return "bg-[#F5F5F7] text-[#6E6E73] border-[#E5E5EA]";
}

function KpiTile({
  label,
  value,
  subvalue,
  badgeText,
  badgeVariant = "default",
  detail,
  icon,
  iconBg,
  iconColor,
  href,
}: {
  label: string;
  value: string | number;
  subvalue?: string;
  badgeText?: string;
  badgeVariant?: "blue" | "green" | "amber" | "purple" | "default";
  detail: string;
  icon: IconName;
  iconBg: string;
  iconColor: string;
  href?: string | undefined;
}) {
  const badgeClasses = {
    blue: "bg-[#EDF5FF] text-[#007AFF] border-[#007AFF]/25",
    green: "bg-[#EAF7EE] text-[#15803D] border-[#15803D]/25",
    amber: "bg-[#FFF8E6] text-[#B45309] border-[#B45309]/25",
    purple: "bg-[#F5F0FF] text-[#7E22CE] border-[#7E22CE]/25",
    default: "bg-[#F5F5F7] text-[#6E6E73] border-[#E5E5EA]",
  };

  const content = (
    <div className="flex flex-col justify-between h-full">
      {/* Top: Icon & Contextual Pill */}
      <div className="flex items-center justify-between gap-2">
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${iconBg} ${iconColor} transition-transform duration-150 group-hover:scale-105`}
        >
          <Icon name={icon} size={18} strokeWidth={2} />
        </span>
        {badgeText && (
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold tracking-wide ${badgeClasses[badgeVariant]}`}
          >
            {badgeText}
          </span>
        )}
      </div>

      {/* Middle: Number & Label */}
      <div className="mt-3.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#8E8E93]">{label}</p>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-[28px] font-bold leading-none tracking-tight tabular-nums text-[#1D1D1F]">
            {value}
          </span>
          {subvalue && (
            <span className="text-xs font-semibold text-[#8E8E93]">{subvalue}</span>
          )}
        </div>
      </div>

      {/* Bottom: Context link */}
      <div className="mt-3 flex items-center justify-between border-t border-[#F5F5F7] pt-2 text-[11px] text-[#6E6E73]">
        <span className="truncate">{detail}</span>
        {href && (
          <span className="shrink-0 font-semibold text-[#007AFF] transition-transform duration-150 group-hover:translate-x-1">
            →
          </span>
        )}
      </div>
    </div>
  );

  const className = `group block rounded-2xl border border-[#E5E5EA] bg-white p-4 shadow-xs transition-all duration-150 ${
    href ? "hover:border-[#007AFF]/40 hover:shadow-sm" : ""
  }`;

  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <article className={className}>{content}</article>
  );
}

function SessionCard({
  session,
  timezone,
  canReadAttendance,
}: {
  session: AdminOverviewSession;
  timezone: string;
  canReadAttendance: boolean;
}) {
  const markedPercentage =
    session.attendance.expected > 0
      ? Math.round((session.attendance.marked / session.attendance.expected) * 100)
      : 0;
  const sportBadge = getSportColor(session.programName);

  return (
    <div className="group flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-[#F9F9FB]/80">
      <div className="flex items-center gap-3.5 min-w-0">
        {/* Time Badge */}
        <div className="flex flex-col items-center justify-center rounded-xl border border-[#E5E5EA] bg-[#F9F9FB] px-2.5 py-1.5 text-center shrink-0 w-20">
          <span className="text-xs font-bold tabular-nums text-[#1D1D1F]">
            {formatTime(session.startsAt, timezone)}
          </span>
          <span className="text-[10px] text-[#8E8E93]">
            to {formatTime(session.endsAt, timezone)}
          </span>
        </div>

        {/* Info */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="truncate text-sm font-bold text-[#1D1D1F]">{session.batchName}</span>
            <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${sportBadge}`}>
              {session.programName}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 text-xs text-[#8E8E93]">
            <span className="flex items-center gap-1 text-[#6E6E73]">
              <Icon name="whistle" size={13} className="text-[#8E8E93]" />
              <span className="truncate">{session.coachNames.length > 0 ? session.coachNames.join(", ") : "Coach Unassigned"}</span>
            </span>
            {session.venue && (
              <span className="flex items-center gap-1 text-[#6E6E73]">
                <span>•</span>
                <span>📍 {session.venue}</span>
              </span>
            )}
            {session.status !== "cancelled" && session.attendance.expected > 0 && (
              <span className="font-semibold text-[#007AFF]">
                • {session.attendance.marked}/{session.attendance.expected} marked ({markedPercentage}%)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Status & Action */}
      <div className="flex items-center gap-2.5 shrink-0">
        <StatusBadge status={session.status} label={sessionStatusLabels[session.status]} />
        {canReadAttendance && session.status !== "cancelled" && (
          <Link
            href="/operations?section=attendance"
            className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-[#007AFF] px-3 text-xs font-semibold text-white shadow-xs transition-all hover:bg-[#0066D6] active:scale-[0.98]"
          >
            <span>Check In</span>
            <Icon name="arrow-right" size={12} />
          </Link>
        )}
      </div>
    </div>
  );
}

function OverviewContent() {
  const { user, accessToken, refreshSession } = useAuth();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [catalog, setCatalog] = useState<AcademyCatalog | null>(null);
  const [financeSummary, setFinanceSummary] = useState<FinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSideTab, setActiveSideTab] = useState<"actions" | "activity">("actions");

  const can = (permission: Permission) => user?.role === "owner" || user?.permissions?.includes(permission) === true;

  const loadOverview = useCallback(
    async (showRefreshState = false) => {
      if (!accessToken || (user?.role !== "owner" && !user?.permissions?.includes("admin:dashboard:read"))) return;
      if (showRefreshState) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        let result: AdminOverview;
        try {
          result = await getAdminOverview(accessToken);
        } catch (caught) {
          if (!(caught instanceof ApiRequestError) || caught.status !== 401) throw caught;
          const renewedToken = await refreshSession();
          if (!renewedToken) throw caught;
          result = await getAdminOverview(renewedToken);
        }
        setOverview(result);

        // Fetch catalog for batches and programs
        try {
          const cat = await getAcademyCatalog(accessToken, refreshSession);
          setCatalog(cat);
        } catch {
          // ignore catalog failure
        }

        // Fetch finance summary if user has payments:read
        if (user?.role === "owner" || user?.permissions?.includes("payments:read")) {
          try {
            const now = new Date();
            const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
            const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0] ?? from;
            const fin = await getFinanceSummary(accessToken, refreshSession, { from, to });
            setFinanceSummary(fin);
          } catch {
            // ignore finance failure
          }
        }
      } catch (caught: unknown) {
        setError(caught instanceof Error ? caught.message : "Could not load the academy overview.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken, refreshSession, user?.permissions, user?.role],
  );

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  if (user && user.role !== "owner" && !user.permissions?.includes("admin:dashboard:read")) {
    return (
      <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-7">
        <h1 className="text-xl font-bold tracking-tight text-[#1D1D1F]">Academy Overview</h1>
        <p role="alert" className="mt-4 max-w-xl rounded-xl border border-[#E5E5EA] bg-white p-5 text-xs text-[#8E8E93] shadow-xs">
          Your staff account does not have permission to view dashboard operational data. Ask an academy owner to update your access.
        </p>
      </div>
    );
  }

  if (loading && !overview) {
    return (
      <div className="mx-auto flex max-w-[1500px] items-center justify-center py-28 text-xs font-medium text-[#8E8E93]">
        <Icon name="refresh" size={16} className="mr-2 animate-spin text-[#007AFF]" />
        <span>Loading academy data…</span>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-7">
        <h1 className="text-xl font-bold tracking-tight text-[#1D1D1F]">Academy Overview</h1>
        <div role="alert" className="mt-4 max-w-lg rounded-2xl border border-[#FF3B30]/20 bg-[#FFF1F0] p-5 text-xs text-[#FF3B30] shadow-xs">
          <p className="font-semibold">Could not load live academy data</p>
          <p className="mt-1 text-[#FF3B30]/80">{error ?? "Check connection and try again."}</p>
          <Button className="mt-3" variant="outline" onClick={() => void loadOverview(true)}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const { metrics } = overview;
  const accessibleShortcuts = shortcuts.filter(
    (shortcut) => can(shortcut.permission) || (shortcut.href === "/finance" && can("expenses:manage")),
  );
  const attendance = metrics.attendanceToday;
  const attendanceWidth =
    attendance.expected > 0 ? Math.min(100, (attendance.marked / attendance.expected) * 100) : 0;
  const attendanceRate = Math.round(attendanceWidth);

  // Active Batches for secondary dashboard section
  const activeBatches = (catalog?.batches || []).filter((b) => b.isActive).slice(0, 5);

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-3 sm:px-6">
      {/* Top Bar Portaled Header Actions */}
      <PageHeader
        title={`Welcome back, ${user?.displayName.split(" ")[0] ?? "Admin"}`}
        description={`${formatDate(new Date().toISOString(), overview.timezone)} · Daily operations`}
        actions={
          <>
            <button
              type="button"
              onClick={() => void loadOverview(true)}
              disabled={refreshing}
              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-[#E5E5EA] bg-white px-3 text-xs font-semibold text-[#1D1D1F] shadow-xs transition-all hover:bg-[#F5F5F7] active:scale-[0.98] disabled:opacity-50"
            >
              <Icon
                name="refresh"
                size={13}
                className={`text-[#6E6E73] ${refreshing ? "animate-spin" : ""}`}
              />
              <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
            </button>

            {can("students:write") && (
              <Link
                href="/students"
                className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-[#007AFF] px-3.5 text-xs font-semibold text-white shadow-xs transition-all hover:bg-[#0066D6] active:scale-[0.98]"
              >
                <Icon name="plus" size={13} />
                <span>Register Student</span>
              </Link>
            )}
          </>
        }
      />

      {error && (
        <div
          role="alert"
          className="mb-3 rounded-xl border border-[#FF3B30]/20 bg-[#FFF1F0] px-3 py-2 text-xs font-medium text-[#FF3B30]"
        >
          {error} Showing last loaded data.
        </div>
      )}

      {/* TOP 4 HIGH-IMPACT EXECUTIVE KPI TILES */}
      <section
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Academy key performance indicators"
      >
        {/* KPI 1: Enrolled Students & Pipeline */}
        <KpiTile
          label="Enrolled Students"
          value={metrics.activeStudents}
          badgeText={metrics.pendingStudents > 0 ? `+${metrics.pendingStudents} Pending` : "Roster Active"}
          badgeVariant={metrics.pendingStudents > 0 ? "amber" : "blue"}
          detail={`${metrics.activeBatches} active training batches`}
          icon="people"
          iconBg="bg-[#007AFF]/10"
          iconColor="text-[#007AFF]"
          href={can("students:read") ? "/students" : undefined}
        />

        {/* KPI 2: Today's Attendance Health */}
        <KpiTile
          label="Today's Attendance"
          value={`${attendanceRate}%`}
          badgeText={attendance.expected > 0 ? `${attendance.marked}/${attendance.expected} Marked` : "Live Pulse"}
          badgeVariant={attendanceRate >= 80 ? "green" : attendanceRate > 0 ? "blue" : "amber"}
          detail={`${attendance.present} present · ${attendance.toRecord} pending`}
          icon="check-circle"
          iconBg="bg-[#34C759]/10"
          iconColor="text-[#34C759]"
          href={can("attendance:read") ? "/operations?section=attendance" : undefined}
        />

        {/* KPI 3: Monthly Collections or Active Coaches */}
        {financeSummary && can("payments:read") ? (
          <KpiTile
            label="Month Collections"
            value={formatCurrency(financeSummary.collectedPaise, financeSummary.currency)}
            badgeText={financeSummary.outstandingPaise > 0 ? `${formatCurrency(financeSummary.outstandingPaise, financeSummary.currency)} Due` : "Invoiced"}
            badgeVariant={financeSummary.outstandingPaise > 0 ? "amber" : "purple"}
            detail="View invoices & receipts ledger"
            icon="wallet"
            iconBg="bg-[#5856D6]/10"
            iconColor="text-[#5856D6]"
            href="/finance"
          />
        ) : (
          <KpiTile
            label="Active Coaches"
            value={metrics.activeCoaches}
            badgeText="Verified Staff"
            badgeVariant="purple"
            detail={`Across ${metrics.activePrograms} sports programs`}
            icon="whistle"
            iconBg="bg-[#5856D6]/10"
            iconColor="text-[#5856D6]"
            href={can("coaches:read") ? "/coaches" : undefined}
          />
        )}

        {/* KPI 4: Today's Training Sessions */}
        <KpiTile
          label="Training Sessions"
          value={metrics.sessionsToday}
          badgeText={
            metrics.completedSessionsToday > 0
              ? `${metrics.completedSessionsToday} Done · ${metrics.scheduledSessionsToday} Left`
              : `${metrics.scheduledSessionsToday} Scheduled`
          }
          badgeVariant={metrics.scheduledSessionsToday > 0 ? "amber" : "green"}
          detail={overview.todaySessions[0]?.batchName ? `Next: ${overview.todaySessions[0].batchName}` : "View operations calendar"}
          icon="calendar"
          iconBg="bg-[#FF9500]/10"
          iconColor="text-[#FF9500]"
          href={can("schedules:read") ? "/operations?section=calendar" : undefined}
        />
      </section>

      {/* MAIN TWO-COLUMN WORKSPACE: Balanced layout without empty void */}
      <section className="mt-3.5 grid items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(330px,1fr)]">
        {/* LEFT COLUMN: Today's Sessions + Active Batches Capacity */}
        <div className="space-y-3.5">
          {/* Card: Today's Sessions */}
          <article className="overflow-hidden rounded-2xl border border-[#E5E5EA] bg-white shadow-xs">
            <div className="flex items-center justify-between border-b border-[#E5E5EA] px-4 py-3 bg-[#F9F9FB]/60">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-bold text-[#1D1D1F]">Today’s Training Sessions</h2>
                <span className="rounded-full bg-white border border-[#E5E5EA] px-2 py-0.5 text-[10px] font-bold text-[#6E6E73]">
                  {overview.todaySessions.length}
                </span>
              </div>
              {can("schedules:read") && (
                <Link
                  href="/operations?section=calendar"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#007AFF] hover:underline"
                >
                  <span>Full calendar</span>
                  <Icon name="arrow-right" size={12} />
                </Link>
              )}
            </div>

            <div className="divide-y divide-[#E5E5EA]">
              {overview.todaySessions.length === 0 ? (
                <div className="p-8 text-center">
                  <span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-[#F5F5F7] text-[#8E8E93]">
                    <Icon name="calendar" size={20} />
                  </span>
                  <p className="mt-2 text-xs font-semibold text-[#1D1D1F]">No sessions scheduled today</p>
                  <p className="mt-0.5 text-[11px] text-[#8E8E93]">
                    All scheduled batch training sessions will appear here.
                  </p>
                  {can("schedules:write") && (
                    <Link
                      href="/operations?section=calendar"
                      className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#007AFF] px-3 py-1 text-xs font-semibold text-white shadow-xs"
                    >
                      <Icon name="plus" size={12} />
                      <span>Create Session</span>
                    </Link>
                  )}
                </div>
              ) : (
                overview.todaySessions.map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    timezone={overview.timezone}
                    canReadAttendance={can("attendance:read")}
                  />
                ))
              )}
            </div>
          </article>

          {/* Card: Active Batches & Capacity (Eliminates the empty void) */}
          <article className="overflow-hidden rounded-2xl border border-[#E5E5EA] bg-white shadow-xs">
            <div className="flex items-center justify-between border-b border-[#E5E5EA] px-4 py-3 bg-[#F9F9FB]/60">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-bold text-[#1D1D1F]">Active Batches & Enrollment Capacity</h2>
                <span className="rounded-full bg-white border border-[#E5E5EA] px-2 py-0.5 text-[10px] font-bold text-[#6E6E73]">
                  {metrics.activeBatches}
                </span>
              </div>
              <Link
                href="/operations?section=classes"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#007AFF] hover:underline"
              >
                <span>Manage batches</span>
                <Icon name="arrow-right" size={12} />
              </Link>
            </div>

            <div className="p-3">
              {activeBatches.length === 0 ? (
                <div className="p-4 text-center text-xs text-[#8E8E93]">
                  No active batches configured yet.
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {activeBatches.map((b) => {
                    const capacity = b.capacity || 20;
                    const fillPct = Math.min(100, Math.round((b.activeEnrollmentCount / capacity) * 100));
                    const sportColor = getSportColor(b.disciplineName || b.programName);

                    return (
                      <div
                        key={b.id}
                        className="rounded-xl border border-[#E5E5EA] p-3 transition-colors hover:border-[#007AFF]/30 hover:bg-[#F9F9FB]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="truncate text-xs font-bold text-[#1D1D1F]">{b.name}</h3>
                            <p className="truncate text-[10px] text-[#8E8E93]">{b.programName}</p>
                          </div>
                          <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${sportColor}`}>
                            {b.disciplineName || "Class"}
                          </span>
                        </div>

                        <div className="mt-2.5">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-[#6E6E73]">Enrolled</span>
                            <span className="font-bold tabular-nums text-[#1D1D1F]">
                              {b.activeEnrollmentCount} / {capacity} ({fillPct}%)
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#F5F5F7]">
                            <div
                              className="h-full rounded-full bg-[#007AFF]"
                              style={{ width: `${fillPct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </article>
        </div>

        {/* RIGHT COLUMN: Operational Pulse, Action Alerts & Dynamic Hub */}
        <div className="space-y-3.5">
          {/* Card 1: Attendance Health & Pending Admissions */}
          <article className="rounded-2xl border border-[#E5E5EA] bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xs font-bold text-[#1D1D1F]">Today’s Attendance Pulse</h2>
                <p className="text-[10px] text-[#8E8E93]">Check-in completion rate</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-[#007AFF]">
                  {attendanceRate}%
                </span>
                {can("attendance:read") && (
                  <Link
                    href="/operations?section=attendance"
                    className="text-[11px] font-semibold text-[#007AFF] hover:underline"
                  >
                    Review →
                  </Link>
                )}
              </div>
            </div>

            {/* Attendance Track */}
            <div
              className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-[#F5F5F7]"
              role="progressbar"
              aria-label="Attendance records marked"
              aria-valuemin={0}
              aria-valuemax={attendance.expected}
              aria-valuenow={attendance.marked}
            >
              <div
                className="h-full rounded-full bg-[#007AFF] transition-all duration-300"
                style={{ width: `${attendanceWidth}%` }}
              />
            </div>

            {/* 4 iOS Status Pills */}
            <div className="mt-3 grid grid-cols-2 gap-1.5">
              {attendanceLabels.map((item) => (
                <div
                  key={item.key}
                  className={`flex items-center justify-between rounded-xl border ${item.border} ${item.bg} px-3 py-1.5 text-[11px]`}
                >
                  <span className={`flex items-center gap-1.5 font-medium ${item.text}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${item.color}`} />
                    <span>{item.label}</span>
                  </span>
                  <span className={`font-bold tabular-nums ${item.text}`}>
                    {attendance[item.key]}
                  </span>
                </div>
              ))}
            </div>

            {/* Action Alert 1: Attendance marks pending check-in */}
            {attendance.toRecord > 0 && (
              <Link
                href="/operations?section=attendance"
                className="mt-2.5 flex items-center justify-between gap-1.5 rounded-xl border border-[#FF9500]/25 bg-[#FFF8E6] px-3 py-2 text-[11px] text-[#8F5B00] transition-colors hover:bg-[#FFF3D1]"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Icon name="megaphone" size={14} className="shrink-0 text-[#FF9500]" />
                  <span className="truncate">
                    <strong>{attendance.toRecord} mark{attendance.toRecord === 1 ? "" : "s"}</strong> due for sessions underway.
                  </span>
                </div>
                <span className="shrink-0 font-bold text-[#FF9500]">Check in →</span>
              </Link>
            )}

            {/* Action Alert 2: Pending Admissions approval */}
            {metrics.pendingStudents > 0 && (
              <Link
                href="/students"
                className="mt-2 flex items-center justify-between gap-1.5 rounded-xl border border-[#007AFF]/25 bg-[#EDF5FF] px-3 py-2 text-[11px] text-[#0066D6] transition-colors hover:bg-[#E1EFFF]"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Icon name="people" size={14} className="shrink-0 text-[#007AFF]" />
                  <span className="truncate">
                    <strong>{metrics.pendingStudents} student{metrics.pendingStudents === 1 ? "" : "s"}</strong> awaiting registration approval.
                  </span>
                </div>
                <span className="shrink-0 font-bold text-[#007AFF]">Review →</span>
              </Link>
            )}
          </article>

          {/* Card 2: Apple Segmented Widget (Quick Tools & Live Activity) */}
          <article className="overflow-hidden rounded-2xl border border-[#E5E5EA] bg-white shadow-xs">
            {/* Apple Segmented Switcher */}
            <div className="flex items-center justify-between border-b border-[#E5E5EA] bg-[#F9F9FB] p-1.5">
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setActiveSideTab("actions")}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                    activeSideTab === "actions"
                      ? "bg-white text-[#1D1D1F] shadow-xs"
                      : "text-[#6E6E73] hover:text-[#1D1D1F]"
                  }`}
                >
                  Quick Tools
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSideTab("activity")}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                    activeSideTab === "activity"
                      ? "bg-white text-[#1D1D1F] shadow-xs"
                      : "text-[#6E6E73] hover:text-[#1D1D1F]"
                  }`}
                >
                  Live Activity ({overview.recentAttendance.length})
                </button>
              </div>

              {activeSideTab === "activity" && can("attendance:read") && (
                <Link
                  href="/operations?section=attendance"
                  className="pr-2 text-[10px] font-semibold text-[#007AFF] hover:underline"
                >
                  All logs →
                </Link>
              )}
            </div>

            {/* Dynamic Content Switcher */}
            <div className="p-3">
              {activeSideTab === "actions" ? (
                <div className="grid grid-cols-2 gap-2">
                  {accessibleShortcuts.map((shortcut) => (
                    <Link
                      key={shortcut.href + shortcut.label}
                      href={shortcut.href}
                      className="group flex flex-col justify-between rounded-xl border border-[#E5E5EA] p-3 transition-all hover:border-[#007AFF]/40 hover:bg-[#F9F9FB] hover:shadow-xs active:scale-[0.98]"
                    >
                      <span className={`grid h-8 w-8 place-items-center rounded-xl ${shortcut.iconBg} ${shortcut.iconColor} transition-transform group-hover:scale-105`}>
                        <Icon name={shortcut.icon} size={15} strokeWidth={2} />
                      </span>
                      <div className="mt-2.5">
                        <span className="block truncate text-xs font-bold text-[#1D1D1F] group-hover:text-[#007AFF]">
                          {shortcut.label}
                        </span>
                        <span className="block truncate text-[10px] text-[#8E8E93]">
                          {shortcut.description}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="max-h-[220px] overflow-y-auto">
                  {overview.recentAttendance.length === 0 ? (
                    <div className="p-4 text-center text-xs text-[#8E8E93]">
                      No live attendance activity recorded yet today.
                    </div>
                  ) : (
                    <ul className="divide-y divide-[#E5E5EA]">
                      {overview.recentAttendance.map((record) => {
                        const badgeStyle =
                          record.status === "present"
                            ? "bg-[#34C759]/10 text-[#15803D]"
                            : record.status === "late"
                              ? "bg-[#FF9500]/10 text-[#A16207]"
                              : record.status === "absent"
                                ? "bg-[#FF3B30]/10 text-[#B91C1C]"
                                : "bg-[#5856D6]/10 text-[#581C87]";

                        return (
                          <li
                            key={record.id}
                            className="flex items-center justify-between gap-2 py-2 text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#007AFF] text-[10px] font-bold text-white shadow-xs">
                                {record.studentName.slice(0, 1).toUpperCase()}
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-xs font-semibold text-[#1D1D1F]">
                                  {record.studentName}
                                </p>
                                <p className="truncate text-[10px] text-[#8E8E93]">
                                  {record.batchName} · {record.recordedByName}
                                </p>
                              </div>
                            </div>

                            <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold capitalize shrink-0 ${badgeStyle}`}>
                              {record.status}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}

export default function DashboardPage() {
  return <OverviewContent />;
}
