import {
  AcademyCatalogSchema,
  ApiErrorSchema,
  CreateBatchRequestSchema,
  CreateDisciplineRequestSchema,
  CreateProgramRequestSchema,
  CreateStudentRequestSchema,
  CreatedRecordSchema,
  StudentDirectoryQuerySchema,
  StudentListSchema,
  StudentSchema,
  UpdateEnrollmentStatusRequestSchema,
  UpdateBatchRequestSchema,
  UpdateDisciplineRequestSchema,
  UpdateProgramRequestSchema,
  UpdateStudentGuardianRequestSchema,
  UpdateStudentRequestSchema,
  UpdatedRecordSchema,
  type AcademyCatalog,
  type CreateBatchRequest,
  type CreateDisciplineRequest,
  type CreateProgramRequest,
  type CreateStudentRequest,
  type StudentDirectoryQuery,
  type Student,
  type UpdateEnrollmentStatusRequest,
  type UpdateBatchRequest,
  type UpdateDisciplineRequest,
  type UpdateProgramRequest,
  type UpdateStudentGuardianRequest,
  type UpdateStudentRequest,
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
  return "Could not reach the academy service. Check that the API is running.";
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

export async function getStudents(
  accessToken: string,
  refresh: RefreshSession,
  query: StudentDirectoryQuery = { offset: 0, limit: 25 },
) {
  const parsed = StudentDirectoryQuerySchema.parse(query);
  const params = new URLSearchParams({
    offset: String(parsed.offset),
    limit: String(parsed.limit),
  });
  if (parsed.search) params.set("search", parsed.search);
  if (parsed.status) params.set("status", parsed.status);
  return requestData<{
    students: Student[];
    total?: number;
    offset?: number;
    limit?: number;
  }>(`/students?${params.toString()}`, StudentListSchema, accessToken, refresh);
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

export async function updateDiscipline(
  accessToken: string,
  refresh: RefreshSession,
  disciplineId: string,
  input: UpdateDisciplineRequest,
) {
  const value = UpdateDisciplineRequestSchema.parse(input);
  return requestData(`/disciplines/${disciplineId}`, UpdatedRecordSchema, accessToken, refresh, {
    method: "PATCH",
    body: JSON.stringify(value),
  });
}

export async function updateProgram(
  accessToken: string,
  refresh: RefreshSession,
  programId: string,
  input: UpdateProgramRequest,
) {
  const value = UpdateProgramRequestSchema.parse(input);
  return requestData(`/programs/${programId}`, UpdatedRecordSchema, accessToken, refresh, {
    method: "PATCH",
    body: JSON.stringify(value),
  });
}

export async function updateBatch(
  accessToken: string,
  refresh: RefreshSession,
  batchId: string,
  input: UpdateBatchRequest,
) {
  const value = UpdateBatchRequestSchema.parse(input);
  return requestData(`/batches/${batchId}`, UpdatedRecordSchema, accessToken, refresh, {
    method: "PATCH",
    body: JSON.stringify(value),
  });
}

export async function createStudent(
  accessToken: string,
  refresh: RefreshSession,
  input: CreateStudentRequest,
) {
  const value = CreateStudentRequestSchema.parse(input);
  return requestData<Student>("/students", StudentSchema, accessToken, refresh, jsonBody(value));
}

export async function updateStudent(
  accessToken: string,
  refresh: RefreshSession,
  studentId: string,
  input: UpdateStudentRequest,
) {
  const value = UpdateStudentRequestSchema.parse(input);
  return requestData(`/students/${studentId}`, UpdatedRecordSchema, accessToken, refresh, {
    method: "PATCH",
    body: JSON.stringify(value),
  });
}

export async function updateStudentGuardian(
  accessToken: string,
  refresh: RefreshSession,
  studentId: string,
  guardianId: string,
  input: UpdateStudentGuardianRequest,
) {
  const value = UpdateStudentGuardianRequestSchema.parse(input);
  return requestData(
    `/students/${studentId}/guardians/${guardianId}`,
    UpdatedRecordSchema,
    accessToken,
    refresh,
    { method: "PATCH", body: JSON.stringify(value) },
  );
}

export async function createEnrollment(
  accessToken: string,
  refresh: RefreshSession,
  studentId: string,
  batchId: string,
) {
  return requestData(
    `/students/${studentId}/enrollments`,
    CreatedRecordSchema,
    accessToken,
    refresh,
    jsonBody({ batchId }),
  );
}

export async function updateEnrollmentStatus(
  accessToken: string,
  refresh: RefreshSession,
  studentId: string,
  enrollmentId: string,
  input: UpdateEnrollmentStatusRequest,
) {
  const value = UpdateEnrollmentStatusRequestSchema.parse(input);
  return requestData(
    `/students/${studentId}/enrollments/${enrollmentId}`,
    CreatedRecordSchema,
    accessToken,
    refresh,
    { method: "PATCH", body: JSON.stringify(value) },
  );
}
