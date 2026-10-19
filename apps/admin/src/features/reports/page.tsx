"use client";

import { useEffect, useState } from "react";
import { calendarDateInTimezone, dateRangeInTimezone } from "@/lib/academy-time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout/page-header";
import { useAuth } from "@/hooks/use-auth";
import { getStudents } from "@/lib/academy-api";
import { getFinanceSummary } from "@/lib/finance-api";
import { getAllAttendance } from "@/lib/operations-api";
import { getAcademySettings } from "@/lib/settings-api";

function csvCell(value: string | number) {
  let text = String(value);
  if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const contents = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([`\uFEFF${contents}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const { accessToken, refreshSession, user } = useAuth();
  const canReadStudents = user?.role === "owner" || user?.permissions?.includes("students:read") === true;
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    getAcademySettings(accessToken, refreshSession)
      .then((settings) => {
        setTimezone(settings.timezone);
        const today = calendarDateInTimezone(new Date(), settings.timezone);
        setFrom(`${today.slice(0, 7)}-01`);
        setTo(today);
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not load academy timezone."));
  }, [accessToken, refreshSession]);

  function beginExport(requireRange = true) {
    setError(null);
    setNotice(null);
    if (!accessToken) return false;
    if (requireRange && (!from || !to || from > to)) {
      setError("Choose a valid report date range.");
      return false;
    }
    return true;
  }

  async function exportAttendance() {
    if (!beginExport() || !accessToken) return;
    setBusy("attendance");
    try {
      const range = dateRangeInTimezone(from, to, timezone);
      const attendanceRecords = await getAllAttendance(accessToken, refreshSession, range.from, range.to);
      const rows: Array<Array<string | number>> = [[
        "Student", "Batch", "Session date", "Attendance", "Recorded by", "Recorded at", "Corrections",
      ]];
      for (const record of attendanceRecords) {
        rows.push([
          record.studentName,
          record.batchName,
          new Date(record.scheduledStart).toISOString(),
          record.status,
          record.recorderName,
          new Date(record.recordedAt).toISOString(),
          record.correctionCount,
        ]);
      }
      downloadCsv(`attendance-${from}-to-${to}.csv`, rows);
      setNotice(`Exported ${attendanceRecords.length} attendance records. Unmarked session rosters are not included.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not export attendance.");
    } finally {
      setBusy(null);
    }
  }

  async function exportStudents() {
    if (!beginExport(false) || !accessToken) return;
    setBusy("students");
    try {
      const allStudents = [];
      const pageSize = 100;
      for (let offset = 0; ; offset += pageSize) {
        const page = await getStudents(accessToken, refreshSession, { offset, limit: pageSize });
        allStudents.push(...page.students);
        if (offset + page.students.length >= (page.total ?? page.students.length) || page.students.length === 0) break;
      }
      const rows: Array<Array<string | number>> = [[
        "Student ID", "First name", "Last name", "Status", "Active batches", "Created at",
      ]];
      for (const student of allStudents) {
        rows.push([
          student.id,
          student.firstName,
          student.lastName,
          student.status,
          student.enrollments.filter((enrollment) => enrollment.status === "active")
            .map((enrollment) => enrollment.batchName).join("; "),
          new Date(student.createdAt).toISOString(),
        ]);
      }
      downloadCsv("academy-student-directory.csv", rows);
      setNotice(`Exported ${allStudents.length} student records. Guardian contact details are excluded from this export.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not export the student directory.");
    } finally {
      setBusy(null);
    }
  }

  async function exportFinance() {
    if (!beginExport() || !accessToken) return;
    setBusy("finance");
    try {
      const summary = await getFinanceSummary(accessToken, refreshSession, { from, to });
      const rows: Array<Array<string | number>> = [
        ["Metric", "Amount", "Currency"],
        ["Invoice value issued", summary.invoicedPaise / 100, summary.currency],
        ["Payments received", summary.collectedPaise / 100, summary.currency],
        ["Refunds reversed", summary.refundsPaise / 100, summary.currency],
        ["Net collections", summary.netCollectionsPaise / 100, summary.currency],
        ["Outstanding invoice balance", summary.outstandingPaise / 100, summary.currency],
        ["Academy expenses", summary.expensesPaise / 100, summary.currency],
        ["Net cash flow", summary.netCashFlowPaise / 100, summary.currency],
        ["Period", `${summary.from} to ${summary.to}`, ""],
      ];
      downloadCsv(`finance-summary-${from}-to-${to}.csv`, rows);
      setNotice("Exported the finance summary from the recorded ledger for the selected period.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not export finance summary.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="sd-page">
      <PageHeader eyebrow="Academy data" title="Reports" description="Export live attendance, student directory, and finance records for your academy." />

      <div className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm">
        <label className="space-y-1 text-xs font-semibold text-muted">
          <span>Period from</span>
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="space-y-1 text-xs font-semibold text-muted">
          <span>Period to</span>
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
      </div>

      {error ? <div role="alert" className="mt-4 rounded-xl border border-[#f2d5ce] bg-[#fff7f5] p-4 text-sm text-[#984d3f]">{error}</div> : null}
      {notice ? <div role="status" className="mt-4 rounded-xl border border-[#d8e9e5] bg-[#f1faf7] p-4 text-sm text-accent">{notice}</div> : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <ReportCard
          title="Attendance report"
          description="Recorded student attendance marks, session date, coach recorder, and correction count for the selected period."
          buttonLabel="Export attendance CSV"
          busy={busy === "attendance"}
          disabled={busy !== null}
          onClick={() => void exportAttendance()}
        />
        {canReadStudents ? <ReportCard
          title="Student directory"
          description="Current student status, active batch assignments, and record creation date. Guardian contact data is omitted."
          buttonLabel="Export student CSV"
          busy={busy === "students"}
          disabled={busy !== null}
          onClick={() => void exportStudents()}
        /> : null}
        <ReportCard
          title="Finance summary"
          description="Recorded invoices, receipts, refunds, open balance, expenses, and net cash flow from the selected period."
          buttonLabel="Export finance CSV"
          busy={busy === "finance"}
          disabled={busy !== null}
          onClick={() => void exportFinance()}
        />
      </div>
      <p className="mt-5 text-xs leading-5 text-muted">
        Reports include only records available in the academy workspace. They do not include legacy inquiries,
        coach compensation, or unrecorded attendance.
      </p>
    </section>
  );
}

function ReportCard({
  title,
  description,
  buttonLabel,
  busy,
  disabled,
  onClick,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <article className="flex flex-col rounded-2xl border border-line bg-white p-6 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Export</p>
      <h2 className="mt-2 text-lg font-semibold">{title}</h2>
      <p className="mt-2 flex-1 text-sm leading-6 text-muted">{description}</p>
      <Button className="mt-6 self-start" disabled={disabled} onClick={onClick}>
        {busy ? "Preparing…" : buttonLabel}
      </Button>
    </article>
  );
}
