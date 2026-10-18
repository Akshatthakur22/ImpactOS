import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["owner", "staff", "coach", "parent"]);
export const studentStatus = pgEnum("student_status", [
  "lead",
  "pending",
  "active",
  "suspended",
  "completed",
  "withdrawn",
]);
export const enrollmentStatus = pgEnum("enrollment_status", [
  "active",
  "completed",
  "suspended",
  "withdrawn",
]);
export const sessionStatus = pgEnum("session_status", ["scheduled", "completed", "cancelled"]);
export const attendanceStatus = pgEnum("attendance_status", [
  "present",
  "absent",
  "late",
  "excused",
]);
export const coachStatus = pgEnum("coach_status", ["active", "inactive"]);

export const academies = pgTable(
  "academies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull(),
    timezone: varchar("timezone", { length: 80 }).notNull().default("Asia/Kolkata"),
    currency: varchar("currency", { length: 3 }).notNull().default("INR"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("academies_slug_uq").on(table.slug)],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "restrict" }),
    email: varchar("email", { length: 254 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: varchar("display_name", { length: 160 }).notNull(),
    role: userRole("role").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("users_email_uq").on(table.email),
    uniqueIndex("users_id_academy_uq").on(table.id, table.academyId),
    index("users_academy_role_idx").on(table.academyId, table.role),
  ],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    refreshTokenHash: varchar("refresh_token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("auth_sessions_refresh_hash_uq").on(table.refreshTokenHash),
    index("auth_sessions_user_expiry_idx").on(table.userId, table.expiresAt),
  ],
);

export const userPermissions = pgTable(
  "user_permissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permission: varchar("permission", { length: 80 }).notNull(),
    grantedBy: uuid("granted_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_permissions_user_permission_uq").on(table.userId, table.permission),
    index("user_permissions_user_idx").on(table.userId),
  ],
);

export const disciplines = pgTable(
  "disciplines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 120 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("disciplines_id_academy_uq").on(table.id, table.academyId),
    uniqueIndex("disciplines_academy_name_uq").on(table.academyId, sql`lower(${table.name})`),
    index("disciplines_academy_active_idx").on(table.academyId, table.isActive),
    foreignKey({
      name: "disciplines_created_by_academy_fk",
      columns: [table.createdBy, table.academyId],
      foreignColumns: [users.id, users.academyId],
    }).onDelete("restrict"),
  ],
);

export const programs = pgTable(
  "programs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "restrict" }),
    disciplineId: uuid("discipline_id").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("programs_id_academy_uq").on(table.id, table.academyId),
    uniqueIndex("programs_academy_discipline_name_uq").on(
      table.academyId,
      table.disciplineId,
      sql`lower(${table.name})`,
    ),
    index("programs_academy_discipline_active_idx").on(
      table.academyId,
      table.disciplineId,
      table.isActive,
    ),
    foreignKey({
      name: "programs_discipline_academy_fk",
      columns: [table.disciplineId, table.academyId],
      foreignColumns: [disciplines.id, disciplines.academyId],
    }).onDelete("restrict"),
    foreignKey({
      name: "programs_created_by_academy_fk",
      columns: [table.createdBy, table.academyId],
      foreignColumns: [users.id, users.academyId],
    }).onDelete("restrict"),
  ],
);

export const batches = pgTable(
  "batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "restrict" }),
    programId: uuid("program_id").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    capacity: integer("capacity"),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("batches_id_academy_uq").on(table.id, table.academyId),
    uniqueIndex("batches_academy_program_name_uq").on(
      table.academyId,
      table.programId,
      sql`lower(${table.name})`,
    ),
    index("batches_academy_program_active_idx").on(
      table.academyId,
      table.programId,
      table.isActive,
    ),
    check("batches_capacity_positive_chk", sql`${table.capacity} IS NULL OR ${table.capacity} > 0`),
    foreignKey({
      name: "batches_program_academy_fk",
      columns: [table.programId, table.academyId],
      foreignColumns: [programs.id, programs.academyId],
    }).onDelete("restrict"),
    foreignKey({
      name: "batches_created_by_academy_fk",
      columns: [table.createdBy, table.academyId],
      foreignColumns: [users.id, users.academyId],
    }).onDelete("restrict"),
  ],
);

export const students = pgTable(
  "students",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "restrict" }),
    firstName: varchar("first_name", { length: 80 }).notNull(),
    lastName: varchar("last_name", { length: 80 }).notNull(),
    status: studentStatus("status").notNull().default("pending"),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("students_id_academy_uq").on(table.id, table.academyId),
    index("students_academy_status_name_idx").on(
      table.academyId,
      table.status,
      table.lastName,
      table.firstName,
    ),
    foreignKey({
      name: "students_created_by_academy_fk",
      columns: [table.createdBy, table.academyId],
      foreignColumns: [users.id, users.academyId],
    }).onDelete("restrict"),
  ],
);

