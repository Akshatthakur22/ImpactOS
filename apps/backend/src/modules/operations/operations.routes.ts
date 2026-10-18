import { Router, type Request } from "express";
import { z } from "zod";
import {
  AssignCoachRequestSchema,
  CreateAcademyBranchRequestSchema,
  CreateCoachRequestSchema,
  CreateScheduleRequestSchema,
  CreateSessionRequestSchema,
  CorrectAttendanceRequestSchema,
  RecordAttendanceRequestSchema,
  UpdateCoachRequestSchema,
  UpdateAcademyBranchRequestSchema,
} from "@sportdesk/contracts";
import type { SportDeskAuthService } from "../auth/auth.service.js";
import { AuthError } from "../auth/auth.service.js";
import { OperationsError, type SportDeskOperationsService } from "./operations.service.js";

async function authenticatedUser(request: Request, auth: SportDeskAuthService) {
  const token = request.get("authorization")?.match(/^Bearer ([A-Za-z0-9._~-]+)$/)?.[1];
  if (!token) throw new AuthError(401, "UNAUTHENTICATED", "Authentication is required.");
  const user = await auth.authenticate(token);
  if (!user) throw new AuthError(401, "UNAUTHENTICATED", "Authentication is required.");
  return user;
}

async function ownerFromRequest(request: Request, auth: SportDeskAuthService) {
  const user = await authenticatedUser(request, auth);
  if (user.role !== "owner") {
    throw new AuthError(403, "FORBIDDEN", "Owner access is required for this operation.");
  }
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
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    throw new OperationsError(
      400,
      "INVALID_DATE_RANGE",
      "Use a valid date range with a start before the end.",
    );
  }
  return { from, to };
}

export function createOperationsRouter(options: {
  auth: SportDeskAuthService;
  operations: SportDeskOperationsService;
}): Router {
  const router = Router();

  router.get("/branches", async (request, response) => {
    const user = await ownerFromRequest(request, options.auth);
    response.status(200).json({ data: { branches: await options.operations.listBranches(user.academyId) } });
  });

  router.post("/branches", async (request, response) => {
    const user = await ownerFromRequest(request, options.auth);
    const input = CreateAcademyBranchRequestSchema.parse(request.body);
    const branch = await options.operations.createBranch({
      ...input,
      academyId: user.academyId,
      createdBy: user.id,
    });
    response.status(201).json({ data: branch });
  });

  router.patch("/branches/:branchId", async (request, response) => {
    const user = await ownerFromRequest(request, options.auth);
    const changes = UpdateAcademyBranchRequestSchema.parse(request.body);
    const branch = await options.operations.updateBranch({
      academyId: user.academyId,
      branchId: z.string().uuid().parse(request.params.branchId),
      changes,
    });
    response.status(200).json({ data: branch });
  });

  router.get("/coaches", async (request, response) => {
    const user = await ownerFromRequest(request, options.auth);
    response
      .status(200)
      .json({ data: { coaches: await options.operations.listCoaches(user.academyId) } });
  });

  router.post("/coaches", async (request, response) => {
    const user = await ownerFromRequest(request, options.auth);
    const input = CreateCoachRequestSchema.parse(request.body);
    const coach = await options.operations.createCoach({
      ...input,
      academyId: user.academyId,
      createdBy: user.id,
    });
    response.status(201).json({ data: coach });
  });

  router.patch("/coaches/:coachId", async (request, response) => {
    const user = await ownerFromRequest(request, options.auth);
    const coachId = z.string().uuid().parse(request.params.coachId);
    const changes = UpdateCoachRequestSchema.parse(request.body);
    const result = await options.operations.updateCoach({
      academyId: user.academyId,
      coachId,
      changes,
    });
    response.status(200).json({ data: result });
  });

  router.post("/batches/:batchId/coaches", async (request, response) => {
    const user = await ownerFromRequest(request, options.auth);
    const input = AssignCoachRequestSchema.parse(request.body);
    const assignment = await options.operations.assignCoach({
      ...input,
      batchId: z.string().uuid().parse(request.params.batchId),
      academyId: user.academyId,
      createdBy: user.id,
    });
    response.status(201).json({ data: assignment });
  });

  router.get("/schedules", async (request, response) => {
    const user = await ownerFromRequest(request, options.auth);
    response
      .status(200)
      .json({ data: { schedules: await options.operations.listSchedules(user.academyId) } });
  });

  router.get("/attendance", async (request, response) => {
    const user = await ownerFromRequest(request, options.auth);
    const { from, to } = attendanceRange(request);
    const records = await options.operations.listAttendance(user.academyId, from, to);
    response.status(200).json({ data: { records } });
  });

  router.patch("/attendance/:attendanceId", async (request, response) => {
    const user = await ownerFromRequest(request, options.auth);
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
    const user = await ownerFromRequest(request, options.auth);
    const corrections = await options.operations.listAttendanceCorrections(
      user.academyId,
      z.string().uuid().parse(request.params.attendanceId),
    );
    response.status(200).json({ data: { corrections } });
  });

  router.post("/schedules", async (request, response) => {
    const user = await ownerFromRequest(request, options.auth);
    const input = CreateScheduleRequestSchema.parse(request.body);
    const schedule = await options.operations.createSchedule({
      ...input,
      academyId: user.academyId,
      createdBy: user.id,
    });
    response.status(201).json({ data: schedule });
  });

  router.post("/schedules/:scheduleId/sessions", async (request, response) => {
    const user = await ownerFromRequest(request, options.auth);
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

  router.get("/coach/sessions/:sessionId/roster", async (request, response) => {
    const user = await coachFromRequest(request, options.auth);
    const roster = await options.operations.getSessionRoster(
      user.academyId,
      request.params.sessionId,
      user.id,
    );
    response.status(200).json({ data: roster });
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
    response.status(200).json({ data: session });
  });

  return router;
}
