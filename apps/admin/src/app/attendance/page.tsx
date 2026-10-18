"use client";

import { useEffect, useState } from "react";
import {
  AttendanceStatusSchema,
  type AdminAttendanceEntry,
  type AttendanceCorrectionEntry,
  type AttendanceStatus,
} from "@sportdesk/contracts";
import { Button } from "@/components/ui/button";
import { WorkspaceShell } from "@/components/workspace-shell";
import { correctAttendance, getAttendance, getAttendanceCorrections } from "@/lib/operations-api";
import { useAuth } from "@/providers/auth-provider";

const statuses = AttendanceStatusSchema.options;
const statusLabels: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  excused: "Excused",
};

function localDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfLocalDay(value: string) {
  return new Date(`${value}T00:00:00`).toISOString();
}

function endOfLocalDay(value: string) {
  return new Date(`${value}T23:59:59.999`).toISOString();
}

export default function AttendancePage() {
  const { accessToken, refreshSession } = useAuth();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [records, setRecords] = useState<AdminAttendanceEntry[]>([]);
  const [statusesById, setStatusesById] = useState<Record<string, AttendanceStatus>>({});
  const [reasonsById, setReasonsById] = useState<Record<string, string>>({});
  const [correctionsById, setCorrectionsById] = useState<
    Record<string, AttendanceCorrectionEntry[]>
  >({});
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load(token: string) {
    const result = await getAttendance(
      token,
      refreshSession,
      startOfLocalDay(from),
      endOfLocalDay(to),
    );
    setRecords(result.records);
    setStatusesById(Object.fromEntries(result.records.map((record) => [record.id, record.status])));
  }

  useEffect(() => {
    const today = localDate(new Date());
    setFrom((current) => current || today);
    setTo((current) => current || today);
  }, []);

  useEffect(() => {
    if (!accessToken || !from || !to) return;
    setLoading(true);
    setError(null);
    load(accessToken)
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : "Could not load attendance."),
      )
      .finally(() => setLoading(false));
  }, [accessToken, from, to]);

  async function applyFilter() {
    if (!accessToken || from > to) {
      setError("Choose a valid date range.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await load(accessToken);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load attendance.");
    } finally {
      setLoading(false);
    }
  }

  async function saveCorrection(record: AdminAttendanceEntry) {
    if (!accessToken) return;
    const status = statusesById[record.id] ?? record.status;
    const reason = reasonsById[record.id]?.trim() ?? "";
    if (status === record.status) {
      setNotice("This record already has that status.");
      setError(null);
      return;
    }
    if (reason.length < 5) {
      setError("Add a correction reason of at least five characters.");
      return;
    }
    setSavingId(record.id);
    setError(null);
    setNotice(null);
    try {
      await correctAttendance(accessToken, refreshSession, record.id, { status, reason });
      await load(accessToken);
      setCorrectionsById((current) => {
        const next = { ...current };
        delete next[record.id];
        return next;
      });
      setHistoryOpenId(null);
      setReasonsById((current) => ({ ...current, [record.id]: "" }));
      setNotice("Attendance updated and correction recorded.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not correct attendance.");
    } finally {
      setSavingId(null);
    }
  }

  async function toggleHistory(record: AdminAttendanceEntry) {
    if (historyOpenId === record.id) {
      setHistoryOpenId(null);
      return;
    }
    setHistoryOpenId(record.id);
    if (!accessToken || correctionsById[record.id]) return;
    try {
      const result = await getAttendanceCorrections(accessToken, refreshSession, record.id);
      setCorrectionsById((current) => ({ ...current, [record.id]: result.corrections }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load correction history.");
    }
  }

  return (
    <WorkspaceShell>
      <div className="mx-auto max-w-[1200px] px-5 py-8 sm:px-8 sm:py-10">
        <p className="text-sm font-medium text-accent">Daily operations</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Attendance review</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Review coach-submitted records and keep a reason with every owner correction.
        </p>

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

        <section className="mt-8 flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-white p-5">
          <label className="grid gap-2 text-xs font-semibold text-muted">
            From
            <InputDate value={from} onChange={setFrom} />
          </label>
          <label className="grid gap-2 text-xs font-semibold text-muted">
            To
            <InputDate value={to} onChange={setTo} />
          </label>
          <Button variant="outline" onClick={() => void applyFilter()} disabled={loading}>
            Apply dates
          </Button>
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-line bg-white">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="font-semibold">Recorded attendance</h2>
            <span className="text-xs text-muted">
              {records.length} record{records.length === 1 ? "" : "s"}
            </span>
          </div>
          {loading ? (
            <p className="px-5 py-8 text-sm text-muted">Loading attendance…</p>
          ) : records.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted">
              No attendance was recorded in this date range.
            </p>
          ) : (
            <div className="divide-y divide-line">
              {records.map((record) => {
                const changed = (statusesById[record.id] ?? record.status) !== record.status;
                return (
                  <article
                    key={record.id}
                    className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center"
                  >
                    <div>
                      <div className="font-medium">{record.studentName}</div>
                      <div className="mt-1 text-sm text-muted">
                        {record.batchName} · {new Date(record.scheduledStart).toLocaleString()}
                      </div>
                      <div className="mt-1 text-xs text-muted">
                        Recorded by {record.recorderName} ·{" "}
                        {new Date(record.recordedAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto] lg:grid-cols-1 xl:grid-cols-[1fr_1.4fr_auto]">
                      <select
                        aria-label={`Status for ${record.studentName}`}
                        className="h-10 rounded-xl border border-line bg-white px-3 text-sm"
                        value={statusesById[record.id] ?? record.status}
                        onChange={(event) =>
                          setStatusesById((current) => ({
                            ...current,
                            [record.id]: event.target.value as AttendanceStatus,
                          }))
                        }
                      >
                        {statuses.map((status) => (
                          <option key={status} value={status}>
                            {statusLabels[status]}
                          </option>
                        ))}
                      </select>
                      <input
                        aria-label={`Correction reason for ${record.studentName}`}
                        className="h-10 min-w-0 rounded-xl border border-line px-3 text-sm"
                        placeholder="Reason for correction"
                        value={reasonsById[record.id] ?? ""}
                        onChange={(event) =>
                          setReasonsById((current) => ({
                            ...current,
                            [record.id]: event.target.value,
                          }))
                        }
                        maxLength={500}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!changed || savingId === record.id}
                        onClick={() => void saveCorrection(record)}
                      >
                        {savingId === record.id ? "Saving…" : "Correct"}
                      </Button>
                    </div>
                    {record.correctionCount > 0 ? (
                      <div className="lg:col-span-2">
                        <button
                          type="button"
                          className="text-xs font-semibold text-accent hover:underline"
                          onClick={() => void toggleHistory(record)}
                        >
                          {historyOpenId === record.id ? "Hide" : "View"} correction history (
                          {record.correctionCount})
                        </button>
                        {historyOpenId === record.id ? (
                          <div className="mt-3 space-y-2 rounded-xl bg-[#f7f9f9] p-3">
                            {(correctionsById[record.id] ?? []).map((correction) => (
                              <div key={correction.id} className="text-xs leading-5 text-muted">
                                <span className="font-semibold text-foreground">
                                  {statusLabels[correction.previousStatus]} →{" "}
                                  {statusLabels[correction.nextStatus]}
                                </span>
                                <span>
                                  {" "}
                                  · {correction.reason} · {correction.correctedByName} ·{" "}
                                  {new Date(correction.correctedAt).toLocaleString()}
                                </span>
                              </div>
                            ))}
                            {!correctionsById[record.id] && (
                              <p className="text-xs text-muted">Loading history…</p>
                            )}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </WorkspaceShell>
  );
}

function InputDate({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <input
      className="h-10 rounded-xl border border-line px-3 text-sm text-foreground"
      type="date"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
