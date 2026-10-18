import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { RecordProgressRequest } from "@sportdesk/contracts";
import type { Database } from "./client.js";
import {
  batchCoaches,
  batches,
  coachProfiles,
  disciplines,
  enrollments,
  progressEntries,
  programs,
  students,
  trainingSessions,
  users,
} from "./schema.js";

export class ProgressRepositoryError extends Error {
  constructor(readonly code: "STUDENT_NOT_IN_SESSION" | "COACH_NOT_ASSIGNED") {
    super(code);
  }
}

export function createProgressRepository(db: Database) {
  return {
    async record(
      input: RecordProgressRequest & { academyId: string; sessionId: string; coachId: string },
    ) {
      const [context] = await db
        .select({ batchId: trainingSessions.batchId })
        .from(trainingSessions)
        .innerJoin(
          batchCoaches,
          and(
            eq(batchCoaches.batchId, trainingSessions.batchId),
            eq(batchCoaches.academyId, input.academyId),
          ),
        )
        .innerJoin(
          coachProfiles,
          and(
            eq(coachProfiles.id, batchCoaches.coachId),
            eq(coachProfiles.userId, input.coachId),
            eq(coachProfiles.academyId, input.academyId),
          ),
        )
        .innerJoin(
          enrollments,
          and(
            eq(enrollments.batchId, trainingSessions.batchId),
            eq(enrollments.studentId, input.studentId),
            eq(enrollments.academyId, input.academyId),
            eq(enrollments.status, "active"),
          ),
        )
        .where(
          and(
            eq(trainingSessions.id, input.sessionId),
            eq(trainingSessions.academyId, input.academyId),
          ),
        )
        .limit(1);
      if (!context) throw new ProgressRepositoryError("STUDENT_NOT_IN_SESSION");
      const [entry] = await db
        .insert(progressEntries)
        .values({
          academyId: input.academyId,
          studentId: input.studentId,
          sessionId: input.sessionId,
          coachId: input.coachId,
          assessmentName: input.assessmentName,
          value: input.value || null,
          coachNote: input.coachNote || null,
          parentVisible: input.parentVisible,
        })
        .returning({ id: progressEntries.id });
      return entry;
    },
    async listAcademy(academyId: string) {
      return db
        .select({
          id: progressEntries.id,
          studentId: progressEntries.studentId,
          studentName: sql<string>`${students.firstName} || ' ' || ${students.lastName}`,
          sessionId: progressEntries.sessionId,
          batchName: batches.name,
          sportName: disciplines.name,
          assessmentName: progressEntries.assessmentName,
          value: progressEntries.value,
          coachNote: progressEntries.coachNote,
          parentVisible: progressEntries.parentVisible,
          coachName: users.displayName,
          createdAt: progressEntries.createdAt,
        })
        .from(progressEntries)
        .innerJoin(students, eq(students.id, progressEntries.studentId))
        .innerJoin(trainingSessions, eq(trainingSessions.id, progressEntries.sessionId))
        .innerJoin(batches, eq(batches.id, trainingSessions.batchId))
        .innerJoin(programs, eq(programs.id, batches.programId))
        .innerJoin(disciplines, eq(disciplines.id, programs.disciplineId))
        .innerJoin(users, eq(users.id, progressEntries.coachId))
        .where(eq(progressEntries.academyId, academyId))
        .orderBy(desc(progressEntries.createdAt))
        .limit(500);
    },
    async listSession(academyId: string, coachId: string, sessionId: string) {
      const assigned = await db
        .select({ id: batchCoaches.id })
        .from(batchCoaches)
        .innerJoin(trainingSessions, eq(trainingSessions.batchId, batchCoaches.batchId))
        .innerJoin(
          coachProfiles,
          and(
            eq(coachProfiles.id, batchCoaches.coachId),
            eq(coachProfiles.userId, coachId),
            eq(coachProfiles.academyId, academyId),
          ),
        )
        .where(and(eq(batchCoaches.academyId, academyId), eq(trainingSessions.id, sessionId)))
        .limit(1);
      if (!assigned.length) throw new ProgressRepositoryError("COACH_NOT_ASSIGNED");
      return db
        .select({
          id: progressEntries.id,
          studentId: progressEntries.studentId,
          studentName: sql<string>`${students.firstName} || ' ' || ${students.lastName}`,
          sessionId: progressEntries.sessionId,
          batchName: batches.name,
          sportName: disciplines.name,
          assessmentName: progressEntries.assessmentName,
          value: progressEntries.value,
          coachNote: progressEntries.coachNote,
          parentVisible: progressEntries.parentVisible,
          coachName: users.displayName,
          createdAt: progressEntries.createdAt,
        })
        .from(progressEntries)
        .innerJoin(students, eq(students.id, progressEntries.studentId))
        .innerJoin(trainingSessions, eq(trainingSessions.id, progressEntries.sessionId))
        .innerJoin(batches, eq(batches.id, trainingSessions.batchId))
        .innerJoin(programs, eq(programs.id, batches.programId))
        .innerJoin(disciplines, eq(disciplines.id, programs.disciplineId))
        .innerJoin(users, eq(users.id, progressEntries.coachId))
        .where(
          and(eq(progressEntries.academyId, academyId), eq(progressEntries.sessionId, sessionId)),
        )
        .orderBy(asc(progressEntries.createdAt));
    },
  };
}

export type ProgressRepository = ReturnType<typeof createProgressRepository>;
