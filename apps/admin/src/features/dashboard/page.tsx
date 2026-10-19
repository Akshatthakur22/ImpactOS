"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { AdminOverview, AdminOverviewSession } from "@sportdesk/contracts";
import type { Permission } from "@sportdesk/contracts";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { ApiRequestError, getAdminOverview } from "@/lib/auth-api";
import { useAuth } from "@/hooks/use-auth";

const shortcuts: Array<{ href: string; label: string; description: string; permission: Permission }> = [
  { href: "/students", label: "Register a student", description: "Add a student and guardian", permission: "students:write" },
  { href: "/coaches", label: "Manage coaches", description: "Create an account or assign a batch", permission: "coaches:write" },
  { href: "/operations?section=schedule", label: "Create a session", description: "Set up training for a batch", permission: "schedules:write" },
  { href: "/operations?section=attendance", label: "Review attendance", description: "Check records and corrections", permission: "attendance:read" },
  {
    href: "/finance",
    label: "Manage academy finance",
    description: "Invoices, receipts, and expenses",
    permission: "payments:read",
  },
];

const attendanceLabels = [
  { key: "present", label: "Present", color: "bg-[#176e67]" },
  { key: "late", label: "Late", color: "bg-[#d58a46]" },
  { key: "absent", label: "Absent", color: "bg-[#b95e4d]" },
  { key: "excused", label: "Excused", color: "bg-[#8b7aac]" },
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
  href,
}: {
  label: string;
  value: number;
  detail: string;
  href?: string | undefined;
}) {
  const content = <>
      <div className="flex items-center justify-between gap-3"><h2 className="text-[12px] font-medium text-[#73807a]">{label}</h2>{href ? <span className="text-[#a1aaa5] transition-transform group-hover:translate-x-0.5" aria-hidden="true">↗</span> : null}</div>
      <p className="mt-2 text-[30px] font-semibold leading-none tracking-[-0.045em] tabular-nums text-[#1f2c30]">{value.toLocaleString("en-IN")}</p>
      <p className="mt-2 text-[11px] leading-4 text-[#89938e]">{detail}</p>
    </>;
  const className = `group block rounded-[18px] border border-[#e5eae6] bg-white p-5 ${href ? "transition-colors hover:border-[#b8d0c6] hover:bg-[#fbfdfb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176e67]" : ""}`;
  return href ? <Link href={href} className={className}>{content}</Link> : <article className={className}>{content}</article>;
}

