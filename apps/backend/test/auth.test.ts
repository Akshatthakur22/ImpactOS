import { describe, expect, it } from "vitest";
import request from "supertest";
import type { AuthRepository, UserWithAcademy } from "../src/db/auth.repository.js";
import { createApp } from "../src/app.js";
import { createAuthService } from "../src/modules/auth/auth.service.js";

const ownerId = "f121f5c1-e5e8-4c17-9df1-271cad62b265";
const academyId = "1121f5c1-e5e8-4c17-9df1-271cad62b265";
const webOrigin = "http://localhost:3000";

function makeHarness(role: UserWithAcademy["role"] = "owner") {
  const user: UserWithAcademy = {
    id: ownerId,
    academyId,
    email: "owner@impactfit.example",
    passwordHash: "hash:correct-password",
    displayName: "Impact Owner",
    role,
    isActive: true,
    academyName: "Impact Fit Academy",
    academyTimezone: "Asia/Kolkata",
    permissions: [],
  };
  const sessions = new Map<
    string,
    { id: string; userId: string; tokenHash: string; expiresAt: Date; revokedAt: Date | null }
  >();
  let nextTokenNumber = 0;
  const repository: AuthRepository = {
    async findUserByEmail(email) {
      return email === user.email ? user : null;
    },
    async findUserById(id) {
      return id === user.id ? user : null;
    },
    async createSession(input) {
      sessions.set(input.id, {
        id: input.id,
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        revokedAt: null,
      });
    },
    async findSessionByHash(tokenHash, now) {
      const session = [...sessions.values()].find(
        (candidate) =>
          candidate.tokenHash === tokenHash && !candidate.revokedAt && candidate.expiresAt > now,
      );
      return session ? { id: session.id, userId: session.userId } : null;
    },
    async rotateSession(input) {
      const session = [...sessions.values()].find(
        (candidate) =>
          candidate.tokenHash === input.oldHash &&
          !candidate.revokedAt &&
          candidate.expiresAt > input.now,
      );
      if (!session) return null;
      session.tokenHash = input.newHash;
      session.expiresAt = input.expiresAt;
      return { id: session.id, userId: session.userId };
    },
    async findSessionById(id, now) {
      const session = sessions.get(id);
      if (!session || session.revokedAt || session.expiresAt <= now) return null;
      return { id: session.id, userId: session.userId };
    },
    async revokeSession(tokenHash, now) {
      for (const session of sessions.values()) {
        if (session.tokenHash === tokenHash && !session.revokedAt) session.revokedAt = now;
      }
    },
    async changePassword(userId, passwordHash) {
      if (userId === user.id) user.passwordHash = passwordHash;
    },
  };

  const auth = createAuthService({
    repository,
    passwordVerifier: {
      async verify(encodedHash, password) {
        return encodedHash === `hash:${password}`;
      },
      async hash(password) {
        return `hash:${password}`;
      },
    },
    dummyPasswordHash: "dummy-hash",
    accessSecret: "test-secret-that-is-at-least-thirty-two-characters-long",
    accessTokenTtlMinutes: 15,
    sessionTtlDays: 30,
    newToken: () => `refresh-token-${String(++nextTokenNumber).padStart(40, "0")}`,
  });
  const app = createApp({ auth, webOrigin, secureCookies: false, sessionTtlDays: 30 });
  return { app, auth };
}

