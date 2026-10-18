import {
  AdminOverviewSchema,
  ApiErrorSchema,
  ApiSuccessSchema,
  AuthDataSchema,
  type AuthData,
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

let refreshInFlight: Promise<AuthData | null> | null = null;

async function readError(response: Response): Promise<string> {
  try {
    const parsed = ApiErrorSchema.safeParse(await response.json());
    if (parsed.success) return parsed.data.error.message;
  } catch {
    // Use the local message below when an upstream response is not JSON.
  }
  return "Could not reach the academy service. Check that the API is running.";
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

export async function requestPasswordReset(email: string) {
  const response = await fetch(`${API_BASE}/auth/password-reset/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) throw new ApiRequestError(await readError(response), response.status);
}

export async function confirmPasswordReset(token: string, password: string) {
  const response = await fetch(`${API_BASE}/auth/password-reset/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
  if (!response.ok) throw new ApiRequestError(await readError(response), response.status);
}

async function requestWebSessionRefresh(): Promise<AuthData | null> {
  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientType: "web" }),
    cache: "no-store",
  });
  if (response.status === 401) return null;
  if (!response.ok) {
    throw new ApiRequestError(await readError(response), response.status);
  }
  return ApiSuccessSchema(AuthDataSchema).parse(await response.json()).data;
}

function withRefreshLock<T>(callback: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request("sportdesk-web-session-refresh", callback);
  }
  return callback();
}

export function refreshWebSession(): Promise<AuthData | null> {
  if (refreshInFlight) return refreshInFlight;

  const request = withRefreshLock(requestWebSessionRefresh);
  const trackedRequest = request.finally(() => {
    if (refreshInFlight === trackedRequest) refreshInFlight = null;
  });
  refreshInFlight = trackedRequest;
  return trackedRequest;
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
