import {
  ApiErrorSchema,
  AdminAttendanceEntrySchema,
  AttendanceCorrectionEntrySchema,
  CoachSchema,
  CorrectAttendanceRequestSchema,
  GuardianInviteSchema,
  ScheduleSchema,
  TrainingSessionSchema,
  type CreateCoachRequest,
  type CreateScheduleRequest,
  type CreateSessionRequest,
  type CorrectAttendanceRequest,
  type Coach,
  type Schedule,
} from "@sportdesk/contracts";
import { API_BASE, ApiRequestError } from "@/lib/auth-api";

type RefreshSession = () => Promise<string | null>;

async function readError(response: Response) {
  try {
    const parsed = ApiErrorSchema.safeParse(await response.json());
    if (parsed.success) return parsed.data.error.message;
  } catch {
    // Keep upstream failures safe and predictable for the UI.
  }
  return "Could not connect to SportDesk. Check that the API is running.";
}

async function requestData<T>(
  path: string,
  parse: (value: unknown) => T,
  token: string,
  refresh: RefreshSession,
  init?: RequestInit,
) {
  const send = (accessToken: string) =>
    fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...init?.headers,
      },
      cache: "no-store",
    });
  let response = await send(token);
  if (response.status === 401) {
    const renewed = await refresh();
    if (renewed) response = await send(renewed);
  }
  if (!response.ok) throw new ApiRequestError(await readError(response), response.status);
  return parse((await response.json()).data);
}

const body = (value: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(value) });

export async function getCoaches(token: string, refresh: RefreshSession) {
  return requestData<{ coaches: Coach[] }>(
    "/coaches",
    (value: unknown) => ({
      coaches: (value as { coaches: unknown[] }).coaches.map((coach: unknown) =>
        CoachSchema.parse(coach),
      ),
    }),
    token,
    refresh,
  );
}

export async function createCoach(
  token: string,
  refresh: RefreshSession,
  input: CreateCoachRequest,
) {
  return requestData(
    "/coaches",
    (value: unknown) => CoachSchema.parse(value),
    token,
    refresh,
    body(input),
  );
}

export async function assignCoach(
  token: string,
  refresh: RefreshSession,
  batchId: string,
  coachId: string,
) {
  return requestData<{ id: string; batchId: string; coachId: string }>(
    `/batches/${batchId}/coaches`,
    (value: unknown) => value as { id: string; batchId: string; coachId: string },
    token,
    refresh,
    body({ coachId }),
  );
}

export async function getSchedules(token: string, refresh: RefreshSession) {
  return requestData<{ schedules: Schedule[] }>(
    "/schedules",
    (value: unknown) => ({
      schedules: (value as { schedules: unknown[] }).schedules.map((schedule: unknown) =>
        ScheduleSchema.parse(schedule),
      ),
    }),
    token,
    refresh,
  );
}

export async function createSchedule(
  token: string,
  refresh: RefreshSession,
  input: CreateScheduleRequest,
) {
  return requestData(
    "/schedules",
    (value: unknown) => ScheduleSchema.parse(value),
    token,
    refresh,
    body(input),
  );
}

export async function createSession(
  token: string,
  refresh: RefreshSession,
  scheduleId: string,
  input: CreateSessionRequest,
) {
  return requestData(
    "/schedules/" + scheduleId + "/sessions",
    (value: unknown) => TrainingSessionSchema.parse(value),
    token,
    refresh,
    body(input),
  );
}

export async function getAttendance(
  token: string,
  refresh: RefreshSession,
  from: string,
  to: string,
) {
  const query = new URLSearchParams({ from, to });
  return requestData<{ records: ReturnType<typeof AdminAttendanceEntrySchema.parse>[] }>(
    `/attendance?${query.toString()}`,
    (value: unknown) => ({
      records: (value as { records: unknown[] }).records.map((record) =>
        AdminAttendanceEntrySchema.parse(record),
      ),
    }),
    token,
    refresh,
  );
}

export async function getAttendanceCorrections(token: string, refresh: RefreshSession, id: string) {
  return requestData<{ corrections: ReturnType<typeof AttendanceCorrectionEntrySchema.parse>[] }>(
    `/attendance/${id}/corrections`,
    (value: unknown) => ({
      corrections: (value as { corrections: unknown[] }).corrections.map((record) =>
        AttendanceCorrectionEntrySchema.parse(record),
      ),
    }),
    token,
    refresh,
  );
}

export async function correctAttendance(
  token: string,
  refresh: RefreshSession,
  id: string,
  input: CorrectAttendanceRequest,
) {
  const parsed = CorrectAttendanceRequestSchema.parse(input);
  return requestData(`/attendance/${id}`, (value: unknown) => value, token, refresh, {
    method: "PATCH",
    body: JSON.stringify(parsed),
  });
}

export async function createGuardianInvite(
  token: string,
  refresh: RefreshSession,
  guardianId: string,
) {
  return requestData(
    `/guardians/${guardianId}/invites`,
    (value: unknown) => GuardianInviteSchema.parse(value),
    token,
    refresh,
    body({}),
  );
}