export const guardians = pgTable(
  "guardians",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "restrict" }),
    userId: uuid("user_id"),
    name: varchar("name", { length: 120 }).notNull(),
    email: varchar("email", { length: 254 }),
    phone: varchar("phone", { length: 30 }),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("guardians_id_academy_uq").on(table.id, table.academyId),
    index("guardians_academy_name_idx").on(table.academyId, table.name),
    foreignKey({
      name: "guardians_user_academy_fk",
      columns: [table.userId, table.academyId],
      foreignColumns: [users.id, users.academyId],
    }).onDelete("restrict"),
    foreignKey({
      name: "guardians_created_by_academy_fk",
      columns: [table.createdBy, table.academyId],
      foreignColumns: [users.id, users.academyId],
    }).onDelete("restrict"),
  ],
);

export const guardianInvites = pgTable(
  "guardian_invites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "restrict" }),
    guardianId: uuid("guardian_id").notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true, mode: "date" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("guardian_invites_token_hash_uq").on(table.tokenHash),
    index("guardian_invites_guardian_expiry_idx").on(table.guardianId, table.expiresAt),
    foreignKey({
      name: "guardian_invites_guardian_academy_fk",
      columns: [table.guardianId, table.academyId],
      foreignColumns: [guardians.id, guardians.academyId],
    }).onDelete("restrict"),
    foreignKey({
      name: "guardian_invites_created_by_academy_fk",
      columns: [table.createdBy, table.academyId],
      foreignColumns: [users.id, users.academyId],
    }).onDelete("restrict"),
  ],
);

export const studentGuardians = pgTable(
  "student_guardians",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "restrict" }),
    studentId: uuid("student_id").notNull(),
    guardianId: uuid("guardian_id").notNull(),
    relationship: varchar("relationship", { length: 40 }).notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("student_guardians_student_guardian_uq").on(table.studentId, table.guardianId),
    foreignKey({
      name: "student_guardians_student_academy_fk",
      columns: [table.studentId, table.academyId],
      foreignColumns: [students.id, students.academyId],
    }).onDelete("restrict"),
    foreignKey({
      name: "student_guardians_guardian_academy_fk",
      columns: [table.guardianId, table.academyId],
      foreignColumns: [guardians.id, guardians.academyId],
    }).onDelete("restrict"),
    index("student_guardians_academy_student_idx").on(table.academyId, table.studentId),
    index("student_guardians_guardian_idx").on(table.guardianId),
  ],
);

export const enrollments = pgTable(
  "enrollments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "restrict" }),
    studentId: uuid("student_id").notNull(),
    batchId: uuid("batch_id").notNull(),
    status: enrollmentStatus("status").notNull().default("active"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true, mode: "date" }),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("enrollments_student_batch_active_uq")
      .on(table.studentId, table.batchId)
      .where(sql`${table.status} = 'active'`),
    index("enrollments_academy_student_idx").on(table.academyId, table.studentId, table.status),
    index("enrollments_batch_status_idx").on(table.batchId, table.status),
    foreignKey({
      name: "enrollments_student_academy_fk",
      columns: [table.studentId, table.academyId],
      foreignColumns: [students.id, students.academyId],
    }).onDelete("restrict"),
    foreignKey({
      name: "enrollments_batch_academy_fk",
      columns: [table.batchId, table.academyId],
      foreignColumns: [batches.id, batches.academyId],
    }).onDelete("restrict"),
    foreignKey({
      name: "enrollments_created_by_academy_fk",
      columns: [table.createdBy, table.academyId],
      foreignColumns: [users.id, users.academyId],
    }).onDelete("restrict"),
  ],
);

export const coachProfiles = pgTable(
  "coach_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "restrict" }),
    userId: uuid("user_id").notNull(),
    phone: varchar("phone", { length: 30 }),
    specializations: text("specializations")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    status: coachStatus("status").notNull().default("active"),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("coach_profiles_id_academy_uq").on(table.id, table.academyId),
    uniqueIndex("coach_profiles_user_academy_uq").on(table.userId, table.academyId),
    foreignKey({
      name: "coach_profiles_user_academy_fk",
      columns: [table.userId, table.academyId],
      foreignColumns: [users.id, users.academyId],
    }).onDelete("restrict"),
    foreignKey({
      name: "coach_profiles_created_by_academy_fk",
      columns: [table.createdBy, table.academyId],
      foreignColumns: [users.id, users.academyId],
    }).onDelete("restrict"),
  ],
);

