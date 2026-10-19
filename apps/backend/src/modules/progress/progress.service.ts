import type { RecordProgressRequest } from "@sportdesk/contracts";
import type { CoachStudentFeedbackRequest } from "@sportdesk/contracts";
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
    if (error.code === "STUDENT_NOT_ASSIGNED")
      throw new ProgressError(
        403,
        error.code,
        "The student is not currently assigned to this coach.",
      );
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
    async listStudentFeedback(academyId: string, coachId: string, studentId: string) {
      try {
        return await repository.listStudentFeedback(academyId, coachId, studentId);
      } catch (error) {
        translate(error);
      }
    },
    async listCoachStudentHistory(academyId: string, coachId: string, studentId: string) {
      try {
        return await repository.listCoachStudentHistory(academyId, coachId, studentId);
      } catch (error) {
        translate(error);
      }
    },
    async saveStudentFeedback(
      input: CoachStudentFeedbackRequest & {
        academyId: string;
        coachId: string;
        studentId: string;
      },
    ) {
      try {
        return await repository.saveStudentFeedback(input);
      } catch (error) {
        translate(error);
      }
    },
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
