import {
  AcademySettingsSchema,
  ApiErrorSchema,
  UpdateAcademySettingsRequestSchema,
  type AcademySettings,
  type UpdateAcademySettingsRequest,
} from "@sportdesk/contracts";
import { API_BASE, ApiRequestError } from "@/lib/auth-api";

type RefreshSession = () => Promise<string | null>;

async function request(
  method: "GET" | "PATCH",
  accessToken: string,
  refreshSession: RefreshSession,
  body?: unknown,
): Promise<AcademySettings> {
  const send = (token: string) =>
    fetch(`${API_BASE}/academy/settings`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store",
    });

  let response = await send(accessToken);
  if (response.status === 401) {
    const renewedToken = await refreshSession();
    if (renewedToken) response = await send(renewedToken);
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
  return AcademySettingsSchema.parse(result.data);
}

export function getAcademySettings(accessToken: string, refresh: RefreshSession) {
  return request("GET", accessToken, refresh);
}

export function updateAcademySettings(
  accessToken: string,
  refresh: RefreshSession,
  input: UpdateAcademySettingsRequest,
) {
  const parsed = UpdateAcademySettingsRequestSchema.parse(input);
  return request("PATCH", accessToken, refresh, parsed);
}
