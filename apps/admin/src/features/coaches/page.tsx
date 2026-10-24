"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import type { AcademyCatalog, Coach } from "@sportdesk/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout/page-header";
import { getAcademyCatalog } from "@/lib/academy-api";
import { ApiRequestError } from "@/lib/auth-api";
import { createCoach, getCoaches } from "@/lib/operations-api";
import { useAuth } from "@/hooks/use-auth";

const field = "h-10 w-full rounded-lg border border-line bg-white px-3 text-sm";
const inputLabel = "space-y-1.5 text-xs font-medium text-muted";
const blankForm = { displayName: "", email: "", password: "", phone: "", dateOfBirth: "", address: "", emergencyContactName: "", emergencyContactPhone: "", qualifications: "", yearsExperience: "", joinedOn: "", specializations: "" };

export default function CoachesPage() {
  const { accessToken, refreshSession, user } = useAuth();
  const canManage = user?.role === "owner" || user?.permissions?.includes("coaches:write") === true;
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [catalog, setCatalog] = useState<AcademyCatalog | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load(token: string) {
    const [coachResult, catalogResult] = await Promise.all([getCoaches(token, refreshSession), getAcademyCatalog(token, refreshSession)]);
    setCoaches(coachResult.coaches);
    setCatalog(catalogResult);
  }
  useEffect(() => {
    if (!accessToken) return;
    load(accessToken).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not load coaches.")).finally(() => setLoading(false));
  }, [accessToken]);

  const filtered = useMemo(() => coaches.filter((coach) => {
    const query = search.trim().toLowerCase();
    const matches = !query || [coach.displayName, coach.email, coach.phone, ...coach.specializations].some((value) => value?.toLowerCase().includes(query));
    return matches && (status === "all" || coach.status === status);
  }), [coaches, search, status]);
  const activeCount = coaches.filter((coach) => coach.status === "active").length;
  const assignedCount = coaches.filter((coach) => coach.batchIds.length > 0).length;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      await createCoach(accessToken, refreshSession, {
        displayName: form.displayName, email: form.email, password: form.password,
        phone: form.phone || undefined, dateOfBirth: form.dateOfBirth || undefined, address: form.address || undefined,
        emergencyContactName: form.emergencyContactName || undefined, emergencyContactPhone: form.emergencyContactPhone || undefined,
        qualifications: form.qualifications.split(",").map((value) => value.trim()).filter(Boolean),
        yearsExperience: form.yearsExperience ? Number(form.yearsExperience) : null,
        joinedOn: form.joinedOn || undefined,
        specializations: form.specializations.split(",").map((value) => value.trim()).filter(Boolean),
      });
      setForm(blankForm); setCreateOpen(false); await load(accessToken); setNotice("Coach profile created.");
    } catch (caught) { setError(caught instanceof ApiRequestError ? caught.message : "Could not create coach."); }
    finally { setBusy(false); }
  }

  return <div className="sd-page">
    <PageHeader eyebrow="People · team directory" title="Coaches" description="Coach accounts, academy credentials, assigned batches, schedules and student progress." actions={canManage ? <Button onClick={() => setCreateOpen(true)}>＋ Add coach</Button> : null} />
    {error && <div role="alert" className="mb-4 rounded-xl border border-[#f1d8d2] bg-[#fff7f5] px-4 py-3 text-sm text-[#984d3f]">{error}</div>}
    {notice && <div role="status" className="mb-4 rounded-xl border border-[#cce3dd] bg-[#eff8f5] px-4 py-3 text-sm text-accent">{notice}</div>}
    <section className="mb-4 grid gap-3 sm:grid-cols-3">
      {[{ label: "Coach accounts", value: coaches.length }, { label: "Active", value: activeCount }, { label: "Assigned to batches", value: assignedCount }].map((item) => <article key={item.label} className="rounded-xl border border-line bg-white px-4 py-3"><p className="text-xs text-muted">{item.label}</p><p className="mt-1 text-xl font-semibold">{loading ? "—" : item.value}</p></article>)}
    </section>
    <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm flex flex-col max-h-[calc(100vh-230px)]">
      <div className="shrink-0 flex flex-wrap items-center gap-3 border-b border-line p-3.5 bg-white">
        <Input className="h-9 min-w-[220px] flex-1 text-xs" aria-label="Search coaches" placeholder="Search name, email or specialization" value={search} onChange={(event) => setSearch(event.target.value)} />
        <select aria-label="Filter by coach status" className="h-9 rounded-xl border border-line bg-white px-3 text-xs w-full sm:w-44" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All coaches</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
        <span className="text-xs text-muted font-medium">{filtered.length} of {coaches.length} coaches</span>
      </div>
      <div className="overflow-auto flex-1"><table className="w-full min-w-[720px] text-left text-sm"><thead className="sticky top-0 z-10 bg-[#f6f8f7] text-[11px] uppercase tracking-wide text-muted shadow-xs"><tr><th className="px-5 py-3 font-semibold">Coach</th><th className="px-4 py-3 font-semibold">Specializations</th><th className="px-4 py-3 font-semibold">Batches</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-5 py-3" /></tr></thead><tbody className="divide-y divide-line">
        {loading && (
          <tr>
            <td colSpan={5} className="px-5 py-12 text-center text-xs text-muted">
              Loading coaches…
            </td>
          </tr>
        )}
        {!loading && filtered.map((coach) => <tr key={coach.id} className="hover:bg-[#f7faf8]"><td className="px-5 py-3.5"><Link href={`/coaches/${coach.id}`} className="font-semibold text-ink hover:text-accent hover:underline">{coach.displayName}</Link><p className="mt-0.5 text-xs text-muted">{coach.email}{coach.phone ? ` · ${coach.phone}` : ""}</p></td><td className="px-4 py-3.5 text-xs text-muted">{coach.specializations.join(", ") || "Not added"}</td><td className="px-4 py-3.5 text-xs text-muted">{coach.batchIds.length ? coach.batchIds.map((id) => catalog?.batches.find((batch) => batch.id === id)?.name).filter(Boolean).join(", ") : "No assignments"}</td><td className="px-4 py-3.5"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${coach.status === "active" ? "bg-[#e9f4ee] text-[#458268]" : "bg-[#f0f1ef] text-[#68736e]"}`}>{coach.status === "active" ? "Active" : "Inactive"}</span></td><td className="px-5 py-3.5 text-right"><Link className="text-xs font-semibold text-accent hover:underline" href={`/coaches/${coach.id}`}>View profile →</Link></td></tr>)}
        {!loading && filtered.length === 0 && <tr><td colSpan={5} className="px-5 py-16 text-center"><p className="font-medium">{coaches.length ? "No coaches match these filters" : "No coach profiles yet"}</p><p className="mt-1 text-sm text-muted">{coaches.length ? "Try a different search or status." : "Add a coach to build your academy team directory."}</p></td></tr>}
        </tbody></table></div>
      <div className="shrink-0 border-t border-line px-5 py-2.5 text-xs text-muted bg-[#fafafa]">Class schedules, coach check-ins and attendance are available from each coach profile.</div>
    </section>
    {createOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-[#142221]/40 p-3" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setCreateOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="create-coach-title" className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6"><div className="mb-5 flex items-start justify-between"><div><p className="sd-eyebrow">Team directory</p><h2 id="create-coach-title" className="mt-1 text-xl font-semibold">Add coach</h2><p className="mt-1 text-sm text-muted">Create sign-in access and save the coach profile.</p></div><button aria-label="Close" className="text-xl text-muted" onClick={() => setCreateOpen(false)}>×</button></div><form onSubmit={(event) => void submit(event)} className="grid gap-4 sm:grid-cols-2">
      {([["Full name", "displayName", "text"], ["Email", "email", "email"], ["Temporary password (14+ characters)", "password", "password"], ["Phone", "phone", "tel"], ["Date of birth", "dateOfBirth", "date"], ["Joined on", "joinedOn", "date"], ["Emergency contact name", "emergencyContactName", "text"], ["Emergency contact phone", "emergencyContactPhone", "tel"], ["Years of experience", "yearsExperience", "number"]] as const).map(([label, key, type]) => <label key={key} className={inputLabel}>{label}<Input className={field} type={type} min={type === "number" ? 0 : undefined} minLength={key === "password" ? 14 : undefined} required={["displayName", "email", "password"].includes(key)} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></label>)}
      <label className={`${inputLabel} sm:col-span-2`}>Address<textarea className="min-h-16 w-full rounded-lg border border-line p-3 text-sm" maxLength={500} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></label>
      <label className={`${inputLabel} sm:col-span-2`}>Qualifications <span className="font-normal">(comma separated)</span><Input className={field} placeholder="First aid, National coaching certificate" value={form.qualifications} onChange={(event) => setForm({ ...form, qualifications: event.target.value })} /></label>
      <label className={`${inputLabel} sm:col-span-2`}>Specializations <span className="font-normal">(comma separated)</span><Input className={field} placeholder="Wushu, conditioning" value={form.specializations} onChange={(event) => setForm({ ...form, specializations: event.target.value })} /></label>
      <div className="flex justify-end gap-2 border-t border-line pt-4 sm:col-span-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setCreateOpen(false)}>Cancel</Button><Button disabled={busy}>{busy ? "Creating…" : "Create coach"}</Button></div>
    </form></section></div>}
  </div>;
}