function SessionCard({ session, timezone }: { session: AdminOverviewSession; timezone: string }) {
  return (
    <article className="grid gap-3 border-b border-line px-5 py-4 last:border-b-0 sm:grid-cols-[88px_minmax(0,1fr)_auto] sm:items-center">
      <div className="text-sm font-semibold tabular-nums">
        {formatTime(session.startsAt, timezone)}
        <span className="mt-0.5 block text-xs font-normal text-muted">
          until {formatTime(session.endsAt, timezone)}
        </span>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{session.batchName}</p>
        <p className="mt-1 truncate text-xs text-muted">
          {session.programName}
          {session.coachNames.length > 0
            ? ` · ${session.coachNames.join(", ")}`
            : " · No active coach assigned"}
          {session.venue ? ` · ${session.venue}` : ""}
        </p>
        {session.status !== "cancelled" && (
          <p className="mt-1 text-xs text-muted">
            Attendance {session.attendance.marked} of {session.attendance.expected} marked
          </p>
        )}
      </div>
      <StatusBadge status={session.status} label={sessionStatusLabels[session.status]} />
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
      <div className="sd-page">
        <h1 className="sd-page-title">Academy overview</h1>
        <p role="alert" className="mt-4 max-w-xl rounded-xl border border-[#e5eae6] bg-white p-4 text-sm text-muted">
          Your staff account does not have permission to view dashboard data. Ask an academy owner to update your access.
        </p>
      </div>
    );
  }

  if (loading && !overview) {
    return (
      <div className="sd-page">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-[#e6ebee]" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-2xl bg-white" />
          ))}
        </div>
        <div className="mt-6 h-72 animate-pulse rounded-2xl bg-white" />
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="sd-page">
        <p className="text-sm font-medium text-accent">{user?.academyName ?? "Academy"}</p>
        <h1 className="sd-page-title mt-2">Academy overview</h1>
        <div role="alert" className="mt-6 rounded-xl border border-[#f1d8d2] bg-[#fff7f5] p-4">
          <p className="text-sm font-semibold text-[#984d3f]">Could not load live academy data</p>
          <p className="mt-1 text-sm text-[#984d3f]">
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
  const accessibleShortcuts = shortcuts.filter((shortcut) => can(shortcut.permission) || (shortcut.href === "/finance" && can("expenses:manage")));
  const attendance = metrics.attendanceToday;
  const attendanceWidth =
    attendance.expected > 0 ? Math.min(100, (attendance.marked / attendance.expected) * 100) : 0;

  return (
    <div className="sd-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-accent">{overview.academyName}</p>
          <h1 className="sd-page-title mt-2">
            Welcome, {user?.displayName.split(" ")[0] ?? "Owner"}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {formatDate(new Date().toISOString(), overview.timezone)} · Your academy at a glance
          </p>
        </div>
        <Button variant="outline" onClick={() => void loadOverview(true)} disabled={refreshing}>
          {refreshing ? "Refreshing…" : "Refresh overview"}
        </Button>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-5 rounded-xl border border-[#f1d8d2] bg-[#fff7f5] px-4 py-3 text-sm text-[#984d3f]"
        >
          {error} Showing the last loaded data.
        </div>
      )}

      <section
        className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Academy totals"
      >
        <MetricCard
          label="Active students"
          value={metrics.activeStudents}
          detail="With an active batch enrollment"
          href={can("students:read") ? "/students" : undefined}
        />
        <MetricCard
          label="Active coaches"
          value={metrics.activeCoaches}
          detail="Coach accounts"
          href={can("coaches:read") ? "/coaches" : undefined}
        />
        <MetricCard
          label="Active batches"
          value={metrics.activeBatches}
          detail={`${metrics.activePrograms} active program${metrics.activePrograms === 1 ? "" : "s"}`}
          href={can("academy:manage") || can("students:read") ? "/operations?section=programs" : undefined}
        />
        <MetricCard
          label="Sessions today"
          value={metrics.sessionsToday}
          detail={`${metrics.scheduledSessionsToday} scheduled · ${metrics.completedSessionsToday} completed · ${metrics.cancelledSessionsToday} cancelled`}
          href={can("schedules:read") ? "/operations?section=schedule" : undefined}
        />
      </section>

      <section className="mt-5 grid items-start gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.8fr)]">
        <article className="overflow-hidden rounded-[18px] border border-[#e5eae6] bg-white">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#edf0ed] px-5 py-4">
            <div>
              <p className="sd-eyebrow">
                Daily operations
              </p>
              <h2 className="mt-1 text-lg font-semibold">Today’s sessions</h2>
              <p className="mt-1 text-xs text-muted">Times shown in {overview.timezone}</p>
            </div>
            {can("schedules:read") ? <Link href="/operations?section=schedule" className="text-sm font-semibold text-accent hover:underline">
              Open schedule →
            </Link> : null}
          </div>
          {overview.todaySessions.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm font-medium">No sessions scheduled today</p>
              <p className="mt-1 text-xs text-muted">
                Create a session from an active batch schedule.
              </p>
              {can("schedules:read") ? <Link
                href="/operations?section=schedule"
                className="mt-4 inline-block text-sm font-semibold text-accent hover:underline"
              >
                Go to schedule
              </Link> : null}
            </div>
          ) : (
            overview.todaySessions.map((session) => (
              <SessionCard key={session.id} session={session} timezone={overview.timezone} />
            ))
          )}
        </article>

        <div className="space-y-6">
          <article className="rounded-[18px] border border-[#e5eae6] bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="sd-eyebrow">
                  Attendance
                </p>
                <h2 className="mt-1 text-lg font-semibold">Today’s check-ins</h2>
              </div>
              {can("attendance:read") ? <Link
                href="/operations?section=attendance"
                className="text-sm font-semibold text-accent hover:underline"
              >
                Review →
              </Link> : null}
            </div>
            <div className="mt-5 flex items-end justify-between gap-3">
              <p className="text-3xl font-semibold tabular-nums">
                {attendance.marked}
                {attendance.expected > 0 && (
                  <span className="text-lg font-normal text-muted"> / {attendance.expected}</span>
                )}
              </p>
              <p className="pb-1 text-xs text-muted">
                {attendance.expected > 0 ? "attendance marks due so far" : "attendance marks due"}
              </p>
            </div>
            {attendance.expected > 0 ? (
              <div
                className="mt-3 h-2 overflow-hidden rounded-full bg-[#edf0f2]"
                role="progressbar"
                aria-label="Attendance records marked for sessions that have started"
                aria-valuemin={0}
                aria-valuemax={attendance.expected}
                aria-valuenow={attendance.marked}
              >
                <div
                  className="h-full rounded-full bg-accent transition-[width]"
                  style={{ width: `${attendanceWidth}%` }}
                />
              </div>
            ) : (
              <p className="mt-3 rounded-xl bg-[#f5f7f7] px-3 py-2 text-xs text-muted">
                {metrics.sessionsToday > 0
                  ? "There are no attendance marks due for sessions that have started."
                  : "No sessions are scheduled for today."}
              </p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2">
              {attendanceLabels.map((item) => (
                <div key={item.key} className="flex items-center gap-2 text-xs text-muted">
                  <span className={`h-2 w-2 rounded-full ${item.color}`} />
                  {item.label}
                  <strong className="ml-auto font-semibold text-foreground">
                    {attendance[item.key]}
                  </strong>
                </div>
              ))}
            </div>
            {attendance.toRecord > 0 && (
              <p className="mt-4 rounded-xl bg-[#fff7eb] px-3 py-2 text-xs font-medium text-[#8a5b24]">
                {attendance.toRecord} attendance mark{attendance.toRecord === 1 ? "" : "s"} still
                due for sessions already underway.
              </p>
            )}
          </article>

          <article className="rounded-[18px] border border-[#e5eae6] bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="sd-eyebrow">
                  Student status
                </p>
                <h2 className="mt-1 text-lg font-semibold">Pending students</h2>
              </div>
              {can("students:read") ? <Link href="/students" className="text-sm font-semibold text-accent hover:underline">
                View students →
              </Link> : null}
            </div>
            <p className="mt-4 text-3xl font-semibold tabular-nums">{metrics.pendingStudents}</p>
            <p className="mt-1 text-xs text-muted">
              Student records with a pending status; this is not a separate inquiry pipeline.
            </p>
          </article>
        </div>
      </section>

      <section className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <article className="rounded-[18px] border border-[#e5eae6] bg-white p-5">
          <p className="sd-eyebrow">
            Common tasks
          </p>
          <h2 className="mt-1 text-lg font-semibold">Quick actions</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            {accessibleShortcuts.map((shortcut) => (
              <Link
                key={shortcut.href + shortcut.label}
                href={shortcut.href}
                className="group rounded-xl border border-line px-4 py-3 transition-colors hover:border-[#bfd8d3] hover:bg-[#f7fbfa]"
              >
                <span className="block text-sm font-semibold group-hover:text-accent">
                  {shortcut.label} →
                </span>
                <span className="mt-1 block text-xs text-muted">{shortcut.description}</span>
              </Link>
            ))}
          </div>
        </article>

        <article className="overflow-hidden rounded-[18px] border border-[#e5eae6] bg-white">
          <div className="flex items-start justify-between gap-3 border-b border-[#edf0ed] px-5 py-4">
            <div>
              <p className="sd-eyebrow">
                Latest updates
              </p>
              <h2 className="mt-1 text-lg font-semibold">Recent attendance</h2>
            </div>
            {can("attendance:read") ? <Link href="/operations?section=attendance" className="text-sm font-semibold text-accent hover:underline">
              All records →
            </Link> : null}
          </div>
          {overview.recentAttendance.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted">
              Coach-submitted attendance will appear here.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {overview.recentAttendance.map((record) => (
                <li
                  key={record.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{record.studentName}</p>
                    <p className="mt-1 truncate text-xs text-muted">
                      {record.batchName} · {record.recordedByName} ·{" "}
                      {formatTime(record.recordedAt, overview.timezone)}
                    </p>
                  </div>
                  <span className="rounded-full bg-[#f0f3f4] px-2.5 py-1 text-[11px] font-semibold capitalize text-[#566673]">
                    {record.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <OverviewContent />
  );
}
