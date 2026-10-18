import { Router, type Request } from "express";
import { z } from "zod";
import {
  CreateExpenseRequestSchema,
  CreateFeeChargeRequestSchema,
  ExpenseQuerySchema,
  FeeChargeQuerySchema,
  FinanceDateRangeQuerySchema,
  RecordFeePaymentRequestSchema,
  RefundFeePaymentRequestSchema,
  VoidExpenseRequestSchema,
  VoidFeeChargeRequestSchema,
} from "@sportdesk/contracts";
import type { SportDeskAuthService } from "../auth/auth.service.js";
import { AuthError } from "../auth/auth.service.js";
import type { SportDeskFinanceService } from "./finance.service.js";

async function userFromRequest(request: Request, auth: SportDeskAuthService) {
  const token = request.get("authorization")?.match(/^Bearer ([A-Za-z0-9._~-]+)$/)?.[1];
  if (!token) throw new AuthError(401, "UNAUTHENTICATED", "Authentication is required.");
  const user = await auth.authenticate(token);
  if (!user) throw new AuthError(401, "UNAUTHENTICATED", "Authentication is required.");
  return user;
}

async function ownerFromRequest(request: Request, auth: SportDeskAuthService) {
  const user = await userFromRequest(request, auth);
  if (user.role !== "owner") {
    throw new AuthError(403, "FORBIDDEN", "Owner access is required for finance records.");
  }
  return user;
}

export function createFinanceRouter(options: {
  auth: SportDeskAuthService;
  finance: SportDeskFinanceService;
}): Router {
  const router = Router();

  router.get("/finance/summary", async (request, response) => {
    const user = await ownerFromRequest(request, options.auth);
    const range = FinanceDateRangeQuerySchema.parse(request.query);
    response.status(200).json({ data: await options.finance.getSummary(user.academyId, range) });
  });

  router.get("/finance/charges", async (request, response) => {
    const user = await ownerFromRequest(request, options.auth);
    const query = FeeChargeQuerySchema.parse(request.query);
    response.status(200).json({ data: await options.finance.listCharges(user.academyId, query) });
  });

  router.post("/finance/charges", async (request, response) => {
    const user = await ownerFromRequest(request, options.auth);
    const input = CreateFeeChargeRequestSchema.parse(request.body);
    const record = await options.finance.createCharge({
      ...input,
      academyId: user.academyId,
      createdBy: user.id,
    });
    response.status(201).json({ data: record });
  });

  router.post("/finance/charges/:chargeId/payments", async (request, response) => {
    const user = await ownerFromRequest(request, options.auth);
    const chargeId = z.string().uuid().parse(request.params.chargeId);
    const input = RecordFeePaymentRequestSchema.parse(request.body);
    const result = await options.finance.recordPayment({
      ...input,
      academyId: user.academyId,
      chargeId,
      createdBy: user.id,
    });
    response.status(201).json({ data: result });
  });

  router.post("/finance/payments/:paymentId/refunds", async (request, response) => {
    const user = await ownerFromRequest(request, options.auth);
    const paymentId = z.string().uuid().parse(request.params.paymentId);
    const input = RefundFeePaymentRequestSchema.parse(request.body);
    const result = await options.finance.refundPayment({
      ...input,
      academyId: user.academyId,
      paymentId,
      createdBy: user.id,
    });
    response.status(201).json({ data: result });
  });

  router.post("/finance/charges/:chargeId/void", async (request, response) => {
    const user = await ownerFromRequest(request, options.auth);
    const chargeId = z.string().uuid().parse(request.params.chargeId);
    const input = VoidFeeChargeRequestSchema.parse(request.body);
    const result = await options.finance.voidCharge({
      ...input,
      academyId: user.academyId,
      chargeId,
      voidedBy: user.id,
    });
    response.status(200).json({ data: result });
  });

  router.get("/finance/expenses", async (request, response) => {
    const user = await ownerFromRequest(request, options.auth);
    const query = ExpenseQuerySchema.parse(request.query);
    response.status(200).json({ data: await options.finance.listExpenses(user.academyId, query) });
  });

  router.post("/finance/expenses", async (request, response) => {
    const user = await ownerFromRequest(request, options.auth);
    const input = CreateExpenseRequestSchema.parse(request.body);
    const record = await options.finance.createExpense({
      ...input,
      academyId: user.academyId,
      createdBy: user.id,
    });
    response.status(201).json({ data: record });
  });

  router.post("/finance/expenses/:expenseId/void", async (request, response) => {
    const user = await ownerFromRequest(request, options.auth);
    const expenseId = z.string().uuid().parse(request.params.expenseId);
    const input = VoidExpenseRequestSchema.parse(request.body);
    const result = await options.finance.voidExpense({
      ...input,
      academyId: user.academyId,
      expenseId,
      voidedBy: user.id,
    });
    response.status(200).json({ data: result });
  });

  router.get("/parent/students/:studentId/finance", async (request, response) => {
    const user = await userFromRequest(request, options.auth);
    if (user.role !== "parent") {
      throw new AuthError(403, "FORBIDDEN", "Parent access is required for this view.");
    }
    const studentId = z.string().uuid().parse(request.params.studentId);
    const record = await options.finance.getParentStudentFinance(
      user.academyId,
      user.id,
      studentId,
    );
    response.status(200).json({ data: record });
  });

  return router;
}
