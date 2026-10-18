import { z } from "zod";

export const UserRoleSchema = z.enum(["owner", "staff", "coach", "parent"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const PermissionSchema = z.enum([
  "admin:dashboard:read",
  "students:read",
  "students:write",
  "admissions:manage",
  "batches:read",
  "attendance:manage",
  "payments:read",
  "payments:record",
  "reports:read",
  "settings:manage",
  "users:manage",
  "coaches:read",
  "coaches:write",
  "schedules:read",
  "schedules:write",
  "attendance:read",
  "attendance:write",
  "attendance:correct",
]);
export type Permission = z.infer<typeof PermissionSchema>;

export const PublicUserSchema = z.object({
  id: z.string().uuid(),
  academyId: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().min(1),
  role: UserRoleSchema,
  academyName: z.string().min(1),
});
export type PublicUser = z.infer<typeof PublicUserSchema>;

export const ClientTypeSchema = z.enum(["web", "mobile"]);
export type ClientType = z.infer<typeof ClientTypeSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().trim().email().max(254).toLowerCase(),
  password: z.string().min(1).max(256),
  clientType: ClientTypeSchema,
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const RefreshRequestSchema = z.object({
  clientType: ClientTypeSchema,
  refreshToken: z.string().min(32).max(256).optional(),
});
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

export const AuthDataSchema = z.object({
  accessToken: z.string().min(1),
  expiresAt: z.string().datetime(),
  user: PublicUserSchema,
  refreshToken: z.string().min(32).optional(),
});
export type AuthData = z.infer<typeof AuthDataSchema>;

export const ApiSuccessSchema = <T extends z.ZodTypeAny>(data: T) => z.object({ data });

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
  }),
});

export const HealthSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("sportdesk-api"),
  version: z.string(),
});

export const AdminOverviewSchema = z.object({
  academyName: z.string().min(1),
  user: PublicUserSchema,
});
export type AdminOverview = z.infer<typeof AdminOverviewSchema>;

export const StudentStatusSchema = z.enum([
  "lead",
  "pending",
  "active",
  "suspended",
  "completed",
  "withdrawn",
]);
export type StudentStatus = z.infer<typeof StudentStatusSchema>;

export const DisciplineSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  isActive: z.boolean(),
});
export type Discipline = z.infer<typeof DisciplineSchema>;

export const ProgramSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  disciplineId: z.string().uuid(),
  disciplineName: z.string().min(1),
  isActive: z.boolean(),
});
export type Program = z.infer<typeof ProgramSchema>;

export const BatchSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  programId: z.string().uuid(),
  programName: z.string().min(1),
  disciplineName: z.string().min(1),
  capacity: z.number().int().positive().nullable(),
  activeEnrollmentCount: z.number().int().nonnegative(),
  isActive: z.boolean(),
});
export type Batch = z.infer<typeof BatchSchema>;

const AcademyNameSchema = z.string().trim().min(1).max(120);

export const CreateDisciplineRequestSchema = z.object({ name: AcademyNameSchema });
export type CreateDisciplineRequest = z.infer<typeof CreateDisciplineRequestSchema>;

export const CreateProgramRequestSchema = z.object({
  name: AcademyNameSchema,
  disciplineId: z.string().uuid(),
});
export type CreateProgramRequest = z.infer<typeof CreateProgramRequestSchema>;

export const CreateBatchRequestSchema = z.object({
  name: AcademyNameSchema,
  programId: z.string().uuid(),
  capacity: z.number().int().min(1).max(500).optional(),
});
export type CreateBatchRequest = z.infer<typeof CreateBatchRequestSchema>;

export const StudentSchema = z.object({
  id: z.string().uuid(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  status: StudentStatusSchema,
  createdAt: z.string().datetime(),
  guardians: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1),
      relationship: z.string().min(1),
      email: z.string().email().nullable(),
      hasAccount: z.boolean(),
    }),
  ),
  enrollments: z.array(
    z.object({
      id: z.string().uuid(),
      batchId: z.string().uuid(),
      batchName: z.string().min(1),
      programName: z.string().min(1),
      status: z.enum(["active", "completed", "suspended", "withdrawn"]),
    }),
  ),
});
export type Student = z.infer<typeof StudentSchema>;

