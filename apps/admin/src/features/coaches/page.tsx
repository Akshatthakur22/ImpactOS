"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import type { AcademyCatalog, Coach } from "@sportdesk/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAcademyCatalog } from "@/lib/academy-api";
import { ApiRequestError } from "@/lib/auth-api";
import { assignCoach, createCoach, getCoaches, updateCoach } from "@/lib/operations-api";
import { useAuth } from "@/hooks/use-auth";

export default function CoachesPage() {
  const { accessToken, refreshSession } = useAuth();
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [catalog, setCatalog] = useState<AcademyCatalog | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [specializations, setSpecializations] = useState("");
  const [coachId, setCoachId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [editingCoachId, setEditingCoachId] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editSpecializations, setEditSpecializations] = useState("");
  const [editStatus, setEditStatus] = useState<Coach["status"]>("active");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load(token: string) {
    const [coachResult, catalogResult] = await Promise.all([
      getCoaches(token, refreshSession),
      getAcademyCatalog(token, refreshSession),
    ]);
    setCoaches(coachResult.coaches);
    setCatalog(catalogResult);
    setCoachId(
      (current) =>
        current || coachResult.coaches.find((coach) => coach.status === "active")?.id || "",
    );
    setBatchId(
      (current) => current || catalogResult.batches.find((batch) => batch.isActive)?.id || "",
    );
  }

  useEffect(() => {
    if (!accessToken) return;
    load(accessToken)
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : "Could not load coaches."),
      )
      .finally(() => setLoading(false));
  }, [accessToken]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await createCoach(accessToken, refreshSession, {
        displayName,
        email,
        password,
        specializations: specializations
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      });
      setDisplayName("");
      setEmail("");
      setPassword("");
      setSpecializations("");
      await load(accessToken);
      setNotice("Coach account created.");
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : "Could not create coach.");
    } finally {
      setBusy(false);
    }
  }

  async function assign() {
    if (!accessToken || !coachId || !batchId) return;
    setBusy(true);
    setError(null);
    try {
      await assignCoach(accessToken, refreshSession, batchId, coachId);
      await load(accessToken);
      setNotice("Coach assigned to batch.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not assign coach.");
    } finally {
      setBusy(false);
    }
  }

  async function saveCoach(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !editingCoachId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await updateCoach(accessToken, refreshSession, editingCoachId, {
        displayName: editDisplayName,
        phone: editPhone.trim() || null,
        specializations: editSpecializations
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        status: editStatus,
      });
      setEditingCoachId(null);
      await load(accessToken);
      setNotice(
        editStatus === "inactive"
          ? "Coach deactivated. Their existing sessions were revoked."
          : "Coach profile updated.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update coach.");
    } finally {
      setBusy(false);
    }
  }

  function beginEdit(coach: Coach) {
    setEditingCoachId(coach.id);
    setEditDisplayName(coach.displayName);
    setEditPhone(coach.phone ?? "");
    setEditSpecializations(coach.specializations.join(", "));
    setEditStatus(coach.status);
  }

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-8 sm:px-8 sm:py-10">
        <p className="text-sm font-medium text-accent">People and access</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Coaches & classes</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Manage coach profiles and batch assignments. Set class times and review attendance in Academy operations.
        </p>
        {error && (
          <div
            role="alert"
            className="mt-6 rounded-xl border border-[#f1d8d2] bg-[#fff7f5] px-4 py-3 text-sm text-[#984d3f]"
          >
            {error}
          </div>
        )}
        {notice && (
          <div
            role="status"
            className="mt-6 rounded-xl border border-[#cce3dd] bg-[#eff8f5] px-4 py-3 text-sm text-accent"
          >
            {notice}
          </div>
        )}
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              New coach
            </p>
            <h2 className="mt-2 text-lg font-semibold">Create account</h2>
            <form className="mt-5 space-y-3" onSubmit={(event) => void submit(event)}>
              <Input
                aria-label="Coach name"
                placeholder="Full name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                required
              />
              <Input
                aria-label="Coach email"
                type="email"
                placeholder="coach@academy.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <Input
                aria-label="Temporary password"
                type="password"
                placeholder="Temporary password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={14}
                required
              />
              <Input
                aria-label="Specializations"
                placeholder="Wushu, conditioning"
                value={specializations}
                onChange={(event) => setSpecializations(event.target.value)}
              />
              <Button type="submit" disabled={busy || loading}>
                {busy ? "Saving…" : "Create coach"}
              </Button>
            </form>
          </section>
          <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Batch assignment
            </p>
            <h2 className="mt-2 text-lg font-semibold">Connect a coach to a batch</h2>
            <div className="mt-5 space-y-3">
              <select
                aria-label="Coach"
                className="h-11 w-full rounded-xl border border-line bg-white px-3.5 text-sm"
                value={coachId}
                onChange={(event) => setCoachId(event.target.value)}
              >
                <option value="">Select coach</option>
                {coaches
                  .filter((coach) => coach.status === "active")
                  .map((coach) => (
                    <option key={coach.id} value={coach.id}>
                      {coach.displayName}
                    </option>
                  ))}
              </select>
              <select
                aria-label="Batch"
                className="h-11 w-full rounded-xl border border-line bg-white px-3.5 text-sm"
                value={batchId}
                onChange={(event) => setBatchId(event.target.value)}
              >
                <option value="">Select batch</option>
                {(catalog?.batches ?? [])
                  .filter((batch) => batch.isActive)
                  .map((batch) => (
                    <option key={batch.id} value={batch.id}>
                      {batch.name} · {batch.programName}
                    </option>
                  ))}
              </select>
              <Button onClick={() => void assign()} disabled={busy || !coachId || !batchId}>
                Assign coach
              </Button>
            </div>
            <ul className="mt-6 divide-y divide-line">
              {coaches.map((coach) => (
                <li key={coach.id} className="py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{coach.displayName}</div>
                      <div className="mt-1 text-xs text-muted">
                        {coach.email} · {coach.status} · {coach.batchIds.length} batch
                        {coach.batchIds.length === 1 ? "" : "es"}
                      </div>
                      <div className="mt-1 text-xs text-muted">
                        {coach.specializations.join(", ") || "No specializations listed"}
                      </div>
                      <div className="mt-2 text-xs leading-5 text-muted">
                        {coach.batchIds.length
                          ? coach.batchIds
                              .map((id) => catalog?.batches.find((batch) => batch.id === id))
                              .filter((batch): batch is NonNullable<typeof batch> => Boolean(batch))
                              .map((batch) => `${batch.name} · ${batch.programName}`)
                              .join(" / ") || "Batch details unavailable"
                          : "No batch assignments"}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => beginEdit(coach)}
                    >
                      Edit
                    </Button>
                  </div>
                </li>
              ))}
              {!loading && coaches.length === 0 && (
                <li className="py-4 text-sm text-muted">No coaches have been added.</li>
              )}
            </ul>
            <Link href="/operations" className="mt-4 inline-flex text-sm font-semibold text-accent hover:underline">
              Open class timetable and attendance
            </Link>
          </section>
        </div>
        {editingCoachId && (
          <section className="mt-6 rounded-2xl border border-line bg-white p-5 sm:p-6">
            <h2 className="text-lg font-semibold">Coach profile and access</h2>
            <form
              className="mt-4 grid gap-3 sm:max-w-xl"
              onSubmit={(event) => void saveCoach(event)}
            >
              <Input
                aria-label="Coach display name"
                value={editDisplayName}
                onChange={(event) => setEditDisplayName(event.target.value)}
                maxLength={160}
                required
              />
              <Input
                aria-label="Coach phone"
                type="tel"
                value={editPhone}
                onChange={(event) => setEditPhone(event.target.value)}
                placeholder="Phone (optional)"
                maxLength={30}
              />
              <Input
                aria-label="Coach specializations"
                value={editSpecializations}
                onChange={(event) => setEditSpecializations(event.target.value)}
                placeholder="Wushu, conditioning"
              />
              <label className="space-y-2 text-sm font-medium">
                Account status
                <select
                  aria-label="Coach account status"
                  className="h-11 w-full rounded-xl border border-line bg-white px-3.5 text-sm"
                  value={editStatus}
                  onChange={(event) => setEditStatus(event.target.value as Coach["status"])}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
              <p className="text-xs leading-5 text-muted">
                Deactivating a coach blocks sign-in and revokes refresh sessions. Their profile and
                batch links remain for history.
              </p>
              <div className="flex gap-2">
                <Button type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Save coach"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setEditingCoachId(null)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </section>
        )}
      </div>
  );
}
