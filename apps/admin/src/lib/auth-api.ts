import {
  AdminOverviewSchema,
  ApiErrorSchema,
  ApiSuccessSchema,
  AuthDataSchema,
} from "@sportdesk/contracts";

export const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1").replace(
  /\/$/,
  "",
);

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function readError(response: Response): Promise<string> {
  try {
    const parsed = ApiErrorSchema.safeParse(await response.json());
    if (parsed.success) return parsed.data.error.message;
  } catch {
    // Use the local message below when an upstream response is not JSON.
  }
  return "Could not connect to SportDesk. Check that the API is running.";
}

export async function loginWithPassword(email: string, password: string) {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, clientType: "web" }),
  });
  if (!response.ok) throw new ApiRequestError(await readError(response), response.status);
  return ApiSuccessSchema(AuthDataSchema).parse(await response.json()).data;
}

export async function refreshWebSession() {
  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientType: "web" }),
  });
  if (!response.ok) return null;
  return ApiSuccessSchema(AuthDataSchema).parse(await response.json()).data;
}

export async function logoutWebSession() {
  const response = await fetch(`${API_BASE}/auth/logout`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientType: "web" }),
  });
  if (!response.ok) throw new ApiRequestError(await readError(response), response.status);
}

export async function getAdminOverview(accessToken: string) {
  const response = await fetch(`${API_BASE}/admin/overview`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) throw new ApiRequestError(await readError(response), response.status);
  return ApiSuccessSchema(AdminOverviewSchema).parse(await response.json()).data;
}
