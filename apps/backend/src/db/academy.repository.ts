import { and, asc, count, eq, inArray } from "drizzle-orm";
import type { CreateStudentRequest } from "@sportdesk/contracts";
import type { Database } from "./client.js";
import {
  batches,
  disciplines,
  enrollments,
  guardians,
  programs,
  studentGuardians,
  students,
} from "./schema.js";

export class AcademyRepositoryError extends Error {
  constructor(readonly code: "RELATED_RECORD_NOT_FOUND" | "BATCH_FULL" | "ALREADY_ENROLLED") {
    super(code);
    this.name = "AcademyRepositoryError";
  }
}

type CreateRecordContext = { academyId: string; createdBy: string };

async function addEnrollment(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  input: CreateRecordContext & { studentId: string; batchId: string },
) {
  const [batch] = await tx
    .select({ id: batches.id, capacity: batches.capacity, isActive: batches.isActive })
    .from(batches)
    .where(and(eq(batches.id, input.batchId), eq(batches.academyId, input.academyId)))
    .for("update")
    .limit(1);
  if (!batch?.isActive) throw new AcademyRepositoryError("RELATED_RECORD_NOT_FOUND");

  const [student] = await tx
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.id, input.studentId), eq(students.academyId, input.academyId)))
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

  await tx.insert(enrollments).values({
    academyId: input.academyId,
    studentId: input.studentId,
    batchId: input.batchId,
    createdBy: input.createdBy,
  });
}

export function createAcademyRepository(db: Database) {
  return {
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

    async listStudents(academyId: string, studentId?: string) {
      const studentRows = await db
        .select({
          id: students.id,
          firstName: students.firstName,
          lastName: students.lastName,
          status: students.status,
          createdAt: students.createdAt,
        })
        .from(students)
        .where(
          studentId
            ? and(eq(students.academyId, academyId), eq(students.id, studentId))
            : eq(students.academyId, academyId),
        )
        .orderBy(asc(students.lastName), asc(students.firstName));

      if (studentRows.length === 0) return [];
      const studentIds = studentRows.map((student) => student.id);
      const [guardianRows, enrollmentRows] = await Promise.all([
        db
          .select({
            studentId: studentGuardians.studentId,
            id: guardians.id,
            name: guardians.name,
            email: guardians.email,
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

      return studentRows.map((student) => ({
        ...student,
        guardians: (guardianByStudent.get(student.id) ?? []).map(
          ({ id, name, email, userId, relationship }) => ({
            id,
            name,
            email,
            hasAccount: userId !== null,
            relationship,
          }),
        ),
        enrollments: (enrollmentByStudent.get(student.id) ?? []).map(
          ({ studentId: _studentId, ...enrollment }) => enrollment,
        ),
      }));
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
          });
        }
        return student.id;
      });
      const [student] = await this.listStudents(input.academyId, studentId);
      if (!student) throw new Error("Created student could not be loaded.");
      return student;
    },

    async createEnrollment(input: CreateRecordContext & { studentId: string; batchId: string }) {
      const [enrollment] = await db.transaction(async (tx) => {
        await addEnrollment(tx, input);
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
