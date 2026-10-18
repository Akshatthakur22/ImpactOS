import {
  ApiErrorSchema,
  ApiSuccessSchema,
  StaffListResponseSchema,
  type StaffMember,
} from "@sportdesk/contracts";
import { API_BASE, ApiRequestError } from "@/lib/auth-api";

async function request(path: string, token: string, init?: RequestInit) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const parsed = ApiErrorSchema.safeParse(await response.json().catch(() => null));
    throw new ApiRequestError(
      parsed.success ? parsed.data.error.message : "Could not update staff accounts.",
      response.status,
    );
  }
  return ApiSuccessSchema(StaffListResponseSchema).parse(await response.json()).data.staff;
}

export async function getStaff(token: string) {
  return request("/staff", token);
}
export async function createStaff(
  token: string,
  input: { email: string; displayName: string; initialPassword: string; permissions: string[] },
) {
  return request("/staff", token, { method: "POST", body: JSON.stringify(input) });
}
export async function updateStaff(
  token: string,
  id: string,
  input: { displayName?: string; isActive?: boolean; permissions?: string[] },
) {
  return request(`/staff/${id}`, token, { method: "PATCH", body: JSON.stringify(input) });
}

export type { StaffMember };
