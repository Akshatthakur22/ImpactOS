import type {
  AddInquiryActivityRequest,
  CreateInquiryRequest,
  InquiryListQuery,
} from "@sportdesk/contracts";
import type { AdmissionsRepository } from "../../db/admissions.repository.js";

export class AdmissionsError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AdmissionsError";
  }
}

function mapInquiry<
  T extends {
    nextFollowUpAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    activities?: Array<{
      nextFollowUpAt: Date | null;
      createdAt: Date;
    }>;
  },
>(inquiry: T) {
  return {
    ...inquiry,
    nextFollowUpAt: inquiry.nextFollowUpAt?.toISOString() ?? null,
    createdAt: inquiry.createdAt.toISOString(),
    updatedAt: inquiry.updatedAt.toISOString(),
    ...(inquiry.activities
      ? {
          activities: inquiry.activities.map((activity) => ({
            ...activity,
            nextFollowUpAt: activity.nextFollowUpAt?.toISOString() ?? null,
            createdAt: activity.createdAt.toISOString(),
          })),
        }
      : {}),
  };
}

export function createAdmissionsService(repository: AdmissionsRepository) {
  function assertResult(result: {
    kind: string;
  }): asserts result is { kind: "created"; id: string } {
    switch (result.kind) {
      case "related_record_not_found":
        throw new AdmissionsError(
          404,
          "RELATED_RECORD_NOT_FOUND",
          "The selected academy record was not found.",
        );
      case "not_found":
        throw new AdmissionsError(404, "INQUIRY_NOT_FOUND", "The inquiry was not found.");
      case "closed":
        throw new AdmissionsError(
          409,
          "INQUIRY_CLOSED",
          "This inquiry is closed and cannot be changed.",
        );
      case "already_converted":
        throw new AdmissionsError(
          409,
          "INQUIRY_ALREADY_CONVERTED",
          "This inquiry has already been converted.",
        );
      case "batch_full":
        throw new AdmissionsError(
          409,
          "BATCH_FULL",
          "This batch has reached its configured capacity.",
        );
      default:
        throw new AdmissionsError(500, "ADMISSIONS_ERROR", "The admissions operation could not be completed.");
    }
  }

  return {
    async list(academyId: string, query: InquiryListQuery) {
      const result = await repository.list(academyId, query);
      return { ...result, inquiries: result.inquiries.map(mapInquiry) };
    },

    async get(academyId: string, inquiryId: string) {
      const inquiry = await repository.get(academyId, inquiryId);
      if (!inquiry)
        throw new AdmissionsError(404, "INQUIRY_NOT_FOUND", "The inquiry was not found.");
      return mapInquiry(inquiry);
    },

    async create(input: CreateInquiryRequest & { academyId: string; userId: string }) {
      const result = await repository.create(input);
      if (result.kind !== "created") assertResult(result);
      return this.get(input.academyId, result.id);
    },

    async addActivity(
      input: AddInquiryActivityRequest & { academyId: string; userId: string; inquiryId: string },
    ) {
      const result = await repository.addActivity({
        academyId: input.academyId,
        userId: input.userId,
        inquiryId: input.inquiryId,
        type: input.type,
        note: input.note,
        ...(input.status ? { status: input.status } : {}),
        ...(input.nextFollowUpAt !== undefined ? { nextFollowUpAt: input.nextFollowUpAt } : {}),
      });
      if (result.kind !== "created") assertResult(result);
      return this.get(input.academyId, input.inquiryId);
    },

    async convert(input: {
      academyId: string;
      userId: string;
      inquiryId: string;
      batchId?: string;
    }) {
      const result = await repository.convert(input);
      if (result.kind !== "converted") assertResult(result);
      return { studentId: result.studentId };
    },
  };
}

export type SportDeskAdmissionsService = ReturnType<typeof createAdmissionsService>;
