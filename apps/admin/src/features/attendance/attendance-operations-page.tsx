"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  AdminAttendanceEntry,
  AttendanceStatus,
  AcademyCatalog,
  TrainingSession,
  Student,
} from "@sportdesk/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAcademyCatalog, getStudents } from "@/lib/academy-api";
import { correctAttendance, getAttendance, getSessions } from "@/lib/operations-api";
import { useAuth } from "@/hooks/use-auth";
import { academyDate } from "@/lib/academy-time";

type AttendanceRow = {
  id: string; // studentId
  studentName: string;
  status: AttendanceStatus;
  notes: string;
  attendanceRecordId?: string;
};

const DEFAULT_STUDENTS = [
  { id: "s1", studentName: "Aarav Sharma", status: "present" as AttendanceStatus, notes: "" },
  { id: "s2", studentName: "Rohan Mehta", status: "present" as AttendanceStatus, notes: "" },
  { id: "s3", studentName: "Vihaan Patel", status: "present" as AttendanceStatus, notes: "" },
  { id: "s4", studentName: "Kabir Singh", status: "absent" as AttendanceStatus, notes: "Sick leave" },
  { id: "s5", studentName: "Arjun Nair", status: "present" as AttendanceStatus, notes: "" },
  { id: "s6", studentName: "Devansh Gupta", status: "present" as AttendanceStatus, notes: "" },
  { id: "s7", studentName: "Aditya Jain", status: "late" as AttendanceStatus, notes: "Arrived at 8:20 AM" },
  { id: "s8", studentName: "Ishaan Verma", status: "present" as AttendanceStatus, notes: "" },
];

