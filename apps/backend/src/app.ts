import { randomUUID } from "node:crypto";
import cors from "cors";
import cookieParser from "cookie-parser";
import express, { type ErrorRequestHandler, type Express } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { ZodError } from "zod";
import { AuthError, type SportDeskAuthService } from "./modules/auth/auth.service.js";
import { requirePermission } from "./modules/auth/authorization.js";
import { createAuthRouter } from "./modules/auth/auth.routes.js";
import { createAcademyRouter } from "./modules/academy/academy.routes.js";
import { AcademyError, type SportDeskAcademyService } from "./modules/academy/academy.service.js";
import { createOperationsRouter } from "./modules/operations/operations.routes.js";
import {
  OperationsError,
  type SportDeskOperationsService,
} from "./modules/operations/operations.service.js";
import { createParentsRouter } from "./modules/parents/parents.routes.js";
import { ParentError, type SportDeskParentsService } from "./modules/parents/parents.service.js";
import type { SportDeskDashboardService } from "./modules/dashboard/dashboard.service.js";
import { createFinanceRouter } from "./modules/finance/finance.routes.js";
import { FinanceError, type SportDeskFinanceService } from "./modules/finance/finance.service.js";
import { createAnnouncementsRouter } from "./modules/announcements/announcements.routes.js";
import {
  AnnouncementError,
  type SportDeskAnnouncementsService,
} from "./modules/announcements/announcements.service.js";
import { createAdmissionsRouter } from "./modules/admissions/admissions.routes.js";
import {
  AdmissionsError,
  type SportDeskAdmissionsService,
} from "./modules/admissions/admissions.service.js";
import { createUsersRouter } from "./modules/users/users.routes.js";
import { UsersError, type SportDeskUsersService } from "./modules/users/users.service.js";
import { createPushRouter } from "./modules/push/push.routes.js";
import type { SportDeskPushService } from "./modules/push/push.service.js";
import { createProgressRouter } from "./modules/progress/progress.routes.js";
import {
  ProgressError,
  type SportDeskProgressService,
} from "./modules/progress/progress.service.js";

export type AppOptions = {
  auth: SportDeskAuthService;
  academy?: SportDeskAcademyService;
  operations?: SportDeskOperationsService;
  parents?: SportDeskParentsService;
  dashboard?: SportDeskDashboardService;
  finance?: SportDeskFinanceService;
  announcements?: SportDeskAnnouncementsService;
  admissions?: SportDeskAdmissionsService;
  users?: SportDeskUsersService;
  push?: SportDeskPushService;
  progress?: SportDeskProgressService;
  webOrigin: string;
  secureCookies: boolean;
  sessionTtlDays: number;
  trustProxyHops?: number;
};

