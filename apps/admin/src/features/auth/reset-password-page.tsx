"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { confirmPasswordReset } from "@/lib/auth-api";

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") ?? "");
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await confirmPasswordReset(token, password);
      setDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update your password.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f6f7] px-5 py-10">
      <section className="w-full max-w-md rounded-2xl border border-line bg-white p-7 shadow-sm sm:p-9">
        <p className="text-sm font-semibold text-accent">Impact Academy</p>
        <h1 className="mt-3 text-2xl font-semibold">Choose a new password</h1>
        {done ? (
          <p role="status" className="mt-4 text-sm text-muted">
            Your password has been updated. All active sessions were signed out.
          </p>
        ) : token.length < 32 ? (
          <p role="alert" className="mt-4 text-sm leading-6 text-muted">
            This reset link is missing or invalid.{" "}
            <Link href="/forgot-password" className="font-semibold text-accent hover:underline">
              Request another link
            </Link>
            .
          </p>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <FormField label="New password" htmlFor="new-password">
              <Input
                id="new-password"
                type="password"
                required
                minLength={14}
                maxLength={256}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </FormField>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            <Button className="w-full" disabled={busy}>
              {busy ? "Updating…" : "Update password"}
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
