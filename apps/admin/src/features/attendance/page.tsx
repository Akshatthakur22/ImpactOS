"use client";

import { useEffect, useState } from "react";
import {
  AttendanceStatusSchema,
  type AdminAttendanceEntry,
  type AttendanceCorrectionEntry,
  type AttendanceStatus,
  type AttendanceSessionSummary,
} from "@sportdesk/contracts";
import { Button } from "@/components/ui/button";
import { calendarDateInTimezone, dateRangeInTimezone } from "@/lib/academy-time";
import {
  correctAttendance,
  getAllAttendance,
  getAttendance,
  getAttendanceCorrections,
  getAttendanceSessions,
} from "@/lib/operations-api";
import { useAuth } from "@/hooks/use-auth";
import { getAcademySettings } from "@/lib/settings-api";

const statuses = AttendanceStatusSchema.options;
const statusLabels: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  excused: "Excused",
};

export default function AttendancePage() {
  const { accessToken, refreshSession, user } = useAuth();
  const canCorrect = user?.role === "owner" || user?.permissions?.includes("attendance:correct") === true;
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [records, setRecords] = useState<AdminAttendanceEntry[]>([]);
  const [recordOffset, setRecordOffset] = useState(0);
  const [recordHasMore, setRecordHasMore] = useState(false);
  const [sessionSummaries, setSessionSummaries] = useState<AttendanceSessionSummary[]>([]);
  const [batchFilter, setBatchFilter] = useState("");
  const [coachFilter, setCoachFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | "all">("all");
  const [view, setView] = useState<"sessions" | "records">("sessions");
  const [selectedSessionId, setSelectedSessionId] = useState("");
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

  async function load(token: string, offset = recordOffset) {
    const range = dateRangeInTimezone(from, to, timezone);
    if (new Date(range.to).getTime() - new Date(range.from).getTime() > 90 * 86_400_000) {
      throw new Error("Attendance review is limited to a 90-day window. Choose a shorter date range.");
    }
    const [result, sessions] = await Promise.all([
      getAttendance(token, refreshSession, range.from, range.to, {
        ...(batchFilter ? { batchId: batchFilter } : {}),
        ...(coachFilter ? { recordedBy: coachFilter } : {}),
        ...(selectedSessionId ? { sessionId: selectedSessionId } : {}),
      }, { offset, limit: 50 }),
      getAttendanceSessions(
        token,
        refreshSession,
        new Date(range.from),
        new Date(range.to),
        batchFilter || undefined,
      ),
    ]);
    setRecords(result.records);
    setRecordHasMore(result.hasMore);
    setSessionSummaries(sessions.sessions);
    setStatusesById(Object.fromEntries(result.records.map((record) => [record.id, record.status])));
  }

  useEffect(() => {
    if (!accessToken) return;
    getAcademySettings(accessToken, refreshSession)
      .then((settings) => {
        setTimezone(settings.timezone);
        const today = new Date();
        setFrom(
          (current) =>
            current ||
            calendarDateInTimezone(new Date(today.getTime() - 7 * 86_400_000), settings.timezone),
        );
        setTo(
          (current) =>
            current ||
            calendarDateInTimezone(new Date(today.getTime() + 30 * 86_400_000), settings.timezone),
        );
      })
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : "Could not load academy timezone."),
      );
  }, [accessToken, refreshSession]);

  useEffect(() => {
    if (!accessToken || !from || !to) return;
    setLoading(true);
    setError(null);
    load(accessToken)
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : "Could not load attendance."),
      )
      .finally(() => setLoading(false));
  }, [accessToken, batchFilter, coachFilter, from, recordOffset, refreshSession, selectedSessionId, to, timezone]);

  const visibleRecords = records.filter(
    (record) =>
      (statusFilter === "all" || record.status === statusFilter) &&
      (!coachFilter || record.recordedBy === coachFilter) &&
      (!selectedSessionId || record.sessionId === selectedSessionId),
  );
  const unmarkedSessions = sessionSummaries.filter(
    (session) => session.expectedCount > session.markedCount,
  );
  const statusCounts = statuses.map((status) => ({
    status,
    count: records.filter((record) => record.status === status).length,
  }));
  const batches = [
    ...new Map(sessionSummaries.map((session) => [session.batchId, session.batchName])).entries(),
  ];
  const coaches = [
    ...new Map(records.map((record) => [record.recordedBy, record.recorderName])).entries(),
  ];

  async function exportVisibleRecords() {
    if (!accessToken) return;
    const range = dateRangeInTimezone(from, to, timezone);
    const allRecords = await getAllAttendance(accessToken, refreshSession, range.from, range.to, {
      ...(batchFilter ? { batchId: batchFilter } : {}),
      ...(coachFilter ? { recordedBy: coachFilter } : {}),
      ...(selectedSessionId ? { sessionId: selectedSessionId } : {}),
    });
    const exportRecords = allRecords.filter((record) => statusFilter === "all" || record.status === statusFilter);
    const cell = (value: string | number) => {
      let safe = String(value);
      if (/^[=+@\-\t\r]/.test(safe)) safe = `'${safe}`;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const rows = [
      ["Student", "Batch", "Session date", "Status", "Recorded by", "Recorded at", "Corrections"],
      ...exportRecords.map((record) => [
        record.studentName,
        record.batchName,
        new Intl.DateTimeFormat("en-IN", {
          dateStyle: "short",
          timeStyle: "short",
          timeZone: timezone,
        }).format(new Date(record.scheduledStart)),
        statusLabels[record.status],
        record.recorderName,
        new Intl.DateTimeFormat("en-IN", {
          dateStyle: "short",
          timeStyle: "short",
          timeZone: timezone,
        }).format(new Date(record.recordedAt)),
        record.correctionCount,
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${rows.map((row) => row.map(cell).join(",")).join("\r\n")}`], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `attendance-${from}-to-${to}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

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
          <InputDate value={from} onChange={(value) => { setFrom(value); setRecordOffset(0); }} />
        </label>
        <label className="grid gap-2 text-xs font-semibold text-muted">
          To
          <InputDate value={to} onChange={(value) => { setTo(value); setRecordOffset(0); }} />
        </label>
        <Button variant="outline" onClick={() => void applyFilter()} disabled={loading}>
          Apply dates
        </Button>
      </section>

      <section className="mt-6 rounded-2xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold">Attendance operations</h2>
            <p className="mt-1 text-xs text-muted">
              {sessionSummaries.length} sessions · {unmarkedSessions.length} with unmarked
              attendance · {records.length} recorded marks
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={view === "sessions" ? "default" : "outline"}
              onClick={() => {
                setView("sessions");
                setSelectedSessionId("");
              }}
            >
              Session queue
            </Button>
            <Button
              size="sm"
              variant={view === "records" ? "default" : "outline"}
              onClick={() => setView("records")}
            >
              Recorded marks
            </Button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {statusCounts.map(({ status, count }) => (
            <span key={status} className="rounded-full bg-[#f4f6f7] px-3 py-1.5 text-muted">
              {statusLabels[status]} {count}
            </span>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <label className="grid gap-1 text-xs font-semibold text-muted">
            Batch
            <select
              className="h-10 min-w-48 rounded-xl border border-line bg-white px-3 text-sm font-normal text-foreground"
              value={batchFilter}
              onChange={(event) => { setBatchFilter(event.target.value); setRecordOffset(0); }}
            >
              <option value="">All batches</option>
              {batches.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          {view === "records" && (
            <label className="grid gap-1 text-xs font-semibold text-muted">
              Coach recorded by
              <select
                className="h-10 min-w-48 rounded-xl border border-line bg-white px-3 text-sm font-normal text-foreground"
                value={coachFilter}
                onChange={(event) => { setCoachFilter(event.target.value); setRecordOffset(0); }}
              >
                <option value="">All coaches</option>
                {coaches.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {view === "records" && (
            <label className="grid gap-1 text-xs font-semibold text-muted">
              Status
              <select
                className="h-10 min-w-40 rounded-xl border border-line bg-white px-3 text-sm font-normal text-foreground"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as AttendanceStatus | "all")
                }
              >
                <option value="all">All statuses</option>
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {statusLabels[status]}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </section>

      {view === "sessions" ? (
        <section className="mt-4 overflow-hidden rounded-2xl border border-line bg-white">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="font-semibold">Session-first attendance queue</h2>
            <span className="text-xs text-muted">{unmarkedSessions.length} need attention</span>
          </div>
          {loading ? (
            <p className="px-5 py-8 text-sm text-muted">Loading sessions…</p>
          ) : sessionSummaries.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted">No sessions in this date range.</p>
          ) : (
            <div className="divide-y divide-line">
              {sessionSummaries.map((session) => (
                <article
                  key={session.id}
                  className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
                >
                  <div>
                    <p className="font-medium">
                      {session.batchName}
                      {session.branchName ? ` · ${session.branchName}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {new Intl.DateTimeFormat("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: timezone,
                      }).format(new Date(session.startsAt))}{" "}
                      · {session.status}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {session.markedCount} of {session.expectedCount} students marked
                    </p>
                    {session.coachPresence.length ? (
                      <p className="mt-1 text-xs text-muted">
                        {session.coachPresence
                          .map(
                            (presence) =>
                              `${presence.coachName}: in ${presence.checkedInAt ? new Intl.DateTimeFormat("en-IN", { timeStyle: "short", timeZone: timezone }).format(new Date(presence.checkedInAt)) : "—"} · out ${presence.checkedOutAt ? new Intl.DateTimeFormat("en-IN", { timeStyle: "short", timeZone: timezone }).format(new Date(presence.checkedOutAt)) : "—"}`,
                          )
                          .join("  |  ")}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-muted">Coach check-in/out not recorded</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedSessionId(session.id);
                      setView("records");
                    }}
                  >
                    {session.markedCount ? "Review marks" : "No marks yet"}
                  </Button>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {view === "records" ? (
        <section className="mt-4 overflow-hidden rounded-2xl border border-line bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 className="font-semibold">Recorded attendance</h2>
              <span className="text-xs text-muted">
                {visibleRecords.length} matching mark{visibleRecords.length === 1 ? "" : "s"}
                {selectedSessionId ? " · selected session" : ""}
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={!visibleRecords.length}
              onClick={() => void exportVisibleRecords().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not export attendance."))}
            >
              Export filtered CSV
            </Button>
          </div>
          {selectedSessionId ? (
            <button
              className="px-5 pt-3 text-xs font-semibold text-accent hover:underline"
              onClick={() => setSelectedSessionId("")}
            >
              Show all sessions
            </button>
          ) : null}
          {loading ? (
            <p className="px-5 py-8 text-sm text-muted">Loading attendance…</p>
          ) : visibleRecords.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted">
              No attendance was recorded in this date range.
            </p>
          ) : (
            <div className="divide-y divide-line">
              {visibleRecords.map((record) => {
                const changed = (statusesById[record.id] ?? record.status) !== record.status;
                return (
                  <article
                    key={record.id}
                    className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center"
                  >
                    <div>
                      <div className="font-medium">{record.studentName}</div>
                      <div className="mt-1 text-sm text-muted">
                        {record.batchName} ·{" "}
                        {new Intl.DateTimeFormat("en-IN", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: timezone,
                        }).format(new Date(record.scheduledStart))}
                      </div>
                      <div className="mt-1 text-xs text-muted">
                        Recorded by {record.recorderName} ·{" "}
                        {new Intl.DateTimeFormat("en-IN", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: timezone,
                        }).format(new Date(record.recordedAt))}
                      </div>
                    </div>
                    {canCorrect ? <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto] lg:grid-cols-1 xl:grid-cols-[1fr_1.4fr_auto]">
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
                    </div> : <p className="text-xs text-muted">View only — you do not have attendance correction access.</p>}
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
                                  {new Intl.DateTimeFormat("en-IN", {
                                    dateStyle: "medium",
                                    timeStyle: "short",
                                    timeZone: timezone,
                                  }).format(new Date(correction.correctedAt))}
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
          <div className="flex items-center justify-between border-t border-line px-5 py-3 text-xs text-muted">
            <span>Showing {recordOffset + (records.length ? 1 : 0)}–{recordOffset + records.length}; counts apply to this page</span>
            <span className="flex gap-2">
              <Button size="sm" variant="outline" disabled={recordOffset === 0 || loading} onClick={() => setRecordOffset((value) => Math.max(0, value - 50))}>Previous</Button>
              <Button size="sm" variant="outline" disabled={!recordHasMore || loading} onClick={() => setRecordOffset((value) => value + 50)}>Next</Button>
            </span>
          </div>
        </section>
      ) : null}
    </div>
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
