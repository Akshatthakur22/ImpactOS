import type { CreateAnnouncementRequest } from "@sportdesk/contracts";
import {
  AnnouncementRepositoryError,
  type AnnouncementsRepository,
} from "../../db/announcements.repository.js";

export class AnnouncementError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AnnouncementError";
  }
}

function translateError(error: unknown): never {
  if (error instanceof AnnouncementError) throw error;
  if (error instanceof AnnouncementRepositoryError) {
    if (error.code === "ANNOUNCEMENT_NOT_FOUND") {
      throw new AnnouncementError(404, error.code, "The announcement was not found.");
    }
    if (error.code === "ANNOUNCEMENT_NOT_EDITABLE") {
      throw new AnnouncementError(
        409,
        error.code,
        "Only draft announcements can be edited or published.",
      );
    }
    throw new AnnouncementError(404, error.code, "The selected batch was not found.");
  }
  throw error;
}

export function createAnnouncementsService(repository: AnnouncementsRepository) {
  return {
    async listForAdmin(academyId: string) {
      const rows = await repository.listForAdmin(academyId);
      return {
        announcements: rows.map((row) => ({
          ...row,
          publishedAt: row.publishedAt?.toISOString() ?? null,
          readCount: Number(row.readCount),
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        })),
      };
    },

    async createDraft(
      input: CreateAnnouncementRequest & { academyId: string; createdBy: string },
    ) {
      try {
        return await repository.createDraft(input);
      } catch (error) {
        translateError(error);
      }
    },

    async updateDraft(
      input: CreateAnnouncementRequest & { academyId: string; announcementId: string },
    ) {
      try {
        return await repository.updateDraft(input);
      } catch (error) {
        translateError(error);
      }
    },

    async publish(input: { academyId: string; announcementId: string }) {
      try {
        return await repository.publish({ ...input, now: new Date() });
      } catch (error) {
        translateError(error);
      }
    },

    async archive(input: { academyId: string; announcementId: string }) {
      try {
        return await repository.archive({ ...input, now: new Date() });
      } catch (error) {
        translateError(error);
      }
    },

    async listForParent(academyId: string, userId: string) {
      return {
        announcements: (await repository.listForParent(academyId, userId)).map((row) => ({
          ...row,
          publishedAt: row.publishedAt!.toISOString(),
          readAt: row.readAt?.toISOString() ?? null,
        })),
      };
    },

    async listForCoach(academyId: string, userId: string) {
      return {
        announcements: (await repository.listForCoach(academyId, userId)).map((row) => ({
          ...row,
          publishedAt: row.publishedAt!.toISOString(),
          readAt: row.readAt?.toISOString() ?? null,
        })),
      };
    },

    async markRead(input: {
      academyId: string;
      userId: string;
      announcementId: string;
      role: "parent" | "coach";
    }) {
      const announcements =
        input.role === "coach"
          ? await repository.listForCoach(input.academyId, input.userId)
          : await repository.listForParent(input.academyId, input.userId);
      if (!announcements.some((announcement) => announcement.id === input.announcementId)) {
        throw new AnnouncementError(404, "ANNOUNCEMENT_NOT_FOUND", "The announcement was not found.");
      }
      return repository.markRead({
        academyId: input.academyId,
        userId: input.userId,
        announcementId: input.announcementId,
        now: new Date(),
      });
    },
  };
}

export type SportDeskAnnouncementsService = ReturnType<typeof createAnnouncementsService>;
