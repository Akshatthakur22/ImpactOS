import { config } from "dotenv";
import { resolve } from "node:path";
import { z } from "zod";

config({ path: resolve(process.cwd(), "../../.env") });

const EnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(5).max(60).default(15),
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().email().optional(),
  PUBLIC_ADMISSIONS_ACADEMY_ID: z.string().uuid().optional(),
  PUBLIC_ADMISSIONS_WEB_ORIGIN: z.string().url().optional(),
});

export type AppEnv = z.infer<typeof EnvironmentSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = EnvironmentSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return parsed.data;
}
