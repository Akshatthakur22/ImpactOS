"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/providers/auth-provider";

export default function LoginPage() {
  const router = useRouter();
  const { login, loading, user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace("/dashboard");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[1.02fr_0.98fr]">
      <section className="relative hidden overflow-hidden bg-[#133c3b] px-12 py-12 text-white lg:flex lg:flex-col lg:justify-between xl:px-20">
        <div className="absolute -right-36 -top-28 h-[34rem] w-[34rem] rounded-full border border-white/10" />
        <div className="absolute -right-12 -top-4 h-[27rem] w-[27rem] rounded-full border border-white/10" />
        <div className="absolute -bottom-36 -left-24 h-[30rem] w-[30rem] rounded-full bg-[#236d64]/40 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-white text-sm font-black text-[#133c3b]">
            S
          </div>
          <span className="text-lg font-semibold tracking-tight">SportDesk</span>
        </div>
        <div className="relative max-w-xl pb-8">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-[#9fd1c9]">
            Impact Fit Academy
          </p>
          <h1 className="max-w-lg text-5xl font-semibold leading-[1.08] tracking-[-0.04em] xl:text-6xl">
            A clearer view of every training day.
          </h1>
          <p className="mt-6 max-w-md text-base leading-7 text-white/70">
            One trusted place for the people, sessions, and records that keep your academy moving.
          </p>
          <div className="mt-12 flex items-center gap-3 text-xs text-white/60">
            <span className="h-px w-10 bg-[#9fd1c9]" />
            Built around the way your academy works
          </div>
        </div>
        <p className="relative text-xs text-white/45">Secure operations workspace · India</p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#133c3b] text-sm font-black text-white">
              S
            </div>
            <span className="text-lg font-semibold tracking-tight">SportDesk</span>
          </div>
          <div className="mb-9">
            <p className="text-sm font-medium text-[#176e67]">Welcome back</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">
              Sign in to your workspace
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              Use the account provided by your academy administrator.
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <label className="block space-y-2 text-sm font-medium">
              Email address
              <Input
                autoComplete="username"
                autoCapitalize="none"
                type="email"
                required
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@academy.com"
              />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              Password
              <Input
                autoComplete="current-password"
                type="password"
                required
                maxLength={256}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
              />
            </label>
            {error && (
              <p
                role="alert"
                className="rounded-xl border border-[#f1d8d2] bg-[#fff7f5] px-4 py-3 text-sm text-[#984d3f]"
              >
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={submitting || loading}>
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-8 text-center text-xs leading-5 text-muted">
            Need access? Contact your academy administrator.
          </p>
        </div>
      </section>
    </main>
  );
}
