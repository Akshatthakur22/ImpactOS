import type {
  CreateBatchRequest,
  CreateDisciplineRequest,
  CreateProgramRequest,
  CreateStudentRequest,
  UpdateAcademySettingsRequest,
  UpdateBatchRequest,
  UpdateDisciplineRequest,
  StudentDirectoryQuery,
  UpdateProgramRequest,
  UpdateEnrollmentStatusRequest,
  UpdateStudentGuardianRequest,
  UpdateStudentRequest,
} from "@sportdesk/contracts";
import { AcademyRepositoryError, type AcademyRepository } from "../../db/academy.repository.js";

export class AcademyError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AcademyError";
  }
}

function getDatabaseErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("cause" in error) return getDatabaseErrorCode(error.cause);
  return undefined;
}

function translateError(error: unknown): never {
  if (error instanceof AcademyError) throw error;
  if (error instanceof AcademyRepositoryError) {
    if (error.code === "RELATED_RECORD_NOT_FOUND") {
      throw new AcademyError(
        404,
        "RELATED_RECORD_NOT_FOUND",
        "The selected academy record was not found.",
      );
    }
    if (error.code === "BATCH_FULL") {
      throw new AcademyError(409, "BATCH_FULL", "This batch has reached its configured capacity.");
    }
    if (error.code === "STUDENT_HAS_ACTIVE_ENROLLMENTS") {
      throw new AcademyError(
        409,
        error.code,
        "End the student's active enrollments before moving them to lead or pending.",
      );
    }
    if (error.code === "STUDENT_NOT_ACTIVE") {
      throw new AcademyError(409, error.code, "Only active students can be enrolled in a batch.");
    }
    if (error.code === "ENROLLMENT_ALREADY_ENDED") {
      throw new AcademyError(
        409,
        error.code,
        "This enrollment has ended. Create a new enrollment to resume training.",
      );
    }
    if (error.code === "GUARDIAN_ACCOUNT_EMAIL_LOCKED") {
      throw new AcademyError(
        409,
        error.code,
        "A linked parent account's email cannot be changed from student records.",
      );
    }
    if (error.code === "ACTIVE_CHILD_RECORDS") {
      throw new AcademyError(
        409,
        error.code,
        "Archive active dependent records or end active enrollments first.",
      );
    }
    if (error.code === "CAPACITY_BELOW_ENROLLMENT") {
      throw new AcademyError(
        409,
        error.code,
        "Batch capacity cannot be lower than its current active enrollment count.",
      );
    }
    throw new AcademyError(
      409,
      "ALREADY_ENROLLED",
      "This student already has an active enrollment in that batch.",
    );
  }
  const databaseCode = getDatabaseErrorCode(error);
  if (databaseCode === "23505") {
    throw new AcademyError(409, "DUPLICATE_RECORD", "A record with those details already exists.");
  }
  if (databaseCode === "23503") {
    throw new AcademyError(
      404,
      "RELATED_RECORD_NOT_FOUND",
      "The selected academy record was not found.",
    );
  }
  if (databaseCode === "23514") {
    throw new AcademyError(400, "INVALID_RECORD", "The submitted record violates an academy rule.");
  }
  throw error;
}

export function createAcademyService(repository: AcademyRepository) {
  return {
    async getSettings(academyId: string) {
      const settings = await repository.getSettings(academyId);
      if (!settings)
        throw new AcademyError(404, "ACADEMY_NOT_FOUND", "The academy was not found.");
      return settings;
    },

    async updateSettings(academyId: string, changes: UpdateAcademySettingsRequest) {
      const settings = await repository.updateSettings({ academyId, changes });
      if (!settings)
        throw new AcademyError(404, "ACADEMY_NOT_FOUND", "The academy was not found.");
      return settings;
    },

    async getCatalog(academyId: string) {
      const [disciplines, programs, batches] = await Promise.all([
        repository.listDisciplines(academyId),
        repository.listPrograms(academyId),
        repository.listBatches(academyId),
      ]);
      return { disciplines, programs, batches };
    },

    async createDiscipline(
      input: CreateDisciplineRequest & { academyId: string; createdBy: string },
    ) {
      try {
        return await repository.createDiscipline(input);
      } catch (error) {
        translateError(error);
      }
    },

    async createProgram(input: CreateProgramRequest & { academyId: string; createdBy: string }) {
      try {
        return await repository.createProgram(input);
      } catch (error) {
        translateError(error);
      }
    },

    async createBatch(input: CreateBatchRequest & { academyId: string; createdBy: string }) {
      try {
        return await repository.createBatch(input);
      } catch (error) {
        translateError(error);
      }
    },

    async updateDiscipline(input: {
      academyId: string;
      disciplineId: string;
      changes: UpdateDisciplineRequest;
    }) {
      try {
        await repository.updateDiscipline(input);
        return { updated: true };
      } catch (error) {
        translateError(error);
      }
    },

    async updateProgram(input: {
      academyId: string;
      programId: string;
      changes: UpdateProgramRequest;
    }) {
      try {
        await repository.updateProgram(input);
        return { updated: true };
      } catch (error) {
        translateError(error);
      }
    },

    async updateBatch(input: { academyId: string; batchId: string; changes: UpdateBatchRequest }) {
      try {
        await repository.updateBatch(input);
        return { updated: true };
      } catch (error) {
        translateError(error);
      }
    },

    async listStudents(academyId: string, query: StudentDirectoryQuery) {
      const result = await repository.listStudents(academyId, query);
      return {
        ...result,
        students: result.students.map((student) => ({
          ...student,
          createdAt: student.createdAt.toISOString(),
        })),
      };
    },

    async createStudent(input: CreateStudentRequest & { academyId: string; createdBy: string }) {
      try {
        const student = await repository.createStudent(input);
        return { ...student, createdAt: student.createdAt.toISOString() };
      } catch (error) {
        translateError(error);
      }
    },

    async createEnrollment(input: {
      academyId: string;
      createdBy: string;
      studentId: string;
      batchId: string;
    }) {
      try {
        return await repository.createEnrollment(input);
      } catch (error) {
        translateError(error);
      }
    },

    async updateStudent(input: {
      academyId: string;
      studentId: string;
      changes: UpdateStudentRequest;
    }) {
      try {
        await repository.updateStudent(input);
        return { updated: true };
      } catch (error) {
        translateError(error);
      }
    },

    async updateStudentGuardian(input: {
      academyId: string;
      studentId: string;
      guardianId: string;
      changes: UpdateStudentGuardianRequest;
    }) {
      try {
        await repository.updateStudentGuardian(input);
        return { updated: true };
      } catch (error) {
        translateError(error);
      }
    },

    async updateEnrollmentStatus(input: {
      academyId: string;
      studentId: string;
      enrollmentId: string;
      status: UpdateEnrollmentStatusRequest["status"];
    }) {
      try {
        const enrollment = await repository.endEnrollment(input);
        return {
          ...enrollment,
          startedAt: enrollment.startedAt.toISOString(),
          endedAt: enrollment.endedAt?.toISOString() ?? null,
        };
      } catch (error) {
        translateError(error);
      }
    },
  };
}

export type SportDeskAcademyService = ReturnType<typeof createAcademyService>;
