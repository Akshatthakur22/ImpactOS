import { Router } from "express";
import { RecordProgressRequestSchema } from "@sportdesk/contracts";
import { z } from "zod";
import type { SportDeskAuthService } from "../auth/auth.service.js";
import { AuthError } from "../auth/auth.service.js";
import { authenticatedUser, requirePermission } from "../auth/authorization.js";
import type { SportDeskProgressService } from "./progress.service.js";
import type { SportDeskPushService } from "../push/push.service.js";

export function createProgressRouter(options: {
  auth: SportDeskAuthService;
  progress: SportDeskProgressService;
  push?: SportDeskPushService;
}) {
  const router = Router();
  router.get("/progress", async (request, response) => {
    const user = await requirePermission(request, options.auth, "students:read");
    const entries = await options.progress.listAcademy(user.academyId);
    response
      .status(200)
      .json({
        data: {
          entries: entries.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
        },
      });
  });
  router.get("/coach/sessions/:sessionId/progress", async (request, response) => {
    const user = await authenticatedUser(request, options.auth);
    if (user.role !== "coach") throw new AuthError(403, "FORBIDDEN", "Coach access is required.");
    const entries = await options.progress.listSession(
      user.academyId,
      user.id,
      z.string().uuid().parse(request.params.sessionId),
    );
    response
      .status(200)
      .json({
        data: {
          entries: entries.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
        },
      });
  });
  router.post("/coach/sessions/:sessionId/progress", async (request, response) => {
    const user = await authenticatedUser(request, options.auth);
    if (user.role !== "coach") throw new AuthError(403, "FORBIDDEN", "Coach access is required.");
    const input = RecordProgressRequestSchema.parse(request.body);
    const entry = await options.progress.record({
      ...input,
      academyId: user.academyId,
      coachId: user.id,
      sessionId: z.string().uuid().parse(request.params.sessionId),
    });
    if (input.parentVisible && options.push) void options.push.progressShared(user.academyId, input.studentId).catch(() => console.warn("Progress push preparation failed."));
    response.status(201).json({ data: entry });
  });
  return router;
}
