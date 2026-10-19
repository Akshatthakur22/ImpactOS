import { Router } from "express";
import { RedeemGuardianInviteRequestSchema, UpdateParentProfileRequestSchema, UpdateParentStudentRequestSchema } from "@sportdesk/contracts";
import { z } from "zod";
import type { SportDeskAuthService } from "../auth/auth.service.js";
import { AuthError } from "../auth/auth.service.js";
import { authenticatedUser, requirePermission } from "../auth/authorization.js";
import type { SportDeskParentsService } from "./parents.service.js";

export function createParentsRouter(options: {
  auth: SportDeskAuthService;
  parents: SportDeskParentsService;
}): Router {
  const router = Router();

  router.get("/parent/me/profile", async (request, response) => {
    const user = await authenticatedUser(request, options.auth);
    if (user.role !== "parent") throw new AuthError(403, "FORBIDDEN", "Parent access is required for this operation.");
    response.status(200).json({ data: await options.parents.getProfile(user.academyId, user.id) });
  });
  router.patch("/parent/me/profile", async (request, response) => {
    const user = await authenticatedUser(request, options.auth);
    if (user.role !== "parent") throw new AuthError(403, "FORBIDDEN", "Parent access is required for this operation.");
    const input = UpdateParentProfileRequestSchema.parse(request.body);
    response.status(200).json({ data: await options.parents.updateProfile({ ...input, academyId: user.academyId, userId: user.id }) });
  });
  router.patch("/parent/students/:studentId/profile", async (request, response) => {
    const user = await authenticatedUser(request, options.auth);
    if (user.role !== "parent") throw new AuthError(403, "FORBIDDEN", "Parent access is required for this operation.");
    const studentId = z.string().uuid().parse(request.params.studentId);
    const input = UpdateParentStudentRequestSchema.parse(request.body);
    response.status(200).json({ data: await options.parents.updateLinkedStudent({ ...input, studentId, academyId: user.academyId, userId: user.id }) });
  });

  router.post("/parent-invites/redeem", async (request, response) => {
    const input = RedeemGuardianInviteRequestSchema.parse(request.body);
    const result = await options.parents.redeemGuardianInvite(input);
    response.status(200).json({ data: result });
  });

  router.post("/guardians/:guardianId/invites", async (request, response) => {
    const user = await requirePermission(request, options.auth, "students:write");
    const invite = await options.parents.createGuardianInvite({
      academyId: user.academyId,
      guardianId: z.string().uuid().parse(request.params.guardianId),
      createdBy: user.id,
    });
    response.status(201).json({ data: invite });
  });

  router.delete("/guardians/:guardianId/invites", async (request, response) => {
    const user = await requirePermission(request, options.auth, "students:write");
    const result = await options.parents.revokeGuardianInvite({
      academyId: user.academyId,
      guardianId: z.string().uuid().parse(request.params.guardianId),
    });
    response.status(200).json({ data: result });
  });

  router.get("/parent/me/students", async (request, response) => {
    const user = await authenticatedUser(request, options.auth);
    if (user.role !== "parent")
      throw new AuthError(403, "FORBIDDEN", "Parent access is required for this operation.");
    const students = await options.parents.listStudents(user.academyId, user.id);
    response.status(200).json({ data: { students } });
  });

  router.get("/parent/students/:studentId/schedule", async (request, response) => {
    const user = await authenticatedUser(request, options.auth);
    if (user.role !== "parent")
      throw new AuthError(403, "FORBIDDEN", "Parent access is required for this operation.");
    const studentId = z.string().uuid().parse(request.params.studentId);
    const schedules = await options.parents.listStudentSchedule(user.academyId, user.id, studentId);
    response.status(200).json({ data: { schedules } });
  });

  router.get("/parent/students/:studentId/attendance", async (request, response) => {
    const user = await authenticatedUser(request, options.auth);
    if (user.role !== "parent")
      throw new AuthError(403, "FORBIDDEN", "Parent access is required for this operation.");
    const studentId = z.string().uuid().parse(request.params.studentId);
    const records = await options.parents.listStudentAttendance(user.academyId, user.id, studentId);
    response.status(200).json({ data: { records } });
  });

  router.get("/parent/students/:studentId/progress", async (request, response) => {
    const user = await authenticatedUser(request, options.auth);
    if (user.role !== "parent")
      throw new AuthError(403, "FORBIDDEN", "Parent access is required for this operation.");
    const studentId = z.string().uuid().parse(request.params.studentId);
    const entries = await options.parents.listStudentProgress(user.academyId, user.id, studentId);
    response
      .status(200)
      .json({
        data: {
          entries: entries.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
        },
      });
  });

  return router;
}
