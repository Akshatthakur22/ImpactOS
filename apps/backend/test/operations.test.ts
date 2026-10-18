import { readdir, readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePGlite } from "drizzle-orm/pglite";
import request from "supertest";
import type { PublicUser } from "@sportdesk/contracts";
import type { Database } from "../src/db/client.js";
import { createOperationsRepository } from "../src/db/operations.repository.js";
import { createOperationsService } from "../src/modules/operations/operations.service.js";
import { createApp } from "../src/app.js";
import type { SportDeskAuthService } from "../src/modules/auth/auth.service.js";

const academyId = "1121f5c1-e5e8-4c17-9df1-271cad62b265";
const ownerId = "f121f5c1-e5e8-4c17-9df1-271cad62b265";
const programId = "a121f5c1-e5e8-4c17-9df1-271cad62b265";
const batchId = "b121f5c1-e5e8-4c17-9df1-271cad62b265";
const studentId = "c121f5c1-e5e8-4c17-9df1-271cad62b265";
const secondStudentId = "d121f5c1-e5e8-4c17-9df1-271cad62b265";
const webOrigin = "http://localhost:3000";

const owner: PublicUser = {
  id: ownerId,
  academyId,
  email: "owner@impactfit.example",
  displayName: "Impact Owner",
  role: "owner",
  academyName: "Impact Fit Academy",
};

