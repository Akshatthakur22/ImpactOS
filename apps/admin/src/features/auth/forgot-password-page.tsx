"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { requestPasswordReset } from "@/lib/auth-api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not request a reset.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f6f7] px-5 py-10">
      <section className="w-full max-w-md rounded-2xl border border-line bg-white p-7 shadow-sm sm:p-9">
        <p className="text-sm font-semibold text-accent">Impact Academy</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">Reset your password</h1>
        {sent ? (
          <p role="status" className="mt-3 text-sm leading-6 text-muted">
            If an active account uses that email, password reset instructions have been sent. Check
            your inbox.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-4">
            <p className="text-sm leading-6 text-muted">
              Enter your account email and we’ll send a secure, time-limited reset link.
            </p>
            <FormField label="Email address" htmlFor="reset-email">
              <Input
                id="reset-email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </FormField>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            <Button className="w-full" disabled={busy}>
              {busy ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        )}
        <Link
          href="/login"
          className="mt-6 inline-flex text-sm font-semibold text-accent hover:underline"
        >
          Back to sign in
        </Link>
      </section>
    </main>
  );
}
