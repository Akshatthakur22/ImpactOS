import { Router } from "express";
import { CreateAnnouncementRequestSchema } from "@sportdesk/contracts";
import { z } from "zod";
import type { SportDeskAuthService } from "../auth/auth.service.js";
import { authenticatedUser, requirePermission } from "../auth/authorization.js";
import { AuthError } from "../auth/auth.service.js";
import type { SportDeskAnnouncementsService } from "./announcements.service.js";

function requireRole(role: "owner" | "parent" | "coach", actualRole: string) {
  if (actualRole !== role) {
    const roleLabel = role === "owner" ? "Owner" : role === "parent" ? "Parent" : "Coach";
    throw new AuthError(403, "FORBIDDEN", `${roleLabel} access is required.`);
  }
}

export function createAnnouncementsRouter(options: {
  auth: SportDeskAuthService;
  announcements: SportDeskAnnouncementsService;
}): Router {
  const router = Router();

  router.get("/announcements", async (request, response) => {
    const user = await requirePermission(request, options.auth, "announcements:manage");
    response.status(200).json({
      data: await options.announcements.listForAdmin(user.academyId),
    });
  });

  router.post("/announcements", async (request, response) => {
    const user = await requirePermission(request, options.auth, "announcements:manage");
    const input = CreateAnnouncementRequestSchema.parse(request.body);
    const record = await options.announcements.createDraft({
      ...input,
      academyId: user.academyId,
      createdBy: user.id,
    });
    response.status(201).json({ data: record });
  });

  router.patch("/announcements/:announcementId", async (request, response) => {
    const user = await requirePermission(request, options.auth, "announcements:manage");
    const input = CreateAnnouncementRequestSchema.parse(request.body);
    const result = await options.announcements.updateDraft({
      ...input,
      academyId: user.academyId,
      announcementId: z.string().uuid().parse(request.params.announcementId),
    });
    response.status(200).json({ data: result });
  });

  router.post("/announcements/:announcementId/publish", async (request, response) => {
    const user = await requirePermission(request, options.auth, "announcements:manage");
    const result = await options.announcements.publish({
      academyId: user.academyId,
      announcementId: z.string().uuid().parse(request.params.announcementId),
    });
    response.status(200).json({ data: result });
  });

  router.post("/announcements/:announcementId/archive", async (request, response) => {
    const user = await requirePermission(request, options.auth, "announcements:manage");
    const result = await options.announcements.archive({
      academyId: user.academyId,
      announcementId: z.string().uuid().parse(request.params.announcementId),
    });
    response.status(200).json({ data: result });
  });

  router.get("/parent/announcements", async (request, response) => {
    const user = await authenticatedUser(request, options.auth);
    requireRole("parent", user.role);
    response.status(200).json({
      data: await options.announcements.listForParent(user.academyId, user.id),
    });
  });

  router.post("/parent/announcements/:announcementId/read", async (request, response) => {
    const user = await authenticatedUser(request, options.auth);
    requireRole("parent", user.role);
    const result = await options.announcements.markRead({
      academyId: user.academyId,
      userId: user.id,
      announcementId: z.string().uuid().parse(request.params.announcementId),
      role: "parent",
    });
    response.status(200).json({ data: result });
  });

  router.get("/coach/announcements", async (request, response) => {
    const user = await authenticatedUser(request, options.auth);
    requireRole("coach", user.role);
    response.status(200).json({
      data: await options.announcements.listForCoach(user.academyId, user.id),
    });
  });

  router.post("/coach/announcements/:announcementId/read", async (request, response) => {
    const user = await authenticatedUser(request, options.auth);
    requireRole("coach", user.role);
    const result = await options.announcements.markRead({
      academyId: user.academyId,
      userId: user.id,
      announcementId: z.string().uuid().parse(request.params.announcementId),
      role: "coach",
    });
    response.status(200).json({ data: result });
  });

  return router;
}
