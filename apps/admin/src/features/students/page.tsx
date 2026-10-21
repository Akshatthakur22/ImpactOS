"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type {
  AcademyCatalog,
  CreateStudentRequest,
  GuardianInvite,
  Student,
  StudentStatus,
  UpdateStudentRequest,
} from "@sportdesk/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/hooks/use-auth";
import { ApiRequestError } from "@/lib/auth-api";
import {
  addStudentGuardian,
  createEnrollment,
  createStudent,
  deleteStudent,
  getAcademyCatalog,
  getStudents,
  updateEnrollmentStatus,
  updateStudent,
  updateStudentGuardian,
} from "@/lib/academy-api";
import { createGuardianInvite, revokeGuardianInvite } from "@/lib/operations-api";

const statuses: StudentStatus[] = [
  "active",
  "pending",
  "lead",
  "suspended",
  "completed",
  "withdrawn",
];
const statusLabels: Record<StudentStatus, string> = {
  lead: "Lead",
  pending: "Pending",
  active: "Active",
  suspended: "Suspended",
  completed: "Completed",
  withdrawn: "Withdrawn",
};
type StudentForm = {
  firstName: string;
  lastName: string;
  status: StudentStatus;
  dateOfBirth: string;
  gender: string;
  address: string;
  medicalNotes: string;
  emergencyContactName: string;
  emergencyContactRelationship: string;
  emergencyContactPhone: string;
  guardianName: string;
  guardianRelationship: string;
  guardianEmail: string;
  guardianPhone: string;
  batchId: string;
};
const emptyForm: StudentForm = {
  firstName: "",
  lastName: "",
  status: "pending",
  dateOfBirth: "",
  gender: "",
  address: "",
  medicalNotes: "",
  emergencyContactName: "",
  emergencyContactRelationship: "",
  emergencyContactPhone: "",
  guardianName: "",
  guardianRelationship: "Parent",
  guardianEmail: "",
  guardianPhone: "",
  batchId: "",
};
const selectClass =
  "student-select h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-[#176e6718]";

