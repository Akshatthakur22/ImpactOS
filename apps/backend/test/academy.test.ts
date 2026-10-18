import { readdir, readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePGlite } from "drizzle-orm/pglite";
import request from "supertest";
import type { PublicUser } from "@sportdesk/contracts";
import type { Database } from "../src/db/client.js";
import { createAcademyRepository } from "../src/db/academy.repository.js";
import { createApp } from "../src/app.js";
import type { SportDeskAuthService } from "../src/modules/auth/auth.service.js";
import { createAcademyService } from "../src/modules/academy/academy.service.js";

const academyId = "1121f5c1-e5e8-4c17-9df1-271cad62b265";
const ownerId = "f121f5c1-e5e8-4c17-9df1-271cad62b265";
const webOrigin = "http://localhost:3000";

const owner: PublicUser = {
  id: ownerId,
  academyId,
  email: "owner@impactfit.example",
  displayName: "Impact Owner",
  role: "owner",
  academyName: "Impact Fit Academy",
};

describe("academy records API", () => {
  const client = new PGlite();
  const app = (() => {
    const database = drizzlePGlite(client) as unknown as Database;
    const academy = createAcademyService(createAcademyRepository(database));
    const auth = {
      async authenticate(token: string) {
        if (token === "owner-token") return owner;
        if (token === "staff-token")
          return { ...owner, id: "e121f5c1-e5e8-4c17-9df1-271cad62b265", role: "staff" as const };
        return null;
      },
    } as unknown as SportDeskAuthService;
    return createApp({
      auth,
      academy,
      webOrigin,
      secureCookies: false,
      sessionTtlDays: 30,
    });
  })();

  beforeAll(async () => {
    const migrationDirectory = new URL("../drizzle/", import.meta.url);
    const migrations = (await readdir(migrationDirectory))
      .filter((file) => /^\d+.*\.sql$/.test(file))
      .sort();
    for (const file of migrations) {
      const migration = await readFile(new URL(file, migrationDirectory), "utf8");
      await client.exec(migration.replaceAll("--> statement-breakpoint", ""));
    }
    await client.query("INSERT INTO academies (id, name, slug) VALUES ($1, $2, $3)", [
      academyId,
      "Impact Fit Academy",
      "impact-fit-academy",
    ]);
    await client.query(
      "INSERT INTO users (id, academy_id, email, password_hash, display_name, role) VALUES ($1, $2, $3, $4, $5, $6)",
      [ownerId, academyId, owner.email, "synthetic-hash", owner.displayName, "owner"],
    );
  });

  afterAll(async () => {
    await client.close();
  });

  it("scopes access, configures a batch, and atomically registers a student, guardian, and enrollment", async () => {
    const anonymous = await request(app).get("/api/v1/students");
    expect(anonymous.status).toBe(401);

    const staff = await request(app)
      .get("/api/v1/students")
      .set("Authorization", "Bearer staff-token");
    expect(staff.status).toBe(403);

    const discipline = await request(app)
      .post("/api/v1/disciplines")
      .set("Authorization", "Bearer owner-token")
      .send({ name: "Wushu" });
    expect(discipline.status).toBe(201);
    const disciplineId = discipline.body.data.id as string;

    const duplicateDiscipline = await request(app)
      .post("/api/v1/disciplines")
      .set("Authorization", "Bearer owner-token")
      .send({ name: "wushu" });
    expect(duplicateDiscipline.status).toBe(409);

    const program = await request(app)
      .post("/api/v1/programs")
      .set("Authorization", "Bearer owner-token")
      .send({ name: "Foundations", disciplineId });
    expect(program.status).toBe(201);

    const batch = await request(app)
      .post("/api/v1/batches")
      .set("Authorization", "Bearer owner-token")
      .send({ name: "Morning group", programId: program.body.data.id, capacity: 1 });
    expect(batch.status).toBe(201);

    const student = await request(app)
      .post("/api/v1/students")
      .set("Authorization", "Bearer owner-token")
      .send({
        firstName: "Aarav",
        lastName: "Mehta",
        status: "active",
        guardian: {
          name: "Nisha Mehta",
          relationship: "Parent",
          email: "nisha@example.test",
          phone: "+919876543210",
        },
        batchId: batch.body.data.id,
      });
    expect(student.status).toBe(201);
    expect(student.body.data).toMatchObject({
      firstName: "Aarav",
      lastName: "Mehta",
      guardians: [{ name: "Nisha Mehta", relationship: "Parent" }],
      enrollments: [{ batchName: "Morning group", programName: "Foundations", status: "active" }],
    });

    const catalog = await request(app)
      .get("/api/v1/academy/catalog")
      .set("Authorization", "Bearer owner-token");
    expect(catalog.body.data.batches[0]).toMatchObject({
      name: "Morning group",
      activeEnrollmentCount: 1,
      capacity: 1,
    });

    const fullBatchStudent = await request(app)
      .post("/api/v1/students")
      .set("Authorization", "Bearer owner-token")
      .send({ firstName: "Mira", lastName: "Shah", batchId: batch.body.data.id });
    expect(fullBatchStudent.status).toBe(409);
    expect(fullBatchStudent.body.error.code).toBe("BATCH_FULL");

    const studentList = await request(app)
      .get("/api/v1/students")
      .set("Authorization", "Bearer owner-token");
    expect(studentList.body.data.students).toHaveLength(1);

    const duplicateEnrollment = await request(app)
      .post(`/api/v1/students/${student.body.data.id}/enrollments`)
      .set("Authorization", "Bearer owner-token")
      .send({ batchId: batch.body.data.id });
    expect(duplicateEnrollment.status).toBe(409);
    expect(duplicateEnrollment.body.error.code).toBe("ALREADY_ENROLLED");
  });

  it("does not allow a request to link records from another academy", async () => {
    const otherAcademyId = "d121f5c1-e5e8-4c17-9df1-271cad62b265";
    const otherOwnerId = "c121f5c1-e5e8-4c17-9df1-271cad62b265";
    await client.query("INSERT INTO academies (id, name, slug) VALUES ($1, $2, $3)", [
      otherAcademyId,
      "Other Academy",
      "other-academy",
    ]);
    await client.query(
      "INSERT INTO users (id, academy_id, email, password_hash, display_name, role) VALUES ($1, $2, $3, $4, $5, $6)",
      [otherOwnerId, otherAcademyId, "other@example.test", "hash", "Other Owner", "owner"],
    );
    const otherDiscipline = await client.query<{ id: string }>(
      "INSERT INTO disciplines (academy_id, name, created_by) VALUES ($1, $2, $3) RETURNING id",
      [otherAcademyId, "Gymnastics", otherOwnerId],
    );

    const response = await request(app)
      .post("/api/v1/programs")
      .set("Authorization", "Bearer owner-token")
      .send({ name: "Other academy program", disciplineId: otherDiscipline.rows[0]?.id });
    expect(response.status).toBe(404);
  });
});
