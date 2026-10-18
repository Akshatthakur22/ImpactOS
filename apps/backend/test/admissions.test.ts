import { readdir, readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePGlite } from "drizzle-orm/pglite";
import request from "supertest";
import type { PublicUser } from "@sportdesk/contracts";
import type { Database } from "../src/db/client.js";
import { createAdmissionsRepository } from "../src/db/admissions.repository.js";
import { createAdmissionsService } from "../src/modules/admissions/admissions.service.js";
import { createApp } from "../src/app.js";
import type { SportDeskAuthService } from "../src/modules/auth/auth.service.js";

const academyId = "1141f5c1-e5e8-4c17-9df1-271cad62b265";
const ownerId = "f141f5c1-e5e8-4c17-9df1-271cad62b265";
const disciplineId = "e141f5c1-e5e8-4c17-9df1-271cad62b265";
const programId = "a141f5c1-e5e8-4c17-9df1-271cad62b265";
const batchId = "b141f5c1-e5e8-4c17-9df1-271cad62b265";
const origin = "http://localhost:3000";

const owner: PublicUser = {
  id: ownerId,
  academyId,
  email: "admissions-owner@impactfit.example",
  displayName: "Admissions Owner",
  role: "owner",
  academyName: "Impact Fit Academy",
};

describe("admissions API", () => {
  const database = new PGlite();
  const app = (() => {
    const db = drizzlePGlite(database) as unknown as Database;
    const admissions = createAdmissionsService(createAdmissionsRepository(db));
    const auth = {
      async authenticate(token: string) {
        if (token === "owner-token") return owner;
        if (token === "coach-token")
          return { ...owner, id: "c141f5c1-e5e8-4c17-9df1-271cad62b265", role: "coach" };
        return null;
      },
    } as unknown as SportDeskAuthService;
    return createApp({
      auth,
      admissions,
      webOrigin: origin,
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
      await database.exec(migration.replaceAll("--> statement-breakpoint", ""));
    }
    await database.query("INSERT INTO academies (id, name, slug) VALUES ($1, $2, $3)", [
      academyId,
      "Impact Fit Academy",
      "impact-fit-admissions",
    ]);
    await database.query(
      "INSERT INTO users (id, academy_id, email, password_hash, display_name, role) VALUES ($1, $2, $3, $4, $5, $6)",
      [ownerId, academyId, owner.email, "synthetic-hash", owner.displayName, "owner"],
    );
    await database.query(
      "INSERT INTO disciplines (id, academy_id, name, created_by) VALUES ($1, $2, $3, $4)",
      [disciplineId, academyId, "Wushu", ownerId],
    );
    await database.query(
      "INSERT INTO programs (id, academy_id, discipline_id, name, created_by) VALUES ($1, $2, $3, $4, $5)",
      [programId, academyId, disciplineId, "Foundations", ownerId],
    );
    await database.query(
      "INSERT INTO batches (id, academy_id, program_id, name, capacity, created_by) VALUES ($1, $2, $3, $4, $5, $6)",
      [batchId, academyId, programId, "Morning group", 12, ownerId],
    );
  });

  afterAll(async () => {
    await database.close();
  });

  it("tracks a lead, records contact history, and converts it atomically to a student", async () => {
    const denied = await request(app).get("/api/v1/inquiries");
    expect(denied.status).toBe(401);
    const coachDenied = await request(app)
      .get("/api/v1/inquiries")
      .set("Authorization", "Bearer coach-token");
    expect(coachDenied.status).toBe(403);

    const invalid = await request(app)
      .post("/api/v1/inquiries")
      .set("Authorization", "Bearer owner-token")
      .send({
        studentFirstName: "Aarav",
        studentLastName: "Singh",
        contactName: "Parent",
        source: "Referral",
      });
    expect(invalid.status).toBe(400);

    const created = await request(app)
      .post("/api/v1/inquiries")
      .set("Authorization", "Bearer owner-token")
      .send({
        studentFirstName: "Aarav",
        studentLastName: "Singh",
        contactName: "Meera Singh",
        contactEmail: "meera@example.test",
        contactPhone: "+919876543210",
        source: "Referral",
        sourceDetail: "Referred by an existing family",
        programId,
        notes: "Interested in beginner classes.",
        nextFollowUpAt: "2026-10-20T10:00:00.000Z",
      });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      studentFirstName: "Aarav",
      source: "Referral",
      programName: "Foundations",
      status: "new",
      convertedStudentId: null,
      activities: [],
    });
    const inquiryId = created.body.data.id as string;

    const filtered = await request(app)
      .get("/api/v1/inquiries")
      .set("Authorization", "Bearer owner-token")
      .query({ search: "Meera", status: "new", source: "Referral", limit: 10 });
    expect(filtered.status).toBe(200);
    expect(filtered.body.data.total).toBe(1);
    expect(filtered.body.data.inquiries[0].id).toBe(inquiryId);

    const followUp = await request(app)
      .post(`/api/v1/inquiries/${inquiryId}/activities`)
      .set("Authorization", "Bearer owner-token")
      .send({
        type: "call",
        note: "Discussed class timing; family will attend a trial.",
        status: "trial_scheduled",
        nextFollowUpAt: "2026-10-22T10:00:00.000Z",
      });
    expect(followUp.status).toBe(201);
    expect(followUp.body.data.status).toBe("trial_scheduled");
    expect(followUp.body.data.activities[0]).toMatchObject({
      type: "call",
      statusBefore: "new",
      statusAfter: "trial_scheduled",
      createdByName: owner.displayName,
    });

    const converted = await request(app)
      .post(`/api/v1/inquiries/${inquiryId}/convert`)
      .set("Authorization", "Bearer owner-token")
      .send({ batchId });
    expect(converted.status).toBe(201);
    const studentId = converted.body.data.studentId as string;
    const rows = await database.query<{
      first_name: string;
      status: string;
      guardian_name: string;
      email: string;
      enrollment_status: string;
      inquiry_status: string;
      converted_student_id: string;
    }>(
      `SELECT s.first_name, s.status, g.name AS guardian_name, g.email,
        e.status AS enrollment_status, i.status AS inquiry_status, i.converted_student_id
       FROM students s
       JOIN student_guardians sg ON sg.student_id = s.id
       JOIN guardians g ON g.id = sg.guardian_id
       JOIN enrollments e ON e.student_id = s.id
       JOIN inquiries i ON i.id = $1
       WHERE s.id = $2`,
      [inquiryId, studentId],
    );
    expect(rows.rows).toEqual([
      {
        first_name: "Aarav",
        status: "active",
        guardian_name: "Meera Singh",
        email: "meera@example.test",
        enrollment_status: "active",
        inquiry_status: "converted",
        converted_student_id: studentId,
      },
    ]);

    const duplicateConversion = await request(app)
      .post(`/api/v1/inquiries/${inquiryId}/convert`)
      .set("Authorization", "Bearer owner-token")
      .send({});
    expect(duplicateConversion.status).toBe(409);
    expect(duplicateConversion.body.error.code).toBe("INQUIRY_ALREADY_CONVERTED");

    const secondInquiry = await request(app)
      .post("/api/v1/inquiries")
      .set("Authorization", "Bearer owner-token")
      .send({
        studentFirstName: "Diya",
        studentLastName: "Shah",
        contactName: "Rohan Shah",
        contactPhone: "+919876543211",
        source: "Website",
      });
    expect(secondInquiry.status).toBe(201);
    await database.query("UPDATE batches SET capacity = 1 WHERE id = $1", [batchId]);
    const fullBatchConversion = await request(app)
      .post(`/api/v1/inquiries/${secondInquiry.body.data.id}/convert`)
      .set("Authorization", "Bearer owner-token")
      .send({ batchId });
    expect(fullBatchConversion.status).toBe(409);
    expect(fullBatchConversion.body.error.code).toBe("BATCH_FULL");
    const unconverted = await request(app)
      .get(`/api/v1/inquiries/${secondInquiry.body.data.id}`)
      .set("Authorization", "Bearer owner-token");
    expect(unconverted.body.data).toMatchObject({ status: "new", convertedStudentId: null });
    const studentCount = await database.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM students WHERE academy_id = $1",
      [academyId],
    );
    expect(studentCount.rows[0]?.count).toBe(1);
  });
});
