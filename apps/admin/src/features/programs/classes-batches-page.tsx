"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { AcademyCatalog, Coach, Schedule, AcademyBranch } from "@sportdesk/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import {
  createBatch,
  createProgram,
  getAcademyCatalog,
  updateBatch,
} from "@/lib/academy-api";
import {
  assignCoach,
  createSchedule,
  generateSessions,
  getBranches,
  getCoaches,
  getSchedules,
  updateSchedule,
} from "@/lib/operations-api";
import { useAuth } from "@/hooks/use-auth";
import { academyDate } from "@/lib/academy-time";

type SportTheme = {
  bg: string;
  text: string;
};

const SPORT_COLORS: Record<string, SportTheme> = {
  cricket: { bg: "bg-[#eaf7ee] text-[#15803d]", text: "text-[#15803d]" },
  football: { bg: "bg-[#edf5ff] text-[#1d4ed8]", text: "text-[#1d4ed8]" },
  fitness: { bg: "bg-[#f5f0ff] text-[#7e22ce]", text: "text-[#7e22ce]" },
  yoga: { bg: "bg-[#fdf2f8] text-[#be185d]", text: "text-[#be185d]" },
  swimming: { bg: "bg-[#ecfeff] text-[#0e7490]", text: "text-[#0e7490]" },
  gymnastics: { bg: "bg-[#fff7ed] text-[#c2410c]", text: "text-[#c2410c]" },
  wushu: { bg: "bg-[#f0fdfa] text-[#0f766e]", text: "text-[#0f766e]" },
};

function getSportColor(sport: string) {
  const key = sport.toLowerCase();
  for (const [s, colors] of Object.entries(SPORT_COLORS)) {
    if (key.includes(s)) return colors;
  }
  return { bg: "bg-[#f1f5f9] text-[#475569]", text: "text-[#475569]" };
}

const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type ClassItem = {
  id: string; // batch id
  name: string; // batch name
  programId: string;
  programName: string;
  disciplineId: string;
  sportName: string;
  coachName: string;
  coachId?: string | undefined;
  enrolledCount: number;
  capacity: number | null;
  scheduleDays: string;
  scheduleTime: string;
  venue: string;
  isActive: boolean;
  scheduleId?: string | undefined;
};

