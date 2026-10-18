import { z } from "zod";

export const UserRoleSchema = z.enum(["owner", "staff", "coach", "parent"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const PermissionSchema = z.enum([
  "admin:dashboard:read",
  "students:read",
  "students:write",
  "admissions:manage",
  "academy:manage",
  "batches:read",
  "attendance:manage",
  "payments:read",
  "payments:record",
  "reports:read",
  "settings:manage",
  "users:manage",
  "announcements:manage",
  "expenses:manage",
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
  academyTimezone: z.string().min(1).optional(),
  permissions: z.array(PermissionSchema).optional(),
});
export type PublicUser = z.infer<typeof PublicUserSchema>;

export const StaffMemberSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().min(1),
  isActive: z.boolean(),
  permissions: z.array(PermissionSchema),
  createdAt: z.string().datetime(),
});
export type StaffMember = z.infer<typeof StaffMemberSchema>;
export const StaffListResponseSchema = z.object({ staff: z.array(StaffMemberSchema) });

export const CreateStaffRequestSchema = z
  .object({
    email: z.string().trim().email().max(254).toLowerCase(),
    displayName: z.string().trim().min(1).max(160),
    initialPassword: z.string().min(14).max(256),
    permissions: z.array(PermissionSchema).max(24),
  })
  .refine((value) => new Set(value.permissions).size === value.permissions.length, {
    message: "Choose each permission only once.",
    path: ["permissions"],
  });
export type CreateStaffRequest = z.infer<typeof CreateStaffRequestSchema>;

export const UpdateStaffRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(160).optional(),
    isActive: z.boolean().optional(),
    permissions: z.array(PermissionSchema).max(24).optional(),
  })
  .refine(
    (value) => !value.permissions || new Set(value.permissions).size === value.permissions.length,
    { message: "Choose each permission only once.", path: ["permissions"] },
  )
  .refine((value) => Object.keys(value).length > 0, "At least one field is required.");
export type UpdateStaffRequest = z.infer<typeof UpdateStaffRequestSchema>;

export const PasswordResetRequestSchema = z.object({
  email: z.string().trim().email().max(254).toLowerCase(),
});
export type PasswordResetRequest = z.infer<typeof PasswordResetRequestSchema>;

export const PasswordResetConfirmSchema = z.object({
  token: z.string().min(32).max(128),
  password: z.string().min(14).max(256),
});
export type PasswordResetConfirm = z.infer<typeof PasswordResetConfirmSchema>;

