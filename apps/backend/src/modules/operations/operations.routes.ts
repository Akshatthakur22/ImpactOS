import { Router, type Request } from "express";
import { z } from "zod";
import {
  AssignCoachRequestSchema,
  CreateAcademyBranchRequestSchema,
  CreateCoachRequestSchema,
  CreateScheduleRequestSchema,
  CreateSessionRequestSchema,
  GenerateSessionsRequestSchema,
  CorrectAttendanceRequestSchema,
  RecordAttendanceRequestSchema,
  UpdateCoachRequestSchema,
  UpdateAcademyBranchRequestSchema,
  UpdateScheduleRequestSchema,
  RescheduleSessionRequestSchema,
  UpdateCoachProfileRequestSchema,
  CoachCheckInRequestSchema,
} from "@sportdesk/contracts";
import type { SportDeskAuthService } from "../auth/auth.service.js";
import { AuthError } from "../auth/auth.service.js";
import { requireAnyPermission, requirePermission } from "../auth/authorization.js";
import { OperationsError, type SportDeskOperationsService } from "./operations.service.js";
import type { SportDeskPushService } from "../push/push.service.js";

async function authenticatedUser(request: Request, auth: SportDeskAuthService) {
  const token = request.get("authorization")?.match(/^Bearer ([A-Za-z0-9._~-]+)$/)?.[1];
  if (!token) throw new AuthError(401, "UNAUTHENTICATED", "Authentication is required.");
  const user = await auth.authenticate(token);
  if (!user) throw new AuthError(401, "UNAUTHENTICATED", "Authentication is required.");
  return user;
}

async function coachFromRequest(request: Request, auth: SportDeskAuthService) {
  const user = await authenticatedUser(request, auth);
  if (user.role !== "coach") {
    throw new AuthError(403, "FORBIDDEN", "Coach access is required for this operation.");
  }
  return user;
}

