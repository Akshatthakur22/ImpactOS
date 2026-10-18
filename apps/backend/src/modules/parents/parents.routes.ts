import { Router, type Request } from "express";
import { RedeemGuardianInviteRequestSchema } from "@sportdesk/contracts";
import { z } from "zod";
import type { SportDeskAuthService } from "../auth/auth.service.js";
import { AuthError } from "../auth/auth.service.js";
import type { SportDeskParentsService } from "./parents.service.js";

async function authenticatedUser(request: Request, auth: SportDeskAuthService) {
  const token = request.get("authorization")?.match(/^Bearer ([A-Za-z0-9._~-]+)$/)?.[1];
  if (!token) throw new AuthError(401, "UNAUTHENTICATED", "Authentication is required.");
  const user = await auth.authenticate(token);
  if (!user) throw new AuthError(401, "UNAUTHENTICATED", "Authentication is required.");
  return user;
}

export function createParentsRouter(options: {
  auth: SportDeskAuthService;
  parents: SportDeskParentsService;
}): Router {
  const router = Router();

  router.post("/parent-invites/redeem", async (request, response) => {
    const input = RedeemGuardianInviteRequestSchema.parse(request.body);
    const result = await options.parents.redeemGuardianInvite(input);
    response.status(200).json({ data: result });
  });

  router.post("/guardians/:guardianId/invites", async (request, response) => {
    const user = await authenticatedUser(request, options.auth);
    if (user.role !== "owner")
      throw new AuthError(403, "FORBIDDEN", "Owner access is required for this operation.");
    const invite = await options.parents.createGuardianInvite({
      academyId: user.academyId,
      guardianId: z.string().uuid().parse(request.params.guardianId),
      createdBy: user.id,
    });
    response.status(201).json({ data: invite });
  });

  router.delete("/guardians/:guardianId/invites", async (request, response) => {
    const user = await authenticatedUser(request, options.auth);
    if (user.role !== "owner")
      throw new AuthError(403, "FORBIDDEN", "Owner access is required for this operation.");
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

  return router;
}