export const PushDeviceRequestSchema = z.object({
  token: z
    .string()
    .regex(/^(?:Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$/)
    .max(255),
  platform: z.enum(["ios", "android"]),
});
export type PushDeviceRequest = z.infer<typeof PushDeviceRequestSchema>;

export const RecordProgressRequestSchema = z
  .object({
    studentId: z.string().uuid(),
    assessmentName: z.string().trim().min(2).max(100),
    value: z.string().trim().max(120).optional(),
    coachNote: z.string().trim().max(1000).optional(),
    parentVisible: z.boolean().default(false),
  })
  .refine((item) => Boolean(item.value || item.coachNote), "Add a result or a coach note.");
export type RecordProgressRequest = z.infer<typeof RecordProgressRequestSchema>;

export const ProgressEntrySchema = z.object({
  id: z.string().uuid(),
  studentId: z.string().uuid(),
  studentName: z.string(),
  sessionId: z.string().uuid(),
  batchName: z.string(),
  sportName: z.string(),
  assessmentName: z.string(),
  value: z.string().nullable(),
  coachNote: z.string().nullable(),
  parentVisible: z.boolean(),
  coachName: z.string(),
  createdAt: z.string().datetime(),
});
export type ProgressEntry = z.infer<typeof ProgressEntrySchema>;

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

export const AdminAttendanceSummarySchema = z.object({
  expected: z.number().int().nonnegative(),
  marked: z.number().int().nonnegative(),
  present: z.number().int().nonnegative(),
  absent: z.number().int().nonnegative(),
  late: z.number().int().nonnegative(),
  excused: z.number().int().nonnegative(),
  toRecord: z.number().int().nonnegative(),
});
export type AdminAttendanceSummary = z.infer<typeof AdminAttendanceSummarySchema>;

export const AdminOverviewSessionSchema = z.object({
  id: z.string().uuid(),
  batchId: z.string().uuid(),
  batchName: z.string().min(1),
  programName: z.string().min(1),
  coachNames: z.array(z.string().min(1)),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  venue: z.string().nullable(),
  status: z.enum(["scheduled", "completed", "cancelled"]),
  attendance: AdminAttendanceSummarySchema,
});
export type AdminOverviewSession = z.infer<typeof AdminOverviewSessionSchema>;

export const AdminRecentAttendanceSchema = z.object({
  id: z.string().uuid(),
  studentName: z.string().min(1),
  batchName: z.string().min(1),
  sessionStartsAt: z.string().datetime(),
  status: z.enum(["present", "absent", "late", "excused"]),
  recordedByName: z.string().min(1),
  recordedAt: z.string().datetime(),
});
export type AdminRecentAttendance = z.infer<typeof AdminRecentAttendanceSchema>;

export const AdminOverviewSchema = z.object({
  academyName: z.string().min(1),
  user: PublicUserSchema,
  timezone: z.string().min(1),
  metrics: z.object({
    activeStudents: z.number().int().nonnegative(),
    pendingStudents: z.number().int().nonnegative(),
    activeCoaches: z.number().int().nonnegative(),
    activePrograms: z.number().int().nonnegative(),
    activeBatches: z.number().int().nonnegative(),
    sessionsToday: z.number().int().nonnegative(),
    scheduledSessionsToday: z.number().int().nonnegative(),
    completedSessionsToday: z.number().int().nonnegative(),
    cancelledSessionsToday: z.number().int().nonnegative(),
    attendanceToday: AdminAttendanceSummarySchema,
  }),
  todaySessions: z.array(AdminOverviewSessionSchema),
  recentAttendance: z.array(AdminRecentAttendanceSchema),
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

export const UpdateDisciplineRequestSchema = z
  .object({
    name: AcademyNameSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required.");
export type UpdateDisciplineRequest = z.infer<typeof UpdateDisciplineRequestSchema>;

export const UpdateProgramRequestSchema = z
  .object({
    name: AcademyNameSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required.");
export type UpdateProgramRequest = z.infer<typeof UpdateProgramRequestSchema>;

export const UpdateBatchRequestSchema = z
  .object({
    name: AcademyNameSchema.optional(),
    capacity: z.number().int().min(1).max(500).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required.");
export type UpdateBatchRequest = z.infer<typeof UpdateBatchRequestSchema>;

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
      phone: z.string().nullable().optional(),
      hasAccount: z.boolean(),
      inviteStatus: z.enum(["not_sent", "pending", "expired", "revoked", "redeemed"]).optional(),
    }),
  ),
  enrollments: z.array(
    z.object({
      id: z.string().uuid(),
      batchId: z.string().uuid(),
      batchName: z.string().min(1),
      programName: z.string().min(1),
      status: z.enum(["active", "completed", "suspended", "withdrawn"]),
      startedAt: z.string().datetime().optional(),
      endedAt: z.string().datetime().nullable().optional(),
    }),
  ),
});
export type Student = z.infer<typeof StudentSchema>;

export const InquiryStatusSchema = z.enum([
  "new",
  "contacted",
  "follow_up",
  "trial_scheduled",
  "converted",
  "lost",
]);
export type InquiryStatus = z.infer<typeof InquiryStatusSchema>;

export const InquiryActivityTypeSchema = z.enum([
  "note",
  "call",
  "message",
  "visit",
  "trial",
  "status_change",
  "conversion",
]);
export type InquiryActivityType = z.infer<typeof InquiryActivityTypeSchema>;

export const InquiryActivitySchema = z.object({
  id: z.string().uuid(),
  type: InquiryActivityTypeSchema,
  note: z.string().min(1),
  statusBefore: InquiryStatusSchema.nullable(),
  statusAfter: InquiryStatusSchema.nullable(),
  nextFollowUpAt: z.string().datetime().nullable(),
  createdByName: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type InquiryActivity = z.infer<typeof InquiryActivitySchema>;

export const InquirySchema = z.object({
  id: z.string().uuid(),
  studentFirstName: z.string().min(1),
  studentLastName: z.string().min(1),
  contactName: z.string().min(1),
  contactEmail: z.string().email().nullable(),
  contactPhone: z.string().nullable(),
  relationship: z.string().min(1),
  source: z.string().min(1),
  sourceDetail: z.string().nullable(),
  programId: z.string().uuid().nullable(),
  programName: z.string().nullable(),
  status: InquiryStatusSchema,
  notes: z.string().nullable(),
  nextFollowUpAt: z.string().datetime().nullable(),
  convertedStudentId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  activities: z.array(InquiryActivitySchema).optional(),
});
export type Inquiry = z.infer<typeof InquirySchema>;

const InquiryNameSchema = z.string().trim().min(1).max(80);
export const CreateInquiryRequestSchema = z
  .object({
    studentFirstName: InquiryNameSchema,
    studentLastName: InquiryNameSchema,
    contactName: z.string().trim().min(1).max(120),
    contactEmail: z.string().trim().email().max(254).toLowerCase().optional(),
    contactPhone: z.string().trim().min(7).max(30).optional(),
    relationship: z.string().trim().min(1).max(40).default("Parent"),
    source: z.string().trim().min(1).max(120),
    sourceDetail: z.string().trim().max(240).optional(),
    programId: z.string().uuid().optional(),
    notes: z.string().trim().max(4000).optional(),
    nextFollowUpAt: z.string().datetime().optional(),
  })
  .refine((value) => value.contactEmail || value.contactPhone, {
    message: "Add an email address or phone number so the contact can be reached.",
    path: ["contactPhone"],
  });
export type CreateInquiryRequest = z.infer<typeof CreateInquiryRequestSchema>;

export const InquiryListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: InquiryStatusSchema.optional(),
  source: z.string().trim().max(120).optional(),
  followUp: z.enum(["due", "upcoming", "none"]).optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type InquiryListQuery = z.infer<typeof InquiryListQuerySchema>;
export type InquiryListQueryInput = z.input<typeof InquiryListQuerySchema>;

export const AddInquiryActivityRequestSchema = z.object({
  type: z.enum(["note", "call", "message", "visit", "trial"]),
  note: z.string().trim().min(1).max(4000),
  status: z.enum(["new", "contacted", "follow_up", "trial_scheduled", "lost"]).optional(),
  nextFollowUpAt: z.string().datetime().nullable().optional(),
});
export type AddInquiryActivityRequest = z.infer<typeof AddInquiryActivityRequestSchema>;

export const ConvertInquiryRequestSchema = z.object({ batchId: z.string().uuid().optional() });
export type ConvertInquiryRequest = z.infer<typeof ConvertInquiryRequestSchema>;

export const ConvertedInquirySchema = z.object({ studentId: z.string().uuid() });
export type ConvertedInquiry = z.infer<typeof ConvertedInquirySchema>;

export const InquiryListSchema = z.object({
  inquiries: z.array(InquirySchema),
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
});
export type InquiryList = z.infer<typeof InquiryListSchema>;

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
  branchName: z.string().nullable(),
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

export const StudentListSchema = z
  .object({
    students: z.array(StudentSchema),
    total: z.number().int().nonnegative().optional(),
    offset: z.number().int().nonnegative().optional(),
    limit: z.number().int().positive().optional(),
  })
  .transform((value) => ({
    ...value,
    total: value.total ?? value.students.length,
    offset: value.offset ?? 0,
    limit: value.limit ?? 25,
  }));
export type StudentList = z.infer<typeof StudentListSchema>;

export const UpdateStudentRequestSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80).optional(),
    lastName: z.string().trim().min(1).max(80).optional(),
    status: StudentStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required.");
export type UpdateStudentRequest = z.infer<typeof UpdateStudentRequestSchema>;

export const UpdateStudentGuardianRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    relationship: z.string().trim().min(1).max(40).optional(),
    email: z.string().trim().email().max(254).toLowerCase().nullable().optional(),
    phone: z.string().trim().min(7).max(30).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required.");
export type UpdateStudentGuardianRequest = z.infer<typeof UpdateStudentGuardianRequestSchema>;

export const UpdateEnrollmentStatusRequestSchema = z.object({
  status: z.enum(["active", "completed", "suspended", "withdrawn"]),
});
export type UpdateEnrollmentStatusRequest = z.infer<typeof UpdateEnrollmentStatusRequestSchema>;

export const StudentDirectoryQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: StudentStatusSchema.optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type StudentDirectoryQuery = z.infer<typeof StudentDirectoryQuerySchema>;

export const CreatedRecordSchema = z.object({ id: z.string().uuid() });
export type CreatedRecord = z.infer<typeof CreatedRecordSchema>;
export const UpdatedRecordSchema = z.object({ updated: z.boolean() });

const IanaTimezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((timezone) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }, "Enter a valid IANA timezone.");

export const AcademySettingsSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(160),
  slug: z.string().min(1).max(100),
  timezone: IanaTimezoneSchema,
  currency: z.string().length(3),
});
export type AcademySettings = z.infer<typeof AcademySettingsSchema>;

export const UpdateAcademySettingsRequestSchema = z.object({
  name: z.string().trim().min(1).max(160),
  timezone: IanaTimezoneSchema,
});
export type UpdateAcademySettingsRequest = z.infer<typeof UpdateAcademySettingsRequestSchema>;

export const AnnouncementAudienceSchema = z.enum(["everyone", "parents", "coaches"]);
export type AnnouncementAudience = z.infer<typeof AnnouncementAudienceSchema>;

export const CreateAnnouncementRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    body: z.string().trim().min(1).max(4000),
    audience: AnnouncementAudienceSchema,
    batchId: z.string().uuid().nullable(),
  })
  .superRefine((value, context) => {
    if (value.audience === "everyone" && value.batchId) {
      context.addIssue({
        code: "custom",
        path: ["batchId"],
        message: "Everyone notices cannot target one batch.",
      });
    }
  });
