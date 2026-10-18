"use client";

import { useEffect, useMemo, useState } from "react";
import type { AdminAttendanceEntry } from "@sportdesk/contracts";
import { calendarDateInTimezone, dateRangeInTimezone } from "@/lib/academy-time";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { getAttendance } from "@/lib/operations-api";
import { getAcademySettings } from "@/lib/settings-api";

type StudentSummary = {
  studentId: string;
  studentName: string;
  sessions: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  lastTraining: string;
  batches: Set<string>;
};

export default function PerformancePage() {
  const { accessToken, refreshSession } = useAuth();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [records, setRecords] = useState<AdminAttendanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    getAcademySettings(accessToken, refreshSession)
      .then((settings) => {
        if (!active) return;
        setTimezone(settings.timezone);
        const today = calendarDateInTimezone(new Date(), settings.timezone);
        setFrom(`${today.slice(0, 7)}-01`);
        setTo(today);
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Could not load academy timezone.");
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [accessToken, refreshSession]);

  useEffect(() => {
    if (!accessToken || !from || !to) return;
    if (from > to) {
      setError("Choose a valid date range.");
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    const range = dateRangeInTimezone(from, to, timezone);
    getAttendance(accessToken, refreshSession, range.from, range.to)
      .then((result) => {
        if (active) setRecords(result.records);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load performance data.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, from, refreshSession, timezone, to]);

  const students = useMemo(() => {
    const grouped = new Map<string, StudentSummary>();
    for (const record of records) {
      const student = grouped.get(record.studentId) ?? {
        studentId: record.studentId,
        studentName: record.studentName,
        sessions: 0,
        present: 0,
        late: 0,
        absent: 0,
        excused: 0,
        lastTraining: record.scheduledStart,
        batches: new Set<string>(),
      };
      student.sessions += 1;
      student[record.status] += 1;
      student.batches.add(record.batchName);
      if (record.scheduledStart > student.lastTraining) student.lastTraining = record.scheduledStart;
      grouped.set(record.studentId, student);
    }
    return [...grouped.values()].sort((left, right) => {
      const leftMarked = left.sessions - left.excused;
      const rightMarked = right.sessions - right.excused;
      const leftRate = leftMarked ? (left.present + left.late) / leftMarked : 0;
      const rightRate = rightMarked ? (right.present + right.late) / rightMarked : 0;
      return rightRate - leftRate || right.sessions - left.sessions || left.studentName.localeCompare(right.studentName);
    });
  }, [records]);

  const totals = useMemo(() => {
    const attended = records.filter((record) => record.status === "present" || record.status === "late").length;
    const eligible = records.filter((record) => record.status !== "excused").length;
    return {
      records: records.length,
      students: students.length,
      attended,
      attendanceRate: eligible ? Math.round((attended / eligible) * 100) : 0,
      absent: records.filter((record) => record.status === "absent").length,
    };
  }, [records, students.length]);

  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Athlete insights</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Performance</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
        Review training consistency from attendance records across your academy.
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm">
        <label className="space-y-1 text-xs font-semibold text-muted">
          <span>From</span>
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="space-y-1 text-xs font-semibold text-muted">
          <span>To</span>
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
      </div>

      <div className="mt-5 rounded-xl border border-[#e9e3c9] bg-[#fffdf3] p-4 text-sm leading-6 text-[#716743]">
        These indicators use recorded attendance only. Discipline specific assessments, coach evaluations,
        and athlete progress notes are not part of this data model yet.
      </div>
      {error ? <div role="alert" className="mt-4 rounded-xl border border-[#f2d5ce] bg-[#fff7f5] p-4 text-sm text-[#984d3f]">{error}</div> : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Attendance records", totals.records],
          ["Students with records", totals.students],
          ["Present or on time", totals.attended],
          ["Attendance rate", `${totals.attendanceRate}%`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-line bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-muted">{label}</p>
            <p className="mt-3 text-2xl font-bold tracking-tight">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-semibold">Student training consistency</h2>
          <p className="mt-1 text-xs text-muted">
            Attendance rate is present plus late marks divided by recorded present, late, and absent marks;
            excused records are excluded.
          </p>
        </div>
        {loading ? <p className="p-6 text-sm text-muted">Loading attendance data…</p> : null}
        {!loading && students.length === 0 ? (
          <p className="p-6 text-sm text-muted">No attendance has been recorded for this period.</p>
        ) : null}
        {!loading && students.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-[#f7f9f9] text-xs text-muted">
                <tr>
                  <th className="px-5 py-3 font-semibold">Student</th>
                  <th className="px-5 py-3 font-semibold">Batches</th>
                  <th className="px-5 py-3 font-semibold">Sessions</th>
                  <th className="px-5 py-3 font-semibold">Present</th>
                  <th className="px-5 py-3 font-semibold">Late</th>
                  <th className="px-5 py-3 font-semibold">Absent</th>
                  <th className="px-5 py-3 font-semibold">Excused</th>
                  <th className="px-5 py-3 font-semibold">Rate</th>
                  <th className="px-5 py-3 font-semibold">Last session</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {students.map((student) => {
                  const eligible = student.sessions - student.excused;
                  const rate = eligible ? Math.round(((student.present + student.late) / eligible) * 100) : 0;
                  return (
                    <tr key={student.studentId}>
                      <td className="px-5 py-3 font-medium">{student.studentName}</td>
                      <td className="px-5 py-3 text-muted">{[...student.batches].join(", ")}</td>
                      <td className="px-5 py-3">{student.sessions}</td>
                      <td className="px-5 py-3">{student.present}</td>
                      <td className="px-5 py-3">{student.late}</td>
                      <td className="px-5 py-3">{student.absent}</td>
                      <td className="px-5 py-3">{student.excused}</td>
                      <td className="px-5 py-3 font-semibold">{rate}%</td>
                      <td className="px-5 py-3 text-muted">{new Date(student.lastTraining).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}
