import { Router, type Request } from "express";
import { PushDeviceRequestSchema } from "@sportdesk/contracts";
import type { SportDeskAuthService } from "../auth/auth.service.js";
import { AuthError } from "../auth/auth.service.js";
import type { SportDeskPushService } from "./push.service.js";

async function currentUser(request: Request, auth: SportDeskAuthService) {
  const token = request.get("authorization")?.match(/^Bearer ([A-Za-z0-9._~-]+)$/)?.[1];
  if (!token) throw new AuthError(401, "UNAUTHENTICATED", "Authentication is required.");
  const user = await auth.authenticate(token);
  if (!user) throw new AuthError(401, "UNAUTHENTICATED", "Authentication is required.");
  return user;
}

export function createPushRouter(options: {
  auth: SportDeskAuthService;
  push: SportDeskPushService;
}) {
  const router = Router();
  router.put("/push/devices", async (request, response) => {
    const user = await currentUser(request, options.auth);
    const input = PushDeviceRequestSchema.parse(request.body);
    await options.push.register({ ...input, academyId: user.academyId, userId: user.id });
    response.status(200).json({ data: { registered: true } });
  });
  router.delete("/push/devices", async (request, response) => {
    const user = await currentUser(request, options.auth);
    const input = PushDeviceRequestSchema.pick({ token: true }).parse(request.body);
    await options.push.remove({ ...input, academyId: user.academyId, userId: user.id });
    response.status(200).json({ data: { registered: false } });
  });
  return router;
}
