import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

describe("foundation migration", () => {
  const database = new PGlite();

  beforeAll(async () => {
    const migrationDirectory = new URL("../drizzle/", import.meta.url);
    const migrations = (await readdir(migrationDirectory))
      .filter((file) => /^\d+.*\.sql$/.test(file))
      .sort();
    for (const file of migrations) {
      const migration = await readFile(new URL(file, migrationDirectory), "utf8");
      await database.exec(migration.replaceAll("--> statement-breakpoint", ""));
    }
  });

  afterAll(async () => {
    await database.close();
  });

  it("creates the academy, user, session, and explicit-permission tables", async () => {
    const result = await database.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    );
    const tables = new Set(result.rows.map((row) => row.table_name));
    expect(tables).toEqual(
      new Set([
        "academies",
        "users",
        "auth_sessions",
        "user_permissions",
        "password_reset_tokens",
        "push_devices",
        "progress_entries",
        "disciplines",
        "programs",
        "batches",
        "students",
        "guardians",
        "guardian_invites",
        "student_guardians",
        "enrollments",
        "coach_profiles",
        "batch_coaches",
        "batch_schedules",
        "training_sessions",
        "coach_session_presence",
        "coach_student_feedback",
        "attendance_records",
        "attendance_corrections",
        "academy_branches",
        "academy_expenses",
        "academy_announcements",
        "announcement_reads",
        "fee_charges",
        "fee_payments",
        "fee_refunds",
        "finance_counters",
        "inquiries",
        "inquiry_activities",
      ]),
    );
  });

  it("registers every SQL migration and schema snapshot in Drizzle metadata", async () => {
    const migrationDirectory = new URL("../drizzle/", import.meta.url);
    const files = await readdir(migrationDirectory);
    const journal = JSON.parse(
      await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"),
    ) as { entries: { idx: number; tag: string }[] };
    const sqlFiles = files.filter((file) => /^\d+.*\.sql$/.test(file));

    expect(journal.entries).toHaveLength(sqlFiles.length);
    for (const entry of journal.entries) {
      const snapshot = `${String(entry.idx).padStart(4, "0")}_snapshot.json`;
      expect(files).toContain(`${entry.tag}.sql`);
      expect(
        await readFile(new URL(`../drizzle/meta/${snapshot}`, import.meta.url), "utf8"),
      ).toContain('"version": "7"');
    }
  });

  it("enforces user ownership and unique email addresses", async () => {
    const academy = await database.query<{ id: string }>(
      "INSERT INTO academies (name, slug) VALUES ('Synthetic Academy', 'synthetic-academy') RETURNING id",
    );
    const academyId = academy.rows[0]?.id;
    expect(academyId).toBeDefined();

    await database.query(
      "INSERT INTO users (academy_id, email, password_hash, display_name, role) VALUES ($1, $2, $3, $4, $5)",
      [academyId, "owner@example.test", "synthetic-hash", "Synthetic Owner", "owner"],
    );
    await expect(
      database.query(
        "INSERT INTO users (academy_id, email, password_hash, display_name, role) VALUES ($1, $2, $3, $4, $5)",
        [academyId, "owner@example.test", "synthetic-hash", "Duplicate", "owner"],
      ),
    ).rejects.toThrow();

    await expect(
      database.query(
        "INSERT INTO users (academy_id, email, password_hash, display_name, role) VALUES ($1, $2, $3, $4, $5)",
        ["edb6cc20-1138-49dc-8d7e-345c1451cc65", "orphan@example.test", "hash", "Orphan", "parent"],
      ),
    ).rejects.toThrow();
  });

  it("enforces academy-consistent relationships and positive batch capacity", async () => {
    const primaryAcademy = await database.query<{ id: string }>(
      "INSERT INTO academies (name, slug) VALUES ('Integrity Academy', 'integrity-academy') RETURNING id",
    );
    const primaryAcademyId = primaryAcademy.rows[0]?.id;
    if (!primaryAcademyId) throw new Error("Primary test academy insert returned no id.");
    const otherAcademy = await database.query<{ id: string }>(
      "INSERT INTO academies (name, slug) VALUES ('Other Academy', 'other-academy') RETURNING id",
    );
    const otherAcademyId = otherAcademy.rows[0]?.id;
    if (!otherAcademyId) throw new Error("Test academy insert returned no id.");
    const owner = await database.query<{ id: string }>(
      "INSERT INTO users (academy_id, email, password_hash, display_name, role) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [primaryAcademyId, "integrity-owner@example.test", "hash", "Integrity Owner", "owner"],
    );
    const otherOwner = await database.query<{ id: string }>(
      "INSERT INTO users (academy_id, email, password_hash, display_name, role) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [otherAcademyId, "other-owner@example.test", "hash", "Other Owner", "owner"],
    );
    const discipline = await database.query<{ id: string }>(
      "INSERT INTO disciplines (academy_id, name, created_by) VALUES ($1, $2, $3) RETURNING id",
      [primaryAcademyId, "Wushu", owner.rows[0]?.id],
    );

    await expect(
      database.query(
        "INSERT INTO programs (academy_id, discipline_id, name, created_by) VALUES ($1, $2, $3, $4)",
        [otherAcademyId, discipline.rows[0]?.id, "Cross academy program", otherOwner.rows[0]?.id],
      ),
    ).rejects.toThrow();

    const program = await database.query<{ id: string }>(
      "INSERT INTO programs (academy_id, discipline_id, name, created_by) VALUES ($1, $2, $3, $4) RETURNING id",
      [primaryAcademyId, discipline.rows[0]?.id, "Foundations", owner.rows[0]?.id],
    );
    await expect(
      database.query(
        "INSERT INTO batches (academy_id, program_id, name, capacity, created_by) VALUES ($1, $2, $3, $4, $5)",
        [primaryAcademyId, program.rows[0]?.id, "Invalid capacity", 0, owner.rows[0]?.id],
      ),
    ).rejects.toThrow();
  });
});