export type CreateAnnouncementRequest = z.infer<typeof CreateAnnouncementRequestSchema>;

export const AnnouncementStatusSchema = z.enum(["draft", "published", "archived"]);
export type AnnouncementStatus = z.infer<typeof AnnouncementStatusSchema>;

export const AdminAnnouncementSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  body: z.string().min(1),
  audience: AnnouncementAudienceSchema,
  batchId: z.string().uuid().nullable(),
  batchName: z.string().nullable(),
  status: AnnouncementStatusSchema,
  publishedAt: z.string().datetime().nullable(),
  readCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AdminAnnouncement = z.infer<typeof AdminAnnouncementSchema>;

export const AdminAnnouncementListSchema = z.object({
  announcements: z.array(AdminAnnouncementSchema),
});

export const ParentAnnouncementSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  body: z.string().min(1),
  batchName: z.string().nullable(),
  publishedAt: z.string().datetime(),
  readAt: z.string().datetime().nullable(),
});
export type ParentAnnouncement = z.infer<typeof ParentAnnouncementSchema>;

export const ParentAnnouncementListSchema = z.object({
  announcements: z.array(ParentAnnouncementSchema),
});
export const RevokedInviteSchema = z.object({ revoked: z.boolean() });

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

export const UpdateCoachRequestSchema = z
  .object({
    displayName: z.string().trim().min(1).max(160).optional(),
    phone: z.string().trim().min(7).max(30).nullable().optional(),
    specializations: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
    status: CoachStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required.");
export type UpdateCoachRequest = z.infer<typeof UpdateCoachRequestSchema>;

export const FeePaymentMethodSchema = z.enum(["cash", "upi", "bank_transfer"]);
export type FeePaymentMethod = z.infer<typeof FeePaymentMethodSchema>;

export const FeeRefundSchema = z.object({
  id: z.string().uuid(),
  amountPaise: z.number().int().positive(),
  reason: z.string().min(1),
  refundedAt: z.string().datetime(),
});
export type FeeRefund = z.infer<typeof FeeRefundSchema>;

export const FeePaymentSchema = z.object({
  id: z.string().uuid(),
  receiptNumber: z.string().min(1),
  amountPaise: z.number().int().positive(),
  method: FeePaymentMethodSchema,
  receivedAt: z.string().datetime(),
  reference: z.string().nullable(),
  note: z.string().nullable(),
  refunds: z.array(FeeRefundSchema),
});
export type FeePayment = z.infer<typeof FeePaymentSchema>;

const CalendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  }, "Enter a valid calendar date.");

