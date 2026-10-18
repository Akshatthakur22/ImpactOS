import { Router, type Request } from "express";
import { z } from "zod";
import {
  CreateBatchRequestSchema,
  CreateDisciplineRequestSchema,
  CreateEnrollmentRequestSchema,
  CreateProgramRequestSchema,
  CreateStudentRequestSchema,
} from "@sportdesk/contracts";
import type { SportDeskAuthService } from "../auth/auth.service.js";
import { AuthError } from "../auth/auth.service.js";
import type { SportDeskAcademyService } from "./academy.service.js";

async function ownerFromRequest(request: Request, auth: SportDeskAuthService) {
  const token = request.get("authorization")?.match(/^Bearer ([A-Za-z0-9._~-]+)$/)?.[1];
  if (!token) throw new AuthError(401, "UNAUTHENTICATED", "Authentication is required.");
  const user = await auth.authenticate(token);
  if (!user) throw new AuthError(401, "UNAUTHENTICATED", "Authentication is required.");
  if (user.role !== "owner") {
    throw new AuthError(403, "FORBIDDEN", "Owner access is required for academy records.");
  }
  return user;
}

export function createAcademyRouter(options: {
  auth: SportDeskAuthService;
  academy: SportDeskAcademyService;
}): Router {
  const router = Router();

  router.get("/academy/catalog", async (request, response) => {
    const user = await ownerFromRequest(request, options.auth);
    response.status(200).json({ data: await options.academy.getCatalog(user.academyId) });
  });

  router.post("/disciplines", async (request, response) => {
    const user = await ownerFromRequest(request, options.auth);
    const input = CreateDisciplineRequestSchema.parse(request.body);
    const record = await options.academy.createDiscipline({
      ...input,
      academyId: user.academyId,
      createdBy: user.id,
    });
    response.status(201).json({ data: record });
  });

  router.post("/programs", async (request, response) => {
    const user = await ownerFromRequest(request, options.auth);
    const input = CreateProgramRequestSchema.parse(request.body);
    const record = await options.academy.createProgram({
      ...input,
      academyId: user.academyId,
      createdBy: user.id,
    });
    response.status(201).json({ data: record });
  });

  router.post("/batches", async (request, response) => {
    const user = await ownerFromRequest(request, options.auth);
    const input = CreateBatchRequestSchema.parse(request.body);
    const record = await options.academy.createBatch({
      ...input,
      academyId: user.academyId,
      createdBy: user.id,
    });
    response.status(201).json({ data: record });
  });

  router.get("/students", async (request, response) => {
    const user = await ownerFromRequest(request, options.auth);
    response
      .status(200)
      .json({ data: { students: await options.academy.listStudents(user.academyId) } });
  });

  router.post("/students", async (request, response) => {
    const user = await ownerFromRequest(request, options.auth);
    const input = CreateStudentRequestSchema.parse(request.body);
    const record = await options.academy.createStudent({
      ...input,
      academyId: user.academyId,
      createdBy: user.id,
    });
    response.status(201).json({ data: record });
  });

  router.post("/students/:studentId/enrollments", async (request, response) => {
    const user = await ownerFromRequest(request, options.auth);
    const input = CreateEnrollmentRequestSchema.parse(request.body);
    const studentId = z.string().uuid().parse(request.params.studentId);
    const record = await options.academy.createEnrollment({
      ...input,
      academyId: user.academyId,
      createdBy: user.id,
      studentId,
    });
    response.status(201).json({ data: record });
  });

  return router;
}