export const batchCoaches = pgTable(
  "batch_coaches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "restrict" }),
    batchId: uuid("batch_id").notNull(),
    coachId: uuid("coach_id").notNull(),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("batch_coaches_id_academy_uq").on(table.id, table.academyId),
    uniqueIndex("batch_coaches_batch_coach_uq").on(table.batchId, table.coachId),
    foreignKey({
      name: "batch_coaches_batch_academy_fk",
      columns: [table.batchId, table.academyId],
      foreignColumns: [batches.id, batches.academyId],
    }).onDelete("restrict"),
    foreignKey({
      name: "batch_coaches_coach_academy_fk",
      columns: [table.coachId, table.academyId],
      foreignColumns: [coachProfiles.id, coachProfiles.academyId],
    }).onDelete("restrict"),
    foreignKey({
      name: "batch_coaches_created_by_academy_fk",
      columns: [table.createdBy, table.academyId],
      foreignColumns: [users.id, users.academyId],
    }).onDelete("restrict"),
  ],
);

export const batchSchedules = pgTable(
  "batch_schedules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "restrict" }),
    batchId: uuid("batch_id").notNull(),
    dayOfWeek: integer("day_of_week").notNull(),
    startTime: varchar("start_time", { length: 5 }).notNull(),
    endTime: varchar("end_time", { length: 5 }).notNull(),
    venue: varchar("venue", { length: 160 }),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("batch_schedules_id_academy_uq").on(table.id, table.academyId),
    index("batch_schedules_batch_active_idx").on(table.batchId, table.isActive),
    check("batch_schedules_day_chk", sql`${table.dayOfWeek} BETWEEN 0 AND 6`),
    check("batch_schedules_time_order_chk", sql`${table.startTime} < ${table.endTime}`),
    foreignKey({
      name: "batch_schedules_batch_academy_fk",
      columns: [table.batchId, table.academyId],
      foreignColumns: [batches.id, batches.academyId],
    }).onDelete("restrict"),
    foreignKey({
      name: "batch_schedules_created_by_academy_fk",
      columns: [table.createdBy, table.academyId],
      foreignColumns: [users.id, users.academyId],
    }).onDelete("restrict"),
  ],
);

export const trainingSessions = pgTable(
  "training_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "restrict" }),
    batchId: uuid("batch_id").notNull(),
    scheduleId: uuid("schedule_id"),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }).notNull(),
    venue: varchar("venue", { length: 160 }),
    status: sessionStatus("status").notNull().default("scheduled"),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("training_sessions_id_academy_uq").on(table.id, table.academyId),
    uniqueIndex("training_sessions_batch_start_uq").on(table.batchId, table.startsAt),
    index("training_sessions_academy_start_idx").on(table.academyId, table.startsAt),
    check("training_sessions_time_order_chk", sql`${table.startsAt} < ${table.endsAt}`),
    foreignKey({
      name: "training_sessions_batch_academy_fk",
      columns: [table.batchId, table.academyId],
      foreignColumns: [batches.id, batches.academyId],
    }).onDelete("restrict"),
    foreignKey({
      name: "training_sessions_schedule_academy_fk",
      columns: [table.scheduleId, table.academyId],
      foreignColumns: [batchSchedules.id, batchSchedules.academyId],
    }).onDelete("restrict"),
    foreignKey({
      name: "training_sessions_created_by_academy_fk",
      columns: [table.createdBy, table.academyId],
      foreignColumns: [users.id, users.academyId],
    }).onDelete("restrict"),
  ],
);

export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "restrict" }),
    sessionId: uuid("session_id").notNull(),
    studentId: uuid("student_id").notNull(),
    status: attendanceStatus("status").notNull(),
    recordedBy: uuid("recorded_by").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("attendance_records_id_academy_uq").on(table.id, table.academyId),
    uniqueIndex("attendance_records_session_student_uq").on(table.sessionId, table.studentId),
    index("attendance_records_academy_student_idx").on(table.academyId, table.studentId),
    foreignKey({
      name: "attendance_records_session_academy_fk",
      columns: [table.sessionId, table.academyId],
      foreignColumns: [trainingSessions.id, trainingSessions.academyId],
    }).onDelete("restrict"),
    foreignKey({
      name: "attendance_records_student_academy_fk",
      columns: [table.studentId, table.academyId],
      foreignColumns: [students.id, students.academyId],
    }).onDelete("restrict"),
    foreignKey({
      name: "attendance_records_recorded_by_academy_fk",
      columns: [table.recordedBy, table.academyId],
      foreignColumns: [users.id, users.academyId],
    }).onDelete("restrict"),
  ],
);

