import { readdir, readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePGlite } from "drizzle-orm/pglite";
import request from "supertest";
import type { Database } from "../src/db/client.js";
import { createUsersRepository } from "../src/db/users.repository.js";
import { createUsersService } from "../src/modules/users/users.service.js";
import { createApp } from "../src/app.js";
import type { SportDeskAuthService } from "../src/modules/auth/auth.service.js";
import type { PublicUser } from "@sportdesk/contracts";

const academyId = "ae41f5c1-e5e8-4c17-9df1-271cad62b265";
const ownerId = "af41f5c1-e5e8-4c17-9df1-271cad62b265";

describe("staff lifecycle and password recovery", () => {
  const database = new PGlite();
  const db = drizzlePGlite(database) as unknown as Database;
  const repository = createUsersRepository(db);
  let deliveredUrl = "";
  const users = createUsersService(
    repository,
    { hash: async (value) => `hash:${value}` },
    {
      webOrigin: "https://academy.example",
      sendPasswordResetEmail: async ({ resetUrl }) => {
        deliveredUrl = resetUrl;
      },
    },
  );
  const owner: PublicUser = {
    id: ownerId,
    academyId,
    email: "owner@account.test",
    displayName: "Owner",
    role: "owner",
    academyName: "Account Test",
    permissions: [],
  };
  const app = createApp({
    auth: {
      async authenticate(token: string) {
        return token === "owner-token"
          ? owner
          : token === "staff-token"
            ? {
                ...owner,
                id: "ab41f5c1-e5e8-4c17-9df1-271cad62b265",
                role: "staff",
                permissions: ["students:read"],
              }
            : null;
      },
    } as unknown as SportDeskAuthService,
    users,
    webOrigin: "http://localhost:3000",
    secureCookies: false,
    sessionTtlDays: 30,
  });

  beforeAll(async () => {
    const migrationDirectory = new URL("../drizzle/", import.meta.url);
    const migrations = (await readdir(migrationDirectory))
      .filter((file) => /^\d+.*\.sql$/.test(file))
      .sort();
    for (const file of migrations) {
      const migration = await readFile(new URL(file, migrationDirectory), "utf8");
      await database.exec(migration.replaceAll("--> statement-breakpoint", ""));
    }
    await database.query("INSERT INTO academies (id, name, slug) VALUES ($1, $2, $3)", [
      academyId,
      "Account Test",
      "account-test",
    ]);
    await database.query(
      "INSERT INTO users (id, academy_id, email, password_hash, display_name, role) VALUES ($1, $2, $3, $4, $5, 'owner')",
      [ownerId, academyId, "owner@account.test", "hash:owner", "Owner"],
    );
  });

  afterAll(async () => {
    await database.close();
  });

  it("restricts staff account administration to owners while keeping password reset public", async () => {
    expect((await request(app).get("/api/v1/staff")).status).toBe(401);
    expect(
      (await request(app).get("/api/v1/staff").set("Authorization", "Bearer staff-token")).status,
    ).toBe(403);
    expect(
      (await request(app).get("/api/v1/staff").set("Authorization", "Bearer owner-token")).status,
    ).toBe(200);
    const missing = await request(app)
      .post("/api/v1/auth/password-reset/request")
      .send({ email: "missing@account.test" });
    expect(missing.status).toBe(200);
    expect(missing.body.data.message).toContain("If an active account");
  });

  it("creates staff with academy-scoped grants and allows owners to revise grants or deactivate sessions", async () => {
    const created = await users.createStaff({
      academyId,
      createdBy: ownerId,
      email: "coach-admin@account.test",
      displayName: "Coach Admin",
      initialPassword: "initial-password-long",
      permissions: ["students:read", "attendance:read"],
    });
    const staff = created.staff[0];
    expect(staff?.permissions).toEqual(["attendance:read", "students:read"]);
    const sessionId = "b141f5c1-e5e8-4c17-9df1-271cad62b265";
    await database.query(
      "INSERT INTO auth_sessions (id, user_id, refresh_token_hash, expires_at) VALUES ($1, $2, $3, now() + interval '1 day')",
      [sessionId, staff?.id, "f".repeat(64)],
    );
    await users.updateStaff({
      academyId,
      staffId: staff!.id,
      updatedBy: ownerId,
      changes: { permissions: ["coaches:read"] },
    });
    expect((await users.listStaff(academyId)).staff[0]?.permissions).toEqual(["coaches:read"]);
    await users.updateStaff({
      academyId,
      staffId: staff!.id,
      updatedBy: ownerId,
      changes: { isActive: false },
    });
    const sessions = await database.query<{ revoked_at: Date | null }>(
      "SELECT revoked_at FROM auth_sessions WHERE id = $1",
      [sessionId],
    );
    expect(sessions.rows[0]?.revoked_at).not.toBeNull();
  });

  it("sends hashed, expiring reset tokens and accepts them once while revoking sessions", async () => {
    await users.requestPasswordReset("owner@account.test");
    expect(deliveredUrl).toContain("https://academy.example/reset-password?token=");
    const token = new URL(deliveredUrl).searchParams.get("token");
    expect(token).toBeTruthy();
    const changed = await users.resetPassword(token!, "a-new-strong-password");
    expect(changed.message).toContain("updated");
    await expect(users.resetPassword(token!, "another-strong-password")).rejects.toMatchObject({
      code: "INVALID_RESET_TOKEN",
    });
    const rows = await database.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id = $1",
      [ownerId],
    );
    expect(rows.rows[0]?.password_hash).toBe("hash:a-new-strong-password");
  });
});
