import { readdir, readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePGlite } from "drizzle-orm/pglite";
import request from "supertest";
import type { PublicUser } from "@sportdesk/contracts";
import type { Database } from "../src/db/client.js";
import { createOperationsRepository } from "../src/db/operations.repository.js";
import { createProgressRepository } from "../src/db/progress.repository.js";
import { createProgressService } from "../src/modules/progress/progress.service.js";
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
  let operationNow = new Date("2026-10-19T09:15:00.000Z");
  const app = (() => {
    const database = drizzlePGlite(client) as unknown as Database;
    const operations = createOperationsService(createOperationsRepository(database), {
      now: () => operationNow,
    });
    const progress = createProgressService(createProgressRepository(database));
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
      progress,
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

    const branch = await request(app)
      .post("/api/v1/branches")
      .set("Authorization", "Bearer owner-token")
      .send({
        name: "Main branch",
        address: "Academy grounds",
        geofenceLatitude: 28.6139,
        geofenceLongitude: 77.209,
        geofenceRadiusMeters: 150,
      });
    expect(branch.status).toBe(201);

    const schedule = await request(app)
      .post("/api/v1/schedules")
      .set("Authorization", "Bearer owner-token")
      .send({
        batchId,
        branchId: branch.body.data.id,
        dayOfWeek: 1,
        startTime: "09:00",
        endTime: "10:00",
        venue: "Main hall",
      });
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

    const coachStudents = await request(app)
      .get("/api/v1/coach/me/students")
      .set("Authorization", "Bearer coach-token");
    expect(coachStudents.status).toBe(200);
    expect(coachStudents.body.data.students).toEqual([
      {
        studentId,
        studentName: "Aarav Student",
        batches: [{ id: batchId, name: "Morning group" }],
      },
      {
        studentId: secondStudentId,
        studentName: "Mira Student",
        batches: [{ id: batchId, name: "Morning group" }],
      },
    ]);
    const ownerCannotUseCoachRoster = await request(app)
      .get("/api/v1/coach/me/students")
      .set("Authorization", "Bearer owner-token");
    expect(ownerCannotUseCoachRoster.status).toBe(403);

    const roster = await request(app)
      .get(`/api/v1/coach/sessions/${session.body.data.id}/roster`)
      .set("Authorization", "Bearer coach-token");
    expect(roster.status).toBe(200);
    expect(roster.body.data.students).toHaveLength(2);

    operationNow = new Date("2026-10-19T07:59:00.000Z");
    const tooEarlyCheckIn = await request(app)
      .post(`/api/v1/coach/sessions/${session.body.data.id}/check-in`)
      .set("Authorization", "Bearer coach-token")
      .send({ latitude: 28.6139, longitude: 77.209, accuracyMeters: 8 });
    expect(tooEarlyCheckIn.status).toBe(409);
    expect(tooEarlyCheckIn.body.error.code).toBe("SESSION_NOT_OPEN");

    operationNow = new Date("2026-10-19T08:59:00.000Z");
    const tooEarlyCheckOut = await request(app)
      .post(`/api/v1/coach/sessions/${session.body.data.id}/check-out`)
      .set("Authorization", "Bearer coach-token");
    expect(tooEarlyCheckOut.status).toBe(409);
    expect(tooEarlyCheckOut.body.error.code).toBe("SESSION_NOT_STARTED");

    operationNow = new Date("2026-10-19T09:15:00.000Z");
    const checkIn = await request(app)
      .post(`/api/v1/coach/sessions/${session.body.data.id}/check-in`)
      .set("Authorization", "Bearer coach-token")
      .send({ latitude: 28.6139, longitude: 77.209, accuracyMeters: 8 });
    expect(checkIn.status).toBe(200);
    expect(checkIn.body.data).toEqual({
      checkedInAt: "2026-10-19T09:15:00.000Z",
      checkedOutAt: null,
    });
    const repeatedCheckIn = await request(app)
      .post(`/api/v1/coach/sessions/${session.body.data.id}/check-in`)
      .set("Authorization", "Bearer coach-token")
      .send({ latitude: 28.6139, longitude: 77.209, accuracyMeters: 8 });
    expect(repeatedCheckIn.body.data.checkedInAt).toBe("2026-10-19T09:15:00.000Z");

    const progressEntry = await request(app)
      .post(`/api/v1/coach/sessions/${session.body.data.id}/progress`)
      .set("Authorization", "Bearer coach-token")
      .send({
        studentId,
        assessmentName: "Sprint acceleration",
        value: "Improving",
        coachNote: "Good drive phase",
        parentVisible: true,
      });
    expect(progressEntry.status).toBe(201);
    const progressReview = await request(app)
      .get("/api/v1/progress")
      .set("Authorization", "Bearer owner-token");
    expect(progressReview.status).toBe(200);
    expect(progressReview.body.data.entries[0]).toMatchObject({
      studentId,
      sportName: "Wushu",
      assessmentName: "Sprint acceleration",
      value: "Improving",
      parentVisible: true,
    });

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

    operationNow = new Date("2026-10-19T10:05:00.000Z");
    const checkOut = await request(app)
      .post(`/api/v1/coach/sessions/${session.body.data.id}/check-out`)
      .set("Authorization", "Bearer coach-token");
    expect(checkOut.status).toBe(200);
    expect(checkOut.body.data.checkedOutAt).toBe("2026-10-19T10:05:00.000Z");
    operationNow = new Date("2026-10-19T10:15:00.000Z");
    const repeatedCheckOut = await request(app)
      .post(`/api/v1/coach/sessions/${session.body.data.id}/check-out`)
      .set("Authorization", "Bearer coach-token");
    expect(repeatedCheckOut.body.data.checkedOutAt).toBe("2026-10-19T10:05:00.000Z");

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
    const completedRoster = await request(app)
      .get(`/api/v1/coach/sessions/${session.body.data.id}/roster`)
      .set("Authorization", "Bearer coach-token");
    expect(completedRoster.status).toBe(200);
    expect(completedRoster.body.data.students).toHaveLength(2);
    expect(
      completedRoster.body.data.students.every(
        (student: { status: string | null }) => student.status,
      ),
    ).toBe(true);

    const coachHistory = await request(app)
      .get(`/api/v1/coach/students/${studentId}/history`)
      .set("Authorization", "Bearer coach-token");
    expect(coachHistory.status).toBe(200);
    expect(coachHistory.body.data.attendance).toHaveLength(1);
    expect(coachHistory.body.data.progress).toHaveLength(1);

    const weeklyFeedback = await request(app)
      .put(`/api/v1/coach/students/${studentId}/feedback`)
      .set("Authorization", "Bearer coach-token")
      .send({
        weekOf: "2026-10-19",
        performance: "Strong focus and footwork.",
        guidance: "Practice balance drills.",
      });
    expect(weeklyFeedback.status).toBe(200);
    expect(weeklyFeedback.body.data).toMatchObject({
      studentId,
      weekOf: "2026-10-19",
      performance: "Strong focus and footwork.",
      guidance: "Practice balance drills.",
    });
    const revisedFeedback = await request(app)
      .put(`/api/v1/coach/students/${studentId}/feedback`)
      .set("Authorization", "Bearer coach-token")
      .send({
        weekOf: "2026-10-19",
        performance: "Strong focus, footwork, and speed.",
        guidance: "Continue balance drills.",
      });
    expect(revisedFeedback.status).toBe(200);
    const feedbackHistory = await request(app)
      .get(`/api/v1/coach/students/${studentId}/feedback`)
      .set("Authorization", "Bearer coach-token");
    expect(feedbackHistory.body.data.entries).toHaveLength(1);
    expect(feedbackHistory.body.data.entries[0].performance).toBe(
      "Strong focus, footwork, and speed.",
    );
    const ownerCannotReadCoachHistory = await request(app)
      .get(`/api/v1/coach/students/${studentId}/history`)
      .set("Authorization", "Bearer owner-token");
    expect(ownerCannotReadCoachHistory.status).toBe(403);
    const coachProfile = await request(app)
      .put("/api/v1/coach/me/profile")
      .set("Authorization", "Bearer coach-token")
      .send({ displayName: "Coach Priya Rao" });
    expect(coachProfile.status).toBe(200);
    expect(coachProfile.body.data).toMatchObject({
      displayName: "Coach Priya Rao",
      email: "priya@impactfit.example",
    });

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

  it("generates idempotent academy-timezone occurrences and manages schedules and sessions safely", async () => {
    const schedule = await request(app)
      .post("/api/v1/schedules")
      .set("Authorization", "Bearer owner-token")
      .send({ batchId, dayOfWeek: 2, startTime: "09:00", endTime: "10:00", venue: "Studio B" });
    expect(schedule.status).toBe(201);

    const generation = await request(app)
      .post("/api/v1/schedules/generate-sessions")
      .set("Authorization", "Bearer owner-token")
      .send({ from: "2026-10-20", to: "2026-10-27" });
    expect(generation.status).toBe(200);
    expect(generation.body.data.createdCount).toBe(3);
    const repeated = await request(app)
      .post("/api/v1/schedules/generate-sessions")
      .set("Authorization", "Bearer owner-token")
      .send({ from: "2026-10-20", to: "2026-10-27" });
    expect(repeated.body.data.createdCount).toBe(0);

    const sessions = await request(app)
      .get("/api/v1/sessions?from=2026-10-20T00:00:00.000Z&to=2026-10-28T00:00:00.000Z")
      .set("Authorization", "Bearer owner-token");
    expect(sessions.status).toBe(200);
    const created = sessions.body.data.sessions as Array<{
      id: string;
      startsAt: string;
      endsAt: string;
      status: string;
    }>;
    expect(created).toHaveLength(3);
    expect(created[0]?.startsAt).toBe("2026-10-20T03:30:00.000Z");

    const attendanceQueue = await request(app)
      .get("/api/v1/attendance/sessions?from=2026-10-20T00:00:00.000Z&to=2026-10-28T00:00:00.000Z")
      .set("Authorization", "Bearer owner-token");
    expect(attendanceQueue.status).toBe(200);
    expect(attendanceQueue.body.data.sessions).toHaveLength(3);
    expect(attendanceQueue.body.data.sessions[0]).toMatchObject({
      expectedCount: 2,
      markedCount: 0,
      coachPresence: [{ coachName: "Coach Priya Rao", checkedInAt: null, checkedOutAt: null }],
    });

    const moved = await request(app)
      .patch(`/api/v1/sessions/${created[0]?.id}`)
      .set("Authorization", "Bearer owner-token")
      .send({ startsAt: "2026-10-20T04:30:00.000Z", endsAt: "2026-10-20T05:30:00.000Z" });
    expect(moved.status).toBe(200);
    expect(moved.body.data.startsAt).toBe("2026-10-20T04:30:00.000Z");

    const cancelled = await request(app)
      .post(`/api/v1/sessions/${created[1]?.id}/cancel`)
      .set("Authorization", "Bearer owner-token");
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe("cancelled");
    expect(
      (
        await request(app)
          .patch(`/api/v1/sessions/${created[1]?.id}`)
          .set("Authorization", "Bearer owner-token")
          .send({ startsAt: "2026-10-27T04:30:00.000Z", endsAt: "2026-10-27T05:30:00.000Z" })
      ).status,
    ).toBe(409);

    const edited = await request(app)
      .patch(`/api/v1/schedules/${schedule.body.data.id}`)
      .set("Authorization", "Bearer owner-token")
      .send({ dayOfWeek: 4, startTime: "08:00", endTime: "09:00", venue: "Studio C" });
    expect(edited.status).toBe(200);
    expect(edited.body.data.venue).toBe("Studio C");
    const deactivated = await request(app)
      .patch(`/api/v1/schedules/${schedule.body.data.id}`)
      .set("Authorization", "Bearer owner-token")
      .send({ isActive: false });
    expect(deactivated.body.data.isActive).toBe(false);
    const suppressed = await request(app)
      .post("/api/v1/schedules/generate-sessions")
      .set("Authorization", "Bearer owner-token")
      .send({ from: "2026-10-29", to: "2026-11-05" });
    expect(suppressed.body.data.createdCount).toBe(1);
  });
});
