import { and, asc, count, desc, eq, gte, ilike, inArray, lt, or, sql } from "drizzle-orm";
import type {
  CreateExpenseRequest,
  CreateFeeChargeRequest,
  ExpenseQuery,
  FeeChargeQuery,
  RecordFeePaymentRequest,
  RefundFeePaymentRequest,
} from "@sportdesk/contracts";
import type { Database } from "./client.js";
import {
  academies,
  academyExpenses,
  feeCharges,
  feePayments,
  feeRefunds,
  financeCounters,
  guardians,
  studentGuardians,
  students,
} from "./schema.js";

export class FinanceRepositoryError extends Error {
  constructor(
    readonly code:
      | "STUDENT_NOT_FOUND"
      | "CHARGE_NOT_FOUND"
      | "PAYMENT_NOT_FOUND"
      | "EXPENSE_NOT_FOUND"
      | "CHARGE_CLOSED"
      | "CHARGE_HAS_PAYMENTS"
      | "OVERPAYMENT"
      | "REFUND_EXCEEDS_PAYMENT"
      | "IDEMPOTENCY_CONFLICT"
      | "STUDENT_NOT_LINKED",
  ) {
    super(code);
    this.name = "FinanceRepositoryError";
  }
}

type ChargeListOptions = FeeChargeQuery & { studentId?: string };

function localDateParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dateAtAcademyMidnight(date: string, timeZone: string) {
  const target = Date.parse(`${date}T00:00:00.000Z`);
  let candidate = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const local = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(candidate));
    const value = (type: string) => Number(local.find((entry) => entry.type === type)?.value ?? 0);
    const localAsUtc = Date.UTC(
      value("year"),
      value("month") - 1,
      value("day"),
      value("hour"),
      value("minute"),
      value("second"),
    );
    candidate += target - localAsUtc;
  }
  return new Date(candidate);
}

function addDateDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function createFinanceRepository(db: Database) {
  const paidForCharge = sql<number>`coalesce((
    select sum(${feePayments.amountPaise})
    from ${feePayments}
    where ${feePayments.academyId} = ${feeCharges.academyId}
      and ${feePayments.chargeId} = ${feeCharges.id}
  ), 0)`;
  const refundedForCharge = sql<number>`coalesce((
    select sum(${feeRefunds.amountPaise})
    from ${feeRefunds}
    inner join ${feePayments} on ${feePayments.id} = ${feeRefunds.paymentId}
      and ${feePayments.academyId} = ${feeRefunds.academyId}
    where ${feeRefunds.academyId} = ${feeCharges.academyId}
      and ${feePayments.chargeId} = ${feeCharges.id}
  ), 0)`;
  const balanceForCharge = sql<number>`greatest(
    ${feeCharges.amountPaise} - ${feeCharges.discountPaise} - ${paidForCharge} + ${refundedForCharge},
    0
  )`;

  async function lockCounter(
    tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
    academyId: string,
  ) {
    await tx.insert(financeCounters).values({ academyId }).onConflictDoNothing();
    await tx
      .select({ academyId: financeCounters.academyId })
      .from(financeCounters)
      .where(eq(financeCounters.academyId, academyId))
      .for("update")
      .limit(1);
  }

  async function listCharges(academyId: string, options: ChargeListOptions) {
    const [academy] = await db
      .select({ currency: academies.currency, timezone: academies.timezone })
      .from(academies)
      .where(eq(academies.id, academyId))
      .limit(1);
    const today = localDateParts(new Date(), academy?.timezone ?? "Asia/Kolkata");
    const filters = [eq(feeCharges.academyId, academyId)];
    if (options.studentId) filters.push(eq(feeCharges.studentId, options.studentId));
    if (options.search) {
      const search = `%${options.search}%`;
      filters.push(
        or(
          ilike(feeCharges.invoiceNumber, search),
          ilike(feeCharges.description, search),
          ilike(sql`concat(${students.firstName}, ' ', ${students.lastName})`, search),
        )!,
      );
    }
    if (options.state === "voided") filters.push(eq(feeCharges.status, "voided"));
    if (options.state === "waived") {
      filters.push(
        eq(feeCharges.status, "issued"),
        eq(feeCharges.discountPaise, feeCharges.amountPaise),
      );
    }
    if (options.state === "paid") {
      filters.push(
        eq(feeCharges.status, "issued"),
        sql`${feeCharges.amountPaise} > ${feeCharges.discountPaise}`,
        sql`${balanceForCharge} = 0`,
      );
    }
    if (options.state === "open") {
      filters.push(eq(feeCharges.status, "issued"), sql`${balanceForCharge} > 0`);
    }
    if (options.state === "overdue") {
      filters.push(
        eq(feeCharges.status, "issued"),
        sql`${balanceForCharge} > 0`,
        lt(feeCharges.dueDate, today),
      );
    }
    const where = and(...filters);
    const [totalRow] = await db
      .select({ total: count() })
      .from(feeCharges)
      .innerJoin(students, eq(feeCharges.studentId, students.id))
      .where(where);
    const rows = await db
      .select({
        id: feeCharges.id,
        studentId: feeCharges.studentId,
        studentName: sql<string>`concat(${students.firstName}, ' ', ${students.lastName})`,
        invoiceNumber: feeCharges.invoiceNumber,
        description: feeCharges.description,
        billingPeriod: feeCharges.billingPeriod,
        dueDate: feeCharges.dueDate,
        amountPaise: feeCharges.amountPaise,
        discountPaise: feeCharges.discountPaise,
        discountReason: feeCharges.discountReason,
        currency: feeCharges.currency,
        status: feeCharges.status,
        paidPaise: paidForCharge,
        refundedPaise: refundedForCharge,
        balancePaise: balanceForCharge,
        createdAt: feeCharges.createdAt,
      })
      .from(feeCharges)
      .innerJoin(students, eq(feeCharges.studentId, students.id))
      .where(where)
      .orderBy(desc(feeCharges.dueDate), desc(feeCharges.createdAt))
      .limit(options.limit)
      .offset(options.offset);
    const ids = rows.map((row) => row.id);
    const paymentRows = ids.length
      ? await db
          .select({
            id: feePayments.id,
            chargeId: feePayments.chargeId,
            receiptNumber: feePayments.receiptNumber,
            amountPaise: feePayments.amountPaise,
            method: feePayments.method,
            receivedAt: feePayments.receivedAt,
            reference: feePayments.reference,
            note: feePayments.note,
          })
          .from(feePayments)
          .where(and(eq(feePayments.academyId, academyId), inArray(feePayments.chargeId, ids)))
          .orderBy(asc(feePayments.receivedAt), asc(feePayments.createdAt))
      : [];
    const paymentIds = paymentRows.map((row) => row.id);
    const refundRows = paymentIds.length
      ? await db
          .select({
            id: feeRefunds.id,
            paymentId: feeRefunds.paymentId,
            amountPaise: feeRefunds.amountPaise,
            reason: feeRefunds.reason,
            refundedAt: feeRefunds.refundedAt,
          })
          .from(feeRefunds)
          .where(
            and(eq(feeRefunds.academyId, academyId), inArray(feeRefunds.paymentId, paymentIds)),
          )
          .orderBy(asc(feeRefunds.refundedAt))
      : [];
    const refundsByPayment = new Map<string, typeof refundRows>();
    for (const refund of refundRows) {
      const current = refundsByPayment.get(refund.paymentId) ?? [];
      current.push(refund);
      refundsByPayment.set(refund.paymentId, current);
    }
    const paymentsByCharge = new Map<string, typeof paymentRows>();
    for (const payment of paymentRows) {
      const current = paymentsByCharge.get(payment.chargeId) ?? [];
      current.push(payment);
      paymentsByCharge.set(payment.chargeId, current);
    }
    return {
      charges: rows.map((row) => ({
        ...row,
        dueDate: row.dueDate,
        createdAt: row.createdAt.toISOString(),
        balancePaise: Number(row.balancePaise),
        payments: (paymentsByCharge.get(row.id) ?? []).map((payment) => ({
          id: payment.id,
          receiptNumber: payment.receiptNumber,
          amountPaise: payment.amountPaise,
          method: payment.method,
          receivedAt: payment.receivedAt.toISOString(),
          reference: payment.reference,
          note: payment.note,
          refunds: (refundsByPayment.get(payment.id) ?? []).map((refund) => ({
            id: refund.id,
            amountPaise: refund.amountPaise,
            reason: refund.reason,
            refundedAt: refund.refundedAt.toISOString(),
          })),
        })),
      })),
      total: totalRow?.total ?? 0,
      offset: options.offset,
      limit: options.limit,
      currency: academy?.currency ?? "INR",
    };
  }

  return {
    async listCharges(academyId: string, query: FeeChargeQuery) {
      return listCharges(academyId, query);
    },

    async createCharge(input: CreateFeeChargeRequest & { academyId: string; createdBy: string }) {
      return db.transaction(async (tx) => {
        await lockCounter(tx, input.academyId);
        const [counter] = await tx
          .update(financeCounters)
          .set({ lastInvoiceNumber: sql`${financeCounters.lastInvoiceNumber} + 1` })
          .where(eq(financeCounters.academyId, input.academyId))
          .returning({ number: financeCounters.lastInvoiceNumber });
        const [student] = await tx
          .select({ id: students.id })
          .from(students)
          .where(and(eq(students.id, input.studentId), eq(students.academyId, input.academyId)))
          .limit(1);
        if (!student) throw new FinanceRepositoryError("STUDENT_NOT_FOUND");
        const [academy] = await tx
          .select({ currency: academies.currency })
          .from(academies)
          .where(eq(academies.id, input.academyId))
          .limit(1);
        if (!counter || !academy) throw new Error("Finance counter or academy was not found.");
        const [charge] = await tx
          .insert(feeCharges)
          .values({
            academyId: input.academyId,
            studentId: input.studentId,
            invoiceNumber: `INV-${String(counter.number).padStart(6, "0")}`,
            description: input.description,
            billingPeriod: input.billingPeriod?.trim() || null,
            dueDate: input.dueDate,
            amountPaise: input.amountPaise,
            discountPaise: input.discountPaise,
            discountReason: input.discountReason ?? null,
            currency: academy.currency,
            createdBy: input.createdBy,
          })
          .returning({ id: feeCharges.id });
        if (!charge) throw new Error("Fee charge insert returned no record.");
        return charge;
      });
    },

    async recordPayment(
      input: Omit<RecordFeePaymentRequest, "receivedAt"> & {
        academyId: string;
        chargeId: string;
        createdBy: string;
        receivedAt?: Date;
      },
    ) {
      await db.transaction(async (tx) => {
        await lockCounter(tx, input.academyId);
        const [charge] = await tx
          .select({
            id: feeCharges.id,
            amountPaise: feeCharges.amountPaise,
            discountPaise: feeCharges.discountPaise,
            status: feeCharges.status,
          })
          .from(feeCharges)
          .where(and(eq(feeCharges.id, input.chargeId), eq(feeCharges.academyId, input.academyId)))
          .for("update")
          .limit(1);
        if (!charge) throw new FinanceRepositoryError("CHARGE_NOT_FOUND");
        const [existing] = await tx
          .select({
            id: feePayments.id,
            chargeId: feePayments.chargeId,
            amountPaise: feePayments.amountPaise,
            method: feePayments.method,
            reference: feePayments.reference,
            note: feePayments.note,
            receivedAt: feePayments.receivedAt,
          })
          .from(feePayments)
          .where(
            and(
              eq(feePayments.academyId, input.academyId),
              eq(feePayments.idempotencyKey, input.idempotencyKey),
            ),
          )
          .limit(1);
        if (existing) {
          const matches =
            existing.chargeId === input.chargeId &&
            existing.amountPaise === input.amountPaise &&
            existing.method === input.method &&
            existing.reference === (input.reference ?? null) &&
            existing.note === (input.note ?? null) &&
            (!input.receivedAt || existing.receivedAt.getTime() === input.receivedAt.getTime());
          if (!matches) throw new FinanceRepositoryError("IDEMPOTENCY_CONFLICT");
          return;
        }
        if (charge.status !== "issued") throw new FinanceRepositoryError("CHARGE_CLOSED");
        const [totals] = await tx
          .select({ paid: sql<number>`coalesce(sum(${feePayments.amountPaise}), 0)` })
          .from(feePayments)
          .where(
            and(eq(feePayments.academyId, input.academyId), eq(feePayments.chargeId, charge.id)),
          );
        const [refundTotals] = await tx
          .select({ refunded: sql<number>`coalesce(sum(${feeRefunds.amountPaise}), 0)` })
          .from(feeRefunds)
          .innerJoin(feePayments, eq(feeRefunds.paymentId, feePayments.id))
          .where(
            and(eq(feeRefunds.academyId, input.academyId), eq(feePayments.chargeId, charge.id)),
          );
        const balance =
          charge.amountPaise -
          charge.discountPaise -
          Number(totals?.paid ?? 0) +
          Number(refundTotals?.refunded ?? 0);
        if (input.amountPaise > balance) throw new FinanceRepositoryError("OVERPAYMENT");
        const [counter] = await tx
          .update(financeCounters)
          .set({ lastReceiptNumber: sql`${financeCounters.lastReceiptNumber} + 1` })
          .where(eq(financeCounters.academyId, input.academyId))
          .returning({ number: financeCounters.lastReceiptNumber });
        if (!counter) throw new Error("Receipt counter update returned no record.");
        await tx.insert(feePayments).values({
          academyId: input.academyId,
          chargeId: charge.id,
          receiptNumber: `RCT-${String(counter.number).padStart(6, "0")}`,
          idempotencyKey: input.idempotencyKey,
          amountPaise: input.amountPaise,
          method: input.method,
          receivedAt: input.receivedAt ?? new Date(),
          reference: input.reference ?? null,
          note: input.note ?? null,
          createdBy: input.createdBy,
        });
      });
      const [payment] = await db
        .select({ id: feePayments.id, receiptNumber: feePayments.receiptNumber })
        .from(feePayments)
        .where(
          and(
            eq(feePayments.academyId, input.academyId),
            eq(feePayments.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);
      if (!payment) throw new Error("Recorded payment was not found.");
      return payment;
    },

    async refundPayment(
      input: Omit<RefundFeePaymentRequest, "refundedAt"> & {
        academyId: string;
        paymentId: string;
        createdBy: string;
        refundedAt?: Date;
      },
    ) {
      return db.transaction(async (tx) => {
        await lockCounter(tx, input.academyId);
        const [payment] = await tx
          .select({ id: feePayments.id, amountPaise: feePayments.amountPaise })
          .from(feePayments)
          .where(
            and(eq(feePayments.id, input.paymentId), eq(feePayments.academyId, input.academyId)),
          )
          .for("update")
          .limit(1);
        if (!payment) throw new FinanceRepositoryError("PAYMENT_NOT_FOUND");
        const [existing] = await tx
          .select({
            id: feeRefunds.id,
            paymentId: feeRefunds.paymentId,
            amountPaise: feeRefunds.amountPaise,
            reason: feeRefunds.reason,
            refundedAt: feeRefunds.refundedAt,
          })
          .from(feeRefunds)
          .where(
            and(
              eq(feeRefunds.academyId, input.academyId),
              eq(feeRefunds.idempotencyKey, input.idempotencyKey),
            ),
          )
          .limit(1);
        if (existing) {
          const matches =
            existing.paymentId === input.paymentId &&
            existing.amountPaise === input.amountPaise &&
            existing.reason === input.reason &&
            (!input.refundedAt || existing.refundedAt.getTime() === input.refundedAt.getTime());
          if (!matches) throw new FinanceRepositoryError("IDEMPOTENCY_CONFLICT");
          return { id: existing.id };
        }
        const [totals] = await tx
          .select({ refunded: sql<number>`coalesce(sum(${feeRefunds.amountPaise}), 0)` })
          .from(feeRefunds)
          .where(
            and(eq(feeRefunds.academyId, input.academyId), eq(feeRefunds.paymentId, payment.id)),
          );
        if (input.amountPaise > payment.amountPaise - Number(totals?.refunded ?? 0)) {
          throw new FinanceRepositoryError("REFUND_EXCEEDS_PAYMENT");
        }
        const [refund] = await tx
          .insert(feeRefunds)
          .values({
            academyId: input.academyId,
            paymentId: payment.id,
            idempotencyKey: input.idempotencyKey,
            amountPaise: input.amountPaise,
            reason: input.reason,
            refundedAt: input.refundedAt ?? new Date(),
            createdBy: input.createdBy,
          })
          .returning({ id: feeRefunds.id });
        if (!refund) throw new Error("Fee refund insert returned no record.");
        return refund;
      });
    },

    async voidCharge(input: {
      academyId: string;
      chargeId: string;
      voidedBy: string;
      reason: string;
      now: Date;
    }) {
      return db.transaction(async (tx) => {
        const [charge] = await tx
          .select({ id: feeCharges.id, status: feeCharges.status })
          .from(feeCharges)
          .where(and(eq(feeCharges.id, input.chargeId), eq(feeCharges.academyId, input.academyId)))
          .for("update")
          .limit(1);
        if (!charge) throw new FinanceRepositoryError("CHARGE_NOT_FOUND");
        const [payment] = await tx
          .select({ id: feePayments.id })
          .from(feePayments)
          .where(
            and(eq(feePayments.academyId, input.academyId), eq(feePayments.chargeId, charge.id)),
          )
          .limit(1);
        if (payment) throw new FinanceRepositoryError("CHARGE_HAS_PAYMENTS");
        if (charge.status === "voided") return { updated: false };
        await tx
          .update(feeCharges)
          .set({
            status: "voided",
            voidedAt: input.now,
            voidedBy: input.voidedBy,
            voidReason: input.reason,
          })
          .where(and(eq(feeCharges.id, charge.id), eq(feeCharges.academyId, input.academyId)));
        return { updated: true };
      });
    },

    async getSummary(academyId: string, from: string, to: string) {
      const [academy] = await db
        .select({ currency: academies.currency, timezone: academies.timezone })
        .from(academies)
        .where(eq(academies.id, academyId))
        .limit(1);
      const timezone = academy?.timezone ?? "Asia/Kolkata";
      const fromAt = dateAtAcademyMidnight(from, timezone);
      const toExclusive = dateAtAcademyMidnight(addDateDays(to, 1), timezone);
      const [invoicedRows, collectedRows, refundRows, expenseRows, outstandingRows] =
        await Promise.all([
          db
            .select({
              amount: sql<number>`coalesce(sum(${feeCharges.amountPaise} - ${feeCharges.discountPaise}), 0)`,
            })
            .from(feeCharges)
            .where(
              and(
                eq(feeCharges.academyId, academyId),
                eq(feeCharges.status, "issued"),
                gte(feeCharges.createdAt, fromAt),
                lt(feeCharges.createdAt, toExclusive),
              ),
            ),
          db
            .select({ amount: sql<number>`coalesce(sum(${feePayments.amountPaise}), 0)` })
            .from(feePayments)
            .where(
              and(
                eq(feePayments.academyId, academyId),
                gte(feePayments.receivedAt, fromAt),
                lt(feePayments.receivedAt, toExclusive),
              ),
            ),
          db
            .select({ amount: sql<number>`coalesce(sum(${feeRefunds.amountPaise}), 0)` })
            .from(feeRefunds)
            .where(
              and(
                eq(feeRefunds.academyId, academyId),
                gte(feeRefunds.refundedAt, fromAt),
                lt(feeRefunds.refundedAt, toExclusive),
              ),
            ),
          db
            .select({ amount: sql<number>`coalesce(sum(${academyExpenses.amountPaise}), 0)` })
            .from(academyExpenses)
            .where(
              and(
                eq(academyExpenses.academyId, academyId),
                eq(academyExpenses.status, "recorded"),
                gte(academyExpenses.spentAt, fromAt),
                lt(academyExpenses.spentAt, toExclusive),
              ),
            ),
          db
            .select({ amount: balanceForCharge })
            .from(feeCharges)
            .where(and(eq(feeCharges.academyId, academyId), eq(feeCharges.status, "issued"))),
        ]);
      const invoicedPaise = Number(invoicedRows[0]?.amount ?? 0);
      const collectedPaise = Number(collectedRows[0]?.amount ?? 0);
      const refundsPaise = Number(refundRows[0]?.amount ?? 0);
      const expensesPaise = Number(expenseRows[0]?.amount ?? 0);
      const outstandingPaise = outstandingRows.reduce(
        (total, row) => total + Number(row.amount),
        0,
      );
      const netCollectionsPaise = collectedPaise - refundsPaise;
      return {
        from,
        to,
        currency: academy?.currency ?? "INR",
        invoicedPaise,
        collectedPaise,
        refundsPaise,
        netCollectionsPaise,
        outstandingPaise,
        expensesPaise,
        netCashFlowPaise: netCollectionsPaise - expensesPaise,
      };
    },

    async listExpenses(academyId: string, query: ExpenseQuery) {
      const [academy] = await db
        .select({ timezone: academies.timezone })
        .from(academies)
        .where(eq(academies.id, academyId))
        .limit(1);
      const timezone = academy?.timezone ?? "Asia/Kolkata";
      const filters = [eq(academyExpenses.academyId, academyId)];
      if (query.from) {
        filters.push(gte(academyExpenses.spentAt, dateAtAcademyMidnight(query.from, timezone)));
      }
      if (query.to) {
        filters.push(
          lt(academyExpenses.spentAt, dateAtAcademyMidnight(addDateDays(query.to, 1), timezone)),
        );
      }
      if (query.search) {
        const search = `%${query.search}%`;
        filters.push(
          or(
            ilike(academyExpenses.category, search),
            ilike(academyExpenses.description, search),
            ilike(academyExpenses.payeeName, search),
            ilike(academyExpenses.reference, search),
          )!,
        );
      }
      const where = and(...filters);
      const [totalRow] = await db.select({ total: count() }).from(academyExpenses).where(where);
      const expenses = await db
        .select({
          id: academyExpenses.id,
          category: academyExpenses.category,
          description: academyExpenses.description,
          payeeName: academyExpenses.payeeName,
          amountPaise: academyExpenses.amountPaise,
          method: academyExpenses.method,
          spentAt: academyExpenses.spentAt,
          reference: academyExpenses.reference,
          note: academyExpenses.note,
          status: academyExpenses.status,
          voidReason: academyExpenses.voidReason,
          createdAt: academyExpenses.createdAt,
        })
        .from(academyExpenses)
        .where(where)
        .orderBy(desc(academyExpenses.spentAt), desc(academyExpenses.createdAt))
        .limit(query.limit)
        .offset(query.offset);
      return {
        expenses: expenses.map((expense) => ({
          ...expense,
          spentAt: expense.spentAt.toISOString(),
          createdAt: expense.createdAt.toISOString(),
        })),
        total: totalRow?.total ?? 0,
        offset: query.offset,
        limit: query.limit,
      };
    },

    async createExpense(input: CreateExpenseRequest & { academyId: string; createdBy: string }) {
      const [expense] = await db
        .insert(academyExpenses)
        .values({
          academyId: input.academyId,
          createdBy: input.createdBy,
          category: input.category,
          description: input.description,
          payeeName: input.payeeName?.trim() || null,
          amountPaise: input.amountPaise,
          method: input.method,
          spentAt: new Date(input.spentAt),
          reference: input.reference?.trim() || null,
          note: input.note?.trim() || null,
        })
        .returning({ id: academyExpenses.id });
      if (!expense) throw new Error("Expense insert returned no record.");
      return expense;
    },

    async voidExpense(input: {
      academyId: string;
      expenseId: string;
      voidedBy: string;
      reason: string;
      now: Date;
    }) {
      return db.transaction(async (tx) => {
        const [expense] = await tx
          .select({ id: academyExpenses.id, status: academyExpenses.status })
          .from(academyExpenses)
          .where(
            and(
              eq(academyExpenses.id, input.expenseId),
              eq(academyExpenses.academyId, input.academyId),
            ),
          )
          .for("update")
          .limit(1);
        if (!expense) throw new FinanceRepositoryError("EXPENSE_NOT_FOUND");
        if (expense.status === "voided") return { updated: false };
        await tx
          .update(academyExpenses)
          .set({
            status: "voided",
            voidedAt: input.now,
            voidedBy: input.voidedBy,
            voidReason: input.reason,
          })
          .where(
            and(
              eq(academyExpenses.id, input.expenseId),
              eq(academyExpenses.academyId, input.academyId),
            ),
          );
        return { updated: true };
      });
    },

    async getParentStudentFinance(academyId: string, userId: string, studentId: string) {
      const [linked] = await db
        .select({ id: studentGuardians.studentId })
        .from(studentGuardians)
        .innerJoin(guardians, eq(studentGuardians.guardianId, guardians.id))
        .where(
          and(
            eq(studentGuardians.academyId, academyId),
            eq(studentGuardians.studentId, studentId),
            eq(guardians.userId, userId),
          ),
        )
        .limit(1);
      if (!linked) throw new FinanceRepositoryError("STUDENT_NOT_LINKED");
      const result = await listCharges(academyId, {
        state: "all",
        offset: 0,
        limit: 100,
        studentId,
      });
      return {
        studentId,
        currency: result.currency,
        charges: result.charges,
      };
    },
  };
}

export type FinanceRepository = ReturnType<typeof createFinanceRepository>;