export const attendanceCorrections = pgTable(
  "attendance_corrections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    academyId: uuid("academy_id")
      .notNull()
      .references(() => academies.id, { onDelete: "restrict" }),
    attendanceId: uuid("attendance_id").notNull(),
    previousStatus: attendanceStatus("previous_status").notNull(),
    nextStatus: attendanceStatus("next_status").notNull(),
    correctedBy: uuid("corrected_by").notNull(),
    reason: varchar("reason", { length: 500 }).notNull(),
    correctedAt: timestamp("corrected_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "attendance_corrections_attendance_academy_fk",
      columns: [table.attendanceId, table.academyId],
      foreignColumns: [attendanceRecords.id, attendanceRecords.academyId],
    }).onDelete("restrict"),
    foreignKey({
      name: "attendance_corrections_corrected_by_academy_fk",
      columns: [table.correctedBy, table.academyId],
      foreignColumns: [users.id, users.academyId],
    }).onDelete("restrict"),
  ],
);

export const academiesRelations = relations(academies, ({ many }) => ({ users: many(users) }));
export const usersRelations = relations(users, ({ one, many }) => ({
  academy: one(academies, { fields: [users.academyId], references: [academies.id] }),
  sessions: many(authSessions),
  permissions: many(userPermissions),
}));
export const authSessionsRelations = relations(authSessions, ({ one }) => ({
  user: one(users, { fields: [authSessions.userId], references: [users.id] }),
}));
export const disciplinesRelations = relations(disciplines, ({ one, many }) => ({
  academy: one(academies, { fields: [disciplines.academyId], references: [academies.id] }),
  programs: many(programs),
}));
export const programsRelations = relations(programs, ({ one, many }) => ({
  academy: one(academies, { fields: [programs.academyId], references: [academies.id] }),
  discipline: one(disciplines, { fields: [programs.disciplineId], references: [disciplines.id] }),
  batches: many(batches),
}));
export const batchesRelations = relations(batches, ({ one, many }) => ({
  academy: one(academies, { fields: [batches.academyId], references: [academies.id] }),
  program: one(programs, { fields: [batches.programId], references: [programs.id] }),
  enrollments: many(enrollments),
}));
export const studentsRelations = relations(students, ({ one, many }) => ({
  academy: one(academies, { fields: [students.academyId], references: [academies.id] }),
  guardians: many(studentGuardians),
  enrollments: many(enrollments),
}));
export const guardiansRelations = relations(guardians, ({ one, many }) => ({
  academy: one(academies, { fields: [guardians.academyId], references: [academies.id] }),
  user: one(users, { fields: [guardians.userId], references: [users.id] }),
  students: many(studentGuardians),
}));
export const studentGuardiansRelations = relations(studentGuardians, ({ one }) => ({
  student: one(students, { fields: [studentGuardians.studentId], references: [students.id] }),
  guardian: one(guardians, { fields: [studentGuardians.guardianId], references: [guardians.id] }),
}));
export const enrollmentsRelations = relations(enrollments, ({ one }) => ({
  academy: one(academies, { fields: [enrollments.academyId], references: [academies.id] }),
  student: one(students, { fields: [enrollments.studentId], references: [students.id] }),
  batch: one(batches, { fields: [enrollments.batchId], references: [batches.id] }),
}));
export const coachProfilesRelations = relations(coachProfiles, ({ one, many }) => ({
  academy: one(academies, { fields: [coachProfiles.academyId], references: [academies.id] }),
  user: one(users, { fields: [coachProfiles.userId], references: [users.id] }),
  batches: many(batchCoaches),
}));
export const batchCoachesRelations = relations(batchCoaches, ({ one }) => ({
  batch: one(batches, { fields: [batchCoaches.batchId], references: [batches.id] }),
  coach: one(coachProfiles, { fields: [batchCoaches.coachId], references: [coachProfiles.id] }),
}));
export const batchSchedulesRelations = relations(batchSchedules, ({ one, many }) => ({
  batch: one(batches, { fields: [batchSchedules.batchId], references: [batches.id] }),
  sessions: many(trainingSessions),
}));
export const trainingSessionsRelations = relations(trainingSessions, ({ one, many }) => ({
  batch: one(batches, { fields: [trainingSessions.batchId], references: [batches.id] }),
  schedule: one(batchSchedules, {
    fields: [trainingSessions.scheduleId],
    references: [batchSchedules.id],
  }),
  attendance: many(attendanceRecords),
}));
export const attendanceRecordsRelations = relations(attendanceRecords, ({ one, many }) => ({
  session: one(trainingSessions, {
    fields: [attendanceRecords.sessionId],
    references: [trainingSessions.id],
  }),
  student: one(students, { fields: [attendanceRecords.studentId], references: [students.id] }),
  corrections: many(attendanceCorrections),
}));

export type UserRow = typeof users.$inferSelect;
