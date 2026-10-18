"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/auth-provider";

const navigation = [
  { href: "/dashboard", label: "Overview" },
  { href: "/students", label: "Students & guardians" },
  { href: "/programs", label: "Programs & batches" },
  { href: "/coaches", label: "Coaches" },
  { href: "/schedule", label: "Schedule" },
  { href: "/attendance", label: "Attendance" },
];

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

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
            Your account is signed in, but academy record management currently requires an owner.
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
            S
          </span>
          <span>
            <span className="block text-sm font-bold tracking-tight">SportDesk</span>
            <span className="block text-[11px] text-muted">Academy operations</span>
          </span>
        </Link>
        <div className="mt-10 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#98a3aa]">
          Workspace
        </div>
        <nav className="mt-3 space-y-1" aria-label="Main navigation">
          {navigation.map((item) => {
            const active = pathname === item.href;
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
        </nav>
        <div className="mt-auto rounded-2xl bg-[#f5f7f7] p-4">
          <p className="text-xs font-semibold">Built around your academy</p>
          <p className="mt-1.5 text-xs leading-5 text-muted">
            Each record is stored through the authenticated SportDesk API.
          </p>
        </div>
      </aside>

      <main className="min-w-0">
        <header className="border-b border-line bg-white px-5 sm:px-8">
          <div className="flex min-h-[72px] items-center justify-between">
            <div className="flex items-center gap-3 lg:hidden">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#133c3b] text-xs font-black text-white">
                S
              </span>
              <span className="text-sm font-bold">SportDesk</span>
            </div>
            <div className="hidden text-sm text-muted lg:block">
              {user.academyName} <span className="px-2 text-[#bdc6cb]">/</span>
              <span className="font-medium text-foreground">Owner workspace</span>
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
          <nav className="flex gap-1 overflow-x-auto pb-2 lg:hidden" aria-label="Main navigation">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-lg px-2.5 py-2 text-xs ${
                  pathname === item.href ? "bg-accent-soft font-semibold text-accent" : "text-muted"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        {children}
      </main>
    </div>
  );
}