export default function StudentsPage() {
  const router = useRouter();
  const { accessToken, refreshSession, user } = useAuth();
  const canWrite = user?.role === "owner" || user?.permissions?.includes("students:write") === true;
  const [catalog, setCatalog] = useState<AcademyCatalog | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<{
    total: number;
    active: number;
    pending: number;
    leads: number;
    missingEmergencyContact: number;
  } | null>(null);
  const [queryDraft, setQueryDraft] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StudentStatus | "all">("all");
  const [page, setPage] = useState(0);
  const pageSize = 25;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<StudentForm>(emptyForm);
  const [editingGuardianId, setEditingGuardianId] = useState<string | null>(null);
  const [addingGuardian, setAddingGuardian] = useState(false);
  const [guardianForm, setGuardianForm] = useState({
    name: "",
    relationship: "",
    email: "",
    phone: "",
  });
  const [invite, setInvite] = useState<GuardianInvite | null>(null);
  const [busyGuardian, setBusyGuardian] = useState<string | null>(null);
  const [enrollmentBatchId, setEnrollmentBatchId] = useState("");

  const loadRecords = useCallback(
    async (token: string) => {
      const [catalogResult, directory] = await Promise.all([
        getAcademyCatalog(token, refreshSession),
        getStudents(token, refreshSession, {
          offset: page * pageSize,
          limit: pageSize,
          ...(query ? { search: query } : {}),
          ...(statusFilter !== "all" ? { status: statusFilter } : {}),
        }),
      ]);
      setCatalog(catalogResult);
      setStudents(directory.students);
      setTotal(directory.total ?? directory.students.length);
      setSummary(directory.summary ?? null);
      setError(null);
      setSelectedId((current) =>
        current && directory.students.some((student) => student.id === current)
          ? current
          : (directory.students[0]?.id ?? null),
      );
    },
    [page, pageSize, query, refreshSession, statusFilter],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(0);
      setQuery(queryDraft.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [queryDraft]);
  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    setLoading(true);
    loadRecords(accessToken)
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load students.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, loadRecords]);

  useEffect(() => {
    if (selectedId && !students.some((student) => student.id === selectedId)) setSelectedId(null);
  }, [selectedId, students]);

  const selected = students.find((student) => student.id === selectedId) ?? null;

  function startCreate() {
    setEditing(false);
    setForm(emptyForm);
    setError(null);
    setDialogOpen(true);
  }
  function startEdit(student: Student) {
    setEditing(true);
    setForm({
      ...emptyForm,
      firstName: student.firstName,
      lastName: student.lastName,
      status: student.status,
      dateOfBirth: student.dateOfBirth ?? "",
      gender: student.gender ?? "",
      address: student.address ?? "",
      medicalNotes: student.medicalNotes ?? "",
      emergencyContactName: student.emergencyContactName ?? "",
      emergencyContactRelationship: student.emergencyContactRelationship ?? "",
      emergencyContactPhone: student.emergencyContactPhone ?? "",
    });
    setError(null);
    setDialogOpen(true);
  }
  function setField<K extends keyof StudentForm>(key: K, value: StudentForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  function toPayload(): CreateStudentRequest {
    const emergencyProvided =
      form.emergencyContactName.trim() ||
      form.emergencyContactRelationship.trim() ||
      form.emergencyContactPhone.trim();
    const guardianProvided =
      form.guardianName.trim() || form.guardianEmail.trim() || form.guardianPhone.trim();
    if (
      emergencyProvided &&
      (!form.emergencyContactName.trim() ||
        !form.emergencyContactRelationship.trim() ||
        !form.emergencyContactPhone.trim())
    ) {
      throw new Error("Complete the emergency contact name, relationship, and phone number.");
    }
    if (guardianProvided && !form.guardianName.trim())
      throw new Error("Add the guardian’s name to save guardian contact details.");
    if (!editing && form.batchId && form.status !== "active")
      throw new Error("Set the student status to Active before assigning an initial batch.");
    return {
      firstName: form.firstName,
      lastName: form.lastName,
      status: form.status,
      ...(form.dateOfBirth ? { dateOfBirth: form.dateOfBirth } : {}),
      ...(form.gender.trim() ? { gender: form.gender.trim() } : {}),
      ...(form.address.trim() ? { address: form.address.trim() } : {}),
      ...(form.medicalNotes.trim() ? { medicalNotes: form.medicalNotes.trim() } : {}),
      ...(emergencyProvided
        ? {
            emergencyContact: {
              name: form.emergencyContactName,
              relationship: form.emergencyContactRelationship,
              phone: form.emergencyContactPhone,
            },
          }
        : {}),
      ...(guardianProvided
        ? {
            guardian: {
              name: form.guardianName,
              relationship: form.guardianRelationship,
              ...(form.guardianEmail.trim() ? { email: form.guardianEmail } : {}),
              ...(form.guardianPhone.trim() ? { phone: form.guardianPhone } : {}),
            },
          }
        : {}),
      ...(!editing && form.batchId ? { batchId: form.batchId } : {}),
    };
  }
  async function saveStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload = toPayload();
      if (editing && selected) {
        const changes: UpdateStudentRequest = {
          firstName: payload.firstName,
          lastName: payload.lastName,
          status: payload.status,
          dateOfBirth: payload.dateOfBirth ?? null,
          gender: payload.gender ?? null,
          address: payload.address ?? null,
          medicalNotes: payload.medicalNotes ?? null,
          emergencyContactName: payload.emergencyContact?.name ?? null,
          emergencyContactRelationship: payload.emergencyContact?.relationship ?? null,
          emergencyContactPhone: payload.emergencyContact?.phone ?? null,
        };
        await updateStudent(accessToken, refreshSession, selected.id, changes);
        setNotice("Student profile updated.");
      } else {
        await createStudent(accessToken, refreshSession, payload);
        setNotice("Student added to the academy.");
      }
      setDialogOpen(false);
      await loadRecords(accessToken);
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : "Could not save the student.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function removeStudent(student: Student) {
    if (
      !accessToken ||
      !window.confirm(
        `Delete ${student.firstName} ${student.lastName}? Records with linked academy history cannot be deleted.`,
      )
    )
      return;
    setError(null);
    setNotice(null);
    try {
      await deleteStudent(accessToken, refreshSession, student.id);
      setSelectedId(null);
      setNotice("Student record deleted.");
      await loadRecords(accessToken);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete this student.");
    }
  }
  async function saveGuardian(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !selected || (!editingGuardianId && !addingGuardian)) return;
    setSaving(true);
    setError(null);
    try {
      if (addingGuardian) {
        await addStudentGuardian(accessToken, refreshSession, selected.id, {
          name: guardianForm.name,
          relationship: guardianForm.relationship,
          ...(guardianForm.email ? { email: guardianForm.email } : {}),
          ...(guardianForm.phone ? { phone: guardianForm.phone } : {}),
        });
        setAddingGuardian(false);
        setNotice("Guardian contact added.");
      } else if (editingGuardianId) {
        await updateStudentGuardian(accessToken, refreshSession, selected.id, editingGuardianId, {
          name: guardianForm.name,
          relationship: guardianForm.relationship,
          email: guardianForm.email || null,
          phone: guardianForm.phone || null,
        });
        setEditingGuardianId(null);
        setNotice("Guardian contact updated.");
      }
      await loadRecords(accessToken);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update guardian contact.");
    } finally {
      setSaving(false);
    }
  }
  async function handleInvite(guardianId: string, isPending: boolean) {
    if (!accessToken) return;
    setBusyGuardian(guardianId);
    setError(null);
    setNotice(null);
    try {
      if (isPending) {
        await revokeGuardianInvite(accessToken, refreshSession, guardianId);
        setNotice("Guardian invite revoked.");
      } else {
        const result = await createGuardianInvite(accessToken, refreshSession, guardianId);
        setInvite(result);
        setNotice(`One-time parent invite created for ${result.email}.`);
      }
      await loadRecords(accessToken);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not update the guardian invitation.",
      );
    } finally {
      setBusyGuardian(null);
    }
  }
  async function addEnrollment() {
    if (!accessToken || !selected || !enrollmentBatchId) return;
    setSaving(true);
    setError(null);
    try {
      await createEnrollment(accessToken, refreshSession, selected.id, enrollmentBatchId);
      setEnrollmentBatchId("");
      setNotice("Student enrolled in the batch.");
      await loadRecords(accessToken);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add this enrollment.");
    } finally {
      setSaving(false);
    }
  }
  async function changeEnrollment(
    studentId: string,
    enrollmentId: string,
    status: "completed" | "suspended" | "withdrawn",
  ) {
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    try {
      await updateEnrollmentStatus(accessToken, refreshSession, studentId, enrollmentId, {
        status,
      });
      setNotice(`Enrollment marked ${status}.`);
      await loadRecords(accessToken);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update enrollment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="sd-page students-workspace flex min-h-0 flex-col overflow-hidden">
      <header className="students-workspace-header flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Students</h1>
          <p className="mt-0.5 text-sm text-muted">
            Student records, family contacts, and enrollments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/operations?section=programs"
            className="rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-[#f3f6f5]"
          >
            Programs & batches ↗
          </Link>
          {canWrite && <Button onClick={startCreate}>＋ Add student</Button>}
        </div>
      </header>

      {(error || notice) && (
        <div
          role={error ? "alert" : "status"}
          className={`mt-3 flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${error ? "border-[#f1d8d2] bg-[#fff7f5] text-[#984d3f]" : "border-[#cce3dd] bg-[#eff8f5] text-accent"}`}
        >
          <span>{error ?? notice}</span>
          <button
            onClick={() => {
              setError(null);
              setNotice(null);
            }}
            aria-label="Dismiss"
            className="px-2"
          >
            ×
          </button>
        </div>
      )}
      {invite && (
        <div className="mt-3 rounded-lg border border-[#cce3dd] bg-[#eff8f5] px-3 py-2 text-sm">
          <strong>Parent invite code:</strong>{" "}
          <code className="ml-2 select-all">{invite.token}</code>
          <span className="ml-2 text-muted">
            Share with {invite.email}; expires {new Date(invite.expiresAt).toLocaleString()}.
          </span>
          <button className="float-right px-2" onClick={() => setInvite(null)}>
            ×
          </button>
        </div>
      )}

      <section
        aria-label="Student summary"
        className="student-summary mt-2 flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 border-b border-line py-2 text-sm"
      >
        {[
          ["Students", summary?.total],
          ["Active", summary?.active],
          ["Pending", summary?.pending],
          ["Leads", summary?.leads],
          ["Need emergency contact", summary?.missingEmergencyContact],
        ].map(([label, value], index) => (
          <span key={String(label)} className="whitespace-nowrap">
            {index > 0 && (
              <span className="mr-5 text-[#c1c9c4]" aria-hidden="true">
                ·
              </span>
            )}
            <strong className="font-semibold tabular-nums">
              {loading || value === undefined ? "—" : value}
            </strong>
            <span className="ml-1.5 text-muted">{label}</span>
          </span>
        ))}
      </section>

      <section className="student-directory-layout mt-3 grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-white">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-2">
            <Input
              aria-label="Search students"
              placeholder="Search name…"
              value={queryDraft}
              onChange={(event) => setQueryDraft(event.target.value)}
              className="h-10 min-w-[190px] flex-1"
            />
            <select
              aria-label="Filter by status"
              className={`${selectClass} student-status-filter`}
              value={statusFilter}
              onChange={(event) => {
                setPage(0);
                setStatusFilter(event.target.value as StudentStatus | "all");
              }}
            >
              <option value="all">All statuses</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {statusLabels[status]}
                </option>
              ))}
            </select>
            <span className="px-1 text-xs text-muted">
              {loading ? "Loading…" : `${total} students`}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 bg-[#f7f9f8] text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Student</th>
                  <th className="px-3 py-3 font-medium">Family / batch</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {students.map((student) => {
                  const activeBatch = student.enrollments.find(
                    (enrollment) => enrollment.status === "active",
                  );
                  const guardian = student.guardians[0];
                  return (
                    <tr
                      key={student.id}
                      onClick={() => router.push(`/students/${student.id}`)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          router.push(`/students/${student.id}`);
                        }
                      }}
                      tabIndex={0}
                      className="cursor-pointer transition-colors hover:bg-[#f2f8f6] focus-within:bg-[#f2f8f6]"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e8f2ef] text-xs font-semibold text-accent">
                            {student.firstName.charAt(0)}
                            {student.lastName.charAt(0)}
                          </span>
                          <span className="min-w-0">
                            <strong className="block truncate font-medium">
                              {student.firstName} {student.lastName}
                            </strong>
                            <span className="mt-0.5 block text-xs text-muted">Open student record</span>
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className="block truncate">
                          {guardian?.name ?? "No guardian linked"}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {activeBatch?.batchName ??
                            (student.emergencyContactPhone
                              ? `Emergency · ${student.emergencyContactPhone}`
                              : "No active batch")}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={student.status} />
                      </td>
                    </tr>
                  );
                })}
                {!loading && students.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-6 py-16 text-center">
                      <p className="font-medium">
                        {query || statusFilter !== "all"
                          ? "No matching students"
                          : "No student records yet"}
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        {canWrite
                          ? "Add a student to start building your academy directory."
                          : "Try changing the search or status filter."}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {total > pageSize && (
            <footer className="flex shrink-0 items-center justify-between border-t border-line px-3 py-2 text-xs text-muted">
              <span>
                {students.length
                  ? `Showing ${page * pageSize + 1}–${page * pageSize + students.length} of ${total}`
                  : "No records"}
              </span>
              <span className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0 || loading}
                  onClick={() => setPage((value) => Math.max(0, value - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={(page + 1) * pageSize >= total || loading}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                </Button>
              </span>
            </footer>
          )}
        </div>

        <aside className="hidden">
          {!selected ? (
            <div className="grid flex-1 place-items-center p-8 text-center">
              <div>
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#f0f5f3] text-xl text-accent">
                  ⌕
                </span>
                <h2 className="mt-3 font-semibold">Student profile</h2>
                <p className="mt-1 max-w-xs text-sm text-muted">
                  Select a student from the directory to review their profile, contacts, and
                  enrollment history.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-line p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#e8f2ef] font-semibold text-accent">
                    {selected.firstName[0]}
                    {selected.lastName[0]}
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold">
                      {selected.firstName} {selected.lastName}
                    </h2>
                    <p className="text-xs text-muted">
                      Added {new Date(selected.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {canWrite && (
                    <Button size="sm" variant="outline" onClick={() => startEdit(selected)}>
                      Edit
                    </Button>
                  )}
                  <button
                    aria-label="Close profile"
                    className="rounded px-2 text-muted hover:bg-[#f3f6f5]"
                    onClick={() => setSelectedId(null)}
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                <section>
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                      Student details
                    </h3>
                    <StatusBadge status={selected.status} />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted">Date of birth</dt>
                      <dd className="mt-0.5">{selected.dateOfBirth || "Not added"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Gender</dt>
                      <dd className="mt-0.5">{selected.gender || "Not added"}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-xs text-muted">Address</dt>
                      <dd className="mt-0.5 whitespace-pre-wrap">
                        {selected.address || "Not added"}
                      </dd>
                    </div>
                  </dl>
                  {selected.medicalNotes && (
                    <div className="mt-3 rounded-lg border border-[#f0dfc2] bg-[#fffaf0] p-3">
                      <p className="text-xs font-semibold text-[#8b642b]">Health notes</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{selected.medicalNotes}</p>
                    </div>
                  )}
                </section>
                <section className="rounded-lg border border-[#dcebe6] bg-[#f5faf8] p-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-accent">
                    Emergency contact
                  </h3>
                  {selected.emergencyContactName ? (
                    <div className="mt-2 flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">
                          {selected.emergencyContactName} · {selected.emergencyContactRelationship}
                        </p>
                        <a
                          className="mt-1 inline-block text-sm text-accent hover:underline"
                          href={`tel:${selected.emergencyContactPhone}`}
                        >
                          {selected.emergencyContactPhone}
                        </a>
                      </div>
                      <span aria-label="Contact on file" className="text-accent">
                        ●
                      </span>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-muted">
                      No emergency contact on file.{" "}
                      {canWrite && (
                        <button
                          className="font-semibold text-accent"
                          onClick={() => startEdit(selected)}
                        >
                          Add details
                        </button>
                      )}
                    </p>
                  )}
                </section>
                <section>
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                      Parents & guardians{" "}
                      <span className="font-normal">({selected.guardians.length})</span>
                    </h3>
                    {canWrite && (
                      <button
                        className="text-xs font-semibold text-accent"
                        onClick={() => {
                          setAddingGuardian(true);
                          setEditingGuardianId(null);
                          setGuardianForm({ name: "", relationship: "", email: "", phone: "" });
                        }}
                      >
                        ＋ Add contact
                      </button>
                    )}
                  </div>
                  {selected.guardians.length ? (
                    <div className="mt-2 space-y-2">
                      {selected.guardians.map((guardian) => (
                        <div key={guardian.id} className="rounded-lg border border-line p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium">
                                {guardian.name}{" "}
                                <span className="font-normal text-muted">
                                  · {guardian.relationship}
                                </span>
                              </p>
                              <p className="mt-1 text-xs text-muted">
                                {guardian.email ?? "No email"} · {guardian.phone ?? "No phone"}
                              </p>
                              <p className="mt-1 text-xs text-muted">
                                {guardian.hasAccount
                                  ? "Parent account linked"
                                  : `Invite ${guardian.inviteStatus ?? "not sent"}`}
                              </p>
                            </div>
                            {canWrite && !guardian.hasAccount && guardian.email && (
                              <button
                                className="shrink-0 text-xs font-semibold text-accent disabled:opacity-50"
                                disabled={busyGuardian === guardian.id}
                                onClick={() =>
                                  void handleInvite(
                                    guardian.id,
                                    guardian.inviteStatus === "pending",
                                  )
                                }
                              >
                                {guardian.inviteStatus === "pending" ? "Revoke" : "Invite"}
                              </button>
                            )}
                          </div>
                          {canWrite && (
                            <button
                              className="mt-2 text-xs font-semibold text-muted hover:text-accent"
                              onClick={() => {
                                setEditingGuardianId(guardian.id);
                                setGuardianForm({
                                  name: guardian.name,
                                  relationship: guardian.relationship,
                                  email: guardian.email ?? "",
                                  phone: guardian.phone ?? "",
                                });
                              }}
                            >
                              Edit contact
                            </button>
                          )}
                          {editingGuardianId === guardian.id && (
                            <form
                              onSubmit={(event) => void saveGuardian(event)}
                              className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3"
                            >
                              <Input
                                aria-label="Guardian name"
                                value={guardianForm.name}
                                onChange={(event) =>
                                  setGuardianForm({ ...guardianForm, name: event.target.value })
                                }
                                required
                                placeholder="Name"
                              />
                              <Input
                                aria-label="Relationship"
                                value={guardianForm.relationship}
                                onChange={(event) =>
                                  setGuardianForm({
                                    ...guardianForm,
                                    relationship: event.target.value,
                                  })
                                }
                                required
                                placeholder="Relationship"
                              />
                              <Input
                                aria-label="Guardian email"
                                type="email"
                                value={guardianForm.email}
                                disabled={guardian.hasAccount}
                                onChange={(event) =>
                                  setGuardianForm({ ...guardianForm, email: event.target.value })
                                }
                                placeholder="Email"
                              />
                              <Input
                                aria-label="Guardian phone"
                                value={guardianForm.phone}
                                onChange={(event) =>
                                  setGuardianForm({ ...guardianForm, phone: event.target.value })
                                }
                                placeholder="Phone"
                              />
                              <div className="col-span-2 flex gap-2">
                                <Button size="sm" disabled={saving}>
                                  Save contact
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  type="button"
                                  onClick={() => setEditingGuardianId(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </form>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-muted">
                      No guardian is linked to this profile.
                    </p>
                  )}
                  {addingGuardian && (
                    <form
                      onSubmit={(event) => void saveGuardian(event)}
                      className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-line bg-[#fafcfb] p-3"
                    >
                      <p className="col-span-2 text-sm font-medium">Add a guardian contact</p>
                      <Input
                        aria-label="Guardian name"
                        value={guardianForm.name}
                        onChange={(event) =>
                          setGuardianForm({ ...guardianForm, name: event.target.value })
                        }
                        required
                        placeholder="Name"
                      />
                      <Input
                        aria-label="Relationship"
                        value={guardianForm.relationship}
                        onChange={(event) =>
                          setGuardianForm({ ...guardianForm, relationship: event.target.value })
                        }
                        required
                        placeholder="Relationship"
                      />
                      <Input
                        aria-label="Guardian email"
                        type="email"
                        value={guardianForm.email}
                        onChange={(event) =>
                          setGuardianForm({ ...guardianForm, email: event.target.value })
                        }
                        placeholder="Email"
                      />
                      <Input
                        aria-label="Guardian phone"
                        value={guardianForm.phone}
                        onChange={(event) =>
                          setGuardianForm({ ...guardianForm, phone: event.target.value })
                        }
                        placeholder="Phone"
                      />
                      <div className="col-span-2 flex gap-2">
                        <Button size="sm" disabled={saving}>
                          Add guardian
                        </Button>
                        <Button
                          size="sm"
                          type="button"
                          variant="outline"
                          onClick={() => setAddingGuardian(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </form>
                  )}
                </section>
                <section>
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                      Enrollments
                    </h3>
                    <span className="text-xs text-muted">
                      {selected.enrollments.length} records
                    </span>
                  </div>
                  {selected.enrollments.length ? (
                    <div className="mt-2 space-y-2">
                      {selected.enrollments.map((enrollment) => (
                        <div
                          key={enrollment.id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-line p-3"
                        >
                          <div>
                            <p className="text-sm font-medium">{enrollment.batchName}</p>
                            <p className="text-xs text-muted">
                              {enrollment.programName} · {enrollment.status}
                            </p>
                          </div>
                          {canWrite && enrollment.status === "active" && (
                            <select
                              aria-label={`Update ${enrollment.batchName} enrollment`}
                              className="h-8 rounded-md border border-line bg-white px-2 text-xs"
                              value=""
                              disabled={saving}
                              onChange={(event) => {
                                if (event.target.value)
                                  void changeEnrollment(
                                    selected.id,
                                    enrollment.id,
                                    event.target.value as "completed" | "suspended" | "withdrawn",
                                  );
                              }}
                            >
                              <option value="">Manage</option>
                              <option value="completed">Complete</option>
                              <option value="suspended">Suspend</option>
                              <option value="withdrawn">Withdraw</option>
                            </select>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-muted">No enrollment history yet.</p>
                  )}
                  {canWrite && selected.status === "active" && (
                    <div className="mt-2 flex gap-2">
                      <select
                        aria-label="Choose batch"
                        className={`${selectClass} min-w-0`}
                        value={enrollmentBatchId}
                        onChange={(event) => setEnrollmentBatchId(event.target.value)}
                      >
                        <option value="">Add to a batch…</option>
                        {(catalog?.batches ?? [])
                          .filter((batch) => batch.isActive)
                          .map((batch) => (
                            <option key={batch.id} value={batch.id}>
                              {batch.name} · {batch.programName}
                            </option>
                          ))}
                      </select>
                      <Button
                        variant="outline"
                        disabled={!enrollmentBatchId || saving}
                        onClick={() => void addEnrollment()}
                      >
                        Add
                      </Button>
                    </div>
                  )}
                </section>
              </div>
              {canWrite && (
                <footer className="border-t border-line px-3 py-2">
                  <button
                    className="text-xs font-medium text-muted hover:text-[#a24c40]"
                    onClick={() => void removeStudent(selected)}
                  >
                    Delete record
                  </button>
                </footer>
              )}
            </>
          )}
        </aside>
      </section>

      {dialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#142221]/35 p-3"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDialogOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="student-dialog-title"
            className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <header className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Student management
                </p>
                <h2 id="student-dialog-title" className="mt-1 text-lg font-semibold">
                  {editing ? "Edit student profile" : "Add student"}
                </h2>
              </div>
              <button
                aria-label="Close"
                className="px-2 text-xl text-muted"
                onClick={() => setDialogOpen(false)}
              >
                ×
              </button>
            </header>
            <form
              className="min-h-0 flex-1 overflow-y-auto p-5"
              onSubmit={(event) => void saveStudent(event)}
            >
              <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                <label className="space-y-1.5 text-xs font-medium text-muted">
                  First name
                  <Input
                    autoComplete="given-name"
                    value={form.firstName}
                    onChange={(event) => setField("firstName", event.target.value)}
                    maxLength={80}
                    required
                  />
                </label>
                <label className="space-y-1.5 text-xs font-medium text-muted">
                  Last name
                  <Input
                    autoComplete="family-name"
                    value={form.lastName}
                    onChange={(event) => setField("lastName", event.target.value)}
                    maxLength={80}
                    required
                  />
                </label>
                <label className="space-y-1.5 text-xs font-medium text-muted">
                  Student status
                  <select
                    className={selectClass}
                    value={form.status}
                    onChange={(event) => setField("status", event.target.value as StudentStatus)}
                  >
                    {statuses.map((status) => (
                      <option key={status} value={status}>
                        {statusLabels[status]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1.5 text-xs font-medium text-muted">
                  Date of birth
                  <Input
                    type="date"
                    value={form.dateOfBirth}
                    onChange={(event) => setField("dateOfBirth", event.target.value)}
                  />
                </label>
                <label className="space-y-1.5 text-xs font-medium text-muted">
                  Gender
                  <Input
                    value={form.gender}
                    onChange={(event) => setField("gender", event.target.value)}
                    maxLength={40}
                    placeholder="Optional"
                  />
                </label>
                <label className="space-y-1.5 text-xs font-medium text-muted sm:col-span-2">
                  Home address
                  <Input
                    autoComplete="street-address"
                    value={form.address}
                    onChange={(event) => setField("address", event.target.value)}
                    maxLength={500}
                    placeholder="Street, city, postal code"
                  />
                </label>
                <div className="sm:col-span-2">
                  <h3 className="mb-2 border-b border-line pb-2 text-sm font-semibold text-ink">
                    Emergency contact
                  </h3>
                </div>
                <label className="space-y-1.5 text-xs font-medium text-muted">
                  Contact name
                  <Input
                    autoComplete="name"
                    value={form.emergencyContactName}
                    onChange={(event) => setField("emergencyContactName", event.target.value)}
                    maxLength={120}
                  />
                </label>
                <label className="space-y-1.5 text-xs font-medium text-muted">
                  Relationship
                  <Input
                    value={form.emergencyContactRelationship}
                    onChange={(event) =>
                      setField("emergencyContactRelationship", event.target.value)
                    }
                    maxLength={40}
                    placeholder="Parent, guardian…"
                  />
                </label>
                <label className="space-y-1.5 text-xs font-medium text-muted sm:col-span-2">
                  Emergency phone
                  <Input
                    type="tel"
                    autoComplete="tel"
                    value={form.emergencyContactPhone}
                    onChange={(event) => setField("emergencyContactPhone", event.target.value)}
                    maxLength={30}
                  />
                </label>
                <label className="space-y-1.5 text-xs font-medium text-muted sm:col-span-2">
                  Medical or safety notes
                  <textarea
                    className="min-h-20 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-[#176e6718]"
                    value={form.medicalNotes}
                    onChange={(event) => setField("medicalNotes", event.target.value)}
                    maxLength={2000}
                    placeholder="Allergies, relevant medical information, or safety instructions"
                  />
                </label>
                {!editing && (
                  <>
                    <div className="sm:col-span-2">
                      <h3 className="mb-2 border-b border-line pb-2 text-sm font-semibold text-ink">
                        Parent or guardian{" "}
                        <span className="font-normal text-muted">· optional</span>
                      </h3>
                    </div>
                    <label className="space-y-1.5 text-xs font-medium text-muted">
                      Guardian name
                      <Input
                        value={form.guardianName}
                        onChange={(event) => setField("guardianName", event.target.value)}
                        maxLength={120}
                      />
                    </label>
                    <label className="space-y-1.5 text-xs font-medium text-muted">
                      Relationship
                      <Input
                        value={form.guardianRelationship}
                        onChange={(event) => setField("guardianRelationship", event.target.value)}
                        maxLength={40}
                      />
                    </label>
                    <label className="space-y-1.5 text-xs font-medium text-muted">
                      Guardian phone
                      <Input
                        type="tel"
                        value={form.guardianPhone}
                        onChange={(event) => setField("guardianPhone", event.target.value)}
                        maxLength={30}
                      />
                    </label>
                    <label className="space-y-1.5 text-xs font-medium text-muted">
                      Guardian email
                      <Input
                        type="email"
                        value={form.guardianEmail}
                        onChange={(event) => setField("guardianEmail", event.target.value)}
                        maxLength={254}
                      />
                    </label>
                    <label className="space-y-1.5 text-xs font-medium text-muted sm:col-span-2">
                      Initial batch
                      <select
                        className={selectClass}
                        value={form.batchId}
                        onChange={(event) => setField("batchId", event.target.value)}
                      >
                        <option value="">Do not assign yet</option>
                        {(catalog?.batches ?? [])
                          .filter((batch) => batch.isActive)
                          .map((batch) => (
                            <option key={batch.id} value={batch.id}>
                              {batch.name} · {batch.programName}{" "}
                              {batch.capacity === null
                                ? ""
                                : `· ${batch.activeEnrollmentCount}/${batch.capacity}`}
                            </option>
                          ))}
                      </select>
                      <span className="block font-normal">
                        Initial batch enrollment requires Active status.
                      </span>
                    </label>
                  </>
                )}
              </div>
              {error && (
                <p role="alert" className="mt-3 rounded-lg bg-[#fff7f5] p-3 text-sm text-[#984d3f]">
                  {error}
                </p>
              )}
              <footer className="sticky bottom-[-20px] mt-5 flex justify-end gap-2 border-t border-line bg-white py-3">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button disabled={saving}>
                  {saving ? "Saving…" : editing ? "Save profile" : "Create student"}
                </Button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