export const GuardianInviteSchema = z.object({
  token: z.string().min(32),
  email: z.string().email(),
  expiresAt: z.string().datetime(),
});
export type GuardianInvite = z.infer<typeof GuardianInviteSchema>;

export const RedeemGuardianInviteRequestSchema = z.object({
  token: z.string().min(32).max(128),
  password: z.string().min(14).max(256),
});
export type RedeemGuardianInviteRequest = z.infer<typeof RedeemGuardianInviteRequestSchema>;

export const RedeemedGuardianInviteSchema = z.object({ email: z.string().email() });
export type RedeemedGuardianInvite = z.infer<typeof RedeemedGuardianInviteSchema>;

export const ParentStudentSchema = z.object({
  id: z.string().uuid(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  status: StudentStatusSchema,
  batchNames: z.array(z.string().min(1)),
});
export type ParentStudent = z.infer<typeof ParentStudentSchema>;

export const ParentScheduleSchema = z.object({
  id: z.string().uuid(),
  batchId: z.string().uuid(),
  batchName: z.string().min(1),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  venue: z.string().nullable(),
});
export type ParentSchedule = z.infer<typeof ParentScheduleSchema>;

export const CreateStudentRequestSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  status: StudentStatusSchema.default("pending"),
  guardian: z
    .object({
      name: z.string().trim().min(1).max(120),
      relationship: z.string().trim().min(1).max(40),
      email: z.string().trim().email().max(254).toLowerCase().optional(),
      phone: z.string().trim().min(7).max(30).optional(),
    })
    .optional(),
  batchId: z.string().uuid().optional(),
});
export type CreateStudentRequest = z.infer<typeof CreateStudentRequestSchema>;

export const CreateEnrollmentRequestSchema = z.object({ batchId: z.string().uuid() });
export type CreateEnrollmentRequest = z.infer<typeof CreateEnrollmentRequestSchema>;

export const AcademyCatalogSchema = z.object({
  disciplines: z.array(DisciplineSchema),
  programs: z.array(ProgramSchema),
  batches: z.array(BatchSchema),
});
export type AcademyCatalog = z.infer<typeof AcademyCatalogSchema>;

export const StudentListSchema = z.object({ students: z.array(StudentSchema) });
export type StudentList = z.infer<typeof StudentListSchema>;

export const CreatedRecordSchema = z.object({ id: z.string().uuid() });
export type CreatedRecord = z.infer<typeof CreatedRecordSchema>;

export const CoachStatusSchema = z.enum(["active", "inactive"]);
export type CoachStatus = z.infer<typeof CoachStatusSchema>;

export const CoachSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  displayName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().nullable(),
  specializations: z.array(z.string()),
  status: CoachStatusSchema,
  batchIds: z.array(z.string().uuid()),
});
export type Coach = z.infer<typeof CoachSchema>;

export const CreateCoachRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(254).toLowerCase(),
  password: z.string().min(14).max(256),
  phone: z.string().trim().min(7).max(30).optional(),
  specializations: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
});
export type CreateCoachRequest = z.infer<typeof CreateCoachRequestSchema>;

export const AssignCoachRequestSchema = z.object({ coachId: z.string().uuid() });
export type AssignCoachRequest = z.infer<typeof AssignCoachRequestSchema>;

const LocalTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

export const ScheduleSchema = z.object({
  id: z.string().uuid(),
  batchId: z.string().uuid(),
  batchName: z.string().min(1),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: LocalTimeSchema,
  endTime: LocalTimeSchema,
  venue: z.string().nullable(),
  isActive: z.boolean(),
});
export type Schedule = z.infer<typeof ScheduleSchema>;

