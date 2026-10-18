import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { Database } from "./client.js";
import {
  academyBranches,
  attendanceRecords,
  batchSchedules,
  batches,
  guardianInvites,
  guardians,
  enrollments,
  students,
  studentGuardians,
  trainingSessions,
  users,
} from "./schema.js";

export class ParentRepositoryError extends Error {
  constructor(
    readonly code:
      | "GUARDIAN_NOT_FOUND"
      | "GUARDIAN_NEEDS_EMAIL"
      | "GUARDIAN_ALREADY_LINKED"
      | "INVALID_INVITE"
      | "EMAIL_IN_USE"
      | "STUDENT_NOT_LINKED",
  ) {
    super(code);
    this.name = "ParentRepositoryError";
  }
}

export function createParentRepository(db: Database) {
  return {
    async revokeInvite(input: { academyId: string; guardianId: string; now: Date }) {
      const [guardian] = await db
        .select({ id: guardians.id })
        .from(guardians)
        .where(and(eq(guardians.id, input.guardianId), eq(guardians.academyId, input.academyId)))
        .limit(1);
      if (!guardian) throw new ParentRepositoryError("GUARDIAN_NOT_FOUND");
      const revoked = await db
        .update(guardianInvites)
        .set({ revokedAt: input.now })
        .where(
          and(
            eq(guardianInvites.academyId, input.academyId),
            eq(guardianInvites.guardianId, input.guardianId),
            isNull(guardianInvites.redeemedAt),
            isNull(guardianInvites.revokedAt),
          ),
        )
        .returning({ id: guardianInvites.id });
      return { revoked: revoked.length > 0 };
    },

    async createInvite(input: {
      academyId: string;
      guardianId: string;
      tokenHash: string;
      expiresAt: Date;
      createdBy: string;
      now: Date;
    }) {
      return db.transaction(async (tx) => {
        const [guardian] = await tx
          .select({ id: guardians.id, email: guardians.email, userId: guardians.userId })
          .from(guardians)
          .where(and(eq(guardians.id, input.guardianId), eq(guardians.academyId, input.academyId)))
          .for("update")
          .limit(1);
        if (!guardian) throw new ParentRepositoryError("GUARDIAN_NOT_FOUND");
        if (!guardian.email) throw new ParentRepositoryError("GUARDIAN_NEEDS_EMAIL");
        if (guardian.userId) throw new ParentRepositoryError("GUARDIAN_ALREADY_LINKED");
        const [existingUser] = await tx
          .select({ academyId: users.academyId, role: users.role, isActive: users.isActive })
          .from(users)
          .where(sql`lower(${users.email}) = lower(${guardian.email})`)
          .limit(1);
        if (
          existingUser &&
          (existingUser.academyId !== input.academyId ||
            existingUser.role !== "parent" ||
            !existingUser.isActive)
        ) {
          throw new ParentRepositoryError("EMAIL_IN_USE");
        }

        await tx
          .update(guardianInvites)
          .set({ revokedAt: input.now })
          .where(
            and(
              eq(guardianInvites.guardianId, guardian.id),
              isNull(guardianInvites.redeemedAt),
              isNull(guardianInvites.revokedAt),
            ),
          );
        const [invite] = await tx
          .insert(guardianInvites)
          .values({
            academyId: input.academyId,
            guardianId: guardian.id,
            tokenHash: input.tokenHash,
            expiresAt: input.expiresAt,
            createdBy: input.createdBy,
            createdAt: input.now,
          })
          .returning({ expiresAt: guardianInvites.expiresAt });
        return { email: guardian.email, expiresAt: invite?.expiresAt ?? input.expiresAt };
      });
    },

    async inspectInvite(tokenHash: string, now: Date) {
      const [row] = await db
        .select({
          id: guardianInvites.id,
          academyId: guardianInvites.academyId,
          guardianId: guardians.id,
          guardianName: guardians.name,
          email: guardians.email,
          userId: users.id,
          userAcademyId: users.academyId,
          userRole: users.role,
          passwordHash: users.passwordHash,
          userIsActive: users.isActive,
        })
        .from(guardianInvites)
        .innerJoin(guardians, eq(guardianInvites.guardianId, guardians.id))
        .leftJoin(users, sql`lower(${users.email}) = lower(${guardians.email})`)
        .where(
          and(
            eq(guardianInvites.tokenHash, tokenHash),
            isNull(guardianInvites.redeemedAt),
            isNull(guardianInvites.revokedAt),
            gt(guardianInvites.expiresAt, now),
          ),
        )
        .limit(1);
      if (!row?.email) return null;
      return {
        id: row.id,
        academyId: row.academyId,
        guardianId: row.guardianId,
        guardianName: row.guardianName,
        email: row.email,
        existingUser:
          row.userId &&
          row.userAcademyId &&
          row.userRole &&
          row.passwordHash &&
          row.userIsActive !== null
            ? {
                id: row.userId,
                academyId: row.userAcademyId,
                role: row.userRole,
                passwordHash: row.passwordHash,
                isActive: row.userIsActive,
              }
            : null,
      };
    },

    async redeemInvite(input: {
      tokenHash: string;
      now: Date;
      existingUserId?: string;
      passwordHash?: string;
    }) {
      return db.transaction(async (tx) => {
        const [invite] = await tx
          .select({
            id: guardianInvites.id,
            academyId: guardianInvites.academyId,
            guardianId: guardianInvites.guardianId,
          })
          .from(guardianInvites)
          .where(
            and(
              eq(guardianInvites.tokenHash, input.tokenHash),
              isNull(guardianInvites.redeemedAt),
              isNull(guardianInvites.revokedAt),
              gt(guardianInvites.expiresAt, input.now),
            ),
          )
          .for("update")
          .limit(1);
        if (!invite) throw new ParentRepositoryError("INVALID_INVITE");

        const [guardian] = await tx
          .select({
            id: guardians.id,
            academyId: guardians.academyId,
            name: guardians.name,
            email: guardians.email,
            userId: guardians.userId,
          })
          .from(guardians)
          .where(
            and(eq(guardians.id, invite.guardianId), eq(guardians.academyId, invite.academyId)),
          )
          .for("update")
          .limit(1);
        if (!guardian?.email) throw new ParentRepositoryError("INVALID_INVITE");
        if (guardian.userId) throw new ParentRepositoryError("GUARDIAN_ALREADY_LINKED");

        const [existingUser] = await tx
          .select({
            id: users.id,
            academyId: users.academyId,
            role: users.role,
            isActive: users.isActive,
          })
          .from(users)
          .where(sql`lower(${users.email}) = lower(${guardian.email})`)
          .limit(1);
        let userId: string;
        if (existingUser) {
          if (
            existingUser.role !== "parent" ||
            existingUser.academyId !== invite.academyId ||
            existingUser.id !== input.existingUserId ||
            !existingUser.isActive
          ) {
            throw new ParentRepositoryError("EMAIL_IN_USE");
          }
          userId = existingUser.id;
        } else {
          if (input.existingUserId || !input.passwordHash)
            throw new ParentRepositoryError("EMAIL_IN_USE");
          const [user] = await tx
            .insert(users)
            .values({
              academyId: invite.academyId,
              email: guardian.email.toLowerCase(),
              passwordHash: input.passwordHash,
              displayName: guardian.name,
              role: "parent",
            })
            .returning({ id: users.id });
          if (!user) throw new Error("Parent account insert returned no record.");
          userId = user.id;
        }

        if (!userId) throw new Error("Parent account resolution returned no user id.");
        await tx
          .update(guardians)
          .set({ userId, updatedAt: input.now })
          .where(and(eq(guardians.id, guardian.id), eq(guardians.academyId, invite.academyId)));
        await tx
          .update(guardianInvites)
          .set({ redeemedAt: input.now })
          .where(eq(guardianInvites.id, invite.id));
        return { email: guardian.email };
      });
    },

    async listStudents(academyId: string, userId: string) {
      const rows = await db
        .select({
          id: students.id,
          firstName: students.firstName,
          lastName: students.lastName,
          status: students.status,
          batchName: batches.name,
        })
        .from(studentGuardians)
        .innerJoin(guardians, eq(studentGuardians.guardianId, guardians.id))
        .innerJoin(students, eq(studentGuardians.studentId, students.id))
        .leftJoin(
          enrollments,
          and(eq(enrollments.studentId, students.id), eq(enrollments.status, "active")),
        )
        .leftJoin(batches, eq(enrollments.batchId, batches.id))
        .where(and(eq(studentGuardians.academyId, academyId), eq(guardians.userId, userId)))
        .orderBy(asc(students.lastName), asc(students.firstName));
      const mapped = new Map<
        string,
        {
          id: string;
          firstName: string;
          lastName: string;
          status: (typeof rows)[number]["status"];
          batchNames: string[];
        }
      >();
      for (const row of rows) {
        const student = mapped.get(row.id) ?? {
          id: row.id,
          firstName: row.firstName,
          lastName: row.lastName,
          status: row.status,
          batchNames: [],
        };
        if (row.batchName && !student.batchNames.includes(row.batchName))
          student.batchNames.push(row.batchName);
        mapped.set(row.id, student);
      }
      return [...mapped.values()];
    },

    async listStudentSchedule(academyId: string, userId: string, studentId: string) {
      const rows = await db
        .select({
          id: batchSchedules.id,
          batchId: batches.id,
          batchName: batches.name,
          branchName: academyBranches.name,
          dayOfWeek: batchSchedules.dayOfWeek,
          startTime: batchSchedules.startTime,
          endTime: batchSchedules.endTime,
          venue: batchSchedules.venue,
        })
        .from(studentGuardians)
        .innerJoin(guardians, eq(studentGuardians.guardianId, guardians.id))
        .innerJoin(enrollments, eq(studentGuardians.studentId, enrollments.studentId))
        .innerJoin(batches, eq(enrollments.batchId, batches.id))
        .innerJoin(batchSchedules, eq(batchSchedules.batchId, batches.id))
        .leftJoin(
          academyBranches,
          and(
            eq(batchSchedules.branchId, academyBranches.id),
            eq(batchSchedules.academyId, academyBranches.academyId),
          ),
        )
        .where(
          and(
            eq(studentGuardians.academyId, academyId),
            eq(studentGuardians.studentId, studentId),
            eq(guardians.userId, userId),
            eq(enrollments.status, "active"),
            eq(batchSchedules.isActive, true),
          ),
        )
        .orderBy(asc(batchSchedules.dayOfWeek), asc(batchSchedules.startTime));
      return rows;
    },

    async ownsStudent(academyId: string, userId: string, studentId: string) {
      const [link] = await db
        .select({ studentId: studentGuardians.studentId })
        .from(studentGuardians)
        .innerJoin(guardians, eq(studentGuardians.guardianId, guardians.id))
        .where(
          and(
            eq(studentGuardians.academyId, academyId),
            eq(studentGuardians.studentId, studentId),
            eq(guardians.userId, userId),
          ),
        )
        .limit(1);
      return Boolean(link);
    },

    async listStudentAttendance(academyId: string, userId: string, studentId: string) {
      return db
        .select({
          id: attendanceRecords.id,
          sessionId: trainingSessions.id,
          batchName: batches.name,
          scheduledStart: trainingSessions.startsAt,
          status: attendanceRecords.status,
        })
        .from(studentGuardians)
        .innerJoin(guardians, eq(studentGuardians.guardianId, guardians.id))
        .innerJoin(attendanceRecords, eq(studentGuardians.studentId, attendanceRecords.studentId))
        .innerJoin(trainingSessions, eq(attendanceRecords.sessionId, trainingSessions.id))
        .innerJoin(batches, eq(trainingSessions.batchId, batches.id))
        .where(
          and(
            eq(studentGuardians.academyId, academyId),
            eq(studentGuardians.studentId, studentId),
            eq(guardians.userId, userId),
          ),
        )
        .orderBy(desc(trainingSessions.startsAt))
        .limit(100);
    },
  };
}

export type ParentRepository = ReturnType<typeof createParentRepository>;
