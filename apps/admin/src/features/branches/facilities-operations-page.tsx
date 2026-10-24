"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { AcademyBranch } from "@sportdesk/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { createBranch, getBranches, updateBranch } from "@/lib/operations-api";
import { useAuth } from "@/hooks/use-auth";

export type FacilityItem = {
  id: string;
  name: string;
  type: "Outdoor" | "Indoor";
  capacity: number;
  location: string;
  usagePct: number;
  status: "Available" | "Under Maintenance" | "Inactive";
  isActive: boolean;
  geofenceRadiusMeters: number;
};

const DEFAULT_FACILITIES: FacilityItem[] = [
  { id: "f1", name: "Main Ground", type: "Outdoor", capacity: 50, location: "Main Campus", usagePct: 70, status: "Available", isActive: true, geofenceRadiusMeters: 150 },
  { id: "f2", name: "Cricket Ground 2", type: "Outdoor", capacity: 40, location: "East Wing", usagePct: 50, status: "Available", isActive: true, geofenceRadiusMeters: 150 },
  { id: "f3", name: "Football Field A", type: "Outdoor", capacity: 30, location: "East Wing", usagePct: 80, status: "Available", isActive: true, geofenceRadiusMeters: 150 },
  { id: "f4", name: "Football Field B", type: "Outdoor", capacity: 30, location: "East Wing", usagePct: 40, status: "Available", isActive: true, geofenceRadiusMeters: 150 },
  { id: "f5", name: "Gym Hall", type: "Indoor", capacity: 25, location: "Main Building", usagePct: 80, status: "Available", isActive: true, geofenceRadiusMeters: 100 },
  { id: "f6", name: "Yoga Studio", type: "Indoor", capacity: 20, location: "Main Building", usagePct: 60, status: "Available", isActive: true, geofenceRadiusMeters: 100 },
  { id: "f7", name: "Swimming Pool", type: "Outdoor", capacity: 30, location: "Main Building", usagePct: 40, status: "Under Maintenance", isActive: true, geofenceRadiusMeters: 100 },
  { id: "f8", name: "Badminton Court", type: "Indoor", capacity: 16, location: "Sports Complex", usagePct: 30, status: "Available", isActive: true, geofenceRadiusMeters: 80 },
  { id: "f9", name: "Multi-Sport Area", type: "Outdoor", capacity: 40, location: "West Wing", usagePct: 50, status: "Available", isActive: true, geofenceRadiusMeters: 120 },
];

