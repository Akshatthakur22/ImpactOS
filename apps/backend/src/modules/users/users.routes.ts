import { Router, type Request } from "express";
import { z } from "zod";
import {
  CreateStaffRequestSchema,
  PasswordResetConfirmSchema,
  PasswordResetRequestSchema,
  UpdateStaffRequestSchema,
} from "@sportdesk/contracts";
import type { SportDeskAuthService } from "../auth/auth.service.js";
import { AuthError } from "../auth/auth.service.js";
import type { SportDeskUsersService } from "./users.service.js";

async function ownerFromRequest(request: Request, auth: SportDeskAuthService) {
  const token = request.get("authorization")?.match(/^Bearer ([A-Za-z0-9._~-]+)$/)?.[1];
  if (!token) throw new AuthError(401, "UNAUTHENTICATED", "Authentication is required.");
  const user = await auth.authenticate(token);
  if (!user) throw new AuthError(401, "UNAUTHENTICATED", "Authentication is required.");
  if (user.role !== "owner") {
    throw new AuthError(403, "FORBIDDEN", "Owner access is required to manage staff accounts.");
  }
  return user;
}

export function createUsersRouter(options: {
  auth: SportDeskAuthService;
  users: SportDeskUsersService;
}): Router {
  const router = Router();

  router.post("/auth/password-reset/request", async (request, response) => {
    const { email } = PasswordResetRequestSchema.parse(request.body);
    response.status(200).json({ data: await options.users.requestPasswordReset(email) });
  });

  router.post("/auth/password-reset/confirm", async (request, response) => {
    const { token, password } = PasswordResetConfirmSchema.parse(request.body);
    response.status(200).json({ data: await options.users.resetPassword(token, password) });
  });

  router.get("/staff", async (request, response) => {
    const user = await ownerFromRequest(request, options.auth);
    response.status(200).json({ data: await options.users.listStaff(user.academyId) });
  });

  router.post("/staff", async (request, response) => {
    const user = await ownerFromRequest(request, options.auth);
    const input = CreateStaffRequestSchema.parse(request.body);
    response.status(201).json({
      data: await options.users.createStaff({
        ...input,
        academyId: user.academyId,
        createdBy: user.id,
      }),
    });
  });

  router.patch("/staff/:staffId", async (request, response) => {
    const user = await ownerFromRequest(request, options.auth);
    const staffId = z.string().uuid().parse(request.params.staffId);
    const changes = UpdateStaffRequestSchema.parse(request.body);
    response.status(200).json({
      data: await options.users.updateStaff({
        academyId: user.academyId,
        staffId,
        changes,
        updatedBy: user.id,
      }),
    });
  });

  return router;
}
