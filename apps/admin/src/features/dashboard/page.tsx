"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { AdminOverview, AdminOverviewSession, Permission } from "@sportdesk/contracts";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { Icon, type IconName } from "@/components/ui/icon";
import { StatusBadge } from "@/components/ui/status-badge";
import { ApiRequestError, getAdminOverview } from "@/lib/auth-api";
import { useAuth } from "@/hooks/use-auth";

const shortcuts: Array<{
  href: string;
  label: string;
  description: string;
  icon: IconName;
  permission: Permission;
}> = [
  {
    href: "/students",
    label: "Register a Student",
    description: "Add a student and guardian profile",
    icon: "people",
    permission: "students:write",
  },
  {
    href: "/operations?section=calendar",
    label: "Create a Session",
    description: "Schedule training for an active batch",
    icon: "calendar",
    permission: "schedules:write",
  },
  {
    href: "/operations?section=attendance",
    label: "Review Attendance",
    description: "Verify check-in marks and corrections",
    icon: "check-circle",
    permission: "attendance:read",
  },
  {
    href: "/coaches",
    label: "Manage Coaches",
    description: "Assign coach batches and qualifications",
    icon: "whistle",
    permission: "coaches:write",
  },
  {
    href: "/finance",
    label: "Academy Finance",
    description: "Track invoices, receipts, and fees",
    icon: "wallet",
    permission: "payments:read",
  },
];

const attendanceLabels = [
  { key: "present", label: "Present", color: "bg-[#34C759]", badgeClass: "bg-[#34C759]/10 text-[#34C759]" },
  { key: "late", label: "Late", color: "bg-[#FF9500]", badgeClass: "bg-[#FF9500]/10 text-[#FF9500]" },
  { key: "absent", label: "Absent", color: "bg-[#FF3B30]", badgeClass: "bg-[#FF3B30]/10 text-[#FF3B30]" },
  { key: "excused", label: "Excused", color: "bg-[#5856D6]", badgeClass: "bg-[#5856D6]/10 text-[#5856D6]" },
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
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(new Date(value));
}