export default function ClassesBatchesPage() {
  const { accessToken, refreshSession, user } = useAuth();
  const canManage =
    user?.role === "owner" ||
    user?.permissions?.includes("academy:manage") === true ||
    user?.permissions?.includes("schedules:write") === true;

  const [catalog, setCatalog] = useState<AcademyCatalog | null>(null);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [branches, setBranches] = useState<AcademyBranch[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [sportFilter, setSportFilter] = useState("all");
  const [coachFilter, setCoachFilter] = useState("all");
  const [facilityFilter, setFacilityFilter] = useState("all");

  // Modals
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ClassItem | null>(null);

  // Form State
  const [formClassName, setFormClassName] = useState("");
  const [formDisciplineId, setFormDisciplineId] = useState("");
  const [formBatchName, setFormBatchName] = useState("");
  const [formCoachId, setFormCoachId] = useState("");
  const [formCapacity, setFormCapacity] = useState("");
  const [formFacility, setFormFacility] = useState("Main Ground");
  const [formBranchId, setFormBranchId] = useState("");
  const [formDays, setFormDays] = useState<number[]>([1, 2, 3, 4, 5, 6]); // Mon-Sat
  const [formStartTime, setFormStartTime] = useState("08:00");
  const [formEndTime, setFormEndTime] = useState("09:30");

  async function load(token: string) {
    setLoading(true);
    try {
      const [catalogRes, coachRes, branchRes, scheduleRes] = await Promise.all([
        getAcademyCatalog(token, refreshSession),
        getCoaches(token, refreshSession),
        getBranches(token, refreshSession),
        getSchedules(token, refreshSession),
      ]);
      setCatalog(catalogRes);
      setCoaches(coachRes.coaches);
      setBranches(branchRes.branches);
      setSchedules(scheduleRes.schedules);

      if (catalogRes.disciplines.length > 0 && !formDisciplineId) {
        setFormDisciplineId(catalogRes.disciplines[0]?.id || "");
      }
      if (branchRes.branches.length > 0 && !formBranchId) {
        setFormBranchId(branchRes.branches[0]?.id || "");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load classes & batches.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!accessToken) return;
    void load(accessToken);
  }, [accessToken]);

  // Aggregate classes from batches and schedules
  const classList = useMemo<ClassItem[]>(() => {
    if (!catalog) return [];

    return catalog.batches.map((batch) => {
      // Find matching schedule
      const batchSchedules = schedules.filter((s) => s.batchId === batch.id);
      const activeSchedule = batchSchedules.find((s) => s.isActive) || batchSchedules[0];

      // Schedule Days summary
      let scheduleDays = "Mon – Sat";
      let scheduleTime = "8:00 – 9:30 AM";
      let venue = "Main Ground";

      if (batchSchedules.length > 0) {
        const daySet = Array.from(new Set(batchSchedules.map((s) => s.dayOfWeek))).sort();
        if (daySet.length === 6 && !daySet.includes(0)) {
          scheduleDays = "Mon – Sat";
        } else if (daySet.length === 7) {
          scheduleDays = "Everyday";
        } else if (daySet.length > 0) {
          scheduleDays = daySet.map((d) => DAYS_SHORT[d]).join(", ");
        }
        if (activeSchedule) {
          scheduleTime = `${activeSchedule.startTime} – ${activeSchedule.endTime}`;
          if (activeSchedule.venue) venue = activeSchedule.venue;
        }
      }

      // Coach assignment
      const coach = coaches.find((c) => c.batchIds?.includes(batch.id));
      const coachName = coach ? coach.displayName : coaches[0]?.displayName || "Coach Ravi";
      const prog = catalog.programs.find((p) => p.id === batch.programId);

      return {
        id: batch.id,
        name: batch.name,
        programId: batch.programId,
        programName: batch.programName,
        disciplineId: prog?.disciplineId || "",
        sportName: batch.disciplineName || "Sport",
        coachName,
        coachId: coach?.id,
        enrolledCount: batch.activeEnrollmentCount,
        capacity: batch.capacity,
        scheduleDays,
        scheduleTime,
        venue,
        isActive: batch.isActive,
        scheduleId: activeSchedule?.id,
      };
    });
  }, [catalog, schedules, coaches]);

  // Filtered List
  const filteredClasses = useMemo(() => {
    return classList.filter((item) => {
      const q = search.toLowerCase().trim();
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.programName.toLowerCase().includes(q) ||
        item.sportName.toLowerCase().includes(q) ||
        item.coachName.toLowerCase().includes(q) ||
        item.venue.toLowerCase().includes(q);

      if (!matchesSearch) return false;
      if (sportFilter !== "all" && item.sportName.toLowerCase() !== sportFilter.toLowerCase()) return false;
      if (coachFilter !== "all" && item.coachName !== coachFilter) return false;
      if (facilityFilter !== "all" && item.venue !== facilityFilter) return false;

      return true;
    });
  }, [classList, search, sportFilter, coachFilter, facilityFilter]);

  // Submit Add Class Workflow
  async function handleAddClassSubmit(e: FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      // 1. Create Program if custom, or find program
      let targetProgramId = catalog?.programs.find((p) => p.disciplineId === formDisciplineId)?.id;
      if (!targetProgramId) {
        const prog = await createProgram(accessToken, refreshSession, {
          name: formClassName.trim() || "Core Academy",
          disciplineId: formDisciplineId,
        });
        targetProgramId = prog.id;
      }

      // 2. Create Batch
      const batch = await createBatch(accessToken, refreshSession, {
        name: formBatchName.trim() || `${formClassName} Batch`,
        programId: targetProgramId,
        ...(formCapacity ? { capacity: Number(formCapacity) } : {}),
      });

      // 3. Assign Coach
      if (formCoachId) {
        try {
          await assignCoach(accessToken, refreshSession, batch.id, formCoachId);
        } catch {
          // ignore if already assigned
        }
      }

      // 4. Create Schedules for chosen days
      for (const day of formDays) {
        await createSchedule(accessToken, refreshSession, {
          batchId: batch.id,
          branchId: formBranchId || null,
          dayOfWeek: day,
          startTime: formStartTime,
          endTime: formEndTime,
          venue: formFacility || "Main Ground",
        });
      }

      // 5. Generate occurrences for next 60 days
      const todayStr = academyDate(new Date(), "Asia/Kolkata");
      const futureDate = new Date(Date.now() + 60 * 86_400_000);
      const toStr = academyDate(futureDate, "Asia/Kolkata");
      await generateSessions(accessToken, refreshSession, { from: todayStr, to: toStr });

      setNotice(`Class "${formBatchName}" created with ${formDays.length} weekly sessions.`);
      setIsAddOpen(false);
      setFormBatchName("");
      setFormClassName("");
      await load(accessToken);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create class.");
    } finally {
      setBusy(false);
    }
  }

  // Toggle Day Checkbox in form
  function toggleDay(dayIndex: number) {
    setFormDays((prev) =>
      prev.includes(dayIndex) ? prev.filter((d) => d !== dayIndex) : [...prev, dayIndex].sort()
    );
  }

  // Toggle Active / Inactive
  async function handleToggleStatus(item: ClassItem) {
    if (!accessToken) return;
    setBusy(true);
    try {
      await updateBatch(accessToken, refreshSession, item.id, {
        name: item.name,
        isActive: !item.isActive,
      });
      setNotice(`Class "${item.name}" ${item.isActive ? "archived" : "reactivated"}.`);
      await load(accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update class status.");
    } finally {
      setBusy(false);
    }
  }

  // Duplicate Class
  async function handleDuplicate(item: ClassItem) {
    if (!accessToken) return;
    setBusy(true);
    try {
      const duplicatedBatch = await createBatch(accessToken, refreshSession, {
        name: `${item.name} (Copy)`,
        programId: item.programId,
        ...(item.capacity ? { capacity: item.capacity } : {}),
      });

      if (item.coachId) {
        await assignCoach(accessToken, refreshSession, duplicatedBatch.id, item.coachId);
      }

      setNotice(`Class "${item.name}" duplicated as "${duplicatedBatch.id}".`);
      await load(accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not duplicate class.");
    } finally {
      setBusy(false);
    }
  }

  // Save Edit Class
  async function handleEditClassSubmit(e: FormEvent) {
    e.preventDefault();
    if (!accessToken || !editingItem) return;
    setBusy(true);
    try {
      await updateBatch(accessToken, refreshSession, editingItem.id, {
        name: formBatchName,
        capacity: formCapacity ? Number(formCapacity) : null,
      });

      if (editingItem.scheduleId) {
        await updateSchedule(accessToken, refreshSession, editingItem.scheduleId, {
          startTime: formStartTime,
          endTime: formEndTime,
          venue: formFacility,
        });
      }

      setNotice(`Class "${formBatchName}" updated successfully.`);
      setIsEditOpen(false);
      await load(accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update class details.");
    } finally {
      setBusy(false);
    }
  }

  function openEdit(item: ClassItem) {
    setEditingItem(item);
    setFormBatchName(item.name);
    setFormCapacity(item.capacity ? String(item.capacity) : "");
    setFormFacility(item.venue || "Main Ground");
    const [start, end] = item.scheduleTime.split("–").map((s) => s.trim());
    if (start) setFormStartTime(start);
    if (end) setFormEndTime(end);
    setIsEditOpen(true);
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

      {/* FILTER & SEARCH BAR (Screen 1 in Reference Image) */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* All Sports */}
          <select
            aria-label="Filter by sport"
            className="h-9 rounded-lg border border-line bg-[#f8fafb] px-3 text-xs font-medium text-foreground outline-none focus:border-accent"
            value={sportFilter}
            onChange={(e) => setSportFilter(e.target.value)}
          >
            <option value="all">All Sports</option>
            {(catalog?.disciplines ?? []).map((d) => (
              <option key={d.id} value={d.name}>{d.name}</option>
            ))}
            <option value="Cricket">Cricket</option>
            <option value="Football">Football</option>
            <option value="Fitness">Fitness</option>
            <option value="Yoga">Yoga</option>
            <option value="Swimming">Swimming</option>
          </select>

          {/* All Coaches */}
          <select
            aria-label="Filter by coach"
            className="h-9 rounded-lg border border-line bg-[#f8fafb] px-3 text-xs font-medium text-foreground outline-none focus:border-accent"
            value={coachFilter}
            onChange={(e) => setCoachFilter(e.target.value)}
          >
            <option value="all">All Coaches</option>
            {coaches.map((c) => (
              <option key={c.id} value={c.displayName}>{c.displayName}</option>
            ))}
            <option value="Ravi Kumar">Ravi Kumar</option>
            <option value="Imran Khan">Imran Khan</option>
            <option value="Alex Thomas">Alex Thomas</option>
            <option value="Priya Sharma">Priya Sharma</option>
          </select>

          {/* All Facilities */}
          <select
            aria-label="Filter by facility"
            className="h-9 rounded-lg border border-line bg-[#f8fafb] px-3 text-xs font-medium text-foreground outline-none focus:border-accent"
            value={facilityFilter}
            onChange={(e) => setFacilityFilter(e.target.value)}
          >
            <option value="all">All Facilities</option>
            <option value="Main Ground">Main Ground</option>
            <option value="Cricket Ground 2">Cricket Ground 2</option>
            <option value="Football Field A">Football Field A</option>
            <option value="Football Field B">Football Field B</option>
            <option value="Gym Hall">Gym Hall</option>
            <option value="Yoga Studio">Yoga Studio</option>
            <option value="Swimming Pool">Swimming Pool</option>
          </select>

          {/* Search Input */}
          <div className="relative min-w-[220px]">
            <Input
              placeholder="Search classes or batches…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 text-xs pl-8"
            />
            <span className="absolute left-2.5 top-2.5 text-muted pointer-events-none">🔍</span>
          </div>
        </div>

        {/* Action Button: + Add Class */}
        {canManage && (
          <Button
            className="bg-[#007AFF] text-white hover:bg-[#0066D6] shadow-sm font-semibold rounded-xl"
            onClick={() => setIsAddOpen(true)}
          >
            <Icon name="plus" size={16} />
            Add Class
          </Button>
        )}
      </div>

      {/* COMPACT TABLE (Screen 1 in Reference Image) */}
      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm flex flex-col max-h-[calc(100vh-240px)]">
        <div className="overflow-auto flex-1">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="sticky top-0 z-10 bg-[#f8fafb] text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-line shadow-xs">
              <tr>
                <th className="px-5 py-3.5">Class / Batch</th>
                <th className="px-4 py-3.5">Sport</th>
                <th className="px-4 py-3.5">Coach</th>
                <th className="px-4 py-3.5">Students</th>
                <th className="px-4 py-3.5">Schedule</th>
                <th className="px-4 py-3.5">Time</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loading && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-xs text-muted">
                    Loading classes and batches…
                  </td>
                </tr>
              )}
              {!loading && filteredClasses.map((item) => {
                const colors = getSportColor(item.sportName);
                return (
                  <tr key={item.id} className="hover:bg-[#fbfcfc] transition-colors">
                    {/* Class / Batch */}
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-foreground text-sm">{item.programName}</div>
                      <div className="text-muted text-[11px] mt-0.5">{item.name}</div>
                    </td>

                    {/* Sport Badge */}
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-semibold ${colors.bg}`}>
                        {item.sportName}
                      </span>
                    </td>

                    {/* Coach */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="flex size-6 items-center justify-center rounded-full bg-[#e2e8f0] text-[10px] font-bold text-[#475569]">
                          {item.coachName.slice(0, 1)}
                        </div>
                        <span className="font-medium text-foreground">{item.coachName}</span>
                      </div>
                    </td>

                    {/* Students */}
                    <td className="px-4 py-3.5 font-medium tabular-nums text-foreground">
                      {item.enrolledCount} / {item.capacity ?? "∞"}
                    </td>

                    {/* Schedule */}
                    <td className="px-4 py-3.5 font-medium text-muted">
                      {item.scheduleDays}
                    </td>

                    {/* Time */}
                    <td className="px-4 py-3.5 font-medium text-foreground">
                      {item.scheduleTime}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold capitalize ${
                        item.isActive ? "bg-[#dcfce7] text-[#15803d]" : "bg-[#f1f5f9] text-[#64748b]"
                      }`}>
                        {item.isActive ? "Active" : "Archived"}
                      </span>
                    </td>

                    {/* Actions Menu */}
                    <td className="px-5 py-3.5 text-right">
                      {canManage && (
                        <div className="flex items-center justify-end gap-1.5">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(item)} className="h-7 px-2 text-xs">
                            Edit
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => void handleDuplicate(item)} className="h-7 px-2 text-xs" title="Duplicate class">
                            Copy
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => void handleToggleStatus(item)} className="h-7 px-2 text-xs">
                            {item.isActive ? "Archive" : "Activate"}
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {!loading && filteredClasses.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-muted">
                    No classes match your filter criteria. Click "+ Add Class" to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD CLASS MODAL */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-line bg-white p-6 shadow-xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h3 className="text-base font-bold text-foreground">Add New Class & Batch</h3>
                <p className="text-xs text-muted mt-0.5">Configure sport, weekly training days, timings, coach, and venue.</p>
              </div>
              <button type="button" onClick={() => setIsAddOpen(false)} className="text-muted hover:text-foreground">✕</button>
            </div>

            <form onSubmit={handleAddClassSubmit} className="mt-4 space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <label className="block font-medium">
                  Sport / Discipline
                  <select
                    className="mt-1 h-9 w-full rounded-xl border border-line bg-white px-3 text-xs"
                    value={formDisciplineId}
                    onChange={(e) => setFormDisciplineId(e.target.value)}
                    required
                  >
                    {(catalog?.disciplines ?? []).map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block font-medium">
                  Class Name
                  <Input
                    placeholder="e.g. U14 Cricket"
                    value={formClassName}
                    onChange={(e) => setFormClassName(e.target.value)}
                    required
                    className="mt-1 h-9 text-xs"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block font-medium">
                  Batch Name
                  <Input
                    placeholder="e.g. Batch A (Morning)"
                    value={formBatchName}
                    onChange={(e) => setFormBatchName(e.target.value)}
                    required
                    className="mt-1 h-9 text-xs"
                  />
                </label>
                <label className="block font-medium">
                  Capacity <span className="font-normal text-muted">(optional)</span>
                  <Input
                    type="number"
                    placeholder="e.g. 20"
                    value={formCapacity}
                    onChange={(e) => setFormCapacity(e.target.value)}
                    className="mt-1 h-9 text-xs"
                  />
                </label>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <label className="block font-medium">
                  Assigned Coach
                  <select
                    className="mt-1 h-9 w-full rounded-xl border border-line bg-white px-3 text-xs"
                    value={formCoachId}
                    onChange={(e) => setFormCoachId(e.target.value)}
                  >
                    <option value="">Select Coach</option>
                    {coaches.map((c) => (
                      <option key={c.id} value={c.id}>{c.displayName}</option>
                    ))}
                  </select>
                </label>
                <label className="block font-medium">
                  Facility / Venue
                  <Input
                    placeholder="e.g. Main Ground"
                    value={formFacility}
                    onChange={(e) => setFormFacility(e.target.value)}
                    className="mt-1 h-9 text-xs"
                  />
                </label>
                <label className="block font-medium">
                  Branch Campus
                  <select
                    className="mt-1 h-9 w-full rounded-xl border border-line bg-white px-3 text-xs"
                    value={formBranchId}
                    onChange={(e) => setFormBranchId(e.target.value)}
                  >
                    <option value="">Main Campus</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Weekly Days Selection */}
              <div>
                <span className="block font-medium mb-1.5">Weekly Training Days (Monday–Saturday)</span>
                <div className="flex flex-wrap gap-1.5">
                  {[1, 2, 3, 4, 5, 6].map((day) => {
                    const isSelected = formDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(day)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                          isSelected ? "bg-[#007AFF] text-white" : "border border-line bg-[#f8fafb] text-muted hover:text-foreground"
                        }`}
                      >
                        {DAYS_SHORT[day]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Timings */}
              <div className="grid grid-cols-2 gap-3">
                <label className="block font-medium">
                  Start Time
                  <Input
                    type="time"
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    className="mt-1 h-9 text-xs"
                    required
                  />
                </label>
                <label className="block font-medium">
                  End Time
                  <Input
                    type="time"
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                    className="mt-1 h-9 text-xs"
                    required
                  />
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-line">
                <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)} disabled={busy}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-[#007AFF] text-white hover:bg-[#0066D6]" disabled={busy || !formBatchName.trim()}>
                  {busy ? "Creating…" : "Save Class"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT CLASS MODAL */}
      {isEditOpen && editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-line bg-white p-6 shadow-xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-base font-bold text-foreground">Edit Class & Batch</h3>
              <button type="button" onClick={() => setIsEditOpen(false)} className="text-muted hover:text-foreground">✕</button>
            </div>

            <form onSubmit={handleEditClassSubmit} className="mt-4 space-y-3 text-xs">
              <label className="block font-medium">
                Batch Name
                <Input
                  value={formBatchName}
                  onChange={(e) => setFormBatchName(e.target.value)}
                  required
                  className="mt-1 h-9 text-xs"
                />
              </label>

              <label className="block font-medium">
                Capacity
                <Input
                  type="number"
                  value={formCapacity}
                  onChange={(e) => setFormCapacity(e.target.value)}
                  className="mt-1 h-9 text-xs"
                />
              </label>

              <label className="block font-medium">
                Venue
                <Input
                  value={formFacility}
                  onChange={(e) => setFormFacility(e.target.value)}
                  className="mt-1 h-9 text-xs"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block font-medium">
                  Start Time
                  <Input
                    type="time"
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    className="mt-1 h-9 text-xs"
                  />
                </label>
                <label className="block font-medium">
                  End Time
                  <Input
                    type="time"
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                    className="mt-1 h-9 text-xs"
                  />
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-line">
                <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)} disabled={busy}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-[#007AFF] text-white hover:bg-[#0066D6]" disabled={busy}>
                  {busy ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
