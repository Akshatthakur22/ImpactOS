"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { AcademyCatalog, GuardianInvite, Student, StudentStatus } from "@sportdesk/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WorkspaceShell } from "@/components/workspace-shell";
import { createStudent, getAcademyCatalog, getStudents } from "@/lib/academy-api";
import { ApiRequestError } from "@/lib/auth-api";
import { createGuardianInvite } from "@/lib/operations-api";
import { useAuth } from "@/providers/auth-provider";

const statusLabels: Record<StudentStatus, string> = {
  lead: "Lead",
  pending: "Pending",
  active: "Active",
  suspended: "Suspended",
  completed: "Completed",
  withdrawn: "Withdrawn",
};

export default function StudentsPage() {
  const { accessToken, refreshSession } = useAuth();
  const [catalog, setCatalog] = useState<AcademyCatalog | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [status, setStatus] = useState<StudentStatus>("pending");
  const [guardianName, setGuardianName] = useState("");
  const [relationship, setRelationship] = useState("Parent");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [batchId, setBatchId] = useState("");
  const [guardianInvite, setGuardianInvite] = useState<GuardianInvite | null>(null);
  const [inviteBusyId, setInviteBusyId] = useState<string | null>(null);

  const loadRecords = useCallback(
    async (token: string) => {
      const [catalogValue, studentValue] = await Promise.all([
        getAcademyCatalog(token, refreshSession),
        getStudents(token, refreshSession),
      ]);
      setCatalog(catalogValue);
      setStudents(studentValue.students);
      setBatchId(
        (current) => current || catalogValue.batches.find((batch) => batch.isActive)?.id || "",
      );
    },
    [refreshSession],
  );

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    setLoading(true);
    loadRecords(accessToken)
      .catch((caught: unknown) => {
        if (active)
          setError(caught instanceof Error ? caught.message : "Could not load student records.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, loadRecords]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;
    const hasGuardianDetails = guardianName.trim() || guardianEmail.trim() || guardianPhone.trim();
    if (hasGuardianDetails && !guardianName.trim()) {
      setError("Add the guardian's name when entering guardian contact details.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await createStudent(accessToken, refreshSession, {
        firstName,
        lastName,
        status,
        ...(guardianName.trim()
          ? {
              guardian: {
                name: guardianName,
                relationship,
                ...(guardianEmail.trim() ? { email: guardianEmail } : {}),
                ...(guardianPhone.trim() ? { phone: guardianPhone } : {}),
              },
            }
          : {}),
        ...(batchId ? { batchId } : {}),
      });
      setFirstName("");
      setLastName("");
      setStatus("pending");
      setGuardianName("");
      setRelationship("Parent");
      setGuardianEmail("");
      setGuardianPhone("");
      setNotice("Student record saved.");
      await loadRecords(accessToken);
    } catch (caught: unknown) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : "Could not save the student record.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function inviteGuardian(guardianId: string) {
    if (!accessToken) return;
    setInviteBusyId(guardianId);
    setError(null);
    setNotice(null);
    try {
      const invite = await createGuardianInvite(accessToken, refreshSession, guardianId);
      setGuardianInvite(invite);
      setNotice(`One-time parent invite created for ${invite.email}.`);
      await loadRecords(accessToken);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create a parent invite.");
    } finally {
      setInviteBusyId(null);
    }
  }

  return (
    <WorkspaceShell>
      <div className="mx-auto max-w-[1200px] px-5 py-8 sm:px-8 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-accent">Student records</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Students & guardians</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Register students, keep a guardian contact when appropriate, and assign active batch
              enrollments.
            </p>
          </div>
          <Link href="/programs" className="text-sm font-semibold text-accent hover:underline">
            Configure programs & batches →
          </Link>
        </div>

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
        {guardianInvite && (
          <section className="mt-4 rounded-xl border border-[#cce3dd] bg-white px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
              Parent invite code
            </p>
            <p className="mt-2 break-all font-mono text-sm">{guardianInvite.token}</p>
            <p className="mt-2 text-xs leading-5 text-muted">
              Share this one-time code with {guardianInvite.email}. It expires{" "}
              {new Date(guardianInvite.expiresAt).toLocaleString()}; the parent chooses their own
              password in the mobile app.
            </p>
          </section>
        )}

        <div className="mt-8 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                New record
              </p>
              <h2 className="mt-2 text-lg font-semibold">Register a student</h2>
            </div>
            <form className="mt-5 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-2 text-sm font-medium" htmlFor="student-first-name">
                  First name
                  <Input
                    id="student-first-name"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    maxLength={80}
                    required
                  />
                </label>
                <label className="block space-y-2 text-sm font-medium" htmlFor="student-last-name">
                  Last name
                  <Input
                    id="student-last-name"
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    maxLength={80}
                    required
                  />
                </label>
              </div>
              <label className="block space-y-2 text-sm font-medium" htmlFor="student-status">
                Student status
                <select
                  id="student-status"
                  className="h-11 w-full rounded-xl border border-line bg-white px-3.5 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-[#176e6718]"
                  value={status}
                  onChange={(event) => setStatus(event.target.value as StudentStatus)}
                >
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="border-t border-line pt-4">
                <h3 className="text-sm font-semibold">
                  Guardian contact <span className="font-normal text-muted">(optional)</span>
                </h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label
                    className="block space-y-2 text-sm font-medium sm:col-span-2"
                    htmlFor="guardian-name"
                  >
                    Name
                    <Input
                      id="guardian-name"
                      autoComplete="name"
                      value={guardianName}
                      onChange={(event) => setGuardianName(event.target.value)}
                      maxLength={120}
                    />
                  </label>
                  <label
                    className="block space-y-2 text-sm font-medium"
                    htmlFor="guardian-relationship"
                  >
                    Relationship
                    <Input
                      id="guardian-relationship"
                      value={relationship}
                      onChange={(event) => setRelationship(event.target.value)}
                      maxLength={40}
                      disabled={!guardianName.trim()}
                    />
                  </label>
                  <label className="block space-y-2 text-sm font-medium" htmlFor="guardian-phone">
                    Phone <span className="font-normal text-muted">(optional)</span>
                    <Input
                      id="guardian-phone"
                      autoComplete="tel"
                      type="tel"
                      value={guardianPhone}
                      onChange={(event) => setGuardianPhone(event.target.value)}
                      maxLength={30}
                    />
                  </label>
                  <label
                    className="block space-y-2 text-sm font-medium sm:col-span-2"
                    htmlFor="guardian-email"
                  >
                    Email <span className="font-normal text-muted">(optional)</span>
                    <Input
                      id="guardian-email"
                      autoComplete="email"
                      type="email"
                      value={guardianEmail}
                      onChange={(event) => setGuardianEmail(event.target.value)}
                      maxLength={254}
                    />
                  </label>
                </div>
              </div>

              <label className="block space-y-2 text-sm font-medium" htmlFor="student-batch">
                Initial batch <span className="font-normal text-muted">(optional)</span>
                <select
                  id="student-batch"
                  className="h-11 w-full rounded-xl border border-line bg-white px-3.5 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-[#176e6718]"
                  value={batchId}
                  onChange={(event) => setBatchId(event.target.value)}
                >
                  <option value="">Do not assign yet</option>
                  {(catalog?.batches ?? [])
                    .filter((batch) => batch.isActive)
                    .map((batch) => (
                      <option key={batch.id} value={batch.id}>
                        {batch.name} · {batch.programName}
                        {batch.capacity === null
                          ? ""
                          : ` · ${batch.activeEnrollmentCount}/${batch.capacity}`}
                      </option>
                    ))}
                </select>
                {!catalog?.batches.some((batch) => batch.isActive) && (
                  <span className="block text-xs font-normal text-muted">
                    Add an active batch first.{" "}
                    <Link href="/programs" className="font-semibold text-accent hover:underline">
                      Set up a batch
                    </Link>
                  </span>
                )}
              </label>

              <Button type="submit" disabled={submitting || loading} className="w-full">
                {submitting ? "Saving record…" : "Register student"}
              </Button>
            </form>
          </section>

          <section className="min-w-0 rounded-2xl border border-line bg-white p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                  Academy directory
                </p>
                <h2 className="mt-2 text-lg font-semibold">Students</h2>
              </div>
              <span className="rounded-full bg-[#f1f3f4] px-2.5 py-1 text-xs font-medium tabular-nums text-muted">
                {loading ? "…" : students.length}
              </span>
            </div>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs font-medium text-muted">
                    <th className="pb-3 pr-4">Student</th>
                    <th className="pb-3 pr-4">Guardian</th>
                    <th className="pb-3 pr-4">Enrollment</th>
                    <th className="pb-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {students.map((student) => (
                    <tr key={student.id}>
                      <td className="py-3.5 pr-4">
                        <div className="font-medium">
                          {student.firstName} {student.lastName}
                        </div>
                        <div className="mt-1 text-xs text-muted">
                          Added {new Date(student.createdAt).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="py-3.5 pr-4 text-xs text-muted">
                        {student.guardians.length ? (
                          <div className="space-y-3">
                            {student.guardians.map((guardian) => (
                              <div key={guardian.id}>
                                <div>
                                  {guardian.name} · {guardian.relationship}
                                </div>
                                <div className="mt-1">{guardian.email ?? "No email on file"}</div>
                                {guardian.hasAccount ? (
                                  <span className="mt-1 inline-block text-accent">
                                    Parent access active
                                  </span>
                                ) : guardian.email ? (
                                  <button
                                    type="button"
                                    className="mt-1 font-semibold text-accent hover:underline disabled:opacity-50"
                                    disabled={inviteBusyId === guardian.id}
                                    onClick={() => void inviteGuardian(guardian.id)}
                                  >
                                    {inviteBusyId === guardian.id
                                      ? "Creating invite…"
                                      : "Create parent invite"}
                                  </button>
                                ) : (
                                  <span className="mt-1 inline-block">
                                    Add an email to enable parent access
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          "Not linked"
                        )}
                      </td>
                      <td className="py-3.5 pr-4 text-xs text-muted">
                        {student.enrollments
                          .filter((enrollment) => enrollment.status === "active")
                          .map((enrollment) => (
                            <div key={enrollment.id}>
                              {enrollment.batchName} · {enrollment.programName}
                            </div>
                          ))}
                        {student.enrollments.every(
                          (enrollment) => enrollment.status !== "active",
                        ) && "Not assigned"}
                      </td>
                      <td className="py-3.5">
                        <span className="rounded-full bg-[#f1f3f4] px-2.5 py-1 text-[11px] font-medium text-muted">
                          {statusLabels[student.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!loading && students.length === 0 && (
                    <tr>
                      <td className="py-8 text-center text-sm text-muted" colSpan={4}>
                        No student records yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {loading && (
                <p className="py-8 text-center text-sm text-muted">Loading student records…</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </WorkspaceShell>
  );
}
