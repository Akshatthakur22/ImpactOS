"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { AcademyCatalog, GuardianInvite, Student, StudentStatus } from "@sportdesk/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableEmptyState } from "@/components/tables/table-empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  createEnrollment,
  createStudent,
  getAcademyCatalog,
  getStudents,
  updateEnrollmentStatus,
  updateStudent,
  updateStudentGuardian,
} from "@/lib/academy-api";
import { ApiRequestError } from "@/lib/auth-api";
import { createGuardianInvite, revokeGuardianInvite } from "@/lib/operations-api";
import { useAuth } from "@/hooks/use-auth";

const statusLabels: Record<StudentStatus, string> = {
  lead: "Lead",
  pending: "Pending",
  active: "Active",
  suspended: "Suspended",
  completed: "Completed",
  withdrawn: "Withdrawn",
};

export default function StudentsPage() {
  const { accessToken, refreshSession, user } = useAuth();
  const canWrite = user?.role === "owner" || user?.permissions?.includes("students:write") === true;
  const [catalog, setCatalog] = useState<AcademyCatalog | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [totalStudents, setTotalStudents] = useState(0);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StudentStatus | "all">("all");
  const [page, setPage] = useState(0);
  const pageSize = 25;
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editStatus, setEditStatus] = useState<StudentStatus>("pending");
  const [editingGuardianId, setEditingGuardianId] = useState<string | null>(null);
  const [editGuardianName, setEditGuardianName] = useState("");
  const [editRelationship, setEditRelationship] = useState("");
  const [editGuardianEmail, setEditGuardianEmail] = useState("");
  const [editGuardianPhone, setEditGuardianPhone] = useState("");
  const [enrollmentBatchId, setEnrollmentBatchId] = useState("");
  const [savingDetail, setSavingDetail] = useState(false);
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
        getStudents(token, refreshSession, {
          offset: page * pageSize,
          limit: pageSize,
          ...(search ? { search } : {}),
          ...(statusFilter !== "all" ? { status: statusFilter } : {}),
        }),
      ]);
      setCatalog(catalogValue);
      setStudents(studentValue.students);
      setTotalStudents(studentValue.total ?? studentValue.students.length);
    },
    [page, pageSize, refreshSession, search, statusFilter],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setPage(0);
      setSearch(searchDraft.trim());
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [searchDraft]);

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

  const selectedStudent = students.find((student) => student.id === selectedStudentId) ?? null;

  useEffect(() => {
    if (!selectedStudent) return;
    setEditFirstName(selectedStudent.firstName);
    setEditLastName(selectedStudent.lastName);
    setEditStatus(selectedStudent.status);
  }, [selectedStudent]);

  const selectedGuardian = selectedStudent?.guardians.find(
    (guardian) => guardian.id === editingGuardianId,
  );

  useEffect(() => {
    if (!selectedGuardian) return;
    setEditGuardianName(selectedGuardian.name);
    setEditRelationship(selectedGuardian.relationship);
    setEditGuardianEmail(selectedGuardian.email ?? "");
    setEditGuardianPhone(selectedGuardian.phone ?? "");
  }, [selectedGuardian]);

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
      setBatchId("");
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

  async function saveStudentDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !selectedStudent) return;
    setSavingDetail(true);
    setError(null);
    setNotice(null);
    try {
      await updateStudent(accessToken, refreshSession, selectedStudent.id, {
        firstName: editFirstName,
        lastName: editLastName,
        status: editStatus,
      });
      setNotice("Student record updated.");
      await loadRecords(accessToken);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update this student.");
    } finally {
      setSavingDetail(false);
    }
  }

  async function saveGuardianDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !selectedStudent || !editingGuardianId) return;
    setSavingDetail(true);
    setError(null);
    setNotice(null);
    try {
      await updateStudentGuardian(
        accessToken,
        refreshSession,
        selectedStudent.id,
        editingGuardianId,
        {
          name: editGuardianName,
          relationship: editRelationship,
          email: editGuardianEmail.trim() || null,
          phone: editGuardianPhone.trim() || null,
        },
      );
      setEditingGuardianId(null);
      setNotice("Guardian contact updated. Any unused invite to an old email was revoked.");
      await loadRecords(accessToken);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update this guardian.");
    } finally {
      setSavingDetail(false);
    }
  }

  async function changeEnrollment(
    enrollmentId: string,
    nextStatus: "suspended" | "completed" | "withdrawn",
  ) {
    if (!accessToken || !selectedStudent) return;
    setSavingDetail(true);
    setError(null);
    setNotice(null);
    try {
      await updateEnrollmentStatus(accessToken, refreshSession, selectedStudent.id, enrollmentId, {
        status: nextStatus,
      });
      setNotice(`Enrollment marked ${nextStatus}. Its history remains on the student record.`);
      await loadRecords(accessToken);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update this enrollment.");
    } finally {
      setSavingDetail(false);
    }
  }

  async function enrollInSelectedBatch() {
    if (!accessToken || !selectedStudent || !enrollmentBatchId) return;
    setSavingDetail(true);
    setError(null);
    setNotice(null);
    try {
      await createEnrollment(accessToken, refreshSession, selectedStudent.id, enrollmentBatchId);
      setEnrollmentBatchId("");
      setNotice("Student enrolled in the selected batch.");
      await loadRecords(accessToken);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not enroll this student.");
    } finally {
      setSavingDetail(false);
    }
  }

  async function revokeInvite(guardianId: string) {
    if (!accessToken) return;
    setInviteBusyId(guardianId);
    setError(null);
    setNotice(null);
    try {
      await revokeGuardianInvite(accessToken, refreshSession, guardianId);
      setNotice("Unused parent invite revoked.");
      await loadRecords(accessToken);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not revoke the invite.");
    } finally {
      setInviteBusyId(null);
    }
  }

  return (
    <div className="sd-page">
        <PageHeader eyebrow="People" title="Students & guardians" description="Register students, keep a guardian contact when appropriate, and assign active batch enrollments."
          actions={<Link href="/operations?section=programs" className="text-sm font-semibold text-accent hover:underline">
            Configure programs & batches →
          </Link>} />

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
          {canWrite ? <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
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
                    <Link href="/operations?section=programs" className="font-semibold text-accent hover:underline">
                      Set up a batch
                    </Link>
                  </span>
                )}
                {batchId && status !== "active" && (
                  <span className="block text-xs font-normal text-muted">
                    A student must be Active before a batch enrollment can start.
                  </span>
                )}
              </label>

              <Button type="submit" disabled={submitting || loading} className="w-full">
                {submitting ? "Saving record…" : "Register student"}
              </Button>
            </form>
          </section> : <section className="rounded-2xl border border-line bg-white p-5 sm:p-6"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Student records</p><h2 className="mt-2 text-lg font-semibold">View access</h2><p className="mt-2 text-sm leading-6 text-muted">You can review student records. Creating or changing student, guardian, and enrollment details requires student management access.</p></section>}

          <section className="min-w-0 rounded-2xl border border-line bg-white p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                  Academy directory
                </p>
                <h2 className="mt-2 text-lg font-semibold">Students</h2>
              </div>
              <span className="rounded-full bg-[#f1f3f4] px-2.5 py-1 text-xs font-medium tabular-nums text-muted">
                {loading ? "…" : `${totalStudents} total`}
              </span>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_190px]">
              <label className="sr-only" htmlFor="student-search">
                Search students
              </label>
              <Input
                id="student-search"
                placeholder="Search student name"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
              />
              <label className="sr-only" htmlFor="student-filter-status">
                Filter by status
              </label>
              <select
                id="student-filter-status"
                className="h-11 rounded-xl border border-line bg-white px-3.5 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-[#176e6718]"
                value={statusFilter}
                onChange={(event) => {
                  setPage(0);
                  setStatusFilter(event.target.value as StudentStatus | "all");
                }}
              >
                <option value="all">All statuses</option>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[650px] text-left text-sm">
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
                    <tr
                      key={student.id}
                      className={selectedStudentId === student.id ? "bg-[#f4faf8]" : ""}
                    >
                      <td className="py-3.5 pr-4">
                        <button
                          type="button"
                          className="text-left font-semibold text-accent hover:underline"
                          onClick={() => setSelectedStudentId(student.id)}
                        >
                          {student.firstName} {student.lastName}
                        </button>
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
                                <div className="mt-1">{guardian.email ?? "No email"}</div>
                                <div>{guardian.phone ?? "No phone"}</div>
                                {guardian.hasAccount ? (
                                  <span className="mt-1 inline-block text-accent">
                                    Parent access active
                                  </span>
                                ) : guardian.email ? (
                                  <div className="mt-1">
                                    <span>
                                      {guardian.inviteStatus === "pending"
                                        ? "Invite pending"
                                        : `Invite ${guardian.inviteStatus ?? "not sent"}`}
                                    </span>
                                    {canWrite ? <button
                                      type="button"
                                      className="ml-2 font-semibold text-accent hover:underline disabled:opacity-50"
                                      disabled={inviteBusyId === guardian.id}
                                      onClick={() =>
                                        guardian.inviteStatus === "pending"
                                          ? void revokeInvite(guardian.id)
                                          : void inviteGuardian(guardian.id)
                                      }
                                    >
                                      {inviteBusyId === guardian.id
                                        ? "Working…"
                                        : guardian.inviteStatus === "pending"
                                          ? "Revoke"
                                          : "Issue / reissue"}
                                    </button> : null}
                                  </div>
                                ) : (
                                  <span className="mt-1 inline-block">
                                    Add an email to enable parent access
                                  </span>
                                )}
                                {canWrite ? <button
                                  type="button"
                                  className="mt-1 block font-semibold text-accent hover:underline"
                                  onClick={() => {
                                    setSelectedStudentId(student.id);
                                    setEditingGuardianId(guardian.id);
                                  }}
                                >
                                  Edit contact
                                </button> : null}
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
                        <StatusBadge status={student.status} label={statusLabels[student.status]} />
                      </td>
                    </tr>
                  ))}
                  {!loading && students.length === 0 && (
                    <TableEmptyState colSpan={4}>
                      {search || statusFilter !== "all"
                        ? "No students match these filters."
                        : "No student records yet."}
                    </TableEmptyState>
                  )}
                </tbody>
              </table>
              {loading && (
                <p className="py-8 text-center text-sm text-muted">Loading student records…</p>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4 text-sm">
              <span className="text-muted">
                {totalStudents === 0
                  ? "0 students"
                  : `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, totalStudents)} of ${totalStudents}`}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={page === 0 || loading}
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={(page + 1) * pageSize >= totalStudents || loading}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </section>
        </div>
        {selectedStudent && (
          <section className="mt-6 rounded-2xl border border-line bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                  Student record
                </p>
                <h2 className="mt-2 text-xl font-semibold">
                  {selectedStudent.firstName} {selectedStudent.lastName}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Registered {new Date(selectedStudent.createdAt).toLocaleDateString()}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSelectedStudentId(null);
                  setEditingGuardianId(null);
                }}
              >
                Close record
              </Button>
            </div>

            <div className="mt-6 grid gap-8 xl:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold">Student details and lifecycle</h3>
                    <form
                  className="mt-3 space-y-3"
                  onSubmit={(event) => void saveStudentDetails(event)}
                >
                      <fieldset disabled={!canWrite} className="contents">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-2 text-sm font-medium">
                      First name
                      <Input
                        value={editFirstName}
                        onChange={(event) => setEditFirstName(event.target.value)}
                        maxLength={80}
                        required
                      />
                    </label>
                    <label className="space-y-2 text-sm font-medium">
                      Last name
                      <Input
                        value={editLastName}
                        onChange={(event) => setEditLastName(event.target.value)}
                        maxLength={80}
                        required
                      />
                    </label>
                  </div>
                  <label className="block space-y-2 text-sm font-medium">
                    Student status
                    <select
                      className="h-11 w-full rounded-xl border border-line bg-white px-3.5 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-[#176e6718]"
                      value={editStatus}
                      onChange={(event) => setEditStatus(event.target.value as StudentStatus)}
                    >
                      {Object.entries(statusLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="text-xs leading-5 text-muted">
                    Suspending, completing or withdrawing a student ends their active batch
                    enrollments. Historic enrollments remain visible.
                  </p>
                  <Button type="submit" disabled={savingDetail}>
                    Save student details
                  </Button>
                      </fieldset>
                </form>

                <div className="mt-7 border-t border-line pt-5">
                  <h3 className="text-sm font-semibold">Guardians</h3>
                  {selectedStudent.guardians.length === 0 ? (
                    <p className="mt-2 text-sm text-muted">
                      No guardian contact is linked to this student.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {selectedStudent.guardians.map((guardian) => (
                        <div key={guardian.id} className="rounded-xl border border-line p-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="font-medium">
                                {guardian.name} · {guardian.relationship}
                              </p>
                              <p className="mt-1 text-sm text-muted">
                                {guardian.email ?? "No email"} · {guardian.phone ?? "No phone"}
                              </p>
                              <p className="mt-1 text-xs text-muted">
                                {guardian.hasAccount
                                  ? "Parent account linked"
                                  : `Invite: ${guardian.inviteStatus ?? "not sent"}`}
                              </p>
                            </div>
                            {canWrite ? <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setEditingGuardianId(guardian.id)}
                            >
                              Edit contact
                            </Button> : null}
                          </div>
                          {canWrite && !guardian.hasAccount && guardian.email && (
                            <div className="mt-2 flex gap-3 text-sm">
                              <button
                                type="button"
                                className="font-semibold text-accent hover:underline disabled:opacity-50"
                                disabled={inviteBusyId === guardian.id}
                                onClick={() =>
                                  guardian.inviteStatus === "pending"
                                    ? void revokeInvite(guardian.id)
                                    : void inviteGuardian(guardian.id)
                                }
                              >
                                {guardian.inviteStatus === "pending"
                                  ? "Revoke invite"
                                  : "Issue / reissue invite"}
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {canWrite && selectedGuardian && editingGuardianId && (
                    <form
                      className="mt-4 space-y-3 rounded-xl bg-[#f7f9f9] p-4"
                      onSubmit={(event) => void saveGuardianDetails(event)}
                    >
                      <h4 className="text-sm font-semibold">Update {selectedGuardian.name}</h4>
                      <label className="block space-y-2 text-sm font-medium">
                        Name
                        <Input
                          value={editGuardianName}
                          onChange={(event) => setEditGuardianName(event.target.value)}
                          maxLength={120}
                          required
                        />
                      </label>
                      <label className="block space-y-2 text-sm font-medium">
                        Relationship to student
                        <Input
                          value={editRelationship}
                          onChange={(event) => setEditRelationship(event.target.value)}
                          maxLength={40}
                          required
                        />
                      </label>
                      <label className="block space-y-2 text-sm font-medium">
                        Email
                        <Input
                          type="email"
                          value={editGuardianEmail}
                          onChange={(event) => setEditGuardianEmail(event.target.value)}
                          maxLength={254}
                          disabled={selectedGuardian.hasAccount}
                        />
                        {selectedGuardian.hasAccount && (
                          <span className="block text-xs font-normal text-muted">
                            The linked account's email is managed by account security.
                          </span>
                        )}
                      </label>
                      <label className="block space-y-2 text-sm font-medium">
                        Phone
                        <Input
                          type="tel"
                          value={editGuardianPhone}
                          onChange={(event) => setEditGuardianPhone(event.target.value)}
                          maxLength={30}
                        />
                      </label>
                      <div className="flex gap-2">
                        <Button type="submit" disabled={savingDetail}>
                          Save guardian
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={savingDetail}
                          onClick={() => setEditingGuardianId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </form>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold">Enrollment history</h3>
                {selectedStudent.enrollments.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">No batch enrollment history.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {selectedStudent.enrollments.map((enrollment) => (
                      <div
                        key={enrollment.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3"
                      >
                        <div>
                          <p className="font-medium">
                            {enrollment.batchName} · {enrollment.programName}
                          </p>
                          <p className="mt-1 text-xs capitalize text-muted">
                            {enrollment.status} · started{" "}
                            {enrollment.startedAt
                              ? new Date(enrollment.startedAt).toLocaleDateString()
                              : "date unavailable"}
                            {enrollment.endedAt
                              ? ` · ended ${new Date(enrollment.endedAt).toLocaleDateString()}`
                              : ""}
                          </p>
                        </div>
                        {canWrite && enrollment.status === "active" && (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={savingDetail}
                              onClick={() => void changeEnrollment(enrollment.id, "suspended")}
                            >
                              Suspend
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={savingDetail}
                              onClick={() => void changeEnrollment(enrollment.id, "completed")}
                            >
                              Complete
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={savingDetail}
                              onClick={() => void changeEnrollment(enrollment.id, "withdrawn")}
                            >
                              Withdraw
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {canWrite ? <div className="mt-5 rounded-xl bg-[#f7f9f9] p-4">
                  <h4 className="text-sm font-semibold">Enroll in another batch</h4>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                    <select
                      aria-label="Select a batch for enrollment"
                      className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-white px-3.5 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-[#176e6718]"
                      value={enrollmentBatchId}
                      onChange={(event) => setEnrollmentBatchId(event.target.value)}
                    >
                      <option value="">Select active batch</option>
                      {(catalog?.batches ?? [])
                        .filter(
                          (batch) =>
                            batch.isActive &&
                            !selectedStudent.enrollments.some(
                              (enrollment) =>
                                enrollment.batchId === batch.id && enrollment.status === "active",
                            ),
                        )
                        .map((batch) => (
                          <option
                            key={batch.id}
                            value={batch.id}
                            disabled={
                              batch.capacity !== null &&
                              batch.activeEnrollmentCount >= batch.capacity
                            }
                          >
                            {batch.name} · {batch.programName}
                            {batch.capacity === null
                              ? ""
                              : ` · ${batch.activeEnrollmentCount}/${batch.capacity}`}
                          </option>
                        ))}
                    </select>
                    <Button
                      type="button"
                      disabled={
                        !enrollmentBatchId || savingDetail || selectedStudent.status !== "active"
                      }
                      onClick={() => void enrollInSelectedBatch()}
                    >
                      Enroll student
                    </Button>
                  </div>
                  {selectedStudent.status !== "active" && (
                    <p className="mt-2 text-xs text-muted">
                      Set the student status to Active before creating a new enrollment.
                    </p>
                  )}
                </div> : null}
              </div>
            </div>
          </section>
        )}
      </div>
  );
}
