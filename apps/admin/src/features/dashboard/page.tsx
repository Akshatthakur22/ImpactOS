"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { AdminOverview, AdminOverviewSession } from "@sportdesk/contracts";
import { Button } from "@/components/ui/button";
import { ApiRequestError, getAdminOverview } from "@/lib/auth-api";
import { useAuth } from "@/hooks/use-auth";

const shortcuts = [
  { href: "/students", label: "Register a student", description: "Add a student and guardian" },
  { href: "/coaches", label: "Manage coaches", description: "Create an account or assign a batch" },
  { href: "/operations", label: "Create a session", description: "Set up training for a batch" },
  { href: "/operations", label: "Review attendance", description: "Check records and corrections" },
  {
    href: "/finance",
    label: "Manage academy finance",
    description: "Invoices, receipts, and expenses",
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
  tint,
}: {
  label: string;
  value: number;
  detail: string;
  tint: string;
}) {
  return (
    <article className="rounded-2xl border border-line bg-white p-5 shadow-sm">
      <div className={`mb-4 h-1 w-10 rounded-full ${tint}`} />
      <p className="text-3xl font-semibold tracking-[-0.04em] tabular-nums">{value}</p>
      <h2 className="mt-1 text-sm font-semibold">{label}</h2>
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </article>
  );
}

function SessionCard({ session, timezone }: { session: AdminOverviewSession; timezone: string }) {
  const statusTone =
    session.status === "completed"
      ? "bg-[#e5f3f0] text-[#176e67]"
      : session.status === "cancelled"
        ? "bg-[#f7eae7] text-[#984d3f]"
        : "bg-[#eef2f5] text-[#566673]";

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
      <span className={`w-fit rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusTone}`}>
        {sessionStatusLabels[session.status]}
      </span>
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
      if (!accessToken || user?.role !== "owner") return;
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
    [accessToken, refreshSession, user?.role],
  );

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  if (loading && !overview) {
    return (
      <div className="mx-auto max-w-[1240px] px-5 py-10 sm:px-8">
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
      <div className="mx-auto max-w-[1240px] px-5 py-10 sm:px-8">
        <p className="text-sm font-medium text-accent">{user?.academyName ?? "Academy"}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Academy overview</h1>
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
  const attendance = metrics.attendanceToday;
  const attendanceWidth =
    attendance.expected > 0 ? Math.min(100, (attendance.marked / attendance.expected) * 100) : 0;

  return (
    <div className="mx-auto max-w-[1240px] px-5 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-accent">{overview.academyName}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-[2.15rem]">
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
        className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Academy totals"
      >
        <MetricCard
          label="Active students"
          value={metrics.activeStudents}
          detail="Students with an active batch enrollment"
          tint="bg-[#176e67]"
        />
        <MetricCard
          label="Active coaches"
          value={metrics.activeCoaches}
          detail="Active coach accounts"
          tint="bg-[#51879a]"
        />
        <MetricCard
          label="Active batches"
          value={metrics.activeBatches}
          detail={`${metrics.activePrograms} active program${metrics.activePrograms === 1 ? "" : "s"}`}
          tint="bg-[#8b7aac]"
        />
        <MetricCard
          label="Sessions today"
          value={metrics.sessionsToday}
          detail={`${metrics.scheduledSessionsToday} scheduled · ${metrics.completedSessionsToday} completed · ${metrics.cancelledSessionsToday} cancelled`}
          tint="bg-[#d58a46]"
        />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.8fr)]">
        <article className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
                Daily operations
              </p>
              <h2 className="mt-1 text-lg font-semibold">Today’s sessions</h2>
              <p className="mt-1 text-xs text-muted">Times shown in {overview.timezone}</p>
            </div>
            <Link href="/operations?section=schedule" className="text-sm font-semibold text-accent hover:underline">
              Open schedule →
            </Link>
          </div>
          {overview.todaySessions.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm font-medium">No sessions scheduled today</p>
              <p className="mt-1 text-xs text-muted">
                Create a session from an active batch schedule.
              </p>
              <Link
                href="/operations?section=schedule"
                className="mt-4 inline-block text-sm font-semibold text-accent hover:underline"
              >
                Go to schedule
              </Link>
            </div>
          ) : (
            overview.todaySessions.map((session) => (
              <SessionCard key={session.id} session={session} timezone={overview.timezone} />
            ))
          )}
        </article>

        <div className="space-y-6">
          <article className="rounded-2xl border border-line bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
                  Attendance
                </p>
                <h2 className="mt-1 text-lg font-semibold">Today’s check-ins</h2>
              </div>
              <Link
                href="/operations?section=attendance"
                className="text-sm font-semibold text-accent hover:underline"
              >
                Review →
              </Link>
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

          <article className="rounded-2xl border border-line bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
                  Student status
                </p>
                <h2 className="mt-1 text-lg font-semibold">Pending students</h2>
              </div>
              <Link href="/students" className="text-sm font-semibold text-accent hover:underline">
                View students →
              </Link>
            </div>
            <p className="mt-4 text-3xl font-semibold tabular-nums">{metrics.pendingStudents}</p>
            <p className="mt-1 text-xs text-muted">
              Student records with a pending status; this is not a separate inquiry pipeline.
            </p>
          </article>
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <article className="rounded-2xl border border-line bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
            Common tasks
          </p>
          <h2 className="mt-1 text-lg font-semibold">Quick actions</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            {shortcuts.map((shortcut) => (
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

        <article className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
                Latest updates
              </p>
              <h2 className="mt-1 text-lg font-semibold">Recent attendance</h2>
            </div>
            <Link href="/operations?section=attendance" className="text-sm font-semibold text-accent hover:underline">
              All records →
            </Link>
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
