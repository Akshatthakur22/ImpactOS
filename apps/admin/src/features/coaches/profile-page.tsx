"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { AcademyCatalog, Coach, CoachProfileDetail } from "@sportdesk/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { getAcademyCatalog } from "@/lib/academy-api";
import { assignCoach, deleteCoach, getCoach, unassignCoach, updateCoach } from "@/lib/operations-api";

const field = "h-10 w-full rounded-lg border border-line bg-white px-3 text-sm";
const labelClass = "space-y-1.5 text-xs font-medium text-muted";
const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
type Form = { displayName: string; email: string; phone: string; dateOfBirth: string; address: string; emergencyContactName: string; emergencyContactPhone: string; qualifications: string; yearsExperience: string; joinedOn: string; specializations: string; status: Coach["status"] };

export default function CoachProfilePage({ coachId }: { coachId: string }) {
  const router = useRouter();
  const { accessToken, refreshSession, user } = useAuth();
  const canWrite = user?.role === "owner" || user?.permissions?.includes("coaches:write") === true;
  const [detail, setDetail] = useState<CoachProfileDetail | null>(null);
  const [catalog, setCatalog] = useState<AcademyCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "schedule" | "activity" | "account">("overview");
  const [batchId, setBatchId] = useState("");
  const [form, setForm] = useState<Form>({ displayName: "", email: "", phone: "", dateOfBirth: "", address: "", emergencyContactName: "", emergencyContactPhone: "", qualifications: "", yearsExperience: "", joinedOn: "", specializations: "", status: "active" });

  const load = useCallback(async (token: string) => {
    const [record, batches] = await Promise.all([getCoach(token, refreshSession, coachId), canWrite ? getAcademyCatalog(token, refreshSession) : Promise.resolve(null)]);
    setDetail(record); setCatalog(batches); setError(null);
  }, [canWrite, coachId, refreshSession]);
  useEffect(() => {
    if (!accessToken) return;
    let alive = true; setLoading(true);
    load(accessToken).catch((caught: unknown) => { if (alive) setError(caught instanceof Error ? caught.message : "Could not load this coach."); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [accessToken, load]);

  function startEdit() {
    if (!detail) return;
    const coach = detail.coach;
    setForm({ displayName: coach.displayName, email: coach.email, phone: coach.phone ?? "", dateOfBirth: coach.dateOfBirth ?? "", address: coach.address ?? "", emergencyContactName: coach.emergencyContactName ?? "", emergencyContactPhone: coach.emergencyContactPhone ?? "", qualifications: coach.qualifications.join(", "), yearsExperience: coach.yearsExperience == null ? "" : String(coach.yearsExperience), joinedOn: coach.joinedOn ?? "", specializations: coach.specializations.join(", "), status: coach.status });
    setEditOpen(true);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!accessToken || !detail) return;
    setSaving(true); setError(null);
    try {
      await updateCoach(accessToken, refreshSession, detail.coach.id, { displayName: form.displayName, email: form.email, phone: form.phone || null, dateOfBirth: form.dateOfBirth || null, address: form.address || null, emergencyContactName: form.emergencyContactName || null, emergencyContactPhone: form.emergencyContactPhone || null, qualifications: form.qualifications.split(",").map((x) => x.trim()).filter(Boolean), yearsExperience: form.yearsExperience ? Number(form.yearsExperience) : null, joinedOn: form.joinedOn || null, specializations: form.specializations.split(",").map((x) => x.trim()).filter(Boolean), status: form.status });
      setEditOpen(false); setNotice("Coach profile updated."); await load(accessToken);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not update coach profile."); }
    finally { setSaving(false); }
  }
  async function assign() {
    if (!accessToken || !detail || !batchId) return;
    setSaving(true); setError(null);
    try { await assignCoach(accessToken, refreshSession, batchId, detail.coach.id); setBatchId(""); setNotice("Coach assigned to batch."); await load(accessToken); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not assign coach."); }
    finally { setSaving(false); }
  }
  async function unassign(targetBatchId: string, batchName: string) {
    if (!accessToken || !detail || !window.confirm(`Remove ${detail.coach.displayName} from ${batchName}?`)) return;
    setSaving(true); setError(null);
    try { await unassignCoach(accessToken, refreshSession, targetBatchId, detail.coach.id); setNotice(`Coach removed from ${batchName}.`); await load(accessToken); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not remove this batch assignment."); }
    finally { setSaving(false); }
  }
  async function remove() {
    if (!accessToken || !detail || !window.confirm(`Permanently delete ${detail.coach.displayName}'s account? This is allowed only when the coach has no batch assignments or recorded history.`)) return;
    setSaving(true); setError(null);
    try { await deleteCoach(accessToken, refreshSession, detail.coach.id); router.replace("/coaches"); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not delete this coach."); }
    finally { setSaving(false); }
  }
  async function copyId() {
    if (!detail) return;
    try { await navigator.clipboard.writeText(detail.coach.id); setNotice("Coach profile ID copied."); }
    catch { setNotice(`Coach profile ID: ${detail.coach.id}`); }
  }

  if (loading) return <main className="sd-page"><p className="rounded-xl border border-line bg-white p-6 text-sm text-muted">Loading coach profile…</p></main>;
  if (!detail) return <main className="sd-page"><Link href="/coaches" className="text-sm font-medium text-accent hover:underline">← All coaches</Link>{error && <div role="alert" className="mt-4 rounded-lg border border-[#f1d8d2] bg-[#fff7f5] p-4 text-sm text-[#984d3f]">{error}</div>}<section className="mt-4 rounded-xl border border-line bg-white p-6"><h1 className="text-xl font-semibold">Coach not found</h1><p className="mt-1 text-sm text-muted">This profile may have been removed or you may not have access to it.</p></section></main>;

  const coach = detail.coach;
  const assignedIds = new Set(detail.assignedBatches.map((batch) => batch.id));
  const availableBatches = (catalog?.batches ?? []).filter((batch) => batch.isActive && !assignedIds.has(batch.id));
  const initials = coach.displayName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "schedule", label: `Schedule · ${detail.schedules.length}` },
    { id: "activity", label: `Activity · ${detail.stats.classesCheckedIn + detail.stats.progressEntries}` },
    { id: "account", label: "Account" },
  ] as const;
  return <main className="sd-page mx-auto w-full max-w-[1500px] px-4 py-3 sm:px-6 lg:px-8">
    <div className="mb-3 flex items-center justify-between gap-3"><Link href="/coaches" className="text-sm font-medium text-accent hover:underline">← Coach directory</Link>{canWrite && <Button variant="outline" size="sm" onClick={startEdit}>Edit profile</Button>}</div>
    {(error || notice) && <div role={error ? "alert" : "status"} className={`mb-3 rounded-lg border px-4 py-2.5 text-sm ${error ? "border-[#f1d8d2] bg-[#fff7f5] text-[#984d3f]" : "border-[#cce3dd] bg-[#eff8f5] text-accent"}`}>{error ?? notice}<button className="float-right px-1" aria-label="Dismiss message" onClick={() => { setError(null); setNotice(null); }}>×</button></div>}
    <header className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 sm:px-5"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#e8f2ef] text-sm font-semibold text-accent">{initials}</span><div className="min-w-0 flex-1"><h1 className="truncate text-xl font-semibold tracking-tight">{coach.displayName}</h1><p className="truncate text-sm text-muted">{coach.email}{coach.phone ? ` · ${coach.phone}` : ""}</p></div><button onClick={() => void copyId()} className="hidden text-xs text-muted hover:text-accent lg:block" title={coach.id}>Profile ID · {coach.id.slice(0, 8)}… ⧉</button><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${coach.status === "active" ? "bg-[#e9f4ee] text-[#458268]" : "bg-[#f0f1ef] text-[#68736e]"}`}>{coach.status === "active" ? "Active" : "Inactive"}</span></header>
    <section className="mb-3 grid grid-cols-3 gap-2 sm:gap-3">{[{ label: "Class check-ins", value: detail.stats.classesCheckedIn }, { label: "Attendance marks", value: detail.stats.attendanceMarks }, { label: "Progress entries", value: detail.stats.progressEntries }].map((item) => <article key={item.label} className="rounded-xl border border-line bg-white px-3 py-2.5 sm:px-4"><p className="text-[11px] text-muted sm:text-xs">{item.label}</p><p className="mt-0.5 text-lg font-semibold sm:text-xl">{item.value}</p></article>)}</section>
    <nav aria-label="Coach profile sections" className="mb-3 flex gap-1 overflow-x-auto rounded-xl border border-line bg-white p-1">{tabs.map((tab) => <button key={tab.id} aria-current={activeTab === tab.id ? "page" : undefined} onClick={() => setActiveTab(tab.id)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${activeTab === tab.id ? "bg-[#eaf3f0] text-accent" : "text-muted hover:bg-[#f6f8f7] hover:text-ink"}`}>{tab.label}</button>)}</nav>
    {activeTab === "overview" && <div className="grid gap-3 xl:grid-cols-[1.05fr_.95fr]">
      <section className="rounded-xl border border-line bg-white p-4 sm:p-5"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold">Profile information</h2><p className="mt-1 text-xs text-muted">Contact, qualifications and academy role</p></div>{canWrite && <button className="text-sm font-medium text-accent" onClick={startEdit}>Edit</button>}</div><dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2"><Info label="Phone" value={coach.phone}/><Info label="Joined academy" value={coach.joinedOn}/><Info label="Date of birth" value={coach.dateOfBirth}/><Info label="Experience" value={coach.yearsExperience == null ? null : `${coach.yearsExperience} years`}/><Info label="Qualifications" value={coach.qualifications.join(", ") || null}/><Info label="Specializations" value={coach.specializations.join(", ") || null}/><Info label="Address" value={coach.address} wide/></dl><div className="mt-4 rounded-lg border border-[#dcebe6] bg-[#f5faf8] p-3"><p className="text-xs font-semibold uppercase tracking-wide text-accent">Emergency contact</p><p className="mt-1 text-sm">{coach.emergencyContactName || "No contact added"}{coach.emergencyContactPhone ? ` · ${coach.emergencyContactPhone}` : ""}</p>{canWrite && <button className="mt-1 text-xs font-semibold text-accent" onClick={startEdit}>{coach.emergencyContactName ? "Edit contact" : "Add contact"}</button>}</div></section>
      <section className="rounded-xl border border-line bg-white p-4 sm:p-5"><div className="mb-3 flex items-start justify-between"><div><h2 className="font-semibold">Batch assignments</h2><p className="mt-1 text-xs text-muted">Programs and groups coached</p></div><span className="rounded-full bg-[#f3f6f4] px-2 py-1 text-xs text-muted">{detail.assignedBatches.length}</span></div>{detail.assignedBatches.length ? <div className="divide-y divide-line">{detail.assignedBatches.map((batch) => <div key={batch.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-1"><div><p className="text-sm font-medium">{batch.name}</p><p className="mt-0.5 text-xs text-muted">{batch.programName} · {batch.disciplineName}</p></div>{canWrite && <button disabled={saving} className="text-xs font-medium text-[#9b5144] disabled:opacity-50" onClick={() => void unassign(batch.id, batch.name)}>Remove</button>}</div>)}</div> : <p className="rounded-lg bg-[#f7f9f8] p-3 text-sm text-muted">No batch assignments yet.</p>}{canWrite && coach.status === "active" && <div className="mt-3 flex gap-2 border-t border-line pt-3"><select aria-label="Choose batch to assign" className={`${field} min-w-0 flex-1`} value={batchId} onChange={(event) => setBatchId(event.target.value)}><option value="">Assign to a batch…</option>{availableBatches.map((batch) => <option key={batch.id} value={batch.id}>{batch.name} · {batch.programName}</option>)}</select><Button variant="outline" size="sm" disabled={!batchId || saving} onClick={() => void assign()}>Assign</Button></div>}</section>
    </div>}
    {activeTab === "schedule" && <section className="rounded-xl border border-line bg-white p-4 sm:p-5"><div className="mb-4"><h2 className="font-semibold">Weekly class schedule</h2><p className="mt-1 text-sm text-muted">Active times across this coach’s assigned batches.</p></div>{detail.schedules.length ? <div className="grid gap-2 md:grid-cols-2">{detail.schedules.map((schedule) => <article key={schedule.id} className="flex items-center gap-3 rounded-lg border border-line p-3"><span className="grid h-10 w-12 shrink-0 place-items-center rounded-lg bg-[#f2f7f5] text-xs font-semibold text-accent">{days[schedule.dayOfWeek]?.slice(0, 3) ?? "—"}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{schedule.batchName}</p><p className="mt-0.5 truncate text-xs text-muted">{schedule.branchName || "Branch not set"}</p></div><p className="whitespace-nowrap text-xs font-medium tabular-nums">{schedule.startTime.slice(0, 5)}–{schedule.endTime.slice(0, 5)}</p></article>)}</div> : <Empty title="No active schedule" description="Add an active schedule to one of the coach’s assigned batches."/>}</section>}
    {activeTab === "activity" && <div className="grid gap-3 xl:grid-cols-2"><section className="rounded-xl border border-line bg-white p-4 sm:p-5"><div className="mb-3"><h2 className="font-semibold">Class check-ins</h2><p className="mt-1 text-xs text-muted">Recent classes with a recorded check-in</p></div>{detail.recentSessions.length ? <div className="divide-y divide-line">{detail.recentSessions.map((session) => <article key={session.id} className="py-3 first:pt-0"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{session.batchName}</p><time className="text-xs text-muted">{new Date(session.startsAt).toLocaleString()}</time></div><p className="mt-1 text-xs text-muted">In {new Date(session.checkedInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{session.checkedOutAt ? ` · Out ${new Date(session.checkedOutAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : " · No check-out"}</p></article>)}</div> : <Empty title="No class check-ins" description="Coach check-in history will appear here."/>}</section><section className="rounded-xl border border-line bg-white p-4 sm:p-5"><div className="mb-3"><h2 className="font-semibold">Student progress entered</h2><p className="mt-1 text-xs text-muted">Recent progress records authored by this coach</p></div>{detail.recentProgress.length ? <div className="divide-y divide-line">{detail.recentProgress.map((entry) => <article key={entry.id} className="py-3 first:pt-0"><div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-medium">{entry.studentName}</p><time className="text-xs text-muted">{new Date(entry.createdAt).toLocaleDateString()}</time></div><p className="mt-1 text-xs text-muted">{entry.assessmentName}{entry.value ? ` · ${entry.value}` : ""} · {entry.batchName}</p>{entry.coachNote && <p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-muted">{entry.coachNote}</p>}</article>)}</div> : <Empty title="No progress entries" description="Progress records authored by this coach will appear here."/>}</section></div>}
    {activeTab === "account" && <div className="max-w-3xl space-y-3"><section className="rounded-xl border border-line bg-white p-4 sm:p-5"><h2 className="font-semibold">Sign-in account</h2><dl className="mt-4 grid gap-4 sm:grid-cols-2"><Info label="Account email" value={coach.email}/><Info label="Account status" value={coach.status === "active" ? "Active · can sign in" : "Inactive · sign-in blocked"}/><div className="sm:col-span-2"><dt className="text-xs text-muted">Coach profile ID</dt><dd className="mt-1 flex flex-wrap items-center gap-2 text-sm"><code className="break-all">{coach.id}</code><button className="font-medium text-accent" onClick={() => void copyId()}>Copy</button></dd></div></dl><div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">{canWrite && <><Button variant="outline" onClick={() => { startEdit(); setForm((current) => ({ ...current, status: coach.status === "active" ? "inactive" : "active" })); }}>{coach.status === "active" ? "Deactivate account" : "Activate account"}</Button><Button variant="outline" onClick={startEdit}>Edit account details</Button></>}</div><p className="mt-3 text-xs leading-5 text-muted">Deactivation blocks sign-in and revokes current sessions while retaining coach assignments and academy history.</p></section>{canWrite && <section className="rounded-xl border border-[#f0dfdc] bg-white p-4 sm:p-5"><h2 className="font-semibold">Delete coach account</h2><p className="mt-1 text-sm text-muted">Permanent deletion is available only when there are no batch assignments or recorded academy history. Deactivate the account to retain its records.</p><Button className="mt-3" variant="outline" disabled={saving} onClick={() => void remove()}>Delete coach</Button></section>}</div>}
    {editOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-[#142221]/40 p-3" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setEditOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="edit-coach-title" className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6"><div className="mb-5 flex items-center justify-between"><div><p className="sd-eyebrow">Team directory</p><h2 id="edit-coach-title" className="mt-1 text-lg font-semibold">Edit coach profile</h2></div><button aria-label="Close" onClick={() => setEditOpen(false)}>×</button></div><form onSubmit={(event) => void save(event)} className="grid gap-4 sm:grid-cols-2">
      {([["Full name", "displayName", "text"], ["Email / sign-in", "email", "email"], ["Phone", "phone", "tel"], ["Date of birth", "dateOfBirth", "date"], ["Joined on", "joinedOn", "date"], ["Emergency contact name", "emergencyContactName", "text"], ["Emergency contact phone", "emergencyContactPhone", "tel"], ["Years of experience", "yearsExperience", "number"]] as const).map(([title, key, type]) => <label key={key} className={labelClass}>{title}<Input className={field} type={type} min={type === "number" ? 0 : undefined} required={key === "displayName" || key === "email"} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })}/></label>)}
      <label className={labelClass}>Account status<select className={field} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Coach["status"] })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
      <label className={`${labelClass} sm:col-span-2`}>Address<textarea className="min-h-16 w-full rounded-lg border border-line p-3 text-sm" maxLength={500} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })}/></label>
      <label className={`${labelClass} sm:col-span-2`}>Qualifications <span className="font-normal">(comma separated)</span><Input className={field} value={form.qualifications} onChange={(event) => setForm({ ...form, qualifications: event.target.value })}/></label>
      <label className={`${labelClass} sm:col-span-2`}>Specializations <span className="font-normal">(comma separated)</span><Input className={field} value={form.specializations} onChange={(event) => setForm({ ...form, specializations: event.target.value })}/></label>
      <div className="flex justify-end gap-2 border-t border-line pt-4 sm:col-span-2"><Button type="button" variant="outline" disabled={saving} onClick={() => setEditOpen(false)}>Cancel</Button><Button disabled={saving}>{saving ? "Saving…" : "Save profile"}</Button></div>
    </form></section></div>}
  </main>;
}

function Empty({ title, description }: { title: string; description: string }) {
  return <div className="rounded-lg bg-[#f7f9f8] p-4"><p className="text-sm font-medium">{title}</p><p className="mt-1 text-sm text-muted">{description}</p></div>;
}

function Info({ label, value, wide = false }: { label: string; value?: string | null; wide?: boolean }) {
  return <div className={wide ? "sm:col-span-2" : ""}><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 whitespace-pre-wrap text-sm">{value || "Not added"}</dd></div>;
}
