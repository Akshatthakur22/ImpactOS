import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import type {
  CreateStudentRequest,
  AddStudentGuardianRequest,
  StudentDirectoryQuery,
  UpdateEnrollmentStatusRequest,
  UpdateBatchRequest,
  UpdateDisciplineRequest,
  UpdateProgramRequest,
  UpdateStudentGuardianRequest,
  UpdateStudentRequest,
} from "@sportdesk/contracts";
import type { Database } from "./client.js";
import {
  academies,
  batches,
  disciplines,
  enrollments,
  guardianInvites,
  guardians,
  programs,
  studentGuardians,
  students,
} from "./schema.js";

export class AcademyRepositoryError extends Error {
  constructor(
    readonly code:
      | "RELATED_RECORD_NOT_FOUND"
      | "BATCH_FULL"
      | "ALREADY_ENROLLED"
      | "STUDENT_HAS_ACTIVE_ENROLLMENTS"
      | "STUDENT_NOT_ACTIVE"
      | "ENROLLMENT_ALREADY_ENDED"
      | "GUARDIAN_ACCOUNT_EMAIL_LOCKED"
      | "ACTIVE_CHILD_RECORDS"
      | "CAPACITY_BELOW_ENROLLMENT"
      | "STUDENT_HAS_HISTORY",
  ) {
    super(code);
    this.name = "AcademyRepositoryError";
  }
}

type CreateRecordContext = { academyId: string; createdBy: string };

async function addEnrollment(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  input: CreateRecordContext & {
    studentId: string;
    batchId: string;
    requireActiveStudent?: boolean;
  },
) {
  const [target] = await tx
    .select({ id: batches.id, programId: batches.programId })
    .from(batches)
    .where(and(eq(batches.id, input.batchId), eq(batches.academyId, input.academyId)))
    .limit(1);
  if (!target) throw new AcademyRepositoryError("RELATED_RECORD_NOT_FOUND");

  const [parent] = await tx
    .select({ disciplineId: programs.disciplineId })
    .from(programs)
    .where(and(eq(programs.id, target.programId), eq(programs.academyId, input.academyId)))
    .limit(1);
  if (!parent) throw new AcademyRepositoryError("RELATED_RECORD_NOT_FOUND");

  const [discipline] = await tx
    .select({ id: disciplines.id, isActive: disciplines.isActive })
    .from(disciplines)
    .where(and(eq(disciplines.id, parent.disciplineId), eq(disciplines.academyId, input.academyId)))
    .for("update")
    .limit(1);
  const [program] = await tx
    .select({ id: programs.id, isActive: programs.isActive })
    .from(programs)
    .where(and(eq(programs.id, target.programId), eq(programs.academyId, input.academyId)))
    .for("update")
    .limit(1);
  const [batch] = await tx
    .select({ id: batches.id, capacity: batches.capacity, isActive: batches.isActive })
    .from(batches)
    .where(and(eq(batches.id, input.batchId), eq(batches.academyId, input.academyId)))
    .for("update")
    .limit(1);
  if (!discipline?.isActive || !program?.isActive || !batch?.isActive) {
    throw new AcademyRepositoryError("RELATED_RECORD_NOT_FOUND");
  }

  const [student] = await tx
    .select({ id: students.id, status: students.status })
    .from(students)
    .where(and(eq(students.id, input.studentId), eq(students.academyId, input.academyId)))
    .for("update")
    .limit(1);
  if (!student) throw new AcademyRepositoryError("RELATED_RECORD_NOT_FOUND");

  const [existing] = await tx
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.academyId, input.academyId),
        eq(enrollments.studentId, input.studentId),
        eq(enrollments.batchId, input.batchId),
        eq(enrollments.status, "active"),
      ),
    )
    .limit(1);
  if (existing) throw new AcademyRepositoryError("ALREADY_ENROLLED");

  if (batch.capacity !== null) {
    const [activeEnrollmentCount] = await tx
      .select({ value: count() })
      .from(enrollments)
      .where(and(eq(enrollments.batchId, batch.id), eq(enrollments.status, "active")));
    if ((activeEnrollmentCount?.value ?? 0) >= batch.capacity) {
      throw new AcademyRepositoryError("BATCH_FULL");
    }
  }
  if (input.requireActiveStudent && student.status !== "active") {
    throw new AcademyRepositoryError("STUDENT_NOT_ACTIVE");
  }

  await tx.insert(enrollments).values({
    academyId: input.academyId,
    studentId: input.studentId,
    batchId: input.batchId,
    createdBy: input.createdBy,
  });
}

