import type { Request } from "express";
import type { Permission, PublicUser } from "@sportdesk/contracts";
import type { SportDeskAuthService } from "./auth.service.js";
import { AuthError } from "./auth.service.js";

export async function authenticatedUser(request: Request, auth: SportDeskAuthService) {
  const token = request.get("authorization")?.match(/^Bearer ([A-Za-z0-9._~-]+)$/)?.[1];
  if (!token) throw new AuthError(401, "UNAUTHENTICATED", "Authentication is required.");
  const user = await auth.authenticate(token);
  if (!user) throw new AuthError(401, "UNAUTHENTICATED", "Authentication is required.");
  return user;
}

export async function requireOwner(request: Request, auth: SportDeskAuthService) {
  const user = await authenticatedUser(request, auth);
  if (user.role !== "owner") {
    throw new AuthError(403, "FORBIDDEN", "Owner access is required for this operation.");
  }
  return user;
}

export async function requirePermission(
  request: Request,
  auth: SportDeskAuthService,
  permission: Permission,
): Promise<PublicUser> {
  const user = await authenticatedUser(request, auth);
  if (user.role === "owner") return user;
  if (user.role !== "staff" || !user.permissions?.includes(permission)) {
    throw new AuthError(403, "FORBIDDEN", "You do not have permission to perform this operation.");
  }
  return user;
}

export async function requireRole(
  request: Request,
  auth: SportDeskAuthService,
  role: "coach" | "parent",
) {
  const user = await authenticatedUser(request, auth);
  if (user.role !== role) {
    throw new AuthError(403, "FORBIDDEN", `${role === "coach" ? "Coach" : "Parent"} access is required.`);
  }
  return user;
}
