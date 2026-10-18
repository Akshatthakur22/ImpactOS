import {
  AddInquiryActivityRequestSchema,
  ApiErrorSchema,
  ConvertInquiryRequestSchema,
  ConvertedInquirySchema,
  CreateInquiryRequestSchema,
  InquiryListQuerySchema,
  InquiryListSchema,
  InquirySchema,
  type AddInquiryActivityRequest,
  type ConvertInquiryRequest,
  type CreateInquiryRequest,
  type InquiryListQueryInput,
} from "@sportdesk/contracts";
import { API_BASE, ApiRequestError } from "@/lib/auth-api";

type RefreshSession = () => Promise<string | null>;

async function request<T>(
  path: string,
  schema: { parse: (value: unknown) => T },
  accessToken: string,
  refreshSession: RefreshSession,
  init: RequestInit = {},
) {
  const send = (token: string) =>
    fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...init.headers,
      },
      cache: "no-store",
    });
  let response = await send(accessToken);
  if (response.status === 401) {
    const token = await refreshSession();
    if (token) response = await send(token);
  }
  if (!response.ok) {
    let message = "Could not reach the academy service. Check that the API is running.";
    try {
      const parsed = ApiErrorSchema.safeParse(await response.json());
      if (parsed.success) message = parsed.data.error.message;
    } catch {
      // Keep a stable message for malformed upstream responses.
    }
    throw new ApiRequestError(message, response.status);
  }
  const result = (await response.json()) as { data: unknown };
  return schema.parse(result.data);
}

export function getInquiries(
  accessToken: string,
  refresh: RefreshSession,
  query: InquiryListQueryInput = {},
) {
  const parsed = InquiryListQuerySchema.parse(query);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(parsed)) {
    if (value !== undefined) params.set(key, String(value));
  }
  return request(`/inquiries?${params.toString()}`, InquiryListSchema, accessToken, refresh);
}

export function getInquiry(accessToken: string, refresh: RefreshSession, inquiryId: string) {
  return request(`/inquiries/${inquiryId}`, InquirySchema, accessToken, refresh);
}

export function createInquiry(
  accessToken: string,
  refresh: RefreshSession,
  input: CreateInquiryRequest,
) {
  const body = CreateInquiryRequestSchema.parse(input);
  return request("/inquiries", InquirySchema, accessToken, refresh, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function addInquiryActivity(
  accessToken: string,
  refresh: RefreshSession,
  inquiryId: string,
  input: AddInquiryActivityRequest,
) {
  const body = AddInquiryActivityRequestSchema.parse(input);
  return request(`/inquiries/${inquiryId}/activities`, InquirySchema, accessToken, refresh, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function convertInquiry(
  accessToken: string,
  refresh: RefreshSession,
  inquiryId: string,
  input: ConvertInquiryRequest,
) {
  const body = ConvertInquiryRequestSchema.parse(input);
  return request(`/inquiries/${inquiryId}/convert`, ConvertedInquirySchema, accessToken, refresh, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
