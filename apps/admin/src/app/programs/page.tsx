"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { AcademyCatalog } from "@sportdesk/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WorkspaceShell } from "@/components/workspace-shell";
import { createBatch, createDiscipline, createProgram, getAcademyCatalog } from "@/lib/academy-api";
import { ApiRequestError } from "@/lib/auth-api";
import { useAuth } from "@/providers/auth-provider";

type Action = "discipline" | "program" | "batch" | null;

export default function ProgramsPage() {
  const { accessToken, refreshSession } = useAuth();
  const [catalog, setCatalog] = useState<AcademyCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Action>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [disciplineName, setDisciplineName] = useState("");
  const [programName, setProgramName] = useState("");
  const [programDisciplineId, setProgramDisciplineId] = useState("");
  const [batchName, setBatchName] = useState("");
  const [batchProgramId, setBatchProgramId] = useState("");
  const [batchCapacity, setBatchCapacity] = useState("");

  const loadCatalog = useCallback(
    async (token: string) => {
      const value = await getAcademyCatalog(token, refreshSession);
      setCatalog(value);
      setProgramDisciplineId((current) => current || value.disciplines[0]?.id || "");
      setBatchProgramId((current) => current || value.programs[0]?.id || "");
    },
    [refreshSession],
  );

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    setLoading(true);
    loadCatalog(accessToken)
      .catch((caught: unknown) => {
        if (active)
          setError(caught instanceof Error ? caught.message : "Could not load academy setup.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, loadCatalog]);

  async function submit(event: FormEvent<HTMLFormElement>, action: Exclude<Action, null>) {
    event.preventDefault();
    if (!accessToken) return;
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      if (action === "discipline") {
        await createDiscipline(accessToken, refreshSession, { name: disciplineName });
        setDisciplineName("");
        setNotice("Discipline added.");
      } else if (action === "program") {
        await createProgram(accessToken, refreshSession, {
          name: programName,
          disciplineId: programDisciplineId,
        });
        setProgramName("");
        setNotice("Program added.");
      } else {
        await createBatch(accessToken, refreshSession, {
          name: batchName,
          programId: batchProgramId,
          ...(batchCapacity ? { capacity: Number(batchCapacity) } : {}),
        });
        setBatchName("");
        setBatchCapacity("");
        setNotice("Batch added.");
      }
      await loadCatalog(accessToken);
    } catch (caught: unknown) {
      const message =
        caught instanceof ApiRequestError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : "Could not save this record.";
      setError(message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <WorkspaceShell>
      <div className="mx-auto max-w-[1200px] px-5 py-8 sm:px-8 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-accent">Academy setup</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Programs & batches</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Configure the disciplines, programs, and training groups offered at your academy.
            </p>
          </div>
          <Link href="/students" className="text-sm font-semibold text-accent hover:underline">
            Go to students →
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

        <div className="mt-8 grid gap-5 xl:grid-cols-3">
          <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                  01 · Discipline
                </p>
                <h2 className="mt-2 text-lg font-semibold">Add a discipline</h2>
              </div>
              <span className="rounded-full bg-[#f1f3f4] px-2.5 py-1 text-xs font-medium tabular-nums text-muted">
                {catalog?.disciplines.length ?? 0}
              </span>
            </div>
            <form className="mt-5 space-y-3" onSubmit={(event) => void submit(event, "discipline")}>
              <label className="block space-y-2 text-sm font-medium" htmlFor="discipline-name">
                Discipline name
                <Input
                  id="discipline-name"
                  value={disciplineName}
                  onChange={(event) => setDisciplineName(event.target.value)}
                  placeholder="Wushu"
                  maxLength={120}
                  required
                />
              </label>
              <Button type="submit" disabled={busy !== null || loading}>
                {busy === "discipline" ? "Saving…" : "Add discipline"}
              </Button>
            </form>
            <ul className="mt-6 divide-y divide-line" aria-label="Disciplines">
              {(catalog?.disciplines ?? []).map((discipline) => (
                <li key={discipline.id} className="flex items-center justify-between py-3 text-sm">
                  <span className="font-medium">{discipline.name}</span>
                  <span className="text-xs text-muted">
                    {discipline.isActive ? "Active" : "Inactive"}
                  </span>
                </li>
              ))}
              {!loading && catalog?.disciplines.length === 0 && (
                <li className="py-3 text-sm text-muted">No disciplines added yet.</li>
              )}
            </ul>
          </section>

          <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                  02 · Program
                </p>
                <h2 className="mt-2 text-lg font-semibold">Create a program</h2>
              </div>
              <span className="rounded-full bg-[#f1f3f4] px-2.5 py-1 text-xs font-medium tabular-nums text-muted">
                {catalog?.programs.length ?? 0}
              </span>
            </div>
            <form className="mt-5 space-y-3" onSubmit={(event) => void submit(event, "program")}>
              <label className="block space-y-2 text-sm font-medium" htmlFor="program-name">
                Program name
                <Input
                  id="program-name"
                  value={programName}
                  onChange={(event) => setProgramName(event.target.value)}
                  placeholder="Foundations"
                  maxLength={120}
                  required
                />
              </label>
              <label className="block space-y-2 text-sm font-medium" htmlFor="program-discipline">
                Discipline
                <select
                  id="program-discipline"
                  className="h-11 w-full rounded-xl border border-line bg-white px-3.5 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-[#176e6718]"
                  value={programDisciplineId}
                  onChange={(event) => setProgramDisciplineId(event.target.value)}
                  required
                  disabled={!catalog?.disciplines.length}
                >
                  {catalog?.disciplines.map((discipline) => (
                    <option key={discipline.id} value={discipline.id}>
                      {discipline.name}
                    </option>
                  ))}
                  {!catalog?.disciplines.length && <option value="">Add a discipline first</option>}
                </select>
              </label>
              <Button
                type="submit"
                disabled={busy !== null || loading || !catalog?.disciplines.length}
              >
                {busy === "program" ? "Saving…" : "Add program"}
              </Button>
            </form>
            <ul className="mt-6 divide-y divide-line" aria-label="Programs">
              {(catalog?.programs ?? []).map((program) => (
                <li
                  key={program.id}
                  className="flex items-center justify-between gap-3 py-3 text-sm"
                >
                  <span className="font-medium">{program.name}</span>
                  <span className="truncate text-xs text-muted">{program.disciplineName}</span>
                </li>
              ))}
              {!loading && catalog?.programs.length === 0 && (
                <li className="py-3 text-sm text-muted">No programs added yet.</li>
              )}
            </ul>
          </section>

          <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                  03 · Batch
                </p>
                <h2 className="mt-2 text-lg font-semibold">Create a training group</h2>
              </div>
              <span className="rounded-full bg-[#f1f3f4] px-2.5 py-1 text-xs font-medium tabular-nums text-muted">
                {catalog?.batches.length ?? 0}
              </span>
            </div>
            <form className="mt-5 space-y-3" onSubmit={(event) => void submit(event, "batch")}>
              <label className="block space-y-2 text-sm font-medium" htmlFor="batch-name">
                Batch name
                <Input
                  id="batch-name"
                  value={batchName}
                  onChange={(event) => setBatchName(event.target.value)}
                  placeholder="Morning group"
                  maxLength={120}
                  required
                />
              </label>
              <label className="block space-y-2 text-sm font-medium" htmlFor="batch-program">
                Program
                <select
                  id="batch-program"
                  className="h-11 w-full rounded-xl border border-line bg-white px-3.5 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-[#176e6718]"
                  value={batchProgramId}
                  onChange={(event) => setBatchProgramId(event.target.value)}
                  required
                  disabled={!catalog?.programs.length}
                >
                  {catalog?.programs.map((program) => (
                    <option key={program.id} value={program.id}>
                      {program.name} · {program.disciplineName}
                    </option>
                  ))}
                  {!catalog?.programs.length && <option value="">Add a program first</option>}
                </select>
              </label>
              <label className="block space-y-2 text-sm font-medium" htmlFor="batch-capacity">
                Capacity <span className="font-normal text-muted">(optional)</span>
                <Input
                  id="batch-capacity"
                  type="number"
                  min={1}
                  max={500}
                  step={1}
                  value={batchCapacity}
                  onChange={(event) => setBatchCapacity(event.target.value)}
                  placeholder="No limit"
                />
              </label>
              <Button
                type="submit"
                disabled={busy !== null || loading || !catalog?.programs.length}
              >
                {busy === "batch" ? "Saving…" : "Add batch"}
              </Button>
            </form>
            <ul className="mt-6 divide-y divide-line" aria-label="Batches">
              {(catalog?.batches ?? []).map((batch) => (
                <li key={batch.id} className="py-3">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium">{batch.name}</span>
                    <span className="text-xs tabular-nums text-muted">
                      {batch.activeEnrollmentCount}
                      {batch.capacity === null ? "" : ` / ${batch.capacity}`}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {batch.programName} · {batch.disciplineName}
                  </p>
                </li>
              ))}
              {!loading && catalog?.batches.length === 0 && (
                <li className="py-3 text-sm text-muted">No batches added yet.</li>
              )}
            </ul>
          </section>
        </div>
      </div>
    </WorkspaceShell>
  );
}
