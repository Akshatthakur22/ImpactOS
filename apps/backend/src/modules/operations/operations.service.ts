import type {
  CreateCoachRequest,
  CreateScheduleRequest,
  CreateSessionRequest,
  CorrectAttendanceRequest,
  RecordAttendanceRequest,
} from "@sportdesk/contracts";
import {
  OperationsRepositoryError,
  type OperationsRepository,
} from "../../db/operations.repository.js";
import { passwordHasher } from "../auth/password.js";

export class OperationsError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "OperationsError";
  }
}

function translateError(error: unknown): never {
  if (error instanceof OperationsError) throw error;
  if (error instanceof OperationsRepositoryError) {
    if (error.code === "COACH_NOT_FOUND") {
      throw new OperationsError(404, error.code, "The coach was not found in this academy.");
    }
    if (error.code === "COACH_NOT_ASSIGNED") {
      throw new OperationsError(403, error.code, "The coach is not assigned to this session.");
    }
    if (error.code === "SESSION_CLOSED") {
      throw new OperationsError(409, error.code, "Attendance is closed for this session.");
    }
    if (error.code === "ATTENDANCE_INCOMPLETE") {
      throw new OperationsError(
        409,
        error.code,
        "Record an attendance status for every enrolled student before completing the session.",
      );
    }
    if (error.code === "INVALID_ATTENDANCE") {
      throw new OperationsError(
        400,
        error.code,
        "Attendance can only be recorded for active students in this batch.",
      );
    }
    throw new OperationsError(
      404,
      "RELATED_RECORD_NOT_FOUND",
      "The selected academy record was not found.",
    );
  }
  if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
    throw new OperationsError(
      409,
      "DUPLICATE_RECORD",
      "A record with those details already exists.",
    );
  }
  if (typeof error === "object" && error !== null && "code" in error && error.code === "23514") {
    throw new OperationsError(
      400,
      "INVALID_RECORD",
      "The submitted record violates an academy rule.",
    );
  }
  throw error;
}

function isoDate(value: Date) {
  return value.toISOString();
}

export function createOperationsService(repository: OperationsRepository) {
  return {
    async createCoach(input: CreateCoachRequest & { academyId: string; createdBy: string }) {
      try {
        const passwordHash = await passwordHasher.hash(input.password);
        const coach = await repository.createCoach({
          academyId: input.academyId,
          createdBy: input.createdBy,
          displayName: input.displayName,
          email: input.email,
          passwordHash,
          specializations: input.specializations,
          ...(input.phone ? { phone: input.phone } : {}),
        });
        return coach;
      } catch (error) {
        translateError(error);
      }
    },

    async listCoaches(academyId: string) {
      return repository.listCoaches(academyId);
    },

    async assignCoach(input: {
      academyId: string;
      createdBy: string;
      batchId: string;
      coachId: string;
    }) {
      try {
        return await repository.assignCoach(input);
      } catch (error) {
        translateError(error);
      }
    },

    async listSchedules(academyId: string) {
      return repository.listSchedules(academyId);
    },

    async listAttendance(academyId: string, from: Date, to: Date) {
      const records = await repository.listAttendance(academyId, from, to);
      return records.map((record) => ({
        ...record,
        scheduledStart: isoDate(record.scheduledStart),
        recordedAt: isoDate(record.recordedAt),
      }));
    },

    async listAttendanceCorrections(academyId: string, attendanceId: string) {
      const corrections = await repository.listAttendanceCorrections(academyId, attendanceId);
      return corrections.map((correction) => ({
        ...correction,
        correctedAt: isoDate(correction.correctedAt),
      }));
    },

    async correctAttendance(
      input: CorrectAttendanceRequest & {
        academyId: string;
        attendanceId: string;
        correctedBy: string;
      },
    ) {
      try {
        const correction = await repository.correctAttendance({ ...input, now: new Date() });
        return { ...correction, correctedAt: isoDate(correction.correctedAt) };
      } catch (error) {
        translateError(error);
      }
    },

    async createSchedule(input: CreateScheduleRequest & { academyId: string; createdBy: string }) {
      try {
        return await repository.createSchedule({
          academyId: input.academyId,
          createdBy: input.createdBy,
          batchId: input.batchId,
          dayOfWeek: input.dayOfWeek,
          startTime: input.startTime,
          endTime: input.endTime,
          ...(input.venue ? { venue: input.venue } : {}),
        });
      } catch (error) {
        translateError(error);
      }
    },

    async createSession(
      input: CreateSessionRequest & { academyId: string; createdBy: string; scheduleId: string },
    ) {
      try {
        const session = await repository.createSession({
          ...input,
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
        });
        return { ...session, startsAt: isoDate(session.startsAt), endsAt: isoDate(session.endsAt) };
      } catch (error) {
        translateError(error);
      }
    },

    async listCoachSessions(academyId: string, userId: string, from: Date, to: Date) {
      const sessions = await repository.listCoachSessions(academyId, userId, from, to);
      return sessions.map((session) => ({
        ...session,
        startsAt: isoDate(session.startsAt),
        endsAt: isoDate(session.endsAt),
      }));
    },

    async getSessionRoster(academyId: string, sessionId: string, userId: string) {
      try {
        const roster = await repository.getSessionRoster(academyId, sessionId, userId);
        return {
          session: {
            ...roster.session,
            startsAt: isoDate(roster.session.startsAt),
            endsAt: isoDate(roster.session.endsAt),
          },
          students: roster.students,
        };
      } catch (error) {
        translateError(error);
      }
    },

    async recordAttendance(
      input: RecordAttendanceRequest & { academyId: string; sessionId: string; userId: string },
    ) {
      try {
        const records = await repository.recordAttendance(input);
        return records.map((record) => ({ ...record, recordedAt: isoDate(record.recordedAt) }));
      } catch (error) {
        translateError(error);
      }
    },

    async completeSession(academyId: string, sessionId: string, userId: string) {
      try {
        return await repository.completeSession(academyId, sessionId, userId);
      } catch (error) {
        translateError(error);
      }
    },
  };
}

export type SportDeskOperationsService = ReturnType<typeof createOperationsService>;
