import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { CreateInquiryRequest, InquiryListQuery } from "@sportdesk/contracts";
import type { Database } from "./client.js";
import { academyLocalDateTimeToUtc } from "../modules/operations/academy-time.js";
import {
  academies,
  batches,
  disciplines,
  enrollments,
  guardians,
  inquiries,
  inquiryActivities,
  inquirySourceSubmissions,
  programs,
  studentGuardians,
  students,
  users,
} from "./schema.js";

type RecordContext = { academyId: string; userId: string };

export function createAdmissionsRepository(db: Database) {
  async function loadActivities(academyId: string, inquiryId: string) {
    return db
      .select({
        id: inquiryActivities.id,
        type: inquiryActivities.type,
        note: inquiryActivities.note,
        statusBefore: inquiryActivities.statusBefore,
        statusAfter: inquiryActivities.statusAfter,
        nextFollowUpAt: inquiryActivities.nextFollowUpAt,
        createdByName: users.displayName,
        createdAt: inquiryActivities.createdAt,
      })
      .from(inquiryActivities)
      .innerJoin(users, eq(users.id, inquiryActivities.createdBy))
      .where(
        and(eq(inquiryActivities.academyId, academyId), eq(inquiryActivities.inquiryId, inquiryId)),
      )
      .orderBy(desc(inquiryActivities.createdAt), desc(inquiryActivities.id));
  }

  return {
    async createExternal(input: {
      academyId: string;
      source: "website" | "google_forms";
      externalSubmissionId: string;
      inquiry: CreateInquiryRequest;
    }) {
      return db.transaction(async (tx) => {
        if (input.inquiry.programId) {
          const [program] = await tx
            .select({ id: programs.id })
            .from(programs)
            .where(
              and(
                eq(programs.id, input.inquiry.programId),
                eq(programs.academyId, input.academyId),
                eq(programs.isActive, true),
              ),
            )
            .limit(1);
          if (!program) return { kind: "related_record_not_found" as const };
        }
        const [owner] = await tx
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              eq(users.academyId, input.academyId),
              eq(users.role, "owner"),
              eq(users.isActive, true),
            ),
          )
          .orderBy(asc(users.createdAt))
          .limit(1);
        if (!owner) return { kind: "related_record_not_found" as const };
        const [sourceSubmission] = await tx
          .insert(inquirySourceSubmissions)
          .values({
            academyId: input.academyId,
            source: input.source,
            externalSubmissionId: input.externalSubmissionId,
            status: "processed",
            processedAt: new Date(),
          })
          .onConflictDoNothing()
          .returning({ id: inquirySourceSubmissions.id });
        if (!sourceSubmission) return { kind: "already_processed" as const };
        const [inquiry] = await tx
          .insert(inquiries)
          .values({
            academyId: input.academyId,
            studentFirstName: input.inquiry.studentFirstName,
            studentLastName: input.inquiry.studentLastName,
            contactName: input.inquiry.contactName,
            contactEmail: input.inquiry.contactEmail,
            contactPhone: input.inquiry.contactPhone,
            relationship: input.inquiry.relationship,
            source: input.source === "website" ? "Website" : "Google Forms",
            sourceDetail: input.inquiry.sourceDetail,
            programId: input.inquiry.programId,
            notes: input.inquiry.notes,
            createdBy: owner.id,
            updatedBy: owner.id,
          })
          .returning({ id: inquiries.id });
        await tx
          .update(inquirySourceSubmissions)
          .set({ inquiryId: inquiry!.id })
          .where(eq(inquirySourceSubmissions.id, sourceSubmission.id));
        const matchEmail = input.inquiry.contactEmail
          ? sql`lower(${inquiries.contactEmail}) = lower(${input.inquiry.contactEmail})`
          : sql`false`;
        const normalizedPhone = input.inquiry.contactPhone?.replace(/\D/g, "");
        const matchPhone = normalizedPhone
          ? sql`regexp_replace(coalesce(${inquiries.contactPhone}, ''), '\\D', '', 'g') = ${normalizedPhone}`
          : sql`false`;
        const possibleDuplicate = await tx
          .select({ id: inquiries.id })
          .from(inquiries)
          .where(
            and(
              eq(inquiries.academyId, input.academyId),
              sql`${inquiries.id} <> ${inquiry!.id}`,
              or(matchEmail, matchPhone),
            ),
          )
          .limit(1);
        if (possibleDuplicate.length) {
          await tx
            .update(inquirySourceSubmissions)
            .set({ status: "review" })
            .where(eq(inquirySourceSubmissions.id, sourceSubmission.id));
          await tx
            .update(inquiries)
            .set({ needsReview: true })
            .where(eq(inquiries.id, inquiry!.id));
        }
        return {
          kind: possibleDuplicate.length ? ("potential_duplicate" as const) : ("created" as const),
          id: inquiry!.id,
        };
      });
    },

    async overview(academyId: string) {
      const [academy] = await db
        .select({ timezone: academies.timezone })
        .from(academies)
        .where(eq(academies.id, academyId))
        .limit(1);
      const timezone = academy?.timezone ?? "Asia/Kolkata";
      const now = new Date();
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .formatToParts(now)
        .reduce<Record<string, string>>((result, part) => {
          result[part.type] = part.value;
          return result;
        }, {});
      const todayDate = `${parts.year}-${parts.month}-${parts.day}`;
      const dayOffset = (date: string, days: number) => {
        const value = new Date(`${date}T00:00:00.000Z`);
        value.setUTCDate(value.getUTCDate() + days);
        return value.toISOString().slice(0, 10);
      };
      const today = academyLocalDateTimeToUtc(todayDate, "00:00", timezone);
      const tomorrow = academyLocalDateTimeToUtc(dayOffset(todayDate, 1), "00:00", timezone);
      const windowStart = academyLocalDateTimeToUtc(dayOffset(todayDate, -30), "00:00", timezone);
      const activeStatuses = sql`${inquiries.status} not in ('converted', 'lost')`;
      const [created, awaiting, due, overdue, active, converted, cohortConverted, bySource] =
        await Promise.all([
          db
            .select({ value: count() })
            .from(inquiries)
            .where(
              and(
                eq(inquiries.academyId, academyId),
                sql`${inquiries.createdAt} >= ${windowStart.toISOString()} and ${inquiries.createdAt} <= ${now.toISOString()}`,
              ),
            ),
          db
            .select({ value: count() })
            .from(inquiries)
            .where(
              and(
                eq(inquiries.academyId, academyId),
                eq(inquiries.status, "new"),
                sql`not exists (select 1 from inquiry_activities a where a.inquiry_id = ${inquiries.id})`,
              ),
            ),
          db
            .select({ value: count() })
            .from(inquiries)
            .where(
              and(
                eq(inquiries.academyId, academyId),
                activeStatuses,
                sql`${inquiries.nextFollowUpAt} >= ${today.toISOString()} and ${inquiries.nextFollowUpAt} < ${tomorrow.toISOString()}`,
              ),
            ),
          db
            .select({ value: count() })
            .from(inquiries)
            .where(
              and(
                eq(inquiries.academyId, academyId),
                activeStatuses,
                sql`${inquiries.nextFollowUpAt} < ${today.toISOString()}`,
              ),
            ),
          db
            .select({ value: count() })
            .from(inquiries)
            .where(and(eq(inquiries.academyId, academyId), activeStatuses)),
          db
            .select({ value: count() })
            .from(inquiries)
            .where(
              and(
                eq(inquiries.academyId, academyId),
                eq(inquiries.status, "converted"),
                sql`${inquiries.updatedAt} >= ${windowStart.toISOString()}`,
              ),
            ),
          db
            .select({ value: count() })
            .from(inquiries)
            .where(
              and(
                eq(inquiries.academyId, academyId),
                eq(inquiries.status, "converted"),
                sql`${inquiries.createdAt} >= ${windowStart.toISOString()}`,
              ),
            ),
          db
            .select({
              source: inquiries.source,
              inquiries: count(),
              converted: sql<number>`count(*) filter (where ${inquiries.status} = 'converted')`,
            })
            .from(inquiries)
            .where(
              and(
                eq(inquiries.academyId, academyId),
                sql`${inquiries.createdAt} >= ${windowStart.toISOString()}`,
              ),
            )
            .groupBy(inquiries.source)
            .orderBy(desc(count())),
        ]);
      const countValue = (rows: Array<{ value: number }>) => rows[0]?.value ?? 0;
      const totalCreated = countValue(created);
      const convertedCount = countValue(converted);
      const cohortConvertedCount = countValue(cohortConverted);
      return {
        createdInRange: totalCreated,
        awaitingFirstContact: countValue(awaiting),
        dueToday: countValue(due),
        overdue: countValue(overdue),
        active: countValue(active),
        convertedInRange: convertedCount,
        conversionRate: totalCreated
          ? Math.round((cohortConvertedCount / totalCreated) * 1000) / 10
          : 0,
        bySource: bySource.map((row) => ({
          ...row,
          inquiries: Number(row.inquiries),
          converted: Number(row.converted),
        })),
      };
    },
    async list(academyId: string, query: InquiryListQuery) {
      const filters = [eq(inquiries.academyId, academyId)];
      if (query.status) filters.push(eq(inquiries.status, query.status));
      if (query.source) filters.push(ilike(inquiries.source, query.source));
      if (query.search) {
        const search = `%${query.search}%`;
        filters.push(
          or(
            ilike(inquiries.studentFirstName, search),
            ilike(inquiries.studentLastName, search),
            ilike(inquiries.contactName, search),
            ilike(inquiries.contactEmail, search),
            ilike(inquiries.contactPhone, search),
          )!,
        );
      }
      const now = new Date();
      if (query.followUp === "due") {
        filters.push(sql`${inquiries.nextFollowUpAt} <= ${now.toISOString()}`);
        filters.push(sql`${inquiries.status} not in ('converted', 'lost')`);
      } else if (query.followUp === "upcoming") {
        filters.push(sql`${inquiries.nextFollowUpAt} > ${now.toISOString()}`);
      } else if (query.followUp === "none") {
        filters.push(sql`${inquiries.nextFollowUpAt} is null`);
      }
      const where = and(...filters);
      const [rows, countRows] = await Promise.all([
        db
          .select({
            id: inquiries.id,
            studentFirstName: inquiries.studentFirstName,
            studentLastName: inquiries.studentLastName,
            contactName: inquiries.contactName,
            contactEmail: inquiries.contactEmail,
            contactPhone: inquiries.contactPhone,
            relationship: inquiries.relationship,
            source: inquiries.source,
            sourceDetail: inquiries.sourceDetail,
            programId: inquiries.programId,
            programName: programs.name,
            status: inquiries.status,
            needsReview: inquiries.needsReview,
            notes: inquiries.notes,
            nextFollowUpAt: inquiries.nextFollowUpAt,
            convertedStudentId: inquiries.convertedStudentId,
            createdAt: inquiries.createdAt,
            updatedAt: inquiries.updatedAt,
          })
          .from(inquiries)
          .leftJoin(programs, eq(programs.id, inquiries.programId))
          .where(where)
          .orderBy(asc(inquiries.nextFollowUpAt), desc(inquiries.updatedAt))
          .limit(query.limit)
          .offset(query.offset),
        db.select({ total: count() }).from(inquiries).where(where),
      ]);
      return {
        inquiries: rows,
        total: countRows[0]?.total ?? 0,
        offset: query.offset,
        limit: query.limit,
      };
    },

    async get(academyId: string, inquiryId: string) {
      const [inquiry] = await db
        .select({
          id: inquiries.id,
          studentFirstName: inquiries.studentFirstName,
          studentLastName: inquiries.studentLastName,
          contactName: inquiries.contactName,
          contactEmail: inquiries.contactEmail,
          contactPhone: inquiries.contactPhone,
          relationship: inquiries.relationship,
          source: inquiries.source,
          sourceDetail: inquiries.sourceDetail,
          programId: inquiries.programId,
          programName: programs.name,
          status: inquiries.status,
          needsReview: inquiries.needsReview,
          notes: inquiries.notes,
          nextFollowUpAt: inquiries.nextFollowUpAt,
          convertedStudentId: inquiries.convertedStudentId,
          createdAt: inquiries.createdAt,
          updatedAt: inquiries.updatedAt,
        })
        .from(inquiries)
        .leftJoin(programs, eq(programs.id, inquiries.programId))
        .where(and(eq(inquiries.academyId, academyId), eq(inquiries.id, inquiryId)))
        .limit(1);
      if (!inquiry) return null;
      return { ...inquiry, activities: await loadActivities(academyId, inquiryId) };
    },

    async create(input: RecordContext & CreateInquiryRequest) {
      return db.transaction(async (tx) => {
        if (input.programId) {
          const [program] = await tx
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
          if (!program) return { kind: "related_record_not_found" as const };
        }
        const [created] = await tx
          .insert(inquiries)
          .values({
            academyId: input.academyId,
            studentFirstName: input.studentFirstName,
            studentLastName: input.studentLastName,
            contactName: input.contactName,
            contactEmail: input.contactEmail,
            contactPhone: input.contactPhone,
            relationship: input.relationship,
            source: input.source,
            sourceDetail: input.sourceDetail,
            programId: input.programId,
            notes: input.notes,
            nextFollowUpAt: input.nextFollowUpAt ? new Date(input.nextFollowUpAt) : null,
            createdBy: input.userId,
            updatedBy: input.userId,
          })
          .returning({ id: inquiries.id });
        return { kind: "created" as const, id: created!.id };
      });
    },

    async addActivity(
      context: RecordContext & {
        inquiryId: string;
        type: "note" | "call" | "message" | "visit" | "trial";
        note: string;
        status?: "new" | "contacted" | "follow_up" | "trial_scheduled" | "lost";
        nextFollowUpAt?: string | null;
      },
    ) {
      return db.transaction(async (tx) => {
        const [inquiry] = await tx
          .select({ id: inquiries.id, status: inquiries.status })
          .from(inquiries)
          .where(
            and(eq(inquiries.academyId, context.academyId), eq(inquiries.id, context.inquiryId)),
          )
          .for("update")
          .limit(1);
        if (!inquiry) return { kind: "not_found" as const };
        if (inquiry.status === "converted" || inquiry.status === "lost") {
          return { kind: "closed" as const };
        }
        const nextStatus = context.status ?? inquiry.status;
        const scheduledFollowUpAt =
          context.nextFollowUpAt === undefined
            ? undefined
            : context.nextFollowUpAt === null
              ? null
              : new Date(context.nextFollowUpAt);
        const nextFollowUpAt = nextStatus === "lost" ? null : scheduledFollowUpAt;
        await tx
          .update(inquiries)
          .set({
            status: nextStatus,
            ...(nextFollowUpAt !== undefined ? { nextFollowUpAt } : {}),
            updatedBy: context.userId,
            updatedAt: new Date(),
          })
          .where(
            and(eq(inquiries.id, context.inquiryId), eq(inquiries.academyId, context.academyId)),
          );
        const [activity] = await tx
          .insert(inquiryActivities)
          .values({
            academyId: context.academyId,
            inquiryId: context.inquiryId,
            type: context.type,
            note: context.note,
            statusBefore: nextStatus === inquiry.status ? null : inquiry.status,
            statusAfter: nextStatus === inquiry.status ? null : nextStatus,
            nextFollowUpAt: nextFollowUpAt === undefined ? null : nextFollowUpAt,
            createdBy: context.userId,
          })
          .returning({ id: inquiryActivities.id });
        return { kind: "created" as const, id: activity!.id };
      });
    },

    async convert(context: RecordContext & { inquiryId: string; batchId?: string }) {
      return db.transaction(async (tx) => {
        const [inquiry] = await tx
          .select()
          .from(inquiries)
          .where(
            and(eq(inquiries.id, context.inquiryId), eq(inquiries.academyId, context.academyId)),
          )
          .for("update")
          .limit(1);
        if (!inquiry) return { kind: "not_found" as const };
        if (inquiry.status === "converted") return { kind: "already_converted" as const };
        if (inquiry.status === "lost") return { kind: "closed" as const };

        let batchId: string | undefined;
        if (context.batchId) {
          const [batch] = await tx
            .select({ id: batches.id, capacity: batches.capacity, programId: batches.programId })
            .from(batches)
            .where(
              and(
                eq(batches.id, context.batchId),
                eq(batches.academyId, context.academyId),
                eq(batches.isActive, true),
              ),
            )
            .for("update")
            .limit(1);
          if (!batch) return { kind: "related_record_not_found" as const };
          const [program] = await tx
            .select({ disciplineId: programs.disciplineId })
            .from(programs)
            .where(
              and(
                eq(programs.id, batch.programId),
                eq(programs.academyId, context.academyId),
                eq(programs.isActive, true),
              ),
            )
            .limit(1);
          if (!program) return { kind: "related_record_not_found" as const };
          const [discipline] = await tx
            .select({ id: disciplines.id })
            .from(disciplines)
            .where(
              and(
                eq(disciplines.id, program.disciplineId),
                eq(disciplines.academyId, context.academyId),
                eq(disciplines.isActive, true),
              ),
            )
            .limit(1);
          if (!discipline) return { kind: "related_record_not_found" as const };
          if (batch.capacity !== null) {
            const enrollmentCounts = await tx
              .select({ value: count() })
              .from(enrollments)
              .where(
                and(
                  eq(enrollments.academyId, context.academyId),
                  eq(enrollments.batchId, batch.id),
                  eq(enrollments.status, "active"),
                ),
              );
            const activeEnrollmentCount = enrollmentCounts[0]?.value ?? 0;
            if (activeEnrollmentCount >= batch.capacity) return { kind: "batch_full" as const };
          }
          batchId = batch.id;
        }

        const [student] = await tx
          .insert(students)
          .values({
            academyId: context.academyId,
            firstName: inquiry.studentFirstName,
            lastName: inquiry.studentLastName,
            status: batchId ? "active" : "pending",
            createdBy: context.userId,
          })
          .returning({ id: students.id });
        if (!student) throw new Error("Converted student was not created.");
        const [guardian] = await tx
          .insert(guardians)
          .values({
            academyId: context.academyId,
            name: inquiry.contactName,
            email: inquiry.contactEmail,
            phone: inquiry.contactPhone,
            createdBy: context.userId,
          })
          .returning({ id: guardians.id });
        if (!guardian) throw new Error("Converted guardian was not created.");
        await tx.insert(studentGuardians).values({
          academyId: context.academyId,
          studentId: student.id,
          guardianId: guardian.id,
          relationship: inquiry.relationship,
          isPrimary: true,
        });
        if (batchId) {
          await tx.insert(enrollments).values({
            academyId: context.academyId,
            studentId: student.id,
            batchId,
            createdBy: context.userId,
          });
        }
        await tx
          .update(inquiries)
          .set({
            status: "converted",
            convertedStudentId: student.id,
            nextFollowUpAt: null,
            updatedBy: context.userId,
            updatedAt: new Date(),
          })
          .where(
            and(eq(inquiries.id, context.inquiryId), eq(inquiries.academyId, context.academyId)),
          );
        await tx.insert(inquiryActivities).values({
          academyId: context.academyId,
          inquiryId: context.inquiryId,
          type: "conversion",
          note: `Converted to student record${batchId ? " and enrolled in a batch" : ""}.`,
          statusBefore: inquiry.status,
          statusAfter: "converted",
          createdBy: context.userId,
        });
        return { kind: "converted" as const, studentId: student.id };
      });
    },
  };
}

export type AdmissionsRepository = ReturnType<typeof createAdmissionsRepository>;
