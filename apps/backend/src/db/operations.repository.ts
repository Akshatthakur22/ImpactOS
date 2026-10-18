import { and, asc, count, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import type {
  CreateAcademyBranchRequest,
  UpdateAcademyBranchRequest,
  UpdateCoachRequest,
  UpdateScheduleRequest,
} from "@sportdesk/contracts";
import type { Database } from "./client.js";
import { academyLocalDateTimeToUtc } from "../modules/operations/academy-time.js";
import {
  academies,
  academyBranches,
  attendanceCorrections,
  attendanceRecords,
  authSessions,
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
      | "INVALID_ATTENDANCE"
      | "SESSION_NOT_RESCHEDULABLE",
  ) {
    super(code);
    this.name = "OperationsRepositoryError";
  }
}

type AcademyContext = { academyId: string; createdBy: string };

export function createOperationsRepository(db: Database) {
  return {
    async listBranches(academyId: string) {
      return db
        .select({
          id: academyBranches.id,
          name: academyBranches.name,
          address: academyBranches.address,
          isActive: academyBranches.isActive,
        })
        .from(academyBranches)
        .where(eq(academyBranches.academyId, academyId))
        .orderBy(asc(academyBranches.isActive), asc(academyBranches.name));
    },

    async createBranch(input: CreateAcademyBranchRequest & AcademyContext) {
      const [branch] = await db
        .insert(academyBranches)
        .values({
          academyId: input.academyId,
          createdBy: input.createdBy,
          name: input.name,
          address: input.address || null,
        })
        .returning({
          id: academyBranches.id,
          name: academyBranches.name,
          address: academyBranches.address,
          isActive: academyBranches.isActive,
        });
      if (!branch) throw new Error("Branch insert returned no record.");
      return branch;
    },

    async updateBranch(input: {
      academyId: string;
      branchId: string;
      changes: UpdateAcademyBranchRequest;
    }) {
      const [branch] = await db
        .update(academyBranches)
        .set({ ...input.changes, updatedAt: new Date() })
        .where(
          and(
            eq(academyBranches.id, input.branchId),
            eq(academyBranches.academyId, input.academyId),
          ),
        )
        .returning({
          id: academyBranches.id,
          name: academyBranches.name,
          address: academyBranches.address,
          isActive: academyBranches.isActive,
        });
      if (!branch) throw new OperationsRepositoryError("RELATED_RECORD_NOT_FOUND");
      return branch;
    },

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

    async updateCoach(input: { academyId: string; coachId: string; changes: UpdateCoachRequest }) {
      return db.transaction(async (tx) => {
        const [coach] = await tx
          .select({ id: coachProfiles.id, userId: coachProfiles.userId })
          .from(coachProfiles)
          .innerJoin(users, eq(coachProfiles.userId, users.id))
          .where(
            and(
              eq(coachProfiles.id, input.coachId),
              eq(coachProfiles.academyId, input.academyId),
              eq(users.academyId, input.academyId),
              eq(users.role, "coach"),
            ),
          )
          .for("update")
          .limit(1);
        if (!coach) throw new OperationsRepositoryError("COACH_NOT_FOUND");

        const { displayName, status, ...profileChanges } = input.changes;
        if (Object.keys(profileChanges).length > 0 || status !== undefined) {
          await tx
            .update(coachProfiles)
            .set({
              ...profileChanges,
              ...(status !== undefined ? { status } : {}),
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(coachProfiles.id, input.coachId),
                eq(coachProfiles.academyId, input.academyId),
              ),
            );
        }
        if (displayName !== undefined || status !== undefined) {
          await tx
            .update(users)
            .set({
              ...(displayName !== undefined ? { displayName } : {}),
              ...(status !== undefined ? { isActive: status === "active" } : {}),
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(users.id, coach.userId),
                eq(users.academyId, input.academyId),
                eq(users.role, "coach"),
              ),
            );
        }
        if (status === "inactive") {
          await tx
            .update(authSessions)
            .set({ revokedAt: new Date() })
            .where(and(eq(authSessions.userId, coach.userId), isNull(authSessions.revokedAt)));
        }
        return { updated: true };
      });
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
          branchId: batchSchedules.branchId,
          branchName: academyBranches.name,
          dayOfWeek: batchSchedules.dayOfWeek,
          startTime: batchSchedules.startTime,
          endTime: batchSchedules.endTime,
          venue: batchSchedules.venue,
          isActive: batchSchedules.isActive,
        })
        .from(batchSchedules)
        .innerJoin(batches, eq(batchSchedules.batchId, batches.id))
        .leftJoin(
          academyBranches,
          and(
            eq(batchSchedules.branchId, academyBranches.id),
            eq(batchSchedules.academyId, academyBranches.academyId),
          ),
        )
        .where(eq(batchSchedules.academyId, academyId))
        .orderBy(asc(batchSchedules.dayOfWeek), asc(batchSchedules.startTime));
    },

    async updateSchedule(input: {
      academyId: string;
      scheduleId: string;
      changes: UpdateScheduleRequest;
    }) {
      const [current] = await db
        .select({ batchId: batchSchedules.batchId, branchId: batchSchedules.branchId })
        .from(batchSchedules)
        .where(
          and(
            eq(batchSchedules.id, input.scheduleId),
            eq(batchSchedules.academyId, input.academyId),
          ),
        )
        .limit(1);
      if (!current) throw new OperationsRepositoryError("RELATED_RECORD_NOT_FOUND");
      if (input.changes.isActive !== false) {
        const nextBatchId = input.changes.batchId ?? current.batchId;
        const [batch] = await db
          .select({ id: batches.id })
          .from(batches)
          .where(
            and(
              eq(batches.id, nextBatchId),
              eq(batches.academyId, input.academyId),
              eq(batches.isActive, true),
            ),
          )
          .limit(1);
        if (!batch) throw new OperationsRepositoryError("RELATED_RECORD_NOT_FOUND");
        const nextBranchId =
          input.changes.branchId === undefined ? current.branchId : input.changes.branchId;
        if (nextBranchId) {
          const [branch] = await db
            .select({ id: academyBranches.id })
            .from(academyBranches)
            .where(
              and(
                eq(academyBranches.id, nextBranchId),
                eq(academyBranches.academyId, input.academyId),
                eq(academyBranches.isActive, true),
              ),
            )
            .limit(1);
          if (!branch) throw new OperationsRepositoryError("RELATED_RECORD_NOT_FOUND");
        }
      }
      const [schedule] = await db
        .update(batchSchedules)
        .set({ ...input.changes, updatedAt: new Date() })
        .where(
          and(
            eq(batchSchedules.id, input.scheduleId),
            eq(batchSchedules.academyId, input.academyId),
          ),
        )
        .returning({ id: batchSchedules.id });
      if (!schedule) throw new OperationsRepositoryError("RELATED_RECORD_NOT_FOUND");
      return (await this.listSchedules(input.academyId)).find(
        (item) => item.id === input.scheduleId,
      )!;
    },

    async listAttendance(academyId: string, from: Date, to: Date, filters: { batchId?: string; recordedBy?: string } = {}) {
      const conditions = [eq(attendanceRecords.academyId, academyId), gte(trainingSessions.startsAt, from), lte(trainingSessions.startsAt, to)];
      if (filters.batchId) conditions.push(eq(batches.id, filters.batchId));
      if (filters.recordedBy) conditions.push(eq(users.id, filters.recordedBy));
      const records = await db
        .select({
          id: attendanceRecords.id,
          sessionId: trainingSessions.id,
          batchId: batches.id,
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
          and(...conditions),
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

    async listAttendanceSessions(academyId: string, from: Date, to: Date, batchId?: string) {
      const conditions = [eq(trainingSessions.academyId, academyId), gte(trainingSessions.startsAt, from), lte(trainingSessions.startsAt, to), sql`${trainingSessions.status} <> 'cancelled'`];
      if (batchId) conditions.push(eq(batches.id, batchId));
      return db.select({
        id: trainingSessions.id,
        batchId: batches.id,
        batchName: batches.name,
        branchName: academyBranches.name,
        startsAt: trainingSessions.startsAt,
        endsAt: trainingSessions.endsAt,
        status: trainingSessions.status,
        expectedCount: sql<number>`count(distinct ${enrollments.studentId})::int`,
        markedCount: sql<number>`count(distinct ${attendanceRecords.studentId})::int`,
      }).from(trainingSessions)
        .innerJoin(batches, eq(trainingSessions.batchId, batches.id))
        .leftJoin(batchSchedules, eq(trainingSessions.scheduleId, batchSchedules.id))
        .leftJoin(academyBranches, and(eq(batchSchedules.branchId, academyBranches.id), eq(batchSchedules.academyId, academyBranches.academyId)))
        .leftJoin(enrollments, and(eq(enrollments.academyId, academyId), eq(enrollments.batchId, batches.id), eq(enrollments.status, "active")))
        .leftJoin(attendanceRecords, and(eq(attendanceRecords.academyId, academyId), eq(attendanceRecords.sessionId, trainingSessions.id)))
        .where(and(...conditions))
        .groupBy(trainingSessions.id, batches.id, batches.name, academyBranches.name)
        .orderBy(desc(trainingSessions.startsAt));
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
        branchId?: string | null;
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
      if (input.branchId) {
        const [branch] = await db
          .select({ id: academyBranches.id })
          .from(academyBranches)
          .where(
            and(
              eq(academyBranches.id, input.branchId),
              eq(academyBranches.academyId, input.academyId),
              eq(academyBranches.isActive, true),
            ),
          )
          .limit(1);
        if (!branch) throw new OperationsRepositoryError("RELATED_RECORD_NOT_FOUND");
      }
      const [schedule] = await db.insert(batchSchedules).values(input).returning({
        id: batchSchedules.id,
        batchId: batchSchedules.batchId,
        branchId: batchSchedules.branchId,
        dayOfWeek: batchSchedules.dayOfWeek,
        startTime: batchSchedules.startTime,
        endTime: batchSchedules.endTime,
        venue: batchSchedules.venue,
        isActive: batchSchedules.isActive,
      });
      if (!schedule) throw new Error("Schedule insert returned no record.");
      const [branch] = schedule.branchId
        ? await db
            .select({ name: academyBranches.name })
            .from(academyBranches)
            .where(
              and(
                eq(academyBranches.id, schedule.branchId),
                eq(academyBranches.academyId, input.academyId),
              ),
            )
            .limit(1)
        : [];
      return {
        ...schedule,
        branchName: branch?.name ?? null,
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
          branchId: batchSchedules.branchId,
          branchName: academyBranches.name,
          branchIsActive: academyBranches.isActive,
        })
        .from(batchSchedules)
        .leftJoin(
          academyBranches,
          and(
            eq(batchSchedules.branchId, academyBranches.id),
            eq(batchSchedules.academyId, academyBranches.academyId),
          ),
        )
        .where(
          and(
            eq(batchSchedules.id, input.scheduleId),
            eq(batchSchedules.academyId, input.academyId),
            eq(batchSchedules.isActive, true),
          ),
        )
        .limit(1);
      if (!schedule) throw new OperationsRepositoryError("RELATED_RECORD_NOT_FOUND");
      if (schedule.branchId && !schedule.branchIsActive) {
        throw new OperationsRepositoryError("RELATED_RECORD_NOT_FOUND");
      }
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
      return { ...session, batchName: batch?.name ?? "", branchName: schedule.branchName };
    },

    async listSessions(academyId: string, from: Date, to: Date) {
      return db
        .select({
          id: trainingSessions.id,
          batchId: trainingSessions.batchId,
          scheduleId: trainingSessions.scheduleId,
          batchName: batches.name,
          branchName: academyBranches.name,
          startsAt: trainingSessions.startsAt,
          endsAt: trainingSessions.endsAt,
          venue: trainingSessions.venue,
          status: trainingSessions.status,
        })
        .from(trainingSessions)
        .innerJoin(batches, eq(trainingSessions.batchId, batches.id))
        .leftJoin(batchSchedules, eq(trainingSessions.scheduleId, batchSchedules.id))
        .leftJoin(
          academyBranches,
          and(
            eq(batchSchedules.branchId, academyBranches.id),
            eq(batchSchedules.academyId, academyBranches.academyId),
          ),
        )
        .where(
          and(
            eq(trainingSessions.academyId, academyId),
            gte(trainingSessions.startsAt, from),
            lte(trainingSessions.startsAt, to),
          ),
        )
        .orderBy(asc(trainingSessions.startsAt));
    },

    async updateSession(input: {
      academyId: string;
      sessionId: string;
      startsAt?: Date;
      endsAt?: Date;
      cancel?: boolean;
    }) {
      return db.transaction(async (tx) => {
        const [session] = await tx
          .select({ id: trainingSessions.id, status: trainingSessions.status })
          .from(trainingSessions)
          .where(
            and(
              eq(trainingSessions.id, input.sessionId),
              eq(trainingSessions.academyId, input.academyId),
            ),
          )
          .for("update")
          .limit(1);
        if (!session) throw new OperationsRepositoryError("RELATED_RECORD_NOT_FOUND");
        if (session.status !== "scheduled")
          throw new OperationsRepositoryError("SESSION_NOT_RESCHEDULABLE");
        const [attendance] = await tx
          .select({ id: attendanceRecords.id })
          .from(attendanceRecords)
          .where(
            and(
              eq(attendanceRecords.sessionId, session.id),
              eq(attendanceRecords.academyId, input.academyId),
            ),
          )
          .limit(1);
        if (attendance) throw new OperationsRepositoryError("SESSION_NOT_RESCHEDULABLE");
        const [updated] = await tx
          .update(trainingSessions)
          .set({
            ...(input.cancel
              ? { status: "cancelled" as const }
              : { startsAt: input.startsAt!, endsAt: input.endsAt! }),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(trainingSessions.id, session.id),
              eq(trainingSessions.academyId, input.academyId),
            ),
          )
          .returning({
            id: trainingSessions.id,
            batchId: trainingSessions.batchId,
            scheduleId: trainingSessions.scheduleId,
            startsAt: trainingSessions.startsAt,
            endsAt: trainingSessions.endsAt,
            venue: trainingSessions.venue,
            status: trainingSessions.status,
          });
        if (!updated) throw new Error("Session update returned no record.");
        const [batch] = await tx
          .select({ name: batches.name })
          .from(batches)
          .where(eq(batches.id, updated.batchId))
          .limit(1);
        const [branch] = updated.scheduleId
          ? await tx
              .select({ name: academyBranches.name })
              .from(batchSchedules)
              .leftJoin(
                academyBranches,
                and(
                  eq(batchSchedules.branchId, academyBranches.id),
                  eq(batchSchedules.academyId, academyBranches.academyId),
                ),
              )
              .where(eq(batchSchedules.id, updated.scheduleId))
              .limit(1)
          : [];
        return { ...updated, batchName: batch?.name ?? "", branchName: branch?.name ?? null };
      });
    },

    async generateSessions(input: {
      academyId: string;
      createdBy: string;
      from: string;
      to: string;
    }) {
      const [academy] = await db
        .select({ timezone: academies.timezone })
        .from(academies)
        .where(eq(academies.id, input.academyId))
        .limit(1);
      if (!academy) throw new OperationsRepositoryError("RELATED_RECORD_NOT_FOUND");
      const schedules = await db
        .select({
          id: batchSchedules.id,
          batchId: batchSchedules.batchId,
          dayOfWeek: batchSchedules.dayOfWeek,
          startTime: batchSchedules.startTime,
          endTime: batchSchedules.endTime,
          venue: batchSchedules.venue,
          branchId: batchSchedules.branchId,
          branchIsActive: academyBranches.isActive,
        })
        .from(batchSchedules)
        .innerJoin(
          batches,
          and(
            eq(batchSchedules.batchId, batches.id),
            eq(batchSchedules.academyId, batches.academyId),
          ),
        )
        .leftJoin(
          academyBranches,
          and(
            eq(batchSchedules.branchId, academyBranches.id),
            eq(batchSchedules.academyId, academyBranches.academyId),
          ),
        )
        .where(
          and(
            eq(batchSchedules.academyId, input.academyId),
            eq(batchSchedules.isActive, true),
            eq(batches.isActive, true),
          ),
        );
      const candidates: Array<typeof trainingSessions.$inferInsert> = [];
      const fromDay = new Date(`${input.from}T00:00:00.000Z`);
      const toDay = new Date(`${input.to}T00:00:00.000Z`);
      for (let day = fromDay; day <= toDay; day = new Date(day.getTime() + 86_400_000)) {
        const date = day.toISOString().slice(0, 10);
        for (const schedule of schedules) {
          if (
            schedule.dayOfWeek !== day.getUTCDay() ||
            (schedule.branchId && !schedule.branchIsActive)
          )
            continue;
          try {
            candidates.push({
              academyId: input.academyId,
              batchId: schedule.batchId,
              scheduleId: schedule.id,
              startsAt: academyLocalDateTimeToUtc(date, schedule.startTime, academy.timezone),
              endsAt: academyLocalDateTimeToUtc(date, schedule.endTime, academy.timezone),
              venue: schedule.venue,
              createdBy: input.createdBy,
            });
          } catch (error) {
            if (!(error instanceof RangeError)) throw error;
          }
        }
      }
      if (!candidates.length) return { createdCount: 0 };
      return db.transaction(async (tx) => {
        let createdCount = 0;
        for (let index = 0; index < candidates.length; index += 500) {
          const chunk = candidates.slice(index, index + 500);
          const inserted = await tx
            .insert(trainingSessions)
            .values(chunk)
            .onConflictDoNothing()
            .returning({ id: trainingSessions.id });
          createdCount += inserted.length;
        }
        return { createdCount };
      });
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
          branchName: academyBranches.name,
          status: trainingSessions.status,
        })
        .from(trainingSessions)
        .innerJoin(batches, eq(trainingSessions.batchId, batches.id))
        .leftJoin(batchSchedules, eq(trainingSessions.scheduleId, batchSchedules.id))
        .leftJoin(
          academyBranches,
          and(
            eq(batchSchedules.branchId, academyBranches.id),
            eq(batchSchedules.academyId, academyBranches.academyId),
          ),
        )
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

    async listCoachStudents(academyId: string, userId: string) {
      const rows = await db
        .select({
          studentId: students.id,
          firstName: students.firstName,
          lastName: students.lastName,
          batchId: batches.id,
          batchName: batches.name,
        })
        .from(coachProfiles)
        .innerJoin(batchCoaches, eq(batchCoaches.coachId, coachProfiles.id))
        .innerJoin(batches, eq(batchCoaches.batchId, batches.id))
        .innerJoin(
          enrollments,
          and(eq(enrollments.batchId, batches.id), eq(enrollments.academyId, batches.academyId)),
        )
        .innerJoin(
          students,
          and(
            eq(students.id, enrollments.studentId),
            eq(students.academyId, enrollments.academyId),
          ),
        )
        .where(
          and(
            eq(coachProfiles.academyId, academyId),
            eq(coachProfiles.userId, userId),
            eq(coachProfiles.status, "active"),
            eq(batches.isActive, true),
            eq(enrollments.status, "active"),
            eq(students.status, "active"),
          ),
        )
        .orderBy(asc(students.lastName), asc(students.firstName), asc(batches.name));

      const result = new Map<
        string,
        { studentId: string; studentName: string; batches: { id: string; name: string }[] }
      >();
      for (const row of rows) {
        const student = result.get(row.studentId) ?? {
          studentId: row.studentId,
          studentName: `${row.firstName} ${row.lastName}`,
          batches: [],
        };
        if (!student.batches.some((batch) => batch.id === row.batchId)) {
          student.batches.push({ id: row.batchId, name: row.batchName });
        }
        result.set(row.studentId, student);
      }
      return [...result.values()];
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
          branchName: academyBranches.name,
          status: trainingSessions.status,
        })
        .from(trainingSessions)
        .innerJoin(batches, eq(trainingSessions.batchId, batches.id))
        .leftJoin(batchSchedules, eq(trainingSessions.scheduleId, batchSchedules.id))
        .leftJoin(
          academyBranches,
          and(
            eq(batchSchedules.branchId, academyBranches.id),
            eq(batchSchedules.academyId, academyBranches.academyId),
          ),
        )
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
