"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type {
  Expense,
  FeeCharge,
  FeeChargeStateFilter,
  FinanceSummary,
  Student,
} from "@sportdesk/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getStudents } from "@/lib/academy-api";
import { ApiRequestError } from "@/lib/auth-api";
import {
  calendarDateInTimezone,
  dateTimeInTimezone,
  dateTimeInputInTimezone,
} from "@/lib/academy-time";
import {
  createExpense,
  createFeeCharge,
  getExpenses,
  getFeeCharges,
  getFinanceSummary,
  recordFeePayment,
  refundFeePayment,
  voidExpense,
  voidFeeCharge,
} from "@/lib/finance-api";
import { useAuth } from "@/hooks/use-auth";
import { getAcademySettings } from "@/lib/settings-api";

type FinanceTab = "fees" | "expenses";

function moneyInPaise(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * 100);
}

function formatMoney(amountPaise: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amountPaise / 100);
}

function csvCell(value: string | number) {
  let text = String(value);
  if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

function rangeRows(summary: FinanceSummary) {
  return [
    ["Metric", "Amount", "Currency"],
    ["Invoice value issued in period", summary.invoicedPaise / 100, summary.currency],
    ["Payments received", summary.collectedPaise / 100, summary.currency],
    ["Refunds reversed", summary.refundsPaise / 100, summary.currency],
    ["Net collections", summary.netCollectionsPaise / 100, summary.currency],
    ["Outstanding invoice balance", summary.outstandingPaise / 100, summary.currency],
    ["Academy expenses", summary.expensesPaise / 100, summary.currency],
    ["Net cash flow", summary.netCashFlowPaise / 100, summary.currency],
  ];
}

export default function FinancePage({ initialTab = "fees" }: { initialTab?: FinanceTab }) {
  const { accessToken, refreshSession, user } = useAuth();
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const today = calendarDateInTimezone(new Date(), timezone);
  const [tab, setTab] = useState<FinanceTab>(initialTab);

  useEffect(() => setTab(initialTab), [initialTab]);
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [charges, setCharges] = useState<FeeCharge[]>([]);
  const [chargeTotal, setChargeTotal] = useState(0);
  const [chargeSearch, setChargeSearch] = useState("");
  const [chargeState, setChargeState] = useState<FeeChargeStateFilter>("all");
  const [chargeOffset, setChargeOffset] = useState(0);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseTotal, setExpenseTotal] = useState(0);
  const [expenseOffset, setExpenseOffset] = useState(0);
  const [expenseSearch, setExpenseSearch] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [studentId, setStudentId] = useState("");
  const [description, setDescription] = useState("Monthly training fee");
  const [billingPeriod, setBillingPeriod] = useState("");
  const [dueDate, setDueDate] = useState(today);
  const [chargeAmount, setChargeAmount] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [discountReason, setDiscountReason] = useState("");

  const [paymentChargeId, setPaymentChargeId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "upi" | "bank_transfer">("upi");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentIdempotencyKey, setPaymentIdempotencyKey] = useState("");

  const [refundPaymentId, setRefundPaymentId] = useState<string | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundIdempotencyKey, setRefundIdempotencyKey] = useState("");

  const [expenseCategory, setExpenseCategory] = useState("Equipment");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expensePayee, setExpensePayee] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseMethod, setExpenseMethod] = useState<"cash" | "upi" | "bank_transfer">("upi");
  const [expenseSpentAt, setExpenseSpentAt] = useState(dateTimeInputInTimezone(new Date(), "Asia/Kolkata"));
  const [expenseReference, setExpenseReference] = useState("");
  const [expenseNote, setExpenseNote] = useState("");

  const currency = summary?.currency ?? "INR";
  const pageSize = 25;
  const reportMonth = useMemo(() => `${from} — ${to}`, [from, to]);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    const now = new Date();
    const defaultToday = calendarDateInTimezone(now, "Asia/Kolkata");
    const defaultMonthStart = `${defaultToday.slice(0, 7)}-01`;
    const defaultExpenseTime = dateTimeInputInTimezone(now, "Asia/Kolkata");
    getAcademySettings(accessToken, refreshSession)
      .then((settings) => {
        if (!active) return;
        const academyToday = calendarDateInTimezone(now, settings.timezone);
        setTimezone(settings.timezone);
        setFrom((current) => current === defaultMonthStart ? `${academyToday.slice(0, 7)}-01` : current);
        setTo((current) => current === defaultToday ? academyToday : current);
        setDueDate((current) => current === defaultToday ? academyToday : current);
        setExpenseSpentAt((current) =>
          current === defaultExpenseTime
            ? dateTimeInputInTimezone(now, settings.timezone)
            : current,
        );
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load academy timezone.");
      });
    return () => {
      active = false;
    };
  }, [accessToken, refreshSession]);

  const loadData = useCallback(
    async (token: string) => {
      const [summaryResult, chargeResult, expenseResult, studentResult] = await Promise.all([
        getFinanceSummary(token, refreshSession, { from, to }),
        getFeeCharges(token, refreshSession, {
          offset: chargeOffset,
          limit: pageSize,
          state: chargeState,
          ...(chargeSearch.trim() ? { search: chargeSearch.trim() } : {}),
        }),
        getExpenses(token, refreshSession, {
          from,
          to,
          offset: expenseOffset,
          limit: pageSize,
          ...(expenseSearch.trim() ? { search: expenseSearch.trim() } : {}),
        }),
        getStudents(token, refreshSession, { offset: 0, limit: 100 }),
      ]);
      setSummary(summaryResult);
      setCharges(chargeResult.charges);
      setChargeTotal(chargeResult.total);
      setExpenses(expenseResult.expenses);
      setExpenseTotal(expenseResult.total);
      setStudents(studentResult.students);
      setStudentId((current) => current || studentResult.students[0]?.id || "");
    },
    [
      chargeOffset,
      chargeSearch,
      chargeState,
      expenseOffset,
      expenseSearch,
      from,
      refreshSession,
      to,
    ],
  );

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    setLoading(true);
    setError(null);
    loadData(accessToken)
      .catch((caught: unknown) => {
        if (active)
          setError(caught instanceof Error ? caught.message : "Could not load finance records.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, loadData]);

  async function refresh() {
    if (!accessToken) return;
    await loadData(accessToken);
  }

  async function createCharge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;
    const amountPaise = moneyInPaise(chargeAmount);
    const discountPaise = discountAmount.trim() ? Math.round(Number(discountAmount) * 100) : 0;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await createFeeCharge(accessToken, refreshSession, {
        studentId,
        description,
        billingPeriod,
        dueDate,
        amountPaise,
        discountPaise,
        ...(discountPaise > 0 ? { discountReason } : {}),
      });
      setChargeAmount("");
      setDiscountAmount("");
      setDiscountReason("");
      setNotice("Invoice created and added to the student ledger.");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create this invoice.");
    } finally {
      setBusy(false);
    }
  }

  async function savePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !paymentChargeId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const idempotencyKey = paymentIdempotencyKey || crypto.randomUUID();
      setPaymentIdempotencyKey(idempotencyKey);
      const result = await recordFeePayment(accessToken, refreshSession, paymentChargeId, {
        idempotencyKey,
        amountPaise: moneyInPaise(paymentAmount),
        method: paymentMethod,
        ...(paymentReference.trim() ? { reference: paymentReference.trim() } : {}),
        ...(paymentNote.trim() ? { note: paymentNote.trim() } : {}),
      });
      setNotice(`Receipt ${result.receiptNumber} recorded.`);
      setPaymentChargeId(null);
      setPaymentAmount("");
      setPaymentReference("");
      setPaymentNote("");
      setPaymentIdempotencyKey("");
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : "Could not record this payment.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveRefund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !refundPaymentId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const idempotencyKey = refundIdempotencyKey || crypto.randomUUID();
      setRefundIdempotencyKey(idempotencyKey);
      await refundFeePayment(accessToken, refreshSession, refundPaymentId, {
        idempotencyKey,
        amountPaise: moneyInPaise(refundAmount),
        reason: refundReason,
      });
      setRefundPaymentId(null);
      setRefundAmount("");
      setRefundReason("");
      setRefundIdempotencyKey("");
      setNotice("Refund reversal recorded in the ledger.");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not record this refund.");
    } finally {
      setBusy(false);
    }
  }

  async function voidCharge(charge: FeeCharge) {
    if (!accessToken || charge.payments.length > 0) return;
    const reason = window.prompt(`Reason for voiding invoice ${charge.invoiceNumber}:`);
    if (!reason?.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await voidFeeCharge(accessToken, refreshSession, charge.id, reason.trim());
      setNotice(`Invoice ${charge.invoiceNumber} was voided with a recorded reason.`);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not void this invoice.");
    } finally {
      setBusy(false);
    }
  }

  async function createAcademyExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await createExpense(accessToken, refreshSession, {
        category: expenseCategory,
        description: expenseDescription,
        payeeName: expensePayee,
        amountPaise: moneyInPaise(expenseAmount),
        method: expenseMethod,
        spentAt: dateTimeInTimezone(expenseSpentAt, timezone),
        reference: expenseReference,
        note: expenseNote,
      });
      setExpenseDescription("");
      setExpensePayee("");
      setExpenseAmount("");
      setExpenseReference("");
      setExpenseNote("");
      setExpenseSpentAt(dateTimeInputInTimezone(new Date(), timezone));
      setNotice("Academy expense recorded.");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not record this expense.");
    } finally {
      setBusy(false);
    }
  }

  async function reverseExpense(expense: Expense) {
    if (!accessToken || expense.status === "voided") return;
    const reason = window.prompt(`Reason for reversing ${expense.description}:`);
    if (!reason?.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await voidExpense(accessToken, refreshSession, expense.id, reason.trim());
      setNotice("Expense reversed with an audit reason.");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not reverse this expense.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadReport() {
    if (!accessToken || !summary) return;
    setExporting(true);
    setError(null);
    try {
      const allExpenses: Expense[] = [];
      let offset = 0;
      let total = 0;
      do {
        const page = await getExpenses(accessToken, refreshSession, {
          from,
          to,
          offset,
          limit: 100,
        });
        allExpenses.push(...page.expenses);
        total = page.total;
        offset += page.limit;
      } while (offset < total);

      const rows = [
        ...rangeRows(summary),
        [],
        [
          "Expense date",
          "Category",
          "Description",
          "Payee",
          "Method",
          "Reference",
          "Amount",
          "Status",
        ],
        ...allExpenses.map((expense) => [
          expense.spentAt,
          expense.category,
          expense.description,
          expense.payeeName ?? "",
          expense.method,
          expense.reference ?? "",
          expense.amountPaise / 100,
          expense.status,
        ]),
      ];
      const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `impact-fit-finance-${from}-to-${to}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not export this finance report.");
    } finally {
      setExporting(false);
    }
  }

  function printReceipt(charge: FeeCharge, payment: FeeCharge["payments"][number]) {
    const receiptWindow = window.open("", "_blank");
    if (!receiptWindow) {
      setError("Allow pop-ups to print this receipt.");
      return;
    }
    const rows: [string, string][] = [
      ["Academy", user?.academyName ?? "Impact Academy"],
      ["Student", charge.studentName],
      ["Invoice", charge.invoiceNumber],
      ["Receipt", payment.receiptNumber],
      ["Description", charge.description],
      ["Billing period", charge.billingPeriod ?? "—"],
      ["Received", new Date(payment.receivedAt).toLocaleString()],
      ["Method", payment.method.replace("_", " ")],
      ["Reference", payment.reference ?? "—"],
      ["Invoice total", formatMoney(charge.amountPaise - charge.discountPaise, charge.currency)],
      ["This payment", formatMoney(payment.amountPaise, charge.currency)],
      ["Discount / waiver", formatMoney(charge.discountPaise, charge.currency)],
      ["Discount reason", charge.discountReason ?? "—"],
      ["Current balance", formatMoney(charge.balancePaise, charge.currency)],
    ];
    receiptWindow.document.write(
      `<!doctype html><html><head><title>${escapeHtml(payment.receiptNumber)}</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:15px system-ui,sans-serif;color:#17212d;max-width:720px;margin:48px auto;padding:0 24px}h1{font-size:26px}p{color:#667481}table{width:100%;border-collapse:collapse;margin-top:24px}td{padding:12px 8px;border-bottom:1px solid #e1e6e9}td:first-child{color:#667481;width:40%}@media print{body{margin:0 auto}}</style></head><body><h1>Payment receipt</h1><p>${escapeHtml(user?.academyName ?? "Impact Academy")}</p><table>${rows.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td><strong>${escapeHtml(value)}</strong></td></tr>`).join("")}</table><p>Thank you. This receipt reflects the payment recorded by the academy.</p><script>window.onload=()=>window.print()</script></body></html>`,
    );
    receiptWindow.document.close();
  }

  return (
    <div className="mx-auto max-w-[1320px] px-5 py-8 sm:px-8 sm:py-10">
        <p className="text-sm font-medium text-accent">Money in and operating costs</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-[-0.04em]">Finance</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Create student invoices, record partial payments, track refunds, and report academy
              expenses. Parent accounts can view linked invoices and receipts.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={exporting || loading || !summary}
            onClick={() => void downloadReport()}
          >
            {exporting ? "Preparing report…" : "Export period report"}
          </Button>
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

        <section className="mt-7 rounded-2xl border border-line bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                Report period
              </p>
              <p className="mt-1 text-sm text-muted">
                Summary uses the academy timezone. Outstanding is the current open balance.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="grid gap-1 text-xs font-medium text-muted">
                From
                <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
              </label>
              <label className="grid gap-1 text-xs font-medium text-muted">
                To
                <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
              </label>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Collected"
            value={summary ? formatMoney(summary.collectedPaise, currency) : "—"}
            detail={reportMonth}
          />
          <Metric
            label="Refunds"
            value={summary ? formatMoney(summary.refundsPaise, currency) : "—"}
            detail="Recorded reversals"
          />
          <Metric
            label="Outstanding"
            value={summary ? formatMoney(summary.outstandingPaise, currency) : "—"}
            detail="Open invoice balance"
          />
          <Metric
            label="Expenses"
            value={summary ? formatMoney(summary.expensesPaise, currency) : "—"}
            detail={reportMonth}
          />
          <Metric
            label="Invoiced"
            value={summary ? formatMoney(summary.invoicedPaise, currency) : "—"}
            detail="Net of discounts and waivers"
          />
          <Metric
            label="Net collections"
            value={summary ? formatMoney(summary.netCollectionsPaise, currency) : "—"}
            detail="Payments less refunds"
          />
          <Metric
            label="Net cash flow"
            value={summary ? formatMoney(summary.netCashFlowPaise, currency) : "—"}
            detail="Net collections less expenses"
          />
        </section>

        <div
          className="mt-8 flex gap-2 border-b border-line"
          role="tablist"
          aria-label="Finance sections"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "fees"}
            onClick={() => setTab("fees")}
            className={`border-b-2 px-3 py-3 text-sm font-semibold ${tab === "fees" ? "border-accent text-accent" : "border-transparent text-muted"}`}
          >
            Parent fees and receipts
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "expenses"}
            onClick={() => setTab("expenses")}
            className={`border-b-2 px-3 py-3 text-sm font-semibold ${tab === "expenses" ? "border-accent text-accent" : "border-transparent text-muted"}`}
          >
            Academy expenses
          </button>
        </div>

        {tab === "fees" ? (
          <div className="mt-6 grid items-start gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
            <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                New student invoice
              </p>
              <h2 className="mt-2 text-lg font-semibold">Issue a manual charge</h2>
              <p className="mt-1 text-sm leading-5 text-muted">
                Add monthly or term fees per student. Waivers require a reason.
              </p>
              <form className="mt-5 space-y-3" onSubmit={(event) => void createCharge(event)}>
                <label className="grid gap-1 text-xs font-medium text-muted">
                  Student
                  <select
                    className="h-11 rounded-xl border border-line bg-white px-3 text-sm text-foreground"
                    value={studentId}
                    onChange={(event) => setStudentId(event.target.value)}
                    required
                  >
                    <option value="">Select student</option>
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.firstName} {student.lastName} · {student.status}
                      </option>
                    ))}
                  </select>
                </label>
                <Input
                  aria-label="Invoice description"
                  placeholder="Monthly training fee"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  required
                />
                <Input
                  aria-label="Billing period"
                  placeholder="October 2026 or Term 1"
                  value={billingPeriod}
                  onChange={(event) => setBillingPeriod(event.target.value)}
                />
                <div className="grid grid-cols-2 gap-3">
                  <label className="grid gap-1 text-xs font-medium text-muted">
                    Amount (₹)
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={chargeAmount}
                      onChange={(event) => setChargeAmount(event.target.value)}
                      required
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-medium text-muted">
                    Due date
                    <Input
                      type="date"
                      value={dueDate}
                      onChange={(event) => setDueDate(event.target.value)}
                      required
                    />
                  </label>
                </div>
                <Input
                  aria-label="Discount or waiver amount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Discount / waiver (₹), optional"
                  value={discountAmount}
                  onChange={(event) => setDiscountAmount(event.target.value)}
                />
                {Number(discountAmount) > 0 && (
                  <Input
                    aria-label="Discount reason"
                    placeholder="Reason for discount or waiver"
                    value={discountReason}
                    onChange={(event) => setDiscountReason(event.target.value)}
                    required
                  />
                )}
                <Button className="w-full" disabled={busy || !students.length}>
                  {busy ? "Saving…" : "Create invoice"}
                </Button>
              </form>
            </section>

            <section className="min-w-0 rounded-2xl border border-line bg-white p-5 sm:p-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                    Student ledger
                  </p>
                  <h2 className="mt-2 text-lg font-semibold">Invoices and receipts</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Input
                    aria-label="Search invoices"
                    placeholder="Search student or invoice"
                    value={chargeSearch}
                    onChange={(event) => {
                      setChargeOffset(0);
                      setChargeSearch(event.target.value);
                    }}
                  />
                  <select
                    className="h-11 rounded-xl border border-line bg-white px-3 text-sm"
                    value={chargeState}
                    onChange={(event) => {
                      setChargeOffset(0);
                      setChargeState(event.target.value as FeeChargeStateFilter);
                    }}
                  >
                    <option value="all">All invoices</option>
                    <option value="open">Open</option>
                    <option value="overdue">Overdue</option>
                    <option value="paid">Paid</option>
                    <option value="waived">Waived</option>
                    <option value="voided">Voided</option>
                  </select>
                </div>
              </div>

              {loading ? (
                <p className="mt-6 text-sm text-muted">Loading finance records…</p>
              ) : charges.length === 0 ? (
                <p className="mt-6 rounded-xl bg-[#f5f7f7] px-4 py-6 text-sm text-muted">
                  No invoices match this view.
                </p>
              ) : (
                <div className="mt-5 space-y-3">
                  {charges.map((charge) => {
                    const open = charge.status === "issued" && charge.balancePaise > 0;
                    const waived = charge.amountPaise === charge.discountPaise;
                    return (
                      <article key={charge.id} className="rounded-xl border border-line p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold text-accent">
                              {charge.invoiceNumber} · {charge.studentName}
                            </p>
                            <h3 className="mt-1 font-semibold">{charge.description}</h3>
                            <p className="mt-1 text-xs text-muted">
                              {charge.billingPeriod || "No billing period"} · Due {charge.dueDate}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${charge.status === "voided" ? "bg-[#f1f3f4] text-muted" : open ? "bg-[#fff4e3] text-[#8b641e]" : "bg-[#eff8f5] text-accent"}`}
                          >
                            {charge.status === "voided"
                              ? "Voided"
                              : waived
                                ? "Waived"
                                : open
                                  ? "Balance due"
                                  : "Paid"}
                          </span>
                        </div>
                        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-5">
                          <Amount
                            label="Charge"
                            value={formatMoney(charge.amountPaise, charge.currency)}
                          />
                          <Amount
                            label="Discount"
                            value={formatMoney(charge.discountPaise, charge.currency)}
                            hint={charge.discountReason}
                          />
                          <Amount
                            label="Received"
                            value={formatMoney(charge.paidPaise, charge.currency)}
                          />
                          <Amount
                            label="Refunded"
                            value={formatMoney(charge.refundedPaise, charge.currency)}
                          />
                          <Amount
                            label="Balance"
                            value={formatMoney(charge.balancePaise, charge.currency)}
                          />
                        </div>
                        {charge.payments.length > 0 && (
                          <div className="mt-4 border-t border-line pt-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                              Receipts
                            </p>
                            <div className="mt-2 space-y-2">
                              {charge.payments.map((payment) => {
                                const refunded = payment.refunds.reduce(
                                  (sum, item) => sum + item.amountPaise,
                                  0,
                                );
                                return (
                                  <div
                                    key={payment.id}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#f7f9f9] px-3 py-2 text-sm"
                                  >
                                    <div>
                                      <span className="font-medium">{payment.receiptNumber}</span>
                                      <span className="ml-2 text-xs text-muted">
                                        {new Date(payment.receivedAt).toLocaleDateString()} ·{" "}
                                        {payment.method.replace("_", " ")}
                                        {payment.reference ? ` · ${payment.reference}` : ""}
                                      </span>
                                      <p className="mt-0.5 text-xs text-muted">
                                        {formatMoney(payment.amountPaise, charge.currency)} received
                                        {refunded
                                          ? ` · ${formatMoney(refunded, charge.currency)} refunded`
                                          : ""}
                                      </p>
                                    </div>
                                    <div className="flex gap-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => printReceipt(charge, payment)}
                                      >
                                        Print receipt
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={busy || refunded >= payment.amountPaise}
                                        onClick={() => {
                                          setRefundPaymentId(payment.id);
                                          setRefundAmount("");
                                          setRefundReason("");
                                          setRefundIdempotencyKey("");
                                        }}
                                      >
                                        Refund
                                      </Button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {paymentChargeId === charge.id && (
                          <form
                            className="mt-4 grid gap-3 rounded-xl bg-[#f5f8f7] p-4 sm:grid-cols-2"
                            onSubmit={(event) => void savePayment(event)}
                          >
                            <p className="text-sm font-semibold sm:col-span-2">
                              Record a payment · remaining{" "}
                              {formatMoney(charge.balancePaise, charge.currency)}
                            </p>
                            <label className="grid gap-1 text-xs font-medium text-muted">
                              Amount (₹)
                              <Input
                                autoFocus
                                type="number"
                                min="0.01"
                                step="0.01"
                                max={(charge.balancePaise / 100).toFixed(2)}
                                value={paymentAmount}
                                onChange={(event) => setPaymentAmount(event.target.value)}
                                required
                              />
                            </label>
                            <label className="grid gap-1 text-xs font-medium text-muted">
                              Method
                              <select
                                className="h-11 rounded-xl border border-line bg-white px-3 text-sm"
                                value={paymentMethod}
                                onChange={(event) =>
                                  setPaymentMethod(event.target.value as typeof paymentMethod)
                                }
                              >
                                <option value="cash">Cash</option>
                                <option value="upi">UPI</option>
                                <option value="bank_transfer">Bank transfer</option>
                              </select>
                            </label>
                            <Input
                              aria-label="Payment reference"
                              placeholder="Transaction reference, optional"
                              value={paymentReference}
                              onChange={(event) => setPaymentReference(event.target.value)}
                            />
                            <Input
                              aria-label="Payment note"
                              placeholder="Note, optional"
                              value={paymentNote}
                              onChange={(event) => setPaymentNote(event.target.value)}
                            />
                            <div className="flex gap-2 sm:col-span-2">
                              <Button disabled={busy}>{busy ? "Saving…" : "Record payment"}</Button>
                              <Button
                                variant="ghost"
                                type="button"
                                onClick={() => {
                                  setPaymentChargeId(null);
                                  setPaymentIdempotencyKey("");
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </form>
                        )}
                        {charge.status === "issued" && (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {open && (
                              <Button
                                size="sm"
                                disabled={busy}
                                onClick={() => {
                                  setPaymentChargeId(charge.id);
                                  setPaymentAmount((charge.balancePaise / 100).toFixed(2));
                                  setPaymentIdempotencyKey("");
                                }}
                              >
                                Record payment
                              </Button>
                            )}
                            {charge.payments.length === 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => void voidCharge(charge)}
                              >
                                Void invoice
                              </Button>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
              <Pager
                offset={chargeOffset}
                total={chargeTotal}
                pageSize={pageSize}
                onChange={setChargeOffset}
              />
            </section>
          </div>
        ) : (
          <div className="mt-6 grid items-start gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
            <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                Outgoing expense
              </p>
              <h2 className="mt-2 text-lg font-semibold">Record academy spending</h2>
              <p className="mt-1 text-sm leading-5 text-muted">
                Record a paid expense with a category, date, payment method, and reference.
              </p>
              <form
                className="mt-5 space-y-3"
                onSubmit={(event) => void createAcademyExpense(event)}
              >
                <Input
                  aria-label="Expense category"
                  placeholder="Category, e.g. equipment"
                  value={expenseCategory}
                  onChange={(event) => setExpenseCategory(event.target.value)}
                  required
                />
                <Input
                  aria-label="Expense description"
                  placeholder="What was purchased or paid for?"
                  value={expenseDescription}
                  onChange={(event) => setExpenseDescription(event.target.value)}
                  required
                />
                <Input
                  aria-label="Payee"
                  placeholder="Payee or vendor, optional"
                  value={expensePayee}
                  onChange={(event) => setExpensePayee(event.target.value)}
                />
                <div className="grid grid-cols-2 gap-3">
                  <label className="grid gap-1 text-xs font-medium text-muted">
                    Amount (₹)
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={expenseAmount}
                      onChange={(event) => setExpenseAmount(event.target.value)}
                      required
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-medium text-muted">
                    Paid on
                    <Input
                      type="datetime-local"
                      value={expenseSpentAt}
                      onChange={(event) => setExpenseSpentAt(event.target.value)}
                      required
                    />
                  </label>
                </div>
                <label className="grid gap-1 text-xs font-medium text-muted">
                  Method
                  <select
                    className="h-11 rounded-xl border border-line bg-white px-3 text-sm"
                    value={expenseMethod}
                    onChange={(event) =>
                      setExpenseMethod(event.target.value as typeof expenseMethod)
                    }
                  >
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="bank_transfer">Bank transfer</option>
                  </select>
                </label>
                <Input
                  aria-label="Expense reference"
                  placeholder="Transaction or bill reference"
                  value={expenseReference}
                  onChange={(event) => setExpenseReference(event.target.value)}
                />
                <Input
                  aria-label="Expense note"
                  placeholder="Additional note, optional"
                  value={expenseNote}
                  onChange={(event) => setExpenseNote(event.target.value)}
                />
                <Button className="w-full" disabled={busy}>
                  {busy ? "Saving…" : "Record expense"}
                </Button>
              </form>
            </section>

            <section className="min-w-0 rounded-2xl border border-line bg-white p-5 sm:p-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                    Expense register
                  </p>
                  <h2 className="mt-2 text-lg font-semibold">Operating costs</h2>
                  <p className="mt-1 text-xs text-muted">
                    {reportMonth} · {expenseTotal} records
                  </p>
                </div>
                <Input
                  aria-label="Search expenses"
                  placeholder="Search expenses"
                  value={expenseSearch}
                  onChange={(event) => {
                    setExpenseOffset(0);
                    setExpenseSearch(event.target.value);
                  }}
                />
              </div>
              {loading ? (
                <p className="mt-6 text-sm text-muted">Loading expenses…</p>
              ) : expenses.length === 0 ? (
                <p className="mt-6 rounded-xl bg-[#f5f7f7] px-4 py-6 text-sm text-muted">
                  No expenses match this period.
                </p>
              ) : (
                <div className="mt-5 space-y-2">
                  {expenses.map((expense) => (
                    <article
                      key={expense.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3"
                    >
                      <div>
                        <p className="font-medium">{expense.description}</p>
                        <p className="mt-1 text-xs text-muted">
                          {expense.category}
                          {expense.payeeName ? ` · ${expense.payeeName}` : ""} ·{" "}
                          {new Date(expense.spentAt).toLocaleDateString()} ·{" "}
                          {expense.method.replace("_", " ")}
                          {expense.reference ? ` · ${expense.reference}` : ""}
                        </p>
                        {expense.voidReason && (
                          <p className="mt-1 text-xs text-[#984d3f]">
                            Reversed: {expense.voidReason}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`text-sm font-semibold ${expense.status === "voided" ? "text-muted line-through" : ""}`}
                        >
                          {formatMoney(expense.amountPaise, currency)}
                        </span>
                        {expense.status === "recorded" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void reverseExpense(expense)}
                          >
                            Reverse
                          </Button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
              <Pager
                offset={expenseOffset}
                total={expenseTotal}
                pageSize={pageSize}
                onChange={setExpenseOffset}
              />
              <p className="mt-4 text-xs text-muted">
                Reversals preserve the original entry and record the reason. Reversed expenses are
                excluded from reports.
              </p>
            </section>
          </div>
        )}

        {refundPaymentId && (
          <div
            className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4"
            role="presentation"
          >
            <form
              className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
              onSubmit={(event) => void saveRefund(event)}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                Refund reversal
              </p>
              <h2 className="mt-2 text-xl font-semibold">Refund a payment</h2>
              <p className="mt-2 text-sm text-muted">
                This adds a reversal to the receipt history and restores the invoice balance.
              </p>
              <div className="mt-5 space-y-3">
                <label className="grid gap-1 text-xs font-medium text-muted">
                  Refund amount (₹)
                  <Input
                    autoFocus
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={refundAmount}
                    onChange={(event) => setRefundAmount(event.target.value)}
                    required
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium text-muted">
                  Reason
                  <Input
                    value={refundReason}
                    onChange={(event) => setRefundReason(event.target.value)}
                    required
                  />
                </label>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setRefundPaymentId(null);
                    setRefundIdempotencyKey("");
                  }}
                >
                  Cancel
                </Button>
                <Button disabled={busy}>{busy ? "Saving…" : "Record refund"}</Button>
              </div>
            </form>
          </div>
        )}
      </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="rounded-2xl border border-line bg-white p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 truncate text-xs text-muted">{detail}</p>
    </article>
  );
}

function Amount({ label, value, hint }: { label: string; value: string; hint?: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
      {hint && (
        <p className="mt-0.5 truncate text-[11px] text-muted" title={hint}>
          {hint}
        </p>
      )}
    </div>
  );
}

function Pager({
  offset,
  total,
  pageSize,
  onChange,
}: {
  offset: number;
  total: number;
  pageSize: number;
  onChange: (next: number) => void;
}) {
  if (total <= pageSize) return null;
  return (
    <div className="mt-5 flex items-center justify-between border-t border-line pt-4 text-sm">
      <span className="text-muted">
        {offset + 1}–{Math.min(offset + pageSize, total)} of {total}
      </span>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={offset === 0}
          onClick={() => onChange(Math.max(0, offset - pageSize))}
        >
          Previous
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={offset + pageSize >= total}
          onClick={() => onChange(offset + pageSize)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
