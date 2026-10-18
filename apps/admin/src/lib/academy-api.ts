import {
  AcademyCatalogSchema,
  ApiErrorSchema,
  CreateBatchRequestSchema,
  CreateDisciplineRequestSchema,
  CreateProgramRequestSchema,
  CreateStudentRequestSchema,
  CreatedRecordSchema,
  StudentListSchema,
  StudentSchema,
  type AcademyCatalog,
  type CreateBatchRequest,
  type CreateDisciplineRequest,
  type CreateProgramRequest,
  type CreateStudentRequest,
  type Student,
} from "@sportdesk/contracts";
import { API_BASE, ApiRequestError } from "@/lib/auth-api";

type RefreshSession = () => Promise<string | null>;

async function errorMessage(response: Response) {
  try {
    const parsed = ApiErrorSchema.safeParse(await response.json());
    if (parsed.success) return parsed.data.error.message;
  } catch {
    // Use the stable connection message below for malformed upstream responses.
  }
  return "Could not connect to SportDesk. Check that the API is running.";
}

async function requestData<T>(
  path: string,
  schema: { parse: (value: unknown) => T },
  accessToken: string,
  refreshSession: RefreshSession,
  init?: RequestInit,
): Promise<T> {
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
    const renewedToken = await refreshSession();
    if (renewedToken) response = await send(renewedToken);
  }
  if (!response.ok) throw new ApiRequestError(await errorMessage(response), response.status);
  const result = (await response.json()) as { data: unknown };
  return schema.parse(result.data);
}

function jsonBody(value: unknown): RequestInit {
  return { method: "POST", body: JSON.stringify(value) };
}

export async function getAcademyCatalog(accessToken: string, refresh: RefreshSession) {
  return requestData<AcademyCatalog>(
    "/academy/catalog",
    AcademyCatalogSchema,
    accessToken,
    refresh,
  );
}

export async function getStudents(accessToken: string, refresh: RefreshSession) {
  return requestData<{ students: Student[] }>("/students", StudentListSchema, accessToken, refresh);
}

export async function createDiscipline(
  accessToken: string,
  refresh: RefreshSession,
  input: CreateDisciplineRequest,
) {
  const value = CreateDisciplineRequestSchema.parse(input);
  return requestData("/disciplines", CreatedRecordSchema, accessToken, refresh, jsonBody(value));
}

export async function createProgram(
  accessToken: string,
  refresh: RefreshSession,
  input: CreateProgramRequest,
) {
  const value = CreateProgramRequestSchema.parse(input);
  return requestData("/programs", CreatedRecordSchema, accessToken, refresh, jsonBody(value));
}

export async function createBatch(
  accessToken: string,
  refresh: RefreshSession,
  input: CreateBatchRequest,
) {
  const value = CreateBatchRequestSchema.parse(input);
  return requestData("/batches", CreatedRecordSchema, accessToken, refresh, jsonBody(value));
}

export async function createStudent(
  accessToken: string,
  refresh: RefreshSession,
  input: CreateStudentRequest,
) {
  const value = CreateStudentRequestSchema.parse(input);
  return requestData<Student>("/students", StudentSchema, accessToken, refresh, jsonBody(value));
}
