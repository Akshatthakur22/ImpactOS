"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { AcademyCatalog, GuardianInvite, Student, StudentStatus } from "@sportdesk/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/hooks/use-auth";
import {
  addStudentGuardian,
  createEnrollment,
  deleteStudent,
  getAcademyCatalog,
  getStudent,
  updateEnrollmentStatus,
  updateStudent,
  updateStudentGuardian,
} from "@/lib/academy-api";
import { createGuardianInvite, revokeGuardianInvite } from "@/lib/operations-api";

const statuses: StudentStatus[] = ["lead", "pending", "active", "suspended", "completed", "withdrawn"];
const label: Record<StudentStatus, string> = {
  lead: "Lead", pending: "Pending", active: "Active", suspended: "Suspended", completed: "Completed", withdrawn: "Withdrawn",
};
const selectClass = "student-select h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-[#176e6718]";
const fieldClass = "h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-[#176e6718]";

export default function StudentProfilePage({ studentId }: { studentId: string }) {
  const router = useRouter();
  const { accessToken, refreshSession, user } = useAuth();
  const canWrite = user?.role === "owner" || user?.permissions?.includes("students:write") === true;
  const [student, setStudent] = useState<Student | null>(null);
  const [catalog, setCatalog] = useState<AcademyCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [invite, setInvite] = useState<GuardianInvite | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", status: "active" as StudentStatus, dateOfBirth: "", gender: "", address: "", medicalNotes: "", emergencyContactName: "", emergencyContactRelationship: "", emergencyContactPhone: "" });
  const [guardianId, setGuardianId] = useState<string | null>(null);
  const [addingGuardian, setAddingGuardian] = useState(false);
  const [guardianForm, setGuardianForm] = useState({ name: "", relationship: "Parent", email: "", phone: "" });
  const [enrollmentBatchId, setEnrollmentBatchId] = useState("");

  const load = useCallback(async (token: string) => {
    const [record, batches] = await Promise.all([
      getStudent(token, refreshSession, studentId),
      canWrite ? getAcademyCatalog(token, refreshSession) : Promise.resolve(null),
    ]);
    setStudent(record);
    setCatalog(batches);
    setError(null);
  }, [canWrite, refreshSession, studentId]);

  useEffect(() => {
    if (!accessToken) return;
    let alive = true;
    setLoading(true);
    load(accessToken).catch((caught: unknown) => {
      if (alive) setError(caught instanceof Error ? caught.message : "Could not load this student.");
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [accessToken, load]);

  function startEdit() {
    if (!student) return;
    setForm({ firstName: student.firstName, lastName: student.lastName, status: student.status, dateOfBirth: student.dateOfBirth ?? "", gender: student.gender ?? "", address: student.address ?? "", medicalNotes: student.medicalNotes ?? "", emergencyContactName: student.emergencyContactName ?? "", emergencyContactRelationship: student.emergencyContactRelationship ?? "", emergencyContactPhone: student.emergencyContactPhone ?? "" });
    setEditOpen(true);
  }
  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !student) return;
    setSaving(true); setError(null);
    try {
      await updateStudent(accessToken, refreshSession, student.id, {
        firstName: form.firstName, lastName: form.lastName, status: form.status,
        dateOfBirth: form.dateOfBirth || null, gender: form.gender || null, address: form.address || null,
        medicalNotes: form.medicalNotes || null, emergencyContactName: form.emergencyContactName || null,
        emergencyContactRelationship: form.emergencyContactRelationship || null, emergencyContactPhone: form.emergencyContactPhone || null,
      });
      setEditOpen(false); setNotice("Student profile saved."); await load(accessToken);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save student profile."); }
    finally { setSaving(false); }
  }
  async function saveGuardian(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !student) return;
    setSaving(true); setError(null);
    try {
      if (guardianId) await updateStudentGuardian(accessToken, refreshSession, student.id, guardianId, { ...guardianForm, email: guardianForm.email || null, phone: guardianForm.phone || null });
      else await addStudentGuardian(accessToken, refreshSession, student.id, { name: guardianForm.name, relationship: guardianForm.relationship, ...(guardianForm.email ? { email: guardianForm.email } : {}), ...(guardianForm.phone ? { phone: guardianForm.phone } : {}) });
      setGuardianId(null); setAddingGuardian(false); setGuardianForm({ name: "", relationship: "Parent", email: "", phone: "" }); setNotice("Family contact saved."); await load(accessToken);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save family contact."); }
    finally { setSaving(false); }
  }
  async function handleInvite(id: string, pending: boolean) {
    if (!accessToken) return;
    setSaving(true); setError(null);
    try {
      if (pending) { await revokeGuardianInvite(accessToken, refreshSession, id); setNotice("Invite revoked."); }
      else { const created = await createGuardianInvite(accessToken, refreshSession, id); setInvite(created); setNotice(`One-time invite created for ${created.email}.`); }
      await load(accessToken);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not update the invite."); }
    finally { setSaving(false); }
  }
  async function addBatch() {
    if (!accessToken || !student || !enrollmentBatchId) return;
    setSaving(true); setError(null);
    try { await createEnrollment(accessToken, refreshSession, student.id, enrollmentBatchId); setEnrollmentBatchId(""); setNotice("Student enrolled in the batch."); await load(accessToken); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not add enrollment."); }
    finally { setSaving(false); }
  }
  async function setEnrollment(id: string, status: "completed" | "suspended" | "withdrawn") {
    if (!accessToken || !student) return;
    setSaving(true); setError(null);
    try { await updateEnrollmentStatus(accessToken, refreshSession, student.id, id, { status }); setNotice(`Enrollment marked ${status}.`); await load(accessToken); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not update enrollment."); }
    finally { setSaving(false); }
  }
  async function remove() {
    if (!accessToken || !student || !window.confirm(`Delete ${student.firstName} ${student.lastName}? Linked academy history may prevent deletion.`)) return;
    try { await deleteStudent(accessToken, refreshSession, student.id); router.replace("/students"); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not delete this student."); }
  }

  return (
    <main className="sd-page mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/students" className="text-sm font-medium text-accent hover:underline">← All students</Link>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[.14em] text-muted">Student record</p>
        </div>
        {student && canWrite && <div className="flex gap-2"><Button variant="outline" onClick={startEdit}>Edit profile</Button><Button variant="outline" onClick={() => void remove()}>Delete</Button></div>}
      </div>
      {(error || notice) && <div role={error ? "alert" : "status"} className={`mb-4 rounded-lg border px-4 py-3 text-sm ${error ? "border-[#f1d8d2] bg-[#fff7f5] text-[#984d3f]" : "border-[#cce3dd] bg-[#eff8f5] text-accent"}`}>{error ?? notice}<button className="float-right" onClick={() => { setError(null); setNotice(null); }}>×</button></div>}
      {invite && <div className="mb-4 rounded-lg border border-[#cce3dd] bg-[#eff8f5] px-4 py-3 text-sm"><strong>Parent invite code</strong><code className="ml-3 select-all font-semibold">{invite.token}</code><span className="ml-3 text-muted">Share with {invite.email}; expires {new Date(invite.expiresAt).toLocaleString()}.</span><button className="float-right px-2" aria-label="Dismiss invite" onClick={() => setInvite(null)}>×</button></div>}
      {loading ? <div className="rounded-xl border border-line bg-white p-8 text-sm text-muted">Loading student record…</div> : !student ? <div className="rounded-xl border border-line bg-white p-8"><h1 className="text-lg font-semibold">Student not found</h1><p className="mt-1 text-sm text-muted">This record may have been removed or you may not have access to it.</p></div> : <>
        <header className="mb-5 flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-white p-5 sm:p-6">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-[#e8f2ef] text-lg font-semibold text-accent">{student.firstName[0]}{student.lastName[0]}</span>
          <div className="min-w-0 flex-1"><h1 className="truncate text-2xl font-semibold tracking-tight">{student.firstName} {student.lastName}</h1><p className="mt-1 text-sm text-muted">Added {new Date(student.createdAt).toLocaleDateString()}</p></div>
          <StatusBadge status={student.status} />
        </header>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,.75fr)]">
          <div className="space-y-4">
            <section className="rounded-xl border border-line bg-white p-5">
              <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Student details</h2>{canWrite && <button className="text-sm font-medium text-accent" onClick={startEdit}>Edit</button>}</div>
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <Info label="Date of birth" value={student.dateOfBirth} /><Info label="Gender" value={student.gender} /><Info label="Address" value={student.address} wide />
              </dl>
              {student.medicalNotes && <div className="mt-5 rounded-lg border border-[#f0dfc2] bg-[#fffaf0] p-4"><p className="text-xs font-semibold uppercase tracking-wide text-[#8b642b]">Health and safety notes</p><p className="mt-2 whitespace-pre-wrap text-sm">{student.medicalNotes}</p></div>}
            </section>
            <section className="rounded-xl border border-line bg-white p-5">
              <div className="mb-4"><h2 className="font-semibold">Enrollments</h2><p className="mt-1 text-sm text-muted">Training groups and enrollment history.</p></div>
              {student.enrollments.length ? <div className="divide-y divide-line">{student.enrollments.map((enrollment) => <div key={enrollment.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div><p className="font-medium">{enrollment.batchName}</p><p className="mt-1 text-sm text-muted">{enrollment.programName} · {label[enrollment.status as StudentStatus] ?? enrollment.status}</p></div>{canWrite && enrollment.status === "active" && <select aria-label={`Manage ${enrollment.batchName}`} className={`${selectClass} w-auto min-w-36`} value="" disabled={saving} onChange={(event) => { if (event.target.value) void setEnrollment(enrollment.id, event.target.value as "completed" | "suspended" | "withdrawn"); }}><option value="">Manage enrollment</option><option value="completed">Complete</option><option value="suspended">Suspend</option><option value="withdrawn">Withdraw</option></select>}</div>)}</div> : <p className="rounded-lg bg-[#f7f9f8] p-4 text-sm text-muted">No enrollment history yet.</p>}
              {canWrite && student.status === "active" && <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4"><select className={`${selectClass} min-w-[220px] flex-1`} value={enrollmentBatchId} onChange={(event) => setEnrollmentBatchId(event.target.value)}><option value="">Choose a batch</option>{(catalog?.batches ?? []).filter((batch) => batch.isActive).map((batch) => <option key={batch.id} value={batch.id}>{batch.name} · {batch.programName}</option>)}</select><Button variant="outline" disabled={!enrollmentBatchId || saving} onClick={() => void addBatch()}>Add enrollment</Button></div>}
            </section>
          </div>
          <div className="space-y-4">
            <section className="rounded-xl border border-[#dcebe6] bg-[#f5faf8] p-5"><h2 className="font-semibold text-accent">Emergency contact</h2>{student.emergencyContactName ? <div className="mt-3"><p className="font-medium">{student.emergencyContactName}</p><p className="mt-1 text-sm text-muted">{student.emergencyContactRelationship}{student.emergencyContactPhone ? ` · ${student.emergencyContactPhone}` : ""}</p></div> : <p className="mt-2 text-sm text-muted">No emergency contact on file. Add one to keep this student’s safety details complete.</p>}{canWrite && <button className="mt-3 text-sm font-semibold text-accent" onClick={startEdit}>{student.emergencyContactName ? "Edit contact" : "Add emergency contact"}</button>}</section>
            <section className="rounded-xl border border-line bg-white p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">Parents & guardians</h2><p className="mt-1 text-sm text-muted">{student.guardians.length} family contact{student.guardians.length === 1 ? "" : "s"}</p></div>{canWrite && <Button size="sm" variant="outline" onClick={() => { setGuardianId(null); setAddingGuardian(true); setGuardianForm({ name: "", relationship: "Parent", email: "", phone: "" }); }}>+ Add contact</Button>}</div>
              <div className="mt-4 space-y-3">{student.guardians.map((guardian) => <article key={guardian.id} className="rounded-lg border border-line p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-medium">{guardian.name} <span className="font-normal text-muted">· {guardian.relationship}</span></h3><p className="mt-1 text-sm text-muted">{guardian.email || "No email"}{guardian.phone ? ` · ${guardian.phone}` : ""}</p><p className="mt-1 text-xs text-muted">{guardian.hasAccount ? "Parent account linked" : `Invite: ${guardian.inviteStatus?.replace("_", " ") ?? "not sent"}`}</p></div>{canWrite && <div className="flex gap-2"><button className="text-sm font-medium text-accent" onClick={() => { setGuardianId(guardian.id); setGuardianForm({ name: guardian.name, relationship: guardian.relationship, email: guardian.email ?? "", phone: guardian.phone ?? "" }); }}>Edit</button>{!guardian.hasAccount && guardian.email && <button disabled={saving} className="text-sm font-medium text-accent disabled:opacity-50" onClick={() => void handleInvite(guardian.id, guardian.inviteStatus === "pending")}>{guardian.inviteStatus === "pending" ? "Revoke invite" : "Create invite"}</button>}</div>}</div></article>)}{student.guardians.length === 0 && <p className="rounded-lg bg-[#f7f9f8] p-4 text-sm text-muted">No parent or guardian linked yet.</p>}</div>
              {canWrite && (guardianId !== null || addingGuardian || student.guardians.length === 0) && <form onSubmit={(event) => void saveGuardian(event)} className="mt-4 grid gap-2 border-t border-line pt-4 sm:grid-cols-2"><p className="sm:col-span-2 text-sm font-semibold">{guardianId ? "Edit family contact" : "Add family contact"}</p><Input aria-label="Contact name" placeholder="Name" required value={guardianForm.name} onChange={(event) => setGuardianForm({ ...guardianForm, name: event.target.value })} /><Input aria-label="Relationship" placeholder="Relationship" required value={guardianForm.relationship} onChange={(event) => setGuardianForm({ ...guardianForm, relationship: event.target.value })} /><Input aria-label="Contact email" type="email" placeholder="Email" disabled={Boolean(guardianId && student.guardians.find((guardian) => guardian.id === guardianId)?.hasAccount)} value={guardianForm.email} onChange={(event) => setGuardianForm({ ...guardianForm, email: event.target.value })} /><Input aria-label="Contact phone" placeholder="Phone" value={guardianForm.phone} onChange={(event) => setGuardianForm({ ...guardianForm, phone: event.target.value })} /><div className="flex gap-2 sm:col-span-2"><Button disabled={saving}>{guardianId ? "Save contact" : "Add contact"}</Button><Button type="button" variant="outline" onClick={() => { setGuardianId(null); setAddingGuardian(false); }}>Cancel</Button></div></form>}
            </section>
          </div>
        </div>
      </>}
      {editOpen && student && <div className="fixed inset-0 z-50 grid place-items-center bg-[#142221]/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="edit-student-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"><div className="mb-5 flex items-center justify-between"><h2 id="edit-student-title" className="text-lg font-semibold">Edit student profile</h2><button aria-label="Close" onClick={() => setEditOpen(false)}>×</button></div><form onSubmit={(event) => void saveProfile(event)} className="grid gap-4 sm:grid-cols-2">{([['First name','firstName'],['Last name','lastName'],['Date of birth','dateOfBirth'],['Gender','gender'],['Emergency contact name','emergencyContactName'],['Relationship','emergencyContactRelationship'],['Emergency phone','emergencyContactPhone']] as const).map(([title, key]) => <label key={key} className="space-y-1 text-xs font-medium text-muted">{title}<Input className={fieldClass} type={key === "dateOfBirth" ? "date" : "text"} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></label>)}<label className="space-y-1 text-xs font-medium text-muted">Status<select className={selectClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as StudentStatus })}>{statuses.map((status) => <option key={status} value={status}>{label[status]}</option>)}</select></label><label className="space-y-1 text-xs font-medium text-muted sm:col-span-2">Address<textarea className="min-h-20 w-full rounded-lg border border-line p-3 text-sm" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></label><label className="space-y-1 text-xs font-medium text-muted sm:col-span-2">Health and safety notes<textarea className="min-h-24 w-full rounded-lg border border-line p-3 text-sm" value={form.medicalNotes} onChange={(event) => setForm({ ...form, medicalNotes: event.target.value })} /></label><div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button><Button disabled={saving}>{saving ? "Saving…" : "Save profile"}</Button></div></form></section></div>}
    </main>
  );
}

function Info({ label, value, wide = false }: { label: string; value?: string | null | undefined; wide?: boolean }) {
  return <div className={wide ? "sm:col-span-2" : ""}><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 whitespace-pre-wrap text-sm">{value || "Not added"}</dd></div>;
}
