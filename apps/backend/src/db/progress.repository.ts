import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { RecordProgressRequest } from "@sportdesk/contracts";
import type { CoachStudentFeedbackRequest } from "@sportdesk/contracts";
import type { Database } from "./client.js";
import {
  batchCoaches,
  batches,
  attendanceRecords,
  coachProfiles,
  coachStudentFeedback,
  disciplines,
  enrollments,
  progressEntries,
  programs,
  students,
  trainingSessions,
  users,
} from "./schema.js";

export class ProgressRepositoryError extends Error {
  constructor(
    readonly code: "STUDENT_NOT_IN_SESSION" | "COACH_NOT_ASSIGNED" | "STUDENT_NOT_ASSIGNED",
  ) {
    super(code);
  }
}

export function createProgressRepository(db: Database) {
  return {
    async assertCoachOwnsStudent(academyId: string, coachId: string, studentId: string) {
      const [assigned] = await db
        .select({ studentId: students.id })
        .from(coachProfiles)
        .innerJoin(batchCoaches, eq(batchCoaches.coachId, coachProfiles.id))
        .innerJoin(
          batches,
          and(eq(batches.id, batchCoaches.batchId), eq(batches.academyId, academyId)),
        )
        .innerJoin(
          enrollments,
          and(eq(enrollments.batchId, batches.id), eq(enrollments.academyId, academyId)),
        )
        .innerJoin(
          students,
          and(eq(students.id, enrollments.studentId), eq(students.academyId, academyId)),
        )
        .where(
          and(
            eq(coachProfiles.academyId, academyId),
            eq(coachProfiles.userId, coachId),
            eq(coachProfiles.status, "active"),
            eq(batches.isActive, true),
            eq(enrollments.status, "active"),
            eq(students.status, "active"),
            eq(students.id, studentId),
          ),
        )
        .limit(1);
      if (!assigned) throw new ProgressRepositoryError("STUDENT_NOT_ASSIGNED");
    },
    async listStudentFeedback(academyId: string, coachId: string, studentId: string) {
      await this.assertCoachOwnsStudent(academyId, coachId, studentId);
      return db
        .select({
          id: coachStudentFeedback.id,
          studentId: coachStudentFeedback.studentId,
          coachId: coachStudentFeedback.coachId,
          coachName: users.displayName,
          weekOf: coachStudentFeedback.weekOf,
          performance: coachStudentFeedback.performance,
          guidance: coachStudentFeedback.guidance,
          createdAt: coachStudentFeedback.createdAt,
          updatedAt: coachStudentFeedback.updatedAt,
        })
        .from(coachStudentFeedback)
        .innerJoin(users, eq(users.id, coachStudentFeedback.coachId))
        .where(
          and(
            eq(coachStudentFeedback.academyId, academyId),
            eq(coachStudentFeedback.coachId, coachId),
            eq(coachStudentFeedback.studentId, studentId),
          ),
        )
        .orderBy(desc(coachStudentFeedback.weekOf), desc(coachStudentFeedback.updatedAt))
        .limit(52);
    },
    async listCoachStudentHistory(academyId: string, coachId: string, studentId: string) {
      await this.assertCoachOwnsStudent(academyId, coachId, studentId);
      const attendance = await db
        .select({
          id: attendanceRecords.id,
          sessionId: trainingSessions.id,
          batchName: batches.name,
          scheduledStart: trainingSessions.startsAt,
          status: attendanceRecords.status,
        })
        .from(attendanceRecords)
        .innerJoin(trainingSessions, eq(trainingSessions.id, attendanceRecords.sessionId))
        .innerJoin(batches, eq(batches.id, trainingSessions.batchId))
        .innerJoin(
          batchCoaches,
          and(eq(batchCoaches.batchId, batches.id), eq(batchCoaches.academyId, academyId)),
        )
        .innerJoin(
          coachProfiles,
          and(
            eq(coachProfiles.id, batchCoaches.coachId),
            eq(coachProfiles.userId, coachId),
            eq(coachProfiles.academyId, academyId),
            eq(coachProfiles.status, "active"),
          ),
        )
        .where(
          and(
            eq(attendanceRecords.academyId, academyId),
            eq(attendanceRecords.studentId, studentId),
          ),
        )
        .orderBy(desc(trainingSessions.startsAt))
        .limit(100);
      const progress = await db
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
        .innerJoin(
          batchCoaches,
          and(eq(batchCoaches.batchId, batches.id), eq(batchCoaches.academyId, academyId)),
        )
        .innerJoin(
          coachProfiles,
          and(
            eq(coachProfiles.id, batchCoaches.coachId),
            eq(coachProfiles.userId, coachId),
            eq(coachProfiles.academyId, academyId),
            eq(coachProfiles.status, "active"),
          ),
        )
        .where(
          and(eq(progressEntries.academyId, academyId), eq(progressEntries.studentId, studentId)),
        )
        .orderBy(desc(progressEntries.createdAt))
        .limit(100);
      return { attendance, progress };
    },
    async saveStudentFeedback(
      input: CoachStudentFeedbackRequest & {
        academyId: string;
        coachId: string;
        studentId: string;
      },
    ) {
      await this.assertCoachOwnsStudent(input.academyId, input.coachId, input.studentId);
      const [entry] = await db
        .insert(coachStudentFeedback)
        .values({
          academyId: input.academyId,
          studentId: input.studentId,
          coachId: input.coachId,
          weekOf: input.weekOf,
          performance: input.performance,
          guidance: input.guidance,
        })
        .onConflictDoUpdate({
          target: [
            coachStudentFeedback.academyId,
            coachStudentFeedback.studentId,
            coachStudentFeedback.coachId,
            coachStudentFeedback.weekOf,
          ],
          set: { performance: input.performance, guidance: input.guidance, updatedAt: new Date() },
        })
        .returning({
          id: coachStudentFeedback.id,
          studentId: coachStudentFeedback.studentId,
          coachId: coachStudentFeedback.coachId,
          weekOf: coachStudentFeedback.weekOf,
          performance: coachStudentFeedback.performance,
          guidance: coachStudentFeedback.guidance,
          createdAt: coachStudentFeedback.createdAt,
          updatedAt: coachStudentFeedback.updatedAt,
        });
      if (!entry) throw new Error("Coach feedback was not saved.");
      return entry;
    },
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
