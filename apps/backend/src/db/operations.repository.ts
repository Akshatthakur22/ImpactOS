import { and, asc, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { Database } from "./client.js";
import {
  attendanceCorrections,
  attendanceRecords,
  batchCoaches,
  batchSchedules,
  batches,
  coachProfiles,
  enrollments,
  students,
  trainingSessions,
  users,
} from "./schema.js";

export class OperationsRepositoryError extends Error {
  constructor(
    readonly code:
      | "RELATED_RECORD_NOT_FOUND"
      | "COACH_NOT_FOUND"
      | "COACH_NOT_ASSIGNED"
      | "SESSION_CLOSED"
      | "ATTENDANCE_INCOMPLETE"
      | "INVALID_ATTENDANCE",
  ) {
    super(code);
    this.name = "OperationsRepositoryError";
  }
}

type AcademyContext = { academyId: string; createdBy: string };

export function createOperationsRepository(db: Database) {
  return {
    async createCoach(
      input: AcademyContext & {
        displayName: string;
        email: string;
        passwordHash: string;
        phone?: string;
        specializations: string[];
      },
    ) {
      return db.transaction(async (tx) => {
        const [user] = await tx
          .insert(users)
          .values({
            academyId: input.academyId,
            email: input.email,
            passwordHash: input.passwordHash,
            displayName: input.displayName,
            role: "coach",
          })
          .returning({ id: users.id, displayName: users.displayName, email: users.email });
        if (!user) throw new Error("Coach user insert returned no record.");
        const [profile] = await tx
          .insert(coachProfiles)
          .values({
            academyId: input.academyId,
            userId: user.id,
            createdBy: input.createdBy,
            specializations: input.specializations,
            ...(input.phone ? { phone: input.phone } : {}),
          })
          .returning({ id: coachProfiles.id, status: coachProfiles.status });
        if (!profile) throw new Error("Coach profile insert returned no record.");
        return {
          id: profile.id,
          userId: user.id,
          displayName: user.displayName,
          email: user.email,
          phone: input.phone ?? null,
          specializations: input.specializations,
          status: profile.status,
          batchIds: [],
        };
      });
    },

    async listCoaches(academyId: string) {
      const rows = await db
        .select({
          id: coachProfiles.id,
          userId: users.id,
          displayName: users.displayName,
          email: users.email,
          phone: coachProfiles.phone,
          specializations: coachProfiles.specializations,
          status: coachProfiles.status,
          batchId: batchCoaches.batchId,
        })
        .from(coachProfiles)
        .innerJoin(users, eq(coachProfiles.userId, users.id))
        .leftJoin(
          batchCoaches,
          and(eq(batchCoaches.coachId, coachProfiles.id), eq(batchCoaches.academyId, academyId)),
        )
        .where(eq(coachProfiles.academyId, academyId))
        .orderBy(asc(users.displayName));
      const coaches = new Map<string, (typeof rows)[number] & { batchIds: string[] }>();
      for (const row of rows) {
        const current = coaches.get(row.id) ?? { ...row, batchIds: [] };
        if (row.batchId) current.batchIds.push(row.batchId);
        coaches.set(row.id, current);
      }
      return [...coaches.values()].map(({ batchId: _batchId, ...coach }) => coach);
    },

    async assignCoach(input: AcademyContext & { batchId: string; coachId: string }) {
      const [coach] = await db
        .select({ id: coachProfiles.id })
        .from(coachProfiles)
        .where(
          and(
            eq(coachProfiles.id, input.coachId),
            eq(coachProfiles.academyId, input.academyId),
            eq(coachProfiles.status, "active"),
          ),
        )
        .limit(1);
      if (!coach) throw new OperationsRepositoryError("COACH_NOT_FOUND");
      const [batch] = await db
        .select({ id: batches.id })
        .from(batches)
        .where(
          and(
            eq(batches.id, input.batchId),
            eq(batches.academyId, input.academyId),
            eq(batches.isActive, true),
          ),
        )
        .limit(1);
      if (!batch) throw new OperationsRepositoryError("RELATED_RECORD_NOT_FOUND");
      const [assignment] = await db
        .insert(batchCoaches)
        .values(input)
        .onConflictDoNothing()
        .returning({
          id: batchCoaches.id,
          batchId: batchCoaches.batchId,
          coachId: batchCoaches.coachId,
        });
      if (assignment) return assignment;
      const [existing] = await db
        .select({
          id: batchCoaches.id,
          batchId: batchCoaches.batchId,
          coachId: batchCoaches.coachId,
        })
        .from(batchCoaches)
        .where(
          and(
            eq(batchCoaches.academyId, input.academyId),
            eq(batchCoaches.batchId, input.batchId),
            eq(batchCoaches.coachId, input.coachId),
          ),
        )
        .limit(1);
      if (!existing) throw new Error("Coach assignment insert returned no record.");
      return existing;
    },

    async listSchedules(academyId: string) {
      return db
        .select({
          id: batchSchedules.id,
          batchId: batches.id,
          batchName: batches.name,
          dayOfWeek: batchSchedules.dayOfWeek,
          startTime: batchSchedules.startTime,
          endTime: batchSchedules.endTime,
          venue: batchSchedules.venue,
          isActive: batchSchedules.isActive,
        })
        .from(batchSchedules)
        .innerJoin(batches, eq(batchSchedules.batchId, batches.id))
        .where(eq(batchSchedules.academyId, academyId))
        .orderBy(asc(batchSchedules.dayOfWeek), asc(batchSchedules.startTime));
    },

    async listAttendance(academyId: string, from: Date, to: Date) {
      const records = await db
        .select({
          id: attendanceRecords.id,
          sessionId: trainingSessions.id,
          studentId: students.id,
          studentName: sql<string>`concat(${students.firstName}, ' ', ${students.lastName})`,
          batchName: batches.name,
          scheduledStart: trainingSessions.startsAt,
          status: attendanceRecords.status,
          recordedBy: users.id,
          recorderName: users.displayName,
          recordedAt: attendanceRecords.recordedAt,
        })
        .from(attendanceRecords)
        .innerJoin(trainingSessions, eq(attendanceRecords.sessionId, trainingSessions.id))
        .innerJoin(students, eq(attendanceRecords.studentId, students.id))
        .innerJoin(batches, eq(trainingSessions.batchId, batches.id))
        .innerJoin(users, eq(attendanceRecords.recordedBy, users.id))
        .where(
          and(
            eq(attendanceRecords.academyId, academyId),
            gte(trainingSessions.startsAt, from),
            lte(trainingSessions.startsAt, to),
          ),
        )
        .orderBy(desc(trainingSessions.startsAt), asc(students.lastName), asc(students.firstName));
      if (records.length === 0) return [];
      const counts = await db
        .select({ attendanceId: attendanceCorrections.attendanceId, value: count() })
        .from(attendanceCorrections)
        .where(
          and(
            eq(attendanceCorrections.academyId, academyId),
            inArray(
              attendanceCorrections.attendanceId,
              records.map((record) => record.id),
            ),
          ),
        )
        .groupBy(attendanceCorrections.attendanceId);
      const countByAttendanceId = new Map(
        counts.map((record) => [record.attendanceId, record.value]),
      );
      return records.map((record) => ({
        ...record,
        correctionCount: countByAttendanceId.get(record.id) ?? 0,
      }));
    },

    async listAttendanceCorrections(academyId: string, attendanceId: string) {
      return db
        .select({
          id: attendanceCorrections.id,
          attendanceId: attendanceCorrections.attendanceId,
          previousStatus: attendanceCorrections.previousStatus,
          nextStatus: attendanceCorrections.nextStatus,
          correctedBy: users.id,
          correctedByName: users.displayName,
          reason: attendanceCorrections.reason,
          correctedAt: attendanceCorrections.correctedAt,
        })
        .from(attendanceCorrections)
        .innerJoin(users, eq(attendanceCorrections.correctedBy, users.id))
        .where(
          and(
            eq(attendanceCorrections.academyId, academyId),
            eq(attendanceCorrections.attendanceId, attendanceId),
          ),
        )
        .orderBy(asc(attendanceCorrections.correctedAt));
    },

    async correctAttendance(input: {
      academyId: string;
      attendanceId: string;
      correctedBy: string;
      status: "present" | "absent" | "late" | "excused";
      reason: string;
      now: Date;
    }) {
      return db.transaction(async (tx) => {
        const [existing] = await tx
          .select({ id: attendanceRecords.id, status: attendanceRecords.status })
          .from(attendanceRecords)
          .where(
            and(
              eq(attendanceRecords.id, input.attendanceId),
              eq(attendanceRecords.academyId, input.academyId),
            ),
          )
          .for("update")
          .limit(1);
        if (!existing) throw new OperationsRepositoryError("RELATED_RECORD_NOT_FOUND");
        if (existing.status === input.status) {
          return {
            id: existing.id,
            previousStatus: existing.status,
            nextStatus: existing.status,
            correctedAt: input.now,
          };
        }

        await tx.insert(attendanceCorrections).values({
          academyId: input.academyId,
          attendanceId: existing.id,
          previousStatus: existing.status,
          nextStatus: input.status,
          correctedBy: input.correctedBy,
          reason: input.reason,
          correctedAt: input.now,
        });
        await tx
          .update(attendanceRecords)
          .set({ status: input.status, updatedAt: input.now })
          .where(
            and(
              eq(attendanceRecords.id, existing.id),
              eq(attendanceRecords.academyId, input.academyId),
            ),
          );
        return {
          id: existing.id,
          previousStatus: existing.status,
          nextStatus: input.status,
          correctedAt: input.now,
        };
      });
    },

    async createSchedule(
      input: AcademyContext & {
        batchId: string;
        dayOfWeek: number;
        startTime: string;
        endTime: string;
        venue?: string;
      },
    ) {
      const [batch] = await db
        .select({ id: batches.id })
        .from(batches)
        .where(
          and(
            eq(batches.id, input.batchId),
            eq(batches.academyId, input.academyId),
            eq(batches.isActive, true),
          ),
        )
        .limit(1);
      if (!batch) throw new OperationsRepositoryError("RELATED_RECORD_NOT_FOUND");
      const [schedule] = await db.insert(batchSchedules).values(input).returning({
        id: batchSchedules.id,
        batchId: batchSchedules.batchId,
        dayOfWeek: batchSchedules.dayOfWeek,
        startTime: batchSchedules.startTime,
        endTime: batchSchedules.endTime,
        venue: batchSchedules.venue,
        isActive: batchSchedules.isActive,
      });
      if (!schedule) throw new Error("Schedule insert returned no record.");
      return {
        ...schedule,
        batchName:
          (
            await db
              .select({ name: batches.name })
              .from(batches)
              .where(eq(batches.id, schedule.batchId))
              .limit(1)
          )[0]?.name ?? "",
      };
    },

    async createSession(
      input: AcademyContext & { scheduleId: string; startsAt: Date; endsAt: Date },
    ) {
      const [schedule] = await db
        .select({
          id: batchSchedules.id,
          batchId: batchSchedules.batchId,
          venue: batchSchedules.venue,
        })
        .from(batchSchedules)
        .where(
          and(
            eq(batchSchedules.id, input.scheduleId),
            eq(batchSchedules.academyId, input.academyId),
            eq(batchSchedules.isActive, true),
          ),
        )
        .limit(1);
      if (!schedule) throw new OperationsRepositoryError("RELATED_RECORD_NOT_FOUND");
      const [session] = await db
        .insert(trainingSessions)
        .values({
          ...input,
          batchId: schedule.batchId,
          scheduleId: schedule.id,
          venue: schedule.venue,
        })
        .returning({
          id: trainingSessions.id,
          batchId: trainingSessions.batchId,
          startsAt: trainingSessions.startsAt,
          endsAt: trainingSessions.endsAt,
          venue: trainingSessions.venue,
          status: trainingSessions.status,
        });
      if (!session) throw new Error("Session insert returned no record.");
      const [batch] = await db
        .select({ name: batches.name })
        .from(batches)
        .where(eq(batches.id, session.batchId))
        .limit(1);
      return { ...session, batchName: batch?.name ?? "" };
    },

    async listCoachSessions(academyId: string, userId: string, from: Date, to: Date) {
      return db
        .select({
          id: trainingSessions.id,
          batchId: batches.id,
          batchName: batches.name,
          startsAt: trainingSessions.startsAt,
          endsAt: trainingSessions.endsAt,
          venue: trainingSessions.venue,
          status: trainingSessions.status,
        })
        .from(trainingSessions)
        .innerJoin(batches, eq(trainingSessions.batchId, batches.id))
        .innerJoin(batchCoaches, eq(batchCoaches.batchId, batches.id))
        .innerJoin(coachProfiles, eq(batchCoaches.coachId, coachProfiles.id))
        .where(
          and(
            eq(trainingSessions.academyId, academyId),
            eq(coachProfiles.userId, userId),
            eq(coachProfiles.status, "active"),
            gte(trainingSessions.startsAt, from),
            lte(trainingSessions.startsAt, to),
          ),
        )
        .orderBy(asc(trainingSessions.startsAt));
    },

    async getSessionRoster(academyId: string, sessionId: string, userId: string) {
      const [session] = await db
        .select({
          id: trainingSessions.id,
          batchId: batches.id,
          batchName: batches.name,
          startsAt: trainingSessions.startsAt,
          endsAt: trainingSessions.endsAt,
          venue: trainingSessions.venue,
          status: trainingSessions.status,
        })
        .from(trainingSessions)
        .innerJoin(batches, eq(trainingSessions.batchId, batches.id))
        .innerJoin(batchCoaches, eq(batchCoaches.batchId, batches.id))
        .innerJoin(coachProfiles, eq(batchCoaches.coachId, coachProfiles.id))
        .where(
          and(
            eq(trainingSessions.id, sessionId),
            eq(trainingSessions.academyId, academyId),
            eq(coachProfiles.userId, userId),
            eq(coachProfiles.status, "active"),
          ),
        )
        .limit(1);
      if (!session) throw new OperationsRepositoryError("COACH_NOT_ASSIGNED");
      const studentsRows = await db
        .select({
          studentId: students.id,
          studentName: students.firstName,
          lastName: students.lastName,
          status: attendanceRecords.status,
        })
        .from(enrollments)
        .innerJoin(students, eq(enrollments.studentId, students.id))
        .leftJoin(
          attendanceRecords,
          and(
            eq(attendanceRecords.studentId, students.id),
            eq(attendanceRecords.sessionId, sessionId),
          ),
        )
        .where(
          and(
            eq(enrollments.academyId, academyId),
            eq(enrollments.batchId, session.batchId),
            eq(enrollments.status, "active"),
          ),
        )
        .orderBy(asc(students.lastName), asc(students.firstName));
      return {
        session,
        students: studentsRows.map((student) => ({
          studentId: student.studentId,
          studentName: `${student.studentName} ${student.lastName}`,
          status: student.status,
        })),
      };
    },

    async recordAttendance(input: {
      academyId: string;
      sessionId: string;
      userId: string;
      records: { studentId: string; status: "present" | "absent" | "late" | "excused" }[];
    }) {
      const roster = await this.getSessionRoster(input.academyId, input.sessionId, input.userId);
      if (roster.session.status !== "scheduled")
        throw new OperationsRepositoryError("SESSION_CLOSED");
      const allowedStudents = new Set(roster.students.map((student) => student.studentId));
      if (input.records.some((record) => !allowedStudents.has(record.studentId))) {
        throw new OperationsRepositoryError("INVALID_ATTENDANCE");
      }
      return db.transaction(async (tx) => {
        const output = [];
        for (const record of input.records) {
          const [existing] = await tx
            .select({ id: attendanceRecords.id, status: attendanceRecords.status })
            .from(attendanceRecords)
            .where(
              and(
                eq(attendanceRecords.academyId, input.academyId),
                eq(attendanceRecords.sessionId, input.sessionId),
                eq(attendanceRecords.studentId, record.studentId),
              ),
            )
            .limit(1);
          if (existing && existing.status !== record.status) {
            await tx.insert(attendanceCorrections).values({
              academyId: input.academyId,
              attendanceId: existing.id,
              previousStatus: existing.status,
              nextStatus: record.status,
              correctedBy: input.userId,
              reason: "Attendance updated by an authorized coach.",
            });
          }
          const [saved] = await tx
            .insert(attendanceRecords)
            .values({
              academyId: input.academyId,
              sessionId: input.sessionId,
              studentId: record.studentId,
              status: record.status,
              recordedBy: input.userId,
            })
            .onConflictDoUpdate({
              target: [attendanceRecords.sessionId, attendanceRecords.studentId],
              set: { status: record.status, recordedBy: input.userId, updatedAt: new Date() },
            })
            .returning({
              id: attendanceRecords.id,
              studentId: attendanceRecords.studentId,
              status: attendanceRecords.status,
              recordedBy: attendanceRecords.recordedBy,
              recordedAt: attendanceRecords.recordedAt,
            });
          if (saved) output.push(saved);
        }
        return output;
      });
    },

    async completeSession(academyId: string, sessionId: string, userId: string) {
      const roster = await this.getSessionRoster(academyId, sessionId, userId);
      if (roster.session.status !== "scheduled")
        throw new OperationsRepositoryError("SESSION_CLOSED");
      if (
        roster.students.length === 0 ||
        roster.students.some((student) => student.status === null)
      ) {
        throw new OperationsRepositoryError("ATTENDANCE_INCOMPLETE");
      }
      const [session] = await db
        .update(trainingSessions)
        .set({ status: "completed", updatedAt: new Date() })
        .where(and(eq(trainingSessions.id, sessionId), eq(trainingSessions.academyId, academyId)))
        .returning({ id: trainingSessions.id, status: trainingSessions.status });
      return session;
    },
  };
}

export type OperationsRepository = ReturnType<typeof createOperationsRepository>;