export function createAcademyRepository(db: Database) {
  return {
    async getSettings(academyId: string) {
      const [academy] = await db
        .select({
          id: academies.id,
          name: academies.name,
          slug: academies.slug,
          timezone: academies.timezone,
          currency: academies.currency,
        })
        .from(academies)
        .where(eq(academies.id, academyId))
        .limit(1);
      return academy ?? null;
    },

    async updateSettings(input: {
      academyId: string;
      changes: { name: string; timezone: string };
    }) {
      const [academy] = await db
        .update(academies)
        .set({ ...input.changes, updatedAt: new Date() })
        .where(eq(academies.id, input.academyId))
        .returning({
          id: academies.id,
          name: academies.name,
          slug: academies.slug,
          timezone: academies.timezone,
          currency: academies.currency,
        });
      return academy ?? null;
    },

    async listDisciplines(academyId: string) {
      return db
        .select({ id: disciplines.id, name: disciplines.name, isActive: disciplines.isActive })
        .from(disciplines)
        .where(eq(disciplines.academyId, academyId))
        .orderBy(asc(disciplines.name));
    },

    async createDiscipline(input: CreateRecordContext & { name: string }) {
      const [record] = await db
        .insert(disciplines)
        .values(input)
        .returning({ id: disciplines.id, name: disciplines.name, isActive: disciplines.isActive });
      return record;
    },

    async listPrograms(academyId: string) {
      return db
        .select({
          id: programs.id,
          name: programs.name,
          disciplineId: disciplines.id,
          disciplineName: disciplines.name,
          isActive: programs.isActive,
        })
        .from(programs)
        .innerJoin(disciplines, eq(programs.disciplineId, disciplines.id))
        .where(and(eq(programs.academyId, academyId), eq(disciplines.academyId, academyId)))
        .orderBy(asc(disciplines.name), asc(programs.name));
    },

    async createProgram(input: CreateRecordContext & { name: string; disciplineId: string }) {
      const [discipline] = await db
        .select({ id: disciplines.id })
        .from(disciplines)
        .where(
          and(
            eq(disciplines.id, input.disciplineId),
            eq(disciplines.academyId, input.academyId),
            eq(disciplines.isActive, true),
          ),
        )
        .for("update")
        .limit(1);
      if (!discipline) throw new AcademyRepositoryError("RELATED_RECORD_NOT_FOUND");
      const [record] = await db.insert(programs).values(input).returning({
        id: programs.id,
        name: programs.name,
        disciplineId: programs.disciplineId,
        isActive: programs.isActive,
      });
      return record;
    },

    async listBatches(academyId: string) {
      const rows = await db
        .select({
          id: batches.id,
          name: batches.name,
          programId: programs.id,
          programName: programs.name,
          disciplineName: disciplines.name,
          capacity: batches.capacity,
          isActive: batches.isActive,
          activeEnrollmentCount: count(enrollments.id),
        })
        .from(batches)
        .innerJoin(programs, eq(batches.programId, programs.id))
        .innerJoin(disciplines, eq(programs.disciplineId, disciplines.id))
        .leftJoin(
          enrollments,
          and(eq(enrollments.batchId, batches.id), eq(enrollments.status, "active")),
        )
        .where(
          and(
            eq(batches.academyId, academyId),
            eq(programs.academyId, academyId),
            eq(disciplines.academyId, academyId),
          ),
        )
        .groupBy(batches.id, programs.id, disciplines.id)
        .orderBy(asc(disciplines.name), asc(programs.name), asc(batches.name));
      return rows;
    },

    async createBatch(
      input: CreateRecordContext & {
        name: string;
        programId: string;
        capacity?: number | undefined;
      },
    ) {
      const [program] = await db
        .select({ id: programs.id })
        .from(programs)
        .where(
          and(
            eq(programs.id, input.programId),
            eq(programs.academyId, input.academyId),
            eq(programs.isActive, true),
          ),
        )
        .for("update")
        .limit(1);
      if (!program) throw new AcademyRepositoryError("RELATED_RECORD_NOT_FOUND");
      const [record] = await db
        .insert(batches)
        .values({
          academyId: input.academyId,
          programId: input.programId,
          name: input.name,
          createdBy: input.createdBy,
          ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
        })
        .returning({
          id: batches.id,
          name: batches.name,
          programId: batches.programId,
          capacity: batches.capacity,
          isActive: batches.isActive,
        });
      return record;
    },

    async updateDiscipline(input: {
      academyId: string;
      disciplineId: string;
      changes: UpdateDisciplineRequest;
    }) {
      return db.transaction(async (tx) => {
        const [discipline] = await tx
          .select({ id: disciplines.id })
          .from(disciplines)
          .where(
            and(eq(disciplines.id, input.disciplineId), eq(disciplines.academyId, input.academyId)),
          )
          .for("update")
          .limit(1);
        if (!discipline) throw new AcademyRepositoryError("RELATED_RECORD_NOT_FOUND");
        if (input.changes.isActive === false) {
          const [activeProgram] = await tx
            .select({ id: programs.id })
            .from(programs)
            .where(
              and(
                eq(programs.academyId, input.academyId),
                eq(programs.disciplineId, input.disciplineId),
                eq(programs.isActive, true),
              ),
            )
            .limit(1);
          if (activeProgram) throw new AcademyRepositoryError("ACTIVE_CHILD_RECORDS");
        }
        const [updated] = await tx
          .update(disciplines)
          .set({ ...input.changes, updatedAt: new Date() })
          .where(
            and(eq(disciplines.id, input.disciplineId), eq(disciplines.academyId, input.academyId)),
          )
          .returning({ id: disciplines.id });
        if (!updated) throw new AcademyRepositoryError("RELATED_RECORD_NOT_FOUND");
      });
    },

    async updateProgram(input: {
      academyId: string;
      programId: string;
      changes: UpdateProgramRequest;
    }) {
      return db.transaction(async (tx) => {
        const [program] = await tx
          .select({ id: programs.id, disciplineId: programs.disciplineId })
          .from(programs)
          .where(and(eq(programs.id, input.programId), eq(programs.academyId, input.academyId)))
          .for("update")
          .limit(1);
        if (!program) throw new AcademyRepositoryError("RELATED_RECORD_NOT_FOUND");
        if (input.changes.isActive === false) {
          const [activeBatch] = await tx
            .select({ id: batches.id })
            .from(batches)
            .where(
              and(
                eq(batches.academyId, input.academyId),
                eq(batches.programId, input.programId),
                eq(batches.isActive, true),
              ),
            )
            .limit(1);
          if (activeBatch) throw new AcademyRepositoryError("ACTIVE_CHILD_RECORDS");
        }
        if (input.changes.isActive === true) {
          const [discipline] = await tx
            .select({ id: disciplines.id })
            .from(disciplines)
            .where(
              and(
                eq(disciplines.id, program.disciplineId),
                eq(disciplines.academyId, input.academyId),
                eq(disciplines.isActive, true),
              ),
            )
            .limit(1);
          if (!discipline) throw new AcademyRepositoryError("RELATED_RECORD_NOT_FOUND");
        }
        const [updated] = await tx
          .update(programs)
          .set({ ...input.changes, updatedAt: new Date() })
          .where(and(eq(programs.id, input.programId), eq(programs.academyId, input.academyId)))
          .returning({ id: programs.id });
        if (!updated) throw new AcademyRepositoryError("RELATED_RECORD_NOT_FOUND");
      });
    },

    async updateBatch(input: { academyId: string; batchId: string; changes: UpdateBatchRequest }) {
      return db.transaction(async (tx) => {
        const [batch] = await tx
          .select({ id: batches.id, programId: batches.programId })
          .from(batches)
          .where(and(eq(batches.id, input.batchId), eq(batches.academyId, input.academyId)))
          .for("update")
          .limit(1);
        if (!batch) throw new AcademyRepositoryError("RELATED_RECORD_NOT_FOUND");
        const [activeEnrollmentCount] = await tx
          .select({ value: count() })
          .from(enrollments)
          .where(
            and(
              eq(enrollments.academyId, input.academyId),
              eq(enrollments.batchId, batch.id),
              eq(enrollments.status, "active"),
            ),
          );
        const enrolled = activeEnrollmentCount?.value ?? 0;
        if (
          input.changes.capacity !== undefined &&
          input.changes.capacity !== null &&
          input.changes.capacity < enrolled
        ) {
          throw new AcademyRepositoryError("CAPACITY_BELOW_ENROLLMENT");
        }
        if (input.changes.isActive === false && enrolled > 0) {
          throw new AcademyRepositoryError("ACTIVE_CHILD_RECORDS");
        }
        if (input.changes.isActive === true) {
          const [program] = await tx
            .select({ id: programs.id })
            .from(programs)
            .innerJoin(disciplines, eq(programs.disciplineId, disciplines.id))
            .where(
              and(
                eq(programs.id, batch.programId),
                eq(programs.academyId, input.academyId),
                eq(programs.isActive, true),
                eq(disciplines.academyId, input.academyId),
                eq(disciplines.isActive, true),
              ),
            )
            .limit(1);
          if (!program) throw new AcademyRepositoryError("RELATED_RECORD_NOT_FOUND");
        }
        const [updated] = await tx
          .update(batches)
          .set({ ...input.changes, updatedAt: new Date() })
          .where(and(eq(batches.id, input.batchId), eq(batches.academyId, input.academyId)))
          .returning({ id: batches.id });
        if (!updated) throw new AcademyRepositoryError("RELATED_RECORD_NOT_FOUND");
      });
    },

    async listStudents(academyId: string, query: StudentDirectoryQuery, studentId?: string) {
      const filters = [eq(students.academyId, academyId)];
      if (studentId) filters.push(eq(students.id, studentId));
      if (query.status) filters.push(eq(students.status, query.status));
      if (query.search) {
        const pattern = `%${query.search.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
        filters.push(
          or(
            ilike(students.firstName, pattern),
            ilike(students.lastName, pattern),
            ilike(sql<string>`concat(${students.firstName}, ' ', ${students.lastName})`, pattern),
          )!,
        );
      }
      const where = and(...filters)!;
      const [totalRow] = await db.select({ total: count() }).from(students).where(where);
      const [summaryRow] = await db
        .select({
          total: count(),
          active: sql<number>`count(*) filter (where ${students.status} = 'active')::int`,
          pending: sql<number>`count(*) filter (where ${students.status} = 'pending')::int`,
          leads: sql<number>`count(*) filter (where ${students.status} = 'lead')::int`,
          missingEmergencyContact: sql<number>`count(*) filter (where ${students.emergencyContactPhone} is null or ${students.emergencyContactName} is null or ${students.emergencyContactRelationship} is null)::int`,
        })
        .from(students)
        .where(eq(students.academyId, academyId));
      const studentRows = await db
        .select({
          id: students.id,
          firstName: students.firstName,
          lastName: students.lastName,
          status: students.status,
          dateOfBirth: students.dateOfBirth,
          gender: students.gender,
          address: students.address,
          medicalNotes: students.medicalNotes,
          emergencyContactName: students.emergencyContactName,
          emergencyContactRelationship: students.emergencyContactRelationship,
          emergencyContactPhone: students.emergencyContactPhone,
          createdAt: students.createdAt,
        })
        .from(students)
        .where(where)
        .orderBy(asc(students.lastName), asc(students.firstName))
        .limit(query.limit)
        .offset(query.offset);

      const total = totalRow?.total ?? 0;
      if (studentRows.length === 0) {
        return {
          students: [],
          total,
          offset: query.offset,
          limit: query.limit,
          summary: summaryRow,
        };
      }
      const studentIds = studentRows.map((student) => student.id);
      const [guardianRows, enrollmentRows] = await Promise.all([
        db
          .select({
            studentId: studentGuardians.studentId,
            id: guardians.id,
            name: guardians.name,
            email: guardians.email,
            phone: guardians.phone,
            userId: guardians.userId,
            relationship: studentGuardians.relationship,
          })
          .from(studentGuardians)
          .innerJoin(guardians, eq(studentGuardians.guardianId, guardians.id))
          .where(
            and(
              eq(studentGuardians.academyId, academyId),
              eq(guardians.academyId, academyId),
              inArray(studentGuardians.studentId, studentIds),
            ),
          ),
        db
          .select({
            studentId: enrollments.studentId,
            id: enrollments.id,
            batchId: batches.id,
            batchName: batches.name,
            programName: programs.name,
            status: enrollments.status,
            startedAt: enrollments.startedAt,
            endedAt: enrollments.endedAt,
          })
          .from(enrollments)
          .innerJoin(batches, eq(enrollments.batchId, batches.id))
          .innerJoin(programs, eq(batches.programId, programs.id))
          .where(
            and(
              eq(enrollments.academyId, academyId),
              eq(batches.academyId, academyId),
              eq(programs.academyId, academyId),
              inArray(enrollments.studentId, studentIds),
            ),
          ),
      ]);

      const guardianIds = [...new Set(guardianRows.map((guardian) => guardian.id))];
      const inviteRows = guardianIds.length
        ? await db
            .select({
              guardianId: guardianInvites.guardianId,
              expiresAt: guardianInvites.expiresAt,
              redeemedAt: guardianInvites.redeemedAt,
              revokedAt: guardianInvites.revokedAt,
            })
            .from(guardianInvites)
            .where(
              and(
                eq(guardianInvites.academyId, academyId),
                inArray(guardianInvites.guardianId, guardianIds),
              ),
            )
            .orderBy(desc(guardianInvites.createdAt))
        : [];
      const inviteStatusByGuardian = new Map<
        string,
        "pending" | "expired" | "revoked" | "redeemed"
      >();
      const now = new Date();
      for (const invite of inviteRows) {
        if (inviteStatusByGuardian.has(invite.guardianId)) continue;
        inviteStatusByGuardian.set(
          invite.guardianId,
          invite.redeemedAt
            ? "redeemed"
            : invite.revokedAt
              ? "revoked"
              : invite.expiresAt <= now
                ? "expired"
                : "pending",
        );
      }

      const guardianByStudent = new Map<string, typeof guardianRows>();
      for (const row of guardianRows) {
        const list = guardianByStudent.get(row.studentId) ?? [];
        list.push(row);
        guardianByStudent.set(row.studentId, list);
      }
      const enrollmentByStudent = new Map<string, typeof enrollmentRows>();
      for (const row of enrollmentRows) {
        const list = enrollmentByStudent.get(row.studentId) ?? [];
        list.push(row);
        enrollmentByStudent.set(row.studentId, list);
      }

      const mappedStudents = studentRows.map((student) => ({
        ...student,
        guardians: (guardianByStudent.get(student.id) ?? []).map(
          ({ id, name, email, phone, userId, relationship }) => ({
            id,
            name,
            email,
            phone,
            hasAccount: userId !== null,
            inviteStatus: userId ? "redeemed" : (inviteStatusByGuardian.get(id) ?? "not_sent"),
            relationship,
          }),
        ),
        enrollments: (enrollmentByStudent.get(student.id) ?? []).map(
          ({ studentId: _studentId, startedAt, endedAt, ...enrollment }) => ({
            ...enrollment,
            startedAt: startedAt.toISOString(),
            endedAt: endedAt?.toISOString() ?? null,
          }),
        ),
      }));
      return {
        students: mappedStudents,
        total,
        offset: query.offset,
        limit: query.limit,
        summary: summaryRow,
      };
    },

    async updateStudent(input: {
      academyId: string;
      studentId: string;
      changes: UpdateStudentRequest;
    }) {
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select({ id: students.id, status: students.status })
          .from(students)
          .where(and(eq(students.id, input.studentId), eq(students.academyId, input.academyId)))
          .for("update")
          .limit(1);
        if (!current) throw new AcademyRepositoryError("RELATED_RECORD_NOT_FOUND");

        if (input.changes.status && input.changes.status !== current.status) {
          const [activeEnrollment] = await tx
            .select({ id: enrollments.id })
            .from(enrollments)
            .where(
              and(
                eq(enrollments.academyId, input.academyId),
                eq(enrollments.studentId, input.studentId),
                eq(enrollments.status, "active"),
              ),
            )
            .limit(1);
          if (
            activeEnrollment &&
            (input.changes.status === "lead" || input.changes.status === "pending")
          ) {
            throw new AcademyRepositoryError("STUDENT_HAS_ACTIVE_ENROLLMENTS");
          }
          if (
            input.changes.status === "suspended" ||
            input.changes.status === "completed" ||
            input.changes.status === "withdrawn"
          ) {
            await tx
              .update(enrollments)
              .set({ status: input.changes.status, endedAt: new Date(), updatedAt: new Date() })
              .where(
                and(
                  eq(enrollments.academyId, input.academyId),
                  eq(enrollments.studentId, input.studentId),
                  eq(enrollments.status, "active"),
                ),
              );
          }
        }

        const [updated] = await tx
          .update(students)
          .set({ ...input.changes, updatedAt: new Date() })
          .where(and(eq(students.id, input.studentId), eq(students.academyId, input.academyId)))
          .returning({ id: students.id });
        if (!updated) throw new AcademyRepositoryError("RELATED_RECORD_NOT_FOUND");
      });
    },

    async updateStudentGuardian(input: {
      academyId: string;
      studentId: string;
      guardianId: string;
      changes: UpdateStudentGuardianRequest;
    }) {
      await db.transaction(async (tx) => {
        const [guardian] = await tx
          .select({ id: guardians.id, email: guardians.email, userId: guardians.userId })
          .from(guardians)
          .innerJoin(studentGuardians, eq(studentGuardians.guardianId, guardians.id))
          .where(
            and(
              eq(guardians.id, input.guardianId),
              eq(guardians.academyId, input.academyId),
              eq(studentGuardians.academyId, input.academyId),
              eq(studentGuardians.studentId, input.studentId),
            ),
          )
          .for("update")
          .limit(1);
        if (!guardian) throw new AcademyRepositoryError("RELATED_RECORD_NOT_FOUND");
        if (
          input.changes.email !== undefined &&
          guardian.userId &&
          input.changes.email !== guardian.email
        ) {
          throw new AcademyRepositoryError("GUARDIAN_ACCOUNT_EMAIL_LOCKED");
        }

        const emailChanged =
          input.changes.email !== undefined && input.changes.email !== guardian.email;
        if (emailChanged) {
          await tx
            .update(guardianInvites)
            .set({ revokedAt: new Date() })
            .where(
              and(
                eq(guardianInvites.guardianId, guardian.id),
                isNull(guardianInvites.redeemedAt),
                isNull(guardianInvites.revokedAt),
              ),
            );
        }

        const { relationship, ...profileChanges } = input.changes;
        if (Object.keys(profileChanges).length > 0) {
          await tx
            .update(guardians)
            .set({ ...profileChanges, updatedAt: new Date() })
            .where(and(eq(guardians.id, guardian.id), eq(guardians.academyId, input.academyId)));
        }
        if (relationship !== undefined) {
          await tx
            .update(studentGuardians)
            .set({ relationship })
            .where(
              and(
                eq(studentGuardians.studentId, input.studentId),
                eq(studentGuardians.guardianId, input.guardianId),
                eq(studentGuardians.academyId, input.academyId),
              ),
            );
        }
      });
    },

    async addStudentGuardian(
      input: CreateRecordContext & AddStudentGuardianRequest & { studentId: string },
    ) {
      return db.transaction(async (tx) => {
        const [student] = await tx
          .select({ id: students.id })
          .from(students)
          .where(and(eq(students.id, input.studentId), eq(students.academyId, input.academyId)))
          .for("update")
          .limit(1);
        if (!student) throw new AcademyRepositoryError("RELATED_RECORD_NOT_FOUND");
        const [guardian] = await tx
          .insert(guardians)
          .values({
            academyId: input.academyId,
            name: input.name,
            ...(input.email ? { email: input.email } : {}),
            ...(input.phone ? { phone: input.phone } : {}),
            createdBy: input.createdBy,
          })
          .returning({ id: guardians.id });
        if (!guardian) throw new Error("Guardian insert returned no record.");
        await tx.insert(studentGuardians).values({
          academyId: input.academyId,
          studentId: input.studentId,
          guardianId: guardian.id,
          relationship: input.relationship,
          isPrimary: false,
        });
        return { id: guardian.id };
      });
    },

    async endEnrollment(input: {
      academyId: string;
      studentId: string;
      enrollmentId: string;
      status: UpdateEnrollmentStatusRequest["status"];
    }) {
      const [enrollment] = await db
        .select({
          id: enrollments.id,
          batchId: enrollments.batchId,
          status: enrollments.status,
          batchName: batches.name,
          programName: programs.name,
          startedAt: enrollments.startedAt,
          endedAt: enrollments.endedAt,
        })
        .from(enrollments)
        .innerJoin(batches, eq(enrollments.batchId, batches.id))
        .innerJoin(programs, eq(batches.programId, programs.id))
        .where(
          and(
            eq(enrollments.id, input.enrollmentId),
            eq(enrollments.studentId, input.studentId),
            eq(enrollments.academyId, input.academyId),
            eq(batches.academyId, input.academyId),
            eq(programs.academyId, input.academyId),
          ),
        )
        .limit(1);
      if (!enrollment) throw new AcademyRepositoryError("RELATED_RECORD_NOT_FOUND");
      if (enrollment.status !== "active") {
        if (enrollment.status === input.status) return enrollment;
        throw new AcademyRepositoryError("ENROLLMENT_ALREADY_ENDED");
      }
      if (input.status === "active") return enrollment;
      const [updated] = await db
        .update(enrollments)
        .set({ status: input.status, endedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(enrollments.id, enrollment.id),
            eq(enrollments.academyId, input.academyId),
            eq(enrollments.status, "active"),
          ),
        )
        .returning({ id: enrollments.id });
      if (!updated) throw new AcademyRepositoryError("ENROLLMENT_ALREADY_ENDED");
      return { ...enrollment, status: input.status, endedAt: new Date() };
    },

    async createStudent(input: CreateRecordContext & CreateStudentRequest) {
      const studentId = await db.transaction(async (tx) => {
        if (input.batchId) {
          const [batch] = await tx
            .select({ id: batches.id, isActive: batches.isActive })
            .from(batches)
            .where(and(eq(batches.id, input.batchId), eq(batches.academyId, input.academyId)))
            .limit(1);
          if (!batch?.isActive) throw new AcademyRepositoryError("RELATED_RECORD_NOT_FOUND");
        }

        const [student] = await tx
          .insert(students)
          .values({
            academyId: input.academyId,
            firstName: input.firstName,
            lastName: input.lastName,
            status: input.status,
            dateOfBirth: input.dateOfBirth ?? null,
            gender: input.gender ?? null,
            address: input.address ?? null,
            medicalNotes: input.medicalNotes ?? null,
            emergencyContactName: input.emergencyContact?.name ?? null,
            emergencyContactRelationship: input.emergencyContact?.relationship ?? null,
            emergencyContactPhone: input.emergencyContact?.phone ?? null,
            createdBy: input.createdBy,
          })
          .returning({ id: students.id });
        if (!student) throw new Error("Student insert returned no record.");

        if (input.guardian) {
          const [guardian] = await tx
            .insert(guardians)
            .values({
              academyId: input.academyId,
              name: input.guardian.name,
              ...(input.guardian.email ? { email: input.guardian.email } : {}),
              ...(input.guardian.phone ? { phone: input.guardian.phone } : {}),
              createdBy: input.createdBy,
            })
            .returning({ id: guardians.id });
          if (!guardian) throw new Error("Guardian insert returned no record.");
          await tx.insert(studentGuardians).values({
            academyId: input.academyId,
            studentId: student.id,
            guardianId: guardian.id,
            relationship: input.guardian.relationship,
            isPrimary: true,
          });
        }

        if (input.batchId) {
          await addEnrollment(tx, {
            academyId: input.academyId,
            createdBy: input.createdBy,
            studentId: student.id,
            batchId: input.batchId,
            requireActiveStudent: true,
          });
        }
        return student.id;
      });
      const {
        students: [student],
      } = await this.listStudents(input.academyId, { offset: 0, limit: 1 }, studentId);
      if (!student) throw new Error("Created student could not be loaded.");
      return student;
    },

    async deleteStudent(input: { academyId: string; studentId: string }) {
      try {
        const [deleted] = await db
          .delete(students)
          .where(and(eq(students.id, input.studentId), eq(students.academyId, input.academyId)))
          .returning({ id: students.id });
        if (!deleted) throw new AcademyRepositoryError("RELATED_RECORD_NOT_FOUND");
        return { deleted: true };
      } catch (error) {
        const code =
          typeof error === "object" && error !== null && "code" in error
            ? (error as { code?: unknown }).code
            : undefined;
        if (code === "23503") throw new AcademyRepositoryError("STUDENT_HAS_HISTORY");
        throw error;
      }
    },

    async createEnrollment(input: CreateRecordContext & { studentId: string; batchId: string }) {
      const [enrollment] = await db.transaction(async (tx) => {
        await addEnrollment(tx, { ...input, requireActiveStudent: true });
        return tx
          .select({
            id: enrollments.id,
            batchId: batches.id,
            batchName: batches.name,
            programName: programs.name,
            status: enrollments.status,
          })
          .from(enrollments)
          .innerJoin(batches, eq(enrollments.batchId, batches.id))
          .innerJoin(programs, eq(batches.programId, programs.id))
          .where(
            and(
              eq(enrollments.academyId, input.academyId),
              eq(enrollments.studentId, input.studentId),
              eq(enrollments.batchId, input.batchId),
              eq(enrollments.status, "active"),
            ),
          )
          .limit(1);
      });
      return enrollment;
    },
  };
}

export type AcademyRepository = ReturnType<typeof createAcademyRepository>;