describe("Phase 1 operations API", () => {
  const client = new PGlite();
  let coach: PublicUser | null = null;
  const app = (() => {
    const database = drizzlePGlite(client) as unknown as Database;
    const operations = createOperationsService(createOperationsRepository(database));
    const auth = {
      async authenticate(token: string) {
        if (token === "owner-token") return owner;
        if (token === "coach-token") return coach;
        return null;
      },
    } as unknown as SportDeskAuthService;
    return createApp({
      auth,
      operations,
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
    await client.query(
      "INSERT INTO disciplines (id, academy_id, name, created_by) VALUES ($1, $2, $3, $4)",
      ["e121f5c1-e5e8-4c17-9df1-271cad62b265", academyId, "Wushu", ownerId],
    );
    await client.query(
      "INSERT INTO programs (id, academy_id, discipline_id, name, created_by) VALUES ($1, $2, $3, $4, $5)",
      [programId, academyId, "e121f5c1-e5e8-4c17-9df1-271cad62b265", "Foundations", ownerId],
    );
    await client.query(
      "INSERT INTO batches (id, academy_id, program_id, name, created_by) VALUES ($1, $2, $3, $4, $5)",
      [batchId, academyId, programId, "Morning group", ownerId],
    );
    for (const [id, firstName, email] of [
      [studentId, "Aarav", "aarav@example.test"],
      [secondStudentId, "Mira", "mira@example.test"],
    ]) {
      await client.query(
        "INSERT INTO students (id, academy_id, first_name, last_name, status, created_by) VALUES ($1, $2, $3, $4, $5, $6)",
        [id, academyId, firstName, "Student", "active", ownerId],
      );
      await client.query(
        "INSERT INTO enrollments (academy_id, student_id, batch_id, created_by) VALUES ($1, $2, $3, $4)",
        [academyId, id, batchId, ownerId],
      );
      void email;
    }
  });

  afterAll(async () => {
    await client.close();
  });

  it("creates a coach, assigns a batch, creates a session, and records attendance", async () => {
    const coachResponse = await request(app)
      .post("/api/v1/coaches")
      .set("Authorization", "Bearer owner-token")
      .send({
        displayName: "Coach Priya",
        email: "priya@impactfit.example",
        password: "strong-local-coach-password",
        specializations: ["Wushu"],
      });
    expect(coachResponse.status).toBe(201);
    coach = {
      ...owner,
      id: coachResponse.body.data.userId,
      email: coachResponse.body.data.email,
      displayName: coachResponse.body.data.displayName,
      role: "coach",
    };

    const assignment = await request(app)
      .post(`/api/v1/batches/${batchId}/coaches`)
      .set("Authorization", "Bearer owner-token")
      .send({ coachId: coachResponse.body.data.id });
    expect(assignment.status).toBe(201);
    const duplicateAssignment = await request(app)
      .post(`/api/v1/batches/${batchId}/coaches`)
      .set("Authorization", "Bearer owner-token")
      .send({ coachId: coachResponse.body.data.id });
    expect(duplicateAssignment.status).toBe(201);
    expect(duplicateAssignment.body.data.id).toBe(assignment.body.data.id);

    const invalidSchedule = await request(app)
      .post("/api/v1/schedules")
      .set("Authorization", "Bearer owner-token")
      .send({ batchId, dayOfWeek: 1, startTime: "25:00", endTime: "26:00" });
    expect(invalidSchedule.status).toBe(400);

    const schedule = await request(app)
      .post("/api/v1/schedules")
      .set("Authorization", "Bearer owner-token")
      .send({ batchId, dayOfWeek: 1, startTime: "09:00", endTime: "10:00", venue: "Main hall" });
    expect(schedule.status).toBe(201);

    const session = await request(app)
      .post(`/api/v1/schedules/${schedule.body.data.id}/sessions`)
      .set("Authorization", "Bearer owner-token")
      .send({ startsAt: "2026-10-19T09:00:00.000Z", endsAt: "2026-10-19T10:00:00.000Z" });
    expect(session.status).toBe(201);

    const coachSessions = await request(app)
      .get("/api/v1/coach/me/sessions")
      .set("Authorization", "Bearer coach-token");
    expect(coachSessions.status).toBe(200);
    expect(coachSessions.body.data.sessions).toHaveLength(1);

    const roster = await request(app)
      .get(`/api/v1/coach/sessions/${session.body.data.id}/roster`)
      .set("Authorization", "Bearer coach-token");
    expect(roster.status).toBe(200);
    expect(roster.body.data.students).toHaveLength(2);

    const attendance = await request(app)
      .put(`/api/v1/coach/sessions/${session.body.data.id}/attendance`)
      .set("Authorization", "Bearer coach-token")
      .send({
        records: [
          { studentId, status: "present" },
          { studentId: secondStudentId, status: "absent" },
        ],
      });
    expect(attendance.status).toBe(200);
    expect(attendance.body.data.records).toHaveLength(2);

    const adminAttendance = await request(app)
      .get("/api/v1/attendance")
      .query({ from: "2026-10-18T00:00:00.000Z", to: "2026-10-20T00:00:00.000Z" })
      .set("Authorization", "Bearer owner-token");
    expect(adminAttendance.status).toBe(200);
    expect(adminAttendance.body.data.records).toHaveLength(2);

    const correctionTarget = adminAttendance.body.data.records.find(
      (record: { studentId: string }) => record.studentId === secondStudentId,
    );
    expect(correctionTarget).toBeDefined();
    if (!correctionTarget) throw new Error("Attendance correction target was not returned.");
    const coachCorrection = await request(app)
      .patch(`/api/v1/attendance/${correctionTarget.id}`)
      .set("Authorization", "Bearer coach-token")
      .send({ status: "present", reason: "A coach cannot correct the admin record." });
    expect(coachCorrection.status).toBe(403);

    const correction = await request(app)
      .patch(`/api/v1/attendance/${correctionTarget.id}`)
      .set("Authorization", "Bearer owner-token")
      .send({ status: "present", reason: "Coach confirmed the student arrived." });
    expect(correction.status).toBe(200);
    expect(correction.body.data.previousStatus).toBe("absent");
    expect(correction.body.data.nextStatus).toBe("present");

    const auditRows = await client.query<{
      previous_status: string;
      next_status: string;
      reason: string;
    }>(
      "SELECT previous_status, next_status, reason FROM attendance_corrections WHERE attendance_id = $1",
      [correctionTarget.id],
    );
    expect(auditRows.rows).toEqual([
      {
        previous_status: "absent",
        next_status: "present",
        reason: "Coach confirmed the student arrived.",
      },
    ]);
    const correctionHistory = await request(app)
      .get(`/api/v1/attendance/${correctionTarget.id}/corrections`)
      .set("Authorization", "Bearer owner-token");
    expect(correctionHistory.status).toBe(200);
    expect(correctionHistory.body.data.corrections[0]).toMatchObject({
      previousStatus: "absent",
      nextStatus: "present",
      reason: "Coach confirmed the student arrived.",
      correctedByName: owner.displayName,
    });

    const completed = await request(app)
      .post(`/api/v1/coach/sessions/${session.body.data.id}/complete`)
      .set("Authorization", "Bearer coach-token");
    expect(completed.status).toBe(200);
    expect(completed.body.data.status).toBe("completed");

    const afterCompletion = await request(app)
      .put(`/api/v1/coach/sessions/${session.body.data.id}/attendance`)
      .set("Authorization", "Bearer coach-token")
      .send({ records: [{ studentId, status: "late" }] });
    expect(afterCompletion.status).toBe(409);
    expect(afterCompletion.body.error.code).toBe("SESSION_CLOSED");
  });

  it("rejects a coach trying to access an unassigned session", async () => {
    const response = await request(app)
      .get("/api/v1/coach/sessions/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/roster")
      .set("Authorization", "Bearer coach-token");
    expect(response.status).toBe(403);
  });
});
