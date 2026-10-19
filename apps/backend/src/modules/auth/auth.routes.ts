import { Router, type Response } from "express";
import { ChangePasswordRequestSchema, LoginRequestSchema, RefreshRequestSchema } from "@sportdesk/contracts";
import type { SportDeskAuthService } from "./auth.service.js";
import { AuthError } from "./auth.service.js";

export const REFRESH_COOKIE = "sportdesk_refresh";

type AuthRouterOptions = {
  auth: SportDeskAuthService;
  webOrigin: string;
  secureCookies: boolean;
  sessionTtlDays: number;
};

function checkWebOrigin(origin: string | undefined, expected: string): void {
  if (origin !== expected) {
    throw new AuthError(403, "ORIGIN_NOT_ALLOWED", "Request origin is not allowed.");
  }
}

function setRefreshCookie(response: Response, token: string, options: AuthRouterOptions) {
  response.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: options.secureCookies,
    sameSite: "lax",
    path: "/api/v1/auth",
    maxAge: options.sessionTtlDays * 86_400_000,
  });
}

function clearRefreshCookie(response: Response, options: AuthRouterOptions) {
  response.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: options.secureCookies,
    sameSite: "lax",
    path: "/api/v1/auth",
  });
}

function publicAuthData(
  result: Awaited<ReturnType<SportDeskAuthService["login"]>>,
  clientType: "web" | "mobile",
) {
  const { refreshToken, ...data } = result;
  return clientType === "mobile" ? { ...data, refreshToken } : data;
}

export function createAuthRouter(options: AuthRouterOptions): Router {
  const router = Router();

  router.post("/login", async (request, response) => {
    const input = LoginRequestSchema.parse(request.body);
    if (input.clientType === "web") checkWebOrigin(request.get("origin"), options.webOrigin);

    const result = await options.auth.login(input);
    if (input.clientType === "web") setRefreshCookie(response, result.refreshToken, options);
    response.status(200).json({ data: publicAuthData(result, input.clientType) });
  });

  router.post("/refresh", async (request, response) => {
    const input = RefreshRequestSchema.parse(request.body);
    const refreshToken =
      input.clientType === "mobile" ? input.refreshToken : request.cookies?.[REFRESH_COOKIE];

    if (input.clientType === "web") checkWebOrigin(request.get("origin"), options.webOrigin);
    if (!refreshToken) {
      throw new AuthError(401, "INVALID_SESSION", "Session is invalid or expired.");
    }

    const result = await options.auth.refresh(refreshToken, input.clientType);
    if (input.clientType === "web") setRefreshCookie(response, result.refreshToken, options);
    response.status(200).json({ data: publicAuthData(result, input.clientType) });
  });

  router.post("/logout", async (request, response) => {
    const clientType = request.body?.clientType;
    if (clientType !== "web" && clientType !== "mobile") {
      throw new AuthError(400, "INVALID_REQUEST", "A valid clientType is required.");
    }
    if (clientType === "web") checkWebOrigin(request.get("origin"), options.webOrigin);
    const refreshToken =
      clientType === "mobile" ? request.body?.refreshToken : request.cookies?.[REFRESH_COOKIE];
    await options.auth.logout(typeof refreshToken === "string" ? refreshToken : undefined);
    clearRefreshCookie(response, options);
    response.status(204).end();
  });

  router.get("/me", async (request, response) => {
    const authorization = request.get("authorization");
    const token = authorization?.match(/^Bearer ([A-Za-z0-9._~-]+)$/)?.[1];
    if (!token) throw new AuthError(401, "UNAUTHENTICATED", "Authentication is required.");
    const user = await options.auth.authenticate(token);
    if (!user) throw new AuthError(401, "UNAUTHENTICATED", "Authentication is required.");
    response.status(200).json({ data: user });
  });

  router.post("/password/change", async (request, response) => {
    const authorization = request.get("authorization");
    const token = authorization?.match(/^Bearer ([A-Za-z0-9._~-]+)$/)?.[1];
    if (!token) throw new AuthError(401, "UNAUTHENTICATED", "Authentication is required.");
    const user = await options.auth.authenticate(token);
    if (!user) throw new AuthError(401, "UNAUTHENTICATED", "Authentication is required.");
    const input = ChangePasswordRequestSchema.parse(request.body);
    response.status(200).json({ data: await options.auth.changePassword(user.id, input.currentPassword, input.newPassword) });
  });

  return router;
}
