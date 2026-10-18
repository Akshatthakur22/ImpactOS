import type {
  CreateBatchRequest,
  CreateDisciplineRequest,
  CreateProgramRequest,
  CreateStudentRequest,
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

    async listStudents(academyId: string) {
      const records = await repository.listStudents(academyId);
      return records.map((student) => ({ ...student, createdAt: student.createdAt.toISOString() }));
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
  };
}

export type SportDeskAcademyService = ReturnType<typeof createAcademyService>;