export const CreateScheduleRequestSchema = z
  .object({
    batchId: z.string().uuid(),
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: LocalTimeSchema,
    endTime: LocalTimeSchema,
    venue: z.string().trim().max(160).optional(),
  })
  .refine((schedule) => schedule.startTime < schedule.endTime, {
    path: ["endTime"],
    message: "End time must be after start time.",
  });
export type CreateScheduleRequest = z.infer<typeof CreateScheduleRequestSchema>;

export const CreateSessionRequestSchema = z.object({
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;

export const SessionStatusSchema = z.enum(["scheduled", "completed", "cancelled"]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const TrainingSessionSchema = z.object({
  id: z.string().uuid(),
  batchId: z.string().uuid(),
  batchName: z.string().min(1),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  venue: z.string().nullable(),
  status: SessionStatusSchema,
});
export type TrainingSession = z.infer<typeof TrainingSessionSchema>;

export const AttendanceStatusSchema = z.enum(["present", "absent", "late", "excused"]);
export type AttendanceStatus = z.infer<typeof AttendanceStatusSchema>;

export const ParentAttendanceSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  batchName: z.string().min(1),
  scheduledStart: z.string().datetime(),
  status: AttendanceStatusSchema,
});
export type ParentAttendance = z.infer<typeof ParentAttendanceSchema>;

export const AttendanceRecordSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  studentId: z.string().uuid(),
  studentName: z.string().min(1),
  status: AttendanceStatusSchema,
  recordedBy: z.string().uuid(),
  recordedAt: z.string().datetime(),
});
export type AttendanceRecord = z.infer<typeof AttendanceRecordSchema>;

export const AdminAttendanceEntrySchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  studentId: z.string().uuid(),
  studentName: z.string().min(1),
  batchName: z.string().min(1),
  scheduledStart: z.string().datetime(),
  status: AttendanceStatusSchema,
  recordedBy: z.string().uuid(),
  recorderName: z.string().min(1),
  recordedAt: z.string().datetime(),
  correctionCount: z.number().int().min(0),
});
export type AdminAttendanceEntry = z.infer<typeof AdminAttendanceEntrySchema>;

export const AttendanceCorrectionEntrySchema = z.object({
  id: z.string().uuid(),
  attendanceId: z.string().uuid(),
  previousStatus: AttendanceStatusSchema,
  nextStatus: AttendanceStatusSchema,
  correctedBy: z.string().uuid(),
  correctedByName: z.string().min(1),
  reason: z.string().min(1),
  correctedAt: z.string().datetime(),
});
export type AttendanceCorrectionEntry = z.infer<typeof AttendanceCorrectionEntrySchema>;

export const CorrectAttendanceRequestSchema = z.object({
  status: AttendanceStatusSchema,
  reason: z.string().trim().min(5).max(500),
});
export type CorrectAttendanceRequest = z.infer<typeof CorrectAttendanceRequestSchema>;

export const SessionRosterStudentSchema = z.object({
  studentId: z.string().uuid(),
  studentName: z.string().min(1),
  status: AttendanceStatusSchema.nullable(),
});
export type SessionRosterStudent = z.infer<typeof SessionRosterStudentSchema>;

export const SessionRosterSchema = z.object({
  session: TrainingSessionSchema,
  students: z.array(SessionRosterStudentSchema),
});
export type SessionRoster = z.infer<typeof SessionRosterSchema>;

export const RecordAttendanceRequestSchema = z
  .object({
    records: z
      .array(
        z.object({
          studentId: z.string().uuid(),
          status: AttendanceStatusSchema,
        }),
      )
      .min(1)
      .max(500),
  })
  .superRefine((input, context) => {
    const ids = new Set<string>();
    input.records.forEach((record, index) => {
      if (ids.has(record.studentId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["records", index, "studentId"],
          message: "Each student can appear only once in an attendance submission.",
        });
      }
      ids.add(record.studentId);
    });
  });
export type RecordAttendanceRequest = z.infer<typeof RecordAttendanceRequestSchema>;