export const FeeChargeSchema = z.object({
  id: z.string().uuid(),
  studentId: z.string().uuid(),
  studentName: z.string().min(1),
  invoiceNumber: z.string().min(1),
  description: z.string().min(1),
  billingPeriod: z.string().nullable(),
  dueDate: CalendarDateSchema,
  amountPaise: z.number().int().positive(),
  discountPaise: z.number().int().nonnegative(),
  discountReason: z.string().nullable(),
  currency: z.string().length(3),
  status: z.enum(["issued", "voided"]),
  paidPaise: z.number().int().nonnegative(),
  refundedPaise: z.number().int().nonnegative(),
  balancePaise: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  payments: z.array(FeePaymentSchema),
});
export type FeeCharge = z.infer<typeof FeeChargeSchema>;

export const ExpenseSchema = z.object({
  id: z.string().uuid(),
  category: z.string().min(1),
  description: z.string().min(1),
  payeeName: z.string().nullable(),
  amountPaise: z.number().int().positive(),
  method: FeePaymentMethodSchema,
  spentAt: z.string().datetime(),
  reference: z.string().nullable(),
  note: z.string().nullable(),
  status: z.enum(["recorded", "voided"]),
  voidReason: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type Expense = z.infer<typeof ExpenseSchema>;

export const FinanceDateRangeQuerySchema = z
  .object({ from: CalendarDateSchema, to: CalendarDateSchema })
  .refine((value) => value.from <= value.to, {
    path: ["to"],
    message: "End date must be on or after start date.",
  });
export type FinanceDateRangeQuery = z.infer<typeof FinanceDateRangeQuerySchema>;

export const FinanceSummarySchema = z.object({
  from: CalendarDateSchema,
  to: CalendarDateSchema,
  currency: z.string().length(3),
  invoicedPaise: z.number().int().nonnegative(),
  collectedPaise: z.number().int().nonnegative(),
  refundsPaise: z.number().int().nonnegative(),
  netCollectionsPaise: z.number().int(),
  outstandingPaise: z.number().int().nonnegative(),
  expensesPaise: z.number().int().nonnegative(),
  netCashFlowPaise: z.number().int(),
});
export type FinanceSummary = z.infer<typeof FinanceSummarySchema>;

export const ExpenseListSchema = z.object({
  expenses: z.array(ExpenseSchema),
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
});
export type ExpenseList = z.infer<typeof ExpenseListSchema>;

export const ExpenseQuerySchema = z
  .object({
    from: CalendarDateSchema.optional(),
    to: CalendarDateSchema.optional(),
    search: z.string().trim().max(120).optional(),
    offset: z.coerce.number().int().min(0).default(0),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ["to"],
    message: "End date must be on or after start date.",
  });
export type ExpenseQuery = z.infer<typeof ExpenseQuerySchema>;

export const CreateExpenseRequestSchema = z.object({
  category: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(200),
  payeeName: z.string().trim().max(160).optional(),
  amountPaise: z.number().int().min(1).max(2_000_000_000),
  method: FeePaymentMethodSchema,
  spentAt: z.string().datetime(),
  reference: z.string().trim().max(120).optional(),
  note: z.string().trim().max(240).optional(),
});
export type CreateExpenseRequest = z.infer<typeof CreateExpenseRequestSchema>;

export const VoidExpenseRequestSchema = z.object({
  reason: z.string().trim().min(1).max(240),
});
export type VoidExpenseRequest = z.infer<typeof VoidExpenseRequestSchema>;

export const FeeChargeListSchema = z.object({
  charges: z.array(FeeChargeSchema),
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
});
export type FeeChargeList = z.infer<typeof FeeChargeListSchema>;

export const FeeChargeStateFilterSchema = z.enum([
  "all",
  "open",
  "overdue",
  "paid",
  "waived",
  "voided",
]);
export type FeeChargeStateFilter = z.infer<typeof FeeChargeStateFilterSchema>;

export const FeeChargeQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  state: FeeChargeStateFilterSchema.default("all"),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type FeeChargeQuery = z.infer<typeof FeeChargeQuerySchema>;

export const CreateFeeChargeRequestSchema = z
  .object({
    studentId: z.string().uuid(),
    description: z.string().trim().min(1).max(200),
    billingPeriod: z.string().trim().max(80).optional(),
    dueDate: CalendarDateSchema,
    amountPaise: z.number().int().min(1).max(2_000_000_000),
    discountPaise: z.number().int().min(0).max(2_000_000_000).default(0),
    discountReason: z.string().trim().min(1).max(240).optional(),
  })
  .refine((value) => value.discountPaise <= value.amountPaise, {
    path: ["discountPaise"],
    message: "Discount cannot exceed the charge amount.",
  })
  .refine((value) => value.discountPaise === 0 || !!value.discountReason, {
    path: ["discountReason"],
    message: "Add a reason for a discount or waiver.",
  });
export type CreateFeeChargeRequest = z.infer<typeof CreateFeeChargeRequestSchema>;

export const RecordFeePaymentRequestSchema = z.object({
  idempotencyKey: z.string().uuid(),
  amountPaise: z.number().int().min(1).max(2_000_000_000),
  method: FeePaymentMethodSchema,
  receivedAt: z.string().datetime().optional(),
  reference: z.string().trim().max(120).optional(),
  note: z.string().trim().max(240).optional(),
});
export type RecordFeePaymentRequest = z.infer<typeof RecordFeePaymentRequestSchema>;

export const RefundFeePaymentRequestSchema = z.object({
  idempotencyKey: z.string().uuid(),
  amountPaise: z.number().int().min(1).max(2_000_000_000),
  reason: z.string().trim().min(1).max(240),
  refundedAt: z.string().datetime().optional(),
});
export type RefundFeePaymentRequest = z.infer<typeof RefundFeePaymentRequestSchema>;

export const VoidFeeChargeRequestSchema = z.object({
  reason: z.string().trim().min(1).max(240),
});
export type VoidFeeChargeRequest = z.infer<typeof VoidFeeChargeRequestSchema>;

export const ParentStudentFinanceSchema = z.object({
  studentId: z.string().uuid(),
  currency: z.string().length(3),
  charges: z.array(FeeChargeSchema),
});
export type ParentStudentFinance = z.infer<typeof ParentStudentFinanceSchema>;

export const AssignCoachRequestSchema = z.object({ coachId: z.string().uuid() });
export type AssignCoachRequest = z.infer<typeof AssignCoachRequestSchema>;

export const AcademyBranchSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  address: z.string().nullable(),
  isActive: z.boolean(),
});
export type AcademyBranch = z.infer<typeof AcademyBranchSchema>;
export const AcademyBranchListSchema = z.object({ branches: z.array(AcademyBranchSchema) });