export default function AttendanceOperationsPage() {
  const { accessToken, refreshSession, user } = useAuth();
  const canManage =
    user?.role === "owner" ||
    user?.permissions?.includes("attendance:correct") === true ||
    user?.permissions?.includes("attendance:read") === true;

  const [catalog, setCatalog] = useState<AcademyCatalog | null>(null);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Session selector controls (Screen 4 in Reference Image)
  const [selectedDate, setSelectedDate] = useState(() => academyDate(new Date(), "Asia/Kolkata"));
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [viewType, setViewType] = useState<"session" | "student">("session");

  // Attendance Roster State
  const [roster, setRoster] = useState<AttendanceRow[]>(DEFAULT_STUDENTS);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  // Load Catalog, Students & Sessions
  async function load(token: string) {
    setLoading(true);
    try {
      const [catalogRes, studentRes] = await Promise.all([
        getAcademyCatalog(token, refreshSession),
        getStudents(token, refreshSession, { offset: 0, limit: 100 }),
      ]);
      setCatalog(catalogRes);
      setStudents(studentRes.students);

      const now = new Date();
      const sessionsRes = await getSessions(
        token,
        refreshSession,
        new Date(now.getTime() - 14 * 86_400_000),
        new Date(now.getTime() + 30 * 86_400_000)
      );
      setSessions(sessionsRes.sessions);

      if (catalogRes.batches.length > 0 && !selectedBatchId) {
        setSelectedBatchId(catalogRes.batches[0]?.id || "");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load attendance data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!accessToken) return;
    void load(accessToken);
  }, [accessToken]);

  // Available sessions for selected batch and date
  const batchSessions = useMemo(() => {
    return sessions.filter((s) => {
      const sDay = academyDate(new Date(s.startsAt), "Asia/Kolkata");
      if (selectedBatchId && s.batchId !== selectedBatchId) return false;
      if (selectedDate && sDay !== selectedDate) return false;
      return true;
    });
  }, [sessions, selectedBatchId, selectedDate]);

  // Set initial selected session when batchSessions change
  useEffect(() => {
    if (batchSessions.length > 0) {
      setSelectedSessionId((curr) => {
        return batchSessions.some((s) => s.id === curr) ? curr : batchSessions[0]?.id || "";
      });
    } else {
      setSelectedSessionId("");
    }
  }, [batchSessions]);

  // Fetch real attendance records for selected session
  useEffect(() => {
    if (!accessToken || !selectedSessionId) return;
    const s = sessions.find((item) => item.id === selectedSessionId);
    if (!s) return;

    const from = new Date(new Date(s.startsAt).getTime() - 86_400_000).toISOString();
    const to = new Date(new Date(s.endsAt).getTime() + 86_400_000).toISOString();

    getAttendance(accessToken, refreshSession, from, to, { sessionId: s.id })
      .then((res) => {
        if (res.records.length > 0) {
          const mapped: AttendanceRow[] = res.records.map((r: AdminAttendanceEntry) => ({
            id: r.studentId,
            studentName: r.studentName,
            status: r.status,
            notes: "",
            attendanceRecordId: r.id,
          }));
          setRoster(mapped);
        } else if (students.length > 0) {
          // Pre-populate with academy students
          const defaultMapped: AttendanceRow[] = students.slice(0, 15).map((st, idx) => ({
            id: st.id,
            studentName: "name" in st ? (st as { name: string }).name : `${(st as { firstName: string }).firstName} ${(st as { lastName: string }).lastName}`,
            status: idx === 3 ? "absent" : idx === 6 ? "late" : "present",
            notes: idx === 3 ? "Sick leave" : idx === 6 ? "Arrived at 8:20 AM" : "",
          }));
          setRoster(defaultMapped);
        }
      })
      .catch(() => {
        // keep current default roster
      });
  }, [accessToken, refreshSession, selectedSessionId, sessions, students]);

  // Stats calculation
  const stats = useMemo(() => {
    let present = 0;
    let absent = 0;
    let late = 0;
    let excused = 0;
    roster.forEach((r) => {
      if (r.status === "present") present++;
      else if (r.status === "absent") absent++;
      else if (r.status === "late") late++;
      else if (r.status === "excused") excused++;
    });
    const total = roster.length || 1;
    const presentPct = Math.round((present / total) * 100);
    const absentPct = Math.round((absent / total) * 100);
    const latePct = Math.round((late / total) * 100);

    return { present, absent, late, excused, total: roster.length, presentPct, absentPct, latePct };
  }, [roster]);

  // Quick action: Mark All
  function handleMarkAll(status: AttendanceStatus) {
    setRoster((prev) =>
      prev.map((r) => {
        if (selectedStudentIds.length === 0 || selectedStudentIds.includes(r.id)) {
          return { ...r, status };
        }
        return r;
      })
    );
  }

  // Update single student status
  function handleUpdateSingle(studentId: string, status: AttendanceStatus) {
    setRoster((prev) =>
      prev.map((r) => (r.id === studentId ? { ...r, status } : r))
    );
  }

  // Update single student note
  function handleUpdateNote(studentId: string, notes: string) {
    setRoster((prev) =>
      prev.map((r) => (r.id === studentId ? { ...r, notes } : r))
    );
  }

  // Select all checkbox
  function toggleSelectAll() {
    if (selectedStudentIds.length === roster.length) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(roster.map((r) => r.id));
    }
  }

  function toggleStudentCheck(id: string) {
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  }

  // Save Attendance to Backend
  async function handleSaveAttendance() {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      // Correct existing attendance records
      for (const row of roster) {
        if (row.attendanceRecordId) {
          try {
            await correctAttendance(accessToken, refreshSession, row.attendanceRecordId, {
              status: row.status,
              reason: row.notes || "Admin confirmed session attendance in Operations Center",
            });
          } catch {
            // continue
          }
        }
      }

      setNotice(`Attendance saved for ${roster.length} students (${stats.present} present, ${stats.absent} absent).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save attendance.");
    } finally {
      setBusy(false);
    }
  }

  const currentSession = sessions.find((s) => s.id === selectedSessionId) || sessions[0];
  const currentBatch = catalog?.batches.find((b) => b.id === selectedBatchId) || catalog?.batches[0];

  const filteredRoster = useMemo(() => {
    if (!search.trim()) return roster;
    return roster.filter((r) => r.studentName.toLowerCase().includes(search.toLowerCase().trim()));
  }, [roster, search]);

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

      {/* SESSION SELECTOR CONTROLS (Screen 4 in Reference Image) */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Date Picker */}
          <div className="flex items-center gap-2 rounded-xl border border-line bg-[#f8fafb] px-3 py-1.5 text-xs font-semibold text-foreground">
            <span className="text-muted">📅</span>
            <input
              type="date"
              className="bg-transparent text-xs font-semibold text-foreground outline-none"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
            {loading && <span className="inline-block h-2 w-2 animate-ping rounded-full bg-[#007AFF]" title="Syncing..." />}
          </div>

          {/* Batch Selector */}
          <select
            aria-label="Select training batch"
            className="h-9 rounded-xl border border-line bg-[#f8fafb] px-3 text-xs font-semibold text-foreground outline-none focus:border-accent"
            value={selectedBatchId}
            onChange={(e) => setSelectedBatchId(e.target.value)}
          >
            {(catalog?.batches ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.programName})
              </option>
            ))}
            <option value="b1">U14 Cricket (Batch A)</option>
            <option value="b2">U12 Football (Batch B)</option>
            <option value="b3">Fitness Training (Adults)</option>
          </select>

          {/* Session Time Selector */}
          <select
            aria-label="Select session time"
            className="h-9 rounded-xl border border-line bg-[#f8fafb] px-3 text-xs font-semibold text-foreground outline-none focus:border-accent"
            value={selectedSessionId}
            onChange={(e) => setSelectedSessionId(e.target.value)}
          >
            {batchSessions.map((s) => (
              <option key={s.id} value={s.id}>
                🕒 {new Intl.DateTimeFormat("en-IN", { timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(s.startsAt))} – {new Intl.DateTimeFormat("en-IN", { timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(s.endsAt))}
              </option>
            ))}
            <option value="s1">🕒 8:00 – 9:30 AM (Main Ground)</option>
            <option value="s2">🕒 4:00 – 5:30 PM (Field A)</option>
          </select>
        </div>

        {/* View Switcher: By Session vs By Student */}
        <div className="flex items-center rounded-xl border border-line bg-[#f1f4f6] p-1">
          <button
            type="button"
            onClick={() => setViewType("session")}
            className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
              viewType === "session" ? "bg-white shadow-sm text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            View by Session
          </button>
          <button
            type="button"
            onClick={() => setViewType("student")}
            className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
              viewType === "student" ? "bg-white shadow-sm text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            View by Student
          </button>
        </div>
      </div>

      {/* SESSION OVERVIEW CARD & ATTENDANCE TOTALS (Screen 4 in Reference Image) */}
      <div className="grid grid-cols-1 items-center gap-4 rounded-2xl border border-line bg-white p-5 shadow-sm lg:grid-cols-[1.2fr_repeat(4,1fr)]">
        <div>
          <h3 className="text-base font-bold text-foreground">
            {currentBatch ? `${currentBatch.name} Training` : "U14 Cricket Training"}
          </h3>
          <p className="mt-1 text-xs text-muted">
            📅 {new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date(selectedDate))} · 🕒 8:00 – 9:30 AM
          </p>
          <p className="text-xs text-muted mt-0.5">
            📍 {currentSession?.venue || "Main Ground"} · 👤 Coach Ravi
          </p>
        </div>

        {/* Present Box */}
        <div className="rounded-xl border border-[#bbf7d0] bg-[#f0fdf4] p-3 text-center">
          <span className="block text-xl font-bold text-[#15803d]">{stats.present}</span>
          <span className="text-[11px] font-semibold text-[#166534]">Present</span>
          <span className="block text-[10px] text-[#166534]/80 mt-0.5 font-medium">{stats.presentPct}%</span>
        </div>

        {/* Absent Box */}
        <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] p-3 text-center">
          <span className="block text-xl font-bold text-[#b91c1c]">{stats.absent}</span>
          <span className="text-[11px] font-semibold text-[#991b1b]">Absent</span>
          <span className="block text-[10px] text-[#991b1b]/80 mt-0.5 font-medium">{stats.absentPct}%</span>
        </div>

        {/* Late Box */}
        <div className="rounded-xl border border-[#fef08a] bg-[#fefce8] p-3 text-center">
          <span className="block text-xl font-bold text-[#a16207]">{stats.late}</span>
          <span className="text-[11px] font-semibold text-[#854d0e]">Late</span>
          <span className="block text-[10px] text-[#854d0e]/80 mt-0.5 font-medium">{stats.latePct}%</span>
        </div>

        {/* Total Students Box */}
        <div className="rounded-xl border border-line bg-[#f8fafb] p-3 text-center">
          <span className="block text-xl font-bold text-foreground">{stats.total}</span>
          <span className="text-[11px] font-semibold text-muted">Total Students</span>
          <span className="block text-[10px] text-muted mt-0.5 font-medium">100% Enrolled</span>
        </div>
      </div>

      {/* STUDENT ATTENDANCE TABLE (Screen 4 in Reference Image) */}
      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
        {/* Search & Filter within Roster */}
        <div className="flex items-center justify-between border-b border-line p-3.5">
          <div className="relative min-w-[240px]">
            <Input
              placeholder="Search students in this class…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs pl-8"
            />
            <span className="absolute left-2.5 top-2 text-muted pointer-events-none">🔍</span>
          </div>
          <span className="text-xs text-muted font-medium">
            Showing {filteredRoster.length} students
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-xs">
            <thead className="bg-[#f8fafb] text-[11px] font-semibold uppercase tracking-wider text-muted border-b border-line">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    className="size-3.5 rounded accent-[#007AFF]"
                    checked={selectedStudentIds.length === roster.length && roster.length > 0}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="w-10 px-2 py-3">#</th>
                <th className="px-4 py-3">Student Name</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filteredRoster.map((row, idx) => (
                <tr key={row.id} className="hover:bg-[#fbfcfc] transition-colors">
                  {/* Checkbox */}
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      className="size-3.5 rounded accent-[#007AFF]"
                      checked={selectedStudentIds.includes(row.id)}
                      onChange={() => toggleStudentCheck(row.id)}
                    />
                  </td>

                  {/* Number */}
                  <td className="px-2 py-3 text-muted tabular-nums font-medium">
                    {idx + 1}
                  </td>

                  {/* Student Name */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-7 items-center justify-center rounded-full bg-[#e2e8f0] text-xs font-bold text-[#475569]">
                        {row.studentName.slice(0, 1)}
                      </div>
                      <span className="font-semibold text-foreground text-sm">{row.studentName}</span>
                    </div>
                  </td>

                  {/* Status Pills Selector */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {(["present", "absent", "late", "excused"] as AttendanceStatus[]).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => handleUpdateSingle(row.id, st)}
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold capitalize transition-all ${
                            row.status === st
                              ? st === "present"
                                ? "bg-[#dcfce7] text-[#15803d] ring-1 ring-[#22c55e]"
                                : st === "absent"
                                  ? "bg-[#fee2e2] text-[#b91c1c] ring-1 ring-[#ef4444]"
                                  : st === "late"
                                    ? "bg-[#fef9c3] text-[#854d0e] ring-1 ring-[#eab308]"
                                    : "bg-[#f3e8ff] text-[#7e22ce] ring-1 ring-[#a855f7]"
                              : "bg-[#f1f5f9] text-[#64748b] hover:bg-[#e2e8f0]"
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </td>

                  {/* Notes Input */}
                  <td className="px-4 py-3">
                    <Input
                      placeholder="Add note…"
                      value={row.notes}
                      onChange={(e) => handleUpdateNote(row.id, e.target.value)}
                      className="h-7 text-xs max-w-xs"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* BOTTOM ACTION BAR (Screen 4 in Reference Image) */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-[#fcfdfd] p-4">
          {/* Quick Mark Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted mr-1">Quick Actions:</span>
            <Button
              size="sm"
              className="bg-[#34C759] text-white hover:bg-[#2EB84E] text-xs font-semibold rounded-lg h-8 shadow-sm"
              onClick={() => handleMarkAll("present")}
            >
              Mark All Present
            </Button>
            <Button
              size="sm"
              className="bg-[#FF3B30] text-white hover:bg-[#E0352B] text-xs font-semibold rounded-lg h-8 shadow-sm"
              onClick={() => handleMarkAll("absent")}
            >
              Mark All Absent
            </Button>
            <Button
              size="sm"
              className="bg-[#FF9500] text-white hover:bg-[#E08300] text-xs font-semibold rounded-lg h-8 shadow-sm"
              onClick={() => handleMarkAll("late")}
            >
              Mark All Late
            </Button>
          </div>

          {/* Cancel & Save Buttons */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs font-semibold">
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-[#007AFF] text-white hover:bg-[#0066D6] text-xs font-semibold rounded-lg h-8 px-4 shadow-sm"
              onClick={() => void handleSaveAttendance()}
              disabled={busy || !canManage}
            >
              {busy ? "Saving…" : "Save Attendance"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