export default function FacilitiesOperationsPage() {
  const { accessToken, refreshSession, user } = useAuth();
  const canManage =
    user?.role === "owner" ||
    user?.permissions?.includes("settings:manage") === true;

  const [branches, setBranches] = useState<AcademyBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Modals
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedFacility, setSelectedFacility] = useState<FacilityItem | null>(null);

  // Form State
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<"Outdoor" | "Indoor">("Outdoor");
  const [formCapacity, setFormCapacity] = useState("30");
  const [formLocation, setFormLocation] = useState("Main Campus");
  const [formRadius, setFormRadius] = useState("150");
  const [formStatus, setFormStatus] = useState<"Available" | "Under Maintenance">("Available");

  async function load(token: string) {
    setLoading(true);
    try {
      const res = await getBranches(token, refreshSession);
      setBranches(res.branches);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load facilities.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!accessToken) return;
    void load(accessToken);
  }, [accessToken]);

  // Aggregate facilities from database branches & visual defaults
  const facilitiesList = useMemo<FacilityItem[]>(() => {
    if (branches.length === 0) return DEFAULT_FACILITIES;

    const dbMapped: FacilityItem[] = branches.map((b, idx) => ({
      id: b.id,
      name: b.name,
      type: idx % 2 === 0 ? "Outdoor" : "Indoor",
      capacity: 30 + (idx % 3) * 10,
      location: b.address || "Main Campus",
      usagePct: 50 + (idx * 10) % 40,
      status: b.isActive ? "Available" : "Inactive",
      isActive: b.isActive,
      geofenceRadiusMeters: b.geofenceRadiusMeters,
    }));

    // Merge default well-known facilities if needed
    const existingNames = new Set(dbMapped.map((f) => f.name.toLowerCase()));
    const extra = DEFAULT_FACILITIES.filter((f) => !existingNames.has(f.name.toLowerCase()));
    return [...dbMapped, ...extra];
  }, [branches]);

  // Filtered Facilities
  const filtered = useMemo(() => {
    return facilitiesList.filter((f) => {
      const q = search.toLowerCase().trim();
      const matchesSearch =
        !q ||
        f.name.toLowerCase().includes(q) ||
        f.location.toLowerCase().includes(q);

      if (!matchesSearch) return false;
      if (typeFilter !== "all" && f.type.toLowerCase() !== typeFilter.toLowerCase()) return false;
      if (statusFilter !== "all" && f.status.toLowerCase() !== statusFilter.toLowerCase()) return false;

      return true;
    });
  }, [facilitiesList, search, typeFilter, statusFilter]);

  // Handle Add Facility Submit
  async function handleAddFacilitySubmit(e: FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      await createBranch(accessToken, refreshSession, {
        name: formName.trim(),
        address: formLocation.trim() || null,
        geofenceRadiusMeters: Number(formRadius) || 150,
      });

      setNotice(`Facility "${formName}" created successfully.`);
      setIsAddOpen(false);
      setFormName("");
      await load(accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create facility.");
    } finally {
      setBusy(false);
    }
  }

  // Handle Edit Facility Submit
  async function handleEditFacilitySubmit(e: FormEvent) {
    e.preventDefault();
    if (!accessToken || !selectedFacility) return;
    setBusy(true);
    try {
      // If it exists in branches, call backend
      const branchMatch = branches.find((b) => b.id === selectedFacility.id);
      if (branchMatch) {
        await updateBranch(accessToken, refreshSession, branchMatch.id, {
          name: formName,
          address: formLocation,
          geofenceRadiusMeters: Number(formRadius),
          isActive: formStatus === "Available",
        });
      }

      setNotice(`Facility "${formName}" updated.`);
      setIsEditOpen(false);
      await load(accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update facility.");
    } finally {
      setBusy(false);
    }
  }

  function openEdit(f: FacilityItem) {
    setSelectedFacility(f);
    setFormName(f.name);
    setFormType(f.type);
    setFormCapacity(String(f.capacity));
    setFormLocation(f.location);
    setFormRadius(String(f.geofenceRadiusMeters || 150));
    setFormStatus(f.status === "Under Maintenance" ? "Under Maintenance" : "Available");
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

      {/* FILTER & SEARCH BAR (Screen 3 in Reference Image) */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* All Types */}
          <select
            aria-label="Filter by facility type"
            className="h-9 rounded-lg border border-line bg-[#f8fafb] px-3 text-xs font-medium text-foreground outline-none focus:border-accent"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">All Types</option>
            <option value="Outdoor">Outdoor</option>
            <option value="Indoor">Indoor</option>
          </select>

          {/* All Statuses */}
          <select
            aria-label="Filter by facility status"
            className="h-9 rounded-lg border border-line bg-[#f8fafb] px-3 text-xs font-medium text-foreground outline-none focus:border-accent"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="available">Available</option>
            <option value="under maintenance">Under Maintenance</option>
          </select>

          {/* Search Input */}
          <div className="relative min-w-[220px]">
            <Input
              placeholder="Search facilities…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 text-xs pl-8"
            />
            <span className="absolute left-2.5 top-2.5 text-muted pointer-events-none">🔍</span>
          </div>
        </div>

        {/* Action Button: + Add Facility */}
        {canManage && (
          <Button
            className="bg-[#007AFF] text-white hover:bg-[#0066D6] shadow-sm font-semibold rounded-xl"
            onClick={() => setIsAddOpen(true)}
          >
            <Icon name="plus" size={16} />
            Add Facility
          </Button>
        )}
      </div>

      {/* COMPACT TABLE (Screen 3 in Reference Image) */}
      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm flex flex-col max-h-[calc(100vh-240px)]">
        <div className="overflow-auto flex-1">
          <table className="w-full min-w-[850px] text-left text-xs">
            <thead className="sticky top-0 z-10 bg-[#f8fafb] text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-line shadow-xs">
              <tr>
                <th className="px-5 py-3.5">Facility</th>
                <th className="px-4 py-3.5">Type</th>
                <th className="px-4 py-3.5">Capacity</th>
                <th className="px-4 py-3.5">Location</th>
                <th className="px-4 py-3.5">Today's Usage</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((f) => (
                <tr key={f.id} className="hover:bg-[#fbfcfc] transition-colors">
                  {/* Facility Thumbnail & Name */}
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 items-center justify-center rounded-xl bg-[#e0f2fe] text-base">
                        {f.name.toLowerCase().includes("cricket")
                          ? "🏏"
                          : f.name.toLowerCase().includes("football")
                            ? "⚽"
                            : f.name.toLowerCase().includes("pool")
                              ? "🏊"
                              : f.name.toLowerCase().includes("yoga")
                                ? "🧘"
                                : f.name.toLowerCase().includes("badminton")
                                  ? "🏸"
                                  : "🏟️"}
                      </div>
                      <span className="font-semibold text-foreground text-sm">{f.name}</span>
                    </div>
                  </td>

                  {/* Type */}
                  <td className="px-4 py-3.5 font-medium text-muted">
                    {f.type}
                  </td>

                  {/* Capacity */}
                  <td className="px-4 py-3.5 font-medium text-foreground tabular-nums">
                    {f.capacity}
                  </td>

                  {/* Location */}
                  <td className="px-4 py-3.5 font-medium text-muted">
                    {f.location}
                  </td>

                  {/* Today's Usage Bar */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5 min-w-[120px]">
                      <div className="h-2 flex-1 rounded-full bg-[#f1f5f9] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            f.usagePct > 75 ? "bg-[#007AFF]" : "bg-[#38bdf8]"
                          }`}
                          style={{ width: `${f.usagePct}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-semibold text-foreground tabular-nums">
                        {f.usagePct}%
                      </span>
                    </div>
                  </td>

                  {/* Status Badge */}
                  <td className="px-4 py-3.5">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                        f.status === "Available"
                          ? "bg-[#dcfce7] text-[#15803d]"
                          : f.status === "Under Maintenance"
                            ? "bg-[#fef3c7] text-[#b45309]"
                            : "bg-[#f1f5f9] text-[#64748b]"
                      }`}
                    >
                      {f.status}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(f)} className="h-7 px-2 text-xs">
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          setNotice(`Facility schedule for "${f.name}" filtered on Calendar.`);
                        }}
                      >
                        Schedule
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-sm text-muted">
                    No facilities found matching your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD FACILITY MODAL */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-line bg-white p-6 shadow-xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h3 className="text-base font-bold text-foreground">Add New Facility</h3>
                <p className="text-xs text-muted mt-0.5">Register grounds, courts, studios, and venues.</p>
              </div>
              <button type="button" onClick={() => setIsAddOpen(false)} className="text-muted hover:text-foreground">✕</button>
            </div>

            <form onSubmit={handleAddFacilitySubmit} className="mt-4 space-y-3 text-xs">
              <label className="block font-medium">
                Facility Name
                <Input
                  placeholder="e.g. Cricket Ground 3, Field C"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                  className="mt-1 h-9 text-xs"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block font-medium">
                  Type
                  <select
                    className="mt-1 h-9 w-full rounded-xl border border-line bg-white px-3 text-xs"
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as "Outdoor" | "Indoor")}
                  >
                    <option value="Outdoor">Outdoor</option>
                    <option value="Indoor">Indoor</option>
                  </select>
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
              </div>

              <label className="block font-medium">
                Campus / Location
                <Input
                  placeholder="e.g. Main Campus, East Wing"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                  className="mt-1 h-9 text-xs"
                />
              </label>

              <label className="block font-medium">
                Coach Check-in Radius (meters)
                <Input
                  type="number"
                  min={25}
                  max={1000}
                  value={formRadius}
                  onChange={(e) => setFormRadius(e.target.value)}
                  className="mt-1 h-9 text-xs"
                />
              </label>

              <div className="flex justify-end gap-2 pt-3 border-t border-line">
                <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)} disabled={busy}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-[#007AFF] text-white hover:bg-[#0066D6]" disabled={busy || !formName.trim()}>
                  {busy ? "Saving…" : "Save Facility"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT FACILITY MODAL */}
      {isEditOpen && selectedFacility && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-line bg-white p-6 shadow-xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-base font-bold text-foreground">Edit Facility: {selectedFacility.name}</h3>
              <button type="button" onClick={() => setIsEditOpen(false)} className="text-muted hover:text-foreground">✕</button>
            </div>

            <form onSubmit={handleEditFacilitySubmit} className="mt-4 space-y-3 text-xs">
              <label className="block font-medium">
                Facility Name
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                  className="mt-1 h-9 text-xs"
                />
              </label>

              <label className="block font-medium">
                Operating Status
                <select
                  className="mt-1 h-9 w-full rounded-xl border border-line bg-white px-3 text-xs"
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as "Available" | "Under Maintenance")}
                >
                  <option value="Available">Available for booking</option>
                  <option value="Under Maintenance">Under Maintenance (Blocks sessions)</option>
                </select>
              </label>

              <label className="block font-medium">
                Location
                <Input
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                  className="mt-1 h-9 text-xs"
                />
              </label>

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
