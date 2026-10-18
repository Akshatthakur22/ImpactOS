import { randomUUID } from "node:crypto";
import cors from "cors";
import cookieParser from "cookie-parser";
import express, { type ErrorRequestHandler, type Express } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { ZodError } from "zod";
import { AuthError, type SportDeskAuthService } from "./modules/auth/auth.service.js";
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

export type AppOptions = {
  auth: SportDeskAuthService;
  academy?: SportDeskAcademyService;
  operations?: SportDeskOperationsService;
  parents?: SportDeskParentsService;
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
      methods: ["GET", "POST", "PUT", "PATCH", "OPTIONS"],
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
    const token = request.get("authorization")?.match(/^Bearer ([A-Za-z0-9._~-]+)$/)?.[1];
    if (!token) throw new AuthError(401, "UNAUTHENTICATED", "Authentication is required.");
    const user = await options.auth.authenticate(token);
    if (!user) throw new AuthError(401, "UNAUTHENTICATED", "Authentication is required.");
    if (user.role !== "owner") {
      throw new AuthError(403, "FORBIDDEN", "Owner access is required for this view.");
    }
    response.status(200).json({
      data: {
        academyName: user.academyName,
        user,
      },
    });
  });

  if (options.academy) {
    app.use("/api/v1", createAcademyRouter({ auth: options.auth, academy: options.academy }));
  }
  if (options.operations) {
    app.use(
      "/api/v1",
      createOperationsRouter({ auth: options.auth, operations: options.operations }),
    );
  }
  if (options.parents) {
    app.use("/api/v1", createParentsRouter({ auth: options.auth, parents: options.parents }));
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
    if (error instanceof SyntaxError && "body" in error) {
      response.status(400).json({
        error: { code: "INVALID_JSON", message: "Request body is not valid JSON.", requestId },
      });
      return;
    }
    // Do not return or log request values, tokens, or internal exception messages.
    console.error(JSON.stringify({ event: "request_failed", requestId }));
    response.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred.", requestId },
    });
  };
  app.use(errorHandler);

  return app;
}