function MetricCard({
  label,
  value,
  detail,
  icon,
  iconBg,
  iconColor,
  href,
}: {
  label: string;
  value: number;
  detail: string;
  icon: IconName;
  iconBg: string;
  iconColor: string;
  href?: string | undefined;
}) {
  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className={`grid h-8 w-8 place-items-center rounded-xl ${iconBg} ${iconColor}`}>
            <Icon name={icon} size={16} />
          </span>
          <h2 className="text-[13px] font-semibold text-[#6E6E73]">{label}</h2>
        </div>
        {href ? (
          <span className="text-[#8E8E93] transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-[#007AFF]" aria-hidden="true">
            <Icon name="arrow-right" size={14} />
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-[32px] font-bold leading-none tracking-tight tabular-nums text-[#1D1D1F]">
        {value.toLocaleString("en-IN")}
      </p>
      <p className="mt-2 text-[12px] leading-4 text-[#8E8E93]">{detail}</p>
    </>
  );

  const className = `group block rounded-2xl border border-[#E5E5EA] bg-white p-5 shadow-sm transition-all duration-200 ${
    href
      ? "hover:-translate-y-0.5 hover:border-[#007AFF]/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]"
      : ""
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

  return (
    <article className="group grid gap-3.5 border-b border-[#E5E5EA] p-5 transition-colors hover:bg-[#F5F5F7]/50 last:border-b-0 sm:grid-cols-[100px_minmax(0,1fr)_auto] sm:items-center">
      {/* Time gutter */}
      <div className="flex flex-col text-left">
        <span className="text-[14px] font-bold tracking-tight text-[#1D1D1F] tabular-nums">
          {formatTime(session.startsAt, timezone)}
        </span>
        <span className="text-[11px] font-medium text-[#8E8E93]">
          to {formatTime(session.endsAt, timezone)}
        </span>
      </div>

      {/* Main Details */}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-[14px] font-bold text-[#1D1D1F]">{session.batchName}</p>
          <span className="rounded-md bg-[#F5F5F7] px-2 py-0.5 text-[11px] font-medium text-[#6E6E73]">
            {session.programName}
          </span>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#8E8E93]">
          <span className="inline-flex items-center gap-1">
            <Icon name="whistle" size={13} className="text-[#8E8E93]" />
            <span className="text-[#6E6E73]">
              {session.coachNames.length > 0
                ? session.coachNames.join(", ")
                : "No coach assigned"}
            </span>
          </span>
          {session.venue && (
            <span className="inline-flex items-center gap-1">
              <span>•</span>
              <span className="text-[#6E6E73]">{session.venue}</span>
            </span>
          )}
        </div>

        {session.status !== "cancelled" && session.attendance.expected > 0 && (
          <div className="mt-2.5 flex items-center gap-2.5">
            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-[#E5E5EA]">
              <div
                className={`h-full rounded-full transition-all ${
                  markedPercentage === 100 ? "bg-[#34C759]" : "bg-[#007AFF]"
                }`}
                style={{ width: `${Math.min(100, markedPercentage)}%` }}
              />
            </div>
            <span className="text-[11px] font-medium text-[#8E8E93]">
              {session.attendance.marked} of {session.attendance.expected} checked in
            </span>
          </div>
        )}
      </div>

      {/* Actions and Status */}
      <div className="flex items-center gap-3 self-start sm:self-center">
        <StatusBadge status={session.status} label={sessionStatusLabels[session.status]} />
        {canReadAttendance && session.status !== "cancelled" && (
          <Link
            href="/operations?section=attendance"
            className="hidden text-xs font-semibold text-[#007AFF] hover:underline sm:inline-block"
          >
            Check in →
          </Link>
        )}
      </div>
    </article>
  );
}

function OverviewContent() {
  const { user, accessToken, refreshSession } = useAuth();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-7">
        <h1 className="text-2xl font-bold tracking-tight text-[#1D1D1F]">Academy Overview</h1>
        <p role="alert" className="mt-4 max-w-xl rounded-2xl border border-[#E5E5EA] bg-white p-5 text-sm text-[#8E8E93] shadow-sm">
          Your staff account does not have permission to view dashboard operational data. Ask an academy owner to update your access.
        </p>
      </div>
    );
  }

  if (loading && !overview) {
    return (
      <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-7">
        <div className="h-6 w-40 animate-pulse rounded-lg bg-[#E5E5EA]" />
        <div className="mt-2 h-9 w-72 animate-pulse rounded-lg bg-[#E5E5EA]" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-2xl border border-[#E5E5EA] bg-[#F5F5F7]" />
          ))}
        </div>
        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
          <div className="h-80 animate-pulse rounded-2xl border border-[#E5E5EA] bg-[#F5F5F7]" />
          <div className="h-80 animate-pulse rounded-2xl border border-[#E5E5EA] bg-[#F5F5F7]" />
        </div>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-7">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#007AFF]">{user?.academyName ?? "Academy"}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#1D1D1F]">Academy Overview</h1>
        <div role="alert" className="mt-6 max-w-lg rounded-2xl border border-[#FF3B30]/20 bg-[#FFF1F0] p-6 text-sm text-[#FF3B30] shadow-sm">
          <p className="font-semibold">Could not load live academy data</p>
          <p className="mt-1 text-xs text-[#FF3B30]/80">
            {error ?? "Check the API connection and try again."}
          </p>
          <Button className="mt-4" variant="outline" onClick={() => void loadOverview(true)}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const { metrics } = overview;
  const can = (permission: Permission) => user?.role === "owner" || user?.permissions?.includes(permission) === true;
  const accessibleShortcuts = shortcuts.filter(
    (shortcut) => can(shortcut.permission) || (shortcut.href === "/finance" && can("expenses:manage")),
  );
  const attendance = metrics.attendanceToday;
  const attendanceWidth =
    attendance.expected > 0 ? Math.min(100, (attendance.marked / attendance.expected) * 100) : 0;

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-7 sm:py-6">
      <PageHeader
        title={`Welcome back, ${user?.displayName.split(" ")[0] ?? "Admin"}`}
        description={`${formatDate(new Date().toISOString(), overview.timezone)} · Daily academy pulse`}
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
          className="mt-4 rounded-xl border border-[#FF3B30]/20 bg-[#FFF1F0] px-4 py-3 text-xs font-medium text-[#FF3B30]"
        >
          {error} Showing the last loaded data.
        </div>
      )}

      {/* Top 4 KPI Metric Cards */}
      <section
        className="mt-6 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Academy totals"
      >
        <MetricCard
          label="Active Students"
          value={metrics.activeStudents}
          detail="Enrolled in active batches"
          icon="people"
          iconBg="bg-[#007AFF]/10"
          iconColor="text-[#007AFF]"
          href={can("students:read") ? "/students" : undefined}
        />
        <MetricCard
          label="Active Coaches"
          value={metrics.activeCoaches}
          detail="Verified coach accounts"
          icon="whistle"
          iconBg="bg-[#5856D6]/10"
          iconColor="text-[#5856D6]"
          href={can("coaches:read") ? "/coaches" : undefined}
        />
        <MetricCard
          label="Active Batches"
          value={metrics.activeBatches}
          detail={`${metrics.activePrograms} active program${metrics.activePrograms === 1 ? "" : "s"}`}
          icon="academy"
          iconBg="bg-[#34C759]/10"
          iconColor="text-[#34C759]"
          href={can("academy:manage") || can("students:read") ? "/operations?section=classes" : undefined}
        />
        <MetricCard
          label="Today's Sessions"
          value={metrics.sessionsToday}
          detail={`${metrics.scheduledSessionsToday} scheduled · ${metrics.completedSessionsToday} completed`}
          icon="calendar"
          iconBg="bg-[#FF9500]/10"
          iconColor="text-[#FF9500]"
          href={can("schedules:read") ? "/operations?section=calendar" : undefined}
        />
      </section>

      {/* Operational Core: Timetable & Attendance Pulse */}
      <section className="mt-6 grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        {/* Left Column: Today's Sessions Timetable */}
        <article className="overflow-hidden rounded-2xl border border-[#E5E5EA] bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E5EA] px-5 py-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[15px] font-bold text-[#1D1D1F]">Today’s Training Sessions</h2>
                <span className="rounded-full bg-[#F5F5F7] px-2 py-0.5 text-[11px] font-semibold text-[#6E6E73]">
                  {overview.todaySessions.length}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-[#8E8E93]">Times displayed in {overview.timezone}</p>
            </div>
            {can("schedules:read") && (
              <Link
                href="/operations?section=calendar"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#007AFF] hover:underline"
              >
                <span>Full calendar</span>
                <Icon name="arrow-right" size={13} />
              </Link>
            )}
          </div>

          {overview.todaySessions.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#F5F5F7] text-[#8E8E93]">
                <Icon name="calendar" size={24} />
              </span>
              <p className="mt-3 text-sm font-semibold text-[#1D1D1F]">No sessions scheduled for today</p>
              <p className="mt-1 text-xs text-[#8E8E93]">
                All batch schedules and custom session additions will appear here.
              </p>
              {can("schedules:write") && (
                <Link
                  href="/operations?section=calendar"
                  className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#007AFF] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-[#0066D6]"
                >
                  <Icon name="plus" size={13} />
                  <span>Create Session</span>
                </Link>
              )}
            </div>
          ) : (
            <div>
              {overview.todaySessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  timezone={overview.timezone}
                  canReadAttendance={can("attendance:read")}
                />
              ))}
            </div>
          )}
        </article>

        {/* Right Column: Attendance & Student Pipeline */}
        <div className="space-y-5">
          {/* Today's Check-ins Card */}
          <article className="rounded-2xl border border-[#E5E5EA] bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-bold text-[#1D1D1F]">Today’s Attendance</h2>
                <p className="text-xs text-[#8E8E93]">Overall check-in completion rate</p>
              </div>
              {can("attendance:read") && (
                <Link
                  href="/operations?section=attendance"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#007AFF] hover:underline"
                >
                  <span>Review</span>
                  <Icon name="arrow-right" size={13} />
                </Link>
              )}
            </div>

            {/* Attendance Meter */}
            <div className="mt-5 flex items-baseline justify-between">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-extrabold tracking-tight tabular-nums text-[#1D1D1F]">
                  {attendance.marked}
                </span>
                <span className="text-sm font-medium text-[#8E8E93]">
                  / {attendance.expected > 0 ? attendance.expected : "0"} marked
                </span>
              </div>
              <span className="text-xs font-bold text-[#007AFF]">
                {Math.round(attendanceWidth)}%
              </span>
            </div>

            {/* Apple Progress Bar */}
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

            {/* iOS Status Breakdown Pills */}
            <div className="mt-4 grid grid-cols-2 gap-2">
              {attendanceLabels.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between rounded-xl border border-[#E5E5EA] bg-[#F5F5F7]/40 px-3 py-2 text-xs"
                >
                  <span className="flex items-center gap-2 text-[#6E6E73]">
                    <span className={`h-2 w-2 rounded-full ${item.color}`} />
                    <span>{item.label}</span>
                  </span>
                  <span className="font-bold tabular-nums text-[#1D1D1F]">
                    {attendance[item.key]}
                  </span>
                </div>
              ))}
            </div>

            {attendance.toRecord > 0 && (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#FF9500]/20 bg-[#FFF8E6] p-3 text-xs text-[#8F5B00]">
                <Icon name="megaphone" size={14} className="shrink-0 text-[#FF9500]" />
                <p>
                  <strong>{attendance.toRecord} mark{attendance.toRecord === 1 ? "" : "s"}</strong> due for sessions currently underway.
                </p>
              </div>
            )}
          </article>

          {/* Pending Admissions Card */}
          <article className="rounded-2xl border border-[#E5E5EA] bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-bold text-[#1D1D1F]">Pending Admissions</h2>
                <p className="text-xs text-[#8E8E93]">Registrations awaiting batch assignment</p>
              </div>
              {can("students:read") && (
                <Link
                  href="/students"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#007AFF] hover:underline"
                >
                  <span>View</span>
                  <Icon name="arrow-right" size={13} />
                </Link>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <span className="text-3xl font-extrabold tracking-tight tabular-nums text-[#1D1D1F]">
                {metrics.pendingStudents}
              </span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                metrics.pendingStudents > 0
                  ? "bg-[#FF9500]/10 text-[#FF9500]"
                  : "bg-[#34C759]/10 text-[#34C759]"
              }`}>
                {metrics.pendingStudents > 0 ? "Action required" : "All cleared"}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-[#8E8E93]">
              Review newly registered students and assign them to eligible batches and coaches.
            </p>
          </article>
        </div>
      </section>

      {/* Bottom Section: Quick Actions & Live Activity */}
      <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        {/* Quick Actions Card */}
        <article className="rounded-2xl border border-[#E5E5EA] bg-white p-5 shadow-sm">
          <h2 className="text-[15px] font-bold text-[#1D1D1F]">Quick Actions</h2>
          <p className="text-xs text-[#8E8E93]">Everyday administrative tasks</p>

          <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-1">
            {accessibleShortcuts.map((shortcut) => (
              <Link
                key={shortcut.href + shortcut.label}
                href={shortcut.href}
                className="group flex items-center justify-between rounded-xl border border-[#E5E5EA] p-3.5 transition-all hover:border-[#007AFF]/40 hover:bg-[#F5F5F7]/60 active:scale-[0.99]"
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#F5F5F7] text-[#6E6E73] transition-colors group-hover:bg-[#007AFF] group-hover:text-white">
                    <Icon name={shortcut.icon} size={15} />
                  </span>
                  <div>
                    <span className="block text-xs font-bold text-[#1D1D1F] group-hover:text-[#007AFF]">
                      {shortcut.label}
                    </span>
                    <span className="block text-[11px] text-[#8E8E93]">
                      {shortcut.description}
                    </span>
                  </div>
                </div>
                <span className="text-[#8E8E93] transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-[#007AFF]">
                  <Icon name="arrow-right" size={14} />
                </span>
              </Link>
            ))}
          </div>
        </article>

        {/* Recent Attendance Activity Feed */}
        <article className="overflow-hidden rounded-2xl border border-[#E5E5EA] bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-[#E5E5EA] px-5 py-4">
            <div>
              <h2 className="text-[15px] font-bold text-[#1D1D1F]">Recent Attendance Updates</h2>
              <p className="text-xs text-[#8E8E93]">Live stream of coach mark submissions</p>
            </div>
            {can("attendance:read") && (
              <Link
                href="/operations?section=attendance"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#007AFF] hover:underline"
              >
                <span>All records</span>
                <Icon name="arrow-right" size={13} />
              </Link>
            )}
          </div>

          {overview.recentAttendance.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-[#F5F5F7] text-[#8E8E93]">
                <Icon name="check-circle" size={20} />
              </span>
              <p className="mt-3 text-xs font-semibold text-[#1D1D1F]">No attendance activity yet today</p>
              <p className="mt-1 text-[11px] text-[#8E8E93]">
                Records marked by coaches in the field or web app will populate here instantly.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-[#E5E5EA]">
              {overview.recentAttendance.map((record) => {
                const badgeStyle =
                  record.status === "present"
                    ? "bg-[#34C759]/10 text-[#34C759]"
                    : record.status === "late"
                      ? "bg-[#FF9500]/10 text-[#FF9500]"
                      : record.status === "absent"
                        ? "bg-[#FF3B30]/10 text-[#FF3B30]"
                        : "bg-[#5856D6]/10 text-[#5856D6]";

                return (
                  <li
                    key={record.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-[#F5F5F7]/40"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#F5F5F7] text-xs font-bold text-[#1D1D1F]">
                        {record.studentName.slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-[#1D1D1F]">{record.studentName}</p>
                        <p className="truncate text-[11px] text-[#8E8E93]">
                          {record.batchName} • Recorded by {record.recordedByName}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <span className="text-[11px] text-[#8E8E93] tabular-nums">
                        {formatTime(record.recordedAt, overview.timezone)}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold capitalize ${badgeStyle}`}>
                        {record.status}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </article>
      </section>
    </div>
  );
}

export default function DashboardPage() {
  return <OverviewContent />;
}
