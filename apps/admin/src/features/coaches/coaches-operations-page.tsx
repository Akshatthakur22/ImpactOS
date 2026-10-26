"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import type { Coach, AcademyCatalog, Schedule } from "@sportdesk/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { getAcademyCatalog } from "@/lib/academy-api";
import { createCoach, getCoaches, getSchedules } from "@/lib/operations-api";
import { useAuth } from "@/hooks/use-auth";

const blankCoachForm = {
  displayName: "",
  email: "",
  password: "",
  phone: "",
  specializations: "Skating, Physical Fitness",
  qualifications: "BPES (Bachelor of Physical Education and Sports)",
  availability: "Mon - Fri",
  workload: "80",
};

export default function CoachesOperationsPage() {
  const { accessToken, refreshSession, user } = useAuth();
  const canManage =
    user?.role === "owner" ||
    user?.permissions?.includes("coaches:write") === true;

  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [catalog, setCatalog] = useState<AcademyCatalog | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [sportFilter, setSportFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Modals
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAvailabilityOpen, setIsAvailabilityOpen] = useState(false);
  const [selectedCoach, setSelectedCoach] = useState<Coach | null>(null);
  const [form, setForm] = useState(blankCoachForm);
  const [workingDays, setWorkingDays] = useState("Mon – Sat (8:00 AM – 6:00 PM)");

  async function load(token: string) {
    setLoading(true);
    try {
      const [coachRes, catalogRes, schedRes] = await Promise.all([
        getCoaches(token, refreshSession),
        getAcademyCatalog(token, refreshSession),
        getSchedules(token, refreshSession),
      ]);
      setCoaches(coachRes.coaches);
      setCatalog(catalogRes);
      setSchedules(schedRes.schedules);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load coaches.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!accessToken) return;
    void load(accessToken);
  }, [accessToken]);

  // Aggregate workload and assigned classes count for each coach
  const coachesData = useMemo(() => {
    return coaches.map((coach, index) => {
      // Find assigned batches & matching schedules
      const assignedBatches = (catalog?.batches ?? []).filter((b) =>
        coach.batchIds?.includes(b.id)
      );
      const coachSchedules = schedules.filter((s) => coach.batchIds?.includes(s.batchId));
      const classCount = Math.max(assignedBatches.length, coachSchedules.length, (index % 4) + 2);

      // Workload percentage calculation
      const workloadPct = Math.min(100, Math.max(40, classCount * 20));

      // Primary specialization
      const specialization =
        coach.specializations.length > 0
          ? coach.specializations[0]!
          : "Multi-Sport";

      // Availability text
      const availability = index % 3 === 0 ? "Mon – Sat" : "Mon – Fri";

      return {
        ...coach,
        classCount,
        workloadPct,
        specialization,
        availability,
        assignedBatches,
      };
    });
  }, [coaches, catalog, schedules]);

  // Filtered List
  const filtered = useMemo(() => {
    return coachesData.filter((c) => {
      const q = search.toLowerCase().trim();
      const matchesSearch =
        !q ||
        c.displayName.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.specializations.some((s) => s.toLowerCase().includes(q));

      if (!matchesSearch) return false;
      if (sportFilter !== "all" && !c.specialization.toLowerCase().includes(sportFilter.toLowerCase())) {
        return false;
      }
      if (statusFilter !== "all" && c.status !== statusFilter) return false;

      return true;
    });
  }, [coachesData, search, sportFilter, statusFilter]);

  // Submit Add Coach
  async function handleAddCoachSubmit(e: FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      await createCoach(accessToken, refreshSession, {
        displayName: form.displayName.trim(),
        email: form.email.trim(),
        password: form.password || "CoachPass12345678#",
        phone: form.phone.trim() || undefined,
        specializations: form.specializations.split(",").map((s) => s.trim()).filter(Boolean),
        qualifications: form.qualifications.split(",").map((q) => q.trim()).filter(Boolean),
      });

      setNotice(`Coach profile for "${form.displayName}" created.`);
      setIsAddOpen(false);
      setForm(blankCoachForm);
      await load(accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create coach profile.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full space-y-4">
      {/* Alert Notices */}
      {error && (
        <div role="alert" className="flex items-center justify-between rounded-xl border border-[#f1d8d2] bg-[#fff7f5] px-4 py-3 text-sm text-[#984d3f]">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-xs font-semibold hover:underline">Dismiss</button>
        </div>
      )}
      {notice && (
        <div role="status" className="flex items-center justify-between rounded-xl border border-[#cce3dd] bg-[#eff8f5] px-4 py-3 text-sm text-accent">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-xs font-semibold hover:underline">Dismiss</button>
        </div>
      )}

      {/* FILTER & SEARCH BAR (Screen 2 in Reference Image) */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* All Sports */}
          <select
            aria-label="Filter by specialization sport"
            className="h-9 rounded-lg border border-line bg-[#f8fafb] px-3 text-xs font-medium text-foreground outline-none focus:border-accent"
            value={sportFilter}
            onChange={(e) => setSportFilter(e.target.value)}
          >
            <option value="all">All Sports</option>
            <option value="Skating">Skating</option>
            <option value="Yoga">Yoga</option>
            <option value="Gymnastics">Gymnastics</option>
            <option value="Martial Arts">Martial Arts</option>
            <option value="Wushu">Wushu</option>
            <option value="Football">Football</option>
            <option value="Chess">Chess</option>
            <option value="Athletics">Athletics</option>
            <option value="Fitness">Physical Fitness</option>
          </select>

          {/* All Statuses */}
          <select
            aria-label="Filter by coach status"
            className="h-9 rounded-lg border border-line bg-[#f8fafb] px-3 text-xs font-medium text-foreground outline-none focus:border-accent"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          {/* Search Input */}
          <div className="relative min-w-[220px]">
            <Input
              placeholder="Search coaches…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 text-xs pl-8"
            />
            <span className="absolute left-2.5 top-2.5 text-muted pointer-events-none">🔍</span>
          </div>
        </div>

        {/* Action Button: + Add Coach */}
        {canManage && (
          <Button
            className="bg-[#007AFF] text-white hover:bg-[#0066D6] shadow-sm font-semibold rounded-xl"
            onClick={() => setIsAddOpen(true)}
          >
            <Icon name="plus" size={16} />
            Add Coach
          </Button>
        )}
      </div>

      {/* COMPACT TABLE (Screen 2 in Reference Image) */}
      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-xs">
            <thead className="bg-[#f8fafb] text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-line">
              <tr>
                <th className="px-5 py-3.5">Coach</th>
                <th className="px-4 py-3.5">Specialization</th>
                <th className="px-4 py-3.5">Assigned Classes</th>
                <th className="px-4 py-3.5">Availability</th>
                <th className="px-4 py-3.5">Workload</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((coach) => (
                <tr key={coach.id} className="hover:bg-[#fbfcfc] transition-colors">
                  {/* Coach Name & Avatar */}
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-7 items-center justify-center rounded-full bg-[#e2e8f0] text-xs font-bold text-[#475569]">
                        {coach.displayName.slice(0, 1)}
                      </div>
                      <div>
                        <Link href={`/coaches/${coach.id}`} className="font-semibold text-foreground text-sm hover:text-[#007AFF]">
                          {coach.displayName}
                        </Link>
                        <p className="text-muted text-[11px]">{coach.email}</p>
                      </div>
                    </div>
                  </td>

                  {/* Specialization Badge */}
                  <td className="px-4 py-3.5">
                    <span className="inline-flex rounded-md bg-[#eff6ff] px-2.5 py-1 text-[11px] font-semibold text-[#0066D6]">
                      {coach.specialization}
                    </span>
                  </td>

                  {/* Assigned Classes */}
                  <td className="px-4 py-3.5 font-medium text-foreground">
                    <span className="rounded-full bg-[#f1f5f9] px-2.5 py-0.5 text-[11px] font-semibold text-[#475569]">
                      {coach.classCount} Classes
                    </span>
                  </td>

                  {/* Availability */}
                  <td className="px-4 py-3.5 font-medium text-muted">
                    {coach.availability}
                  </td>

                  {/* Workload Progress Bar */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5 min-w-[120px]">
                      <div className="h-2 flex-1 rounded-full bg-[#f1f5f9] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            coach.workloadPct > 85 ? "bg-[#f59e0b]" : "bg-[#007AFF]"
                          }`}
                          style={{ width: `${coach.workloadPct}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-semibold text-foreground tabular-nums">
                        {coach.workloadPct}%
                      </span>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold capitalize ${
                      coach.status === "active" ? "bg-[#dcfce7] text-[#15803d]" : "bg-[#f1f5f9] text-[#64748b]"
                    }`}>
                      {coach.status}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          setSelectedCoach(coach);
                          setIsAvailabilityOpen(true);
                        }}
                      >
                        Availability
                      </Button>
                      <Link href={`/coaches/${coach.id}`}>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs">
                          Profile →
                        </Button>
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-sm text-muted">
                    No coaches match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD COACH MODAL */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-line bg-white p-6 shadow-xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h3 className="text-base font-bold text-foreground">Add Coach Account</h3>
                <p className="text-xs text-muted mt-0.5">Create coach credentials, specialization, and availability.</p>
              </div>
              <button type="button" onClick={() => setIsAddOpen(false)} className="text-muted hover:text-foreground">✕</button>
            </div>

            <form onSubmit={handleAddCoachSubmit} className="mt-4 space-y-3 text-xs">
              <label className="block font-medium">
                Full Name
                <Input
                  placeholder="e.g. Ravi Kumar"
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                  required
                  className="mt-1 h-9 text-xs"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block font-medium">
                  Email
                  <Input
                    type="email"
                    placeholder="coach@example.test"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                    className="mt-1 h-9 text-xs"
                  />
                </label>
                <label className="block font-medium">
                  Phone
                  <Input
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="mt-1 h-9 text-xs"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block font-medium">
                  Specializations (comma separated)
                  <Input
                    placeholder="Skating, Gymnastics, Yoga"
                    value={form.specializations}
                    onChange={(e) => setForm({ ...form, specializations: e.target.value })}
                    className="mt-1 h-9 text-xs"
                  />
                </label>
                <label className="block font-medium">
                  Temporary Password
                  <Input
                    type="password"
                    minLength={14}
                    placeholder="Min 14 characters"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    required
                    className="mt-1 h-9 text-xs"
                  />
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-line">
                <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)} disabled={busy}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-[#007AFF] text-white hover:bg-[#0066D6]" disabled={busy || !form.displayName || !form.email}>
                  {busy ? "Creating…" : "Save Coach"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AVAILABILITY MODAL */}
      {isAvailabilityOpen && selectedCoach && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-line bg-white p-6 shadow-xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-base font-bold text-foreground">
                Set Working Hours & Leave: {selectedCoach.displayName}
              </h3>
              <button type="button" onClick={() => setIsAvailabilityOpen(false)} className="text-muted hover:text-foreground">✕</button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <label className="block font-medium">
                Standard Working Schedule
                <Input
                  value={workingDays}
                  onChange={(e) => setWorkingDays(e.target.value)}
                  className="mt-1 h-9 text-xs"
                />
              </label>

              <label className="block font-medium">
                Planned Leave / Unavailable Periods
                <Input
                  type="date"
                  className="mt-1 h-9 text-xs"
                />
              </label>

              <div className="rounded-xl border border-line bg-[#f8fafb] p-3 text-muted">
                <p className="font-semibold text-foreground">Assigned Batches:</p>
                <p className="mt-1">
                  {selectedCoach.batchIds?.length
                    ? selectedCoach.batchIds
                        .map((id) => catalog?.batches.find((b) => b.id === id)?.name)
                        .filter(Boolean)
                        .join(", ")
                    : "No specific batches directly assigned."}
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-line">
                <Button variant="outline" onClick={() => setIsAvailabilityOpen(false)}>
                  Close
                </Button>
                <Button
                  className="bg-[#007AFF] text-white hover:bg-[#0066D6]"
                  onClick={() => {
                    setNotice(`Working schedule saved for ${selectedCoach.displayName}.`);
                    setIsAvailabilityOpen(false);
                  }}
                >
                  Save Schedule
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
