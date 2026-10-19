import type {
  CreateExpenseRequest,
  CreateFeeChargeRequest,
  ExpenseQuery,
  FeeChargeQuery,
  FinanceDateRangeQuery,
  StudentDirectoryQuery,
  RecordFeePaymentRequest,
  RefundFeePaymentRequest,
} from "@sportdesk/contracts";
import { FinanceRepositoryError, type FinanceRepository } from "../../db/finance.repository.js";

export class FinanceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "FinanceError";
  }
}

function translateError(error: unknown): never {
  if (error instanceof FinanceError) throw error;
  if (error instanceof FinanceRepositoryError) {
    const errors: Record<FinanceRepositoryError["code"], [number, string]> = {
      STUDENT_NOT_FOUND: [404, "The student was not found in this academy."],
      CHARGE_NOT_FOUND: [404, "The fee charge was not found in this academy."],
      PAYMENT_NOT_FOUND: [404, "The payment was not found in this academy."],
      EXPENSE_NOT_FOUND: [404, "The expense was not found in this academy."],
      CHARGE_CLOSED: [409, "This invoice has been voided and cannot accept payments."],
      CHARGE_HAS_PAYMENTS: [409, "An invoice with payment history cannot be voided."],
      OVERPAYMENT: [409, "Payment exceeds the remaining invoice balance."],
      REFUND_EXCEEDS_PAYMENT: [409, "Refund exceeds the amount still available to reverse."],
      IDEMPOTENCY_CONFLICT: [409, "This request key was already used for different details."],
      STUDENT_NOT_LINKED: [404, "The linked academy record was not found."],
    };
    const [status, message] = errors[error.code];
    throw new FinanceError(status, error.code, message);
  }
  if (typeof error === "object" && error !== null && "code" in error) {
    if (error.code === "23505") {
      throw new FinanceError(409, "DUPLICATE_RECORD", "This finance record already exists.");
    }
    if (error.code === "23514") {
      throw new FinanceError(400, "INVALID_RECORD", "The finance record violates an academy rule.");
    }
  }
  throw error;
}

export function createFinanceService(repository: FinanceRepository) {
  return {
    async listStudentOptions(academyId: string, query: StudentDirectoryQuery) {
      return repository.listStudentOptions(academyId, query);
    },

    async listCharges(academyId: string, query: FeeChargeQuery) {
      try {
        return await repository.listCharges(academyId, query);
      } catch (error) {
        translateError(error);
      }
    },

    async createCharge(input: CreateFeeChargeRequest & { academyId: string; createdBy: string }) {
      try {
        return await repository.createCharge(input);
      } catch (error) {
        translateError(error);
      }
    },

    async recordPayment(
      input: RecordFeePaymentRequest & {
        academyId: string;
        chargeId: string;
        createdBy: string;
      },
    ) {
      try {
        const { receivedAt: receivedAtValue, ...payment } = input;
        const result = await repository.recordPayment({
          ...payment,
          ...(receivedAtValue ? { receivedAt: new Date(receivedAtValue) } : {}),
        });
        return result;
      } catch (error) {
        translateError(error);
      }
    },

    async refundPayment(
      input: RefundFeePaymentRequest & {
        academyId: string;
        paymentId: string;
        createdBy: string;
      },
    ) {
      try {
        const { refundedAt: refundedAtValue, ...refund } = input;
        return await repository.refundPayment({
          ...refund,
          ...(refundedAtValue ? { refundedAt: new Date(refundedAtValue) } : {}),
        });
      } catch (error) {
        translateError(error);
      }
    },

    async voidCharge(input: {
      academyId: string;
      chargeId: string;
      voidedBy: string;
      reason: string;
    }) {
      try {
        return await repository.voidCharge({ ...input, now: new Date() });
      } catch (error) {
        translateError(error);
      }
    },

    async getSummary(academyId: string, range: FinanceDateRangeQuery) {
      try {
        return await repository.getSummary(academyId, range.from, range.to);
      } catch (error) {
        translateError(error);
      }
    },

    async listExpenses(academyId: string, query: ExpenseQuery) {
      try {
        return await repository.listExpenses(academyId, query);
      } catch (error) {
        translateError(error);
      }
    },

    async createExpense(input: CreateExpenseRequest & { academyId: string; createdBy: string }) {
      try {
        return await repository.createExpense(input);
      } catch (error) {
        translateError(error);
      }
    },

    async voidExpense(input: {
      academyId: string;
      expenseId: string;
      voidedBy: string;
      reason: string;
    }) {
      try {
        return await repository.voidExpense({ ...input, now: new Date() });
      } catch (error) {
        translateError(error);
      }
    },

    async getParentStudentFinance(academyId: string, userId: string, studentId: string) {
      try {
        return await repository.getParentStudentFinance(academyId, userId, studentId);
      } catch (error) {
        translateError(error);
      }
    },
  };
}

export type SportDeskFinanceService = ReturnType<typeof createFinanceService>;
