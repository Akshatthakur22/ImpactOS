import { Router } from "express";
import { z } from "zod";
import {
  AddInquiryActivityRequestSchema,
  ConvertInquiryRequestSchema,
  CreateInquiryRequestSchema,
  InquiryListQuerySchema,
  PublicInquiryConfirmationSchema,
  PublicInquiryRequestSchema,
} from "@sportdesk/contracts";
import type { SportDeskAuthService } from "../auth/auth.service.js";
import { requirePermission } from "../auth/authorization.js";
import type { SportDeskAdmissionsService } from "./admissions.service.js";

export function createAdmissionsRouter(options: {
  auth: SportDeskAuthService;
  admissions: SportDeskAdmissionsService;
  publicAcademyId?: string;
}): Router {
  const router = Router();

  if (options.publicAcademyId) {
    router.post("/public/admissions/inquiries", async (request, response) => {
      const input = PublicInquiryRequestSchema.parse(request.body);
      const submissionId = request.header("Idempotency-Key");
      if (!submissionId || submissionId.length < 16 || submissionId.length > 120) {
        response
          .status(400)
          .json({
            error: {
              code: "IDEMPOTENCY_KEY_REQUIRED",
              message: "A valid Idempotency-Key header is required.",
            },
          });
        return;
      }
      await options.admissions.createExternal({
        academyId: options.publicAcademyId!,
        source: "website",
        externalSubmissionId: submissionId,
        inquiry: input,
      });
      response
        .status(202)
        .json({ data: PublicInquiryConfirmationSchema.parse({ received: true }) });
    });
  }

  router.get("/admissions/overview", async (request, response) => {
    const user = await requirePermission(request, options.auth, "admissions:manage");
    response.status(200).json({ data: await options.admissions.overview(user.academyId) });
  });

  router.get("/inquiries", async (request, response) => {
    const user = await requirePermission(request, options.auth, "admissions:manage");
    const query = InquiryListQuerySchema.parse(request.query);
    response.status(200).json({ data: await options.admissions.list(user.academyId, query) });
  });

  router.post("/inquiries", async (request, response) => {
    const user = await requirePermission(request, options.auth, "admissions:manage");
    const input = CreateInquiryRequestSchema.parse(request.body);
    const inquiry = await options.admissions.create({
      ...input,
      academyId: user.academyId,
      userId: user.id,
    });
    response.status(201).json({ data: inquiry });
  });

  router.get("/inquiries/:inquiryId", async (request, response) => {
    const user = await requirePermission(request, options.auth, "admissions:manage");
    const inquiryId = z.string().uuid().parse(request.params.inquiryId);
    response.status(200).json({ data: await options.admissions.get(user.academyId, inquiryId) });
  });

  router.post("/inquiries/:inquiryId/activities", async (request, response) => {
    const user = await requirePermission(request, options.auth, "admissions:manage");
    const inquiryId = z.string().uuid().parse(request.params.inquiryId);
    const input = AddInquiryActivityRequestSchema.parse(request.body);
    response.status(201).json({
      data: await options.admissions.addActivity({
        ...input,
        academyId: user.academyId,
        userId: user.id,
        inquiryId,
      }),
    });
  });

  router.post("/inquiries/:inquiryId/convert", async (request, response) => {
    const user = await requirePermission(request, options.auth, "admissions:manage");
    const inquiryId = z.string().uuid().parse(request.params.inquiryId);
    const input = ConvertInquiryRequestSchema.parse(request.body);
    response.status(201).json({
      data: await options.admissions.convert({
        ...(input.batchId ? { batchId: input.batchId } : {}),
        academyId: user.academyId,
        userId: user.id,
        inquiryId,
      }),
    });
  });

  return router;
}
