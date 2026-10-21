import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import type {
  CreateAcademyBranchRequest,
  CreateCoachRequest,
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
  coachSessionPresence,
  coachStudentFeedback,
  disciplines,
  enrollments,
  progressEntries,
  programs,
  students,
  trainingSessions,
  users,
} from "./schema.js";

export class OperationsRepositoryError extends Error {
  constructor(
    readonly code:
      | "RELATED_RECORD_NOT_FOUND"
      | "COACH_NOT_FOUND"
      | "COACH_HAS_ASSIGNMENTS"
      | "COACH_HAS_HISTORY"
      | "COACH_NOT_ASSIGNED"
      | "SESSION_CLOSED"
      | "ATTENDANCE_INCOMPLETE"
      | "INVALID_ATTENDANCE"
      | "SESSION_NOT_RESCHEDULABLE"
      | "SESSION_NOT_OPEN"
      | "SESSION_NOT_STARTED"
      | "COACH_NOT_CHECKED_IN"
      | "BRANCH_LOCATION_NOT_CONFIGURED"
      | "COACH_OUTSIDE_GEOFENCE",
  ) {
    super(code);
    this.name = "OperationsRepositoryError";
  }
}

type AcademyContext = { academyId: string; createdBy: string };

function distanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadius = 6_371_000;
  const deltaLatitude = radians(lat2 - lat1);
  const deltaLongitude = radians(lon2 - lon1);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(radians(lat1)) *
      Math.cos(radians(lat2)) *
      Math.sin(deltaLongitude / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function createOperationsRepository(db: Database) {
  async function readCoaches(academyId: string) {
    const rows = await db
      .select({
        id: coachProfiles.id,
        userId: users.id,
        displayName: users.displayName,
        email: users.email,
        phone: coachProfiles.phone,
        dateOfBirth: coachProfiles.dateOfBirth,
        address: coachProfiles.address,
        emergencyContactName: coachProfiles.emergencyContactName,
        emergencyContactPhone: coachProfiles.emergencyContactPhone,
        qualifications: coachProfiles.qualifications,
        yearsExperience: coachProfiles.yearsExperience,
        joinedOn: coachProfiles.joinedOn,
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
  }

  return {
    async listBranches(academyId: string) {
      return db
        .select({
          id: academyBranches.id,
          name: academyBranches.name,
          address: academyBranches.address,
          geofenceLatitude: academyBranches.geofenceLatitude,
          geofenceLongitude: academyBranches.geofenceLongitude,
          geofenceRadiusMeters: academyBranches.geofenceRadiusMeters,
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
          geofenceLatitude: input.geofenceLatitude ?? null,
          geofenceLongitude: input.geofenceLongitude ?? null,
          ...(input.geofenceRadiusMeters ? { geofenceRadiusMeters: input.geofenceRadiusMeters } : {}),
        })
        .returning({
          id: academyBranches.id,
          name: academyBranches.name,
          address: academyBranches.address,
          geofenceLatitude: academyBranches.geofenceLatitude,
          geofenceLongitude: academyBranches.geofenceLongitude,
          geofenceRadiusMeters: academyBranches.geofenceRadiusMeters,
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
          geofenceLatitude: academyBranches.geofenceLatitude,
          geofenceLongitude: academyBranches.geofenceLongitude,
          geofenceRadiusMeters: academyBranches.geofenceRadiusMeters,
          isActive: academyBranches.isActive,
        });
      if (!branch) throw new OperationsRepositoryError("RELATED_RECORD_NOT_FOUND");
      return branch;
    },

    async createCoach(
      input: AcademyContext & Omit<CreateCoachRequest, "password"> & { passwordHash: string },
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
            ...(input.dateOfBirth ? { dateOfBirth: input.dateOfBirth } : {}),
            ...(input.address ? { address: input.address } : {}),
            ...(input.emergencyContactName ? { emergencyContactName: input.emergencyContactName } : {}),
            ...(input.emergencyContactPhone ? { emergencyContactPhone: input.emergencyContactPhone } : {}),
            qualifications: input.qualifications,
            ...(input.yearsExperience !== undefined ? { yearsExperience: input.yearsExperience } : {}),
            ...(input.joinedOn ? { joinedOn: input.joinedOn } : {}),
          })
          .returning({
            id: coachProfiles.id,
            phone: coachProfiles.phone,
            dateOfBirth: coachProfiles.dateOfBirth,
            address: coachProfiles.address,
            emergencyContactName: coachProfiles.emergencyContactName,
            emergencyContactPhone: coachProfiles.emergencyContactPhone,
            qualifications: coachProfiles.qualifications,
            yearsExperience: coachProfiles.yearsExperience,
            joinedOn: coachProfiles.joinedOn,
            status: coachProfiles.status,
          });
        if (!profile) throw new Error("Coach profile insert returned no record.");
        return {
          id: profile.id,
          userId: user.id,
          displayName: user.displayName,
          email: user.email,
          phone: profile.phone,
          dateOfBirth: profile.dateOfBirth,
          address: profile.address,
          emergencyContactName: profile.emergencyContactName,
          emergencyContactPhone: profile.emergencyContactPhone,
          qualifications: profile.qualifications,
          yearsExperience: profile.yearsExperience,
          joinedOn: profile.joinedOn,
          specializations: input.specializations,
          status: profile.status,
          batchIds: [],
        };
      });
    },

    async listCoaches(academyId: string) {
      return readCoaches(academyId);
    },

    async getCoachDetail(academyId: string, coachId: string) {
      const coach = (await readCoaches(academyId)).find((item) => item.id === coachId);
      if (!coach) return null;
      const [assignedBatches, schedules, recentSessions, recentProgress, sessionCounts, attendanceCounts, progressCounts] = await Promise.all([
        db.select({
          id: batches.id,
          name: batches.name,
          programName: programs.name,
          disciplineName: disciplines.name,
        }).from(batchCoaches)
          .innerJoin(coachProfiles, and(eq(coachProfiles.id, batchCoaches.coachId), eq(coachProfiles.academyId, academyId)))
          .innerJoin(batches, and(eq(batches.id, batchCoaches.batchId), eq(batches.academyId, academyId)))
          .innerJoin(programs, and(eq(programs.id, batches.programId), eq(programs.academyId, academyId)))
          .innerJoin(disciplines, and(eq(disciplines.id, programs.disciplineId), eq(disciplines.academyId, academyId)))
          .where(and(eq(batchCoaches.academyId, academyId), eq(batchCoaches.coachId, coachId)))
          .orderBy(asc(batches.name), asc(programs.name)),
        db.select({
          id: batchSchedules.id,
          batchId: batches.id,
          batchName: batches.name,
          branchName: academyBranches.name,
          dayOfWeek: batchSchedules.dayOfWeek,
          startTime: batchSchedules.startTime,
          endTime: batchSchedules.endTime,
        }).from(batchSchedules)
          .innerJoin(batches, and(eq(batches.id, batchSchedules.batchId), eq(batches.academyId, academyId)))
          .innerJoin(batchCoaches, and(eq(batchCoaches.batchId, batches.id), eq(batchCoaches.academyId, academyId)))
          .leftJoin(academyBranches, and(eq(academyBranches.id, batchSchedules.branchId), eq(academyBranches.academyId, academyId)))
          .where(and(eq(batchCoaches.coachId, coachId), eq(batchSchedules.academyId, academyId), eq(batchSchedules.isActive, true)))
          .orderBy(asc(batchSchedules.dayOfWeek), asc(batchSchedules.startTime)),
        db.select({
          id: trainingSessions.id,
          batchName: batches.name,
          startsAt: trainingSessions.startsAt,
          endsAt: trainingSessions.endsAt,
          status: trainingSessions.status,
          checkedInAt: coachSessionPresence.checkedInAt,
          checkedOutAt: coachSessionPresence.checkedOutAt,
        }).from(coachSessionPresence)
          .innerJoin(trainingSessions, and(eq(trainingSessions.id, coachSessionPresence.sessionId), eq(trainingSessions.academyId, academyId)))
          .innerJoin(batches, and(eq(batches.id, trainingSessions.batchId), eq(batches.academyId, academyId)))
          .where(and(eq(coachSessionPresence.academyId, academyId), eq(coachSessionPresence.coachId, coach.userId)))
          .orderBy(desc(trainingSessions.startsAt)).limit(8),
        db.select({
          id: progressEntries.id,
          studentName: sql<string>`concat(${students.firstName}, ' ', ${students.lastName})`,
          batchName: batches.name,
          assessmentName: progressEntries.assessmentName,
          value: progressEntries.value,
          coachNote: progressEntries.coachNote,
          parentVisible: progressEntries.parentVisible,
          createdAt: progressEntries.createdAt,
        }).from(progressEntries)
          .innerJoin(students, and(eq(students.id, progressEntries.studentId), eq(students.academyId, academyId)))
          .innerJoin(trainingSessions, and(eq(trainingSessions.id, progressEntries.sessionId), eq(trainingSessions.academyId, academyId)))
          .innerJoin(batches, and(eq(batches.id, trainingSessions.batchId), eq(batches.academyId, academyId)))
          .where(and(eq(progressEntries.academyId, academyId), eq(progressEntries.coachId, coach.userId)))
          .orderBy(desc(progressEntries.createdAt)).limit(8),
        db.select({ value: count() }).from(coachSessionPresence).where(and(eq(coachSessionPresence.academyId, academyId), eq(coachSessionPresence.coachId, coach.userId))),
        db.select({ value: count() }).from(attendanceRecords).where(and(eq(attendanceRecords.academyId, academyId), eq(attendanceRecords.recordedBy, coach.userId))),
        db.select({ value: count() }).from(progressEntries).where(and(eq(progressEntries.academyId, academyId), eq(progressEntries.coachId, coach.userId))),
      ]);
      return {
        coach,
        assignedBatches,
        schedules,
        stats: {
          classesCheckedIn: sessionCounts[0]?.value ?? 0,
          attendanceMarks: attendanceCounts[0]?.value ?? 0,
          progressEntries: progressCounts[0]?.value ?? 0,
        },
        recentSessions: recentSessions.map((session) => ({
          ...session,
          startsAt: session.startsAt.toISOString(),
          endsAt: session.endsAt.toISOString(),
          checkedInAt: session.checkedInAt.toISOString(),
          checkedOutAt: session.checkedOutAt?.toISOString() ?? null,
        })),
        recentProgress: recentProgress.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() })),
      };
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

        const { displayName, email, status, ...profileChanges } = input.changes;
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
        if (displayName !== undefined || email !== undefined || status !== undefined) {
          await tx
            .update(users)
            .set({
              ...(displayName !== undefined ? { displayName } : {}),
              ...(email !== undefined ? { email } : {}),
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

    async deleteCoach(input: { academyId: string; coachId: string }) {
      return db.transaction(async (tx) => {
        const [coach] = await tx.select({ id: coachProfiles.id, userId: coachProfiles.userId })
          .from(coachProfiles)
          .where(and(eq(coachProfiles.id, input.coachId), eq(coachProfiles.academyId, input.academyId)))
          .for("update").limit(1);
        if (!coach) throw new OperationsRepositoryError("COACH_NOT_FOUND");
        const [assignment] = await tx.select({ value: count() }).from(batchCoaches)
          .where(and(eq(batchCoaches.academyId, input.academyId), eq(batchCoaches.coachId, input.coachId)));
        if ((assignment?.value ?? 0) > 0) throw new OperationsRepositoryError("COACH_HAS_ASSIGNMENTS");
        const [presence, attendance, progress, feedback] = await Promise.all([
          tx.select({ value: count() }).from(coachSessionPresence).where(and(eq(coachSessionPresence.academyId, input.academyId), eq(coachSessionPresence.coachId, coach.userId))),
          tx.select({ value: count() }).from(attendanceRecords).where(and(eq(attendanceRecords.academyId, input.academyId), eq(attendanceRecords.recordedBy, coach.userId))),
          tx.select({ value: count() }).from(progressEntries).where(and(eq(progressEntries.academyId, input.academyId), eq(progressEntries.coachId, coach.userId))),
          tx.select({ value: count() }).from(coachStudentFeedback).where(and(eq(coachStudentFeedback.academyId, input.academyId), eq(coachStudentFeedback.coachId, coach.userId))),
        ]);
        if ([presence, attendance, progress, feedback].some((rows) => (rows[0]?.value ?? 0) > 0)) {
          throw new OperationsRepositoryError("COACH_HAS_HISTORY");
        }
        await tx.delete(coachProfiles).where(and(eq(coachProfiles.id, input.coachId), eq(coachProfiles.academyId, input.academyId)));
        await tx.delete(users).where(and(eq(users.id, coach.userId), eq(users.academyId, input.academyId), eq(users.role, "coach")));
        return { deleted: true };
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

    async unassignCoach(input: { academyId: string; batchId: string; coachId: string }) {
      const [assignment] = await db.delete(batchCoaches).where(and(
        eq(batchCoaches.academyId, input.academyId),
        eq(batchCoaches.batchId, input.batchId),
        eq(batchCoaches.coachId, input.coachId),
      )).returning({ id: batchCoaches.id });
      if (!assignment) throw new OperationsRepositoryError("COACH_NOT_ASSIGNED");
      return { deleted: true };
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

    async listAttendance(
      academyId: string,
      from: Date,
      to: Date,
      filters: { batchId?: string; recordedBy?: string; sessionId?: string; offset?: number; limit?: number } = {},
    ) {
      const conditions = [
        eq(attendanceRecords.academyId, academyId),
        gte(trainingSessions.startsAt, from),
        lte(trainingSessions.startsAt, to),
      ];
      if (filters.batchId) conditions.push(eq(batches.id, filters.batchId));
      if (filters.recordedBy) conditions.push(eq(users.id, filters.recordedBy));
      if (filters.sessionId) conditions.push(eq(trainingSessions.id, filters.sessionId));
      const pageSize = filters.limit ?? 50;
      const rows = await db
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
        .where(and(...conditions))
        .orderBy(
          desc(trainingSessions.startsAt),
          asc(students.lastName),
          asc(students.firstName),
          asc(attendanceRecords.id),
        )
        .limit(pageSize + 1)
        .offset(filters.offset ?? 0);
      const hasMore = rows.length > pageSize;
      const records = rows.slice(0, pageSize);
      if (records.length === 0) return { records: [], hasMore };
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
      return { records: records.map((record) => ({
        ...record,
        correctionCount: countByAttendanceId.get(record.id) ?? 0,
      })), hasMore };
    },

    async listAttendanceSessions(academyId: string, from: Date, to: Date, batchId?: string) {
      const conditions = [
        eq(trainingSessions.academyId, academyId),
        gte(trainingSessions.startsAt, from),
        lte(trainingSessions.startsAt, to),
        sql`${trainingSessions.status} <> 'cancelled'`,
      ];
      if (batchId) conditions.push(eq(batches.id, batchId));
      const sessions = await db
        .select({
          id: trainingSessions.id,
          batchId: batches.id,
          batchName: batches.name,
          branchName: academyBranches.name,
          startsAt: trainingSessions.startsAt,
          endsAt: trainingSessions.endsAt,
          status: trainingSessions.status,
          expectedCount: sql<number>`count(distinct ${enrollments.studentId})::int`,
          markedCount: sql<number>`count(distinct ${attendanceRecords.studentId})::int`,
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
        .leftJoin(
          enrollments,
          and(
            eq(enrollments.academyId, academyId),
            eq(enrollments.batchId, batches.id),
            eq(enrollments.status, "active"),
          ),
        )
        .leftJoin(
          attendanceRecords,
          and(
            eq(attendanceRecords.academyId, academyId),
            eq(attendanceRecords.sessionId, trainingSessions.id),
          ),
        )
        .where(and(...conditions))
        .groupBy(trainingSessions.id, batches.id, batches.name, academyBranches.name)
        .orderBy(desc(trainingSessions.startsAt));
      if (sessions.length === 0) return [];
      const coachRows = await db
        .select({
          sessionId: trainingSessions.id,
          coachName: users.displayName,
          checkedInAt: coachSessionPresence.checkedInAt,
          checkedOutAt: coachSessionPresence.checkedOutAt,
        })
        .from(trainingSessions)
        .innerJoin(
          batchCoaches,
          and(
            eq(batchCoaches.batchId, trainingSessions.batchId),
            eq(batchCoaches.academyId, academyId),
          ),
        )
        .innerJoin(
          coachProfiles,
          and(
            eq(coachProfiles.id, batchCoaches.coachId),
            eq(coachProfiles.academyId, academyId),
            eq(coachProfiles.status, "active"),
          ),
        )
        .innerJoin(users, and(eq(users.id, coachProfiles.userId), eq(users.isActive, true)))
        .leftJoin(
          coachSessionPresence,
          and(
            eq(coachSessionPresence.sessionId, trainingSessions.id),
            eq(coachSessionPresence.coachId, users.id),
          ),
        )
        .where(
          and(
            eq(trainingSessions.academyId, academyId),
            inArray(
              trainingSessions.id,
              sessions.map((session) => session.id),
            ),
          ),
        );
      const coachesBySession = new Map<string, typeof coachRows>();
      for (const coach of coachRows) {
        const existing = coachesBySession.get(coach.sessionId) ?? [];
        existing.push(coach);
        coachesBySession.set(coach.sessionId, existing);
      }
      return sessions.map((session) => ({
        ...session,
        coachPresence: (coachesBySession.get(session.id) ?? []).map(
          ({ coachName, checkedInAt, checkedOutAt }) => ({
            coachName,
            checkedInAt,
            checkedOutAt,
          }),
        ),
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
          coachCheckedInAt: coachSessionPresence.checkedInAt,
          coachCheckedOutAt: coachSessionPresence.checkedOutAt,
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
        .leftJoin(
          coachSessionPresence,
          and(
            eq(coachSessionPresence.sessionId, trainingSessions.id),
            eq(coachSessionPresence.coachId, coachProfiles.userId),
          ),
        )
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

    async updateCoachSelfProfile(academyId: string, userId: string, displayName: string) {
      const [activeCoach] = await db
        .select({ id: coachProfiles.id })
        .from(coachProfiles)
        .where(
          and(
            eq(coachProfiles.academyId, academyId),
            eq(coachProfiles.userId, userId),
            eq(coachProfiles.status, "active"),
          ),
        )
        .limit(1);
      if (!activeCoach) return null;
      const [updated] = await db
        .update(users)
        .set({ displayName, updatedAt: new Date() })
        .where(and(eq(users.id, userId), eq(users.academyId, academyId), eq(users.role, "coach")))
        .returning({ id: users.id, displayName: users.displayName, email: users.email });
      return updated ?? null;
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
          coachCheckedInAt: coachSessionPresence.checkedInAt,
          coachCheckedOutAt: coachSessionPresence.checkedOutAt,
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
        .leftJoin(
          coachSessionPresence,
          and(
            eq(coachSessionPresence.sessionId, trainingSessions.id),
            eq(coachSessionPresence.coachId, coachProfiles.userId),
          ),
        )
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
        .from(students)
        .leftJoin(
          enrollments,
          and(
            eq(enrollments.studentId, students.id),
            eq(enrollments.academyId, academyId),
            eq(enrollments.batchId, session.batchId),
            eq(enrollments.status, "active"),
            eq(students.status, "active"),
          ),
        )
        .leftJoin(
          attendanceRecords,
          and(
            eq(attendanceRecords.studentId, students.id),
            eq(attendanceRecords.sessionId, sessionId),
          ),
        )
        .where(
          and(
            eq(students.academyId, academyId),
            session.status === "completed"
              ? isNotNull(attendanceRecords.id)
              : or(isNotNull(enrollments.id), isNotNull(attendanceRecords.id)),
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

    async recordCoachCheckIn(input: {
      academyId: string;
      sessionId: string;
      userId: string;
      now: Date;
      latitude: number;
      longitude: number;
      accuracyMeters: number;
    }) {
      return db.transaction(async (tx) => {
        const [session] = await tx
          .select({
            startsAt: trainingSessions.startsAt,
            status: trainingSessions.status,
            scheduleId: trainingSessions.scheduleId,
            geofenceLatitude: academyBranches.geofenceLatitude,
            geofenceLongitude: academyBranches.geofenceLongitude,
            geofenceRadiusMeters: academyBranches.geofenceRadiusMeters,
          })
          .from(trainingSessions)
          .innerJoin(batches, eq(trainingSessions.batchId, batches.id))
          .leftJoin(batchSchedules, eq(trainingSessions.scheduleId, batchSchedules.id))
          .leftJoin(academyBranches, eq(batchSchedules.branchId, academyBranches.id))
          .innerJoin(
            batchCoaches,
            and(eq(batchCoaches.batchId, batches.id), eq(batchCoaches.academyId, input.academyId)),
          )
          .innerJoin(
            coachProfiles,
            and(
              eq(coachProfiles.id, batchCoaches.coachId),
              eq(coachProfiles.academyId, input.academyId),
              eq(coachProfiles.status, "active"),
            ),
          )
          .where(
            and(
              eq(trainingSessions.id, input.sessionId),
              eq(trainingSessions.academyId, input.academyId),
              eq(coachProfiles.userId, input.userId),
            ),
          )
          .for("update", { of: trainingSessions })
          .limit(1);
        if (!session) throw new OperationsRepositoryError("COACH_NOT_ASSIGNED");
        if (session.status !== "scheduled") throw new OperationsRepositoryError("SESSION_CLOSED");
        if (session.geofenceLatitude === null || session.geofenceLongitude === null)
          throw new OperationsRepositoryError("BRANCH_LOCATION_NOT_CONFIGURED");
        const distanceMeters = distanceInMeters(
          input.latitude,
          input.longitude,
          session.geofenceLatitude,
          session.geofenceLongitude,
        );
        if (distanceMeters > (session.geofenceRadiusMeters ?? 150) + 10)
          throw new OperationsRepositoryError("COACH_OUTSIDE_GEOFENCE");
        // Coaches can check in during the 15 minutes before a scheduled class.
        if (input.now.getTime() < session.startsAt.getTime() - 15 * 60_000) {
          throw new OperationsRepositoryError("SESSION_NOT_OPEN");
        }
        const [existing] = await tx
          .select({
            checkedInAt: coachSessionPresence.checkedInAt,
            checkedOutAt: coachSessionPresence.checkedOutAt,
            checkedInDistanceMeters: coachSessionPresence.checkedInDistanceMeters,
          })
          .from(coachSessionPresence)
          .where(
            and(
              eq(coachSessionPresence.academyId, input.academyId),
              eq(coachSessionPresence.sessionId, input.sessionId),
              eq(coachSessionPresence.coachId, input.userId),
            ),
          )
          .limit(1);
        if (existing) return existing;
        const [presence] = await tx
          .insert(coachSessionPresence)
          .values({
            academyId: input.academyId,
            sessionId: input.sessionId,
            coachId: input.userId,
            checkedInAt: input.now,
            checkedInLatitude: input.latitude,
            checkedInLongitude: input.longitude,
            checkedInAccuracyMeters: input.accuracyMeters,
            checkedInDistanceMeters: Math.round(distanceMeters),
          })
          .returning({
            checkedInAt: coachSessionPresence.checkedInAt,
            checkedOutAt: coachSessionPresence.checkedOutAt,
            checkedInDistanceMeters: coachSessionPresence.checkedInDistanceMeters,
          });
        if (!presence) throw new Error("Coach check-in insert returned no record.");
        return presence;
      });
    },

    async recordCoachCheckOut(input: {
      academyId: string;
      sessionId: string;
      userId: string;
      now: Date;
    }) {
      return db.transaction(async (tx) => {
        const [session] = await tx
          .select({ startsAt: trainingSessions.startsAt, status: trainingSessions.status })
          .from(trainingSessions)
          .innerJoin(batches, eq(trainingSessions.batchId, batches.id))
          .innerJoin(
            batchCoaches,
            and(eq(batchCoaches.batchId, batches.id), eq(batchCoaches.academyId, input.academyId)),
          )
          .innerJoin(
            coachProfiles,
            and(
              eq(coachProfiles.id, batchCoaches.coachId),
              eq(coachProfiles.academyId, input.academyId),
              eq(coachProfiles.status, "active"),
            ),
          )
          .where(
            and(
              eq(trainingSessions.id, input.sessionId),
              eq(trainingSessions.academyId, input.academyId),
              eq(coachProfiles.userId, input.userId),
            ),
          )
          .for("update", { of: trainingSessions })
          .limit(1);
        if (!session) throw new OperationsRepositoryError("COACH_NOT_ASSIGNED");
        if (session.status !== "scheduled") throw new OperationsRepositoryError("SESSION_CLOSED");
        if (input.now < session.startsAt)
          throw new OperationsRepositoryError("SESSION_NOT_STARTED");
        const [existing] = await tx
          .select({
            checkedInAt: coachSessionPresence.checkedInAt,
            checkedOutAt: coachSessionPresence.checkedOutAt,
          })
          .from(coachSessionPresence)
          .where(
            and(
              eq(coachSessionPresence.academyId, input.academyId),
              eq(coachSessionPresence.sessionId, input.sessionId),
              eq(coachSessionPresence.coachId, input.userId),
            ),
          )
          .for("update")
          .limit(1);
        if (!existing) throw new OperationsRepositoryError("COACH_NOT_CHECKED_IN");
        if (existing.checkedOutAt) return existing;
        const [presence] = await tx
          .update(coachSessionPresence)
          .set({ checkedOutAt: input.now })
          .where(
            and(
              eq(coachSessionPresence.academyId, input.academyId),
              eq(coachSessionPresence.sessionId, input.sessionId),
              eq(coachSessionPresence.coachId, input.userId),
            ),
          )
          .returning({
            checkedInAt: coachSessionPresence.checkedInAt,
            checkedOutAt: coachSessionPresence.checkedOutAt,
          });
        if (!presence) throw new Error("Coach check-out update returned no record.");
        return presence;
      });
    },

    async recordAttendance(input: {
      academyId: string;
      sessionId: string;
      userId: string;
      now: Date;
      records: { studentId: string; status: "present" | "absent" | "late" | "excused" }[];
    }) {
      const roster = await this.getSessionRoster(input.academyId, input.sessionId, input.userId);
      if (roster.session.status !== "scheduled")
        throw new OperationsRepositoryError("SESSION_CLOSED");
      if (input.now < roster.session.startsAt)
        throw new OperationsRepositoryError("SESSION_NOT_STARTED");
      if (!roster.session.coachCheckedInAt)
        throw new OperationsRepositoryError("COACH_NOT_CHECKED_IN");
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

    async completeSession(academyId: string, sessionId: string, userId: string, now = new Date()) {
      const roster = await this.getSessionRoster(academyId, sessionId, userId);
      if (roster.session.status !== "scheduled")
        throw new OperationsRepositoryError("SESSION_CLOSED");
      if (
        roster.students.length === 0 ||
        roster.students.some((student) => student.status === null)
      ) {
        throw new OperationsRepositoryError("ATTENDANCE_INCOMPLETE");
      }
      // Finishing the class is also a safe automatic check-out if the coach skipped that tap.
      await db
        .update(coachSessionPresence)
        .set({ checkedOutAt: now })
        .where(
          and(
            eq(coachSessionPresence.academyId, academyId),
            eq(coachSessionPresence.sessionId, sessionId),
            eq(coachSessionPresence.coachId, userId),
            isNull(coachSessionPresence.checkedOutAt),
          ),
        );
      const [session] = await db
        .update(trainingSessions)
        .set({ status: "completed", updatedAt: now })
        .where(and(eq(trainingSessions.id, sessionId), eq(trainingSessions.academyId, academyId)))
        .returning({ id: trainingSessions.id, status: trainingSessions.status });
      return session;
    },
  };
}

export type OperationsRepository = ReturnType<typeof createOperationsRepository>;
