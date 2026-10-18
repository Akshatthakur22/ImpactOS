import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePGlite } from "drizzle-orm/pglite";
import type { Database } from "../src/db/client.js";
import { createAuthRepository } from "../src/db/auth.repository.js";

describe("PostgreSQL auth repository", () => {
  const client = new PGlite();
  let repository: ReturnType<typeof createAuthRepository>;

  beforeAll(async () => {
    const migration = await readFile(
      new URL("../drizzle/0000_foundation.sql", import.meta.url),
      "utf8",
    );
    await client.exec(migration.replaceAll("--> statement-breakpoint", ""));
    const database = drizzlePGlite(client) as unknown as Database;
    repository = createAuthRepository(database);
    await client.query("INSERT INTO academies (id, name, slug) VALUES ($1, $2, $3)", [
      "1121f5c1-e5e8-4c17-9df1-271cad62b265",
      "Impact Fit Academy",
      "impact-fit-academy",
    ]);
    await client.query(
      "INSERT INTO users (id, academy_id, email, password_hash, display_name, role) VALUES ($1, $2, $3, $4, $5, $6)",
      [
        "f121f5c1-e5e8-4c17-9df1-271cad62b265",
        "1121f5c1-e5e8-4c17-9df1-271cad62b265",
        "owner@impactfit.example",
        "synthetic-hash",
        "Impact Owner",
        "owner",
      ],
    );
  });

  afterAll(async () => {
    await client.close();
  });

  it("loads a user with trusted academy context and rotates/revokes refresh hashes", async () => {
    const user = await repository.findUserByEmail("owner@impactfit.example");
    expect(user).toMatchObject({ role: "owner", academyName: "Impact Fit Academy" });
    if (!user) throw new Error("Test fixture did not load.");

    const now = new Date("2026-10-17T12:00:00.000Z");
    const expiresAt = new Date("2026-11-17T12:00:00.000Z");
    await repository.createSession({
      id: "2121f5c1-e5e8-4c17-9df1-271cad62b265",
      userId: user.id,
      tokenHash: "a".repeat(64),
      expiresAt,
      now,
    });

    const activeSession = await repository.findSessionByHash("a".repeat(64), now);
    expect(activeSession?.userId).toBe(user.id);

    const rotated = await repository.rotateSession({
      oldHash: "a".repeat(64),
      newHash: "b".repeat(64),
      expiresAt,
      now,
    });
    expect(rotated?.id).toBe("2121f5c1-e5e8-4c17-9df1-271cad62b265");
    expect(await repository.findSessionByHash("a".repeat(64), now)).toBeNull();
    expect(await repository.findSessionByHash("b".repeat(64), now)).not.toBeNull();

    await repository.revokeSession("b".repeat(64), now);
    expect(await repository.findSessionById(rotated!.id, now)).toBeNull();
  });
});