export const CreateAcademyBranchRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(500).nullable().optional(),
});
export type CreateAcademyBranchRequest = z.infer<typeof CreateAcademyBranchRequestSchema>;

export const UpdateAcademyBranchRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    address: z.string().trim().max(500).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required.");
export type UpdateAcademyBranchRequest = z.infer<typeof UpdateAcademyBranchRequestSchema>;

const LocalTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

export const ScheduleSchema = z.object({
  id: z.string().uuid(),
  batchId: z.string().uuid(),
  batchName: z.string().min(1),
  branchId: z.string().uuid().nullable(),
  branchName: z.string().nullable(),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: LocalTimeSchema,
  endTime: LocalTimeSchema,
  venue: z.string().nullable(),
  isActive: z.boolean(),
});
export type Schedule = z.infer<typeof ScheduleSchema>;

const ScheduleRequestShape = {
  batchId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional(),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: LocalTimeSchema,
  endTime: LocalTimeSchema,
  venue: z.string().trim().max(160).optional(),
};

export const CreateScheduleRequestSchema = z
  .object(ScheduleRequestShape)
  .refine((schedule) => schedule.startTime < schedule.endTime, {
    path: ["endTime"],
    message: "End time must be after start time.",
  });
export type CreateScheduleRequest = z.infer<typeof CreateScheduleRequestSchema>;

