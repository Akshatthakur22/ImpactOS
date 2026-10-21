import { Router } from "express";
import { z } from "zod";
import {
  AddStudentGuardianRequestSchema,
  CreateBatchRequestSchema,
  CreateDisciplineRequestSchema,
  CreateEnrollmentRequestSchema,
  CreateProgramRequestSchema,
  CreateStudentRequestSchema,
  UpdateAcademySettingsRequestSchema,
  UpdateBatchRequestSchema,
  UpdateDisciplineRequestSchema,
  UpdateProgramRequestSchema,
  StudentDirectoryQuerySchema,
  UpdateEnrollmentStatusRequestSchema,
  UpdateStudentGuardianRequestSchema,
  UpdateStudentRequestSchema,
} from "@sportdesk/contracts";
import type { SportDeskAuthService } from "../auth/auth.service.js";
import { requireAnyPermission, requirePermission } from "../auth/authorization.js";
import type { SportDeskAcademyService } from "./academy.service.js";

export function createAcademyRouter(options: {
  auth: SportDeskAuthService;
  academy: SportDeskAcademyService;
}): Router {
  const router = Router();

  router.get("/academy/settings", async (request, response) => {
    const user = await requireAnyPermission(request, options.auth, [
      "settings:manage",
      "schedules:read",
      "attendance:read",
      "payments:read",
      "expenses:manage",
      "reports:read",
    ]);
    response.status(200).json({ data: await options.academy.getSettings(user.academyId) });
  });

  router.patch("/academy/settings", async (request, response) => {
    const user = await requirePermission(request, options.auth, "settings:manage");
    const changes = UpdateAcademySettingsRequestSchema.parse(request.body);
    response.status(200).json({
      data: await options.academy.updateSettings(user.academyId, changes),
    });
  });

  router.get("/academy/catalog", async (request, response) => {
    const user = await requireAnyPermission(request, options.auth, [
      "students:read",
      "academy:manage",
      "coaches:read",
      "schedules:read",
      "announcements:manage",
    ]);
    response.status(200).json({ data: await options.academy.getCatalog(user.academyId) });
  });

  router.post("/disciplines", async (request, response) => {
    const user = await requirePermission(request, options.auth, "academy:manage");
    const input = CreateDisciplineRequestSchema.parse(request.body);
    const record = await options.academy.createDiscipline({
      ...input,
      academyId: user.academyId,
      createdBy: user.id,
    });
    response.status(201).json({ data: record });
  });

  router.patch("/disciplines/:disciplineId", async (request, response) => {
    const user = await requirePermission(request, options.auth, "academy:manage");
    const disciplineId = z.string().uuid().parse(request.params.disciplineId);
    const changes = UpdateDisciplineRequestSchema.parse(request.body);
    const result = await options.academy.updateDiscipline({
      academyId: user.academyId,
      disciplineId,
      changes,
    });
    response.status(200).json({ data: result });
  });

  router.post("/programs", async (request, response) => {
    const user = await requirePermission(request, options.auth, "academy:manage");
    const input = CreateProgramRequestSchema.parse(request.body);
    const record = await options.academy.createProgram({
      ...input,
      academyId: user.academyId,
      createdBy: user.id,
    });
    response.status(201).json({ data: record });
  });

  router.patch("/programs/:programId", async (request, response) => {
    const user = await requirePermission(request, options.auth, "academy:manage");
    const programId = z.string().uuid().parse(request.params.programId);
    const changes = UpdateProgramRequestSchema.parse(request.body);
    const result = await options.academy.updateProgram({
      academyId: user.academyId,
      programId,
      changes,
    });
    response.status(200).json({ data: result });
  });

  router.post("/batches", async (request, response) => {
    const user = await requirePermission(request, options.auth, "academy:manage");
    const input = CreateBatchRequestSchema.parse(request.body);
    const record = await options.academy.createBatch({
      ...input,
      academyId: user.academyId,
      createdBy: user.id,
    });
    response.status(201).json({ data: record });
  });

  router.patch("/batches/:batchId", async (request, response) => {
    const user = await requirePermission(request, options.auth, "academy:manage");
    const batchId = z.string().uuid().parse(request.params.batchId);
    const changes = UpdateBatchRequestSchema.parse(request.body);
    const result = await options.academy.updateBatch({
      academyId: user.academyId,
      batchId,
      changes,
    });
    response.status(200).json({ data: result });
  });

  router.get("/students", async (request, response) => {
    const user = await requirePermission(request, options.auth, "students:read");
    const query = StudentDirectoryQuerySchema.parse(request.query);
    response.status(200).json({ data: await options.academy.listStudents(user.academyId, query) });
  });

  router.get("/students/:studentId", async (request, response) => {
    const user = await requirePermission(request, options.auth, "students:read");
    const studentId = z.string().uuid().parse(request.params.studentId);
    response.status(200).json({
      data: await options.academy.getStudent(user.academyId, studentId),
    });
  });

  router.post("/students", async (request, response) => {
    const user = await requirePermission(request, options.auth, "students:write");
    const input = CreateStudentRequestSchema.parse(request.body);
    const record = await options.academy.createStudent({
      ...input,
      academyId: user.academyId,
      createdBy: user.id,
    });
    response.status(201).json({ data: record });
  });

  router.post("/students/:studentId/enrollments", async (request, response) => {
    const user = await requirePermission(request, options.auth, "students:write");
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

  router.patch("/students/:studentId", async (request, response) => {
    const user = await requirePermission(request, options.auth, "students:write");
    const studentId = z.string().uuid().parse(request.params.studentId);
    const changes = UpdateStudentRequestSchema.parse(request.body);
    const result = await options.academy.updateStudent({
      academyId: user.academyId,
      studentId,
      changes,
    });
    response.status(200).json({ data: result });
  });

  router.delete("/students/:studentId", async (request, response) => {
    const user = await requirePermission(request, options.auth, "students:write");
    const studentId = z.string().uuid().parse(request.params.studentId);
    response.status(200).json({
      data: await options.academy.deleteStudent({ academyId: user.academyId, studentId }),
    });
  });

  router.post("/students/:studentId/guardians", async (request, response) => {
    const user = await requirePermission(request, options.auth, "students:write");
    const studentId = z.string().uuid().parse(request.params.studentId);
    const input = AddStudentGuardianRequestSchema.parse(request.body);
    const record = await options.academy.addStudentGuardian({
      ...input,
      academyId: user.academyId,
      createdBy: user.id,
      studentId,
    });
    response.status(201).json({ data: record });
  });

  router.patch("/students/:studentId/guardians/:guardianId", async (request, response) => {
    const user = await requirePermission(request, options.auth, "students:write");
    const studentId = z.string().uuid().parse(request.params.studentId);
    const guardianId = z.string().uuid().parse(request.params.guardianId);
    const changes = UpdateStudentGuardianRequestSchema.parse(request.body);
    const result = await options.academy.updateStudentGuardian({
      academyId: user.academyId,
      studentId,
      guardianId,
      changes,
    });
    response.status(200).json({ data: result });
  });

  router.patch("/students/:studentId/enrollments/:enrollmentId", async (request, response) => {
    const user = await requirePermission(request, options.auth, "students:write");
    const studentId = z.string().uuid().parse(request.params.studentId);
    const enrollmentId = z.string().uuid().parse(request.params.enrollmentId);
    const { status } = UpdateEnrollmentStatusRequestSchema.parse(request.body);
    const result = await options.academy.updateEnrollmentStatus({
      academyId: user.academyId,
      studentId,
      enrollmentId,
      status,
    });
    response.status(200).json({ data: result });
  });

  return router;
}
