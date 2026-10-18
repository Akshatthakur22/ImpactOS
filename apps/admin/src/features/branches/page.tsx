"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { AcademyBranch } from "@sportdesk/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { createBranch, getBranches, updateBranch } from "@/lib/operations-api";

export default function BranchesPage() {
  const { accessToken, refreshSession } = useAuth();
  const [branches, setBranches] = useState<AcademyBranch[]>([]);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const result = await getBranches(accessToken, refreshSession);
    setBranches(result.branches);
  }, [accessToken, refreshSession]);

  useEffect(() => {
    load()
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : "Could not load academy branches."),
      )
      .finally(() => setLoading(false));
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await createBranch(accessToken, refreshSession, {
        name,
        address: address.trim() || null,
      });
      setName("");
      setAddress("");
      await load();
      setMessage("Branch added to the academy.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add this branch.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(branch: AcademyBranch) {
    if (!accessToken) return;
    setBusyId(branch.id);
    setError(null);
    setMessage(null);
    try {
      await updateBranch(accessToken, refreshSession, branch.id, { isActive: !branch.isActive });
      await load();
      setMessage(`${branch.name} ${branch.isActive ? "deactivated" : "activated"}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update this branch.");
    } finally {
      setBusyId(null);
    }
  }

  function beginEdit(branch: AcademyBranch) {
    setEditingId(branch.id);
    setEditName(branch.name);
    setEditAddress(branch.address ?? "");
    setError(null);
    setMessage(null);
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !editingId) return;
    setBusyId(editingId);
    setError(null);
    setMessage(null);
    try {
      await updateBranch(accessToken, refreshSession, editingId, {
        name: editName,
        address: editAddress.trim() || null,
      });
      setEditingId(null);
      await load();
      setMessage("Branch details updated.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update branch details.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-8 sm:px-8 sm:py-10">
      <p className="text-sm font-medium text-accent">Locations</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Branches</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
        Keep academy locations in one place and assign them to recurring batch schedules.
      </p>
      {error ? <div role="alert" className="mt-5 rounded-xl border border-[#f1d8d2] bg-[#fff7f5] px-4 py-3 text-sm text-[#984d3f]">{error}</div> : null}
      {message ? <div role="status" className="mt-5 rounded-xl border border-[#cce3dd] bg-[#eff8f5] px-4 py-3 text-sm text-accent">{message}</div> : null}

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
        <form onSubmit={(event) => void submit(event)} className="rounded-2xl border border-line bg-white p-5 sm:p-6">
          <h3 className="text-lg font-semibold">Add a branch</h3>
          <div className="mt-4 space-y-3">
            <Input aria-label="Branch name" placeholder="Branch name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required />
            <Input aria-label="Branch address" placeholder="Address (optional)" value={address} onChange={(event) => setAddress(event.target.value)} maxLength={500} />
            <Button type="submit" disabled={saving || !name.trim()}>{saving ? "Saving…" : "Add branch"}</Button>
          </div>
        </form>

        <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">Academy locations</h3>
            <span className="text-xs text-muted">{branches.filter((branch) => branch.isActive).length} active</span>
          </div>
          {loading ? <p className="mt-5 text-sm text-muted">Loading branches…</p> : null}
          {!loading && branches.length === 0 ? (
            <p className="mt-5 rounded-xl border border-dashed border-line p-5 text-sm text-muted">
              No branches added yet. Schedules can still be created without a branch.
            </p>
          ) : null}
          <ul className="mt-3 divide-y divide-line">
            {branches.map((branch) => (
              <li key={branch.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                {editingId === branch.id ? (
                  <form onSubmit={(event) => void saveEdit(event)} className="grid w-full gap-3 sm:grid-cols-[1fr_1.4fr_auto_auto]">
                    <Input aria-label="Edit branch name" value={editName} onChange={(event) => setEditName(event.target.value)} maxLength={120} required />
                    <Input aria-label="Edit branch address" value={editAddress} onChange={(event) => setEditAddress(event.target.value)} maxLength={500} placeholder="Address (optional)" />
                    <Button type="submit" size="sm" disabled={busyId === branch.id || !editName.trim()}>{busyId === branch.id ? "Saving…" : "Save"}</Button>
                    <Button type="button" size="sm" variant="ghost" disabled={busyId === branch.id} onClick={() => setEditingId(null)}>Cancel</Button>
                  </form>
                ) : (
                  <>
                    <div>
                      <h4 className="text-sm font-semibold">{branch.name}</h4>
                      <p className="mt-1 text-xs text-muted">{branch.address || "No address added"}</p>
                      <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${branch.isActive ? "bg-accent-soft text-accent" : "bg-[#eef2f4] text-muted"}`}>
                        {branch.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => beginEdit(branch)}>Edit</Button>
                      <Button type="button" variant="outline" size="sm" disabled={busyId === branch.id} onClick={() => void toggleStatus(branch)}>
                        {busyId === branch.id ? "Saving…" : branch.isActive ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