export function createApp(options: AppOptions): Express {
  const app = express();
  app.set("trust proxy", options.trustProxyHops ?? 0);
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: options.webOrigin,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: "32kb", strict: true }));
  app.use(cookieParser());
  app.use((request, response, next) => {
    response.locals.requestId = randomUUID();
    next();
  });

  app.get("/health", (_request, response) => {
    response.status(200).json({
      status: "ok",
      service: "sportdesk-api",
      version: "0.1.0",
    });
  });

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: {
        code: "RATE_LIMITED",
        message: "Too many sign-in attempts. Try again later.",
      },
    },
  });

  app.use("/api/v1/auth/login", loginLimiter);
  const passwordResetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: {
        code: "RATE_LIMITED",
        message: "Too many password reset attempts. Try again later.",
      },
    },
  });
  app.use("/api/v1/auth/password-reset", passwordResetLimiter);
  app.use(
    "/api/v1/auth",
    createAuthRouter({
      auth: options.auth,
      webOrigin: options.webOrigin,
      secureCookies: options.secureCookies,
      sessionTtlDays: options.sessionTtlDays,
    }),
  );

  app.get("/api/v1/admin/overview", async (request, response) => {
    const user = await requirePermission(request, options.auth, "admin:dashboard:read");
    if (!options.dashboard) throw new Error("Admin dashboard service is not configured.");
    const overview = await options.dashboard.getOverview(user.academyId);
    response.status(200).json({ data: { ...overview, user } });
  });

  if (options.academy) {
    app.use("/api/v1", createAcademyRouter({ auth: options.auth, academy: options.academy }));
  }
  if (options.operations) {
    app.use(
      "/api/v1",
      createOperationsRouter({
        auth: options.auth,
        operations: options.operations,
        ...(options.push ? { push: options.push } : {}),
      }),
    );
  }
  if (options.parents) {
    app.use("/api/v1", createParentsRouter({ auth: options.auth, parents: options.parents }));
  }
  if (options.finance) {
    app.use("/api/v1", createFinanceRouter({ auth: options.auth, finance: options.finance }));
  }
  if (options.announcements) {
    app.use(
      "/api/v1",
      createAnnouncementsRouter({ auth: options.auth, announcements: options.announcements, ...(options.push ? { push: options.push } : {}) }),
    );
  }
  if (options.admissions) {
    app.use(
      "/api/v1",
      createAdmissionsRouter({ auth: options.auth, admissions: options.admissions }),
    );
  }
  if (options.users) {
    app.use("/api/v1", createUsersRouter({ auth: options.auth, users: options.users }));
  }
  if (options.push) {
    app.use("/api/v1", createPushRouter({ auth: options.auth, push: options.push }));
  }
  if (options.progress) {
    app.use("/api/v1", createProgressRouter({ auth: options.auth, progress: options.progress, ...(options.push ? { push: options.push } : {}) }));
  }

  app.use((_request, response) => {
    response.status(404).json({
      error: { code: "NOT_FOUND", message: "The requested resource was not found." },
    });
  });

  const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
    const requestId = response.locals.requestId as string | undefined;
    if (error instanceof ZodError) {
      response.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Some submitted information is invalid.",
          requestId,
          fields: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      });
      return;
    }
    if (error instanceof AuthError) {
      response.status(error.status).json({
        error: { code: error.code, message: error.message, requestId },
      });
      return;
    }
    if (error instanceof AcademyError) {
      response.status(error.status).json({
        error: { code: error.code, message: error.message, requestId },
      });
      return;
    }
    if (error instanceof OperationsError) {
      response.status(error.status).json({
        error: { code: error.code, message: error.message, requestId },
      });
      return;
    }
    if (error instanceof ParentError) {
      response.status(error.status).json({
        error: { code: error.code, message: error.message, requestId },
      });
      return;
    }
    if (error instanceof FinanceError) {
      response.status(error.status).json({
        error: { code: error.code, message: error.message, requestId },
      });
      return;
    }
    if (error instanceof AnnouncementError) {
      response.status(error.status).json({
        error: { code: error.code, message: error.message, requestId },
      });
      return;
    }
    if (error instanceof AdmissionsError) {
      response.status(error.status).json({
        error: { code: error.code, message: error.message, requestId },
      });
      return;
    }
    if (error instanceof UsersError) {
      response.status(error.status).json({
        error: { code: error.code, message: error.message, requestId },
      });
      return;
    }
    if (error instanceof ProgressError) {
      response
        .status(error.status)
        .json({ error: { code: error.code, message: error.message, requestId } });
      return;
    }
    if (error instanceof SyntaxError && "body" in error) {
      response.status(400).json({
        error: { code: "INVALID_JSON", message: "Request body is not valid JSON.", requestId },
      });
      return;
    }
    // Preserve the response's generic error while recording safe diagnostic metadata.
    const errorName = error instanceof Error ? error.name : "UnknownError";
    const errorCode =
      typeof error === "object" && error !== null && "code" in error &&
      typeof error.code === "string"
        ? error.code
        : undefined;
    console.error(JSON.stringify({
      event: "request_failed",
      requestId,
      errorName,
      ...(errorCode ? { errorCode } : {}),
    }));
    response.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred.", requestId },
    });
  };
  app.use(errorHandler);

  return app;
}
