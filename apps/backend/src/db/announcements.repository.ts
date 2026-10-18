import { and, asc, count, desc, eq, inArray, isNull, or } from "drizzle-orm";
import type { CreateAnnouncementRequest } from "@sportdesk/contracts";
import type { Database } from "./client.js";
import {
  academyAnnouncements,
  announcementReads,
  batchCoaches,
  batches,
  coachProfiles,
  enrollments,
  guardians,
  studentGuardians,
} from "./schema.js";

export class AnnouncementRepositoryError extends Error {
  constructor(readonly code: "ANNOUNCEMENT_NOT_FOUND" | "ANNOUNCEMENT_NOT_EDITABLE" | "BATCH_NOT_FOUND") {
    super(code);
    this.name = "AnnouncementRepositoryError";
  }
}

async function ensureBatchExists(
  db: Pick<Database, "select">,
  academyId: string,
  batchId: string | null,
) {
  if (!batchId) return;
  const [batch] = await db
    .select({ id: batches.id })
    .from(batches)
    .where(and(eq(batches.id, batchId), eq(batches.academyId, academyId)))
    .limit(1);
  if (!batch) throw new AnnouncementRepositoryError("BATCH_NOT_FOUND");
}

export function createAnnouncementsRepository(db: Database) {
  return {
    async listForAdmin(academyId: string) {
      return db
        .select({
          id: academyAnnouncements.id,
          title: academyAnnouncements.title,
          body: academyAnnouncements.body,
          audience: academyAnnouncements.audience,
          batchId: academyAnnouncements.batchId,
          batchName: batches.name,
          status: academyAnnouncements.status,
          publishedAt: academyAnnouncements.publishedAt,
          readCount: count(announcementReads.id),
          createdAt: academyAnnouncements.createdAt,
          updatedAt: academyAnnouncements.updatedAt,
        })
        .from(academyAnnouncements)
        .leftJoin(batches, eq(academyAnnouncements.batchId, batches.id))
        .leftJoin(
          announcementReads,
          eq(announcementReads.announcementId, academyAnnouncements.id),
        )
        .where(eq(academyAnnouncements.academyId, academyId))
        .groupBy(academyAnnouncements.id, batches.id)
        .orderBy(desc(academyAnnouncements.updatedAt), asc(academyAnnouncements.title));
    },

    async createDraft(input: CreateAnnouncementRequest & {
      academyId: string;
      createdBy: string;
    }) {
      await ensureBatchExists(db, input.academyId, input.batchId);
      const [record] = await db
        .insert(academyAnnouncements)
        .values({
          academyId: input.academyId,
          createdBy: input.createdBy,
          title: input.title,
          body: input.body,
          audience: input.audience,
          batchId: input.batchId,
        })
        .returning({ id: academyAnnouncements.id });
      return record;
    },

    async updateDraft(input: CreateAnnouncementRequest & {
      academyId: string;
      announcementId: string;
    }) {
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select({ id: academyAnnouncements.id, status: academyAnnouncements.status })
          .from(academyAnnouncements)
          .where(
            and(
              eq(academyAnnouncements.id, input.announcementId),
              eq(academyAnnouncements.academyId, input.academyId),
            ),
          )
          .for("update")
          .limit(1);
        if (!current) throw new AnnouncementRepositoryError("ANNOUNCEMENT_NOT_FOUND");
        if (current.status !== "draft")
          throw new AnnouncementRepositoryError("ANNOUNCEMENT_NOT_EDITABLE");
        await ensureBatchExists(tx, input.academyId, input.batchId);
        await tx
          .update(academyAnnouncements)
          .set({
            title: input.title,
            body: input.body,
            audience: input.audience,
            batchId: input.batchId,
            updatedAt: new Date(),
          })
          .where(eq(academyAnnouncements.id, input.announcementId));
        return { updated: true };
      });
    },

    async publish(input: { academyId: string; announcementId: string; now: Date }) {
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select({ status: academyAnnouncements.status })
          .from(academyAnnouncements)
          .where(
            and(
              eq(academyAnnouncements.id, input.announcementId),
              eq(academyAnnouncements.academyId, input.academyId),
            ),
          )
          .for("update")
          .limit(1);
        if (!current) throw new AnnouncementRepositoryError("ANNOUNCEMENT_NOT_FOUND");
        if (current.status !== "draft")
          throw new AnnouncementRepositoryError("ANNOUNCEMENT_NOT_EDITABLE");
        await tx
          .update(academyAnnouncements)
          .set({ status: "published", publishedAt: input.now, updatedAt: input.now })
          .where(eq(academyAnnouncements.id, input.announcementId));
        return { updated: true };
      });
    },

    async archive(input: { academyId: string; announcementId: string; now: Date }) {
      const [current] = await db
        .select({ id: academyAnnouncements.id })
        .from(academyAnnouncements)
        .where(
          and(
            eq(academyAnnouncements.id, input.announcementId),
            eq(academyAnnouncements.academyId, input.academyId),
          ),
        )
        .limit(1);
      if (!current) throw new AnnouncementRepositoryError("ANNOUNCEMENT_NOT_FOUND");
      await db
        .update(academyAnnouncements)
        .set({ status: "archived", updatedAt: input.now })
        .where(
          and(
            eq(academyAnnouncements.id, input.announcementId),
            eq(academyAnnouncements.academyId, input.academyId),
          ),
        );
      return { updated: true };
    },

    async listForParent(academyId: string, userId: string) {
      const [linkedGuardian] = await db
        .select({ id: guardians.id })
        .from(guardians)
        .where(and(eq(guardians.academyId, academyId), eq(guardians.userId, userId)))
        .limit(1);
      if (!linkedGuardian) return [];

      const parentBatches = await db
        .select({ batchId: enrollments.batchId })
        .from(studentGuardians)
        .innerJoin(guardians, eq(studentGuardians.guardianId, guardians.id))
        .innerJoin(
          enrollments,
          and(
            eq(enrollments.studentId, studentGuardians.studentId),
            eq(enrollments.academyId, studentGuardians.academyId),
            eq(enrollments.status, "active"),
          ),
        )
        .where(and(eq(studentGuardians.academyId, academyId), eq(guardians.userId, userId)));
      const batchIds = [...new Set(parentBatches.map((row) => row.batchId))];
      const audienceFilter = batchIds.length
        ? or(isNull(academyAnnouncements.batchId), inArray(academyAnnouncements.batchId, batchIds))
        : isNull(academyAnnouncements.batchId);

      return db
        .select({
          id: academyAnnouncements.id,
          title: academyAnnouncements.title,
          body: academyAnnouncements.body,
          batchName: batches.name,
          publishedAt: academyAnnouncements.publishedAt,
          readAt: announcementReads.readAt,
        })
        .from(academyAnnouncements)
        .leftJoin(batches, eq(academyAnnouncements.batchId, batches.id))
        .leftJoin(
          announcementReads,
          and(
            eq(announcementReads.announcementId, academyAnnouncements.id),
            eq(announcementReads.userId, userId),
            eq(announcementReads.academyId, academyId),
          ),
        )
        .where(
          and(
            eq(academyAnnouncements.academyId, academyId),
            eq(academyAnnouncements.status, "published"),
            inArray(academyAnnouncements.audience, ["parents", "everyone"]),
            audienceFilter,
          ),
        )
        .orderBy(desc(academyAnnouncements.publishedAt));
    },

    async listForCoach(academyId: string, userId: string) {
      const [coach] = await db
        .select({ id: coachProfiles.id })
        .from(coachProfiles)
        .where(and(eq(coachProfiles.academyId, academyId), eq(coachProfiles.userId, userId)))
        .limit(1);
      if (!coach) return [];

      const assignments = await db
        .select({ batchId: batchCoaches.batchId })
        .from(batchCoaches)
        .where(and(eq(batchCoaches.academyId, academyId), eq(batchCoaches.coachId, coach.id)));
      const batchIds = [...new Set(assignments.map((row) => row.batchId))];
      const audienceFilter = batchIds.length
        ? or(isNull(academyAnnouncements.batchId), inArray(academyAnnouncements.batchId, batchIds))
        : isNull(academyAnnouncements.batchId);

      return db
        .select({
          id: academyAnnouncements.id,
          title: academyAnnouncements.title,
          body: academyAnnouncements.body,
          batchName: batches.name,
          publishedAt: academyAnnouncements.publishedAt,
          readAt: announcementReads.readAt,
        })
        .from(academyAnnouncements)
        .leftJoin(batches, eq(academyAnnouncements.batchId, batches.id))
        .leftJoin(
          announcementReads,
          and(
            eq(announcementReads.announcementId, academyAnnouncements.id),
            eq(announcementReads.userId, userId),
            eq(announcementReads.academyId, academyId),
          ),
        )
        .where(
          and(
            eq(academyAnnouncements.academyId, academyId),
            eq(academyAnnouncements.status, "published"),
            inArray(academyAnnouncements.audience, ["coaches", "everyone"]),
            audienceFilter,
          ),
        )
        .orderBy(desc(academyAnnouncements.publishedAt));
    },

    async markRead(input: { academyId: string; announcementId: string; userId: string; now: Date }) {
      await db
        .insert(announcementReads)
        .values({
          academyId: input.academyId,
          announcementId: input.announcementId,
          userId: input.userId,
          readAt: input.now,
        })
        .onConflictDoNothing({
          target: [announcementReads.announcementId, announcementReads.userId],
        });
      return { updated: true };
    },
  };
}

export type AnnouncementsRepository = ReturnType<typeof createAnnouncementsRepository>;
