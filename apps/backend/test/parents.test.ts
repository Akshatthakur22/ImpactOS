import { readdir, readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePGlite } from "drizzle-orm/pglite";
import request from "supertest";
import type { PublicUser } from "@sportdesk/contracts";
import type { Database } from "../src/db/client.js";
import { createParentRepository } from "../src/db/parent.repository.js";
import { createParentsService } from "../src/modules/parents/parents.service.js";
import { createFinanceRepository } from "../src/db/finance.repository.js";
import { createFinanceService } from "../src/modules/finance/finance.service.js";
import { createAnnouncementsRepository } from "../src/db/announcements.repository.js";
import { createAnnouncementsService } from "../src/modules/announcements/announcements.service.js";
import { createProgressRepository } from "../src/db/progress.repository.js";
import { createProgressService } from "../src/modules/progress/progress.service.js";
import { createApp } from "../src/app.js";
import type { SportDeskAuthService } from "../src/modules/auth/auth.service.js";

const academyId = "1121f5c1-e5e8-4c17-9df1-271cad62b265";
const ownerId = "f121f5c1-e5e8-4c17-9df1-271cad62b265";
const programId = "a121f5c1-e5e8-4c17-9df1-271cad62b265";
const batchId = "b121f5c1-e5e8-4c17-9df1-271cad62b265";
const firstStudentId = "c121f5c1-e5e8-4c17-9df1-271cad62b265";
const secondStudentId = "d121f5c1-e5e8-4c17-9df1-271cad62b265";
const unlinkedStudentId = "e121f5c1-e5e8-4c17-9df1-271cad62b265";
const firstGuardianId = "0121f5c1-e5e8-4c17-9df1-271cad62b265";
const secondGuardianId = "0221f5c1-e5e8-4c17-9df1-271cad62b265";
const unlinkedGuardianId = "0321f5c1-e5e8-4c17-9df1-271cad62b265";
const scheduleId = "0421f5c1-e5e8-4c17-9df1-271cad62b265";
const sessionId = "0521f5c1-e5e8-4c17-9df1-271cad62b265";
const attendanceId = "0621f5c1-e5e8-4c17-9df1-271cad62b265";
const announcementId = "0821f5c1-e5e8-4c17-9df1-271cad62b265";
const feeChargeId = "0921f5c1-e5e8-4c17-9df1-271cad62b265";
const visibleProgressId = "0a21f5c1-e5e8-4c17-9df1-271cad62b265";
const hiddenProgressId = "0b21f5c1-e5e8-4c17-9df1-271cad62b265";

const owner: PublicUser = {
  id: ownerId,
  academyId,
  email: "owner@impactfit.example",
  displayName: "Impact Owner",
  role: "owner",
  academyName: "Impact Fit Academy",
};