function dateQuery(value: unknown, fallback: Date) {
  if (typeof value !== "string") return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function attendanceRange(request: Request) {
  const now = new Date();
  const from =
    typeof request.query.from === "string"
      ? new Date(request.query.from)
      : new Date(now.getTime() - 30 * 86_400_000);
  const to = typeof request.query.to === "string" ? new Date(request.query.to) : now;
  if (
    Number.isNaN(from.getTime()) ||
    Number.isNaN(to.getTime()) ||
    from > to ||
    to.getTime() - from.getTime() > 366 * 86_400_000
  ) {
    throw new OperationsError(
      400,
      "INVALID_DATE_RANGE",
      "Use a valid attendance date range no longer than one year.",
    );
  }
  return { from, to };
}

function attendanceSessionRange(request: Request) {
  const now = new Date();
  const from =
    typeof request.query.from === "string"
      ? new Date(request.query.from)
      : new Date(now.getTime() - 7 * 86_400_000);
  const to =
    typeof request.query.to === "string"
      ? new Date(request.query.to)
      : new Date(now.getTime() + 60 * 86_400_000);
  if (
    Number.isNaN(from.getTime()) ||
    Number.isNaN(to.getTime()) ||
    from > to ||
    to.getTime() - from.getTime() > 90 * 86_400_000
  ) {
    throw new OperationsError(
      400,
      "INVALID_DATE_RANGE",
      "Use a valid session date range of no more than 90 days.",
    );
  }
  return { from, to };
}

export function createOperationsRouter(options: {
  auth: SportDeskAuthService;
  operations: SportDeskOperationsService;
  push?: SportDeskPushService;
}): Router {
  const router = Router();

  router.get("/branches", async (request, response) => {
    const user = await requireAnyPermission(request, options.auth, ["settings:manage", "schedules:read"]);
    response
      .status(200)
      .json({ data: { branches: await options.operations.listBranches(user.academyId) } });
  });

  router.post("/branches", async (request, response) => {
    const user = await requirePermission(request, options.auth, "settings:manage");
    const input = CreateAcademyBranchRequestSchema.parse(request.body);
    const branch = await options.operations.createBranch({
      ...input,
      academyId: user.academyId,
      createdBy: user.id,
    });
    response.status(201).json({ data: branch });
  });

  router.patch("/branches/:branchId", async (request, response) => {
    const user = await requirePermission(request, options.auth, "settings:manage");
    const changes = UpdateAcademyBranchRequestSchema.parse(request.body);
    const branch = await options.operations.updateBranch({
      academyId: user.academyId,
      branchId: z.string().uuid().parse(request.params.branchId),
      changes,
    });
    response.status(200).json({ data: branch });
  });

  router.get("/coaches", async (request, response) => {
    const user = await requirePermission(request, options.auth, "coaches:read");
    response
      .status(200)
      .json({ data: { coaches: await options.operations.listCoaches(user.academyId) } });
  });

  router.get("/coaches/:coachId", async (request, response) => {
    const user = await requirePermission(request, options.auth, "coaches:read");
    const coachId = z.string().uuid().parse(request.params.coachId);
    response.status(200).json({ data: await options.operations.getCoachDetail(user.academyId, coachId) });
  });

  router.post("/coaches", async (request, response) => {
    const user = await requirePermission(request, options.auth, "coaches:write");
    const input = CreateCoachRequestSchema.parse(request.body);
    const coach = await options.operations.createCoach({
      ...input,
      academyId: user.academyId,
      createdBy: user.id,
    });
    response.status(201).json({ data: coach });
  });

  router.patch("/coaches/:coachId", async (request, response) => {
    const user = await requirePermission(request, options.auth, "coaches:write");
    const coachId = z.string().uuid().parse(request.params.coachId);
    const changes = UpdateCoachRequestSchema.parse(request.body);
    const result = await options.operations.updateCoach({
      academyId: user.academyId,
      coachId,
      changes,
    });
    response.status(200).json({ data: result });
  });

  router.delete("/coaches/:coachId", async (request, response) => {
    const user = await requirePermission(request, options.auth, "coaches:write");
    const coachId = z.string().uuid().parse(request.params.coachId);
    response.status(200).json({ data: await options.operations.deleteCoach({ academyId: user.academyId, coachId }) });
  });

  router.post("/batches/:batchId/coaches", async (request, response) => {
    const user = await requirePermission(request, options.auth, "coaches:write");
    const input = AssignCoachRequestSchema.parse(request.body);
    const assignment = await options.operations.assignCoach({
      ...input,
      batchId: z.string().uuid().parse(request.params.batchId),
      academyId: user.academyId,
      createdBy: user.id,
    });
    response.status(201).json({ data: assignment });
  });

  router.delete("/batches/:batchId/coaches/:coachId", async (request, response) => {
    const user = await requirePermission(request, options.auth, "coaches:write");
    response.status(200).json({ data: await options.operations.unassignCoach({
      academyId: user.academyId,
      batchId: z.string().uuid().parse(request.params.batchId),
      coachId: z.string().uuid().parse(request.params.coachId),
    }) });
  });

  router.get("/schedules", async (request, response) => {
    const user = await requirePermission(request, options.auth, "schedules:read");
    response
      .status(200)
      .json({ data: { schedules: await options.operations.listSchedules(user.academyId) } });
  });

  router.patch("/schedules/:scheduleId", async (request, response) => {
    const user = await requirePermission(request, options.auth, "schedules:write");
    const changes = UpdateScheduleRequestSchema.parse(request.body);
    const schedule = await options.operations.updateSchedule({
      academyId: user.academyId,
      scheduleId: z.string().uuid().parse(request.params.scheduleId),
      changes,
    });
    response.status(200).json({ data: schedule });
  });

  router.post("/schedules/generate-sessions", async (request, response) => {
    const user = await requirePermission(request, options.auth, "schedules:write");
    const input = GenerateSessionsRequestSchema.parse(request.body);
    const result = await options.operations.generateSessions({
      ...input,
      academyId: user.academyId,
      createdBy: user.id,
    });
    response.status(200).json({ data: result });
  });

  router.get("/sessions", async (request, response) => {
    const user = await requirePermission(request, options.auth, "schedules:read");
    const now = new Date();
    const from =
      typeof request.query.from === "string"
        ? new Date(request.query.from)
        : new Date(now.getTime() - 7 * 86_400_000);
    const to =
      typeof request.query.to === "string"
        ? new Date(request.query.to)
        : new Date(now.getTime() + 60 * 86_400_000);
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from > to ||
      to.getTime() - from.getTime() > 90 * 86_400_000
    ) {
      throw new OperationsError(
        400,
        "INVALID_DATE_RANGE",
        "Use a valid session date range of no more than 90 days.",
      );
    }
    response.status(200).json({
      data: { sessions: await options.operations.listSessions(user.academyId, from, to) },
    });
  });

  router.patch("/sessions/:sessionId", async (request, response) => {
    const user = await requirePermission(request, options.auth, "schedules:write");
    const input = RescheduleSessionRequestSchema.parse(request.body);
    const session = await options.operations.rescheduleSession({
      ...input,
      academyId: user.academyId,
      sessionId: z.string().uuid().parse(request.params.sessionId),
    });
    response.status(200).json({ data: session });
  });

  router.post("/sessions/:sessionId/cancel", async (request, response) => {
    const user = await requirePermission(request, options.auth, "schedules:write");
    const session = await options.operations.cancelSession({
      academyId: user.academyId,
      sessionId: z.string().uuid().parse(request.params.sessionId),
    });
    response.status(200).json({ data: session });
  });

  router.get("/attendance", async (request, response) => {
    const user = await requireAnyPermission(request, options.auth, ["attendance:read", "reports:read"]);
    const { from, to } = attendanceRange(request);
    const { offset, limit } = z.object({
      offset: z.coerce.number().int().min(0).default(0),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }).parse(request.query);
    const batchId =
      typeof request.query.batchId === "string"
        ? z.string().uuid().parse(request.query.batchId)
        : undefined;
    const recordedBy =
      typeof request.query.recordedBy === "string"
        ? z.string().uuid().parse(request.query.recordedBy)
        : undefined;
    const sessionId =
      typeof request.query.sessionId === "string"
        ? z.string().uuid().parse(request.query.sessionId)
        : undefined;
    const records = await options.operations.listAttendance(user.academyId, from, to, {
      ...(batchId ? { batchId } : {}),
      ...(recordedBy ? { recordedBy } : {}),
      ...(sessionId ? { sessionId } : {}),
      offset,
      limit,
    });
    response.status(200).json({ data: records });
  });

  router.get("/attendance/sessions", async (request, response) => {
    const user = await requirePermission(request, options.auth, "attendance:read");
    const { from, to } = attendanceSessionRange(request);
    const batchId =
      typeof request.query.batchId === "string"
        ? z.string().uuid().parse(request.query.batchId)
        : undefined;
    const sessions = await options.operations.listAttendanceSessions(
      user.academyId,
      from,
      to,
      batchId,
    );
    response.status(200).json({ data: { sessions } });
  });

  router.patch("/attendance/:attendanceId", async (request, response) => {
    const user = await requirePermission(request, options.auth, "attendance:correct");
    const input = CorrectAttendanceRequestSchema.parse(request.body);
    const correction = await options.operations.correctAttendance({
      ...input,
      academyId: user.academyId,
      correctedBy: user.id,
      attendanceId: z.string().uuid().parse(request.params.attendanceId),
    });
    response.status(200).json({ data: correction });
  });

  router.get("/attendance/:attendanceId/corrections", async (request, response) => {
    const user = await requirePermission(request, options.auth, "attendance:read");
    const corrections = await options.operations.listAttendanceCorrections(
      user.academyId,
      z.string().uuid().parse(request.params.attendanceId),
    );
    response.status(200).json({ data: { corrections } });
  });

  router.post("/schedules", async (request, response) => {
    const user = await requirePermission(request, options.auth, "schedules:write");
    const input = CreateScheduleRequestSchema.parse(request.body);
    const schedule = await options.operations.createSchedule({
      ...input,
      academyId: user.academyId,
      createdBy: user.id,
    });
    response.status(201).json({ data: schedule });
  });

  router.post("/schedules/:scheduleId/sessions", async (request, response) => {
    const user = await requirePermission(request, options.auth, "schedules:write");
    const input = CreateSessionRequestSchema.parse(request.body);
    const session = await options.operations.createSession({
      ...input,
      scheduleId: request.params.scheduleId,
      academyId: user.academyId,
      createdBy: user.id,
    });
    response.status(201).json({ data: session });
  });

  router.get("/coach/me/sessions", async (request, response) => {
    const user = await coachFromRequest(request, options.auth);
    const now = new Date();
    const from = dateQuery(request.query.from, new Date(now.getTime() - 86_400_000));
    const to = dateQuery(request.query.to, new Date(now.getTime() + 14 * 86_400_000));
    const sessions = await options.operations.listCoachSessions(user.academyId, user.id, from, to);
    response.status(200).json({ data: { sessions } });
  });

  router.get("/coach/me/students", async (request, response) => {
    const user = await coachFromRequest(request, options.auth);
    const students = await options.operations.listCoachStudents(user.academyId, user.id);
    response.status(200).json({ data: { students } });
  });

  router.put("/coach/me/profile", async (request, response) => {
    const user = await coachFromRequest(request, options.auth);
    const input = UpdateCoachProfileRequestSchema.parse(request.body);
    const profile = await options.operations.updateCoachSelfProfile(
      user.academyId,
      user.id,
      input.displayName,
    );
    response.status(200).json({ data: profile });
  });

  router.get("/coach/sessions/:sessionId/roster", async (request, response) => {
    const user = await coachFromRequest(request, options.auth);
    const roster = await options.operations.getSessionRoster(
      user.academyId,
      request.params.sessionId,
      user.id,
    );
    response.status(200).json({ data: roster });
  });

  router.post("/coach/sessions/:sessionId/check-in", async (request, response) => {
    const user = await coachFromRequest(request, options.auth);
    const position = CoachCheckInRequestSchema.parse(request.body);
    const presence = await options.operations.checkInCoach(
      user.academyId,
      request.params.sessionId,
      user.id,
      position,
    );
    response.status(200).json({ data: presence });
  });

  router.post("/coach/sessions/:sessionId/check-out", async (request, response) => {
    const user = await coachFromRequest(request, options.auth);
    const presence = await options.operations.checkOutCoach(
      user.academyId,
      request.params.sessionId,
      user.id,
    );
    response.status(200).json({ data: presence });
  });

  router.put("/coach/sessions/:sessionId/attendance", async (request, response) => {
    const user = await coachFromRequest(request, options.auth);
    const input = RecordAttendanceRequestSchema.parse(request.body);
    const records = await options.operations.recordAttendance({
      ...input,
      academyId: user.academyId,
      sessionId: request.params.sessionId,
      userId: user.id,
    });
    response.status(200).json({ data: { records } });
  });

  router.post("/coach/sessions/:sessionId/complete", async (request, response) => {
    const user = await coachFromRequest(request, options.auth);
    const session = await options.operations.completeSession(
      user.academyId,
      request.params.sessionId,
      user.id,
    );
    if (!session) throw new OperationsError(404, "SESSION_NOT_FOUND", "The session was not found.");
    if (options.push) {
      try {
        await options.push.attendanceRecorded(user.academyId, session.id);
      } catch (error) {
        console.warn(
          "Attendance push alert could not be queued.",
          error instanceof Error ? error.message : "unknown error",
        );
      }
    }
    response.status(200).json({ data: session });
  });

  return router;
}
