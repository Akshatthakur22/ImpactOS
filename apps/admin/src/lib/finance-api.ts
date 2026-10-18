import {
  ApiErrorSchema,
  CreateExpenseRequestSchema,
  CreateFeeChargeRequestSchema,
  ExpenseListSchema,
  FeeChargeListSchema,
  FinanceSummarySchema,
  RecordFeePaymentRequestSchema,
  RefundFeePaymentRequestSchema,
  UpdatedRecordSchema,
  VoidExpenseRequestSchema,
  VoidFeeChargeRequestSchema,
  type CreateExpenseRequest,
  type CreateFeeChargeRequest,
  type ExpenseQuery,
  type FeeChargeQuery,
  type FinanceDateRangeQuery,
  type RecordFeePaymentRequest,
  type RefundFeePaymentRequest,
} from "@sportdesk/contracts";
import { API_BASE, ApiRequestError } from "@/lib/auth-api";

type RefreshSession = () => Promise<string | null>;

async function errorMessage(response: Response) {
  try {
    const parsed = ApiErrorSchema.safeParse(await response.json());
    if (parsed.success) return parsed.data.error.message;
  } catch {
    // Keep connection errors stable and avoid displaying unexpected upstream data.
  }
  return "Could not reach the academy service. Check that the API is running.";
}

async function requestData<T>(
  path: string,
  schema: { parse: (value: unknown) => T } | ((value: unknown) => T),
  accessToken: string,
  refreshSession: RefreshSession,
  init?: RequestInit,
) {
  const send = (token: string) =>
    fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...init?.headers,
      },
      cache: "no-store",
    });
  let response = await send(accessToken);
  if (response.status === 401) {
    const renewed = await refreshSession();
    if (renewed) response = await send(renewed);
  }
  if (!response.ok) throw new ApiRequestError(await errorMessage(response), response.status);
  const data = (await response.json()).data;
  return typeof schema === "function" ? schema(data) : schema.parse(data);
}

function postBody(value: unknown): RequestInit {
  return { method: "POST", body: JSON.stringify(value) };
}

export function getFinanceSummary(
  token: string,
  refresh: RefreshSession,
  range: FinanceDateRangeQuery,
) {
  const params = new URLSearchParams(range);
  return requestData(`/finance/summary?${params.toString()}`, FinanceSummarySchema, token, refresh);
}

export function getFeeCharges(token: string, refresh: RefreshSession, query: FeeChargeQuery) {
  const params = new URLSearchParams({
    offset: String(query.offset),
    limit: String(query.limit),
    state: query.state,
    ...(query.search ? { search: query.search } : {}),
  });
  return requestData(`/finance/charges?${params.toString()}`, FeeChargeListSchema, token, refresh);
}

export function createFeeCharge(
  token: string,
  refresh: RefreshSession,
  input: CreateFeeChargeRequest,
) {
  return requestData(
    "/finance/charges",
    (value: unknown) => value as { id: string },
    token,
    refresh,
    postBody(CreateFeeChargeRequestSchema.parse(input)),
  );
}

export function recordFeePayment(
  token: string,
  refresh: RefreshSession,
  chargeId: string,
  input: RecordFeePaymentRequest,
) {
  return requestData(
    `/finance/charges/${chargeId}/payments`,
    (value: unknown) => value as { id: string; receiptNumber: string },
    token,
    refresh,
    postBody(RecordFeePaymentRequestSchema.parse(input)),
  );
}

export function refundFeePayment(
  token: string,
  refresh: RefreshSession,
  paymentId: string,
  input: RefundFeePaymentRequest,
) {
  return requestData(
    `/finance/payments/${paymentId}/refunds`,
    (value: unknown) => value as { id: string },
    token,
    refresh,
    postBody(RefundFeePaymentRequestSchema.parse(input)),
  );
}

export function voidFeeCharge(
  token: string,
  refresh: RefreshSession,
  chargeId: string,
  reason: string,
) {
  const input = VoidFeeChargeRequestSchema.parse({ reason });
  return requestData(
    `/finance/charges/${chargeId}/void`,
    UpdatedRecordSchema,
    token,
    refresh,
    postBody(input),
  );
}

export function getExpenses(token: string, refresh: RefreshSession, query: ExpenseQuery) {
  const params = new URLSearchParams({
    offset: String(query.offset),
    limit: String(query.limit),
    ...(query.from ? { from: query.from } : {}),
    ...(query.to ? { to: query.to } : {}),
    ...(query.search ? { search: query.search } : {}),
  });
  return requestData(`/finance/expenses?${params.toString()}`, ExpenseListSchema, token, refresh);
}

export function createExpense(token: string, refresh: RefreshSession, input: CreateExpenseRequest) {
  return requestData(
    "/finance/expenses",
    (value: unknown) => value as { id: string },
    token,
    refresh,
    postBody(CreateExpenseRequestSchema.parse(input)),
  );
}

export function voidExpense(
  token: string,
  refresh: RefreshSession,
  expenseId: string,
  reason: string,
) {
  return requestData(
    `/finance/expenses/${expenseId}/void`,
    UpdatedRecordSchema,
    token,
    refresh,
    postBody(VoidExpenseRequestSchema.parse({ reason })),
  );
}
