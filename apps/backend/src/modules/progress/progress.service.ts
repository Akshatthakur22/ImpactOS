import type { RecordProgressRequest } from "@sportdesk/contracts";
import type { ProgressRepository } from "../../db/progress.repository.js";
import { ProgressRepositoryError } from "../../db/progress.repository.js";

export class ProgressError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function translate(error: unknown): never {
  if (error instanceof ProgressRepositoryError) {
    if (error.code === "COACH_NOT_ASSIGNED")
      throw new ProgressError(403, error.code, "The coach is not assigned to this session.");
    throw new ProgressError(
      400,
      error.code,
      "The student is not actively enrolled in this session's batch.",
    );
  }
  throw error;
}

export function createProgressService(repository: ProgressRepository) {
  return {
    async record(
      input: RecordProgressRequest & { academyId: string; sessionId: string; coachId: string },
    ) {
      try {
        return await repository.record(input);
      } catch (error) {
        translate(error);
      }
    },
    listAcademy(academyId: string) {
      return repository.listAcademy(academyId);
    },
    async listSession(academyId: string, coachId: string, sessionId: string) {
      try {
        return await repository.listSession(academyId, coachId, sessionId);
      } catch (error) {
        translate(error);
      }
    },
  };
}
export type SportDeskProgressService = ReturnType<typeof createProgressService>;
