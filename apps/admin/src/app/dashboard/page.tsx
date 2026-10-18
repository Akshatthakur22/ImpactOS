"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ApiRequestError, getAdminOverview } from "@/lib/auth-api";
import { useAuth } from "@/providers/auth-provider";

const upcomingModules = [
  ["04", "Fees & payments", "Invoices, collections, receipts, and balances"],
  ["05", "Athlete progress", "Assessments, notes, and progress history"],
  ["06", "Announcements", "Academy updates and attendance reminders"],
  ["07", "Reports", "Attendance and operational summaries"],
];

export default function DashboardPage() {
  const router = useRouter();
  const { user, accessToken, loading, refreshSession, logout } = useAuth();
  const [academyName, setAcademyName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!accessToken) return;
    const token = accessToken;
    let active = true;
    async function loadOverview() {
      try {
        let overview;
        try {
          overview = await getAdminOverview(token);
        } catch (caught) {
          if (!(caught instanceof ApiRequestError) || caught.status !== 401) throw caught;
          const renewedToken = await refreshSession();
          if (!renewedToken) throw caught;
          overview = await getAdminOverview(renewedToken);
        }
        if (active) setAcademyName(overview.academyName);
      } catch (caught: unknown) {
        if (active)
          setError(caught instanceof Error ? caught.message : "Could not load workspace.");
      }
    }
    void loadOverview();
    return () => {
      active = false;
    };
  }, [accessToken, refreshSession]);

  if (loading || !user) {
    return (
      <main className="grid min-h-screen place-items-center text-sm text-muted">
        Loading workspace…
      </main>
    );
  }

  if (user.role !== "owner") {
    return (
      <main className="grid min-h-screen place-items-center px-6">
        <div className="max-w-md rounded-2xl border border-line bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-semibold text-accent">SportDesk</p>
          <h1 className="mt-3 text-xl font-semibold">Admin access is not enabled</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            Your account is signed in, but this workspace currently requires an owner account.
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
        <div className="flex items-center gap-3 px-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#133c3b] text-xs font-black text-white">
            S
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight">SportDesk</div>
            <div className="text-[11px] text-muted">Academy operations</div>
          </div>
        </div>
        <div className="mt-10 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#98a3aa]">
          Workspace
        </div>
        <nav className="mt-3 space-y-1" aria-label="Main navigation">
          <div className="rounded-xl bg-accent-soft px-3 py-2.5 text-sm font-semibold text-accent">
            Overview
          </div>
          <Link
            href="/students"
            className="block rounded-xl px-3 py-2.5 text-sm text-muted hover:bg-[#f5f7f7]"
          >
            Students & guardians
          </Link>
          <Link
            href="/programs"
            className="block rounded-xl px-3 py-2.5 text-sm text-muted hover:bg-[#f5f7f7]"
          >
            Programs & batches
          </Link>
          <Link
            href="/coaches"
            className="block rounded-xl px-3 py-2.5 text-sm text-muted hover:bg-[#f5f7f7]"
          >
            Coaches
          </Link>
          <Link
            href="/schedule"
            className="block rounded-xl px-3 py-2.5 text-sm text-muted hover:bg-[#f5f7f7]"
          >
            Schedule
          </Link>
          <Link
            href="/attendance"
            className="block rounded-xl px-3 py-2.5 text-sm text-muted hover:bg-[#f5f7f7]"
          >
            Attendance
          </Link>
        </nav>
        <div className="mt-8 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#98a3aa]">
          Coming online
        </div>
        <div className="mt-3 space-y-1">
          {upcomingModules.map(([number, title]) => (
            <div
              key={number}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[#89959e]"
            >
              <span className="w-5 text-[10px] tabular-nums text-[#b4bdc3]">{number}</span>
              {title}
            </div>
          ))}
        </div>
        <div className="mt-auto rounded-2xl bg-[#f5f7f7] p-4">
          <p className="text-xs font-semibold">A focused first release</p>
          <p className="mt-1.5 text-xs leading-5 text-muted">
            Workflows are being added in verified steps, with real records behind each view.
          </p>
        </div>
      </aside>

      <main className="min-w-0">
        <header className="flex min-h-[72px] items-center justify-between border-b border-line bg-white px-5 sm:px-8">
          <div className="flex items-center gap-3 lg:hidden">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#133c3b] text-xs font-black text-white">
              S
            </div>
            <span className="text-sm font-bold">SportDesk</span>
          </div>
          <nav className="flex gap-1 lg:hidden" aria-label="Main navigation">
            <Link
              href="/students"
              className="rounded-lg px-2.5 py-2 text-xs text-muted hover:bg-[#f5f7f7]"
            >
              Students
            </Link>
            <Link
              href="/programs"
              className="rounded-lg px-2.5 py-2 text-xs text-muted hover:bg-[#f5f7f7]"
            >
              Programs
            </Link>
            <Link
              href="/coaches"
              className="rounded-lg px-2.5 py-2 text-xs text-muted hover:bg-[#f5f7f7]"
            >
              Coaches
            </Link>
            <Link
              href="/schedule"
              className="rounded-lg px-2.5 py-2 text-xs text-muted hover:bg-[#f5f7f7]"
            >
              Schedule
            </Link>
            <Link
              href="/attendance"
              className="rounded-lg px-2.5 py-2 text-xs text-muted hover:bg-[#f5f7f7]"
            >
              Attendance
            </Link>
          </nav>
          <div className="hidden text-sm text-muted lg:block">
            Workspace / <span className="font-medium text-foreground">Overview</span>
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
        </header>

        <div className="mx-auto max-w-[1200px] px-5 py-8 sm:px-8 sm:py-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-accent">
                {academyName ?? "Impact Fit Academy"}
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-[2.15rem]">
                Good to have you back, {user.displayName.split(" ")[0]}.
              </h1>
              <p className="mt-2 text-sm text-muted">
                Your core academy workflows are live. The next modules build on these records.
              </p>
            </div>
            <div className="rounded-full border border-[#cce3dd] bg-[#eff8f5] px-3 py-1.5 text-xs font-semibold text-accent">
              Owner workspace
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="mt-7 rounded-xl border border-[#f1d8d2] bg-[#fff7f5] px-4 py-3 text-sm text-[#984d3f]"
            >
              {error}
            </div>
          )}

          <section className="mt-8 overflow-hidden rounded-3xl bg-[#153f3d] p-6 text-white shadow-[0_18px_50px_-34px_#133c3b] sm:p-8">
            <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
              <div className="max-w-xl">
                <p className="text-xs font-semibold uppercase tracking-[0.17em] text-[#a5d4cc]">
                  Academy records online
                </p>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] sm:text-[1.8rem]">
                  A secure start, built around your academy.
                </h2>
                <p className="mt-3 text-sm leading-6 text-white/70">
                  Sign-in and academy-scoped student, guardian, program, batch, and enrollment
                  records are connected to the backend.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs sm:min-w-[250px]">
                <div className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5">
                  <span className="text-[#a5d4cc]">✓</span>
                  <span className="ml-2">Secure sign-in</span>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5">
                  <span className="text-[#a5d4cc]">✓</span>
                  <span className="ml-2">Session rotation</span>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5">
                  <span className="text-[#a5d4cc]">✓</span>
                  <span className="ml-2">Server-side roles</span>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5">
                  <span className="text-[#a5d4cc]">✓</span>
                  <span className="ml-2">Single academy</span>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-10">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Core operations</h2>
                <p className="mt-1 text-sm text-muted">Workflows being added next</p>
              </div>
              <span className="text-xs font-medium text-muted">Not yet enabled</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {upcomingModules.map(([number, title, description]) => (
                <article key={number} className="rounded-2xl border border-line bg-white p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold tabular-nums text-accent">{number}</span>
                    <span className="rounded-full bg-[#f1f3f4] px-2.5 py-1 text-[10px] font-medium text-muted">
                      Planned
                    </span>
                  </div>
                  <h3 className="mt-5 text-sm font-semibold">{title}</h3>
                  <p className="mt-1.5 min-h-10 text-xs leading-5 text-muted">{description}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