describe("parent access", () => {
  const client = new PGlite();
  let parent: PublicUser | null = null;
  const app = (() => {
    const database = drizzlePGlite(client) as unknown as Database;
    const parents = createParentsService(createParentRepository(database));
    const finance = createFinanceService(createFinanceRepository(database));
    const announcements = createAnnouncementsService(createAnnouncementsRepository(database));
    const progress = createProgressService(createProgressRepository(database));
    const auth = {
      async authenticate(token: string) {
        if (token === "owner-token") return owner;
        if (token === "parent-token") return parent;
        return null;
      },
    } as unknown as SportDeskAuthService;
    return createApp({
      auth,
      parents,
      finance,
      announcements,
      progress,
      webOrigin: "http://localhost:3000",
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
      ["0721f5c1-e5e8-4c17-9df1-271cad62b265", academyId, "Wushu", ownerId],
    );
    await client.query(
      "INSERT INTO programs (id, academy_id, discipline_id, name, created_by) VALUES ($1, $2, $3, $4, $5)",
      [programId, academyId, "0721f5c1-e5e8-4c17-9df1-271cad62b265", "Foundations", ownerId],
    );
    await client.query(
      "INSERT INTO batches (id, academy_id, program_id, name, created_by) VALUES ($1, $2, $3, $4, $5)",
      [batchId, academyId, programId, "Morning group", ownerId],
    );
    for (const [id, firstName] of [
      [firstStudentId, "Aarav"],
      [secondStudentId, "Mira"],
      [unlinkedStudentId, "Dev"],
    ]) {
      await client.query(
        "INSERT INTO students (id, academy_id, first_name, last_name, status, created_by) VALUES ($1, $2, $3, $4, $5, $6)",
        [id, academyId, firstName, "Student", "active", ownerId],
      );
      await client.query(
        "INSERT INTO enrollments (academy_id, student_id, batch_id, created_by) VALUES ($1, $2, $3, $4)",
        [academyId, id, batchId, ownerId],
      );
    }
    for (const [id, name, email] of [
      [firstGuardianId, "Aarav Parent", "parent@example.test"],
      [secondGuardianId, "Mira Parent", "parent@example.test"],
      [unlinkedGuardianId, "Dev Parent", "other-parent@example.test"],
    ]) {
      await client.query(
        "INSERT INTO guardians (id, academy_id, name, email, created_by) VALUES ($1, $2, $3, $4, $5)",
        [id, academyId, name, email, ownerId],
      );
    }
    await client.query(
      "INSERT INTO student_guardians (academy_id, student_id, guardian_id, relationship) VALUES ($1, $2, $3, $4), ($1, $5, $6, $4), ($1, $7, $8, $4)",
      [
        academyId,
        firstStudentId,
        firstGuardianId,
        "Parent",
        secondStudentId,
        secondGuardianId,
        unlinkedStudentId,
        unlinkedGuardianId,
      ],
    );
    await client.query(
      "INSERT INTO batch_schedules (id, academy_id, batch_id, day_of_week, start_time, end_time, created_by) VALUES ($1, $2, $3, 1, '09:00', '10:00', $4)",
      [scheduleId, academyId, batchId, ownerId],
    );
    await client.query(
      "INSERT INTO training_sessions (id, academy_id, batch_id, schedule_id, starts_at, ends_at, created_by) VALUES ($1, $2, $3, $4, '2026-10-19T09:00:00.000Z', '2026-10-19T10:00:00.000Z', $5)",
      [sessionId, academyId, batchId, scheduleId, ownerId],
    );
    await client.query(
      "INSERT INTO attendance_records (id, academy_id, session_id, student_id, status, recorded_by) VALUES ($1, $2, $3, $4, 'present', $5)",
      [attendanceId, academyId, sessionId, firstStudentId, ownerId],
    );
    await client.query(
      "INSERT INTO fee_charges (id, academy_id, student_id, invoice_number, description, due_date, amount_paise, currency, created_by) VALUES ($1, $2, $3, 'INV-TEST-01', 'Monthly training fee', '2026-11-01', 250000, 'INR', $4)",
      [feeChargeId, academyId, firstStudentId, ownerId],
    );
    await client.query(
      "INSERT INTO academy_announcements (id, academy_id, title, body, audience, status, created_by, published_at) VALUES ($1, $2, 'Welcome back', 'Training resumes Monday.', 'parents', 'published', $3, now())",
      [announcementId, academyId, ownerId],
    );
    await client.query(
      "INSERT INTO progress_entries (id, academy_id, student_id, session_id, coach_id, assessment_name, value, coach_note, parent_visible) VALUES ($1, $2, $3, $4, $5, 'Balance', 'Improving', 'Great focus today.', true), ($6, $2, $3, $4, $5, 'Internal review', null, 'Coach-only note.', false)",
      [visibleProgressId, academyId, firstStudentId, sessionId, ownerId, hiddenProgressId],
    );
  });

  afterAll(async () => {
    await client.close();
  });

  it("links parent accounts through one-time invites and scopes mobile reads to linked children", async () => {
    const firstInvite = await request(app)
      .post(`/api/v1/guardians/${firstGuardianId}/invites`)
      .set("Authorization", "Bearer owner-token")
      .send({});
    expect(firstInvite.status).toBe(201);
    expect(firstInvite.body.data.token).toHaveLength(43);

    const firstRedeem = await request(app)
      .post("/api/v1/parent-invites/redeem")
      .send({ token: firstInvite.body.data.token, password: "safe-parent-password-2026" });
    expect(firstRedeem.status).toBe(200);
    expect(firstRedeem.body.data.email).toBe("parent@example.test");

    const parentRow = await client.query<{ id: string; email: string }>(
      "SELECT id, email FROM users WHERE email = 'parent@example.test'",
    );
    const parentId = parentRow.rows[0]?.id;
    if (!parentId) throw new Error("Parent account was not created.");
    parent = {
      id: parentId,
      academyId,
      email: "parent@example.test",
      displayName: "Aarav Parent",
      role: "parent",
      academyName: "Impact Fit Academy",
    };

    const secondInvite = await request(app)
      .post(`/api/v1/guardians/${secondGuardianId}/invites`)
      .set("Authorization", "Bearer owner-token")
      .send({});
    expect(secondInvite.status).toBe(201);
    const secondRedeem = await request(app)
      .post("/api/v1/parent-invites/redeem")
      .send({ token: secondInvite.body.data.token, password: "safe-parent-password-2026" });
    expect(secondRedeem.status).toBe(200);

    const linkedChildren = await request(app)
      .get("/api/v1/parent/me/students")
      .set("Authorization", "Bearer parent-token");
    expect(linkedChildren.status).toBe(200);
    expect(
      linkedChildren.body.data.students.map((student: { id: string }) => student.id).sort(),
    ).toEqual([firstStudentId, secondStudentId].sort());

    const schedule = await request(app)
      .get(`/api/v1/parent/students/${firstStudentId}/schedule`)
      .set("Authorization", "Bearer parent-token");
    expect(schedule.status).toBe(200);
    expect(schedule.body.data.schedules).toHaveLength(1);
    expect(schedule.body.data.schedules[0].batchId).toBe(batchId);

    const history = await request(app)
      .get(`/api/v1/parent/students/${firstStudentId}/attendance`)
      .set("Authorization", "Bearer parent-token");
    expect(history.status).toBe(200);
    expect(history.body.data.records).toHaveLength(1);
    expect(history.body.data.records[0].status).toBe("present");

    const finance = await request(app)
      .get(`/api/v1/parent/students/${firstStudentId}/finance`)
      .set("Authorization", "Bearer parent-token");
    expect(finance.status).toBe(200);
    expect(finance.body.data.currency).toBe("INR");
    expect(finance.body.data.charges).toHaveLength(1);
    expect(finance.body.data.charges[0].balancePaise).toBe(250000);

    const progress = await request(app)
      .get(`/api/v1/parent/students/${firstStudentId}/progress`)
      .set("Authorization", "Bearer parent-token");
    expect(progress.status).toBe(200);
    expect(progress.body.data.entries).toHaveLength(1);
    expect(progress.body.data.entries[0].id).toBe(visibleProgressId);
    expect(progress.body.data.entries[0].coachNote).toBe("Great focus today.");

    const notices = await request(app)
      .get("/api/v1/parent/announcements")
      .set("Authorization", "Bearer parent-token");
    expect(notices.status).toBe(200);
    expect(notices.body.data.announcements).toHaveLength(1);
    expect(notices.body.data.announcements[0].id).toBe(announcementId);
    expect(notices.body.data.announcements[0].readAt).toBeNull();
    const markNoticeRead = await request(app)
      .post(`/api/v1/parent/announcements/${announcementId}/read`)
      .set("Authorization", "Bearer parent-token");
    expect(markNoticeRead.status).toBe(200);
    const readNotices = await request(app)
      .get("/api/v1/parent/announcements")
      .set("Authorization", "Bearer parent-token");
    expect(readNotices.body.data.announcements[0].readAt).toEqual(expect.any(String));

    const profile = await request(app)
      .get("/api/v1/parent/me/profile")
      .set("Authorization", "Bearer parent-token");
    expect(profile.status).toBe(200);
    expect(profile.body.data).toEqual({ displayName: "Aarav Parent", phone: null });

    const profileUpdate = await request(app)
      .patch("/api/v1/parent/me/profile")
      .set("Authorization", "Bearer parent-token")
      .send({ displayName: "Aarav Mehta" });
    expect(profileUpdate.status).toBe(200);
    const studentUpdate = await request(app)
      .patch(`/api/v1/parent/students/${firstStudentId}/profile`)
      .set("Authorization", "Bearer parent-token")
      .send({ firstName: "Aarav", lastName: "Sharma" });
    expect(studentUpdate.status).toBe(404);
    const changedStudent = await client.query<{ last_name: string }>(
      "SELECT last_name FROM students WHERE id = $1",
      [firstStudentId],
    );
    expect(changedStudent.rows[0]?.last_name).toBe("Student");

    const forbiddenChild = await request(app)
      .get(`/api/v1/parent/students/${unlinkedStudentId}/attendance`)
      .set("Authorization", "Bearer parent-token");
    expect(forbiddenChild.status).toBe(404);
    const forbiddenFinance = await request(app)
      .get(`/api/v1/parent/students/${unlinkedStudentId}/finance`)
      .set("Authorization", "Bearer parent-token");
    expect(forbiddenFinance.status).toBe(404);
    const forbiddenProgress = await request(app)
      .get(`/api/v1/parent/students/${unlinkedStudentId}/progress`)
      .set("Authorization", "Bearer parent-token");
    expect(forbiddenProgress.status).toBe(404);
    const forbiddenEdit = await request(app)
      .patch(`/api/v1/parent/students/${unlinkedStudentId}/profile`)
      .set("Authorization", "Bearer parent-token")
      .send({ firstName: "Unrelated", lastName: "Child" });
    expect(forbiddenEdit.status).toBe(404);

    const replay = await request(app)
      .post("/api/v1/parent-invites/redeem")
      .send({ token: firstInvite.body.data.token, password: "safe-parent-password-2026" });
    expect(replay.status).toBe(400);
  });
});