describe("authentication API", () => {
  it("allows localhost Expo web previews to call the API during development", async () => {
    const { app } = makeHarness();
    const preflight = await request(app)
      .options("/api/v1/auth/login")
      .set("Origin", "http://localhost:8082")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type");

    expect(preflight.status).toBe(204);
    expect(preflight.headers["access-control-allow-origin"]).toBe("http://localhost:8082");
  });

  it("allows more than ten sign-in retries in a local development app", async () => {
    const { app } = makeHarness();
    const responses = await Promise.all(
      Array.from({ length: 11 }, () =>
        request(app).post("/api/v1/auth/login").send({
          email: "missing@impactfit.example",
          password: "incorrect-password",
          clientType: "mobile",
        }),
      ),
    );

    expect(responses.every((response) => response.status === 401)).toBe(true);
  });

  it("signs in a web owner, uses an HttpOnly refresh cookie, and serves the current user", async () => {
    const { app } = makeHarness();
    const login = await request(app).post("/api/v1/auth/login").set("Origin", webOrigin).send({
      email: " OWNER@IMPACTFIT.EXAMPLE ",
      password: "correct-password",
      clientType: "web",
    });

    expect(login.status).toBe(200);
    expect(login.body.data.user).toMatchObject({
      id: ownerId,
      role: "owner",
      academyName: "Impact Fit Academy",
    });
    expect(login.body.data.refreshToken).toBeUndefined();
    const refreshCookie = login.headers["set-cookie"]?.[0] ?? "";
    expect(refreshCookie).toContain("HttpOnly");
    expect(refreshCookie).toContain("SameSite=Lax");

    const me = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${login.body.data.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe("owner@impactfit.example");
  });

  it("rotates mobile refresh tokens, rejects replay, and revokes the access session on logout", async () => {
    const { app } = makeHarness();
    const login = await request(app).post("/api/v1/auth/login").send({
      email: "owner@impactfit.example",
      password: "correct-password",
      clientType: "mobile",
    });
    expect(login.status).toBe(200);
    const originalRefreshToken = login.body.data.refreshToken as string;

    const renewed = await request(app).post("/api/v1/auth/refresh").send({
      clientType: "mobile",
      refreshToken: originalRefreshToken,
    });
    expect(renewed.status).toBe(200);
    expect(renewed.body.data.refreshToken).not.toBe(originalRefreshToken);

    const replay = await request(app).post("/api/v1/auth/refresh").send({
      clientType: "mobile",
      refreshToken: originalRefreshToken,
    });
    expect(replay.status).toBe(401);

    const logout = await request(app).post("/api/v1/auth/logout").send({
      clientType: "mobile",
      refreshToken: renewed.body.data.refreshToken,
    });
    expect(logout.status).toBe(204);

    const me = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${renewed.body.data.accessToken}`);
    expect(me.status).toBe(401);
  });

  it("requires a trusted browser origin and does not reveal whether an account exists", async () => {
    const { app } = makeHarness();
    const invalidOrigin = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", "https://untrusted.example")
      .send({ email: "owner@impactfit.example", password: "correct-password", clientType: "web" });
    expect(invalidOrigin.status).toBe(403);

    const badLogin = await request(app).post("/api/v1/auth/login").send({
      email: "nobody@impactfit.example",
      password: "wrong-password",
      clientType: "mobile",
    });
    expect(badLogin.status).toBe(401);
    expect(badLogin.body.error.message).toBe("Email or password is incorrect.");
  });

  it("keeps the admin overview owner-only", async () => {
    const { app } = makeHarness("staff");
    const login = await request(app).post("/api/v1/auth/login").send({
      email: "owner@impactfit.example",
      password: "correct-password",
      clientType: "mobile",
    });
    const response = await request(app)
      .get("/api/v1/admin/overview")
      .set("Authorization", `Bearer ${login.body.data.accessToken}`);
    expect(response.status).toBe(403);
  });

  it("lets a parent change their password and sign in with the new one", async () => {
    const { app } = makeHarness("parent");
    const login = await request(app).post("/api/v1/auth/login").send({
      email: "owner@impactfit.example",
      password: "correct-password",
      clientType: "mobile",
    });
    expect(login.status).toBe(200);

    const changed = await request(app)
      .post("/api/v1/auth/password/change")
      .set("Authorization", `Bearer ${login.body.data.accessToken}`)
      .send({
        currentPassword: "correct-password",
        newPassword: "new-secure-parent-password-2026",
      });
    expect(changed.status).toBe(200);
    expect(changed.body.data.updated).toBe(true);

    const signedIn = await request(app).post("/api/v1/auth/login").send({
      email: "owner@impactfit.example",
      password: "new-secure-parent-password-2026",
      clientType: "mobile",
    });
    expect(signedIn.status).toBe(200);
  });
});