export const UpdateScheduleRequestSchema = z
  .object({ ...ScheduleRequestShape, isActive: z.boolean().optional() })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required")
  .refine((value) => !value.startTime || !value.endTime || value.startTime < value.endTime, {
    path: ["endTime"],
    message: "End time must be after start time.",
  });
export type UpdateScheduleRequest = z.infer<typeof UpdateScheduleRequestSchema>;

export const GenerateSessionsRequestSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type GenerateSessionsRequest = z.infer<typeof GenerateSessionsRequestSchema>;

export const CreateSessionRequestSchema = z.object({
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;

export const RescheduleSessionRequestSchema = CreateSessionRequestSchema;
export type RescheduleSessionRequest = z.infer<typeof RescheduleSessionRequestSchema>;

export const SessionStatusSchema = z.enum(["scheduled", "completed", "cancelled"]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const TrainingSessionSchema = z.object({
  id: z.string().uuid(),
  batchId: z.string().uuid(),
  scheduleId: z.string().uuid().nullable().optional(),
  batchName: z.string().min(1),
  branchName: z.string().nullable(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  venue: z.string().nullable(),
  status: SessionStatusSchema,
});
export type TrainingSession = z.infer<typeof TrainingSessionSchema>;

export const CoachStudentSchema = z.object({
  studentId: z.string().uuid(),
  studentName: z.string().min(1),
  batches: z.array(z.object({ id: z.string().uuid(), name: z.string().min(1) })),
});
export type CoachStudent = z.infer<typeof CoachStudentSchema>;

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
  batchId: z.string().uuid(),
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

export const AttendanceSessionSummarySchema = z.object({
  id: z.string().uuid(),
  batchId: z.string().uuid(),
  batchName: z.string().min(1),
  branchName: z.string().nullable(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  status: SessionStatusSchema,
  expectedCount: z.number().int().nonnegative(),
  markedCount: z.number().int().nonnegative(),
});
export type AttendanceSessionSummary = z.infer<typeof AttendanceSessionSummarySchema>;

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
