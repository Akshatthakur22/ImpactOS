import {
  AdminAnnouncementListSchema,
  ApiErrorSchema,
  CreateAnnouncementRequestSchema,
  CreatedRecordSchema,
  UpdatedRecordSchema,
  type AdminAnnouncement,
  type CreateAnnouncementRequest,
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
  return schema.parse(result.data);
}

export async function getAnnouncements(accessToken: string, refresh: RefreshSession) {
  const result = await request(
    "/announcements",
    AdminAnnouncementListSchema,
    accessToken,
    refresh,
  );
  return result.announcements as AdminAnnouncement[];
}

export function createAnnouncement(
  accessToken: string,
  refresh: RefreshSession,
  input: CreateAnnouncementRequest,
) {
  const body = CreateAnnouncementRequestSchema.parse(input);
  return request("/announcements", CreatedRecordSchema, accessToken, refresh, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateAnnouncement(
  accessToken: string,
  refresh: RefreshSession,
  announcementId: string,
  input: CreateAnnouncementRequest,
) {
  const body = CreateAnnouncementRequestSchema.parse(input);
  return request(`/announcements/${announcementId}`, UpdatedRecordSchema, accessToken, refresh, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function publishAnnouncement(
  accessToken: string,
  refresh: RefreshSession,
  announcementId: string,
) {
  return request(
    `/announcements/${announcementId}/publish`,
    UpdatedRecordSchema,
    accessToken,
    refresh,
    { method: "POST" },
  );
}

export function archiveAnnouncement(
  accessToken: string,
  refresh: RefreshSession,
  announcementId: string,
) {
  return request(
    `/announcements/${announcementId}/archive`,
    UpdatedRecordSchema,
    accessToken,
    refresh,
    { method: "POST" },
  );
}
